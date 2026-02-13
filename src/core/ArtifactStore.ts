/**
 * ArtifactStore - Offloads large tool outputs to disk
 *
 * When a tool result exceeds the threshold (default 2KB), it is stored on disk
 * and replaced with a compact stub containing metadata and a preview.
 * Agents can retrieve the full content via the `expand_artifact` tool.
 *
 * Phase 2 Context Tax: Tool Output Offloading (2.1)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface StoredArtifact {
  id: string;
  toolName: string;
  toolInput: Record<string, any>;
  sizeBytes: number;
  lineCount: number;
  filePath: string;
  stub: string;
}

export class ArtifactStore {
  private storePath: string;
  private artifacts: Map<string, StoredArtifact> = new Map();
  private counter: number = 0;
  private readonly THRESHOLD_BYTES: number;
  private readonly STALE_HOURS = 24;

  constructor(sessionId: string, options?: { thresholdBytes?: number }) {
    const baseDir = path.join(os.homedir(), '.llm-conclave', 'artifacts', sessionId);
    this.storePath = baseDir;
    this.THRESHOLD_BYTES = options?.thresholdBytes ?? 2048;
  }

  /**
   * Initialize the store directory and clean stale sessions.
   * Must be called before store/get operations.
   */
  async init(): Promise<void> {
    await fs.mkdir(this.storePath, { recursive: true });
    await this.cleanStale();
  }

  /**
   * Check if content exceeds the offloading threshold.
   */
  shouldOffload(content: string): boolean {
    return Buffer.byteLength(content, 'utf8') > this.THRESHOLD_BYTES;
  }

  /**
   * Store a large tool output on disk and return a stub reference.
   * Uses atomic write (temp file + rename) for safety.
   */
  async store(toolName: string, toolInput: Record<string, any>, content: string): Promise<StoredArtifact> {
    this.counter++;
    const id = `tool-${this.counter}`;
    const filePath = path.join(this.storePath, `${id}.txt`);

    // Atomic write: write to temp file then rename
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, content, 'utf8');
    await fs.rename(tmpPath, filePath);

    const lines = content.split('\n');
    const lineCount = lines.length;
    const sizeBytes = Buffer.byteLength(content, 'utf8');

    // Build a descriptive label from the tool input
    const label = this.buildLabel(toolName, toolInput);

    // Build preview: first 3 lines + last 2 lines
    const previewLines: string[] = [];
    const previewHead = Math.min(3, lines.length);
    for (let i = 0; i < previewHead; i++) {
      previewLines.push(lines[i]);
    }
    if (lines.length > 5) {
      previewLines.push('...');
      previewLines.push(lines[lines.length - 2]);
      previewLines.push(lines[lines.length - 1]);
    } else if (lines.length > previewHead) {
      for (let i = previewHead; i < lines.length; i++) {
        previewLines.push(lines[i]);
      }
    }

    const sizeStr = sizeBytes > 1024
      ? `${(sizeBytes / 1024).toFixed(1)}KB`
      : `${sizeBytes}B`;

    const stub = `[Artifact ${id}: ${label} (${lineCount} lines, ${sizeStr}) — use expand_artifact with id="${id}"]\n${previewLines.join('\n')}`;

    const artifact: StoredArtifact = {
      id,
      toolName,
      toolInput,
      sizeBytes,
      lineCount,
      filePath,
      stub
    };

    this.artifacts.set(id, artifact);
    return artifact;
  }

  /**
   * Retrieve full content of a stored artifact by ID.
   */
  async get(id: string): Promise<string | null> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      return null;
    }

    try {
      return await fs.readFile(artifact.filePath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Clean up this session's artifact directory.
   * Called in orchestrator finally block.
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.storePath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }

  /**
   * Remove stale artifact directories older than STALE_HOURS.
   */
  private async cleanStale(): Promise<void> {
    const parentDir = path.dirname(this.storePath);
    try {
      const entries = await fs.readdir(parentDir, { withFileTypes: true });
      const cutoff = Date.now() - this.STALE_HOURS * 60 * 60 * 1000;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(parentDir, entry.name);
        if (dirPath === this.storePath) continue; // Skip our own directory

        try {
          const stat = await fs.stat(dirPath);
          if (stat.mtimeMs < cutoff) {
            await fs.rm(dirPath, { recursive: true, force: true });
          }
        } catch {
          // Skip directories we can't stat
        }
      }
    } catch {
      // Parent directory might not exist yet
    }
  }

  /**
   * Build a descriptive label from tool name and input.
   */
  private buildLabel(toolName: string, toolInput: Record<string, any>): string {
    if (toolInput.file_path) {
      return path.basename(toolInput.file_path);
    }
    if (toolInput.pattern) {
      return `glob:${toolInput.pattern}`;
    }
    if (toolInput.command) {
      const cmd = toolInput.command.substring(0, 30);
      return `cmd:${cmd}`;
    }
    return toolName;
  }
}
