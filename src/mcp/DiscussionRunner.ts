/**
 * DiscussionRunner — Unified discussion execution abstraction
 *
 * Encapsulates the shared orchestration logic duplicated across handleDiscuss,
 * handleContinue, and the REST /api/discuss handler in server.ts.
 *
 * Extracted in Phase 03 (Plan 01) to enable Plan 02 to wire the three handlers
 * to this single implementation, eliminating 3x code duplication.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import ConversationManager from '../core/ConversationManager.js';
import { EventBus } from '../core/EventBus.js';
import SessionManager from '../core/SessionManager.js';
import { ConfigCascade } from '../config/ConfigCascade.js';
import { PersonaSystem } from '../config/PersonaSystem.js';
import ProviderFactory from '../providers/ProviderFactory.js';
import ProjectContext from '../utils/ProjectContext.js';
import { CostTracker } from '../core/CostTracker.js';
import { DEFAULT_SELECTOR_MODEL } from '../constants.js';
import { StatusFileManager } from './StatusFileManager.js';

/**
 * Options for DiscussionRunner.run()
 */
export interface DiscussionRunnerOptions {
  task: string;
  config?: string;           // config path or inline JSON for ConfigCascade.resolve
  projectPath?: string;      // project context path
  personas?: string;         // persona string for PersonaSystem
  rounds?: number;           // default 4
  minRounds?: number;        // default 2
  dynamic?: boolean;         // default false
  selectorModel?: string;    // default DEFAULT_SELECTOR_MODEL
  judgeModel?: string;       // override judge model from config
  judgeInstructions?: string;
  timeout?: number;          // default 0 (no timeout)
  contextOptimization?: boolean;
  priorHistory?: Array<{ role: string; content: string; speaker?: string }>;  // for continuation
  onProgress?: (event: { type: string; message: string }) => void;  // progress callback
  validateProjectPath?: (path: string) => string;  // path validator (REST uses different validation)
  clientAbortSignal?: AbortSignal;  // external abort signal (e.g., REST client disconnect)
  resolvedConfig?: any;            // pre-resolved config (for continuation, bypasses ConfigCascade)
  parentSessionId?: string;        // link new session to parent (for continuation)
  /**
   * If true, runtime model substitutions hard-fail with StrictModelError
   * instead of silently falling back. Surfaces as a structured tool_error in
   * the MCP layer. Default: false. (Phase 12-04)
   */
  strictModels?: boolean;
  /**
   * Substitutions persisted from a prior session, re-applied by
   * llm_conclave_continue so the in-memory agent map already uses the
   * substitute model. The original model is NOT retried mid-session.
   * (Phase 12-04)
   */
  restoredSubstitutions?: Record<string, { original: string; fallback: string; reason: string }>;
  /**
   * Phase 15.2 — Maximum turns a single agent may take per round in dynamic mode.
   * Default: 1. Additive; MCP tool schema unchanged for callers omitting it.
   */
  maxTurnsPerAgentPerRound?: number;
}

/**
 * Result returned by DiscussionRunner.run()
 */
export interface DiscussionResult {
  result: any;             // raw ConversationManager result
  sessionId: string;       // saved session ID
  logFilePath: string;     // saved discussion log path
  timedOut: boolean;
  effectiveTimeout: number;
}

/**
 * Renders conversation history as markdown transcript (grouped by round).
 * Used by saveDiscussionLog below.
 *
 * Phase 15.2 (Task 1): error: true entries are no longer silently dropped.
 * They render inline as a FAILED block consuming the existing failedAgents
 * aggregation populated by ConversationManager (errorDetails / agent / model).
 * This preserves transcript reading order so failures appear at the position
 * the failed turn occupied in conversationHistory.
 */
