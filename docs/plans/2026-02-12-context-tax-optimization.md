# Context Tax Optimization Plan

**Date**: 2026-02-12
**Updated**: 2026-02-12 (post-adversarial review)
**Goal**: Reduce LLM API token costs by 35-50% through systematic context engineering
**Research Sources**: Deep research from Claude, ChatGPT, Gemini, Grok (see `temp/`)
**Review**: LLM Conclave adversarial review (architect, skeptic, pragmatist) — see Appendix A

---

## Background

A 4-round discuss with 3 agents makes ~12 API calls. Each call sends full conversation history (O(rounds^2) growth). Tool outputs accumulate in-context. No provider caching is enabled. Token counting uses `char/4` heuristic. There is no awareness of Claude's 200K pricing cliff.

Combined, these waste significant token spend. This plan fixes that in 3 phases.

### Adversarial Review Corrections Applied

The original plan claimed 60-80% savings from Phase 1 and "up to 95%" combined. The adversarial review (3 experts, 85% confidence) identified these as **inflated**:

1. **Discount stacking is not multiplicative.** Cached tokens can't also be batched. You can't cache what you've already compressed away. Each optimization applies to a different slice of the total cost, and slices overlap.
2. **Artifact store risks degrading debate quality.** Summarizing agent responses destroys the nuanced disagreements that make multi-agent debate valuable. Agents need full conversational context to make meaningful counterarguments.
3. **Phase 2 adds failure modes.** Filesystem I/O, cache invalidation races, pointer dereferencing bugs, summary drift — each is a new production risk for marginal gains after Phase 1 captures the easy wins.

**Revised estimates**: Phase 1 = 35-45%. Phase 1+2 = 50-60%. Phase 3 adds marginal gains on eligible workloads. See Savings Projection for details.

---

## Phase 1: Quick Wins (1-3 days each, est. 35-45% cost reduction)

### 1.1 Anthropic Prompt Caching

**Impact**: 90% discount on cached prefix tokens (system prompt + tools). Real-world impact depends on what fraction of total input is the stable prefix — estimated 25-40% overall input cost reduction on Claude calls.
**Effort**: Low (< 1 day)
**Risk**: Low

Add `cache_control: { type: "ephemeral" }` to system prompt and tool definitions in ClaudeProvider. These are stable across all calls in a discussion and qualify for 90% read discount after first call. The growing conversation history is NOT cached (it changes every call), so the 90% discount only applies to the stable prefix portion.

**File**: `src/providers/ClaudeProvider.ts`

**Current** (line 79-100):
```typescript
const params: any = {
  model: this.modelName,
  max_tokens: maxTokens,
  messages: convertedMessages,
};
if (systemPrompt) {
  params.system = systemPrompt;
}
if (tools && tools.length > 0) {
  params.tools = tools;
}
```

**Target**:
```typescript
const params: any = {
  model: this.modelName,
  max_tokens: maxTokens,
  messages: convertedMessages,
};
if (systemPrompt) {
  params.system = [{
    type: 'text',
    text: systemPrompt,
    cache_control: { type: 'ephemeral' },
  }];
}
if (tools && tools.length > 0) {
  // Cache tool definitions — stable across all calls
  params.tools = tools.map((tool, i) =>
    i === tools.length - 1
      ? { ...tool, cache_control: { type: 'ephemeral' } }
      : tool
  );
}
```

**Acceptance criteria**:
- [ ] `cache_creation_input_tokens` appears in first call's usage
- [ ] `cache_read_input_tokens` appears in subsequent calls
- [ ] Add cache hit rate logging to CostTracker

**Notes**:
- Max 4 cache breakpoints per request. System + tools = 2 breakpoints. Save remaining 2 for conversation history prefix if needed.
- 5-min TTL refreshes on each hit — fine for discussions that complete within minutes.
- Minimum cacheable prefix: 1,024 tokens (system prompt + tools easily exceeds this).

---

### 1.2 Stable Prefix Ordering for OpenAI/Grok

