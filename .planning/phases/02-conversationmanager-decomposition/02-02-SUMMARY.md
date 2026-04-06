---
phase: "02-conversationmanager-decomposition"
plan: "02"
subsystem: "core"
tags: ["refactoring", "extraction", "testing", "ConversationManager", "AgentTurnExecutor"]
dependency_graph:
  requires: ["02-01 (ConversationHistory)"]
  provides: ["AgentTurnExecutor class", "agent turn unit tests"]
  affects: ["ConversationManager", "all paths that call agentTurn"]
tech_stack:
  added: ["AgentTurnExecutor (new class)"]
  patterns: ["dependency injection via deps object", "two-phase constructor init (executor before history)", "delegation pattern"]
key_files:
  created:
    - src/core/AgentTurnExecutor.ts
    - src/core/__tests__/AgentTurnExecutor.test.ts
  modified:
    - src/core/ConversationManager.ts
decisions:
  - "createCallAbortController retained in ConversationManager because judge methods (judgeEvaluate, conductFinalVote) still use it — Plan 03 will move it to JudgeEvaluator when those methods are extracted"
  - "Two-phase constructor init: AgentTurnExecutor created first with null history reference, then ConversationHistory created, then history wired back via deps.history assignment — avoids circular dependency"
  - "ContextOptimizer import removed from ConversationManager — only used in pushAgentResponse which is now in AgentTurnExecutor"
  - "AgentTurnExecutor deps use type imports for EventBus, TaskRouter, CostTracker, ConversationHistory to avoid circular import issues"
metrics:
  duration: "~7 minutes"
  completed: "2026-04-06"
  tasks_completed: 1
  files_created: 2
  files_modified: 1
---

# Phase 02 Plan 02: AgentTurnExecutor Extraction Summary

## One-liner

AgentTurnExecutor class extracted from ConversationManager owning the full single-agent call cycle: retry, connection-error retry, model fallback, circuit breaker, and abort bridging.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | Add failing tests for AgentTurnExecutor | b42ba3b | src/core/__tests__/AgentTurnExecutor.test.ts |
| 1 (GREEN) | Extract AgentTurnExecutor + update ConversationManager | e5b7523 | src/core/AgentTurnExecutor.ts, src/core/ConversationManager.ts |

## What Was Built

### AgentTurnExecutor (`src/core/AgentTurnExecutor.ts`)

New class with constructor accepting `AgentTurnDeps` interface:

```typescript
export interface AgentTurnDeps {
  agents: { [key: string]: any };
  config: Config;
  conversationHistory: DiscussionHistoryEntry[];
  history: ConversationHistory;
  streamOutput: boolean;
  eventBus?: EventBus;
  abortSignal?: AbortSignal;
  taskRouter: TaskRouter | null;
  costTracker: CostTracker;
}
```

Methods moved from ConversationManager (preserving exact logic):
- `async agentTurn(agentName)` — full 260-line agent call cycle
- `private recordAgentFailure(agentName, reason)` — circuit breaker logic
- `private pushAgentResponse(text, speaker, model)` — pushes to `deps.conversationHistory`
- `private recordAgentSuccess(agentName)` — resets consecutive failure counter
- `private createCallAbortController(timeoutMs)` — abort signal bridging
- `private getFallbackModel(currentModel)` — fallback model selection
- `private getChatOptions(agentName)` — streaming callback options

Public getters added:
- `getPersistentlyFailedAgents(): Set<string>` — for CM round loop checks
- `getAgentSubstitutions(): Map<...>` — for CM result reporting

### ConversationManager changes

1. Import added: `import AgentTurnExecutor from './AgentTurnExecutor.js'`
2. Properties removed: `persistentlyFailedAgents`, `consecutiveAgentFailures`, `agentSubstitutions`
3. Property added: `private agentExecutor!: AgentTurnExecutor`
4. Constructor: two-phase init — agentExecutor created before history, then history wired into executor
5. All `this.agentTurn(...)` calls → `this.agentExecutor.agentTurn(...)`
6. All `this.persistentlyFailedAgents` reads → `this.agentExecutor.getPersistentlyFailedAgents()`
7. All `this.agentSubstitutions` reads → `this.agentExecutor.getAgentSubstitutions()`
8. 6 extracted method bodies removed
9. `ContextOptimizer` import removed (no longer used in CM)
10. Comment block updated to note extraction
11. `createCallAbortController` **retained** in CM — judge methods still need it (Plan 03 will move it)

### Unit Tests (`src/core/__tests__/AgentTurnExecutor.test.ts`)

12 tests covering:
1. Circuit breaker skips agent after entering persistentlyFailedAgents
2. Successful call pushes response with correct speaker/model
3. Empty response triggers one retry before recording failure
4. Connection error triggers retry before fallback logic
5. prepareMessagesWithBudget returning null records token_budget_exceeded failure
6. Two consecutive failures trip circuit breaker
7. getFallbackModel returns model from different provider family (3 assertions)
8. getFallbackModel returns gpt-4o-mini for unknown models
9. createCallAbortController aborts immediately when external signal already aborted
10. getAgentSubstitutions returns empty map initially
11. Model fallback succeeds on 429 rate limit error
12. recordAgentSuccess resets counter so interleaved success prevents circuit breaker

## Test Results

978 tests pass (12 new + 966 existing):
- 966 tests unchanged from Plan 01
- 12 new AgentTurnExecutor unit tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] createCallAbortController also needed by judge methods**

- **Found during:** Task 1 implementation
- **Issue:** The plan said to remove `createCallAbortController` from ConversationManager, but `judgeEvaluate` and `conductFinalVote` (not extracted in this plan) still call `this.createCallAbortController()`
- **Fix:** Retained `createCallAbortController` in ConversationManager with a comment noting it will move to JudgeEvaluator in Plan 03. AgentTurnExecutor has its own copy.
- **Files modified:** src/core/ConversationManager.ts
- **Commit:** e5b7523

**2. [Rule 2 - Missing functionality] Two-phase constructor init for circular deps**

- **Found during:** Task 1 — ConversationHistory needs `getAgentSubstitutions` callback referencing agentExecutor, but agentExecutor needs history to be passed during construction
- **Fix:** Create agentExecutor first with `null` history placeholder, then create history (it references agentExecutor via closure), then wire history back into agentExecutor via `deps.history = this.history`
- **Files modified:** src/core/ConversationManager.ts
- **Commit:** e5b7523

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/core/AgentTurnExecutor.ts
- FOUND: src/core/__tests__/AgentTurnExecutor.test.ts
- FOUND: commit b42ba3b (failing tests)
- FOUND: commit e5b7523 (implementation)