export function renderTranscriptMarkdown(conversationHistory: any[]): string {
  let output = '';
  let currentRound = 0;
  let emittedFirstRound = false;

  for (const msg of conversationHistory) {
    const speaker = msg.speaker || 'Unknown';
    if (speaker === 'System') continue;

    if (!emittedFirstRound && speaker !== 'Judge') {
      currentRound = 1;
      output += `### Round ${currentRound}\n\n`;
      emittedFirstRound = true;
    }

    if (msg.error) {
      // Phase 15.2 — inline FAILED block. ≤4 lines per failed turn.
      const details = msg.errorDetails || 'unknown';
      const isPersonaImpersonation = details === 'persona-impersonation';
      const reasonLine = isPersonaImpersonation
        ? `> reason: persona impersonation (Phase 15.1 guard)`
        : `> reason: provider failure`;
      output += `> **[FAILED] ${speaker}** (${msg.model || 'unknown'})\n`;
      output += `> error: ${details}\n`;
      output += `${reasonLine}\n\n`;
      continue;
    }

    if (speaker === 'Judge') {
      currentRound++;
      output += `### Round ${currentRound}\n\n`;
      output += `> **Judge:** ${msg.content}\n\n`;
      continue;
    }

    output += `**${speaker}** _(${msg.model || 'unknown'})_:\n\n${msg.content}\n\n---\n\n`;
  }

  return output;
}

/**
 * Save full discussion to a log file and return the file path.
 * Extracted from server.ts to avoid circular imports.
 */
