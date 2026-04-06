---
phase: "02-conversationmanager-decomposition"
plan: "03"
subsystem: "core"
tags: ["refactoring", "extraction", "testing", "ConversationManager", "JudgeEvaluator"]
dependency_graph:
  requires: ["02-01 (ConversationHistory)", "02-02 (AgentTurnExecutor)"]
  provides: ["JudgeEvaluator class", "judge evaluator unit tests"]
  affects: ["ConversationManager", "all paths that call judgeEvaluate/conductFinalVote"]
tech_stack:
  added: ["JudgeEvaluator (new class)"]
  patterns: ["dependency injection via deps object", "invalidateCache() public method for cross-object state", "CONTEXT_OVERFLOW_PATTERN moved to sole owner"]
key_files:
  created:
    - src/core/JudgeEvaluator.ts
    - src/core/__tests__/JudgeEvaluator.test.ts
  modified:
    - src/core/ConversationManager.ts
decisions:
  - "CONTEXT_OVERFLOW_PATTERN moved to JudgeEvaluator as sole owner — only judge methods use it; no duplication anywhere"
  - "parseStructuredOutput, getChatOptions, createCallAbortController also moved to JudgeEvaluator — all callers were judge methods"
  - "bestEffortJudgeResult made public — ConversationManager needs it as last-resort fallback in degraded paths"
  - "invalidateCache() public method added — ConversationHistory onCacheInvalidated callback resets JudgeEvaluator cache after compression"
  - "streamOutput and getPersistentlyFailedAgents added to JudgeEvaluatorDeps — needed by judgeEvaluate for streaming and rubber-stamp detection"
metrics:
  duration: "~14 minutes"
  completed: "2026-04-06"
  tasks_completed: 1
  files_created: 2
  files_modified: 1
---

# Phase 02 Plan 03: JudgeEvaluator Extraction Summary

## One-liner

JudgeEvaluator class extracted from ConversationManager owning all judge evaluation: consensus detection, shallow-agreement/quoting/rubber-stamp detection, case file building, final voting, and context overflow retry — reducing ConversationManager to 761 lines.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | Add failing tests for JudgeEvaluator | 1d47b54 | src/core/__tests__/JudgeEvaluator.test.ts |
| 1 (GREEN) | Extract JudgeEvaluator + update ConversationManager | 189de09 | src/core/JudgeEvaluator.ts, src/core/ConversationManager.ts |

## What Was Built

### JudgeEvaluator (`src/core/JudgeEvaluator.ts`)

New class with constructor accepting `JudgeEvaluatorDeps` interface:

```typescript
export interface JudgeEvaluatorDeps {
  conversationHistory: DiscussionHistoryEntry[];
  history: ConversationHistory;
  config: Config;
  agents: { [key: string]: any };
  agentOrder: string[];
  getCurrentRound: () => number;
  judgeInstructions: string | null;
  eventBus?: EventBus;
  abortSignal?: AbortSignal;
  costTracker: CostTracker;
  streamOutput: boolean;
  getPersistentlyFailedAgents: () => Set<string>;
}
```

Methods moved from ConversationManager (preserving exact logic):
- `private getRoundForEntry(entry)` — determines which round an entry belongs to
- `private buildCaseFile()` — builds structured text with task, agent positions, disagreements
- `private prepareJudgeContext(judge, discussionText)` — judge context with case file, state, compression
- `bestEffortJudgeResult()` — heuristic fallback when judge LLM fails (made public)
- `async judgeEvaluate(judge)` — main consensus evaluation with agreement/quoting/rubber-stamp detection
- `async conductFinalVote(judge)` — final vote when max rounds reached

Also moved from ConversationManager (were private utilities):
- `private getChatOptions(agentName?)` — streaming options for judge LLM calls
- `private createCallAbortController(timeoutMs?)` — per-call abort with timeout
- `private parseStructuredOutput(text)` — extracts KEY_DECISIONS, ACTION_ITEMS, etc.

Caching state owned by JudgeEvaluator:
- `cachedRecentDiscussion: string` — full discussion text cache
- `lastJudgeCacheRound: number` — cache invalidation tracker

Public methods added:
- `invalidateCache()` — resets cache; called by ConversationHistory's onCacheInvalidated after compression
- `bestEffortJudgeResult()` — exposed public for CM's degraded-path catch blocks

Constant ownership:
- `CONTEXT_OVERFLOW_PATTERN` — defined ONLY in JudgeEvaluator; removed from ConversationManager

### ConversationManager changes

1. Import added: `import JudgeEvaluator from './JudgeEvaluator.js'`
2. Removed properties: `cachedRecentDiscussion`, `lastJudgeCacheRound`
3. Removed imports: `TokenCounter`, `DiscussionStateExtractor` (now only in JudgeEvaluator)
4. Removed `CONTEXT_OVERFLOW_PATTERN` const (moved to JudgeEvaluator)
5. Property added: `private judgeEvaluator!: JudgeEvaluator`
6. Constructor: JudgeEvaluator instantiated after agentExecutor + history, with `getPersistentlyFailedAgents` callback
7. `onCacheInvalidated` callback updated: calls `this.judgeEvaluator.invalidateCache()` (lazy via `if (this.judgeEvaluator)`)
8. All `this.judgeEvaluate(judge)` → `this.judgeEvaluator.judgeEvaluate(judge)` (1 call site)
9. All `this.conductFinalVote(judge)` → `this.judgeEvaluator.conductFinalVote(judge)` (3 call sites)
10. All `this.bestEffortJudgeResult()` → `this.judgeEvaluator.bestEffortJudgeResult()` (2 call sites)
11. Removed 9 extracted method bodies from ConversationManager