**Impact**: 25-50% input cost reduction (automatic, probabilistic)
**Effort**: Minimal (audit + test)
**Risk**: None

OpenAI and Grok automatically cache prefixes >= 1,024 tokens with 50-75% discount. We just need to ensure:
1. System prompt is always first (already true — OpenAIProvider line 80, GrokProvider line 80)
2. No volatile content (timestamps, request IDs) before stable content
3. Tool definitions come before conversation history

**Files**: `src/providers/OpenAIProvider.ts`, `src/providers/GrokProvider.ts`

**Action**: Audit message assembly for any dynamic content that could break prefix stability. Add a comment documenting the prefix ordering requirement.

**Acceptance criteria**:
- [ ] Verify `prompt_tokens_details.cached_tokens` appears in OpenAI responses
- [ ] Log cache hit rate

---

### 1.3 200K Pricing Cliff Guard + Accurate Token Counting

**Impact**: Prevents silent 2x cost spike on entire requests
**Effort**: Low-Medium (2 days)
**Risk**: Low

Claude doubles ALL token prices (input AND output) when total input exceeds 200K tokens. This applies to the entire request, not just the overage. The current `char/4` heuristic can be off by 20-30%, meaning we could silently cross this cliff.

**The cliff guard is useless without accurate token counting** (originally Phase 3.3, promoted here per adversarial review). You can't guard a threshold you can't measure.

**File**: `src/utils/TokenCounter.ts` (line 8-13)

**Changes**:

**Step 1: Replace char/4 with provider-specific counting**

| Provider | Library | Type |
|----------|---------|------|
| OpenAI | `gpt-tokenizer` (npm) | Local, exact |
| Anthropic | `client.messages.countTokens()` | API call, exact |
| Gemini | `client.models.countTokens()` | API call, free, exact |
| Mistral/Grok | `gpt-tokenizer` approximation | Local, ~85-90% accurate |

```typescript
interface TokenBudgeter {
  estimate(text: string): number;               // fast, local (routine checks)
  exact(request: APIRequest): Promise<number>;   // slow, API call (cliff-sensitive)
}
```

Use local estimation for routine checks. Use API calls for cliff-sensitive paths (when estimate > 150K).

**Step 2: Cliff guard**

```typescript
async function checkClaudeCliff(
  client: Anthropic,
  model: string,
  system: any,
  tools: any[],
  messages: any[]
): Promise<{ tokens: number; nearCliff: boolean }> {
  const count = await client.messages.countTokens({
    model,
    system,
    tools,
    messages,
  });
  return {
    tokens: count.input_tokens,
    nearCliff: count.input_tokens > 180_000,
  };
}
```

**File**: `src/core/ConversationManager.ts` (line 792-793)

**Changes**:
- Make compression threshold model-aware: 80K for most models, 170K for Claude (leave room before 200K cliff)
- Add cliff-guard check before each Claude API call in the orchestration layer

**Acceptance criteria**:
- [ ] `gpt-tokenizer` installed and used for OpenAI/Grok/Mistral estimation
- [ ] Anthropic `countTokens` called when estimated tokens > 150K
- [ ] Compression triggers before 200K for Claude models
- [ ] Warning logged when approaching cliff
- [ ] Integration test: verify compression prevents cliff crossing

---

### 1.4 Judge Case-File Format

**Impact**: Quality improvement + token reduction on judge calls
**Effort**: Low (1 day)
**Risk**: Low

LLMs show U-shaped attention — best at beginning and end, worst in the middle. Currently the judge gets chronological history, burying the original question under pages of debate.

**File**: `src/core/ConversationManager.ts` — `prepareJudgeContext()` (line 1061-1109)

**Current structure**:
```
[System prompt]
[Round 1 - full]
[Round 2 - full or compressed]
[Round 3 - full]
[Round N - full]
[Judge instruction]
```

