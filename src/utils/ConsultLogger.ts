import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConsultationResult } from '../types';

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

  constructor() {
    this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
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

    const jsonPath = path.join(this.logDir, `${result.consultation_id}.json`);
    const markdownPath = path.join(this.logDir, `${result.consultation_id}.md`);

    await fs.promises.writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
    await fs.promises.writeFile(markdownPath, this.formatMarkdown(result), 'utf-8');

    const indexPath = await this.updateMonthlyIndex(result);

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
      id: result.consultation_id,
      timestamp: result.timestamp,
      question: result.question,
      duration_ms: result.duration_ms,
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

  /**
   * Build a Markdown summary suitable for quick review.
   */
  private formatMarkdown(result: ConsultationResult): string {
    const date = new Date(result.timestamp);
    const confidencePercent = (result.confidence * 100).toFixed(0);

    const output: string[] = [];

    output.push('# Consultation Summary');
    output.push('');
    output.push(`**Question:** ${result.question}`);
    output.push(`**Date:** ${date.toLocaleString()}`);
    output.push(`**Confidence:** ${confidencePercent}%`);
    output.push('');
    output.push('## Consensus');
    output.push('');
    output.push(result.consensus);
    output.push('');
    output.push('## Recommendation');
    output.push('');
    output.push(result.recommendation);
    output.push('');
    output.push('## Agent Perspectives');
    output.push('');

    for (const perspective of result.perspectives) {
      output.push(`### ${perspective.agent} (${perspective.model})`);
      output.push('');
      output.push(perspective.opinion);
      output.push('');
    }

    if (result.concerns.length > 0) {
      output.push('## Concerns Raised');
      output.push('');
      for (const concern of result.concerns) {
        output.push(`- ${concern}`);
      }
      output.push('');
    }

    if (result.dissent.length > 0) {
      output.push('## Dissenting Views');
      output.push('');
      for (const dissent of result.dissent) {
        output.push(`- ${dissent}`);
      }
      output.push('');
    }

    output.push('---');
    output.push('');
    output.push(
      `**Cost:** $${result.cost.usd.toFixed(4)} | ` +
      `**Duration:** ${(result.duration_ms / 1000).toFixed(1)}s | ` +
      `**Tokens:** ${result.cost.tokens.total.toLocaleString()}`
    );

    return output.join('\n');
  }

  private getMonthString(timestamp: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }
}