export function saveDiscussionLog(result: any): string {
  const {
    task,
    conversationHistory,
    solution,
    consensusReached,
    rounds,
    maxRounds,
    failedAgents = [],
    agentSubstitutions = {},
  } = result;

  const logsDir = path.join(process.env.HOME || '', '.llm-conclave', 'discuss-logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `discuss-${timestamp}.md`;
  const filePath = path.join(logsDir, filename);

  let fullLog = `# Discussion Log\n\n`;
  fullLog += `**Task:** ${task}\n\n`;
  fullLog += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  const roundsDisplay = consensusReached
    ? `${rounds}/${maxRounds || rounds} (consensus reached early)`
    : `${rounds}/${maxRounds || rounds}`;
  fullLog += `**Rounds:** ${roundsDisplay} | **Consensus:** ${consensusReached ? 'Yes' : 'No'}\n\n`;

  const failedDetails = result.failedAgentDetails || {};
  if (failedAgents.length > 0) {
    fullLog += `**Agent Errors:**\n`;
    for (const agent of failedAgents) {
      const detail = failedDetails[agent];
      if (detail) {
        fullLog += `- ${agent} (${detail.model}): ${detail.error}\n`;
      } else {
        fullLog += `- ${agent}: Unknown error\n`;
      }
    }
    fullLog += `\n`;
  }

  const subEntries = Object.entries(agentSubstitutions);
  if (subEntries.length > 0) {
    fullLog += `**Model Substitutions:**\n`;
    for (const [agent, sub] of subEntries) {
      const s = sub as any;
      fullLog += `- ${agent}: ${s.original} -> ${s.fallback} (${s.reason})\n`;
    }
    fullLog += `\n`;
  }

  fullLog += `---\n\n`;

  if (conversationHistory && conversationHistory.length > 0) {
    fullLog += `## Full Discussion\n\n`;
    fullLog += renderTranscriptMarkdown(conversationHistory);
  }

  if (solution) {
    fullLog += `## Final Solution\n\n${solution}\n\n`;
  }

  fs.writeFileSync(filePath, fullLog, 'utf-8');
  return filePath;
}

/**
 * DiscussionRunner encapsulates the full lifecycle of a discuss-mode conversation:
 *
 * 1. Config resolution (ConfigCascade)
 * 2. Context optimization flag
 * 3. Persona resolution (PersonaSystem -> config.agents)
 * 4. Round validation
 * 5. Project context loading (ProjectContext)
 * 6. Judge creation (ProviderFactory)
 * 7. EventBus setup (scoped instance, named handlers, onProgress forwarding)
 * 8. ConversationManager construction
 * 9. Timeout/abort (AbortController)
 * 10. Prior history injection (for handleContinue support)
 * 11. Progress heartbeat (every 30s)
 * 12. Execute (startConversation)
 * 13. Cleanup in finally (clearInterval, clearTimeout, off EventBus handlers)
 * 14. Discussion log saving
 * 15. Session saving (SessionManager)
 */
export class DiscussionRunner {
  async run(options: DiscussionRunnerOptions): Promise<DiscussionResult> {
    const {
      task,
      config: configPath,
      projectPath,
      personas,
      rounds = 4,
      minRounds = 2,
      dynamic = false,
      selectorModel = DEFAULT_SELECTOR_MODEL,
      judgeInstructions,
      timeout = 0,
      contextOptimization = false,
      priorHistory,
      onProgress,
      validateProjectPath,
      clientAbortSignal,
      resolvedConfig: preResolvedConfig,
      parentSessionId,
      strictModels = false,
      restoredSubstitutions,
      maxTurnsPerAgentPerRound,
    } = options;

    // 1. Config resolution (use pre-resolved config for continuation to bypass ConfigCascade)
    const config = preResolvedConfig ?? ConfigCascade.resolve({ config: configPath });

    // 2. Context optimization
    if (contextOptimization) {
      config.contextOptimization = { enabled: true };
    }

    // 3. Persona resolution -> config.agents
    if (personas) {
      const personaList = PersonaSystem.getPersonas(personas);
      const personaAgents = PersonaSystem.personasToAgents(personaList, config.contextOptimization);

      config.agents = {};
      for (const [name, agent] of Object.entries(personaAgents) as [string, any][]) {
        config.agents[name] = {
          model: agent.model,
          prompt: agent.systemPrompt,
        };
      }
    }

    // 4. Round validation
    config.max_rounds = rounds;
    const validatedMinRounds = Math.max(0, Math.floor(minRounds || 0));
    if (validatedMinRounds > rounds) {
      throw new Error(`min_rounds (${validatedMinRounds}) cannot exceed rounds (${rounds})`);
    }
    config.min_rounds = validatedMinRounds;

    // Phase 15.2 — surface optional per-agent-per-round turn cap on the
    // resolved config. Default-to-1 resolution lives in runDynamicRound; we
    // only set the field if the caller explicitly passed it, so omission
    // remains MCP-schema-additive.
    if (typeof maxTurnsPerAgentPerRound === 'number') {
      config.maxTurnsPerAgentPerRound = maxTurnsPerAgentPerRound;
    }

    // 5. Project context loading
    let projectContext: any = null;
    if (projectPath) {
      const resolvedPath = validateProjectPath
        ? validateProjectPath(projectPath)
        : projectPath;

      const stats = await fsPromises.lstat(resolvedPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed for project path: ${projectPath}`);
      }
      projectContext = new ProjectContext(resolvedPath);
      await projectContext.load();
    }

    // 6. Judge creation
    const judgeModel = options.judgeModel || config.judge.model;
    const judge = {
      model: judgeModel,
      provider: ProviderFactory.createProvider(judgeModel),
      systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.',
    };

    // 6b. StatusFileManager — tracks active discussion state for llm_conclave_status tool
    const statusFileManager = new StatusFileManager();
    const agentNames = Object.keys(config.agents);

    // 7. EventBus setup — scoped instance to avoid cross-talk between concurrent requests
    const scopedEventBus = EventBus.createInstance();

    const onRoundStart = (event: any) => {
      const round = event?.payload?.round ?? '?';
      if (onProgress) {
        onProgress({ type: 'round:start', message: `Round ${round}/${rounds} starting...` });
      }
    };

    const onAgentThinking = (event: any) => {
      const agent = event?.payload?.agent ?? 'Agent';
      currentAgentName = agent;
      statusFileManager.writeStatus({
        active: true,
        task,
        startTime: new Date(discussionStartMs).toISOString(),
        elapsedMs: Date.now() - discussionStartMs,
        agents: agentNames,
        currentRound: (conversationManager.currentRound ?? 0) + 1,
        maxRounds: rounds,
        currentAgent: currentAgentName,
        updatedAt: new Date().toISOString(),
      });
      if (onProgress) {
        onProgress({ type: 'agent:thinking', message: `${agent} is responding...` });
      }
    };

    const onError = (event: any) => {
      const message = event?.payload?.message ?? 'Unknown error';
      if (onProgress) {
        onProgress({ type: 'error', message: `Agent error (continuing): ${message}` });
      }
    };

    const onStatus = (event: any) => {
      const message = event?.payload?.message ?? 'Status update';
      if (onProgress) {
        onProgress({ type: 'status', message });
      }
    };

    scopedEventBus.on('round:start', onRoundStart);
    scopedEventBus.on('agent:thinking', onAgentThinking);
    scopedEventBus.on('error', onError);
    scopedEventBus.on('status', onStatus);

    // 8. ConversationManager construction — per-session CostTracker for cost isolation (OBSRV-01)
    const costTracker = new CostTracker();
    const conversationManager = new ConversationManager(
      config,
      null,   // memoryManager
      false,  // no streaming for MCP/REST
      scopedEventBus,
      dynamic,
      selectorModel,
      { judgeInstructions, costTracker, strictModels }
    );

    // Phase 12-04: re-apply substitutions recorded in the prior session
    // (llm_conclave_continue path). Substituted models stay substituted on
    // resume — the originally-configured model is NOT retried, because
    // mid-session model switches would invalidate prior-round history.
    if (restoredSubstitutions && Object.keys(restoredSubstitutions).length > 0) {
      conversationManager.restoreAgentSubstitutions(restoredSubstitutions);
    }

    // 9. Timeout/abort setup
    if (timeout < 0) {
      throw new Error('timeout must be >= 0 (0 = no timeout)');
    }
    const effectiveTimeout = timeout === 0 ? 0 : Math.max(timeout, 600);
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    // Wire external abort signal (e.g., REST client disconnect) into our internal controller
    if (clientAbortSignal) {
      if (clientAbortSignal.aborted) {
        abortController.abort(clientAbortSignal.reason);
      } else {
        clientAbortSignal.addEventListener('abort', () => {
          abortController.abort(clientAbortSignal.reason);
        }, { once: true });
      }
    }

    if (effectiveTimeout > 0 || clientAbortSignal) {
      conversationManager.abortSignal = abortController.signal;
    }
    if (effectiveTimeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        abortController.abort('timeout');
        console.log(`[DiscussionRunner timeout: ${effectiveTimeout}s exceeded, aborting discussion]`);
      }, effectiveTimeout * 1000);
    }

    // 10. Prior history injection — needed by handleContinue
    if (priorHistory && priorHistory.length > 0) {
      for (const msg of priorHistory) {
        conversationManager.conversationHistory.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          speaker: msg.speaker || (msg.role === 'user' ? 'System' : 'Assistant'),
        });
      }
    }

    // 10b. Adjust currentRound to account for prior rounds.
    // Phase 18 (AUDIT-03) updated this: prefer the maximum stamped roundNumber
    // from priorHistory (authoritative — set at push time by ConversationManager /
    // AgentTurnExecutor). Fall back to the pre-Phase-18 Judge-delimiter count
    // (INTEG-05) only when priorHistory carries no stamps at all (legacy sessions
    // saved before Phase 18 landed).
    if (priorHistory && priorHistory.length > 0) {
      const maxStamped = priorHistory.reduce(
        (acc: number, entry: any) => (typeof entry?.roundNumber === 'number' && entry.roundNumber > acc ? entry.roundNumber : acc),
        0
      );
      if (maxStamped > 0) {
        conversationManager.currentRound = maxStamped;
      } else {
        const completedRounds = conversationManager.conversationHistory.filter(
          (entry: any) => entry.speaker === 'Judge' && entry.role === 'user'
        ).length;
        conversationManager.currentRound = completedRounds;
      }
    }

    // 10c. Write initial status file and set up timing/agent tracking
    const discussionStartMs = Date.now();
    let currentAgentName: string | null = null;
    statusFileManager.writeStatus({
      active: true,
      task,
      startTime: new Date(discussionStartMs).toISOString(),
      elapsedMs: 0,
      agents: agentNames,
      // Phase 18 (AUDIT-03): 1-indexed upcoming round. For a fresh run
      // conversationManager.currentRound is 0 → status reports round 1.
      // For a continuation it is whatever Step 10b restored → status reports
      // the correct resume round from the first heartbeat-equivalent write.
      currentRound: (conversationManager.currentRound ?? 0) + 1,
      maxRounds: rounds,
      currentAgent: null,
      updatedAt: new Date().toISOString(),
    });

    // 11. Progress heartbeat — sends periodic updates during long-running discussions
    let lastRound = 0;
    const progressHeartbeat = setInterval(() => {
      const currentRound = conversationManager.currentRound ?? lastRound;
      lastRound = currentRound;
      statusFileManager.writeStatus({
        active: true,
        task,
        startTime: new Date(discussionStartMs).toISOString(),
        elapsedMs: Date.now() - discussionStartMs,
        agents: agentNames,
        currentRound: currentRound + 1,
        maxRounds: rounds,
        currentAgent: currentAgentName,
        updatedAt: new Date().toISOString(),
      });
      if (onProgress) {
        onProgress({
          type: 'heartbeat',
          message: `Discussion in progress — round ${currentRound + 1}/${rounds}...`,
        });
      }
    }, 30_000);

    // 12. Execute
    let result: any;
    try {
      result = await conversationManager.startConversation(task, judge, projectContext);
    } finally {
      // 13. Cleanup
      statusFileManager.deleteStatus();
      clearInterval(progressHeartbeat);
      if (timeoutId) clearTimeout(timeoutId);
      // Remove only the handlers registered above, preserving EventBus default no-op error handler
      scopedEventBus.off('round:start', onRoundStart);
      scopedEventBus.off('agent:thinking', onAgentThinking);
      scopedEventBus.off('error', onError);
      scopedEventBus.off('status', onStatus);
    }

    // 14. Discussion log saving
    const logFilePath = saveDiscussionLog(result);

    // 15. Session saving
    const sessionManager = new SessionManager();
    const agents = Object.entries(config.agents).map(([name, agentConfig]: [string, any]) => ({
      name,
      model: agentConfig.model,
      systemPrompt: agentConfig.prompt || agentConfig.systemPrompt || '',
      provider: ProviderFactory.createProvider(agentConfig.model),
    }));
    const session = sessionManager.createSessionManifest(
      'consensus',
      task,
      agents,
      result.conversationHistory,
      result,
      judge,
      projectContext?.formatContext()
    );
    // Link to parent session if this is a continuation
    if (parentSessionId) {
      (session as any).parentSessionId = parentSessionId;
    }
    // Populate outputFiles with actual paths (DATA-04)
    if (session.outputFiles) {
      session.outputFiles.transcript = logFilePath || '';
      session.outputFiles.json = path.join(
        sessionManager['sessionsDir'] || path.join(process.env.HOME || '', '.llm-conclave', 'sessions'),
        session.id,
        'session.json'
      );
    }
    const sessionId = await sessionManager.saveSession(session);

    return {
      result,
      sessionId,
      logFilePath,
      timedOut: timedOut || Boolean(result?.timedOut),
      effectiveTimeout,
    };
  }
}
