import * as fsPromises from 'fs/promises';
import * as path from 'path';
import ProjectContext from '../../utils/ProjectContext';
import { BrownfieldDetector } from './BrownfieldDetector';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ContextSource, LoadedContext } from '../../types/consult';
import { StdinResult } from './StdinHandler';

export { ContextSource, LoadedContext };

/**
 * Parse CONCLAVE_ALLOWED_CONTEXT_ROOTS into a list of absolute paths.
 * Honored ONLY when CONCLAVE_TRANSPORT === 'stdio'. Returns [] otherwise —
 * fail-closed for SSE, REST, and any ambiguous case (env unset).
 *
 * Format: colon-separated absolute paths (PATH-style).
 * Non-absolute entries are silently dropped.
 *
 * This is a security-boundary input. Read directly from process.env —
 * never routed through ConfigCascade, since config files must not be
 * able to widen the sandbox.
 */
export function parseExtraContextRoots(): string[] {
  if (process.env.CONCLAVE_TRANSPORT !== 'stdio') return [];
  const raw = process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS;
  if (!raw) return [];
  return raw
    .split(':')
    .map(s => s.trim())
    .filter(s => s.length > 0 && path.isAbsolute(s))
    .map(s => path.resolve(s));
}

/**
 * Returns true iff absolutePath is exactly one of the allowed roots or
 * lives strictly beneath one (separator-aware to prevent prefix confusions
 * like "/tmp/fixture-evil" matching "/tmp/fixture").
 */
export function isPathWithinRoots(absolutePath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some(root =>
    absolutePath === root || absolutePath.startsWith(root + path.sep)
  );
}

export interface ContextLoaderOptions {
  /** Override extra allowed roots (for testing). Non-absolute entries dropped. */
  allowedRoots?: string[];
}

export class ContextLoader {
  private readonly tokenThreshold = 10000;
  private readonly maxFileBytes = 2 * 1024 * 1024;
  private readonly baseDir: string;
  private readonly allowedRoots: string[];

  constructor(options?: ContextLoaderOptions) {
    this.baseDir = process.cwd();
    const base = path.resolve(this.baseDir);
    const extra = options?.allowedRoots
      ? options.allowedRoots.filter(r => path.isAbsolute(r)).map(r => path.resolve(r))
      : parseExtraContextRoots();
    // baseDir is always allowed; dedup while preserving order.
    this.allowedRoots = Array.from(new Set([base, ...extra]));
  }

