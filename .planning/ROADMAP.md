# Roadmap: LLM Conclave Refactoring

## Overview

Three phases of behavior-preserving refactoring. Phase 1 lays the type foundation and fixes known bugs — quick wins that make the rest safer. Phase 2 decomposes the ConversationManager god class into focused modules, the highest-leverage structural change. Phase 3 eliminates the MCP handler duplication and resolves the orchestrator interface ambiguity. The MCP server works identically throughout.

## Phases

- [x] **Phase 1: Foundation** - Type safety, quick wins, and CostTracker fixes (completed 2026-04-06)
- [ ] **Phase 2: ConversationManager Decomposition** - Extract focused modules from the 2044-line god class
- [ ] **Phase 3: MCP Deduplication + Orchestrator Assessment** - Eliminate 3x handler duplication and audit legacy orchestrators

## Phase Details

### Phase 1: Foundation
**Goal**: The codebase has a solid type foundation and known bugs are fixed — enabling safe refactoring in subsequent phases
**Depends on**: Nothing (first phase)
**Requirements**: TYPE-01, TYPE-02, TYPE-03, TYPE-04, COST-01, COST-02, COST-03, COST-04
**Success Criteria** (what must be TRUE):
  1. `DiscussionHistoryEntry` type exists and `conversationHistory` throughout ConversationManager is typed `DiscussionHistoryEntry[]` with no `: any[]` on history arrays
  2. Failed LLM API calls appear exactly once in cost reports (no 2x token count entries)
  3. CostTracker pricing data is current for Gemini and Grok models (no $0 placeholders for models in active use)
  4. `CostTracker.pricing` is marked `readonly` and TypeScript rejects mutation attempts
  5. CostTracker is instantiable per consultation; ConsultOrchestrator and ConversationManager accept a CostTracker instance rather than calling `CostTracker.getInstance()` directly
  6. All tests pass and the MCP server handles `llm_conclave_discuss` and `llm_conclave_consult` requests identically to before
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Type safety: DiscussionHistoryEntry, Config typing, dead code removal
- [x] 01-02-PLAN.md — CostTracker fixes: double-logging bug, pricing updates, readonly
- [x] 01-03-PLAN.md — CostTracker injection: per-consultation instances through provider chain

### Phase 2: ConversationManager Decomposition
**Goal**: ConversationManager delegates to focused single-responsibility modules — history management, agent turn execution, and judge evaluation each live in their own class
**Depends on**: Phase 1
**Requirements**: TEST-01, CONV-01, CONV-02, CONV-03
**Success Criteria** (what must be TRUE):
  1. Integration tests exist for judge evaluation path with context compression (safety net for CONV-03 extraction)
  2. `ConversationHistory` class exists owning all history manipulation and compression logic; ConversationManager no longer contains `groupHistoryByRound`, `compressHistory`, or `formatEntryAsMessage` directly
  2. `AgentTurnExecutor` class exists owning the full agent call cycle (retry, fallback, circuit breaker); ConversationManager delegates single-agent execution to it
  3. `JudgeEvaluator` class exists owning judge logic (evaluate, vote, rubber-stamp detection); ConversationManager delegates judge evaluation to it
  5. ConversationManager is reduced by at least 50% from 2044 lines (under 1000 lines)
  6. All existing tests pass; free-form discussions via `llm_conclave_discuss` produce identical results
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md — Test safety net + ConversationHistory extraction
- [x] 02-02-PLAN.md — AgentTurnExecutor extraction
- [ ] 02-03-PLAN.md — JudgeEvaluator extraction

### Phase 3: MCP Deduplication + Orchestrator Assessment
**Goal**: MCP handler logic exists in one place, and the active/legacy status of all three orchestrators is documented and acted on
**Depends on**: Phase 1
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, ORCH-01, ORCH-02, ORCH-03
**Success Criteria** (what must be TRUE):
  1. `DiscussionRunner` abstraction exists; `handleDiscuss`, `handleContinue`, and REST `/api/discuss` each delegate to it — no three-way code duplication remains
  2. `handleDiscuss`, `handleContinue`, and REST `/api/discuss` contain no direct references to EventBus construction, AbortController setup, SessionManager saving, or ConversationManager construction — all delegated to `DiscussionRunner`
  3. The active/legacy status of `Orchestrator` and `IterativeCollaborativeOrchestrator` is recorded in code comments or a decision doc — no more uncertainty
  4. All three MCP tools (`llm_conclave_discuss`, `llm_conclave_consult`, `llm_conclave_continue`) respond identically to callers as before
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Type safety: DiscussionHistoryEntry, Config typing, dead code removal
- [ ] 01-02-PLAN.md — CostTracker fixes: double-logging bug, pricing updates, readonly
- [ ] 01-03-PLAN.md — CostTracker injection: per-consultation instances through provider chain

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-04-06 |
| 2. ConversationManager Decomposition | 1/3 | In Progress|  |
| 3. MCP Deduplication + Orchestrator Assessment | 0/? | Not started | - |
