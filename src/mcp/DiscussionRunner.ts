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
import { DEFAULT_SELECTOR_MODEL } from '../constants.js';

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
 */
function renderTranscriptMarkdown(conversationHistory: any[]): string {
  let output = '';
  let currentRound = 0;
  let emittedFirstRound = false;

  for (const msg of conversationHistory) {
    const speaker = msg.speaker || 'Unknown';
    if (speaker === 'System') continue;
    if (msg.error) continue;

    if (!emittedFirstRound && speaker !== 'Judge') {
      currentRound = 1;
      output += `### Round ${currentRound}\n\n`;
      emittedFirstRound = true;
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
    } = options;

    // 1. Config resolution
    const config = ConfigCascade.resolve({ config: configPath });

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
      throw new Error(`minRounds (${validatedMinRounds}) cannot exceed rounds (${rounds})`);
    }
    config.min_rounds = validatedMinRounds;

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

    // 8. ConversationManager construction
    const conversationManager = new ConversationManager(
      config,
      null,   // memoryManager
      false,  // no streaming for MCP/REST
      scopedEventBus,
      dynamic,
      selectorModel,
      { judgeInstructions }
    );

    // 9. Timeout/abort setup
    if (timeout < 0) {
      throw new Error('timeout must be >= 0 (0 = no timeout)');
    }
    const effectiveTimeout = timeout === 0 ? 0 : Math.max(timeout, 600);
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    if (effectiveTimeout > 0) {
      conversationManager.abortSignal = abortController.signal;
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

    // 11. Progress heartbeat — sends periodic updates during long-running discussions
    let lastRound = 0;
    const progressHeartbeat = setInterval(() => {
      const currentRound = conversationManager.currentRound ?? lastRound;
      lastRound = currentRound;
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
