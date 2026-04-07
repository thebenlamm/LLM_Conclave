#!/usr/bin/env node

/**
 * LLM Conclave MCP Server
 *
 * Exposes llm_conclave's multi-agent consultation capabilities as MCP tools.
 * This allows any MCP-compatible AI assistant (Claude Desktop, Cursor, VS Code, etc.)
 * to invoke consultations as part of their workflow.
 *
 * Supports two transport modes:
 * - stdio (default): One server per process, used when spawned by MCP clients
 * - SSE (--sse or MCP_SSE_PORT): Single HTTP server shared by multiple clients
 */

// Set MCP mode flag BEFORE any other imports
// This prevents interactive prompts from hanging (stdin is used for MCP protocol)
process.env.LLM_CONCLAVE_MCP = '1';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import express from 'express';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator.js';
import SessionManager from '../core/SessionManager.js';
import ContinuationHandler from '../core/ContinuationHandler.js';
import ConsultLogger from '../utils/ConsultLogger.js';
import { PersonaSystem } from '../config/PersonaSystem.js';
import { FormatterFactory } from '../consult/formatting/FormatterFactory.js';
import { OutputFormat } from '../types/consult.js';
import { DEFAULT_SELECTOR_MODEL } from '../constants.js';
import { ContextLoader } from '../consult/context/ContextLoader.js';
import { DiscussionRunner } from './DiscussionRunner.js';
import { StatusFileManager } from './StatusFileManager.js';

// ============================================================================
// Server Factory - creates a configured Server instance per connection
// ============================================================================