**Target structure** (case-file format):
```
[System prompt + judge rubric]                    <- START (high attention)
[CASE FILE: original task + key constraints]
[CLAIMS SUMMARY: top claims per agent]
[DISAGREEMENTS: unresolved conflicts]
[Round summaries - compressed]                    <- MIDDLE (lower attention, OK)
[Final round responses - full]                    <- END (high attention)
[Judge instruction: "Given the case file..."]     <- VERY END (highest attention)
```

**Acceptance criteria**:
- [ ] Judge prompt starts with task + constraints, not chronological history
- [ ] Most contentious points are at start and end
- [ ] Compressed middle rounds use structured summaries, not raw text

---

### 1.5 Tool Schema Thinning

**Impact**: Reduces per-call prefix overhead by hundreds of tokens
**Effort**: Low (< 1 day)
**Risk**: None

MCP tool schemas with verbose descriptions bloat the context prefix. Since tool definitions are repeated in every API call and cached as part of the prefix, making them smaller amplifies caching benefits.

**File**: `src/tools/ToolRegistry.ts` — `defineTools()` (line 38-127)

**Changes**:
- Shorten tool descriptions to 1-2 sentences
- Remove examples from descriptions (the model knows how to use standard tools)
- Remove giant enum lists (use free text + server-side validation)
- Keep property descriptions minimal

**Also applies to**: MCP server tool definitions in `src/mcp/`

**Acceptance criteria**:
- [ ] Total tool definition token count reduced by 30%+
- [ ] No change in tool call success rate

---

## Phase 2: Structural Improvements (1-2 weeks, additional 15-25%)

> **Adversarial review warning**: Phase 2's original scope was too aggressive. The artifact store
> originally proposed replacing agent responses with summaries — the review found this would
> "destroy the nuanced disagreements that make multi-agent debate valuable." The revised scope
> limits offloading to **tool outputs only** and keeps all agent responses in-context. The
> blackboard has been descoped to a judge-only optimization.

### 2.1 Tool Output Offloading (Revised — Scoped Down from Full Artifact Store)

**Impact**: 15-30% context size reduction (tool-heavy discussions only)
**Effort**: Medium (2-3 days)
**Risk**: Low (does NOT touch agent conversation flow)

The adversarial review correctly identified that replacing agent responses with summaries + pointers degrades debate quality. **Agent responses must stay in-context** — agents need full conversational context to make meaningful counterarguments.

However, **tool outputs** (file reads, search results) are a different story. A 50KB file read bloats every subsequent API call, and agents rarely need the full content again. Tool outputs are factual data, not conversational nuance — safe to offload.

**What gets offloaded**: Tool outputs (read_file, search, etc.) over a size threshold (e.g., 2KB)
**What stays in-context**: ALL agent responses (full text, every round)

**New file**: `src/core/ArtifactStore.ts`

```typescript
interface Artifact {
  id: string;           // e.g., "tool-readfile-3"
  type: 'tool_output';  // Only tool outputs, not agent responses
  content: string;      // full content stored on disk
  stub: string;         // short stub for context (filename, size, first/last 5 lines)
  tokenCount: number;
}

class ArtifactStore {
  private storePath: string;  // .conclave/artifacts/

  store(artifact: Artifact): string;
  get(id: string): Artifact;
  getExcerpt(id: string, maxTokens: number): string;
}
```

**Context flow change**:

Before:
```
Agent call includes: system + conversation history + ALL tool outputs (full, in-line) + prompt
```

After:
```
Agent call includes: system + conversation history (full) + tool output stubs + prompt
Tool stubs look like: "[File: src/auth.ts (342 lines, 8.2KB) — artifact_id: tool-3. First 5 lines: ...]"
```

**New tool**: `expand_artifact` — agents can retrieve full tool output if needed

**Files to modify**:
- `src/tools/ToolRegistry.ts` — `executeTool()` (line 254-294): For outputs > 2KB, store to artifact, return stub
- Provider message assembly: Replace large tool_result content with stub text

**What this does NOT do** (per adversarial review):
- Does NOT summarize or offload agent responses
- Does NOT change conversation history flow
- Does NOT introduce a blackboard for agent context
- Does NOT require agents to guess when to expand artifacts — stubs include enough context to decide

