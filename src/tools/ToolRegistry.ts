/**
 * ToolRegistry - Defines and executes tools for agent use
 */

import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * ToolRegistry - Defines and executes tools for agent use
 */
export default class ToolRegistry {
  tools: any;

  constructor() {
    this.tools = this.defineTools();
  }

  /**
   * Define all available tools
   */
  defineTools(): any {
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
  getAnthropicTools(): any[] {
    return Object.values(this.tools);
  }

  /**
   * Get tool definitions in OpenAI format
   */
  getOpenAITools(): any[] {
    return Object.values(this.tools).map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  /**
   * Execute a tool call
   * @param {string} toolName - Name of the tool
   * @param {Object} input - Tool input parameters
   * @returns {Promise<Object>} - { success: boolean, result: string, error?: string }
   */
  async executeTool(toolName: string, input: any): Promise<{ success: boolean; result?: string; error?: string; summary?: string }> {
    try {
      switch (toolName) {
        case 'read_file':
          return await this._readFile(input.file_path);

        case 'write_file':
          return await this._writeFile(input.file_path, input.content);

        case 'edit_file':
          return await this._editFile(input.file_path, input.old_string, input.new_string);

        case 'list_files':
          return await this._listFiles(input.pattern, input.directory);

        case 'run_command':
          return await this._runCommand(input.command);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Read a file
   */
  async _readFile(filePath: string): Promise<any> {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').length;

    return {
      success: true,
      result: content,
      summary: `Read ${lines} lines from ${path.basename(filePath)}`
    };
  }

  /**
   * Write a file
   */
  async _writeFile(filePath: string, content: string): Promise<any> {
    await fs.writeFile(filePath, content, 'utf8');
    const lines = content.split('\n').length;

    return {
      success: true,
      result: `Wrote ${lines} lines to ${filePath}`,
      summary: `Created ${path.basename(filePath)} (${lines} lines)`
    };
  }

  /**
   * Edit a file
   */
  async _editFile(filePath: string, oldString: string, newString: string): Promise<any> {
    const content = await fs.readFile(filePath, 'utf8');

    if (!content.includes(oldString)) {
      return {
        success: false,
        error: `String not found in file: ${oldString.substring(0, 50)}...`
      };
    }

    const newContent = content.replace(oldString, newString);
    await fs.writeFile(filePath, newContent, 'utf8');

    return {
      success: true,
      result: `Updated ${filePath}`,
      summary: `Edited ${path.basename(filePath)}`
    };
  }

  /**
   * List files matching pattern
   */
  async _listFiles(pattern: string, directory: string = process.cwd()): Promise<any> {
    const { glob } = await import('glob');
    const files = await glob(pattern, { cwd: directory });

    return {
      success: true,
      result: (files as string[]).join('\n'),
      summary: `Found ${(files as string[]).length} files matching ${pattern}`
    };
  }

  /**
   * Run a shell command
   */
  async _runCommand(command: string): Promise<any> {
    // Safety check - don't allow dangerous commands
    const dangerous = ['rm -rf', 'dd if=', '> /dev/', 'mkfs', 'format'];
    if (dangerous.some(cmd => command.includes(cmd))) {
      return {
        success: false,
        error: 'Command contains potentially dangerous operations'
      };
    }

    const output = execSync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 });

    return {
      success: true,
      result: output,
      summary: `Ran: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`
    };
  }
}