export function createServer(): Server {
  const server = new Server(
    {
      name: 'llm-conclave',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );
  registerHandlers(server);
  return server;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
  {
    name: 'llm_conclave_consult',
    description: 'Run a structured multi-round consultation (positions, synthesis, debate, resolution). Default expert panel: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini). Panel is configurable via personas parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question or problem to consult on',
        },
        context: {
          type: 'string',
          description: 'File paths (comma-separated) or project directory path',
        },
        personas: {
          type: 'string',
          description: 'Expert panel (comma-separated). Built-in: security, performance, architect, creative, skeptic, pragmatic, qa, devops, accessibility, documentation. Sets: @design, @backend. Example: "creative,architect,pragmatic"',
        },
        rounds: {
          type: 'number',
          description: 'Number of rounds 1-4. 1=independent opinions, 2=positions+synthesis, 3=adds cross-exam, 4=full with verdict. Default: 4.',
          default: 4,
        },
        quick: {
          type: 'boolean',
          description: 'Quick mode (2 rounds: positions + synthesis)',
          default: false,
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'both'],
          description: 'Output format',
          default: 'markdown',
        },
        judge_model: {
          type: 'string',
          description: 'Model for judge/synthesis rounds (default: gpt-4o). Useful when a provider is unavailable.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'llm_conclave_discuss',
    description: 'Run a free-form multi-round discussion where agents debate and build on each other\'s ideas. RECOMMENDED for complex decisions needing diverse expert perspectives.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task or topic to discuss',
        },
        project: {
          type: 'string',
          description: 'Project context path (file or directory)',
        },
        personas: {
          type: 'string',
          description: `Select 3-5 personas relevant to your task.

BUILT-IN PERSONAS:
- security: OWASP vulnerabilities, auth, encryption (Claude)
- performance: optimization, scaling, caching (GPT-4o)
- architect: system design, patterns, trade-offs (Claude Opus)
- creative: novel approaches, brainstorming (Gemini)
- skeptic: devil's advocate, edge cases, risks (GPT-4o)
- pragmatic: shipping focus, MVP, technical debt (GPT-4o)
- qa: testing strategies, edge cases (GPT-4o)
- devops: CI/CD, infrastructure, deployment (Gemini)
- accessibility: WCAG, a11y patterns (Claude)
- documentation: API docs, clarity (GPT-4o)

CUSTOM PERSONAS:
For domain-specific experts (health, legal, finance, etc.), create ~/.llm-conclave/config.json:
{
  "custom_personas": {
    "healthCoach": {
      "name": "Health Coach",
      "model": "claude-sonnet-4-5",
      "systemPrompt": "You are a certified health coach specializing in..."
    }
  },
  "persona_sets": {
    "health": ["healthCoach", "nutritionist", "psychologist"]
  }
}

Then use: personas="healthCoach,nutritionist" or personas="@health" (@ expands the set).

Example: "security,architect,pragmatic" for security-sensitive architecture.
Default if omitted: generic Primary/Validator/Reviewer agents.`,
        },
        config: {
          type: 'string',
          description: `Custom agent configuration. Can be either:
1. File path to .llm-conclave.json
2. Inline JSON string (see schema below)

REQUIRED FIELDS per agent:
- "model": The LLM model name (e.g., "claude-sonnet-4-5", "gpt-4o")
- "prompt" or "systemPrompt": The system prompt for the agent

Example inline JSON:
{"agents":{"Expert":{"model":"claude-sonnet-4-5","prompt":"You are a domain expert..."},"Reviewer":{"model":"gpt-4o","prompt":"You review and critique solutions..."}}}`,
        },
        rounds: {
          type: 'number',
          description: 'Max discussion rounds (default: 4)',
          default: 4,
        },
        min_rounds: {
          type: 'number',
          description: 'Minimum rounds of debate before consensus can end discussion early (default: 2)',
          default: 2,
        },
        dynamic: {
          type: 'boolean',
          description: 'Enable dynamic speaker selection via LLM moderator instead of round-robin (default: false)',
          default: false,
        },
        selector_model: {
          type: 'string',
          description: `Model for speaker selection when dynamic=true (default: ${DEFAULT_SELECTOR_MODEL})`,
          default: DEFAULT_SELECTOR_MODEL,
        },
        judge_model: {
          type: 'string',
          description: 'Model for the judge (evaluates consensus, writes summary). Default: gemini-2.5-flash (1M context, cheapest). Options: gemini-2.5-flash, gemini-2.5-pro, claude-sonnet-4-5, gpt-4o.',
        },
        timeout: {
          type: 'number',
          description: 'Max time in seconds. Do NOT set this parameter — discussions need time to complete. Only set if the user explicitly requests a timeout. 0 = no timeout (default: 0)',
          default: 0,
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'both'],
          description: 'Output format. markdown (default): human-readable summary. json: structured JSON for programmatic consumption. both: JSON object with markdown_summary field included.',
          default: 'markdown',
        },
        judge_instructions: {
          type: 'string',
          description: "Custom instructions appended to the judge's synthesis prompt. Use to guide focus areas, output structure, or evaluation criteria. The judge still produces structured output (SUMMARY/KEY_DECISIONS/etc.) unless you override the format.",
        },
        context_optimization: {
          type: 'boolean',
          description: 'Enable context optimization: agents produce structured <reasoning>/<position> output. Other agents see only positions (50-70% token reduction). Judge sees everything. Default: false.',
          default: false,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'llm_conclave_continue',
    description: 'Continue a previous discussion session with a follow-up question or task.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to continue (default: most recent)',
        },
        task: {
          type: 'string',
          description: 'Follow-up question or task',
        },
        reset: {
          type: 'boolean',
          description: 'Start fresh with only a summary of the previous session (default: false)',
          default: false,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'llm_conclave_sessions',
    description: 'List recent discussion sessions that can be continued.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max sessions to return (default: 10)',
          default: 10,
        },
        mode: {
          type: 'string',
          enum: ['consensus', 'orchestrated', 'iterative'],
          description: 'Filter by discussion mode',
        },
      },
    },
  },
  {
    name: 'llm_conclave_status',
    description: 'Check the status of any active Conclave discussion, or see the most recent completed session. Instant filesystem read — no LLM calls, never times out.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

function registerHandlers(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'llm_conclave_consult':
          return await handleConsult(args as any, server);

        case 'llm_conclave_discuss':
          return await handleDiscuss(args as any, server);

        case 'llm_conclave_continue':
          return await handleContinue(args as any, server);

        case 'llm_conclave_sessions':
          return await handleSessions(args as any);

        case 'llm_conclave_status':
          return await handleStatus();

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}\n\n${error.stack || ''}`,
          },
        ],
        isError: true,
      };
    }
  });
}

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleConsult(args: {
  question: string;
  context?: string;
  personas?: string;
  rounds?: number;
  quick?: boolean;
  format?: string;
  judge_model?: string;
}, server: Server) {
  const { question, context: contextPath, personas, rounds, quick = false, format = 'markdown', judge_model } = args;
  const maxRounds = rounds ? Math.min(4, Math.max(1, rounds)) : (quick ? 2 : 4);

  // Progress heartbeat covers context loading AND consultation execution.
  // Starts before loadContextFromPath to prevent idle gaps on large contexts.
  let roundEstimate = 0;
  let phase = 'loading context';
  const progressHeartbeat = setInterval(() => {
    if (phase === 'consulting') {
      roundEstimate = Math.min(roundEstimate + 1, maxRounds);
    }
    server.sendLoggingMessage({
      level: 'info',
      logger: 'llm-conclave',
      data: phase === 'loading context'
        ? 'Loading context...'
        : `Consultation in progress — round ~${roundEstimate}/${maxRounds}...`
    }).catch(() => {});
  }, 30_000);

  let result: any;
  try {
    // Load context if provided
    let context = '';
    if (contextPath) {
      context = await loadContextFromPath(contextPath);
    }
    phase = 'consulting';

    // Resolve persona panel if provided
    let agents: import('../types').Agent[] | undefined;
    if (personas) {
      agents = PersonaSystem.resolveConsultPanelFromOptions({
        withPersonas: personas,
        question,
      });
    }

    // Initialize orchestrator
    const orchestrator = new ConsultOrchestrator({
      maxRounds,
      verbose: false,
      agents,
      ...(judge_model && { judgeModel: judge_model }),
    });

    // Execute consultation (this is asynchronous and may take time)
    result = await orchestrator.consult(question, context);
  } finally {
    clearInterval(progressHeartbeat);
  }

  // Log for analytics
  const logger = new ConsultLogger();
  const logPaths = await logger.log(result);

  // Format output
  const output = FormatterFactory.format(result, format as OutputFormat);

  return {
    content: [
      {
        type: 'text',
        text: output,
      },
    ],
  };
}

async function handleDiscuss(args: {
  task: string;
  project?: string;
  personas?: string;
  config?: string;
  rounds?: number;
  min_rounds?: number;
  dynamic?: boolean;
  selector_model?: string;
  judge_model?: string;
  timeout?: number;
  format?: string;
  judge_instructions?: string;
  context_optimization?: boolean;
}, server: Server) {
  const format = args.format ?? 'markdown';

  // Build progress callback that forwards events to MCP logging
  const onProgress = (event: { type: string; message: string }) => {
    const level = event.type === 'error' ? 'warning' : 'info';
    server.sendLoggingMessage({
      level,
      logger: 'llm-conclave',
      data: event.message,
    }).catch((err: any) => { console.error('[MCP] Log send failed:', err?.message); });
  };

  const runner = new DiscussionRunner();
  const { result, sessionId, logFilePath, timedOut, effectiveTimeout } = await runner.run({
    task: args.task,
    config: args.config,
    projectPath: args.project,
    personas: args.personas,
    rounds: args.rounds ?? 4,
    minRounds: args.min_rounds ?? 2,
    dynamic: args.dynamic ?? false,
    selectorModel: args.selector_model ?? DEFAULT_SELECTOR_MODEL,
    judgeModel: args.judge_model,
    judgeInstructions: args.judge_instructions,
    timeout: args.timeout ?? 0,
    contextOptimization: args.context_optimization ?? false,
    onProgress,
    validateProjectPath: (p) => validatePath(p, process.cwd()),
  });

  // Format output based on requested format (handler-specific formatting, not orchestration)
  let outputText: string;

  if (format === 'json' || format === 'both') {
    const jsonResult = formatDiscussionResultJson(result, logFilePath, sessionId);

    if (format === 'both') {
      // Include markdown summary as a field inside the JSON
      let markdown = '';
      if (result.degraded) {
        markdown += `**Discussion aborted:** ${result.degradedReason}\n\n`;
      }
      if (timedOut) {
        markdown += `**Discussion timed out after ${effectiveTimeout}s** (${result.rounds} rounds completed)\n\n`;
      }
      markdown += formatDiscussionResult(result, logFilePath, sessionId, { includeTranscript: timedOut });
      outputText = JSON.stringify({ ...jsonResult, markdown_summary: markdown }, null, 2);
    } else {
      outputText = JSON.stringify(jsonResult, null, 2);
    }
  } else {
    // Default: markdown
    let summary = '';
    if (result.degraded) {
      summary += `**❌ Discussion aborted:** ${result.degradedReason}\nCheck MCP server logs at ~/.llm-conclave/mcp-server.log\n\n`;
    }
    if (timedOut) {
      summary += `**⏱️ Discussion timed out after ${effectiveTimeout}s** (${result.rounds} rounds completed)\n\n`;
    }
    summary += formatDiscussionResult(result, logFilePath, sessionId, { includeTranscript: timedOut });
    outputText = summary;
  }

  return {
    content: [
      {
        type: 'text',
        text: outputText,
      },
    ],
  };
}

/**
 * Handle session continuation
 */
async function handleContinue(args: {
  session_id?: string;
  task: string;
  reset?: boolean;
}, server: Server) {
  const { session_id, task, reset = false } = args;
  const sessionManager = new SessionManager();
  const continuationHandler = new ContinuationHandler();

  // Session loading (continuation-specific pre-processing)
  let session;
  if (session_id) {
    session = await sessionManager.loadSession(session_id);
    if (!session) {
      throw new Error(`Session '${session_id}' not found. Use llm_conclave_sessions to list available sessions.`);
    }
  } else {
    session = await sessionManager.getMostRecentSession();
    if (!session) {
      throw new Error('No sessions found. Run a discussion first using llm_conclave_discuss.');
    }
  }

  // Validation (continuation-specific pre-processing)
  const validation = continuationHandler.validateResumable(session);
  if (!validation.isValid) {
    throw new Error(`Cannot resume session: ${validation.warnings.join(', ')}`);
  }

  // Prepare continuation context (continuation-specific pre-processing)
  const prepared = continuationHandler.prepareForContinuation(session, task, {
    resetDiscussion: reset,
    includeFullHistory: !reset,
  });

  // Helper to fix legacy sessions that stored provider class name instead of model
  const fixLegacyModel = (model: string | undefined, fallback: string): string => {
    if (!model) return fallback;
    // Detect corrupted data: class names like "OpenAIProvider", "ClaudeProvider"
    if (model.endsWith('Provider')) return fallback;
    return model;
  };

  // Rebuild config from session (continuation-specific: bypasses ConfigCascade)
  const resolvedConfig: any = {
    max_rounds: session.maxRounds || 4,
    min_rounds: session.minRounds ?? 0, // Legacy sessions didn't persist minRounds; preserve their original behavior
    agents: {},
    judge: {
      model: fixLegacyModel(session.judge?.model, 'gpt-4o'),
      prompt: session.judge?.systemPrompt || 'You are a judge evaluating agent responses.',
    },
  };

  // Reconstruct agents from session
  for (const agent of session.agents) {
    resolvedConfig.agents[agent.name] = {
      model: fixLegacyModel(agent.model, 'gpt-4o'),
      prompt: agent.systemPrompt,
    };
  }

  // Build progress callback that forwards events to MCP logging
  const onProgress = (event: { type: string; message: string }) => {
    const level = event.type === 'error' ? 'warning' : 'info';
    server.sendLoggingMessage({
      level,
      logger: 'llm-conclave',
      data: event.message,
    }).catch((err: any) => { console.error('[MCP] Log send failed:', err?.message); });
  };

  // Delegate execution to DiscussionRunner with pre-resolved config and prior history
  const runner = new DiscussionRunner();
  const { result, sessionId: newSessionId, logFilePath } = await runner.run({
    task: prepared.newTask,
    resolvedConfig,
    rounds: resolvedConfig.max_rounds,
    minRounds: resolvedConfig.min_rounds,
    onProgress,
    // Drop the last 2 entries (continuation marker + continuation user prompt) from
    // mergedHistory — the prompt will be re-injected via task: prepared.newTask (INTEG-04)
    priorHistory: prepared.mergedHistory.slice(0, -2).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      speaker: msg.speaker || (msg.role === 'user' ? 'System' : 'Assistant'),
    })),
    parentSessionId: session.id,
  });

  // Format response (continuation-specific format)
  let output = `# Continuation of Session ${session.id}\n\n`;
  output += `**Original Task:** ${session.task}\n\n`;
  output += `**Follow-up:** ${task}\n\n`;
  output += formatDiscussionResult(result, logFilePath, newSessionId);

  return {
    content: [
      {
        type: 'text',
        text: output,
      },
    ],
  };
}

