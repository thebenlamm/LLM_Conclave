import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConsultationResult } from '../../types/consult';
import { ArtifactTransformer } from '../artifacts/ArtifactTransformer';
import { MarkdownFormatter } from '../formatting/MarkdownFormatter';
import { AnalyticsIndexer } from '../analytics/AnalyticsIndexer';

export class ConsultationFileLogger {
  private readonly logDir: string;
  private readonly indexer: AnalyticsIndexer;

  constructor(logDir?: string, dbPath?: string) {
    // Default log directory: ~/.llm-conclave/consult-logs/
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    const defaultLogDir = isTestEnv
      ? path.join(os.tmpdir(), 'llm-conclave-test-logs')
      : path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    this.logDir = logDir || defaultLogDir;
    const resolvedDbPath = dbPath
      || (isTestEnv ? ':memory:' : (logDir ? path.join(this.logDir, 'consult-analytics.db') : undefined));
    this.indexer = new AnalyticsIndexer(resolvedDbPath);
  }

  /**
   * Log a consultation to both JSON and Markdown files
   */
  public async logConsultation(result: ConsultationResult): Promise<void> {
    let jsonSuccess = false;
    let markdownSuccess = false;
    let indexSuccess = false;

    try {
      // Ensure log directory exists
      this.ensureLogDirectory();

      // Write JSON log (source of truth)
      try {
        await this.writeJsonLog(result);
        jsonSuccess = true;
      } catch (error: any) {
        console.error(`❌ Failed to write JSON log for ${result.consultationId}: ${error.message}`);
        throw error; // JSON is critical, must succeed
      }

      // Write Markdown log (best-effort)
      try {
        await this.writeMarkdownLog(result);
        markdownSuccess = true;
      } catch (error: any) {
        console.warn(`⚠️ Failed to write Markdown log for ${result.consultationId}: ${error.message}`);
        // Continue - Markdown is nice-to-have
      }

      // Index for analytics (Write-Through Pattern from Epic 3, Story 3.1)
      // Per AC: "If SQLite write fails, error is logged but JSONL write still succeeds"
      try {
        this.indexer.indexConsultation(result);
        indexSuccess = true;
      } catch (error: any) {
        console.error(`⚠️ Failed to index consultation ${result.consultationId} in analytics database: ${error.message}`);
        console.error(`   Consultation saved to JSON but won't appear in consult-stats dashboard.`);
        console.error(`   Run 'llm-conclave consult-stats --rebuild-index' to fix.`);
        // Don't throw - indexing failure should not prevent consultation completion
      }
    } catch (error: any) {
      // Only thrown if JSON write fails (critical failure)
      console.error(`❌ CRITICAL: Failed to save consultation ${result.consultationId}`);
      throw error;
    }

    // Success summary (only if JSON succeeded)
    if (jsonSuccess) {
      const status = [
        jsonSuccess ? '✅ JSON' : '❌ JSON',
        markdownSuccess ? '✅ Markdown' : '⚠️ Markdown',
        indexSuccess ? '✅ Indexed' : '⚠️ Index failed'
      ].join(' | ');
      console.log(`📝 Consultation logged: ${status}`);
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

    // Add schema_version and status
    const logData = {
      ...jsonResult,
      status: result.status || 'complete',
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
