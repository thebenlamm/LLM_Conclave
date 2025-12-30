import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConsultationResult } from '../types/consult';
import { ArtifactTransformer } from '../consult/artifacts/ArtifactTransformer';
import { MarkdownFormatter } from '../consult/formatting/MarkdownFormatter';
import { AnalyticsIndexer } from '../consult/analytics/AnalyticsIndexer';

interface ConsultationIndexEntry {
  id: string;
  timestamp: string;
  question: string;
  duration_ms: number;
  cost_usd: number;
  confidence: number;
}

interface ConsultationIndex {
  month: string;
  consultations: ConsultationIndexEntry[];
}

/**
 * ConsultLogger - persists consultation results for analytics
 * Saves both JSON (full result) and Markdown (summary) and maintains
 * a monthly index for fast stats queries.
 */
export default class ConsultLogger {
  private logDir: string;
  private indexer: AnalyticsIndexer;

  constructor() {
    this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    this.indexer = new AnalyticsIndexer();
  }

  /**
   * Persist a consultation result to disk.
   * Returns the paths written for downstream use or debugging.
   */
  async log(result: ConsultationResult): Promise<{
    jsonPath: string;
    markdownPath: string;
    indexPath: string;
  }> {
    await this.ensureLogDir();

    const jsonResult = ArtifactTransformer.consultationResultToJSON(result);
    const jsonPath = path.join(this.logDir, `${result.consultationId}.json`);
    const markdownPath = path.join(this.logDir, `${result.consultationId}.md`);

    await fs.promises.writeFile(jsonPath, JSON.stringify(jsonResult, null, 2), 'utf-8');
    
    const formatter = new MarkdownFormatter();
    await fs.promises.writeFile(markdownPath, formatter.format(result), 'utf-8');

    const indexPath = await this.updateMonthlyIndex(result);

    // Index for SQLite analytics (Write-Through Pattern from Epic 3, Story 3.1)
    this.indexer.indexConsultation(result);

    return { jsonPath, markdownPath, indexPath };
  }

  private async ensureLogDir(): Promise<void> {
    await fs.promises.mkdir(this.logDir, { recursive: true });
  }

  /**
   * Update (or create) the monthly index file for the consultation.
   */
  private async updateMonthlyIndex(result: ConsultationResult): Promise<string> {
    const month = this.getMonthString(result.timestamp);
    const indexPath = path.join(this.logDir, `index-${month}.json`);

    let index: ConsultationIndex = { month, consultations: [] };

    if (fs.existsSync(indexPath)) {
      try {
        const existing = await fs.promises.readFile(indexPath, 'utf-8');
        index = JSON.parse(existing);
      } catch {
        // If index is corrupted, reset it with the current month metadata.
        index = { month, consultations: [] };
      }
    }

    const entry: ConsultationIndexEntry = {
      id: result.consultationId,
      timestamp: result.timestamp,
      question: result.question,
      duration_ms: result.durationMs,
      cost_usd: result.cost.usd,
      confidence: result.confidence
    };

    // Replace existing entry with same id if present to avoid duplicates.
    index.consultations = index.consultations.filter(c => c.id !== entry.id);
    index.consultations.push(entry);

    // Keep index ordered by timestamp ascending for readability.
    index.consultations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    return indexPath;
  }

  private getMonthString(timestamp: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }
}