/**
 * Handle listing sessions
 */
async function handleSessions(args: {
  limit?: number;
  mode?: 'consensus' | 'orchestrated' | 'iterative';
}) {
  const { limit = 10, mode } = args;
  const sessionManager = new SessionManager();

  const sessions = await sessionManager.listSessions({ limit, mode });

  if (sessions.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'No sessions found. Run a discussion first using llm_conclave_discuss.',
        },
      ],
    };
  }

  let output = `# Recent Sessions (${sessions.length})\n\n`;
  output += `Use \`llm_conclave_continue\` with a session ID to continue a discussion.\n\n`;

  for (const session of sessions) {
    const date = new Date(session.timestamp).toLocaleString();
    const taskPreview = session.task.length > 80 ? session.task.substring(0, 80) + '...' : session.task;
    const parent = session.parentSessionId ? ' *(continuation)*' : '';
    output += `### ${session.id}${parent}\n`;
    output += `- **Date:** ${date}\n`;
    output += `- **Mode:** ${session.mode}\n`;
    output += `- **Task:** ${taskPreview}\n`;
    output += `- **Rounds:** ${session.roundCount} | **Cost:** $${session.cost.toFixed(4)}\n\n`;
  }

  return {
    content: [
      {
        type: 'text',
        text: output,
      },
    ],
  };
}

