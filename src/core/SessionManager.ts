import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SessionManifest,
  SessionSummary,
  SessionIndexManifest,
  SessionListFilters,
} from '../types';

/**
 * Manages session persistence and retrieval
 */
export default class SessionManager {
  private sessionsDir: string;
  private manifestPath: string;

  constructor(baseDir?: string) {
    // Default to user's home directory
    const homeDir = os.homedir();
    const conclaveDir = path.join(homeDir, '.llm-conclave');
    this.sessionsDir = baseDir || path.join(conclaveDir, 'sessions');
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
   * Create a session manifest from conversation result
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
    const sessionAgents = agents.map(agent => ({
      name: agent.name,
      model: agent.model || 'unknown',
      provider: agent.provider?.constructor?.name || 'unknown',
      systemPrompt: agent.systemPrompt || '',
    }));

    // Convert judge if present
    const sessionJudge = judge ? {
      name: 'Judge',
      model: judge.provider?.constructor?.name || 'unknown',
      provider: judge.provider?.constructor?.name || 'unknown',
      systemPrompt: judge.systemPrompt || '',
    } : undefined;

    // Convert conversation history to session messages
    const sessionMessages = conversationHistory.map((entry, index) => ({
      role: entry.role || entry.speaker?.toLowerCase() || 'assistant',
      content: entry.content,
      speaker: entry.speaker,
      model: entry.model,
      timestamp: timestamp,
      roundNumber: Math.floor(index / agents.length),
      error: entry.error,
    }));

    // Get cost info from result or use defaults
    const costInfo = result.cost || {
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      totalCalls: 0,
    };

    const session: SessionManifest = {
      id: sessionId,
      timestamp: timestamp,
      mode: mode,
      task: task,
      agents: sessionAgents,
      judge: sessionJudge,
      status: 'completed',
      currentRound: result.rounds || 1,
      maxRounds: result.maxRounds,
      conversationHistory: sessionMessages,
      projectContext: projectContext,
      consensusReached: result.consensusReached,
      finalSolution: result.solution || result.finalOutput,
      cost: costInfo,
      outputFiles: {
        transcript: result.transcript || '',
        consensus: result.consensus,
        json: result.json || '',
      },
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
