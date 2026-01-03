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
  private readonly maxStdinBytes: number;

  constructor(
    readTimeoutMs: number = 10000,
    stdinStream: NodeJS.ReadStream = process.stdin,
    maxStdinBytes: number = 1024 * 1024
  ) {
    this.readTimeoutMs = readTimeoutMs;
    this.stdinStream = stdinStream;
    this.maxStdinBytes = maxStdinBytes;
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
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.stdinStream.destroy();
          cleanup();
          reject(new Error(`Stdin read timeout after ${this.readTimeoutMs}ms`));
        }
      }, this.readTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        this.stdinStream.removeListener('data', onData);
        this.stdinStream.removeListener('end', onEnd);
        this.stdinStream.removeListener('close', onClose);
        this.stdinStream.removeListener('error', onError);
      };

      const onData = (chunk: Buffer | string) => {
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        totalBytes += buffer.length;
        if (totalBytes > this.maxStdinBytes) {
          if (!settled) {
            settled = true;
            this.stdinStream.destroy();
            cleanup();
            reject(new Error(`Stdin input exceeded ${Math.round(this.maxStdinBytes / 1024)}KB limit`));
          }
          return;
        }
        chunks.push(buffer);
      };

      const onEnd = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf8'));
      };

      const onClose = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf8'));
      };

      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      this.stdinStream.on('data', onData);
      this.stdinStream.on('end', onEnd);
      this.stdinStream.on('close', onClose);
      this.stdinStream.on('error', onError);
    });
  }

  formatStdinContext(content: string): string {
    if (!content || content.trim().length === 0) {
      return '';
    }
    return `### Stdin Input\n\n${content.trim()}`;
  }
}
