import { ConsultationResult, ConsultState, AgentResponse, PartialConsultationResult } from '../../types/consult';
import { ArtifactTransformer } from '../artifacts/ArtifactTransformer';
import { appendFile, writeFile, readFile, rename, unlink } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHmac, randomBytes } from 'crypto';
import chalk from 'chalk';

export class PartialResultManager {
  private logDir: string;

  constructor(logDir?: string) {
    // Default: ~/.llm-conclave/consult-logs/
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    const defaultLogDir = isTestEnv
      ? path.join(os.tmpdir(), 'llm-conclave-test-logs')
      : path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    this.logDir = logDir || defaultLogDir;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Save partial results when consultation is cancelled or fails.
   * Format: JSONL (one JSON object per line)
   */
  async savePartialResults(
    partialResult: PartialConsultationResult,
    reason: 'user_pulse_cancel' | 'timeout' | 'error' | 'cost_exceeded_estimate'
  ): Promise<string> {
    const filename = this.getPartialFilePath(partialResult.consultationId);
    
    // Transform to JSON format (snake_case)
    const jsonResult = ArtifactTransformer.consultationResultToJSON(partialResult);

    // Map internal reason to schema-compliant abort_reason
    const abortReasonMap: Record<string, string> = {
      'user_pulse_cancel': 'user_pulse_cancel',
      'timeout': 'timeout',
      'error': 'error',
      'cost_exceeded_estimate': 'cost_exceeded_estimate'
    };

    // Add partial-specific fields compliant with Story 2.5 schema
    const finalResult = {
      ...jsonResult,
      status: 'partial',
      abort_reason: abortReasonMap[reason] || reason,
      resume_token: this.generateResumeToken(),
      // Ensure completed_rounds is artifacts, not just names (handled by transformer in responses)
      // but we add the explicit round names for clarity in partial files
      completed_round_names: partialResult.completedRoundNames || [],
      incomplete_round_names: partialResult.incompleteRoundNames || [],
      partial_agents: partialResult.partialAgents ? partialResult.partialAgents.map((a: AgentResponse) => ({
          agent_id: a.agentId,
          round: partialResult.completedRounds + 1,
          response: a.content,
          completed: false
      })) : [],
      schema_version: '1.0'
    };

    // Add signature
    finalResult.signature = this.signResult(finalResult);

    // JSONL Format: Each consultation is one line
    const jsonLine = JSON.stringify(finalResult) + '\n';

    // Append to JSONL file (Story 2.5 requirement)
    await appendFile(filename, jsonLine, 'utf-8');

    console.log(chalk.cyan(`💾 Partial results saved to: ${filename}`));
    return filename;
  }

  /**
   * Save checkpoint after successful round completion.
   * Uses consultation ID + round number as unique key.
   */
  async saveCheckpoint(consultation: PartialConsultationResult): Promise<void> {
    const roundNumber = consultation.completedRounds; 
    const checkpointId = `${consultation.consultationId}-round${roundNumber}`;
    const checkpointPath = path.join(this.logDir, `${checkpointId}.checkpoint.json`);

    // Idempotency check
    if (fs.existsSync(checkpointPath)) {
      return;
    }

    const checkpoint = {
      checkpoint_id: checkpointId,
      consultation_id: consultation.consultationId,
      round: roundNumber,
      state: consultation.state,
      result: ArtifactTransformer.consultationResultToJSON(consultation),
      timestamp: new Date().toISOString(),
      resume_token: this.generateResumeToken()
    };

    // Checkpoints remain as independent JSON files for fast recovery
    await this.atomicWrite(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Load partial results
   */
  async loadPartialResults(sessionId: string): Promise<PartialConsultationResult | null> {
    const filePath = this.getPartialFilePath(sessionId);
    try {
      // Since it's JSONL, we read the last line or parse assuming one line for now
      const data = await readFile(filePath, 'utf-8');
      const lines = data.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const json = JSON.parse(lastLine);
      return json as any as PartialConsultationResult; 
    } catch (error) {
      return null;
    }
  }

  private getPartialFilePath(consultationId: string): string {
    return path.join(this.logDir, `consult-${consultationId}-partial.jsonl`);
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    try {
      await writeFile(tempPath, content, 'utf-8');
      await rename(tempPath, filePath);
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        await unlink(tempPath);
      }
      throw error;
    }
  }

  private signResult(result: any): string {
    const secret = process.env.CONCLAVE_SECRET || 'default-secret';
    const hmac = createHmac('sha256', secret);
    const { signature, ...dataToSign } = result;
    hmac.update(JSON.stringify(dataToSign));
    return hmac.digest('hex');
  }

  private generateResumeToken(): string {
    return randomBytes(16).toString('hex');
  }
}
