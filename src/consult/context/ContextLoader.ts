import * as fsPromises from 'fs/promises';
import * as path from 'path';
import ProjectContext from '../../utils/ProjectContext';
import { BrownfieldDetector } from './BrownfieldDetector';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ContextSource, LoadedContext } from '../../types/consult';

export { ContextSource, LoadedContext };

export class ContextLoader {
  private readonly tokenThreshold = 10000;

  async loadFileContext(filePaths: string[]): Promise<LoadedContext> {
    const sources: ContextSource[] = [];
    const errors: string[] = [];

    for (const filePath of filePaths) {
      // Use raw path for checking, but resolve for storing
      const absolutePath = path.resolve(filePath);

      // Validate file exists
      try {
        await fsPromises.access(absolutePath);
      } catch {
        errors.push(`Context file not found: ${filePath}`);
        continue;
      }

      // Check if it's a file
      try {
        const stats = await fsPromises.stat(absolutePath);
        if (!stats.isFile()) {
           errors.push(`Path is not a file: ${filePath}`);
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
    files: LoadedContext | null
  ): LoadedContext {
    const sources: ContextSource[] = [];
    const formattedParts: string[] = [];

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