/**
 * Handle llm_conclave_status — instant filesystem read, never times out, never errors.
 * Returns active discussion status if running, or most recent completed session summary.
 */
async function handleStatus() {
  // 1. Check for active discussion via status file
  const statusFileManager = new StatusFileManager();
  const active = statusFileManager.readStatus();

  if (active) {
    const elapsed = active.elapsedMs;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const elapsedStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    let output = `# Active Discussion\n\n`;
    output += `**Task:** ${active.task}\n`;
    output += `**Round:** ${active.currentRound}/${active.maxRounds}\n`;
    output += `**Elapsed:** ${elapsedStr}\n`;
    output += `**Agents:** ${active.agents.join(', ')}\n`;
    if (active.currentAgent) {
      output += `**Currently responding:** ${active.currentAgent}\n`;
    }
    output += `\n*Updated: ${active.updatedAt}*\n`;

    // Stale detection: if updatedAt is >2 minutes old, warn caller (per D-03)
    const updatedAge = Date.now() - new Date(active.updatedAt).getTime();
    if (updatedAge > 120_000) {
      output += `\n> **Warning:** Status file is ${Math.floor(updatedAge / 60000)}m old. The discussion process may have crashed.\n`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  }

  // 2. No active discussion — show most recent completed session
  try {
    const sessionManager = new SessionManager();
    const sessions = await sessionManager.listSessions({ limit: 1 });

    if (sessions.length > 0) {
      const session = sessions[0];
      const date = new Date(session.timestamp).toLocaleString();
      const taskPreview = session.task.length > 100
        ? session.task.substring(0, 100) + '...'
        : session.task;

      let output = `# No Active Discussion\n\n`;
      output += `**Last completed:**\n`;
      output += `- **Task:** ${taskPreview}\n`;
      output += `- **Completed:** ${date}\n`;
      output += `- **Consensus:** ${session.consensusReached ? 'Yes' : session.consensusReached === false ? 'No' : 'N/A'}\n`;
      output += `- **Rounds:** ${session.roundCount} | **Cost:** $${session.cost.toFixed(4)}\n`;

      return {
        content: [{ type: 'text', text: output }],
      };
    }
  } catch {
    // Fall through to no-session response per D-09 — never error
  }

  // 3. No active discussion, no completed sessions
  return {
    content: [{
      type: 'text',
      text: '# No Active Discussion\n\nNo discussions running and no completed sessions found. Start one with `llm_conclave_discuss`.',
    }],
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function validatePath(filePath: string, baseDir: string): string {
  if (filePath.includes('\0')) {
    throw new Error(`Invalid path (null byte detected): ${filePath}`);
  }
  const absolutePath = path.resolve(baseDir, filePath);

  // In SSE mode, process.cwd() is often "/" (set by launchd/systemd),
  // which makes subdirectory validation meaningless. Use HOME as the
  // security boundary instead — only allow paths under the user's home dir.
  const effectiveBase = (baseDir === '/' || baseDir === '')
    ? (process.env.HOME || '/tmp')
    : baseDir;

  const normalizedBase = path.resolve(effectiveBase) + path.sep;
  if (!absolutePath.startsWith(normalizedBase) && absolutePath !== path.resolve(effectiveBase)) {
    throw new Error(`Path escapes allowed directory: ${filePath}`);
  }
  return absolutePath;
}

export async function loadContextFromPath(contextPath: string): Promise<string> {
  const loader = new ContextLoader();

  if (contextPath.includes(',')) {
    const files = contextPath.split(',').map(f => f.trim());
    const loaded = await loader.loadFileContext(files);
    return loaded.formattedContent;
  }

  const baseDir = process.cwd();
  const absolutePath = validatePath(contextPath, baseDir);
  const stats = await fsPromises.lstat(absolutePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Symlinks are not allowed: ${absolutePath}`);
  }

  if (stats.isDirectory()) {
    const loaded = await loader.loadProjectContext(absolutePath);
    return loaded.formattedContent;
  }

  const loaded = await loader.loadFileContext([contextPath]);
  return loaded.formattedContent;
}

/**
 * Render conversation history as markdown transcript grouped by round.
 * Used by formatDiscussionResult for MCP response on timeout.
 */
function renderTranscriptMarkdown(conversationHistory: any[]): string {
  let output = '';
  let currentRound = 0;
  let emittedFirstRound = false;

  for (const msg of conversationHistory) {
    const speaker = msg.speaker || 'Unknown';
    if (speaker === 'System') continue;
    if (msg.error) continue;

    // Emit Round 1 header before the first agent response
    if (!emittedFirstRound && speaker !== 'Judge') {
      currentRound = 1;
      output += `### Round ${currentRound}\n\n`;
      emittedFirstRound = true;
    }

    // Use Judge guidance entries as round boundary markers for subsequent rounds
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
 * Format a brief summary for MCP response (keeps context small)
 */
function formatDiscussionResult(result: any, logFilePath: string, sessionId?: string, options?: { includeTranscript?: boolean }): string {
  const {
    task,
    conversationHistory,
    solution,
    consensusReached,
    rounds,
    maxRounds,
    failedAgents = [],
    agentSubstitutions = {},
    keyDecisions = [],
    actionItems = [],
    dissent = [],
    confidence = 'MEDIUM'
  } = result;

  let output = `# Discussion Summary\n\n`;
  output += `**Task:** ${task}\n\n`;

  // Report degradation with per-agent error details (not just names)
  const failedDetails = result.failedAgentDetails || {};
  if (failedAgents.length > 0) {
    output += `**⚠️ Agent Errors:**\n`;
    for (const agent of failedAgents) {
      const detail = failedDetails[agent];
      if (detail) {
        output += `- ${agent} (${detail.model}): ${detail.error}\n`;
      } else {
        output += `- ${agent}: Unknown error\n`;
      }
    }
    output += `\n`;
  }

  const subEntries = Object.entries(agentSubstitutions);
  if (subEntries.length > 0) {
    output += `**🔄 Model Substitutions:**\n`;
    for (const [agent, sub] of subEntries) {
      const s = sub as any;
      output += `- ${agent}: \`${s.original}\` → \`${s.fallback}\` (${s.reason})\n`;
    }
    output += `\n💡 **Action:** Check provider credits/quotas for the original models.\n\n`;
  }

  // Clearer rounds display showing actual/max
  const roundsDisplay = consensusReached
    ? `${rounds}/${maxRounds || rounds} (consensus reached early)`
    : `${rounds}/${maxRounds || rounds}`;
  output += `**Rounds:** ${roundsDisplay} | **Consensus:** ${consensusReached ? 'Yes' : 'No'} | **Confidence:** ${confidence}\n\n`;

  // List participating agents (excluding failed ones)
  if (conversationHistory && conversationHistory.length > 0) {
    const speakers = new Set<string>();
    for (const msg of conversationHistory) {
      const speaker = msg.speaker || 'Unknown';
      if (speaker !== 'System' && speaker !== 'Judge' && !msg.error) {
        speakers.add(speaker);
      }
    }
    output += `**Agents:** ${Array.from(speakers).join(', ')}\n\n`;
  }

  // Final solution/recommendation (the key output)
  const isJudgeFailed = !solution || solution.includes('judge unavailable') || solution.includes('Best-effort') || solution.includes('judge was unable');
  if (solution) {
    output += `## Summary\n\n${solution}\n\n`;
  } else {
    output += `*No final solution reached*\n\n`;
  }

  // When judge failed, surface last-round agent positions so discussion content isn't lost
  if (isJudgeFailed && conversationHistory?.length > 0) {
    const agentEntries = conversationHistory.filter(
      (e: any) => e.role === 'assistant' && e.speaker !== 'Judge' && !e.error
    );
    // Get last N entries (one per agent)
    const agentCount = Math.max(3, new Set(agentEntries.map((e: any) => e.speaker)).size);
    const lastRoundEntries = agentEntries.slice(-agentCount);
    if (lastRoundEntries.length > 0) {
      output += `## Agent Positions (Last Round)\n\n`;
      output += `> *Judge evaluation failed. Full agent responses from the final round:*\n\n`;
      for (const entry of lastRoundEntries) {
        const preview = entry.content.length > 800
          ? entry.content.substring(0, 800) + '...'
          : entry.content;
        output += `### ${entry.speaker}\n\n${preview}\n\n`;
      }
    }
  }

  // Post-solution note if agents were missing
  if (failedAgents.length > 0) {
    output += `> **Note:** This discussion ran without ${failedAgents.length} requested agent(s). Consider re-running if those perspectives are important.\n\n`;
  }

  // Key Decisions
  if (keyDecisions.length > 0) {
    output += `## Key Decisions\n\n`;
    for (const decision of keyDecisions) {
      output += `- ${decision}\n`;
    }
    output += `\n`;
  }

  // Action Items
  if (actionItems.length > 0) {
    output += `## Action Items\n\n`;
    for (const item of actionItems) {
      output += `- ${item}\n`;
    }
    output += `\n`;
  }

  // Dissenting Views / Unresolved Concerns
  if (dissent.length > 0) {
    output += `## Dissenting Views\n\n`;
    for (const concern of dissent) {
      output += `- ${concern}\n`;
    }
    output += `\n`;
  }

  // Include per-round transcript (e.g., on timeout so partial results aren't lost)
  if (options?.includeTranscript && conversationHistory?.length > 0) {
    output += `## Discussion Transcript\n\n`;
    output += renderTranscriptMarkdown(conversationHistory);
  }

  // Use real CostTracker data from result.cost
  const costData = result.cost;
  output += `---\n\n`;
  if (costData && costData.totalCalls > 0) {
    const totalTokens = (costData.totalTokens?.input || 0) + (costData.totalTokens?.output || 0);
    output += `**Tokens:** ${totalTokens.toLocaleString()} (${(costData.totalTokens?.input || 0).toLocaleString()} in / ${(costData.totalTokens?.output || 0).toLocaleString()} out) | **Cost:** $${costData.totalCost.toFixed(4)}\n\n`;
  } else {
    output += `**Cost:** unavailable (no provider calls recorded)\n\n`;
  }

  // Reference to full log and session
  output += `📄 **Full discussion:** \`${logFilePath}\`\n`;
  if (sessionId) {
    output += `🔄 **Session ID:** \`${sessionId}\` (use llm_conclave_continue to follow up)\n`;
  }

  return output;
}

/**
 * Format discussion result as a structured JSON-serializable object (snake_case keys).
 * Used by format='json' and the REST API endpoint.
 */
function formatDiscussionResultJson(result: any, logFilePath: string, sessionId?: string): Record<string, any> {
  const {
    task,
    conversationHistory,
    solution,
    consensusReached,
    rounds,
    maxRounds,
    failedAgents = [],
    agentSubstitutions = {},
    keyDecisions = [],
    actionItems = [],
    dissent = [],
    confidence = 'MEDIUM',
    timedOut = false,
    degraded = false,
    degradedReason,
  } = result;

  // Extract participating agents (excluding failed, system, judge)
  const agents: Array<{ name: string; model?: string }> = [];
  if (conversationHistory?.length > 0) {
    const seen = new Set<string>();
    for (const msg of conversationHistory) {
      const speaker = msg.speaker;
      if (speaker && speaker !== 'System' && speaker !== 'Judge' && !msg.error && !seen.has(speaker)) {
        seen.add(speaker);
        agents.push({ name: speaker, model: msg.model });
      }
    }
  }

  // Use real CostTracker data from result.cost
  const costData = result.cost;

  // Failed agent details
  const failedDetails = result.failedAgentDetails || {};
  const failedAgentsList = failedAgents.map((name: string) => ({
    name,
    model: failedDetails[name]?.model,
    error: failedDetails[name]?.error,
  }));

  // Substitutions
  const substitutionsList = Object.entries(agentSubstitutions).map(([agent, sub]: [string, any]) => ({
    agent,
    original_model: sub.original,
    fallback_model: sub.fallback,
    reason: sub.reason,
  }));

  return {
    task,
    summary: solution || null,
    key_decisions: keyDecisions,
    action_items: actionItems,
    dissent,
    confidence: confidence.toLowerCase(),
    consensus_reached: consensusReached,
    rounds: { completed: rounds, max: maxRounds || rounds },
    agents,
    failed_agents: failedAgentsList.length > 0 ? failedAgentsList : undefined,
    substitutions: substitutionsList.length > 0 ? substitutionsList : undefined,
    timed_out: timedOut || undefined,
    degraded: degraded || undefined,
    degraded_reason: degradedReason || undefined,
    tokens: costData ? {
      input: costData.totalTokens?.input || 0,
      output: costData.totalTokens?.output || 0,
      total: (costData.totalTokens?.input || 0) + (costData.totalTokens?.output || 0),
    } : null,
    cost_usd: costData ? parseFloat(costData.totalCost.toFixed(4)) : null,
    session_id: sessionId || undefined,
    log_file: logFilePath,
  };
}

// ============================================================================
// Start Server
// ============================================================================

function getSSEPort(): number | null {
  // Check --sse flag with optional port: --sse or --sse 3100
  const sseIdx = process.argv.indexOf('--sse');
  if (sseIdx !== -1) {
    const nextArg = process.argv[sseIdx + 1];
    if (nextArg && !nextArg.startsWith('-')) {
      return parseInt(nextArg, 10);
    }
    return parseInt(process.env.MCP_SSE_PORT || '3100', 10);
  }
  // Check env var
  if (process.env.MCP_SSE_PORT) {
    return parseInt(process.env.MCP_SSE_PORT, 10);
  }
  return null;
}

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Conclave MCP Server running on stdio');
}

export async function startSSE(port: number) {
  const app = express();
  app.use(express.json());

  // Track active transports for cleanup
  const transports: Record<string, SSEServerTransport> = {};

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      transport: 'sse',
      activeSessions: Object.keys(transports).length,
    });
  });

  // SSE endpoint - client connects here to establish stream
  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    console.error(`SSE client connected: ${transport.sessionId}`);

    // SSE keep-alive: send comment every 15s to prevent proxy/client timeouts.
    // SSE spec allows lines starting with ':' as comments — ignored by clients
    // but keep the TCP connection alive through proxies and load balancers.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(':ping\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      } else {
        clearInterval(heartbeat);
      }
    }, 15_000);

    res.on('close', async () => {
      clearInterval(heartbeat);
      console.error(`SSE client disconnected: ${transport.sessionId}`);
      try {
        await transport.close();
      } catch (e) {
        console.error(`Error closing transport ${transport.sessionId}:`, e);
      }
      delete transports[transport.sessionId];
    });

    // Each SSE connection gets its own Server instance
    const server = createServer();
    await server.connect(transport);
  });

  // REST API endpoint — direct HTTP request/response, no MCP protocol overhead
  app.post('/api/discuss', async (req, res) => {
    // Optional API key auth via CONCLAVE_API_KEY env var
    const apiKey = process.env.CONCLAVE_API_KEY;
    if (apiKey) {
      const match = req.headers.authorization?.match(/^Bearer\s+(.+)$/);
      const provided = match?.[1];
      if (provided !== apiKey) {
        res.status(401).json({ success: false, error: 'Invalid or missing API key' });
        return;
      }
    }

    const args = req.body;
    if (!args || !args.task) {
      res.status(400).json({ success: false, error: 'Missing required field: task' });
      return;
    }

    // Disable Express default timeouts — discussions take 2-5 minutes
    req.setTimeout(0);
    res.setTimeout(0);

    // Validate numeric parameters (MCP tool schema does this automatically, REST does not)
    for (const field of ['rounds', 'min_rounds', 'timeout'] as const) {
      if (args[field] !== undefined && (typeof args[field] !== 'number' || !Number.isFinite(args[field]))) {
        res.status(400).json({ success: false, error: `${field} must be a finite number` });
        return;
      }
    }

    // For REST API, config must be inline JSON (not file paths) to prevent path traversal
    const configPath = args.config;
    if (configPath && typeof configPath === 'string' && !configPath.trimStart().startsWith('{')) {
      res.status(400).json({ success: false, error: 'REST API only accepts inline JSON for config parameter, not file paths' });
      return;
    }

    // Validate timeout sign before delegation (REST returns HTTP 400, not thrown error)
    if (args.timeout !== undefined && args.timeout < 0) {
      res.status(400).json({ success: false, error: 'timeout must be >= 0' });
      return;
    }

    try {
      const runner = new DiscussionRunner();

      // REST-specific: abort discussion if client disconnects (don't waste LLM API calls)
      // DiscussionRunner uses its own internal AbortController for timeout; client disconnect
      // is wired via a separate signal that DiscussionRunner merges.
      const clientAbort = new AbortController();
      req.on('close', () => {
        if (!res.writableFinished) {
          clientAbort.abort('client-disconnected');
          console.error('[REST] Client disconnected, aborting discussion');
        }
      });

      const onProgress = (event: { type: string; message: string }) => {
        console.error(`[REST] ${event.message}`);
      };

      const { result, sessionId, logFilePath } = await runner.run({
        task: args.task,
        config: args.config,
        projectPath: args.project,
        personas: args.personas,
        rounds: args.rounds ?? 4,
        minRounds: args.min_rounds ?? 2,
        dynamic: args.dynamic ?? false,
        selectorModel: args.selector_model ?? DEFAULT_SELECTOR_MODEL,
        judgeModel: args.judge_model,
        judgeInstructions: args.judge_instructions,
        timeout: args.timeout ?? 0,
        contextOptimization: args.context_optimization ?? false,
        onProgress,
        validateProjectPath: (p) => validatePath(p, process.cwd()),
        clientAbortSignal: clientAbort.signal,
      });

      const jsonResult = formatDiscussionResultJson(result, logFilePath, sessionId);
      res.json({ success: true, ...jsonResult });
    } catch (error: any) {
      console.error(`[REST] Error in /api/discuss:`, error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  });

  // Message endpoint - client POSTs messages here
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).json({ error: 'Unknown session ID' });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  const httpServer = http.createServer(app);
  httpServer.listen(port, () => {
    console.error(`LLM Conclave MCP Server running on http://localhost:${port}/sse`);
    console.error(`  SSE endpoint:     GET  http://localhost:${port}/sse`);
    console.error(`  Message endpoint: POST http://localhost:${port}/messages`);
    console.error(`  REST API:         POST http://localhost:${port}/api/discuss`);
    console.error(`  Health check:     GET  http://localhost:${port}/health`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.error('Shutting down SSE server...');
    for (const [sessionId, transport] of Object.entries(transports)) {
      try {
        await transport.close();
      } catch (e) {
        console.error(`Error closing session ${sessionId}:`, e);
      }
      delete transports[sessionId];
    }
    httpServer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  const ssePort = getSSEPort();
  if (ssePort) {
    await startSSE(ssePort);
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
