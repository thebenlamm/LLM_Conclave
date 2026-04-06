# Requirements: LLM Conclave Refactoring

**Defined:** 2026-04-06
**Core Value:** Every refactoring must reduce ongoing friction for future changes without breaking existing behavior.

## v1 Requirements

Requirements for this refactoring milestone. Each maps to roadmap phases.

### Type Safety

- [x] **TYPE-01**: Define `DiscussionHistoryEntry` type capturing all 10+ fields currently accessed on history entries
- [x] **TYPE-02**: Replace `any[]` conversation history in ConversationManager with typed `DiscussionHistoryEntry[]`
- [x] **TYPE-03**: Type the `config` parameter in ConversationManager constructor (replace `any` with `Config` + extensions)
- [x] **TYPE-04**: Remove dead `msg.name` accesses in `server.ts` (lines 950 and 1099)

### ConversationManager Decomposition

- [ ] **CONV-01**: Extract `ConversationHistory` class owning `groupHistoryByRound()`, `prepareMessagesForAgent()`, `prepareMessagesWithBudget()`, `compressHistory()`, `formatEntryAsMessage()`, and round compression
- [ ] **CONV-02**: Extract `AgentTurnExecutor` class owning single-agent call cycle (retry, empty-response retry, connection-error retry, model fallback, circuit breaker, abort bridging)
- [ ] **CONV-03**: Extract `JudgeEvaluator` class owning `judgeEvaluate()`, `conductFinalVote()`, `bestEffortJudgeResult()`, `buildCaseFile()`, `prepareJudgeContext()`, shallow-agreement/quoting/rubber-stamp detection, and judge model fallback

### MCP Server Deduplication

- [ ] **MCP-01**: Extract `DiscussionRunner` abstraction encapsulating shared orchestration setup (config resolution, persona application, judge creation, EventBus wiring, ConversationManager construction, abort/timeout, progress heartbeat, session saving)
- [ ] **MCP-02**: Rewrite `handleDiscuss` to delegate to `DiscussionRunner`
- [ ] **MCP-03**: Rewrite REST `/api/discuss` endpoint to delegate to `DiscussionRunner`
- [ ] **MCP-04**: Rewrite `handleContinue` to delegate to `DiscussionRunner` (with prior history injection as configuration point)

### Orchestrator Assessment

- [ ] **ORCH-01**: Audit usage of `Orchestrator` class — determine if actively used or legacy
- [ ] **ORCH-02**: Audit usage of `IterativeCollaborativeOrchestrator` — determine if actively used or legacy
- [ ] **ORCH-03**: Based on audit, either define minimal shared interface (`AgentPool` + typed history) or deprecate unused orchestrators

### CostTracker Fixes

- [x] **COST-01**: Fix double-logging bug in `LLMProvider.chat()` (catch + finally both log to CostTracker)
- [x] **COST-02**: Update stale pricing data (models with $0 pricing: gemini-3-pro, grok-3, gemini-exp-1206)
- [x] **COST-03**: Add `readonly` modifier to `CostTracker.pricing` to prevent runtime mutation
- [ ] **COST-04**: Scope CostTracker per consultation instead of global singleton (pass via constructor/options)

### Test Safety Net

- [ ] **TEST-01**: Add integration tests for judge evaluation path with context compression (prerequisite for CONV-03 extraction)

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Testing

- **TEST-02**: Add integration tests for MCP handler continuation flow
- **TEST-03**: Increase test coverage for IterativeCollaborativeOrchestrator

### Further Cleanup

- **CLEAN-01**: Extract `PARTICIPATION_REQUIREMENT` and `STRUCTURED_OUTPUT_INSTRUCTION` from PersonaSystem into constants
- **CLEAN-02**: Reduce `: any` annotations across remaining files (currently 225 total)
- **CLEAN-03**: Consolidate fallback model selection logic (duplicated in ConversationManager and judge methods)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New LLM providers | Refactoring only — no new functionality |
| Consult subdomain restructuring | Already well-organized with clear boundaries |
| MCP tool schema changes | Callers must not notice any difference |
| Performance optimization | Not the goal unless it falls out naturally |
| Framework/runtime migration | TypeScript + Node.js stays |
| UI or CLI changes | Transport layer stays the same |
| ContinuationHandler model availability stub | Known incomplete stub at `ContinuationHandler.ts:248-258` — not part of the 5 key findings, fix separately |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TYPE-01 | Phase 1 | Complete |
| TYPE-02 | Phase 1 | Complete |
| TYPE-03 | Phase 1 | Complete |
| TYPE-04 | Phase 1 | Complete |
| COST-01 | Phase 1 | Complete |
| COST-02 | Phase 1 | Complete |
| COST-03 | Phase 1 | Complete |
| COST-04 | Phase 1 | Pending |
| TEST-01 | Phase 2 | Pending |
| CONV-01 | Phase 2 | Pending |
| CONV-02 | Phase 2 | Pending |
| CONV-03 | Phase 2 | Pending |
| MCP-01 | Phase 3 | Pending |
| MCP-02 | Phase 3 | Pending |
| MCP-03 | Phase 3 | Pending |
| MCP-04 | Phase 3 | Pending |
| ORCH-01 | Phase 3 | Pending |
| ORCH-02 | Phase 3 | Pending |
| ORCH-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
