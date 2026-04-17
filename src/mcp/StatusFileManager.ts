/**
 * StatusFileManager — Atomic write/read/delete of active-discussion.json
 *
 * Manages a single status file at ~/.llm-conclave/active-discussion.json that
 * reflects the current state of any running discussion. Used by DiscussionRunner
 * to write lifecycle updates and by the llm_conclave_status MCP handler to read.
 *
 * Design decisions (per plan):
 * - Synchronous I/O only — status writes happen inside heartbeat/event handlers
 *   where async would complicate flow control
 * - Atomic writes via temp+rename — prevents callers from reading partial JSON
 * - Never throws — a failed status write must not crash the discussion (D-09)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConclaveHome } from '../utils/ConfigPaths.js';

export interface ActiveDiscussionStatus {
  active: true;
  task: string;
  startTime: string;         // ISO timestamp when discussion began
  elapsedMs: number;         // Date.now() - startMs at time of write
  agents: string[];          // agent display names
  currentRound: number;      // 1-indexed for display
  maxRounds: number;
  currentAgent: string | null;  // which agent is responding right now (null = between responses)
  updatedAt: string;         // ISO timestamp of last write
}

export class StatusFileManager {
  private readonly filePath: string;

  /**
   * @param baseDir - directory to store active-discussion.json.
   *                  Defaults to getConclaveHome() — honors LLM_CONCLAVE_HOME env var (AUDIT-04).
   */
  constructor(baseDir?: string) {
    // AUDIT-04: honor LLM_CONCLAVE_HOME via getConclaveHome(); baseDir
    // override still wins for explicit test injection.
    const dir = baseDir ?? getConclaveHome();
    this.filePath = path.join(dir, 'active-discussion.json');
  }

  /**
   * Write status atomically: write to .tmp, then rename into place.
   * A partial write is never visible to readers because rename is atomic on POSIX.
   * Never throws — errors are logged but must not crash the discussion (D-09).
   */
  writeStatus(status: ActiveDiscussionStatus): void {
    const tmpPath = this.filePath + '.tmp';
    try {
      // Ensure parent directory exists (idempotent)
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(tmpPath, JSON.stringify(status, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[StatusFileManager] Failed to write status file:', err);
      // Attempt cleanup of temp file if rename failed
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  /**
   * Read the current status file synchronously.
   * Returns null if the file does not exist, cannot be read, or contains invalid JSON.
   * Never throws.
   */
  readStatus(): ActiveDiscussionStatus | null {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as ActiveDiscussionStatus;
    } catch {
      return null;
    }
  }

  /**
   * Delete the status file. Ignores ENOENT (file already gone).
   * Never throws.
   */
  deleteStatus(): void {
    try {
      fs.unlinkSync(this.filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error('[StatusFileManager] Failed to delete status file:', err);
      }
    }
  }
}
