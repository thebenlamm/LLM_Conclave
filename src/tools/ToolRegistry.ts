/**
 * ToolRegistry - Defines and executes tools for agent use
 */

import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import * as path from 'path';
import { ToolDefinition, ToolExecutionResult, OpenAITool } from '../types';
import { SensitiveDataScrubber } from '../consult/security/SensitiveDataScrubber';

/**
 * ToolRegistry - Defines and executes tools for agent use
 *
 * Security features:
 * - Path sandboxing: File operations restricted to baseDir
 * - Command blacklist: Dangerous commands blocked
 * - Command timeout: 30s max execution time
 * - Sensitive data scrubbing: API keys, passwords auto-redacted from output
 */
export default class ToolRegistry {
  tools: Record<string, ToolDefinition>;
  private readonly baseDir: string;
  private readonly scrubber: SensitiveDataScrubber;
  private readonly commandTimeoutMs = 30000; // 30 seconds
  private readonly maxFileReadBytes = 10 * 1024 * 1024; // 10MB
  private readonly enableRunCommand: boolean;

  constructor(baseDir?: string, options?: { enableRunCommand?: boolean }) {
    this.baseDir = path.resolve(baseDir ?? process.cwd());
    this.scrubber = new SensitiveDataScrubber();
    this.enableRunCommand = options?.enableRunCommand ?? false; // Disabled by default
    this.tools = this.defineTools();
  }