**Acceptance criteria**:
- [ ] Tool outputs > 2KB stored to `.conclave/artifacts/<session-id>/`
- [ ] Stub includes filename, size, and first/last few lines (enough to decide if expansion needed)
- [ ] `expand_artifact` tool works across all providers
- [ ] Agent quality unchanged (tool data is factual, not conversational)
- [ ] Measure: context size reduction on tool-heavy iterate mode sessions

---

### 2.2 Judge Case-File with Discussion State (Revised — Judge-Only, Not Agent-Facing)

**Impact**: Quality improvement on judge calls + modest token reduction
**Effort**: Medium (2-3 days)
**Risk**: Low-Medium

The original plan proposed a full blackboard state object shared with all agents. The adversarial review flagged this as adding 4 new failure modes for marginal gains. **Revised scope**: Extract a structured discussion state for **judge calls only**, not for agent context.

The judge is the one participant that benefits most from structured summaries — it needs to weigh claims, not participate in the debate. Agents continue to see full conversation history.

**Implementation**: After each round, extract a lightweight discussion state:

```typescript
interface DiscussionState {
  task: string;
  round: number;
  agentPositions: { agent: string; position: string }[];  // 1-sentence per agent
  keyDisagreements: string[];                               // unresolved conflicts
  openQuestions: string[];                                   // from the debate
}
```

This is extracted **deterministically** (no LLM call) from agent responses using simple heuristics: last paragraph of each response as "position", questions ending with "?" as open questions, etc. If heuristic quality is poor, upgrade to a cheap model (gpt-4o-mini) later.

**Judge context assembly** (combines with 1.4 case-file format):
```
[System prompt + judge rubric]                         <- START
[CASE FILE: task + constraints]
[DISCUSSION STATE: positions, disagreements, questions]
[Compressed middle rounds]                             <- MIDDLE
[Final round responses - full]                         <- END
[Judge instruction]                                    <- VERY END
```

**Files to modify**:
- `src/core/ConversationManager.ts` — `prepareJudgeContext()` (line 1061-1109): Prepend discussion state
- New `extractDiscussionState()` helper function

**What this does NOT do**:
- Does NOT change what agents see (they keep full history)
- Does NOT require LLM calls for extraction (deterministic first)
- Does NOT introduce shared mutable state between agents

**Acceptance criteria**:
- [ ] Discussion state extracted after each round
- [ ] Judge prompt uses case-file format with discussion state
- [ ] Judge verdict quality equal or better (A/B test on 10 fixed questions)

---

### 2.3 Model Routing for Subtasks

**Impact**: 10-20% total cost reduction (subtasks are a small fraction of total token spend)
**Effort**: Medium (2-3 days)
**Risk**: Low

Not every subtask needs a frontier model. Route cheap tasks to cheap models. Note: the savings are modest because subtasks (summarization, validation, termination checks) represent a small fraction of total tokens — the bulk is agent reasoning and conversation history.

| Subtask | Current | Recommended | Cost Ratio |
|---------|---------|-------------|------------|
| History summarization | Same model as agent | gpt-4o-mini / haiku-4.5 | 10-20x cheaper |
| Early termination check | Same model | haiku-4.5 | 10-20x cheaper |
| Schema validation | LLM call | Zod (no LLM needed) | Free |
| Discussion state extraction | N/A (new in 2.2) | gpt-4o-mini (if heuristic insufficient) | 10-20x cheaper |
| Judge verdict | gpt-4o | Keep as-is or upgrade | 1x |
| Core agent reasoning | Per config | Keep as-is | 1x |

**New file**: `src/core/TaskRouter.ts`

```typescript
type TaskType = 'summarize' | 'validate' | 'extract' | 'reason' | 'judge';

class TaskRouter {
  private cheapModel: string;  // e.g., 'gpt-4o-mini'
  private cheapProvider: LLMProvider;

  async route(task: TaskType, prompt: string): Promise<string> {
    if (task === 'reason' || task === 'judge') {
      // Use the agent's configured model
      return null; // signal: use default
    }
    // Use cheap model
    return this.cheapProvider.chat(prompt, systemPrompt);
  }
}
```

