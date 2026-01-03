import * as process from 'process';
import chalk from 'chalk';

export interface StdinResult {
  hasStdin: boolean;
  content: string;
  tokenEstimate: number;
}

export class StdinHandler {
  private readonly readTimeoutMs: number;
  private readonly stdinStream: NodeJS.ReadStream;

  constructor(readTimeoutMs: number = 10000, stdinStream: NodeJS.ReadStream = process.stdin) {
    this.readTimeoutMs = readTimeoutMs;
    this.stdinStream = stdinStream;
  }

  detectStdin(): boolean {
    if (this.stdinStream === process.stdin && process.env.NODE_ENV === 'test') {
      return false;
    }
    return !this.stdinStream.isTTY;
  }

  async readStdin(): Promise<StdinResult> {
    if (!this.detectStdin()) {
      return { hasStdin: false, content: '', tokenEstimate: 0 };
    }

    try {
      const content = await this.collectStdin();
      const tokenEstimate = Math.ceil(content.length / 4);

      return {
        hasStdin: true,
        content,
        tokenEstimate
      };
    } catch (error) {
      console.error(chalk.yellow(`Warning: Failed to read stdin: ${(error as Error).message}`));
      return { hasStdin: false, content: '', tokenEstimate: 0 };
    }
  }

  private collectStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      const timeout = setTimeout(() => {
        this.stdinStream.destroy();
        reject(new Error(`Stdin read timeout after ${this.readTimeoutMs}ms`));
      }, this.readTimeoutMs);

      this.stdinStream.setEncoding('utf-8');
      
      this.stdinStream.on('readable', () => {
        let chunk;
        while ((chunk = this.stdinStream.read()) !== null) {
          chunks.push(chunk);
        }
      });
      
      this.stdinStream.on('end', () => {
        clearTimeout(timeout);
        resolve(chunks.join(''));
      });
      
      this.stdinStream.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  formatStdinContext(content: string): string {
    if (!content || content.trim().length === 0) {
      return '';
    }
    return `### Stdin Input\n\n${content.trim()}`;
  }
}