  /**
   * Define all available tools
   */
  defineTools(): Record<string, ToolDefinition> {
    return {
      read_file: {
        name: 'read_file',
        description: 'Read contents of a file from the filesystem',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to read'
            }
          },
          required: ['file_path']
        }
      },
      write_file: {
        name: 'write_file',
        description: 'Write content to a file (creates or overwrites)',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to write'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['file_path', 'content']
        }
      },
      edit_file: {
        name: 'edit_file',
        description: 'Replace specific content in a file (exact string match)',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file to edit'
            },
            old_string: {
              type: 'string',
              description: 'Exact string to find and replace'
            },
            new_string: {
              type: 'string',
              description: 'String to replace it with'
            }
          },
          required: ['file_path', 'old_string', 'new_string']
        }
      },
      list_files: {
        name: 'list_files',
        description: 'List files matching a glob pattern',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern to match files (e.g., "src/**/*.js")'
            },
            directory: {
              type: 'string',
              description: 'Directory to search in (defaults to current directory)'
            }
          },
          required: ['pattern']
        }
      },
      run_command: {
        name: 'run_command',
        description: 'Run a shell command (use cautiously)',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute'
            }
          },
          required: ['command']
        }
      }
    };
  }

  /**
   * Get tool definitions in Anthropic format
   */
  getAnthropicTools(): ToolDefinition[] {
    return Object.values(this.tools);
  }

  /**
   * Get tool definitions in OpenAI format
   */
  getOpenAITools(): OpenAITool[] {
    return Object.values(this.tools).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  /**
   * Validate and resolve a file path, ensuring it stays within the sandbox.
   * Resolves symlinks via fs.realpath() to prevent symlink-based sandbox escapes.
   * For non-existent paths, walks up to the deepest existing ancestor and realpaths that.
   * @throws Error if path escapes sandbox or contains dangerous patterns
   */
  private async validatePath(filePath: string): Promise<string> {
    // Block null bytes
    if (filePath.includes('\0')) {
      throw new Error('Invalid path: null byte detected');
    }

    // Resolve to absolute path (textual resolution only)
    const absolutePath = path.resolve(this.baseDir, filePath);
    const resolvedBase = path.resolve(this.baseDir);
    const normalizedBase = resolvedBase + path.sep;

    // Quick textual check first (catches obvious ../.. escapes)
    if (!absolutePath.startsWith(normalizedBase) && absolutePath !== resolvedBase) {
      throw new Error(`Path escapes sandbox: ${filePath}`);
    }

    // Resolve symlinks: walk up to find the deepest existing ancestor
    let existingPath = absolutePath;
    let remainingParts: string[] = [];

    while (existingPath !== path.dirname(existingPath)) {
      try {
        await fs.access(existingPath);
        break; // Found existing path
      } catch {
        remainingParts.unshift(path.basename(existingPath));
        existingPath = path.dirname(existingPath);
      }
    }

    // Resolve symlinks in the existing portion
    let realExistingPath: string;
    try {
      realExistingPath = await fs.realpath(existingPath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        // If even the root can't be resolved, use the textual path
        realExistingPath = existingPath;
      } else {
        throw err;
      }
    }

    // Reconstruct the full real path with non-existent tail
    const realFullPath = remainingParts.length > 0
      ? path.join(realExistingPath, ...remainingParts)
      : realExistingPath;

    // Realpath the base directory too (in case sandbox itself has symlinks)
    let realBase: string;
    try {
      realBase = await fs.realpath(resolvedBase);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        realBase = resolvedBase;
      } else {
        throw err;
      }
    }
    const realBaseNormalized = realBase + path.sep;

    // Check if the real path is within the real sandbox
    if (!realFullPath.startsWith(realBaseNormalized) && realFullPath !== realBase) {
      throw new Error(`Path escapes sandbox: ${filePath}`);
    }

    return absolutePath;
  }

  /**
   * Apply sensitive data scrubbing to tool results
   */
  private scrubResult(result: ToolExecutionResult): ToolExecutionResult {
    if (!result.success || !result.result) {
      return result;
    }

    const content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    const { content: scrubbedContent, report } = this.scrubber.scrub(content);

    if (report.sensitiveDataScrubbed) {
      // Log that scrubbing occurred (visible in debug mode)
      const typesFound = report.typesDetected.join(', ');
      console.error(`[Security] Scrubbed ${report.patternsMatched} sensitive value(s) from tool result: ${typesFound}`);
    }

    return {
      ...result,
      result: scrubbedContent
    };
  }

  /**
   * Execute a tool call
   * @param toolName - Name of the tool
   * @param input - Tool input parameters
   * @returns Tool execution result with success status
   */
  async executeTool(toolName: string, input: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      let result: ToolExecutionResult;

      switch (toolName) {
        case 'read_file':
          result = await this._readFile(input.file_path);
          break;

        case 'write_file':
          result = await this._writeFile(input.file_path, input.content);
          break;

        case 'edit_file':
          result = await this._editFile(input.file_path, input.old_string, input.new_string);
          break;

        case 'list_files':
          result = await this._listFiles(input.pattern, input.directory);
          break;

        case 'run_command':
          result = await this._runCommand(input.command);
          break;

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }

      // Apply sensitive data scrubbing to all successful results
      return this.scrubResult(result);
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Read a file (sandboxed to baseDir)
   */
  async _readFile(filePath: string): Promise<ToolExecutionResult> {
    const validatedPath = await this.validatePath(filePath);

    // Check for symlink to prevent traversal
    const stats = await fs.lstat(validatedPath);
    if (stats.isSymbolicLink()) {
      return {
        success: false,
        error: 'Symlinks are not allowed for security reasons'
      };
    }

    if (stats.size > this.maxFileReadBytes) {
      return {
        success: false,
        error: `File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB). Maximum: ${this.maxFileReadBytes / 1024 / 1024}MB`
      };
    }

    const content = await fs.readFile(validatedPath, 'utf8');
    const lines = content.split('\n').length;

    return {
      success: true,
      result: content,
      summary: `Read ${lines} lines from ${path.basename(validatedPath)}`
    };
  }

  /**
   * Write a file (sandboxed to baseDir)
   */
  async _writeFile(filePath: string, content: string): Promise<ToolExecutionResult> {
    const validatedPath = await this.validatePath(filePath);

    // Check if target is a symlink (prevent writing through symlinks)
    try {
      const stats = await fs.lstat(validatedPath);
      if (stats.isSymbolicLink()) {
        return {
          success: false,
          error: 'Symlinks are not allowed for security reasons'
        };
      }
    } catch (e: any) {
      // ENOENT is fine - file doesn't exist yet, which is normal for writes
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(validatedPath);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.writeFile(validatedPath, content, 'utf8');
    const lines = content.split('\n').length;

    return {
      success: true,
      result: `Wrote ${lines} lines to ${validatedPath}`,
      summary: `Created ${path.basename(validatedPath)} (${lines} lines)`
    };
  }

  /**
   * Edit a file (sandboxed to baseDir)
   */
  async _editFile(filePath: string, oldString: string, newString: string): Promise<ToolExecutionResult> {
    const validatedPath = await this.validatePath(filePath);

    // Check for symlink to prevent traversal
    const stats = await fs.lstat(validatedPath);
    if (stats.isSymbolicLink()) {
      return {
        success: false,
        error: 'Symlinks are not allowed for security reasons'
      };
    }

    if (stats.size > this.maxFileReadBytes) {
      return {
        success: false,
        error: `File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB). Maximum: ${this.maxFileReadBytes / 1024 / 1024}MB`
      };
    }

    const content = await fs.readFile(validatedPath, 'utf8');

    if (!content.includes(oldString)) {
      return {
        success: false,
        error: `String not found in file: ${oldString.substring(0, 50)}...`
      };
    }

    const newContent = content.replace(oldString, newString);
    await fs.writeFile(validatedPath, newContent, 'utf8');

    return {
      success: true,
      result: `Updated ${validatedPath}`,
      summary: `Edited ${path.basename(validatedPath)}`
    };
  }

  /**
   * List files matching pattern (sandboxed to baseDir)
   */
  async _listFiles(pattern: string, directory?: string): Promise<ToolExecutionResult> {
    // Validate directory if provided, otherwise use baseDir
    const searchDir = directory ? await this.validatePath(directory) : this.baseDir;

    const { glob } = await import('glob');
    const files = await glob(pattern, {
      cwd: searchDir,
      nodir: true, // Only return files
      follow: false // Don't follow symlinks
    });

    return {
      success: true,
      result: (files as string[]).join('\n'),
      summary: `Found ${(files as string[]).length} files matching ${pattern}`
    };
  }

  /**
   * Dangerous command patterns - comprehensive blocklist
   */
  private static readonly DANGEROUS_COMMANDS: readonly string[] = [
    // Destructive file operations
    'rm -rf', 'rm -fr', 'rmdir', 'shred',
    // Disk operations
    'dd if=', 'dd of=', 'mkfs', 'fdisk', 'parted',
    // Device/system writes
    '> /dev/', '>> /dev/', '/dev/null', '/dev/sda', '/dev/disk',
    // System modification
    'format', 'diskutil', 'wipefs',
    // Privilege escalation
    'sudo', 'su -', 'doas', 'pkexec',
    // Network exfiltration
    'curl', 'wget', 'nc ', 'netcat', 'ncat',
    // Shell escape/chaining dangers
    '$(', '`', '&&', '||', ';', '|', '\n',
    // Environment manipulation
    'export ', 'unset ', 'env ',
    // Process control
    'kill', 'pkill', 'killall',
    // Cron/scheduled tasks
    'crontab', 'at ', 'batch',
    // User management
    'useradd', 'userdel', 'usermod', 'passwd', 'chpasswd',
    // Service control
    'systemctl', 'service ', 'launchctl',
    // Package managers (could install malicious packages)
    'apt', 'yum', 'dnf', 'brew', 'npm', 'pip', 'gem',
    // Reverse shells
    '/bin/bash', '/bin/sh', 'bash -i', 'sh -i',
    // File permission changes
    'chmod', 'chown', 'chgrp',
    // SSH operations
    'ssh ', 'scp ', 'sftp',
  ] as const;

  /**
   * Allowed command prefixes (allowlist approach for maximum safety)
   */
  private static readonly ALLOWED_COMMANDS: readonly string[] = [
    'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc',
    'echo', 'pwd', 'date', 'whoami', 'hostname',
    'git status', 'git log', 'git diff', 'git branch', 'git show',
    'node --version', 'npm --version', 'python --version',
  ] as const;

  /**
   * Run a shell command (DISABLED BY DEFAULT - requires explicit opt-in)
   *
   * Security measures:
   * - Disabled by default (must pass enableRunCommand: true to constructor)
   * - Comprehensive command blocklist
   * - Optional allowlist mode
   * - 30-second timeout
   * - Sandboxed to baseDir
   * - Output size limited to 1MB
   */
  async _runCommand(command: string): Promise<ToolExecutionResult> {
    // Check if run_command is enabled
    if (!this.enableRunCommand) {
      return {
        success: false,
        error: 'run_command is disabled for security. Enable with { enableRunCommand: true } in constructor.'
      };
    }

    // Trim and check for empty command
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      return {
        success: false,
        error: 'Empty command'
      };
    }

    // Enforce allowlist — command must start with an allowed prefix
    const lowerCommand = trimmedCommand.toLowerCase();
    const isAllowed = ToolRegistry.ALLOWED_COMMANDS.some(allowed =>
      lowerCommand === allowed.toLowerCase() || lowerCommand.startsWith(allowed.toLowerCase() + ' ')
    );
    if (!isAllowed) {
      return {
        success: false,
        error: 'Command not in allowed commands list. Only safe read-only commands are permitted.'
      };
    }

    // Block dangerous commands (catches injection in allowed commands, e.g. echo $(whoami))
    for (const dangerous of ToolRegistry.DANGEROUS_COMMANDS) {
      if (lowerCommand.includes(dangerous.toLowerCase())) {
        return {
          success: false,
          error: `Blocked: command contains dangerous pattern '${dangerous}'`
        };
      }
    }

    // Check for path traversal in command arguments
    if (trimmedCommand.includes('..')) {
      return {
        success: false,
        error: 'Path traversal (..) is not allowed in commands'
      };
    }

    try {
      const output = execSync(trimmedCommand, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024, // 1MB max output
        timeout: this.commandTimeoutMs,
        cwd: this.baseDir, // Sandbox to baseDir
        env: {
          // Minimal safe environment
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: process.env.HOME,
          USER: process.env.USER,
          LANG: 'en_US.UTF-8',
        },
        stdio: ['ignore', 'pipe', 'pipe'] // No stdin, capture stdout/stderr
      });

      return {
        success: true,
        result: output,
        summary: `Ran: ${trimmedCommand.substring(0, 50)}${trimmedCommand.length > 50 ? '...' : ''}`
      };
    } catch (error: any) {
      // Handle timeout specifically
      if (error.killed) {
        return {
          success: false,
          error: `Command timed out after ${this.commandTimeoutMs / 1000} seconds`
        };
      }

      // Return stderr if available
      if (error.stderr) {
        return {
          success: false,
          error: error.stderr.toString().substring(0, 500)
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }
}
