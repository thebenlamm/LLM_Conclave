# LLM Conclave - Planned Features & Roadmap

This document outlines potential features and enhancements for the LLM Conclave MCP server.

## Table of Contents

- [Recently Implemented](#recently-implemented)
- [High Priority](#high-priority)
- [User Experience](#user-experience)
- [Security & Governance](#security--governance)
- [Advanced Orchestration](#advanced-orchestration)
- [Performance & Analytics](#performance--analytics)
- [Quick Wins](#quick-wins)
- [Roadmap](#roadmap)

---

## Recently Implemented

### CLI Removal (Mar 2026)
**Status:** Completed
**Priority:** High

Removed all CLI-specific code. LLM Conclave is now MCP-only. Deleted `index.ts`, `src/commands/`, `src/cli/` (ModeDetector, ConsultConsoleLogger), `src/interactive/`, `src/init/`, `src/server/`, `src/templates/`. Moved `ConfigCascade` and `PersonaSystem` to `src/config/`. ~8,500 lines removed, 885 tests remain passing.

---

### Context Tax Optimization — Phase 1-3
**Status:** Implemented (commits `33596e3`, `d948619`, `93d70db`, `469aa68`, and prior)

Systematic context engineering to reduce LLM API token costs by 35-50%.

**Phase 1 — Quick Wins (35-45% cost reduction):**
- Anthropic prompt caching (90% discount on cached prefix)
- OpenAI/Grok stable prefix ordering (automatic 50-75% cache discount)
- 200K pricing cliff guard with accurate token counting
- Judge case-file format (U-shaped attention optimization)
- Tool schema thinning (30%+ prefix reduction)
- Cache-aware cost tracking with provider-specific cache discounts

**Phase 2 — Structural Improvements (additional 15-25%):**
- Tool output offloading via ArtifactStore (tool outputs > 2KB stored to disk)
- Judge discussion state extraction (structured positions/disagreements)
- Model routing for subtasks (gpt-4o-mini for summarization, validation)
- Two-step output pattern (scratchpad reasoning before structured verdict)
- System prompts moved to stable position for provider caching

**Phase 3 — Marginal Gains:**
- Instruction-based tool pruning for iterative/orchestrated modes (cache-safe)
- Anthropic context editing beta (auto-clears stale tool results at 50K tokens)
- Gemini explicit caching (75% input cost reduction at 50K+ tokens)

**Implementation:**
- `src/tools/ToolPruningInstructions.ts` — instruction-based tool restrictions per mode/phase
- `src/providers/GeminiCacheManager.ts` — session-scoped Gemini cache lifecycle management
- `src/providers/ClaudeProvider.ts` — context editing beta integration
- `src/providers/GeminiProvider.ts` — explicit cache support via `cachedContent` config
- `src/core/ArtifactStore.ts` — disk-backed tool output offloading
- `src/core/TaskRouter.ts` — subtask model routing
- `src/core/CostTracker.ts` — cache-aware cost calculations

**Design doc:** `docs/plans/2026-02-12-context-tax-optimization.md`

---

### Cost & Performance Tracking
**Status:** Implemented (commit 672180b)

Track API costs, token usage, and performance metrics across all providers.

**Implementation:** `src/core/CostTracker.ts`
- Per-provider cost tracking with up-to-date pricing
- Token usage breakdown (input/output per agent)
- Session cost summaries
- Latency and success rate metrics

**Future Enhancements:**
- Budget alerts and spend limits
- Cumulative project costs
- Export to CSV/JSON for analysis

---

### Automatic Retry with Exponential Backoff
**Status:** Implemented (commit 79b28b4)

**Implementation:** `src/providers/LLMProvider.ts`
- Detects retryable errors (network, 429, 503)
- Exponential backoff (1s, 2s, 4s)
- Max 3 attempts

---

### Iterative Mode Optimizations
**Status:** Implemented (commit 52fdf4e)

**Implementation:** `src/orchestration/IterativeCollaborativeOrchestrator.ts`
- Chunk size batching (84% fewer API calls)
- Sliding window context (75% token reduction)
- Optimized agent prompts
- Auto-planning for line-by-line tasks

---

### Streaming Output
**Status:** Implemented

All providers support streaming (OpenAI, Claude, Gemini, Grok, Mistral). Implemented in all orchestrators.

---

### Dynamic Speaker Selection
**Status:** Implemented (commit `9fc0986`)

LLM-based speaker selection instead of round-robin ordering.

**Implementation:** `src/core/SpeakerSelector.ts`
- LLM moderator analyzes conversation to choose next speaker
- Explicit handoff detection: `@AgentName` mentions, "I'd like to hear from X"
- Ping-pong loop prevention, handoff chain depth limiting, circuit breaker fallback

**MCP Usage:**
```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Design auth system",
    "dynamic": true,
    "selector_model": "gpt-4o-mini"
  }
}
```

---

### Session Continuation
**Status:** Implemented (commit `f38edb9`)

Continue previous discussions with follow-up questions.

**Implementation:** `src/core/SessionManager.ts`, `src/core/ContinuationHandler.ts`
- Sessions saved to `~/.llm-conclave/sessions/`
- MCP tools: `llm_conclave_continue`, `llm_conclave_sessions`
- Parent session linking for audit trail

---

### Structured Output & Devil's Advocate Mode
**Status:** Implemented (commit `b115231`)

**Implementation:** `src/core/ConversationManager.ts`, `src/mcp/server.ts`
- Output fields: `key_decisions`, `action_items`, `dissent`, `confidence`
- Devil's advocate mode detects shallow agreement

---

### Persona Aliases
**Status:** Implemented (commit `b115231`)

**Implementation:** `src/config/PersonaSystem.ts`
- 17 aliases: `arch`, `sec`, `perf`, `dev`, `ops`, `a11y`, `docs`, `devil`, etc.
- `resolveAlias()` method for consistent lookup

---

### Inline JSON Config
**Status:** Implemented (commit `95cbe56`)

Define custom agents directly in MCP tool parameters without a config file:

```json
{
  "config": "{\"agents\":{\"Expert\":{\"model\":\"claude-sonnet-4-5\",\"prompt\":\"...\"}}}"
}
```

---

## High Priority

### Resume/Checkpoint System

**Status:** Partially Implemented (basic resume only)
**Complexity:** High

Save conversation state and resume interrupted sessions.

**Still Missing:**
- Auto-save checkpoints every N rounds
- Resume by checkpoint ID
- Conversation history preservation
- Agent state restoration
- Branching: Try different approaches from same checkpoint
- Works in all modes (currently only iterative)

**Data Structure:**
```typescript
interface Checkpoint {
  id: string;
  timestamp: string;
  task: string;
  currentRound: number;
  conversationHistory: Message[];
  agentStates: Record<string, AgentState>;
  projectContext?: string;
  metadata: { tokensUsed: number; cost: number; duration: number; };
}
```

**Planned Storage:**
- SQLite database or `.conclave/checkpoints/` directory
- Compression for large conversations
- Configurable retention policy

---

## User Experience

### Structured Categorization Output (Beta Feedback)

**Status:** Not Started
**Priority:** Medium
**Source:** Beta feedback from discuss tool usage (Jan 2026)

**Problem:** When using discuss/consult for categorization tasks, the output is narrative text. Users must manually parse which concerns map to which categories.

**Proposed Solution:**
```typescript
interface CategorizationOutput {
  task: string;
  categories: Record<string, {
    items: string[];
    rationale: string;
    personaVotes: Record<string, 'agree' | 'disagree' | 'abstain'>;
  }>;
  consensus: boolean;
  dissent: string[];
}
```

**Usage via MCP:**
```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Categorize these concerns...",
    "format": "categorization"
  }
}
```

---

### Structured Artifact Outputs & Rich Transcripts

**Status:** Not Started
**Priority:** Medium

**Problem:** Outputs are plain text; downstream automation cannot easily consume agent artifacts.

**Value:** Improves interoperability with CI, docs pipelines, or ticketing systems.

**Features:**
- Multiple output formats (json, markdown, html) via MCP `format` parameter
- Per-round messages, tool calls, and validations
- Optional bundle with artifacts plus signed manifest
- Reproducibility via signed hashes

---

## Security & Governance

### Tool Permission Profiles & Sandboxing

**Status:** Not Started
**Priority:** High
**Complexity:** Medium-High

**Problem:** Tools in `ToolRegistry` run with full access; no scoped permissions or audit trail.

**Features:**
- `ToolPolicy` objects defining allowed paths, command whitelist, and rate limits per agent
- Dry-run mode that logs intended tool calls without executing
- Audit log entries for each execution with agent name, args, and result
- Sandboxed execution environment

**Implementation:**
```typescript
interface ToolPolicy {
  allowedPaths: string[];
  allowedCommands: string[];
  rateLimits: { maxCallsPerMinute: number; maxCallsPerSession: number; };
  requireApproval: boolean;
}
```

**Affected modules:** `src/tools/ToolRegistry.ts`, orchestrators

---

### Validation & Safety Gates Library

**Status:** Not Started
**Priority:** Medium

Pluggable validators (lint, test, security, format) with task classification selecting relevant validators. Results appended to final output.

---

## Advanced Orchestration

### Dynamic Turn Management
**Status:** Implemented (as Dynamic Speaker Selection - commit `9fc0986`)

See [Dynamic Speaker Selection](#dynamic-speaker-selection) above.

**Still Not Implemented:**
- Interrupt/Correction mode (agents requesting to speak out of turn)
- Priority queue for urgent contributions

---

### Voting Mechanisms

**Status:** Not Started
**Priority:** Medium

Explicit agent voting for decisions with weighted votes, consensus visualization, and tie-breaking strategies.

```typescript
interface Vote {
  agent: string;
  choice: string;
  confidence: number; // 0-1
  reasoning: string;
  weight?: number;
}
```

---

### Adversarial/Red Team Mode

**Status:** Not Started
**Priority:** Low

Dedicated adversary agents try to break solutions. "Attacker" agents look for vulnerabilities, "Defender" agents address concerns.

---

## Performance & Analytics

### Embedding-backed Project Memory & RAG

**Status:** Not Started
**Priority:** Medium
**Complexity:** High

Semantic search over code and conversation history using vector embeddings. Support projects with thousands of files via automatic chunking and retrieval.

**Affected modules:** `src/memory/MemoryManager.ts`, `src/memory/ProjectMemory.ts`, provider adapters for embedding models

---

### Multi-Project Knowledge Graph

**Status:** Not Started
**Priority:** Low

Cross-project insights — shared libs, repeated issues, pattern reuse across repositories.

---

### Agent Performance Analytics

**Status:** Not Started
**Priority:** Low

Track success rate, cost efficiency, and contribution quality per agent across sessions.

---

### Scenario Benchmarking & Model A/B Harness

**Status:** Not Started
**Priority:** Medium

Automated evaluation loop to compare providers/prompts across tasks. Define benchmark scenarios, run against agent presets, collect metrics.

---

### Streaming Event Channel

**Status:** Not Started
**Priority:** Medium

Emit structured events (JSON lines or SSE) for token chunks, round boundaries, tool executions, and judge decisions. Enables external dashboards and webhooks to mirror live progress.

**Affected modules:** `src/core/ConversationManager.ts`, `src/orchestration/`, `src/core/EventBus.ts`

---

### Parallel Agent Execution

**Status:** Not Started
**Priority:** Low
**Complexity:** High

Run independent agents in parallel for faster consensus. Challenges: message ordering, tool call conflicts, rate limiting across providers.

---

## Quick Wins

### 1. JSON Output Format
**Complexity:** Low
Already saving JSON internally — expose `format: "json"` parameter on MCP tools.

### 2. Model Aliases
**Complexity:** Low
User-defined model shortcuts in config (e.g., `"fast": "gpt-4o-mini"`).

### 3. Timeout Configuration
**Complexity:** Low
Configurable timeouts per agent/round via config or MCP parameters.

```json
{
  "timeouts": {
    "per_agent_response": 120,
    "per_round": 600,
    "total_session": 3600
  }
}
```

### 4. Dry Run / Cost Estimate
**Complexity:** Low
Show estimated cost and agent configuration without making API calls. Expose as MCP tool parameter.

---

## Roadmap

### Phase 1 (Completed)
- Multi-provider support (5 providers)
- Orchestration modes (Consensus, Orchestrated, Iterative)
- Tool support (file operations across all providers)
- Project context analysis
- Cost & performance tracking
- Automatic retry with exponential backoff
- Iterative mode optimizations (84% fewer API calls)
- Streaming output

### Phase 1.5 (Completed - Jan 2026)
- Dynamic speaker selection
- Session continuation (MCP tools)
- Structured output (key_decisions, action_items, dissent, confidence)
- Devil's advocate mode
- Persona aliases (17 shortcuts)
- Inline JSON config

### Phase 2 (Completed - Feb 2026)
- Context Tax Optimization (Phases 1-3)
  - Prompt caching (Anthropic, OpenAI, Gemini)
  - Tool output offloading (ArtifactStore)
  - Model routing for subtasks
  - Cache-aware cost tracking
  - Instruction-based tool pruning
  - Anthropic context editing beta
  - Gemini explicit caching

### Phase 2.5 (Completed - Mar 2026)
- CLI removal — MCP-only architecture
- Codebase simplification (~8,500 lines removed)

### Phase 3 (Next)
**Focus: Reliability & governance**
- Full checkpoint/resume system
- Tool permission profiles & sandboxing
- Budget alerts and spend limits
- Streaming event channel

### Phase 4 (Future)
**Focus: Scalability & intelligence**
- Embedding-backed memory & RAG for large codebases
- Structured artifact outputs
- Scenario benchmarking harness
- Parallel agent execution

### Phase 5 (Advanced)
**Focus: Advanced orchestration**
- MCP client support (consume external MCP tools)
- Red team/adversarial mode
- Agent performance analytics
- Multi-project knowledge graph
- Voting mechanisms

---

## Contributing

1. Check if an issue exists
2. Comment on the issue to claim it
3. Fork, implement, test
4. Submit PR with reference to issue

**Guidelines:**
- Follow existing code patterns
- Add TypeScript types
- Include tests

---

*Last Updated: March 22, 2026*
