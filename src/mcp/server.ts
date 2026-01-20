#!/usr/bin/env node

/**
 * LLM Conclave MCP Server
 *
 * Exposes llm_conclave's multi-agent consultation capabilities as MCP tools.
 * This allows any MCP-compatible AI assistant (Claude Desktop, Cursor, VS Code, etc.)
 * to invoke consultations as part of their workflow.
 */

// Set MCP mode flag BEFORE any other imports
// This prevents interactive prompts from hanging (stdin is used for MCP protocol)
process.env.LLM_CONCLAVE_MCP = '1';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator.js';
import ConversationManager from '../core/ConversationManager.js';
import SessionManager from '../core/SessionManager.js';
import ContinuationHandler from '../core/ContinuationHandler.js';
import ProviderFactory from '../providers/ProviderFactory.js';
import ProjectContext from '../utils/ProjectContext.js';
import ConsultLogger from '../utils/ConsultLogger.js';
import { ConfigCascade } from '../cli/ConfigCascade.js';
import { PersonaSystem } from '../cli/PersonaSystem.js';
import { FormatterFactory } from '../consult/formatting/FormatterFactory.js';
import { OutputFormat } from '../types/consult.js';

// Initialize MCP server
const server = new Server(
  {
    name: 'llm-conclave',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
  {
    name: 'llm_conclave_consult',
    description: 'Run a structured 4-phase consultation (positions → synthesis → debate → resolution). Uses fixed expert panel: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini). Faster but less customizable than discuss. Use llm_conclave_discuss when you need specific personas or deeper analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question or problem to consult on',
        },
        context: {
          type: 'string',
          description: 'Optional context: file paths (comma-separated) or project directory path',
        },
        quick: {
          type: 'boolean',
          description: 'Use quick mode (single round, faster but less thorough)',
          default: false,
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'both'],
          description: 'Output format',
          default: 'markdown',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'llm_conclave_discuss',
    description: 'Run a free-form multi-round discussion where agents debate and build on each other\'s ideas. RECOMMENDED for complex decisions - produces more thorough analysis than structured consult. Best for architecture, build-vs-buy, security review, or any decision needing diverse expert perspectives.',
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
          description: 'Maximum number of discussion rounds. Use 2-3 for quick decisions, 4-5 for complex topics. Default: 4',
          default: 4,
        },
        min_rounds: {
          type: 'number',
          description: 'Minimum rounds before consensus can end the discussion early. Consensus detection is disabled until this round completes. Example: min_rounds=4 with rounds=5 means consensus CAN end at round 4, skipping round 5. Set min_rounds equal to rounds for guaranteed full debate with no early exit. Default: 0 (no minimum)',
          default: 0,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'llm_conclave_continue',
    description: 'Continue a previous discussion session with a follow-up question or task. Use this to build on previous conversations without starting from scratch.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to continue. Omit to use most recent session.',
        },
        task: {
          type: 'string',
          description: 'Follow-up question or task to continue the discussion with.',
        },
        reset: {
          type: 'boolean',
          description: 'If true, start fresh with only a summary of the previous session (for token limits). Default: false',
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
          description: 'Maximum number of sessions to return. Default: 10',
          default: 10,
        },
        mode: {
          type: 'string',
          enum: ['consensus', 'orchestrated', 'iterative'],
          description: 'Filter by discussion mode.',
        },
      },
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

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
        return await handleConsult(args as any);

      case 'llm_conclave_discuss':
        return await handleDiscuss(args as any);

      case 'llm_conclave_continue':
        return await handleContinue(args as any);

      case 'llm_conclave_sessions':
        return await handleSessions(args as any);

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

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleConsult(args: {
  question: string;
  context?: string;
  quick?: boolean;
  format?: string;
}) {
  const { question, context: contextPath, quick = false, format = 'markdown' } = args;

  // Load context if provided
  let context = '';
  if (contextPath) {
    context = await loadContextFromPath(contextPath);
  }

  // Initialize orchestrator
  const orchestrator = new ConsultOrchestrator({
    maxRounds: quick ? 1 : 4,
    verbose: false,
  });

  // Execute consultation (this is asynchronous and may take time)
  const result = await orchestrator.consult(question, context);

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
}) {
  const { task, project: projectPath, personas, config: configPath, rounds = 4, min_rounds = 0 } = args;

  // Resolve configuration with optional custom config path
  const config = ConfigCascade.resolve({ config: configPath });

  // Apply personas if specified (supports built-in, custom, and persona sets)
  if (personas) {
    const personaList = PersonaSystem.getPersonas(personas);
    const personaAgents = PersonaSystem.personasToAgents(personaList);

    config.agents = {};
    for (const [name, agent] of Object.entries(personaAgents) as [string, any][]) {
      config.agents[name] = {
        model: agent.model,
        prompt: agent.systemPrompt,
      };
    }
  }

  config.max_rounds = rounds;

  // Validate min_rounds: must be non-negative integer and <= max_rounds
  const validatedMinRounds = Math.max(0, Math.floor(min_rounds || 0));
  if (validatedMinRounds > rounds) {
    throw new Error(`min_rounds (${validatedMinRounds}) cannot exceed rounds (${rounds})`);
  }
  config.min_rounds = validatedMinRounds;

  // Load project context if specified
  let projectContext = null;
  if (projectPath) {
    projectContext = new ProjectContext(projectPath);
    await projectContext.load();
  }

  // Create judge
  const judge = {
    provider: ProviderFactory.createProvider(config.judge.model),
    systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.',
  };

  // Run conversation (no streaming for MCP)
  const conversationManager = new ConversationManager(config, null, false);
  const result = await conversationManager.startConversation(task, judge, projectContext);

  // Save full discussion to file (preserves all agent contributions)
  const logFilePath = saveFullDiscussion(result);

  // Save session for potential continuation
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

  // Format brief summary for MCP response (keeps context small)
  const summary = formatDiscussionResult(result, logFilePath, sessionId);

  return {
    content: [
      {
        type: 'text',
        text: summary,
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
}) {
  const { session_id, task, reset = false } = args;
  const sessionManager = new SessionManager();
  const continuationHandler = new ContinuationHandler();

  // Load session (most recent if no ID provided)
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

  // Validate session is resumable
  const validation = continuationHandler.validateResumable(session);
  if (!validation.isValid) {
    throw new Error(`Cannot resume session: ${validation.warnings.join(', ')}`);
  }

  // Prepare continuation context
  const prepared = continuationHandler.prepareForContinuation(session, task, {
    resetDiscussion: reset,
    includeFullHistory: !reset,
  });

  // Rebuild config from session
  const config: any = {
    max_rounds: session.maxRounds || 4,
    min_rounds: 0,
    agents: {},
    judge: {
      model: session.judge?.model || 'gpt-4o',
      prompt: session.judge?.systemPrompt || 'You are a judge evaluating agent responses.',
    },
  };

  // Reconstruct agents from session
  for (const agent of session.agents) {
    config.agents[agent.name] = {
      model: agent.model,
      prompt: agent.systemPrompt,
    };
  }

  // Create judge
  const judge = {
    provider: ProviderFactory.createProvider(config.judge.model),
    systemPrompt: config.judge.prompt,
  };

  // Run continuation conversation
  const conversationManager = new ConversationManager(config, null, false);

  // Inject previous history before starting
  for (const msg of prepared.mergedHistory) {
    conversationManager.conversationHistory.push({
      role: msg.role,
      content: msg.content,
      speaker: msg.speaker || (msg.role === 'user' ? 'System' : 'Assistant'),
    });
  }

  // Start continuation with the new task
  const result = await conversationManager.startConversation(prepared.newTask, judge, null);

  // Save as new session with parent reference
  const agents = Object.entries(config.agents).map(([name, agentConfig]: [string, any]) => ({
    name,
    model: agentConfig.model,
    systemPrompt: agentConfig.prompt || '',
    provider: ProviderFactory.createProvider(agentConfig.model),
  }));
  const newSession = sessionManager.createSessionManifest(
    'consensus',
    task,
    agents,
    result.conversationHistory,
    result,
    judge
  );
  // Link to parent session
  (newSession as any).parentSessionId = session.id;
  const newSessionId = await sessionManager.saveSession(newSession);

  // Save discussion log
  const logFilePath = saveFullDiscussion(result);

  // Format response
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

// ============================================================================
// Helper Functions
// ============================================================================

async function loadContextFromPath(contextPath: string): Promise<string> {
  let context = '';

  // Check if it's comma-separated files
  if (contextPath.includes(',')) {
    const files = contextPath.split(',').map(f => f.trim());

    for (const file of files) {
      if (!fs.existsSync(file)) {
        throw new Error(`Context file not found: ${file}`);
      }

      const content = fs.readFileSync(file, 'utf-8');
      const fileName = path.basename(file);
      context += `\n\n### File: ${fileName}\n\n${content}`;
    }
  }
  // Otherwise treat as project directory
  else if (fs.existsSync(contextPath)) {
    if (fs.statSync(contextPath).isDirectory()) {
      const projectContext = new ProjectContext(contextPath);
      await projectContext.load();
      context = projectContext.formatContext();
    } else {
      // Single file
      const content = fs.readFileSync(contextPath, 'utf-8');
      const fileName = path.basename(contextPath);
      context = `### File: ${fileName}\n\n${content}`;
    }
  } else {
    throw new Error(`Context path not found: ${contextPath}`);
  }

  return context;
}

/**
 * Save full discussion to log file and return the file path
 */
function saveFullDiscussion(result: any): string {
  const { task, conversationHistory, solution, consensusReached, rounds, maxRounds, failedAgents = [] } = result;

  const logsDir = path.join(process.env.HOME || '', '.llm-conclave', 'discuss-logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `discuss-${timestamp}.md`;
  const filePath = path.join(logsDir, filename);

  // Build full discussion log
  let fullLog = `# Discussion Log\n\n`;
  fullLog += `**Task:** ${task}\n\n`;
  fullLog += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  // Clearer rounds display
  const roundsDisplay = consensusReached
    ? `${rounds}/${maxRounds || rounds} (consensus reached early)`
    : `${rounds}/${maxRounds || rounds}`;
  fullLog += `**Rounds:** ${roundsDisplay} | **Consensus:** ${consensusReached ? 'Yes' : 'No'}\n\n`;

  // Report failed agents
  if (failedAgents.length > 0) {
    fullLog += `**⚠️ Unavailable Agents:** ${failedAgents.join(', ')}\n\n`;
  }

  fullLog += `---\n\n`;

  if (conversationHistory && conversationHistory.length > 0) {
    fullLog += `## Full Discussion\n\n`;

    // Group messages by speaker
    const speakerMessages: Record<string, string[]> = {};
    for (const msg of conversationHistory) {
      const speaker = msg.speaker || msg.name || 'Unknown';
      if (speaker === 'System' || speaker === 'Judge') continue;
      if (!speakerMessages[speaker]) {
        speakerMessages[speaker] = [];
      }
      speakerMessages[speaker].push(msg.content);
    }

    // Output each agent's contributions
    for (const [speaker, messages] of Object.entries(speakerMessages)) {
      fullLog += `### ${speaker}\n\n`;
      fullLog += messages.join('\n\n---\n\n');
      fullLog += '\n\n';
    }
  }

  if (solution) {
    fullLog += `## Final Solution\n\n${solution}\n\n`;
  }

  fs.writeFileSync(filePath, fullLog, 'utf-8');
  return filePath;
}

/**
 * Format a brief summary for MCP response (keeps context small)
 */
function formatDiscussionResult(result: any, logFilePath: string, sessionId?: string): string {
  const {
    task,
    conversationHistory,
    solution,
    consensusReached,
    rounds,
    maxRounds,
    failedAgents = [],
    keyDecisions = [],
    actionItems = [],
    dissent = [],
    confidence = 'MEDIUM'
  } = result;

  let output = `# Discussion Summary\n\n`;
  output += `**Task:** ${task}\n\n`;

  // Clearer rounds display showing actual/max
  const roundsDisplay = consensusReached
    ? `${rounds}/${maxRounds || rounds} (consensus reached early)`
    : `${rounds}/${maxRounds || rounds}`;
  output += `**Rounds:** ${roundsDisplay} | **Consensus:** ${consensusReached ? 'Yes' : 'No'} | **Confidence:** ${confidence}\n\n`;

  // List participating agents (excluding failed ones)
  if (conversationHistory && conversationHistory.length > 0) {
    const speakers = new Set<string>();
    for (const msg of conversationHistory) {
      const speaker = msg.speaker || msg.name || 'Unknown';
      if (speaker !== 'System' && speaker !== 'Judge' && !msg.error) {
        speakers.add(speaker);
      }
    }
    output += `**Agents:** ${Array.from(speakers).join(', ')}\n\n`;
  }

  // Report failed agents prominently
  if (failedAgents.length > 0) {
    output += `**⚠️ Unavailable:** ${failedAgents.join(', ')} (API errors)\n\n`;
  }

  // Final solution/recommendation (the key output)
  if (solution) {
    output += `## Summary\n\n${solution}\n\n`;
  } else {
    output += `*No final solution reached*\n\n`;
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

  // Estimate cost based on conversation length (rough heuristic)
  // ~750 tokens per message average, $0.003/1k input, $0.015/1k output
  const msgCount = conversationHistory?.length || 0;
  const estimatedTokens = msgCount * 750;
  const estimatedCost = (estimatedTokens * 0.003 / 1000) + (estimatedTokens * 0.015 / 1000);
  output += `---\n\n`;
  output += `**Est. tokens:** ~${estimatedTokens.toLocaleString()} | **Est. cost:** ~$${estimatedCost.toFixed(3)}\n\n`;

  // Reference to full log and session
  output += `📄 **Full discussion:** \`${logFilePath}\`\n`;
  if (sessionId) {
    output += `🔄 **Session ID:** \`${sessionId}\` (use llm_conclave_continue to follow up)\n`;
  }

  return output;
}

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Conclave MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
