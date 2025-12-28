---
project: llm_conclave
documentType: architecture
feature: consult-mode
created: 2025-12-27
status: in-progress
relatedDocuments:
  - product-brief-llm_conclave-2025-12-27.md
---

# Architecture Specification: LLM Conclave Consult Mode

**Project:** llm_conclave
**Feature:** Consult Mode (Multi-Model Fast Consultation)
**Created:** 2025-12-27
**Status:** In Progress

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Components](#system-components)
3. [Data Models & Types](#data-models--types)
4. [Execution Flow](#execution-flow)
5. [Output Formats](#output-formats)
6. [Logging & Persistence](#logging--persistence)
7. [Stats & Analytics](#stats--analytics)
8. [Integration Points](#integration-points)
9. [Performance Optimizations](#performance-optimizations)
10. [Error Handling](#error-handling)
11. [Configuration](#configuration)
12. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Interface                             │
│                  llm-conclave consult "question"                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Consult Command Handler                       │
│  - Parse args (--context, --project, --format, --quick, etc.)  │
│  - Load context (files, project, stdin)                         │
│  - Initialize ConsultOrchestrator                                │
│  - Format & display output                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ConsultOrchestrator                            │
│  - Initialize 3 agents (Security Expert, Architect, Pragmatist) │
│  - Execute consultation rounds (parallel + sequential)           │
│  - Synthesize consensus with confidence scoring                  │
│  - Track dissent & concerns                                      │
│  - Calculate costs & metrics                                     │
└────┬──────────────────────┬──────────────────────┬──────────────┘
     │                      │                      │
     ▼                      ▼                      ▼
┌──────────┐          ┌──────────┐          ┌──────────┐
│ Agent 1  │          │ Agent 2  │          │ Agent 3  │
│ Security │          │Architect │          │Pragmatist│
│ Claude   │          │  GPT-4o  │          │  Gemini  │
│ Sonnet   │          │          │          │  2.5 Pro │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │
     └──────────┬──────────┴──────────┬──────────┘
                │                     │
                ▼                     ▼
    ┌───────────────────┐   ┌─────────────────┐
    │  LLM Providers    │   │  Tool Registry  │
    │  (Existing)       │   │  (Existing)     │
    └───────────────────┘   └─────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ConsultLogger                               │
│  - Log consultation to ~/.llm-conclave/consult-logs/            │
│  - JSON-LD structured format                                     │
│  - Include: question, context, agents, responses, consensus,    │
│    costs, duration, timestamp                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ConsultStats                               │
│  - Read logs from ~/.llm-conclave/consult-logs/                │
│  - Compute metrics (usage, performance, cost, quality)          │
│  - Display dashboard (llm-conclave consult-stats)               │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Speed First:** Parallel execution where possible, time-boxed rounds
2. **Cost Awareness:** Track all token usage, display costs transparently
3. **Graceful Degradation:** If one agent fails, continue with remaining agents
4. **Simplicity:** Reuse existing infrastructure, minimal new abstractions
5. **Observability:** Log everything for analysis and debugging

---

## System Components

### 1. Consult Command (`src/commands/consult.ts`)

**Responsibility:** CLI interface, argument parsing, context loading, output formatting

**Interface:**
```typescript
// CLI command signature
llm-conclave consult [options] <question>

// Options:
--context <files>       // Comma-separated file paths
--project <path>        // Project root for auto-context
--format <type>         // Output format: markdown (default), json, both
--quick                 // Single round consultation (faster)
--verbose               // Show full agent conversation
--agents <list>         // Override default agents (future)
--help                  // Show help
```

**Implementation:**
```typescript
import { Command } from 'commander';
import { ConsultOrchestrator } from '../orchestration/ConsultOrchestrator';
import { ConsultLogger } from '../utils/ConsultLogger';
import { ProjectContext } from '../utils/ProjectContext';
import * as fs from 'fs';
import * as path from 'path';

export function registerConsultCommand(program: Command): void {
  program
    .command('consult <question>')
    .description('Fast multi-model consultation for decision-making')
    .option('-c, --context <files>', 'Comma-separated file paths for context')
    .option('-p, --project <path>', 'Project root for auto-context analysis')
    .option('-f, --format <type>', 'Output format: markdown, json, or both', 'markdown')
    .option('-q, --quick', 'Single round consultation (faster)', false)
    .option('-v, --verbose', 'Show full agent conversation', false)
    .action(async (question: string, options: ConsultOptions) => {
      try {
        // Load context
        const context = await loadContext(options);

        // Initialize orchestrator
        const orchestrator = new ConsultOrchestrator({
          maxRounds: options.quick ? 1 : 2,
          verbose: options.verbose
        });

        // Execute consultation
        const result = await orchestrator.consult(question, context);

        // Log result
        const logger = new ConsultLogger();
        await logger.log(result);

        // Format and display output
        displayOutput(result, options.format);

        // Show cost summary
        console.log(`\n💰 Cost: $${result.cost.usd.toFixed(4)} | ⏱️  Duration: ${result.duration_ms / 1000}s | 🎯 Confidence: ${(result.confidence * 100).toFixed(0)}%`);

      } catch (error) {
        console.error('❌ Consultation failed:', error.message);
        process.exit(1);
      }
    });
}

interface ConsultOptions {
  context?: string;
  project?: string;
  format: 'markdown' | 'json' | 'both';
  quick: boolean;
  verbose: boolean;
}

async function loadContext(options: ConsultOptions): Promise<string> {
  let context = '';

  // Explicit file context
  if (options.context) {
    const files = options.context.split(',').map(f => f.trim());
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      context += `\n\n### File: ${file}\n\n${content}`;
    }
  }

  // Project context
  if (options.project) {
    const projectContext = new ProjectContext(options.project);
    const analysis = await projectContext.analyze();
    context += `\n\n### Project Context\n\n${analysis.summary}`;
  }

  // Stdin context
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf-8');
    context += `\n\n### Stdin Input\n\n${stdin}`;
  }

  return context;
}

function displayOutput(result: ConsultationResult, format: string): void {
  if (format === 'json' || format === 'both') {
    console.log(JSON.stringify(result, null, 2));
  }

  if (format === 'markdown' || format === 'both') {
    console.log(formatMarkdown(result));
  }
}
```

---

### 2. ConsultOrchestrator (`src/orchestration/ConsultOrchestrator.ts`)

**Responsibility:** Core consultation logic, agent coordination, consensus synthesis

**Architecture:**
```typescript
export class ConsultOrchestrator {
  private agents: Agent[];
  private maxRounds: number;
  private verbose: boolean;

  constructor(options: ConsultOrchestratorOptions) {
    this.maxRounds = options.maxRounds || 2;
    this.verbose = options.verbose || false;

    // Initialize 3 fixed agents with diverse models
    this.agents = this.initializeAgents();
  }

  private initializeAgents(): Agent[] {
    return [
      {
        name: 'Security Expert',
        model: 'claude-sonnet-4.5',
        provider: ProviderFactory.create('claude-sonnet-4.5'),
        systemPrompt: this.getSecurityExpertPrompt()
      },
      {
        name: 'Architect',
        model: 'gpt-4o',
        provider: ProviderFactory.create('gpt-4o'),
        systemPrompt: this.getArchitectPrompt()
      },
      {
        name: 'Pragmatist',
        model: 'gemini-2.5-pro',
        provider: ProviderFactory.create('gemini-2.5-pro'),
        systemPrompt: this.getPragmatistPrompt()
      }
    ];
  }

  async consult(question: string, context: string): Promise<ConsultationResult> {
    const startTime = Date.now();
    const consultationId = generateId('consult');

    // Round 1: All agents respond in parallel
    const round1Responses = await this.executeRound1(question, context);

    // Round 2: Agents respond to each other (if maxRounds > 1)
    let round2Responses: AgentResponse[] = [];
    if (this.maxRounds > 1) {
      round2Responses = await this.executeRound2(question, round1Responses);
    }

    // Synthesize consensus
    const synthesis = await this.synthesizeConsensus(
      question,
      [...round1Responses, ...round2Responses]
    );

    // Calculate metrics
    const duration_ms = Date.now() - startTime;
    const cost = this.calculateCost([...round1Responses, ...round2Responses, synthesis]);

    return {
      consultation_id: consultationId,
      timestamp: new Date().toISOString(),
      question,
      context,
      agents: this.agents.map(a => ({ name: a.name, model: a.model })),
      rounds: this.maxRounds,
      responses: {
        round1: round1Responses,
        round2: round2Responses
      },
      consensus: synthesis.consensus,
      confidence: synthesis.confidence,
      recommendation: synthesis.recommendation,
      reasoning: synthesis.reasoning,
      concerns: synthesis.concerns,
      dissent: synthesis.dissent,
      perspectives: synthesis.perspectives,
      cost,
      duration_ms
    };
  }

  private async executeRound1(
    question: string,
    context: string
  ): Promise<AgentResponse[]> {
    // Execute all agents in parallel for speed
    const promises = this.agents.map(agent =>
      this.executeAgent(agent, question, context, [])
    );

    const responses = await Promise.all(promises);

    if (this.verbose) {
      console.log('\n=== Round 1 Responses ===');
      responses.forEach(r => {
        console.log(`\n${r.agentName}:\n${r.content}`);
      });
    }

    return responses;
  }

  private async executeRound2(
    question: string,
    round1Responses: AgentResponse[]
  ): Promise<AgentResponse[]> {
    // Each agent sees all Round 1 responses and can comment
    const othersResponses = round1Responses.map(r =>
      `${r.agentName}: ${r.content}`
    ).join('\n\n---\n\n');

    const round2Prompt = `
Given the question: "${question}"

Here are the other agents' initial perspectives:

${othersResponses}

Now provide your second opinion:
1. Do you agree or disagree with the other agents?
2. What concerns or risks do they may have missed?
3. What would you add to the discussion?

Be concise (2-3 paragraphs). Focus on what's different or additive to your first response.
`;

    const promises = this.agents.map(agent =>
      this.executeAgent(agent, round2Prompt, '', round1Responses)
    );

    const responses = await Promise.all(promises);

    if (this.verbose) {
      console.log('\n=== Round 2 Responses ===');
      responses.forEach(r => {
        console.log(`\n${r.agentName}:\n${r.content}`);
      });
    }

    return responses;
  }

  private async executeAgent(
    agent: Agent,
    prompt: string,
    context: string,
    previousResponses: AgentResponse[]
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const messages: Message[] = [
        {
          role: 'user',
          content: context ? `${context}\n\n---\n\n${prompt}` : prompt
        }
      ];

      const response = await agent.provider.sendMessage(
        messages,
        agent.systemPrompt
      );

      return {
        agentName: agent.name,
        model: agent.model,
        content: response.text,
        tokens: response.usage || { input: 0, output: 0, total: 0 },
        duration_ms: Date.now() - startTime
      };

    } catch (error) {
      // Graceful degradation: Return error response but don't fail entire consultation
      console.warn(`⚠️  Agent ${agent.name} failed: ${error.message}`);

      return {
        agentName: agent.name,
        model: agent.model,
        content: `[Agent unavailable: ${error.message}]`,
        tokens: { input: 0, output: 0, total: 0 },
        duration_ms: Date.now() - startTime,
        error: error.message
      };
    }
  }

  private async synthesizeConsensus(
    question: string,
    allResponses: AgentResponse[]
  ): Promise<ConsensusSynthesis> {
    // Use GPT-4o as judge for fast synthesis
    const judgeProvider = ProviderFactory.create('gpt-4o');

    const responseSummary = allResponses
      .filter(r => !r.error)
      .map(r => `${r.agentName} (${r.model}):\n${r.content}`)
      .join('\n\n---\n\n');

    const synthesisPrompt = `
You are synthesizing a multi-agent consultation on the following question:

"${question}"

Here are the agents' responses:

${responseSummary}

Your task is to synthesize their perspectives into a clear, actionable recommendation.

Provide your synthesis in the following JSON format:
{
  "consensus": "One sentence summary of the agreed-upon recommendation",
  "confidence": 0.0-1.0 (based on agreement level),
  "recommendation": "2-3 paragraph detailed explanation",
  "reasoning": {
    "security_expert": "Key points from security expert",
    "architect": "Key points from architect",
    "pragmatist": "Key points from pragmatist"
  },
  "concerns": ["concern 1", "concern 2"],
  "dissent": ["Any dissenting opinions or alternative approaches"],
  "perspectives": [
    {"agent": "Security Expert", "model": "claude-sonnet-4.5", "opinion": "brief summary"},
    {"agent": "Architect", "model": "gpt-4o", "opinion": "brief summary"},
    {"agent": "Pragmatist", "model": "gemini-2.5-pro", "opinion": "brief summary"}
  ]
}

IMPORTANT: Return ONLY the JSON object, no additional text.
`;

    const messages: Message[] = [{ role: 'user', content: synthesisPrompt }];
    const response = await judgeProvider.sendMessage(messages, 'You are a synthesis expert.');

    // Parse JSON response
    const synthesis = JSON.parse(response.text);

    // Add token usage
    synthesis.tokens = response.usage || { input: 0, output: 0, total: 0 };

    return synthesis;
  }

  private calculateCost(responses: AgentResponse[]): CostSummary {
    // Token costs per model (approximate, as of Dec 2025)
    const costs = {
      'claude-sonnet-4.5': { input: 0.003 / 1000, output: 0.015 / 1000 },
      'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
      'gemini-2.5-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 }
    };

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;

    for (const response of responses) {
      const modelCost = costs[response.model] || { input: 0.003 / 1000, output: 0.015 / 1000 };

      totalInputTokens += response.tokens.input;
      totalOutputTokens += response.tokens.output;
      totalCostUsd += (response.tokens.input * modelCost.input) +
                     (response.tokens.output * modelCost.output);
    }

    return {
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens
      },
      usd: totalCostUsd
    };
  }

  private getSecurityExpertPrompt(): string {
    return `You are a Security Expert specializing in threat modeling and vulnerability analysis.

Your role in consultations:
- Identify security risks and vulnerabilities
- Evaluate authentication, authorization, and data protection approaches
- Consider attack vectors and mitigation strategies
- Assess compliance and privacy implications

Be concise (2-3 paragraphs). Focus on actionable security recommendations.
If you disagree with other agents, explain why from a security perspective.`;
  }

  private getArchitectPrompt(): string {
    return `You are a Software Architect specializing in system design and scalability.

Your role in consultations:
- Evaluate architectural patterns and trade-offs
- Consider scalability, maintainability, and extensibility
- Assess technical debt implications
- Recommend best practices and design patterns

Be concise (2-3 paragraphs). Focus on long-term architectural implications.
If you disagree with other agents, explain your architectural reasoning.`;
  }

  private getPragmatistPrompt(): string {
    return `You are a Pragmatic Engineer focused on shipping and practical implementation.

Your role in consultations:
- Assess implementation complexity and time-to-ship
- Consider team capabilities and existing codebase constraints
- Balance ideal solutions with practical realities
- Identify simpler alternatives that deliver 80% of value with 20% effort

Be concise (2-3 paragraphs). Focus on what's practical and achievable.
If you disagree with other agents, explain your pragmatic concerns.`;
  }
}
```

---

### 3. ConsultLogger (`src/utils/ConsultLogger.ts`)

**Responsibility:** Persist consultation results to structured logs

**Implementation:**
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ConsultLogger {
  private logDir: string;

  constructor() {
    this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async log(result: ConsultationResult): Promise<void> {
    const filename = `${result.consultation_id}.json`;
    const filepath = path.join(this.logDir, filename);

    // Write JSON log
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

    // Also write markdown summary
    const markdownPath = path.join(this.logDir, `${result.consultation_id}.md`);
    fs.writeFileSync(markdownPath, this.formatMarkdown(result));

    // Update index (monthly aggregation)
    await this.updateIndex(result);
  }

  private async updateIndex(result: ConsultationResult): Promise<void> {
    const date = new Date(result.timestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const indexPath = path.join(this.logDir, `index-${monthKey}.json`);

    let index: ConsultationIndex = { month: monthKey, consultations: [] };

    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }

    index.consultations.push({
      id: result.consultation_id,
      timestamp: result.timestamp,
      question: result.question,
      duration_ms: result.duration_ms,
      cost_usd: result.cost.usd,
      confidence: result.confidence
    });

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  private formatMarkdown(result: ConsultationResult): string {
    return `# Consultation Summary

**Question:** ${result.question}
**Date:** ${new Date(result.timestamp).toLocaleString()}
**Confidence:** ${(result.confidence * 100).toFixed(0)}%

## Consensus

${result.consensus}

## Recommendation

${result.recommendation}

## Agent Perspectives

${result.perspectives.map(p => `
### ${p.agent} (${p.model})

${p.opinion}
`).join('\n')}

## Concerns Raised

${result.concerns.map(c => `- ${c}`).join('\n')}

${result.dissent.length > 0 ? `
## Dissenting Views

${result.dissent.map(d => `- ${d}`).join('\n')}
` : ''}

---

**Cost:** $${result.cost.usd.toFixed(4)} | **Duration:** ${(result.duration_ms / 1000).toFixed(1)}s | **Tokens:** ${result.cost.tokens.total.toLocaleString()}
`;
  }
}

interface ConsultationIndex {
  month: string;
  consultations: {
    id: string;
    timestamp: string;
    question: string;
    duration_ms: number;
    cost_usd: number;
    confidence: number;
  }[];
}
```

---

### 4. ConsultStats (`src/commands/consult-stats.ts`)

**Responsibility:** Read logs, compute metrics, display dashboard

**Implementation:**
```typescript
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function registerConsultStatsCommand(program: Command): void {
  program
    .command('consult-stats')
    .description('Show consultation statistics and metrics')
    .option('-m, --month <YYYY-MM>', 'Show stats for specific month')
    .option('-w, --week', 'Show stats for last 7 days')
    .option('-a, --all-time', 'Show all-time stats')
    .action(async (options) => {
      const stats = new ConsultStats();
      const metrics = await stats.compute(options);
      stats.display(metrics);
    });
}

class ConsultStats {
  private logDir: string;

  constructor() {
    this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
  }

  async compute(options: any): Promise<ConsultMetrics> {
    const consultations = await this.loadConsultations(options);

    if (consultations.length === 0) {
      return this.emptyMetrics();
    }

    return {
      total: consultations.length,
      dateRange: this.getDateRange(consultations),
      activeDays: this.countActiveDays(consultations),
      avgPerDay: this.avgPerDay(consultations),
      performance: this.computePerformanceMetrics(consultations),
      cost: this.computeCostMetrics(consultations),
      quality: this.computeQualityMetrics(consultations)
    };
  }

  private async loadConsultations(options: any): Promise<ConsultationResult[]> {
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('index-'));

    const consultations: ConsultationResult[] = [];

    for (const file of files) {
      const content = fs.readFileSync(path.join(this.logDir, file), 'utf-8');
      const consultation = JSON.parse(content);
      consultations.push(consultation);
    }

    // Filter by date range if specified
    return this.filterByDateRange(consultations, options);
  }

  display(metrics: ConsultMetrics): void {
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│  LLM Conclave Consult Stats                    │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log('│  Usage Metrics                                  │');
    console.log(`│  • Total Consultations: ${metrics.total.toString().padEnd(24)} │`);
    console.log(`│  • Active Days: ${metrics.activeDays}/${metrics.dateRange.totalDays} (${metrics.activeDays / metrics.dateRange.totalDays * 100}%)`.padEnd(50) + '│');
    console.log(`│  • Avg per Day: ${metrics.avgPerDay.toFixed(1)}`.padEnd(50) + '│');
    console.log('├─────────────────────────────────────────────────┤');
    console.log('│  Performance Metrics                            │');
    console.log(`│  • Median Response Time: ${(metrics.performance.p50 / 1000).toFixed(1)}s`.padEnd(50) + '│');
    console.log(`│  • p95 Response Time: ${(metrics.performance.p95 / 1000).toFixed(1)}s`.padEnd(50) + '│');
    console.log(`│  • p99 Response Time: ${(metrics.performance.p99 / 1000).toFixed(1)}s`.padEnd(50) + '│');
    console.log('├─────────────────────────────────────────────────┤');
    console.log('│  Cost Metrics                                   │');
    console.log(`│  • Total Cost: $${metrics.cost.total.toFixed(2)}`.padEnd(50) + '│');
    console.log(`│  • Avg per Consultation: $${metrics.cost.avgPerConsultation.toFixed(4)}`.padEnd(50) + '│');
    console.log(`│  • Total Tokens: ${metrics.cost.totalTokens.toLocaleString()}`.padEnd(50) + '│');
    console.log('└─────────────────────────────────────────────────┘');

    // Success indicators
    if (metrics.total >= 150 && metrics.activeDays >= 20) {
      console.log('\n✅ SUCCESS: You\'re using consult consistently!');
    }
    if (metrics.performance.p50 < 15000) {
      console.log('⚡ SPEED: Excellent response times (< 15s median)!');
    }
    if (metrics.cost.total < 20) {
      console.log('💰 COST: Within budget target (< $20/month)!');
    }
  }

  // ... additional helper methods
}
```

---

## Data Models & Types

```typescript
// Core consultation types
export interface ConsultationResult {
  consultation_id: string;
  timestamp: string;
  question: string;
  context: string;
  agents: { name: string; model: string }[];
  rounds: number;
  responses: {
    round1: AgentResponse[];
    round2: AgentResponse[];
  };
  consensus: string;
  confidence: number;
  recommendation: string;
  reasoning: {
    security_expert: string;
    architect: string;
    pragmatist: string;
  };
  concerns: string[];
  dissent: string[];
  perspectives: AgentPerspective[];
  cost: CostSummary;
  duration_ms: number;
}

export interface AgentResponse {
  agentName: string;
  model: string;
  content: string;
  tokens: TokenUsage;
  duration_ms: number;
  error?: string;
}

export interface AgentPerspective {
  agent: string;
  model: string;
  opinion: string;
}

export interface ConsensusSynthesis {
  consensus: string;
  confidence: number;
  recommendation: string;
  reasoning: Record<string, string>;
  concerns: string[];
  dissent: string[];
  perspectives: AgentPerspective[];
  tokens: TokenUsage;
}

export interface CostSummary {
  tokens: TokenUsage;
  usd: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface ConsultMetrics {
  total: number;
  dateRange: { start: string; end: string; totalDays: number };
  activeDays: number;
  avgPerDay: number;
  performance: {
    p50: number;
    p95: number;
    p99: number;
  };
  cost: {
    total: number;
    avgPerConsultation: number;
    totalTokens: number;
  };
  quality: {
    avgConfidence: number;
  };
}
```

---

## Execution Flow

### Consultation Sequence Diagram

```
User                 CLI                 Orchestrator        Agent1/2/3         Judge
 │                    │                       │                  │                │
 │ consult "Q"        │                       │                  │                │
 ├───────────────────>│                       │                  │                │
 │                    │ Load context          │                  │                │
 │                    │ (files/project/stdin) │                  │                │
 │                    ├──────────────────────>│                  │                │
 │                    │                       │                  │                │
 │                    │                       │ Round 1: Parallel│                │
 │                    │                       │ Execute          │                │
 │                    │                       ├─────────────────>│                │
 │                    │                       ├─────────────────>│                │
 │                    │                       ├─────────────────>│                │
 │                    │                       │<─────────────────┤                │
 │                    │                       │<─────────────────┤                │
 │                    │                       │<─────────────────┤                │
 │                    │                       │                  │                │
 │                    │                       │ Round 2: Sequential               │
 │                    │                       │ (agents see R1)  │                │
 │                    │                       ├─────────────────>│                │
 │                    │                       │<─────────────────┤                │
 │                    │                       ├─────────────────>│                │
 │                    │                       │<─────────────────┤                │
 │                    │                       ├─────────────────>│                │
 │                    │                       │<─────────────────┤                │
 │                    │                       │                  │                │
 │                    │                       │ Synthesize Consensus              │
 │                    │                       ├──────────────────────────────────>│
 │                    │                       │<──────────────────────────────────┤
 │                    │                       │                  │                │
 │                    │<──────────────────────┤                  │                │
 │                    │ Log result            │                  │                │
 │                    │ Display output        │                  │                │
 │<───────────────────┤                       │                  │                │
```

### Performance Timeline (Target)

```
0ms ────────────────────────────────────────────────────────────> 15000ms
│                                                                      │
│ Parse args (50ms)                                                   │
│ Load context (200ms)                                                │
│                                                                      │
│ Round 1: Parallel execution (5000-8000ms)                           │
│   Agent 1 ──────────────────────────────> (6s)                      │
│   Agent 2 ──────────────────────> (4.5s)                            │
│   Agent 3 ────────────────────────────────> (5.5s)                  │
│   Wait for slowest = 6s                                              │
│                                                                      │
│ Round 2: Parallel execution (5000-7000ms)                           │
│   Agent 1 ────────────────────> (4s)                                │
│   Agent 2 ──────────────────────────> (5s)                          │
│   Agent 3 ─────────────────────────────────> (6s)                   │
│   Wait for slowest = 6s                                              │
│                                                                      │
│ Judge synthesis (1000-2000ms)                                       │
│ Calculate costs (10ms)                                               │
│ Log result (50ms)                                                    │
│ Display output (100ms)                                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
Total: ~13.5 seconds (within < 15s target)
```

---

## Output Formats

### JSON Format

```json
{
  "consultation_id": "consult-abc123def456",
  "timestamp": "2025-12-27T14:32:15.000Z",
  "question": "Should we use OAuth 2.0 or JWT tokens for authentication?",
  "context": "### File: src/auth.ts\n...",
  "agents": [
    { "name": "Security Expert", "model": "claude-sonnet-4.5" },
    { "name": "Architect", "model": "gpt-4o" },
    { "name": "Pragmatist", "model": "gemini-2.5-pro" }
  ],
  "rounds": 2,
  "consensus": "Use OAuth 2.0 authorization flow with JWT access tokens for stateless authentication",
  "confidence": 0.85,
  "recommendation": "Implement OAuth 2.0 with JWT access tokens. This combines the security and flexibility of OAuth's authorization flow with the stateless benefits of JWTs. Use short-lived access tokens (15 min) with refresh tokens stored securely. Implement token rotation and revocation mechanisms.",
  "reasoning": {
    "security_expert": "OAuth 2.0 provides better security boundaries and standardized flows. JWT access tokens enable stateless validation but require careful key management and token expiry.",
    "architect": "JWT tokens enable horizontal scaling without session storage. OAuth 2.0 framework provides extensibility for future requirements (social login, API keys, etc.)",
    "pragmatist": "Implementation complexity is acceptable given long-term benefits. Many libraries available. Start with password grant for MVP, add social login later."
  },
  "concerns": [
    "Token refresh complexity requires careful implementation",
    "Session management overhead for refresh token storage",
    "Key rotation strategy needed for JWT signing keys"
  ],
  "dissent": [
    "Pragmatist suggests simpler session-based auth could be sufficient for MVP stage if user base is small"
  ],
  "perspectives": [
    {
      "agent": "Security Expert",
      "model": "claude-sonnet-4.5",
      "opinion": "OAuth 2.0 with JWT provides defense in depth. Token expiry limits breach impact. Refresh tokens allow revocation."
    },
    {
      "agent": "Architect",
      "model": "gpt-4o",
      "opinion": "Stateless JWT validation scales horizontally. OAuth framework future-proofs for API integrations and third-party auth."
    },
    {
      "agent": "Pragmatist",
      "model": "gemini-2.5-pro",
      "opinion": "OAuth + JWT is industry standard with good library support. Implementation time: 2-3 days. Consider simpler approach if timeline critical."
    }
  ],
  "cost": {
    "tokens": {
      "input": 8234,
      "output": 4219,
      "total": 12453
    },
    "usd": 0.0418
  },
  "duration_ms": 14200
}
```

### Markdown Format

```markdown
# Consultation Summary

**Question:** Should we use OAuth 2.0 or JWT tokens for authentication?
**Date:** 12/27/2025, 2:32:15 PM
**Confidence:** 85%

## Consensus

Use OAuth 2.0 authorization flow with JWT access tokens for stateless authentication

## Recommendation

Implement OAuth 2.0 with JWT access tokens. This combines the security and flexibility of OAuth's authorization flow with the stateless benefits of JWTs. Use short-lived access tokens (15 min) with refresh tokens stored securely. Implement token rotation and revocation mechanisms.

## Agent Perspectives

### Security Expert (claude-sonnet-4.5)

OAuth 2.0 with JWT provides defense in depth. Token expiry limits breach impact. Refresh tokens allow revocation.

### Architect (gpt-4o)

Stateless JWT validation scales horizontally. OAuth framework future-proofs for API integrations and third-party auth.

### Pragmatist (gemini-2.5-pro)

OAuth + JWT is industry standard with good library support. Implementation time: 2-3 days. Consider simpler approach if timeline critical.

## Concerns Raised

- Token refresh complexity requires careful implementation
- Session management overhead for refresh token storage
- Key rotation strategy needed for JWT signing keys

## Dissenting Views

- Pragmatist suggests simpler session-based auth could be sufficient for MVP stage if user base is small

---

**Cost:** $0.0418 | **Duration:** 14.2s | **Tokens:** 12,453
```

---

## Logging & Persistence

### Log Directory Structure

```
~/.llm-conclave/
└── consult-logs/
    ├── consult-abc123def456.json           # Full consultation result
    ├── consult-abc123def456.md             # Markdown summary
    ├── consult-xyz789ghi012.json
    ├── consult-xyz789ghi012.md
    ├── index-2025-12.json                  # Monthly index
    └── index-2025-01.json
```

### Monthly Index Format

```json
{
  "month": "2025-12",
  "consultations": [
    {
      "id": "consult-abc123def456",
      "timestamp": "2025-12-27T14:32:15.000Z",
      "question": "Should we use OAuth 2.0 or JWT tokens?",
      "duration_ms": 14200,
      "cost_usd": 0.0418,
      "confidence": 0.85
    },
    {
      "id": "consult-xyz789ghi012",
      "timestamp": "2025-12-27T16:45:22.000Z",
      "question": "Should we use PostgreSQL or MongoDB?",
      "duration_ms": 12800,
      "cost_usd": 0.0391,
      "confidence": 0.92
    }
  ]
}
```

---

## Stats & Analytics

### Metrics Computed

1. **Usage Metrics:**
   - Total consultations
   - Active days (days with at least 1 consultation)
   - Consultations per day (average)
   - Peak day (most consultations in single day)

2. **Performance Metrics:**
   - Response time distribution (p50, p75, p95, p99)
   - Failure rate (% of consultations with errors)
   - Average rounds per consultation

3. **Cost Metrics:**
   - Total cost (USD)
   - Average cost per consultation
   - Cost per changed decision (if quality tracking enabled)
   - Total tokens used
   - Cost by model breakdown

4. **Quality Metrics (Self-Reported, v1.1):**
   - Decision change rate (% that changed decision)
   - Blind spots found rate
   - Multi-model advantage rate
   - Speed satisfaction
   - Cost satisfaction

---

## Integration Points

### Existing Infrastructure

**Reuse from LLM Conclave:**

1. **Provider System** (`src/providers/`)
   - `ProviderFactory.ts` - Create providers by model name
   - `OpenAIProvider.ts`, `ClaudeProvider.ts`, `GeminiProvider.ts`, etc.
   - All provider integrations working

2. **Tool Support** (`src/tools/`)
   - `ToolRegistry.ts` - Tool definitions
   - Tool execution and format conversion
   - Not heavily used in consult mode (agents primarily reason, not execute tools)

3. **Project Context** (`src/utils/ProjectContext.ts`)
   - Analyze project structure
   - Extract relevant context
   - Reuse existing implementation

4. **Config System** (`src/cli/ConfigCascade.ts`)
   - Configuration resolution
   - Environment variable support
   - Reuse for consult-specific config

5. **Persona System** (`src/cli/PersonaSystem.ts`)
   - 10 built-in personas
   - Use Security Expert, Architect, Pragmatist for consult mode
   - Potential for user to override in future

### New Integration Points

**Consult-Specific Components:**

1. **ConsultOrchestrator** - New orchestration mode
   - Parallel execution (different from existing modes)
   - Fast consensus synthesis
   - Time-boxed rounds

2. **ConsultLogger** - New logging system
   - Separate from session logs
   - Structured for analytics
   - Monthly indexing

3. **ConsultStats** - New analytics command
   - Read consult-specific logs
   - Compute consult-specific metrics
   - Dashboard display

---

## Performance Optimizations

### 1. Parallel Agent Execution

**Problem:** Sequential execution of 3 agents = 3× latency
**Solution:** Execute all agents in parallel using `Promise.all()`

```typescript
// BEFORE (Sequential): 6s + 5s + 4.5s = 15.5s
const response1 = await executeAgent(agent1, ...);
const response2 = await executeAgent(agent2, ...);
const response3 = await executeAgent(agent3, ...);

// AFTER (Parallel): max(6s, 5s, 4.5s) = 6s
const responses = await Promise.all([
  executeAgent(agent1, ...),
  executeAgent(agent2, ...),
  executeAgent(agent3, ...)
]);
```

**Expected Speedup:** 3x for Round 1, 3x for Round 2 = ~50% total time reduction

---

### 2. Model Selection for Speed

**Fast Models (Prioritize):**
- Gemini 2.0 Flash - Fastest (2-4s typical)
- GPT-4o - Fast (3-5s typical)
- Claude Sonnet 4.5 - Balanced (4-6s typical)

**Avoid for Consult Mode:**
- Claude Opus 4.5 - Slow but high quality (8-12s)
- GPT-4 (non-turbo) - Slow
- Gemini 2.5 Pro - Moderate speed

**Configuration:**
```typescript
// Default agent config (optimized for speed)
const agents = [
  { name: 'Security Expert', model: 'claude-sonnet-4.5' },  // 4-6s
  { name: 'Architect', model: 'gpt-4o' },                  // 3-5s
  { name: 'Pragmatist', model: 'gemini-2.0-flash' }       // 2-4s
];
// Expected: ~6s (slowest agent)

// --fast flag (all flash models)
const fastAgents = [
  { name: 'Security Expert', model: 'claude-sonnet-4.5' },
  { name: 'Architect', model: 'gpt-4o-mini' },             // 2-3s
  { name: 'Pragmatist', model: 'gemini-2.0-flash' }
];
// Expected: ~4-5s (much faster, slightly lower quality)
```

---

### 3. Context Size Optimization

**Problem:** Large context = slow processing + high cost
**Solution:** Limit and warn

```typescript
function validateContextSize(context: string): void {
  const estimatedTokens = context.length / 4; // Rough estimate

  if (estimatedTokens > 10000) {
    console.warn(`⚠️  Large context detected (~${Math.round(estimatedTokens / 1000)}k tokens)`);
    console.warn('   This may slow response time and increase costs.');
    console.warn('   Consider providing only the most relevant files.');
  }

  if (estimatedTokens > 20000) {
    throw new Error('Context too large (> 20k tokens). Please reduce context size.');
  }
}
```

**Recommendations:**
- Soft limit: 10k tokens (warn)
- Hard limit: 20k tokens (error)
- Guidance: "Include 1-3 most relevant files"

---

### 4. Time-Boxed Rounds

**Problem:** Multi-round discussions could be infinite
**Solution:** Hard limit on rounds

```typescript
interface ConsultOrchestratorOptions {
  maxRounds: number; // Default: 2
  quickMode: boolean; // If true, maxRounds = 1
}

// --quick flag
llm-conclave consult --quick "question"
// Executes 1 round only, skips Round 2
// Expected: 40-50% faster (6s vs 12s)
```

---

### 5. Streaming Synthesis (Future Optimization)

**Problem:** Wait for all agents before starting synthesis
**Solution:** Start synthesis as agents complete

```typescript
// FUTURE: Stream-based synthesis
async function streamingSynthesize(agents: Agent[]): Promise<void> {
  const responses: AgentResponse[] = [];

  // Process responses as they arrive
  for await (const response of executeAgentsStreaming(agents)) {
    responses.push(response);

    // Can start partial synthesis with 2/3 responses
    if (responses.length >= 2) {
      startPartialSynthesis(responses);
    }
  }
}
```

**Expected Benefit:** Additional 10-20% speedup (not MVP)

---

## Error Handling

### Error Categories

1. **Agent Execution Errors**
   - Provider API errors (rate limits, timeouts, auth failures)
   - Model unavailable
   - Network issues

2. **Context Loading Errors**
   - File not found
   - Permission denied
   - Invalid file encoding

3. **Synthesis Errors**
   - Judge API failure
   - JSON parse error (malformed synthesis)

4. **Logging Errors**
   - Disk space full
   - Permission denied on log directory

### Error Handling Strategy

**Graceful Degradation:**
```typescript
async function executeAgent(agent: Agent, ...): Promise<AgentResponse> {
  try {
    // Execute agent
    const response = await agent.provider.sendMessage(...);
    return {
      agentName: agent.name,
      model: agent.model,
      content: response.text,
      tokens: response.usage,
      duration_ms: elapsed
    };
  } catch (error) {
    // Log error but continue with other agents
    console.warn(`⚠️  Agent ${agent.name} failed: ${error.message}`);

    return {
      agentName: agent.name,
      model: agent.model,
      content: `[Agent unavailable: ${error.message}]`,
      tokens: { input: 0, output: 0, total: 0 },
      duration_ms: elapsed,
      error: error.message
    };
  }
}

// Synthesis continues with remaining agents
const successfulResponses = allResponses.filter(r => !r.error);

if (successfulResponses.length === 0) {
  throw new Error('All agents failed. Unable to provide consultation.');
}

if (successfulResponses.length < 3) {
  console.warn(`⚠️  Only ${successfulResponses.length}/3 agents responded. Confidence may be lower.`);
}
```

**Retry Logic:**
```typescript
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
}
```

**Context Validation:**
```typescript
function validateContext(options: ConsultOptions): void {
  // File existence
  if (options.context) {
    const files = options.context.split(',');
    for (const file of files) {
      if (!fs.existsSync(file.trim())) {
        throw new Error(`Context file not found: ${file}`);
      }
    }
  }

  // Project directory
  if (options.project && !fs.existsSync(options.project)) {
    throw new Error(`Project directory not found: ${options.project}`);
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Model overrides (optional)
CONCLAVE_CONSULT_SECURITY_MODEL=claude-sonnet-4.5
CONCLAVE_CONSULT_ARCHITECT_MODEL=gpt-4o
CONCLAVE_CONSULT_PRAGMATIST_MODEL=gemini-2.5-pro

# Judge model
CONCLAVE_CONSULT_JUDGE_MODEL=gpt-4o

# Performance tuning
CONCLAVE_CONSULT_MAX_ROUNDS=2
CONCLAVE_CONSULT_TIMEOUT_MS=30000

# Cost controls
CONCLAVE_CONSULT_MAX_TOKENS_PER_AGENT=4000
CONCLAVE_CONSULT_WARN_COST_THRESHOLD=0.15
```

### Config File (`~/.config/llm-conclave/consult.json`)

```json
{
  "agents": {
    "security": {
      "name": "Security Expert",
      "model": "claude-sonnet-4.5",
      "systemPrompt": "You are a security expert..."
    },
    "architect": {
      "name": "Architect",
      "model": "gpt-4o",
      "systemPrompt": "You are a software architect..."
    },
    "pragmatist": {
      "name": "Pragmatist",
      "model": "gemini-2.5-pro",
      "systemPrompt": "You are a pragmatic engineer..."
    }
  },
  "judge": {
    "model": "gpt-4o"
  },
  "performance": {
    "maxRounds": 2,
    "timeoutMs": 30000,
    "maxContextTokens": 10000
  },
  "cost": {
    "warnThreshold": 0.15,
    "maxPerConsultation": 0.50
  }
}
```

---

## Testing Strategy

### Unit Tests

**Test Coverage:**

1. **ConsultOrchestrator**
   - Agent initialization
   - Parallel execution logic
   - Round 1 and Round 2 execution
   - Consensus synthesis
   - Cost calculation
   - Error handling (agent failures)

2. **ConsultLogger**
   - Log file creation
   - Index updates
   - Markdown formatting
   - Directory creation

3. **ConsultStats**
   - Metric computation
   - Date range filtering
   - Dashboard formatting

**Example Test:**
```typescript
describe('ConsultOrchestrator', () => {
  it('should execute agents in parallel for Round 1', async () => {
    const orchestrator = new ConsultOrchestrator({ maxRounds: 1 });
    const startTime = Date.now();

    const result = await orchestrator.consult(
      'Test question',
      'Test context'
    );

    const duration = Date.now() - startTime;

    // Should complete in ~6s (parallel), not ~18s (sequential)
    expect(duration).toBeLessThan(10000);
    expect(result.responses.round1).toHaveLength(3);
  });

  it('should handle agent failures gracefully', async () => {
    // Mock one provider to fail
    jest.spyOn(ProviderFactory, 'create').mockImplementation((model) => {
      if (model === 'claude-sonnet-4.5') {
        return new MockFailingProvider();
      }
      return actualProvider(model);
    });

    const orchestrator = new ConsultOrchestrator({ maxRounds: 1 });
    const result = await orchestrator.consult('Test', '');

    // Should still return result with 2/3 agents
    expect(result.responses.round1).toHaveLength(3);
    expect(result.responses.round1.filter(r => r.error)).toHaveLength(1);
    expect(result.responses.round1.filter(r => !r.error)).toHaveLength(2);
  });
});
```

### Integration Tests

**End-to-End Scenarios:**

1. **Full Consultation Flow**
   - Execute real consultation with test question
   - Verify log files created
   - Verify metrics computed correctly

2. **Context Loading**
   - Test --context flag with real files
   - Test --project flag with test project
   - Test stdin piping

3. **Output Formatting**
   - Test JSON output
   - Test Markdown output
   - Test --format both

4. **Stats Command**
   - Generate multiple consultations
   - Verify stats dashboard
   - Test date filtering

**Example Integration Test:**
```typescript
describe('Consult Command Integration', () => {
  it('should complete full consultation end-to-end', async () => {
    // Execute consult command
    const result = await executeCommand([
      'consult',
      '--context', './test-fixtures/sample.ts',
      '--format', 'json',
      'Should we use async/await or promises?'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"consultation_id"');
    expect(result.stdout).toContain('"consensus"');

    // Verify log file created
    const logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    const logFiles = fs.readdirSync(logDir);
    expect(logFiles.length).toBeGreaterThan(0);
  });
});
```

### Performance Tests

**Benchmarks:**

1. **Response Time**
   - Target: p50 < 15s
   - Measure actual response times with real providers
   - Identify slow agents/rounds

2. **Parallelization Verification**
   - Verify Round 1 executes in parallel (not sequential)
   - Measure speedup vs sequential execution

3. **Cost Tracking Accuracy**
   - Verify token counts match provider usage
   - Verify cost calculations correct

---

## Implementation Checklist

### Phase 1: Core Consultation (Days 1-5)

- [ ] Create `ConsultOrchestrator.ts`
  - [ ] Initialize 3 agents with diverse models
  - [ ] Implement Round 1 parallel execution
  - [ ] Implement Round 2 with agent cross-discussion
  - [ ] Implement consensus synthesis
  - [ ] Add cost calculation
  - [ ] Add error handling (graceful degradation)

- [ ] Create `consult.ts` command
  - [ ] CLI argument parsing
  - [ ] Context loading (--context, --project, stdin)
  - [ ] Orchestrator integration
  - [ ] Output formatting (JSON, Markdown)
  - [ ] Error display

- [ ] Test core functionality
  - [ ] Unit tests for orchestrator
  - [ ] Integration test for full flow
  - [ ] Manual testing with real LLM providers

### Phase 2: Tracking & Metrics (Days 6-8)

- [ ] Create `ConsultLogger.ts`
  - [ ] Log directory creation
  - [ ] JSON log writing
  - [ ] Markdown summary writing
  - [ ] Monthly index updates

- [ ] Create `consult-stats.ts` command
  - [ ] Log reading and parsing
  - [ ] Metric computation
  - [ ] Dashboard formatting
  - [ ] Date range filtering

- [ ] Test tracking
  - [ ] Verify logs created correctly
  - [ ] Verify stats computed accurately
  - [ ] Test with multiple consultations

### Phase 3: Polish & Documentation (Days 9-10)

- [ ] Performance optimization
  - [ ] Verify parallel execution working
  - [ ] Benchmark response times
  - [ ] Optimize context size handling

- [ ] Error handling improvements
  - [ ] Better error messages
  - [ ] Retry logic for transient failures
  - [ ] Validation for all inputs

- [ ] Documentation
  - [ ] CLI help text
  - [ ] README updates
  - [ ] Usage examples
  - [ ] Architecture documentation

- [ ] Nice-to-have features (if time)
  - [ ] --verbose mode
  - [ ] --quick mode
  - [ ] Stdin piping

### Phase 4: Validation (Weeks 3-4)

- [ ] Daily dogfooding
  - [ ] Use for real architectural decisions
  - [ ] Track metrics (usage, performance, cost)
  - [ ] Note friction points

- [ ] Weekly reviews
  - [ ] Stats review at 7 days
  - [ ] Quality assessment at 14 days
  - [ ] Iterate on pain points

- [ ] Day 30 Go/No-Go decision
  - [ ] Evaluate against success criteria
  - [ ] Decide: GO / PIVOT / NO-GO

---

## Next Steps

**Immediate Actions:**
1. ✅ Review architecture document with user
2. Create technical specification (API signatures, detailed interfaces)
3. Break down into implementation tasks
4. Begin Phase 1 implementation

**Open Questions to Resolve:**
1. Judge model: GPT-4o or Claude Opus 4.5?
2. Confidence scoring: Simple agreement or semantic similarity?
3. Context token limit: 10k soft or 5k hard?
4. Include verbose/quick/stdin modes in MVP or defer?

---

**STATUS:** ✅ READY FOR REVIEW

**Next Document:** Technical Specification (detailed API signatures, types, implementation tasks)

---

**END OF ARCHITECTURE SPECIFICATION**