Line count reduction:
- Before Plan 01: ~2050 lines
- After Plan 01 (ConversationHistory): ~1750 lines
- After Plan 02 (AgentTurnExecutor): ~1420 lines
- After Plan 03 (JudgeEvaluator): 761 lines (target was <1000)

### Unit Tests (`src/core/__tests__/JudgeEvaluator.test.ts`)

18 tests covering:
1. getRoundForEntry: returns 1 for initial system message
2. getRoundForEntry: returns correct round for agent responses
3. buildCaseFile: produces structured text with task and agent positions
4. buildCaseFile: identifies disagreements between agents
5. prepareJudgeContext: includes discussion text, case file, and agent information
6. prepareJudgeContext: includes shallow agreement warning when flag is true
7. prepareJudgeContext: appends judgeInstructions when provided
8. bestEffortJudgeResult: returns synthesis from last-round agent responses
9. bestEffortJudgeResult: returns fallback message when no agent entries in history
10. judgeEvaluate: calls judge LLM and returns consensusReached=false when no CONSENSUS_REACHED
11. judgeEvaluate: returns consensusReached=true when judge returns CONSENSUS_REACHED
12. judgeEvaluate: detects shallow agreement when >= 2 agreement patterns found
13. judgeEvaluate: falls back to bestEffortJudgeResult when judge LLM throws non-overflow error
14. judgeEvaluate: detects excessive quoting (>= 3 quoting patterns in current round)
15. judgeEvaluate: uses judgeInstructions in the prompt when provided
16. conductFinalVote: calls judge with ballot and returns winner/reasoning
17. conductFinalVote: includes judgeInstructions in the final vote prompt
18. conductFinalVote: falls back to bestEffortJudgeResult when judge throws

## Test Results

996 tests pass (18 new + 978 from previous plans):
- 938 existing tests unchanged from Plan 01
- 7 judge integration tests from Plan 01
- 21 ConversationHistory unit tests from Plan 01
- 12 AgentTurnExecutor unit tests from Plan 02
- 18 new JudgeEvaluator unit tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] parseStructuredOutput, getChatOptions, createCallAbortController also moved**

- **Found during:** Task 1 implementation
- **Issue:** The plan listed 6 methods to extract (getRoundForEntry, buildCaseFile, prepareJudgeContext, bestEffortJudgeResult, judgeEvaluate, conductFinalVote), but these 3 helper methods were exclusively called from within the judge methods and had no callers in ConversationManager after extraction
- **Fix:** Moved all 3 to JudgeEvaluator as private methods (same as AgentTurnExecutor did in Plan 02). CM no longer imports TokenCounter or DiscussionStateExtractor.
- **Files modified:** src/core/JudgeEvaluator.ts, src/core/ConversationManager.ts
- **Commit:** 189de09

**2. [Rule 2 - Missing functionality] streamOutput and getPersistentlyFailedAgents added to deps**

- **Found during:** Task 1 — judgeEvaluate needs `streamOutput` for `process.stdout.write('\n')` after streaming responses, and needs `getPersistentlyFailedAgents` for rubber-stamp detection (filtering active agents)
- **Fix:** Added both fields to `JudgeEvaluatorDeps` interface
- **Files modified:** src/core/JudgeEvaluator.ts, src/core/ConversationManager.ts
- **Commit:** 189de09

**3. [Rule 2 - Missing functionality] invalidateCache() + onCacheInvalidated callback update**

- **Found during:** Task 1 — ConversationHistory's `onCacheInvalidated` callback was resetting `this.cachedRecentDiscussion` and `this.lastJudgeCacheRound` on CM, but those properties moved to JudgeEvaluator
- **Fix:** Added `invalidateCache()` public method to JudgeEvaluator; updated the callback in CM constructor to call `this.judgeEvaluator.invalidateCache()` with a lazy `if (this.judgeEvaluator)` guard since JudgeEvaluator is instantiated after ConversationHistory
- **Files modified:** src/core/JudgeEvaluator.ts, src/core/ConversationManager.ts
- **Commit:** 189de09

**4. [Rule 2 - Missing functionality] bestEffortJudgeResult made public**

- **Found during:** Task 1 — ConversationManager's degraded-path and abort-path catch blocks call `bestEffortJudgeResult()` directly as a last resort when `conductFinalVote` itself throws. Making it public preserves this behavior without forcing `(as any)` casts.
- **Fix:** Changed `private bestEffortJudgeResult()` to `bestEffortJudgeResult()` (public) with updated JSDoc
- **Files modified:** src/core/JudgeEvaluator.ts
- **Commit:** 189de09

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/core/JudgeEvaluator.ts
- FOUND: src/core/__tests__/JudgeEvaluator.test.ts
- FOUND: commit 1d47b54 (failing tests)
- FOUND: commit 189de09 (implementation)