  async loadFileContext(filePaths: string[]): Promise<LoadedContext> {
    // Validate input - filter empty strings and check for valid paths
    const validPaths = filePaths.filter(p => p && p.trim().length > 0);
    if (validPaths.length === 0) {
      throw new Error('❌ No valid file paths provided. Usage: --context file1.ts,file2.ts');
    }

    const sources: ContextSource[] = [];
    const errors: string[] = [];

    for (const filePath of validPaths) {
      if (filePath.includes('\0')) {
        errors.push(`Invalid path (null byte detected): ${filePath}`);
        continue;
      }

      // Resolve to absolute path and validate it against the allowlist.
      // SECURITY: Validate ALL paths, not just relative ones (fixes absolute path bypass).
      // Allowlist always contains baseDir; under CONCLAVE_TRANSPORT=stdio it may also
      // contain roots from CONCLAVE_ALLOWED_CONTEXT_ROOTS. Fail-closed otherwise.
      const absolutePath = path.resolve(this.baseDir, filePath);

      if (!isPathWithinRoots(absolutePath, this.allowedRoots)) {
        errors.push(
          `Context file path escapes allowed roots (allowed: ${this.allowedRoots.join(', ')}): ${filePath}`
        );
        continue;
      }

      // Validate file exists
      try {
        await fsPromises.access(absolutePath);
      } catch {
        errors.push(`Context file not found: ${filePath}`);
        continue;
      }

      // Check if it's a file and not a symlink
      try {
        const stats = await fsPromises.lstat(absolutePath);
        if (stats.isSymbolicLink()) {
          errors.push(`Symlinks are not allowed for context files: ${filePath}`);
          continue;
        }
        if (!stats.isFile()) {
           errors.push(`Path is not a file: ${filePath}`);
           continue;
        }
        if (stats.size > this.maxFileBytes) {
          errors.push(`Context file too large (${Math.round(stats.size / 1024)}KB): ${filePath}`);
          continue;
        }
      } catch {
         // Should have been caught by access, but just in case
         errors.push(`Error accessing: ${filePath}`);
         continue;
      }

      // Read file content
      const content = await fsPromises.readFile(absolutePath, 'utf-8');
      const tokenEstimate = this.estimateTokens(content);

      sources.push({
        type: 'file',
        path: absolutePath,
        content,
        tokenEstimate,
        metadata: {
          filename: path.basename(absolutePath),
          extension: path.extname(absolutePath)
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(`❌ ${errors.join('\n❌ ')}`);
    }

    return this.formatContext(sources);
  }

  async loadProjectContext(projectPath: string): Promise<LoadedContext> {
    const absolutePath = path.resolve(projectPath);
    const projectContext = new ProjectContext(absolutePath);
    await projectContext.load();
    const summary = projectContext.formatContext();

    // Reuse brownfield detection for tech stack
    const detector = new BrownfieldDetector(absolutePath);
    const analysis = await detector.detectBrownfield();

    const tokenEstimate = this.estimateTokens(summary);

    return {
      sources: [{
        type: 'project',
        path: absolutePath,
        content: summary,
        tokenEstimate,
        metadata: {
          framework: analysis.techStack.framework || undefined,
          techStack: analysis.techStack
        }
      }],
      formattedContent: `### Project Context\n\n${summary}`,
      totalTokens: tokenEstimate,
      fileCount: 0,
      projectIncluded: true
    };
  }

  combineContexts(
    project: LoadedContext | null,
    files: LoadedContext | null,
    stdin: StdinResult | null = null
  ): LoadedContext {
    const sources: ContextSource[] = [];
    const formattedParts: string[] = [];

    if (stdin && stdin.hasStdin) {
      sources.push({
        type: 'stdin',
        path: 'stdin',
        content: stdin.content,
        tokenEstimate: stdin.tokenEstimate,
        metadata: { hasStdin: true }
      });
      formattedParts.push(`### Stdin Input\n\n${stdin.content.trim()}`);
    }

    if (project) {
      sources.push(...project.sources);
      formattedParts.push(project.formattedContent);
    }

    if (files) {
      sources.push(...files.sources);
      formattedParts.push(files.formattedContent);
    }

    const totalTokens = sources.reduce((sum, s) => sum + s.tokenEstimate, 0);

    return {
      sources,
      formattedContent: formattedParts.join('\n\n'),
      totalTokens,
      fileCount: files?.sources.length ?? 0,
      projectIncluded: project !== null
    };
  }

  estimateTokens(content: string): number {
    // Rough approximation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  async checkSizeWarning(context: LoadedContext): Promise<boolean> {
    if (context.totalTokens <= this.tokenThreshold) {
      return true; // No warning needed
    }

    console.log(chalk.yellow(
      `\n⚠️ Large context detected (~${context.totalTokens.toLocaleString()} tokens)\n` +
      'This may increase cost and response time.'
    ));

    // Auto-proceed in MCP mode (no stdin available for prompts)
    if (process.env.LLM_CONCLAVE_MCP === '1') {
      console.error(`[MCP] Auto-proceeding with large context`);
      return true;
    }

    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Continue?',
      default: true
    }]);

    return proceed;
  }

  private formatContext(sources: ContextSource[]): LoadedContext {
    const fileSources = sources.filter(s => s.type === 'file');

    const formattedContent = fileSources.map(source => {
      // Use basename for display to be cleaner
      const displayName = source.metadata?.filename || path.basename(source.path);
      return `### File: ${displayName}\n\n${source.content}`;
    }).join('\n\n');

    const totalTokens = sources.reduce((sum, s) => sum + s.tokenEstimate, 0);

    return {
      sources,
      formattedContent,
      totalTokens,
      fileCount: fileSources.length,
      projectIncluded: false
    };
  }
}