**Files to modify**:
- `src/core/ConversationManager.ts` — `compressHistory()` (line 830-884): Use cheap model for summarization instead of heuristic truncation
- `src/orchestration/ConsultOrchestrator.ts` — Early termination checks, artifact validation
- New `TaskRouter` injected into orchestrators

**Acceptance criteria**:
- [ ] Summarization quality with gpt-4o-mini matches current heuristic
- [ ] Cost per discussion drops 30%+ on subtask routing alone
- [ ] No quality regression on core reasoning tasks

---

### 2.4 Two-Step Output Pattern for Judge

**Impact**: Preserves reasoning quality under structured output constraints
**Effort**: Low (1 day)
**Risk**: Low

Research ("Let Me Speak Freely?" — arXiv 2408.02442) shows strict JSON mode degrades reasoning by 10-15%. Fix: allow a `_scratchpad` field for free-form reasoning before the structured verdict.

**File**: `src/consult/artifacts/schemas/` — Verdict schema

**Current**: Pure structured output
**Target**:
```typescript
const VerdictSchema = z.object({
  _analysis: z.string().describe('Analyze evidence step-by-step before committing to verdict'),
  verdict: z.string(),
  confidence: z.number(),
  top_claims: z.array(ClaimSchema),
  disagreements: z.array(DisagreementSchema),
  action_items: z.array(z.string()),
});
```

The `_analysis` field is discarded before passing to downstream consumers — it exists only to preserve reasoning quality during generation.

**Acceptance criteria**:
- [ ] Judge verdicts include `_analysis` field
- [ ] Downstream consumers don't see `_analysis`
- [ ] A/B test shows equal or better verdict quality

---

### 2.5 Cache-Aware Cost Tracking

**Impact**: Accurate cost reporting and optimization feedback loop
**Effort**: Low-Medium (1-2 days)
**Risk**: None

**File**: `src/core/CostTracker.ts` (line 82-86)

**Changes**:
- Add `cachedInputTokens` to `CallLog` interface
- Track cache hit rate per provider
- Apply provider-specific cache discounts to cost calculations:
  - Claude: 90% discount on `cache_read_input_tokens`
  - OpenAI: 50% discount on `cached_tokens`
  - Gemini: 75-90% discount on cached tokens
  - Grok: 50-75% discount on cached tokens
- Report cache hit rate and savings in session summary

```typescript
interface CallLog {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;   // NEW
  cacheWriteTokens: number;    // NEW
  cost: number;                // adjusted for cache pricing
}
```

**Acceptance criteria**:
- [ ] Session summary shows: total tokens, cached tokens, cache hit rate, actual vs. uncached cost
- [ ] Cost estimates in CostEstimator account for expected cache hits

---

## Phase 3: Long-Term (weeks, marginal additional gains)

> **Note on stacking**: Batch discount (50%) applies to the non-cached portion of tokens.
> Cached tokens are already discounted 90% (Claude) or 50% (OpenAI) — you can't batch tokens
> that were already served from cache. Real stacking is additive across different token slices,
> not multiplicative on the same tokens.

### 3.1 Batch API for Non-Interactive Calls

**Impact**: 50% flat discount on batch-eligible calls. Only applies to calls that can tolerate latency (Consult Round 1, eval runs). Estimated 10-15% overall savings (batch-eligible calls are ~20-30% of total).
**Effort**: Medium-High (1 week)
**Risk**: Medium (adds latency, orchestration complexity)

Consult Round 1 (parallel independent analysis) is a batch candidate — agents are independent, no sequential dependency. Also: eval runs, regression tests, MCP background tasks.

**CLI flag**: `llm-conclave consult --batch "question"`

