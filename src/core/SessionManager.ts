import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { getConclaveHome } from '../utils/ConfigPaths.js';
import { detectJudgeCoinage, type AgentTurnLike } from '../consult/coinage/detectJudgeCoinage.js';
import {
  SessionManifest,
  SessionSummary,
  SessionIndexManifest,
  SessionListFilters,
} from '../types';

/**
 * AUDIT-05 (Phase 20): Fold degradation signals from a ConversationManager
 * result into the session status value written into session.json and surfaced
 * via the MCP response.
 *
 * Returns `'completed_degraded'` when ANY of the following fired during the run:
 *   - An agent model was substituted (`agentSubstitutions` non-empty)
 *   - Any agent had a failed turn (`failedAgents` non-empty)
 *   - Any agent was absent (participation status `absent-capped` | `absent-silent` | `absent-failed`)
 *   - The summarizer model itself substituted (`runIntegrity.compression.summarizerFallback` non-null)
 *
 * Returns `'completed'` otherwise. Compression being ACTIVE is NOT by itself
 * degraded — compression activation is normal behavior under token pressure;
 * only a summarizer fallback (compression's compression) counts as degradation.
 *
 * Defensive: if `runIntegrity` is undefined (legacy fixtures pre-Phase-13.1),
 * participation / summarizerFallback signals are skipped. Substitution and
 * failedAgents signals still apply.
 */
export function computeSessionStatus(result: any): 'completed' | 'completed_degraded' {
  const substituted = result?.agentSubstitutions && Object.keys(result.agentSubstitutions).length > 0;
  if (substituted) return 'completed_degraded';

  const failed = Array.isArray(result?.failedAgents) && result.failedAgents.length > 0;
  if (failed) return 'completed_degraded';

  const ri = result?.runIntegrity;
  if (ri) {
    const participation = Array.isArray(ri.participation) ? ri.participation : [];
    const absent = participation.some((p: any) =>
      p && typeof p.status === 'string' && p.status !== 'spoken'
    );
    if (absent) return 'completed_degraded';

    const summarizerFallback = ri.compression && ri.compression.summarizerFallback;
    if (summarizerFallback) return 'completed_degraded';
  }

  return 'completed';
}

/**
 * Manages session persistence and retrieval
 */
export default class SessionManager {
  private sessionsDir: string;
  private manifestPath: string;

  constructor(baseDir?: string) {
    // AUDIT-04: resolve data root via getConclaveHome() so LLM_CONCLAVE_HOME
    // and the conclaveHome config key redirect session storage. `baseDir`
    // still takes priority for explicit test injection.
    this.sessionsDir = baseDir || path.join(getConclaveHome(), 'sessions');
    this.manifestPath = path.join(this.sessionsDir, 'manifest.json');
  }

