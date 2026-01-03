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
    description: 'Run a fast multi-model consultation (4-round debate). Get consensus from Security Expert (Claude), Architect (GPT-4o), and Pragmatist (Gemini) on technical decisions, architecture, security, or any question requiring diverse expert perspectives.',
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
    description: 'Run a democratic consensus discussion where all agents contribute equally. Best for brainstorming, exploring multiple perspectives, or collaborative problem-solving. Supports custom personas (security, performance, creative, etc.)',
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
          description: 'Comma-separated personas: security, performance, architect, creative, critical, pragmatic, qa, devops, accessibility, documentation',
        },
        rounds: {
          type: 'number',
          description: 'Number of discussion rounds',
          default: 3,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'llm_conclave_iterate',
    description: 'Run iterative collaborative mode where agents work through a task in chunks with multi-turn discussions per chunk. Best for line-by-line reviews, OCR correction, documentation improvement, or any task requiring detailed incremental work.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task to work on iteratively',
        },
        project: {
          type: 'string',
          description: 'Project context path (file or directory)',
        },
        chunkSize: {
          type: 'number',
          description: 'Number of units per chunk',
          default: 3,
        },
        maxRounds: {
          type: 'number',
          description: 'Max discussion rounds per chunk',
          default: 5,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'llm_conclave_stats',
    description: 'Get usage analytics including total consultations, costs, performance metrics (p50/p95/p99), success rates, and quality metrics. Useful for tracking budget and measuring value.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['week', 'month', 'all'],
          description: 'Time range for statistics',
          default: 'all',
        },
        format: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Output format',
          default: 'text',
        },
      },
    },
  },
  {
    name: 'llm_conclave_list_sessions',
    description: 'List recent consultation sessions with their questions, results, and costs. Useful for reviewing past decisions or resuming work.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of sessions to return',
          default: 10,
        },
        mode: {
          type: 'string',
          enum: ['consult', 'discuss', 'iterate', 'all'],
          description: 'Filter by mode',
          default: 'all',
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

      case 'llm_conclave_iterate':
        return await handleIterate(args as any);

      case 'llm_conclave_stats':
        return await handleStats(args as any);

      case 'llm_conclave_list_sessions':
        return await handleListSessions(args as any);

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
  rounds?: number;
}) {
  const { task, project: projectPath, personas, rounds = 3 } = args;

  // Resolve configuration
  const config = ConfigCascade.resolve({});

  // Apply personas if specified
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

  // Format output as markdown summary
  const summary = formatDiscussionResult(result);

  return {
    content: [
      {
        type: 'text',
        text: summary,
      },
    ],
  };
}

async function handleIterate(args: {
  task: string;
  project?: string;
  chunkSize?: number;
  maxRounds?: number;
}) {
  const { task, project: projectPath, chunkSize = 3, maxRounds = 5 } = args;

  // Note: Iterative mode requires IterativeCollaborativeOrchestrator
  // This is a simplified implementation - full implementation would need:
  // 1. Import IterativeCollaborativeOrchestrator
  // 2. Load project context
  // 3. Execute iteration
  // 4. Return formatted results

  return {
    content: [
      {
        type: 'text',
        text: 'Iterative mode implementation coming soon. Use llm_conclave_discuss or llm_conclave_consult for now.',
      },
    ],
  };
}

async function handleStats(args: { range?: string; format?: string }) {
  const { range = 'all', format = 'text' } = args;

  // Note: This requires StatsQuery implementation from Epic 3
  // Placeholder for now
  return {
    content: [
      {
        type: 'text',
        text: 'Stats implementation coming soon. This will show usage, cost, and performance metrics.',
      },
    ],
  };
}

async function handleListSessions(args: { limit?: number; mode?: string }) {
  const { limit = 10, mode = 'all' } = args;

  // Read from consult logs directory
  const logsDir = path.join(process.env.HOME || '', '.llm-conclave', 'consult-logs');

  if (!fs.existsSync(logsDir)) {
    return {
      content: [
        {
          type: 'text',
          text: 'No consultation logs found. Run your first consultation with llm_conclave_consult.',
        },
      ],
    };
  }

  // List JSON files
  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('consult-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  if (files.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'No sessions found.',
        },
      ],
    };
  }

  // Read and format sessions
  const sessions = files.map(file => {
    const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
    const session = JSON.parse(content);
    return {
      id: session.consultation_id || session.consultationId || file,
      question: session.question,
      confidence: session.confidence,
      cost: session.cost?.usd || session.cost,
      timestamp: session.timestamp,
    };
  });

  const output = sessions
    .map(
      (s, i) =>
        `${i + 1}. [${s.timestamp}] ${s.question}\n   Confidence: ${(s.confidence * 100).toFixed(0)}% | Cost: $${s.cost?.toFixed(3) || 'N/A'}`
    )
    .join('\n\n');

  return {
    content: [
      {
        type: 'text',
        text: `Recent Sessions (${sessions.length}):\n\n${output}`,
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

function formatDiscussionResult(result: any): string {
  const { task, conversationHistory, finalResult, agents, cost } = result;

  let output = `# Discussion Result\n\n`;
  output += `**Task:** ${task}\n\n`;
  output += `## Agent Contributions\n\n`;

  // Extract agent messages
  const agentMessages = conversationHistory.filter((m: any) => m.role === 'assistant');

  for (const agent of Object.keys(agents)) {
    const messages = agentMessages.filter((m: any) => m.name === agent);
    if (messages.length > 0) {
      output += `### ${agent}\n\n`;
      output += messages.map((m: any) => m.content).join('\n\n');
      output += '\n\n';
    }
  }

  if (finalResult) {
    output += `## Final Synthesis\n\n${finalResult}\n\n`;
  }

  if (cost) {
    output += `---\n**Cost:** $${cost.totalCost?.toFixed(3)} | **Tokens:** ${cost.totalTokens}\n`;
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
