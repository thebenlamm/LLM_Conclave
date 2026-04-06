---
phase: 01-foundation
plan: 03
subsystem: core
tags: [dependency-injection, cost-tracking, providers, singleton]

# Dependency graph
requires:
  - phase: 01-02
    provides: readonly CostTracker.pricing and LLMProvider with clean try/catch logging

provides:
  - Injectable CostTracker through the full provider chain
  - Public CostTracker constructor (no longer private)
  - LLMProvider accepts optional costTracker, falls back to singleton
  - ProviderFactory threads costTracker to all provider constructors
  - ConversationManager accepts costTracker in options
  - ConsultOrchestrator accepts costTracker in ConsultOrchestratorOptions

affects: [phase-02, ConversationManager decomposition, future per-consultation cost isolation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency injection via constructor parameter with singleton fallback (?? getInstance())"
    - "Options bag extension: adding fields to existing options interfaces without breaking callers"

key-files:
  created: []
  modified:
    - src/core/CostTracker.ts
    - src/providers/LLMProvider.ts
    - src/providers/ProviderFactory.ts
    - src/providers/ClaudeProvider.ts
    - src/providers/OpenAIProvider.ts
    - src/providers/GeminiProvider.ts
    - src/providers/GrokProvider.ts
    - src/providers/MistralProvider.ts
    - src/core/ConversationManager.ts
    - src/orchestration/ConsultOrchestrator.ts
    - src/types/consult.ts
    - src/providers/__tests__/ProviderFactory.test.ts

key-decisions:
  - "All ProviderFactory.createProvider() calls in ConversationManager and ConsultOrchestrator updated to thread costTracker (not just initializeAgents, but all fallback provider creation too)"
  - "Tests updated to match new constructor signatures — expected behavior, not a deviation"

patterns-established:
  - "Dependency injection pattern: optional param with ?? CostTracker.getInstance() fallback — consistent across all 7 callers"

requirements-completed: [COST-04]

# Metrics
duration: 18min
completed: 2026-04-06
---

# Phase 01 Plan 03: Injectable CostTracker Summary

**CostTracker made injectable through the full provider chain: ConsultOrchestrator -> ConversationManager -> ProviderFactory -> all 5 providers, with singleton fallback for backward compatibility**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-06T16:00:00Z
- **Completed:** 2026-04-06T16:18:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- CostTracker constructor made public — can now be instantiated per consultation for cost isolation
- LLMProvider.chat() uses injected `this.costTracker` instead of direct singleton calls
- ProviderFactory threads costTracker to all 5 concrete provider constructors (Claude, OpenAI, Gemini, Grok, Mistral)
- ConversationManager and ConsultOrchestrator accept optional costTracker, falling back to singleton
- All 7 ProviderFactory.createProvider() calls across ConversationManager and ConsultOrchestrator updated (agents, judge providers, fallback providers)
- All 938 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Make CostTracker publicly constructable and inject into LLMProvider and ProviderFactory** - `bca4784` (feat)
2. **Task 2: Thread CostTracker into ConversationManager and ConsultOrchestrator** - `55df683` (feat)

## Files Created/Modified

- `src/core/CostTracker.ts` - Constructor changed from `private` to public
- `src/providers/LLMProvider.ts` - Added `protected costTracker: CostTracker` field and optional constructor param
- `src/providers/ProviderFactory.ts` - Added `costTracker?: CostTracker` to options type, threads to all providers
- `src/providers/ClaudeProvider.ts` - Added optional `costTracker` 4th constructor param, passes to super()
- `src/providers/OpenAIProvider.ts` - Added optional `costTracker` 3rd constructor param, passes to super()
- `src/providers/GeminiProvider.ts` - Added optional `costTracker` 3rd constructor param, passes to super()
- `src/providers/GrokProvider.ts` - Added optional `costTracker` 3rd constructor param, passes to super()
- `src/providers/MistralProvider.ts` - Added optional `costTracker` 3rd constructor param, passes to super()
- `src/core/ConversationManager.ts` - Added `private costTracker: CostTracker` field, options type extended, all 4 createProvider() calls updated
- `src/orchestration/ConsultOrchestrator.ts` - Added `private costTracker: CostTracker` field, all 6 createProvider() calls updated, DebateValueAnalyzer uses injected tracker
- `src/types/consult.ts` - Added `costTracker?: CostTracker` to ConsultOrchestratorOptions
- `src/providers/__tests__/ProviderFactory.test.ts` - Updated 26 test assertions to match new constructor signatures

## Decisions Made

- **All ProviderFactory.createProvider() calls updated**: Plan specified 4 calls in ConversationManager and the ConsultOrchestrator initializeAgents(). Discovered 3 additional judge provider creation sites in ConsultOrchestrator (Synthesis, Verdict, Cross-Exam judges). Updated all 6 ConsultOrchestrator calls for completeness.
- **ClaudeProvider gets 4th param**: ClaudeProvider already had `apiKey` and `options` params, so `costTracker` becomes the 4th param. Consistent with the pattern for all other providers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated ProviderFactory tests to match new constructor signatures**
- **Found during:** Task 2 verification (npm test)
- **Issue:** 26 tests in ProviderFactory.test.ts were asserting exact constructor call arguments like `toHaveBeenCalledWith('gpt-4o')` but now providers are called with `('gpt-4o', undefined, undefined)` due to the new `apiKey` and `costTracker` parameters. Tests failed with "Received: 'gpt-4o', undefined, undefined".
- **Fix:** Updated all 26 test assertions to include the `undefined, undefined` (or `undefined, undefined, undefined` for Claude's 4th param)
- **Files modified:** src/providers/__tests__/ProviderFactory.test.ts
- **Verification:** All 938 tests pass
- **Committed in:** `55df683` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — tests needed updating for changed signatures)
**Impact on plan:** Expected side effect of adding constructor parameters. Tests now accurately document the new API.

## Issues Encountered

None — plan executed cleanly. The singleton fallback pattern (`?? CostTracker.getInstance()`) appears in ConversationManager and LLMProvider as designed; these are the intentional backward-compat defaults, not old singleton calls.

## Next Phase Readiness

- CostTracker injection chain is complete and fully backward compatible
- Callers that don't pass a `costTracker` continue to use the singleton transparently
- Foundation for per-consultation cost isolation is in place — future phases can pass a fresh `new CostTracker()` to isolate costs per call
- Phase 01-foundation is complete with all 3 plans executed

---
*Phase: 01-foundation*
*Completed: 2026-04-06*