**Implementation**:
1. Serialize Round 1 prompts to JSONL
2. Submit via Anthropic/OpenAI batch API
3. Poll for completion
4. Rehydrate results into session state
5. Continue Rounds 2-4 in real-time

**Not suitable for**: Interactive discuss mode, sequential rounds with dependencies.

---

### 3.2 Gemini Explicit Caching

**Impact**: 75-90% input cost reduction for Gemini calls with large static documents
**Effort**: Medium (3-5 days)
**Risk**: Low

For consult mode with large project context, create a Gemini cache object with TTL, reference by name in subsequent calls. Storage cost: $1.00/MTok/hour — only worthwhile for multi-agent reuse within the hour.

```typescript
const cache = await client.caches.create({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: panelRules,
    contents: [{ role: 'user', parts: [{ text: projectContext }] }],
    ttl: '3600s',
  },
});
const response = await client.models.generateContent({
  model: 'gemini-2.5-flash',
  cachedContent: cache.name,
  contents: [{ role: 'user', parts: [{ text: currentPrompt }] }],
});
```

---

### 3.3 Anthropic Context Editing (Beta)

**Impact**: Automatic tool output management (complementary to 2.1)
**Effort**: Medium
**Risk**: Medium (beta API, may change)

Anthropic's `context-management-2025-06-27` beta auto-clears old tool results when context exceeds a threshold. Handles edge cases where artifact offloading (2.1) wasn't triggered.

```typescript
context_management: {
  edits: [{
    type: 'clear_tool_uses_20250919',
    trigger: { type: 'input_tokens', value: 50000 },
    keep: { type: 'tool_uses', value: 3 },
    clear_at_least: { type: 'input_tokens', value: 10000 },
  }],
}
```

**Gotcha**: Clearing content before a cache breakpoint invalidates the cache. Design layout so clearable content (tool outputs) comes after the cached prefix.

---

### 3.4 Dynamic Tool Pruning per Mode

**Impact**: Reduces prefix size, improves caching
**Effort**: Medium
**Risk**: Low

**Gotcha** (from Manus): Changing tool definitions mid-discussion invalidates KV cache for the entire prefix. Better to define all tools upfront and use agent instructions to limit which ones to call per phase. This preserves cache while limiting tool use.

Recommendation: instruction-based restriction over actual tool removal. Simpler, cache-safe.

---

## Savings Projection (Revised Post-Review)

| Phase | Optimization | Applies To | Est. Savings | Notes |
|-------|-------------|-----------|-------------|-------|
| 1.1 | Claude prompt caching | Claude input (stable prefix only) | 25-40% on Claude calls | 90% on prefix, but prefix is fraction of total input |
| 1.2 | OpenAI/Grok prefix stability | OpenAI/Grok input | 15-30% on those calls | Probabilistic, not guaranteed |
| 1.3 | 200K cliff guard + tokenizers | Claude calls near limit | Prevents 2x spike | Risk mitigation, not savings |
| 1.4 | Judge case-file | Judge calls | Modest token savings | Primarily a quality win |
| 1.5 | Tool schema thinning | All calls (prefix) | ~5% prefix reduction | Marginal, amplifies caching |
| **Phase 1 total** | | | **35-45% overall** | |
| 2.1 | Tool output offloading | Tool-heavy sessions | 15-30% context reduction | Only tool outputs, not agent responses |
| 2.2 | Judge discussion state | Judge calls | Modest token savings | Quality win, judge-only |
| 2.3 | Model routing | Subtask calls | 10-20% total cost | Subtasks are small fraction of spend |
| 2.4 | Two-step output | Judge calls | Quality preservation | Not a cost optimization |
| 2.5 | Cache-aware tracking | Observability | N/A | Feedback loop, not savings |
| **Phase 1+2 total** | | | **50-60% overall** | |
| 3.1 | Batch API | Non-interactive calls (~20-30%) | 10-15% additional | Only batch-eligible calls |
| 3.2 | Gemini explicit caching | Gemini calls with large static docs | Variable | Depends on Gemini usage |
| 3.3 | Anthropic context editing | Claude tool-heavy sessions | Complementary to 2.1 | Beta, may change |
| 3.4 | Dynamic tool pruning | All calls (prefix) | Marginal | Instruction-based preferred |