  /**
   * Initialize sessions directory if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });

      // Create manifest if it doesn't exist
      if (!fsSync.existsSync(this.manifestPath)) {
        const emptyManifest: SessionIndexManifest = {
          sessions: [],
          totalSessions: 0,
        };
        await fs.writeFile(this.manifestPath, JSON.stringify(emptyManifest, null, 2));
      }
    } catch (error) {
      console.error(`Failed to initialize sessions directory: ${error}`);
      throw error;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const random = Math.random().toString(36).substring(2, 6);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Save a session to disk
   */
  async saveSession(session: SessionManifest): Promise<string> {
    await this.initialize();

    const sessionDir = path.join(this.sessionsDir, session.id);
    await fs.mkdir(sessionDir, { recursive: true });

    // Save full session manifest
    const sessionPath = path.join(sessionDir, 'session.json');
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));

    // Update index manifest
    await this.updateIndexManifest(session);

    return session.id;
  }

  /**
   * Update the index manifest with session summary
   */
  private async updateIndexManifest(session: SessionManifest): Promise<void> {
    const manifest = await this.loadIndexManifest();

    // Remove existing entry if updating
    manifest.sessions = manifest.sessions.filter(s => s.id !== session.id);

    // Add new summary
    const summary: SessionSummary = {
      id: session.id,
      timestamp: session.timestamp,
      mode: session.mode,
      task: session.task.length > 100 ? session.task.substring(0, 100) + '...' : session.task,
      status: session.status,
      roundCount: session.currentRound,
      agentCount: session.agents.length,
      cost: session.cost.totalCost,
      parentSessionId: session.parentSessionId,
      consensusReached: session.consensusReached,
    };

    manifest.sessions.unshift(summary); // Add to beginning
    manifest.totalSessions = manifest.sessions.length;

    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Load the index manifest
   */
  private async loadIndexManifest(): Promise<SessionIndexManifest> {
    try {
      const data = await fs.readFile(this.manifestPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // Return empty manifest if file doesn't exist
      return {
        sessions: [],
        totalSessions: 0,
      };
    }
  }

  /**
   * Load a session by ID
   */
  async loadSession(sessionId: string): Promise<SessionManifest | null> {
    try {
      const sessionPath = path.join(this.sessionsDir, sessionId, 'session.json');
      const data = await fs.readFile(sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * List all available sessions with optional filters
   */
  async listSessions(filters?: SessionListFilters): Promise<SessionSummary[]> {
    const manifest = await this.loadIndexManifest();
    let sessions = manifest.sessions;

    // Apply filters
    if (filters) {
      if (filters.mode) {
        sessions = sessions.filter(s => s.mode === filters.mode);
      }
      if (filters.status) {
        sessions = sessions.filter(s => s.status === filters.status);
      }
      if (filters.since) {
        sessions = sessions.filter(s => new Date(s.timestamp) >= filters.since!);
      }
      if (filters.limit) {
        sessions = sessions.slice(0, filters.limit);
      }
    }

    return sessions;
  }

  /**
   * Find most recent session
   */
  async getMostRecentSession(): Promise<SessionManifest | null> {
    const sessions = await this.listSessions({ limit: 1 });
    if (sessions.length === 0) {
      return null;
    }
    return this.loadSession(sessions[0].id);
  }

  /**
   * Delete a session and its files
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionDir = path.join(this.sessionsDir, sessionId);
      await fs.rm(sessionDir, { recursive: true, force: true });

      // Update index
      const manifest = await this.loadIndexManifest();
      manifest.sessions = manifest.sessions.filter(s => s.id !== sessionId);
      manifest.totalSessions = manifest.sessions.length;
      await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));

      return true;
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}: ${error}`);
      return false;
    }
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const sessionPath = path.join(this.sessionsDir, sessionId, 'session.json');
    try {
      await fs.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a session manifest from conversation result.
   *
   * Phase 18 (AUDIT-03): per-message `roundNumber` is copied from
   * `entry.roundNumber` when stamped by the conversation loop; falls back to
   * the legacy positional index/agents-length heuristic only for entries
   * that lack the stamp (legacy fixtures/replays). An invariant asserts the
   * top-level `currentRound` agrees with the maximum stamped roundNumber.
   */
  createSessionManifest(
    mode: 'consensus' | 'orchestrated' | 'iterative',
    task: string,
    agents: any[],
    conversationHistory: any[],
    result: any,
    judge?: any,
    projectContext?: string
  ): SessionManifest {
    const sessionId = this.generateSessionId();
    const timestamp = new Date().toISOString();

    // Convert agents to session format
    // Note: provider stores the class name (e.g., "ClaudeProvider") for debugging/display.
    // The model field is used for reconstruction - provider is informational only.
    const sessionAgents = agents.map(agent => ({
      name: agent.name,
      model: agent.model || 'unknown',
      provider: agent.provider?.constructor?.name || 'unknown',
      systemPrompt: agent.systemPrompt || '',
    }));

    // Convert judge if present
    const sessionJudge = judge ? {
      name: 'Judge',
      model: judge.model || 'unknown',  // Use explicit model field, not provider class name
      provider: judge.provider?.constructor?.name || 'unknown',
      systemPrompt: judge.systemPrompt || '',
    } : undefined;

    // Phase 18 (AUDIT-03): prefer the canonical round stamp set at push time by
    // ConversationManager / AgentTurnExecutor. Fall back to the positional heuristic
    // only for entries that predate the stamping (test fixtures, legacy data).
    const sessionMessages = conversationHistory.map((entry, index) => ({
      role: entry.role || entry.speaker?.toLowerCase() || 'assistant',
      content: entry.content,
      speaker: entry.speaker,
      model: entry.model,
      timestamp: timestamp,
      roundNumber: typeof entry.roundNumber === 'number'
        ? entry.roundNumber
        : Math.floor(index / agents.length),
      error: entry.error,
    }));

    // Phase 18 (AUDIT-03) invariant: the top-level currentRound MUST equal the
    // largest roundNumber present on any non-empty conversation history. If they
    // diverge, the `result.rounds` counter has drifted from what the message
    // stamps reflect — log (and in strict mode, throw). This is the signal the
    // Phase 18 regression tests pin against.
    const maxStampedRound = sessionMessages.reduce(
      (acc, msg) => (typeof msg.roundNumber === 'number' && msg.roundNumber > acc ? msg.roundNumber : acc),
      0
    );
    const resolvedCurrentRound = result.rounds || 1;
    if (sessionMessages.length > 0 && maxStampedRound > 0 && maxStampedRound !== resolvedCurrentRound) {
      const msg = `[SessionManager] round counter drift: result.rounds=${resolvedCurrentRound} but max stamped roundNumber=${maxStampedRound}`;
      console.warn(msg);
      if (process.env.NODE_ENV === 'test' || process.env.LLM_CONCLAVE_STRICT_ROUND_COUNTER === '1') {
        throw new Error(msg);
      }
    }

    // Get cost info from result or use defaults
    const costInfo = result.cost || {
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      totalCalls: 0,
    };

    // AUDIT-06 (Phase 20): flag synthesis terms absent from every agent turn.
    // Judge and System turns are excluded from the grounding corpus by design
    // — judge-self-grounding is not valid grounding (that is the whole point
    // of the feature).
    const agentTurnCorpus: AgentTurnLike[] = (conversationHistory || [])
      .filter((m: any) =>
        m && m.role === 'assistant' && m.speaker && m.speaker !== 'Judge' && m.speaker !== 'System' && !m.error
      )
      .map((m: any) => ({ speaker: String(m.speaker), content: String(m.content || '') }));
    const judgeCoinage: string[] = detectJudgeCoinage(
      String(result.solution || result.finalOutput || ''),
      agentTurnCorpus
    );

    const session: SessionManifest = {
      id: sessionId,
      timestamp: timestamp,
      mode: mode,
      task: task,
      agents: sessionAgents,
      judge: sessionJudge,
      // AUDIT-05: derive status from degradation signals (substitution, failure,
      // absent agent, summarizer fallback). Clean runs stay 'completed'.
      status: computeSessionStatus(result),
      currentRound: result.rounds || 1,
      maxRounds: result.maxRounds,
      minRounds: result.minRounds,
      conversationHistory: sessionMessages,
      projectContext: projectContext,
      consensusReached: result.consensusReached,
      finalSolution: result.solution || result.finalOutput,
      turn_analytics: result.turn_analytics || undefined,
      dissent_quality: result.dissent_quality || undefined,
      // Phase 12-02: persist agentSubstitutions so session.json reflects which
      // models actually ran. Default to empty object — never null — so the
      // shape is consistent across runs with and without substitutions.
      agentSubstitutions: result.agentSubstitutions || {},
      cost: costInfo,
      outputFiles: {
        transcript: result.transcript || '',
        consensus: result.consensus,
        json: result.json || '',
      },
      // AUDIT-04: record the resolved LLM Conclave data root at save time so
      // consumers reading session.json can confirm where the session lived
      // without re-resolving getConclaveHome() (which may diverge later).
      conclaveHome: getConclaveHome(),
      // AUDIT-06 (Phase 20): record judge-coined terms (synthesis phrases
      // absent from every agent turn). Always present on manifests produced
      // by this code path; empty array on grounded runs so the non-empty
      // case is trivially grep-able.
      judgeCoinage,
    };

    return session;
  }

  /**
   * Format session summary for display
   */
  formatSessionSummary(session: SessionSummary, index?: number): string {
    const date = new Date(session.timestamp);
    const dateStr = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const taskPreview = session.task.length > 60
      ? session.task.substring(0, 60) + '...'
      : session.task;

    const prefix = index !== undefined ? `${index}. ` : '';
    const parent = session.parentSessionId ? ' (continuation)' : '';

    return `${prefix}[${dateStr}] "${taskPreview}"
   Mode: ${session.mode} | Rounds: ${session.roundCount} | Cost: $${session.cost.toFixed(4)}${parent}`;
  }
}
