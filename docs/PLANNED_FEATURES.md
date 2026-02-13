# LLM Conclave - Planned Features & Roadmap

This document outlines potential features and enhancements for future development, combining strategic vision with implementation details.

## Table of Contents

- [Recently Implemented](#recently-implemented) *(Feb 2026 additions)*
- [High Priority](#high-priority)
- [User Experience](#user-experience)
- [Security & Governance](#security--governance)
- [Advanced Orchestration](#advanced-orchestration)
- [Performance & Analytics](#performance--analytics)
- [Developer Tools](#developer-tools)
- [Quick Wins](#quick-wins)
- [Roadmap](#roadmap)

---

## Recently Implemented

### ✅ Context Tax Optimization — Phase 1-3
**Status:** Implemented (commits `33596e3`, `d948619`, `93d70db`, `469aa68`, and prior)
**Priority:** High
**Complexity:** High

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
- Gemini explicit caching (`--gemini-cache` flag, 75% input cost reduction at 50K+ tokens)

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

### ✅ Cost & Performance Tracking
**Status:** Implemented (commit 672180b)
**Priority:** High
**Complexity:** Medium

Track API costs, token usage, and performance metrics across all providers.

**Implementation:** `src/core/CostTracker.ts`
- Per-provider cost tracking with up-to-date pricing
- Token usage breakdown (input/output per agent)
- Session cost summaries
- Latency and success rate metrics
- Success/failure tracking

**Future Enhancements:**
- Budget alerts and spend limits
- Cumulative project costs
- Export to CSV/JSON for analysis
- Monthly spend tracking

---

### ✅ Automatic Retry with Exponential Backoff
**Status:** Implemented (commit 79b28b4)
**Priority:** High
**Complexity:** Low

Automatic retry logic for transient network errors and rate limits.

**Implementation:** `src/providers/LLMProvider.ts`
- Detects retryable errors (network, 429, 503)
- Exponential backoff (1s, 2s, 4s)
- Max 3 attempts
- User-friendly console feedback

---

### ✅ Iterative Mode Optimizations
**Status:** Implemented (commit 52fdf4e)
**Priority:** High
**Complexity:** Medium

Major performance improvements for iterative collaborative mode.

**Implementation:** `src/orchestration/IterativeCollaborativeOrchestrator.ts`
- Chunk size batching (84% fewer API calls)
- Sliding window context (75% token reduction)
- Optimized agent prompts
- Auto-planning for line-by-line tasks

---

### ✅ Streaming Output (Real-time)
**Status:** Implemented
**Priority:** High
**Complexity:** Medium

Display agent responses as they're generated instead of waiting for completion.

**Implementation:** Available across all modes via `--stream` flag
- All providers support streaming (OpenAI, Claude, Gemini, Grok, Mistral)
- Implemented in all orchestrators (Consensus, Orchestrated, Iterative)
- Real-time token-by-token display
- Works with tool calling (buffered appropriately)

**Usage:**
```bash
llm-conclave --stream "Design a microservices architecture"
llm-conclave --stream --project ./src "Review and explain this codebase"
```

**Behavior:**
- Without `--stream`: Agents complete their full response, then it's displayed all at once
- With `--stream`: Agent responses appear word-by-word in real-time as they're generated

**Future Enhancement:** Streaming Event Channel for external UIs & webhooks (not yet implemented)

---

### ✅ Dynamic Speaker Selection
**Status:** Implemented (commit `9fc0986`)
**Priority:** Medium
**Complexity:** High

LLM-based speaker selection instead of round-robin ordering.

**Implementation:** `src/core/SpeakerSelector.ts`
- LLM moderator analyzes conversation to choose next speaker
- Explicit handoff detection: `@AgentName` mentions, "I'd like to hear from X"
- **Robustness protections:**
  - Ping-pong loop prevention (A→B→A blocked)
  - Handoff chain depth limiting (max 3 consecutive handoffs)
  - Negative context filtering ("don't pass to X" ignored)
  - Circuit breaker: Falls back to round-robin after 3 failures

**Usage:**
```bash
llm-conclave discuss --dynamic "Complex architecture debate"
llm-conclave discuss --dynamic --selector-model gpt-4o-mini "Task"
```

**MCP:**
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

### ✅ Session Continuation
**Status:** Implemented (commit `f38edb9`)
**Priority:** High
**Complexity:** Medium

Continue previous discussions with follow-up questions.

**Implementation:** `src/core/SessionManager.ts`, `src/core/ContinuationHandler.ts`
- Sessions saved to `~/.llm-conclave/sessions/`
- New MCP tools: `llm_conclave_continue`, `llm_conclave_sessions`
- Parent session linking for audit trail
- `--reset` flag to start fresh with summary only

**CLI Usage:**
```bash
llm-conclave sessions                           # List sessions
llm-conclave continue "Follow-up question"      # Continue most recent
llm-conclave continue <session-id> "Question"   # Continue specific session
llm-conclave continue --reset "Start fresh"     # Reset with summary only
```

---

### ✅ Structured Output & Devil's Advocate Mode
**Status:** Implemented (commit `b115231`)
**Priority:** Medium
**Complexity:** Medium

Structured fields for better integration and genuine consensus detection.

**Implementation:** `src/core/ConversationManager.ts`, `src/mcp/server.ts`
- Judge prompts request specific sections
- Output fields: `key_decisions`, `action_items`, `dissent`, `confidence`
- Devil's advocate mode detects shallow agreement ("I agree", "I concur")
- Agents pushed to provide edge cases, trade-offs when agreeing

---

### ✅ Persona Aliases
**Status:** Implemented (commit `b115231`)
**Priority:** Low
**Complexity:** Low

Convenient shortcuts for persona names.

**Implementation:** `src/cli/PersonaSystem.ts`
- 17 aliases: `arch`, `sec`, `perf`, `dev`, `ops`, `a11y`, `docs`, `devil`, etc.
- `resolveAlias()` method for consistent lookup

---

### ✅ Inline JSON Config
**Status:** Implemented (commit `95cbe56`)
**Priority:** Medium
**Complexity:** Low

Define custom agents directly in config parameter without file.

**Usage:**
```json
{
  "config": "{\"agents\":{\"Expert\":{\"model\":\"claude-sonnet-4-5\",\"prompt\":\"...\"}}}"
}
```

---

## High Priority

### Resume/Checkpoint System

**Status:** Partially Implemented (basic resume only)
**Priority:** High
**Complexity:** High

Save conversation state and resume interrupted sessions.

**Currently Implemented:**
- ✅ Basic resume in iterative mode via `--start-chunk <n>` flag
- ✅ Skip completed chunks when resuming
- ✅ Append resume marker to shared output

**Usage:**
```bash
# Resume from chunk 5 after interruption
llm-conclave --iterative --start-chunk 5 --project oz.txt "Correct OCR errors"
```

**Still Missing (Full Checkpoint System):**
- ❌ Auto-save checkpoints every N rounds
- ❌ Manual checkpoints: `llm-conclave --save-checkpoint`
- ❌ Resume by checkpoint ID: `llm-conclave --resume <checkpoint-id>`
- ❌ Conversation history preservation
- ❌ Agent state restoration
- ❌ Branching: Try different approaches from same checkpoint
- ❌ Rewind to any point in conversation
- ❌ Works in all modes (currently only iterative)

**Full System Data Structure:**
```typescript
interface Checkpoint {
  id: string;
  timestamp: string;
  task: string;
  mode: 'consensus' | 'orchestrated' | 'iterative';
  currentRound: number;
  conversationHistory: Message[];
  agentStates: Record<string, AgentState>;
  projectContext?: string;
  metadata: {
    tokensUsed: number;
    cost: number;
    duration: number;
  };
}
```

**Planned Storage:**
- SQLite database or `.conclave/checkpoints/` directory
- Compression for large conversations
- Configurable retention policy

---

### Guided Runbooks & Template Library

**Status:** Not Started
**Priority:** High
**Complexity:** Medium

**Problem:** New users need to handcraft prompts and configuration for recurring jobs (e.g., code review, doc rewrite) and may misuse modes.

**Value:** Gives opinionated, low-friction entry points; reduces time-to-first-success for CLI users.

**Pre-configured Templates:**
```bash
# Code review with specialized agents
llm-conclave --template code-review --project ./src

# Architecture design discussion
llm-conclave --template architecture-design "Design microservices system"

# Bug investigation
llm-conclave --template bug-investigation --project ./src "Login fails on mobile"

# OCR/transcription correction
llm-conclave --template ocr-correction --project document.txt

# Security audit
llm-conclave --template security-audit --project ./app

# Documentation review
llm-conclave --template doc-review --project ./docs
```

**Runbook Structure:**
```typescript
interface RunbookPreset {
  name: string;
  description: string;
  mode: 'consensus' | 'orchestrated' | 'iterative';
  taskTemplate: string; // e.g., "Refactor {{path}} with safety checklist"
  chunkSize?: number;
  agents: AgentConfig[];
  judge: JudgeConfig;
  systemPromptTemplate: string;
  recommendedModels: Record<string, string>;
  outputFormat?: 'markdown' | 'diff' | 'json';
}
```

**Implementation:**
- Ship preset runbooks (YAML/JSON) in `.conclave/templates/`
- Add `--runbook <name>` and `--template <name>` flags
- Community templates via GitHub
- `llm-conclave --list-templates`
- Load presets and pre-wire judge/agent prompts

**Affected modules:** `src/init`, `src/orchestration/Orchestrator.ts`, `src/core/ConversationManager.ts`, CLI entry (`index.ts`)

---

## User Experience

### Web UI/Dashboard

**Status:** Not Started
**Priority:** Medium
**Complexity:** High

Browser-based interface for managing and monitoring conversations.

**Features:**
```
┌─────────────────────────────────────────────────────┐
│  LLM Conclave Dashboard                             │
├─────────────────────────────────────────────────────┤
│  📊 Active Session: OCR Correction                  │
│  Progress: ████████░░ 8/10 chunks completed         │
│                                                     │
│  👥 Agent Activity:                                 │
│  • Architect    [Speaking...] █ 342 tokens          │
│  • Critic       [Idle]        ░                     │
│  • Pragmatist   [Thinking...] ▓ 156 tokens          │
│                                                     │
│  💰 Session Cost: $0.42 | Tokens: 12,543           │
│  ⏱️  Duration: 3m 24s                               │
│                                                     │
│  [Pause] [Stop] [Checkpoint] [View Transcript]     │
└─────────────────────────────────────────────────────┘
```

**Technologies:**
- Next.js/React frontend
- WebSocket for real-time updates
- Chart.js for visualizations
- TailwindCSS for styling

**Pages:**
- Dashboard (active sessions)
- History browser
- Agent configuration
- Cost analytics
- Settings

---

### Interactive Clarification & Mid-Session Input

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium

**Problem:** Tasks can be ambiguous; agents may proceed without required constraints, wasting rounds.

**Value:** Quick pre-flight checks reduce bad runs and token spend.

**Features:**

1. **Pre-flight Questions:**
   - Judge or dedicated "Clarifier" agent asks 1-3 questions before starting
   - Users answer interactively or via `--clarifications "..."`
   - Ensures constraints are understood upfront

2. **Mid-Session Guidance:**
   ```bash
   llm-conclave --interactive "Design authentication system"

   [Round 1: Agents discuss various approaches...]

   > You: "Use OAuth 2.0, not custom tokens"

   [Agents incorporate your guidance...]

   > You: "Consider social login too"

   [Discussion continues with new constraints...]
   ```

**Commands:**
- `/guide <message>` - Provide guidance to agents
- `/stop` - Stop session
- `/checkpoint` - Save checkpoint
- `/skip` - Skip current round

**Implementation:**
- CLI prompt after each round in interactive mode
- Update orchestrators to accept mid-session input
- Judge incorporates user guidance
- Integrate with iterative mode to allow `/guide` injections without restarting

**Affected modules:** CLI entry (`index.ts`), `src/init`, `src/core/ConversationManager.ts`, task classifier (`src/orchestration/TaskClassifier.ts`)

---

### Structured Artifact Outputs & Rich Transcripts

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium

**Problem:** Outputs are plain text; downstream automation cannot easily consume agent artifacts or rationale.

**Value:** Improves interoperability with CI, docs pipelines, or ticketing systems; makes transcripts reviewable.

**Features:**
- `--output-format json|md|html` for structured transcripts
- Per-round messages, tool calls, and validations
- Optional bundle (`.zip`) with artifacts plus signed manifest
- `--export-transcript` flag to target path
- Reproducibility via signed hashes

**Implementation:**
```bash
llm-conclave --output-format json --export-transcript ./output "Task"
# Generates: output.json, output.transcript.md, output-artifacts.zip
```

**Affected modules:** `src/core/OutputHandler.ts`, `src/utils`, orchestrators, `outputs/` writers

---

### Structured Categorization Output (Beta Feedback)

**Status:** Not Started
**Priority:** Medium
**Complexity:** Low-Medium
**Source:** Beta feedback from discuss tool usage (Jan 2026)

**Problem:** When using discuss/consult for categorization tasks (e.g., "Categorize these concerns as A/B/C"), the output is narrative text. Users must manually parse which concerns map to which categories.

**Value:** For categorization and classification tasks, provide machine-readable output that maps items to categories with persona opinions.

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
  dissent: string[];  // Minority opinions
}
```

**Usage:**
```bash
llm-conclave discuss --format categorization "Categorize these concerns..."
# Returns JSON with concern IDs mapped to categories
```

**Implementation Notes:**
- Could use `--format categorization` or `--structured-output` flag
- May require detecting categorization tasks automatically
- Should work with both discuss and consult tools

---

## Security & Governance

### Tool Permission Profiles & Sandboxing

**Status:** Not Started
**Priority:** High
**Complexity:** Medium-High

**Problem:** Tools in `ToolRegistry` run with full access; no scoped permissions or audit trail for file/command actions.

**Value:** Safer orchestration in CI or shared environments; clearer governance on what agents may do.

**Features:**
- `ToolPolicy` objects defining allowed paths, command whitelist, and rate limits per agent
- Dry-run mode that logs intended tool calls
- Explicit opt-in flags: `--allow-shell`, `--allow-write`, `--allow-network`
- Audit log entries for each execution with agent name, args, and result
- Sandboxed execution environment

**Implementation:**
```typescript
interface ToolPolicy {
  allowedPaths: string[];
  allowedCommands: string[];
  rateLimits: {
    maxCallsPerMinute: number;
    maxCallsPerSession: number;
  };
  requireApproval: boolean;
}
```

**Example:**
```bash
llm-conclave --allow-write=/tmp --allow-shell="git,npm" --dry-run "Task"
# Shows tool calls without executing, requires approval for sensitive operations
```

**Affected modules:** `src/tools/ToolRegistry.ts`, individual tools under `src/tools`, orchestrators (`src/orchestration/Orchestrator.ts`), CLI flags

---

### Validation & Safety Gates Library

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium-High

**Problem:** Validation in `Orchestrator` is binary and task-driven; no reusable checks (linting, unit tests, security scans).

**Value:** Higher confidence outputs; reusability across tasks and languages.

**Features:**
- Pluggable validators with descriptors (language, type: lint/test/security)
- Task classification selects relevant validators
- Results appended to final output
- Default validators: JSON schema, Markdown lints, static code scan for JS/TS

**Implementation:**
```typescript
interface Validator {
  name: string;
  language?: string;
  type: 'lint' | 'test' | 'security' | 'format';
  run(artifact: string): Promise<ValidationResult>;
}

interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

**Affected modules:** `src/orchestration/Orchestrator.ts`, new validators directory, tool runners

---

## Advanced Orchestration

### ✅ Dynamic Turn Management

**Status:** Implemented (as Dynamic Speaker Selection - commit `9fc0986`)
**Priority:** Medium
**Complexity:** High

Intelligent turn selection instead of fixed round-robin.

**Implemented Features:**

1. **LLM-Directed Turns** ✅
   - LLM moderator decides who speaks next based on conversation
   - Detects explicit handoffs: `@Architect, what do you think?`
   - Natural language patterns: "I'd like to hear from Security Expert"

2. **Expertise Routing** ✅ (via handoff detection)
   - Route questions to specialist agents via @mentions
   - Moderator considers agent expertise when selecting

3. **Robustness Protections** ✅
   - Ping-pong loop prevention
   - Handoff chain depth limiting
   - Circuit breaker fallback to round-robin

**Still Not Implemented:**
- ❌ Interrupt/Correction mode (agents requesting to speak out of turn)
- ❌ Priority queue for urgent contributions

**Usage:**
```bash
llm-conclave discuss --dynamic "Task"
```

---

### Voting Mechanisms

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium

Explicit agent voting for decisions.

**Features:**
- Vote on proposed solutions
- Weighted votes based on expertise
- Visualize consensus strength
- Tie-breaking strategies
- Voting history and patterns

**Types:**
```typescript
interface Vote {
  agent: string;
  choice: string;
  confidence: number; // 0-1
  reasoning: string;
  weight?: number; // Based on expertise
}

interface VotingResult {
  winner: string;
  votes: Vote[];
  consensusStrength: number; // 0-1
  dissent?: Vote[]; // Minority opinions
}
```

**Use Cases:**
- Multiple solution proposals
- Binary decisions (Yes/No)
- Ranked choice voting
- Approval voting

---

### Adversarial/Red Team Mode

**Status:** Not Started
**Priority:** Low
**Complexity:** Medium

Dedicated adversary agents try to break solutions.

**Features:**
- "Attacker" agents look for vulnerabilities
- "Defender" agents must address concerns
- Security testing mode
- Edge case discovery
- Stress testing solutions

**Example:**
```bash
llm-conclave --red-team --project ./auth "Review authentication system"

# Attacker agents:
# - SQL Injection specialist
# - XSS specialist
# - Session hijacking specialist
# - Social engineering specialist
```

---

## Performance & Analytics

### Embedding-backed Project Memory & RAG

**Status:** Not Started
**Priority:** Medium
**Complexity:** High

**Problem:** `MemoryManager` currently stores JSON blobs without semantic search; long projects or multiple sessions lack targeted recall. Large codebases cannot fit in context.

**Value:** Agents can fetch relevant history and file summaries, improving response accuracy and reducing token waste. Support projects with thousands of files.

**Features:**
- Automatic file chunking (500-1000 tokens)
- Vector embeddings (OpenAI, Cohere, local models)
- Semantic search for relevant code and conversation history
- Context window optimization
- Incremental updates
- Optional vector index (SQLite/pgvector or local HNSW)
- Cache embeddings to disk

**Workflow:**
```bash
# Index codebase
llm-conclave --index ./large-project

# Query uses RAG automatically
llm-conclave --project ./large-project "Find authentication bugs"
# -> Only loads relevant files into context
```

**Implementation:**
- ChromaDB or Pinecone for vectors
- `MemoryRetriever` computes embeddings and returns top-k snippets
- Gate behind `--embeddings` flag
- Fall back to current JSON when disabled
- Rerank results for relevance

**Affected modules:** `src/memory/MemoryManager.ts`, `src/memory/ProjectMemory.ts`, provider adapters for embedding models, project context loaders in `src/utils`

---

### Multi-Project Knowledge Graph

**Status:** Not Started
**Priority:** Low
**Complexity:** High

**Problem:** `ProjectMemory` is isolated per project; cross-project insights (shared libs, repeated issues) are invisible.

**Value:** Lets agents reuse lessons, patterns, and bug fixes across similar repositories; supports governance reporting.

**Features:**
- Maintain lightweight graph of projects, files, and concepts (tags)
- When a task references a library already seen elsewhere, surface related summaries and decisions
- Export/import to keep graph portable
- Cross-project pattern recognition

**Affected modules:** `src/memory/ProjectMemory.ts`, `src/memory/MemoryManager.ts`, new `src/memory/KnowledgeGraph.ts`

---

### Agent Performance Analytics

**Status:** Not Started
**Priority:** Low
**Complexity:** Medium

Track and analyze agent effectiveness.

**Metrics:**
```
Agent Statistics (Last 30 Days):
┌────────────┬───────┬─────────┬──────────┬──────────┐
│ Agent      │ Uses  │ Success │ Avg Cost │ Usefulness│
├────────────┼───────┼─────────┼──────────┼──────────┤
│ Architect  │ 45    │ 91%     │ $0.12    │ 4.2/5    │
│ Critic     │ 45    │ 87%     │ $0.08    │ 4.5/5    │
│ Pragmatist │ 38    │ 94%     │ $0.06    │ 4.7/5    │
└────────────┴───────┴─────────┴──────────┴──────────┘

Recommendations:
• Critic has lower success rate - consider refining prompt
• Pragmatist is most cost-effective
```

**Features:**
- Success rate per agent
- Cost efficiency analysis
- Contribution quality scoring
- Agent comparison
- Optimization recommendations

---

### Scenario Benchmarking & Model A/B Harness

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium

**Problem:** Hard to compare providers or prompts across tasks; no automated evaluation loop.

**Value:** Lets maintainers quantify quality/cost/latency changes before shipping; creates regression suite for multi-agent behavior.

**Implementation:**
- Define benchmark scenarios (input task, expected rubric)
- Run them against configurable agent presets
- Collect metrics (tokens, latency, cost, judge outcome)
- Export to CSV/Markdown
- Support parallel runs and A/B toggles (e.g., `--model-overrides`)

**Affected modules:** New `scripts/bench/` runner, provider clients in `src/providers`, cost tracking in `src/core/CostTracker.ts`

---

## Developer Tools

### Extended Git Integration

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium

Enhanced git operations and workflows.

**Features:**

1. **Auto-commit per chunk** (iterative mode)
   ```bash
   llm-conclave --iterative --auto-commit "Fix all issues"
   # Creates commit after each completed chunk
   ```

2. **Feature branch creation**
   ```bash
   llm-conclave --new-branch feature/auth "Implement OAuth"
   # Creates branch, makes changes, commits
   ```

3. **PR description generation**
   ```bash
   llm-conclave --generate-pr-description
   # Analyzes commits, generates comprehensive PR description
   ```

4. **Code review mode**
   ```bash
   llm-conclave --review-pr 123
   # Fetches PR, agents review, post comments
   ```

**Integration:**
- GitHub CLI (`gh`) commands
- GitLab API
- Inline comment suggestions
- Review threads

---

### MCP (Model Context Protocol) Support

**Status:** Not Started
**Priority:** Low
**Complexity:** High

Connect to MCP servers for external tools.

**Note:** Gemini API already has MCP support (experimental)!

**Capabilities:**
- Database queries
- API calls
- File system operations
- Custom tool development
- Third-party integrations

**Example:**
```typescript
import { mcpToTool } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Connect to weather MCP server
const weatherTool = mcpToTool(weatherClient);

// Agents can now query weather
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'What is the weather in London?',
  config: { tools: [weatherTool] }
});
```

**Use Cases:**
- Database access for context
- Live data fetching
- External API integration
- Custom business logic

---

### Streaming Event Channel for UIs & Webhooks

**Status:** Not Started
**Priority:** Medium
**Complexity:** Medium

**Problem:** Streaming is CLI-only; external dashboards cannot subscribe to tokens, tool events, or phase changes.

**Value:** Enables lightweight web UI or third-party integrations to mirror live progress and show cost/latency per phase.

**Features:**
- Emit structured events (JSON lines or SSE) for:
  - Token chunks
  - Round boundaries
  - Tool executions
  - Judge decisions
- Add `--event-stream <file|url>` to write to file or POST to webhook
- Minimal protocol (event type, timestamp, payload)

**Affected modules:** Streaming hooks in `src/core/ConversationManager.ts` and `src/orchestration/Orchestrator.ts`, potential new `src/utils/EventBus.ts`, CLI options

---

### Parallel Agent Execution

**Status:** Not Started
**Priority:** Low
**Complexity:** High

Run independent agents in parallel for faster consensus.

**Benefits:**
- Faster consensus mode (all agents respond simultaneously)
- Reduced total latency
- Better resource utilization

**Challenges:**
- Message ordering complexity
- Tool call conflicts
- Rate limiting across providers
- Aggregation logic

**Implementation:**
```typescript
async function runAgentsInParallel(agents: Agent[], prompt: string) {
  const responses = await Promise.all(
    agents.map(agent => agent.chat([{ role: 'user', content: prompt }]))
  );

  return aggregateResponses(responses);
}
```

**Flags:**
```bash
llm-conclave --parallel "Design system architecture"
llm-conclave --parallel-limit 3 # Max 3 concurrent requests
```

---

## Quick Wins

These are easy-to-implement features that provide immediate value:

### 1. JSON Output Format
**Complexity:** Low
**Implementation:** Already saving JSON, just add `--format json` flag

```bash
llm-conclave --format json "Task" > results.json
```

---

### 2. Quiet Mode
**Complexity:** Low
**Implementation:** Add `--quiet` flag to suppress progress output

```bash
llm-conclave --quiet "Task" # Only outputs final result
```

---

### 3. Colored Output
**Complexity:** Low
**Implementation:** Use chalk or similar library

```typescript
// Different colors per agent
console.log(chalk.blue(`[Architect]: ${message}`));
console.log(chalk.red(`[Critic]: ${message}`));
console.log(chalk.green(`[Pragmatist]: ${message}`));
```

---

### 4. Session History Browser
**Complexity:** Low
**Implementation:** Read from `outputs/` directory

```bash
llm-conclave --history          # List recent sessions
llm-conclave --history 5        # Show last 5 sessions
llm-conclave --replay <id>      # Replay session transcript
```

---

### 5. Model Aliases
**Complexity:** Low
**Implementation:** User-defined model shortcuts in config

```json
{
  "model_aliases": {
    "fast": "gpt-3.5-turbo",
    "smart": "gpt-4o",
    "creative": "gemini-2.5-pro",
    "cheap": "mistral-small-latest"
  }
}
```

```bash
llm-conclave --agent Architect:fast --agent Critic:smart "Task"
```

---

### 6. Dry Run Mode
**Complexity:** Low
**Implementation:** Show what would happen without API calls

```bash
llm-conclave --dry-run "Task"
# Shows: agents, turns, estimated cost, no actual API calls
```

---

### 7. Timeout Configuration
**Complexity:** Low
**Implementation:** Configurable timeouts per agent/round

```json
{
  "timeouts": {
    "per_agent_response": 120,  // 2 minutes
    "per_round": 600,            // 10 minutes
    "total_session": 3600        // 1 hour
  }
}
```

---

## Roadmap

### Phase 1 (Completed) ✅
- ✅ Multi-provider support (5 providers)
- ✅ Three operational modes (Consensus, Orchestrated, Iterative)
- ✅ Tool support (File operations across all providers)
- ✅ Project context analysis
- ✅ Iterative collaborative mode
- ✅ Cost & performance tracking (CostTracker)
- ✅ Automatic retry logic with exponential backoff
- ✅ Iterative mode optimizations (84% fewer API calls)
- ✅ Streaming output (--stream flag)
- ✅ Basic resume capability (--start-chunk in iterative mode)

### Phase 1.5 (Completed - Jan 2026) ✅
- ✅ Dynamic speaker selection (`--dynamic` flag)
- ✅ Session continuation (MCP & CLI)
- ✅ Structured output (key_decisions, action_items, dissent, confidence)
- ✅ Devil's advocate mode (shallow agreement detection)
- ✅ Persona aliases (17 shortcuts)
- ✅ Inline JSON config for MCP

### Phase 2 (Completed - Feb 2026) ✅
- ✅ Context Tax Optimization (Phases 1-3)
  - Prompt caching (Anthropic, OpenAI, Gemini)
  - Tool output offloading (ArtifactStore)
  - Model routing for subtasks
  - Cache-aware cost tracking
  - Instruction-based tool pruning
  - Anthropic context editing beta
  - Gemini explicit caching

### Phase 3 (Next) - Q1 2026
**Focus: User experience & reliability**
- Full checkpoint/resume system with history preservation
- Template library & guided runbooks
- Quick wins (colored output, quiet mode, JSON format, etc.)
- Tool permission profiles & sandboxing
- Budget alerts and spend limits
- Streaming event channel for external UIs & webhooks

### Phase 4 (Future) - Q2 2026
**Focus: Scalability & intelligence**
- Web UI/Dashboard
- Embedding-backed memory & RAG for large codebases
- Interactive clarification & mid-session input
- Structured artifact outputs
- ~~Dynamic turn management~~ ✅ (Implemented as Dynamic Speaker Selection)
- Extended git integration

### Phase 5 (Advanced) - Q3+ 2026
**Focus: Advanced features & integrations**
- MCP (Model Context Protocol) support
- Parallel agent execution
- Red team/adversarial mode
- Agent performance analytics
- Multi-project knowledge graph
- Voting mechanisms
- Scenario benchmarking harness

---

## Contributing

Want to implement a feature?
1. Check if an issue exists
2. Comment on the issue to claim it
3. Fork, implement, test
4. Submit PR with reference to issue

**Guidelines:**
- Follow existing code patterns
- Add TypeScript types
- Include tests
- Update README if user-facing
- Add to CHANGELOG

## Feature Voting

Help prioritize! Vote for features you want:
- Open an issue on GitHub with title: `Feature Request: [Feature Name]`
- Upvote existing feature requests with 👍
- Comment with your use case

---

*Last Updated: February 12, 2026*