**Realistic target**: 35-45% after Phase 1. 50-60% after Phase 1+2. Phase 3 adds marginal gains on specific workloads.

**Why not higher?** The bulk of token spend is agent conversation history (growing per round) and agent output tokens. Caching only helps with the stable prefix. Tool output offloading only helps tool-heavy sessions. The conversation history growth is the fundamental cost driver, and the adversarial review correctly identified that compressing agent responses risks degrading debate quality. The O(n^2) growth from full-history resending is the remaining elephant — solving it without quality loss requires provider-level conversation state features (not yet available for multi-agent).

---

## Testing Strategy

1. **Baseline measurement**: Before any changes, run a standard 4-round discuss and consult, log exact token counts and costs per call
2. **Per-optimization measurement**: After each change, re-run the same scenarios, compare
3. **Quality regression**: A/B test judge verdict quality on a fixed set of 10 questions
4. **Cache hit rate dashboard**: Log and display cache metrics in session summary
5. **Cliff guard test**: Construct a scenario that would cross 200K, verify compression triggers

---

## Open Questions

1. **Tool output stub detail level**: How much context to include in stubs? Too little = agents always expand (negating savings). Too much = no savings. Start with filename + size + first/last 5 lines, measure expansion rate.

2. **Cache TTL strategy**: Anthropic offers 5-min (1.25x write) and 1-hour (2x write) TTLs. Most discussions complete within 5 minutes — use the cheaper 5-min TTL. For MCP server handling multiple back-to-back consultations, consider 1-hour.

3. **Tool pruning vs. instruction-based restriction**: Manus recommends keeping tools stable for cache. Start with instruction-based restriction (simpler, cache-safe), measure if agents respect it reliably.

4. **Batch mode UX**: For CLI, batch makes users wait up to 24 hours. Consider a `--batch` flag for explicit opt-in, or auto-batch only for eval/regression runs. Never auto-batch interactive sessions.

5. **Discussion state extraction quality**: Deterministic heuristic (last paragraph = position, "?" = question) may miss nuance. Monitor quality; upgrade to gpt-4o-mini extraction only if judge verdicts degrade.

6. **Measuring actual savings**: Need a repeatable benchmark. Run same 5 questions through discuss + consult before/after each phase, log exact costs. Without this, we're guessing.

---

## Appendix A: Adversarial Review Summary

**Tool**: LLM Conclave `consult --quick`
**Personas**: Architect, Skeptic (Critical Analyst), Pragmatist
**Confidence**: 85% (unanimous)
**Cost**: $0.06

### Key Findings

1. **Savings estimates inflated**. The original 60-80% Phase 1 and "up to 95%" combined claims were mathematically impossible. Discounts don't stack multiplicatively — cached tokens can't also be batched, and you can't cache what you've compressed away.

2. **Artifact store risks degrading debate quality**. Summarizing agent responses destroys nuanced disagreements. Agents need full conversational context for meaningful counterarguments. The `expand_artifact` tool is a band-aid — agents won't know when to call it.

3. **Phase 2 adds failure modes**. Filesystem I/O, cache invalidation races, pointer dereferencing bugs, summary drift — each is a new production risk for marginal post-Phase-1 gains.

4. **Phase 1 is solid**. Prompt caching, prefix ordering, cliff guard, and judge restructuring are low-risk, high-value.

### Corrections Applied

- Deflated all savings estimates to realistic ranges
- Scoped artifact store to **tool outputs only** (agent responses stay in-context)
- Reduced blackboard to **judge-only discussion state** (not agent-facing)
- Moved accurate tokenizers from Phase 3 to Phase 1 (required for cliff guard)
- Added honest "why not higher" explanation in savings projection
- Cut 3.5 (dynamic tool pruning) to recommendation-only (instruction-based restriction preferred)
