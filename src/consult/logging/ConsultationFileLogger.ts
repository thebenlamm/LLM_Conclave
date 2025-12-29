import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConsultationResult } from '../../types/consult';
import { ArtifactTransformer } from '../artifacts/ArtifactTransformer';
import { MarkdownFormatter } from '../formatting/MarkdownFormatter';

export class ConsultationFileLogger {
  private readonly logDir: string;

  constructor(logDir?: string) {
    // Default log directory: ~/.llm-conclave/consult-logs/
    this.logDir = logDir || path.join(os.homedir(), '.llm-conclave', 'consult-logs');
  }

  /**
   * Log a consultation to both JSON and Markdown files
   */
  public async logConsultation(result: ConsultationResult): Promise<void> {
    try {
      // Ensure log directory exists
      this.ensureLogDirectory();

      // Write JSON log
      await this.writeJsonLog(result);

      // Write Markdown log
      await this.writeMarkdownLog(result);
    } catch (error: any) {
      // Logging failures should NOT block consultation completion
      console.error(`Failed to write consultation log: ${error.message}`);
    }
  }

  /**
   * Ensure log directory exists, create if needed
   */
  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw new Error(`No write permissions for log directory: ${this.logDir}`);
      }
      throw error;
    }
  }

  /**
   * Write JSON log file
   */
  private async writeJsonLog(result: ConsultationResult): Promise<void> {
    const filename = `consult-${result.consultationId}.json`;
    const filePath = path.join(this.logDir, filename);

    // Convert to snake_case JSON using ArtifactTransformer
    const jsonResult = ArtifactTransformer.consultationResultToJSON(result);

    // Add schema_version
    const logData = {
      ...jsonResult,
      schema_version: '1.0'
    };

    // Write atomically
    const tempPath = `${filePath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(logData, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch (error: any) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Write Markdown log file
   */
  private async writeMarkdownLog(result: ConsultationResult): Promise<void> {
    const filename = `consult-${result.consultationId}.md`;
    const filePath = path.join(this.logDir, filename);

    // Use MarkdownFormatter from Story 1.7
    const formatter = new MarkdownFormatter();
    const markdown = formatter.format(result);

    // Write file
    fs.writeFileSync(filePath, markdown, 'utf8');
  }

  /**
   * Get log directory path
   */
  public getLogDirectory(): string {
    return this.logDir;
  }
}
