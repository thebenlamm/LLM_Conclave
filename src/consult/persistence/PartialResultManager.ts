import { ConsultationResult, ConsultState, AgentResponse, PartialConsultationResult } from '../../types/consult';
import { ArtifactTransformer } from '../artifacts/ArtifactTransformer';
import { writeFile, readFile, rename, unlink } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHmac } from 'crypto';

export class PartialResultManager {
  private logDir: string;

  constructor(logDir?: string) {
    // Default: ~/.llm-conclave/consult-logs/
    this.logDir = logDir || path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Save partial results when consultation is cancelled or fails
   */
  async savePartialResults(
    partialResult: PartialConsultationResult,
    reason: 'user_pulse_cancel' | 'timeout' | 'error'
  ): Promise<string> {
    const filename = this.getPartialFilePath(partialResult.consultationId);
    
    // Transform to JSON format
    const jsonResult = ArtifactTransformer.consultationResultToJSON(partialResult);

    // Add partial-specific fields explicitly (overwriting or extending base transformer output)
    const finalResult = {
      ...jsonResult,
      status: 'partial',
      completed_rounds: partialResult.completedRoundNames || [], // Array of strings e.g. ["Round1"]
      incomplete_rounds: partialResult.incompleteRoundNames || [],
      partial_agents: partialResult.partialAgents ? partialResult.partialAgents.map((a: AgentResponse) => ({
          agent_id: a.agentId,
          response: a.content,
          completed: false
      })) : [],
      cancellation_reason: reason,
      schema_version: '1.0'
    };

    // Add signature
    finalResult.signature = this.signResult(finalResult);

    // Atomic write
    await this.atomicWrite(filename, JSON.stringify(finalResult, null, 2));

    return filename;
  }

  /**
   * Save checkpoint after successful round completion
   * Uses consultation ID + round number as unique key
   */
  async saveCheckpoint(consultation: PartialConsultationResult): Promise<void> {
    // Current round is inferred from completed rounds
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
      // Store the result up to this point
      result: ArtifactTransformer.consultationResultToJSON(consultation),
      timestamp: new Date().toISOString()
    };

    await this.atomicWrite(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Load partial results
   */
  async loadPartialResults(sessionId: string): Promise<PartialConsultationResult | null> {
    const filePath = this.getPartialFilePath(sessionId);
    try {
      const data = await readFile(filePath, 'utf-8');
      const json = JSON.parse(data);
      // We assume it matches the structure. 
      // Reversing the transformation fully is complex, but we can verify it loads.
      // For now, return the JSON cast as any or implement full fromJSON if needed later.
      return json as any as PartialConsultationResult; 
    } catch (error) {
      return null;
    }
  }

  private getPartialFilePath(consultationId: string): string {
    // Story pattern: YYYY-MM-DD-[id]-partial.jsonl
    // Use the ID which typically already includes timestamp or uniqueness
    // But story says "Same base name, add -partial suffix"
    // ConsultationFileLogger uses `consult-[id].json`
    // So we use `consult-[id]-partial.json`
    return path.join(this.logDir, `consult-${consultationId}-partial.json`);
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
    // Remove signature field if present to avoid circular dependency in signing
    const { signature, ...dataToSign } = result;
    hmac.update(JSON.stringify(dataToSign));
    return hmac.digest('hex');
  }
}
