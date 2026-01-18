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
          description: 'Custom agent configuration. Can be either:\n1. File path to .llm-conclave.json\n2. Inline JSON string: \'{"agents":{"Expert":{"model":"claude-sonnet-4-5","prompt":"You are..."}}}\'\n\nInline JSON is useful for one-off custom personas without creating a config file.',
        },
        rounds: {
          type: 'number',
          description: 'Number of discussion rounds. Use 2-3 for quick decisions, 4-5 for complex topics. Default: 4',
          default: 4,
        },
      },
      required: ['task'],
    },
  },
  // NOTE: llm_conclave_iterate and llm_conclave_stats removed - not yet implemented
  // Will be added back when functionality is complete
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

      // NOTE: iterate and stats cases removed - not yet implemented

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
}) {
  const { task, project: projectPath, personas, config: configPath, rounds = 4 } = args;

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

  // Format brief summary for MCP response (keeps context small)
  const summary = formatDiscussionResult(result, logFilePath);

  return {
    content: [
      {
        type: 'text',
        text: summary,
      },
    ],
  };
}

// NOTE: handleIterate, handleStats, and handleListSessions removed
// These tools are not yet fully implemented and were removed from the MCP interface
// to avoid confusing other Claude instances. Will be re-added when complete.

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
function formatDiscussionResult(result: any, logFilePath: string): string {
  const { task, conversationHistory, solution, consensusReached, rounds, maxRounds, failedAgents = [] } = result;

  let output = `# Discussion Summary\n\n`;
  output += `**Task:** ${task}\n\n`;

  // Clearer rounds display showing actual/max
  const roundsDisplay = consensusReached
    ? `${rounds}/${maxRounds || rounds} (consensus reached early)`
    : `${rounds}/${maxRounds || rounds}`;
  output += `**Rounds:** ${roundsDisplay} | **Consensus:** ${consensusReached ? 'Yes' : 'No'}\n\n`;

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
    output += `## Recommendation\n\n${solution}\n\n`;
  } else {
    output += `*No final solution reached*\n\n`;
  }

  // Estimate cost based on conversation length (rough heuristic)
  // ~750 tokens per message average, $0.003/1k input, $0.015/1k output
  const msgCount = conversationHistory?.length || 0;
  const estimatedTokens = msgCount * 750;
  const estimatedCost = (estimatedTokens * 0.003 / 1000) + (estimatedTokens * 0.015 / 1000);
  output += `---\n\n`;
  output += `**Est. tokens:** ~${estimatedTokens.toLocaleString()} | **Est. cost:** ~$${estimatedCost.toFixed(3)}\n\n`;

  // Reference to full log
  output += `📄 **Full discussion:** \`${logFilePath}\`\n`;

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
