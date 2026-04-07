---
phase: 05-resilience-observability
plan: 01
subsystem: observability
tags: [fallback-logging, cost-tracking, structured-events, CostTracker]

requires:
  - phase: 02-conversationmanager-decomposition
    provides: AgentTurnExecutor with fallback/circuit-breaker logic
  - phase: 03-mcp-deduplication-orchestrator-assessment
    provides: DiscussionRunner unified orchestration
provides:
  - Structured FALLBACK_EVENT JSON log on agent model substitution
  - Per-session CostTracker wiring in discuss pipeline
  - Cost data (totalCost, totalTokens, totalCalls) in ConversationManager result
affects: [session-persistence, monitoring, dashboards]

tech-stack:
  added: []
  patterns: [structured JSON event logging, per-session cost isolation via CostTracker DI]

key-files:
  created: []
  modified:
    - src/core/AgentTurnExecutor.ts
    - src/core/ConversationManager.ts
    - src/mcp/DiscussionRunner.ts
    - src/core/__tests__/AgentTurnExecutor.test.ts
    - src/mcp/__tests__/DiscussionRunner.test.ts

key-decisions:
  - "Cost field added to all 3 ConversationManager return paths (normal, degraded, aborted) not just the normal path"
  - "Used CostTracker.getSummary().totalTokens directly instead of reducing logs array — cleaner and consistent with existing API"

patterns-established:
  - "Structured event logging: JSON.stringify with event type, context fields, and ISO timestamp for machine-parseable observability"
  - "Per-session CostTracker: each DiscussionRunner.run() creates an isolated CostTracker instance for accurate per-session cost attribution"

requirements-completed: [RESIL-01, OBSRV-01]

duration: 4min
completed: 2026-04-07
---

# Phase 5 Plan 1: Fallback Logging & Cost Tracking Summary

**Structured FALLBACK_EVENT JSON logging on agent model substitution and per-session CostTracker wiring through the discuss pipeline for real cost data in session JSON**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-07T01:39:21Z
- **Completed:** 2026-04-07T01:44:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AgentTurnExecutor emits structured JSON FALLBACK_EVENT with agent, originalModel, fallbackModel, reason, timestamp when a model substitution succeeds
- ConversationManager includes cost field (totalCost, totalTokens, totalCalls) in all three return paths (normal, degraded, aborted)
- DiscussionRunner creates a per-session CostTracker and passes it to ConversationManager, replacing the singleton fallback for discuss sessions
- SessionManager now receives real cost data instead of zeros for discuss sessions

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests** - `13118f7` (test)
2. **Task 1 (GREEN): Implement fallback logging and cost wiring** - `6deddb4` (feat)

_Task 2 verified existing + new tests pass with no additional changes needed._

## Files Created/Modified
- `src/core/AgentTurnExecutor.ts` - Added structured FALLBACK_EVENT JSON log after successful fallback
- `src/core/ConversationManager.ts` - Added cost field to all 3 result return paths using CostTracker.getSummary()
- `src/mcp/DiscussionRunner.ts` - Import CostTracker, create per-session instance, pass to ConversationManager options
- `src/core/__tests__/AgentTurnExecutor.test.ts` - Added test for FALLBACK_EVENT structured JSON emission
- `src/mcp/__tests__/DiscussionRunner.test.ts` - Added test for CostTracker instance in ConversationManager options

## Decisions Made
- Added cost field to all 3 ConversationManager return paths (degraded, aborted, normal) rather than just the normal path per the plan. SessionManager reads result.cost from any return, so all paths need it for completeness (Rule 2 - missing critical functionality).
- Used CostTracker.getSummary().totalTokens.input/output directly instead of reducing individual logs. The getSummary() method already aggregates this data correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added cost to degraded and aborted return paths**
- **Found during:** Task 1 (implementation)
- **Issue:** Plan only specified adding cost to the normal return path, but ConversationManager has 3 return paths (normal, degraded, aborted). SessionManager reads result.cost from any result.
- **Fix:** Added cost field to all 3 return paths
- **Files modified:** src/core/ConversationManager.ts
- **Verification:** Build passes, all return paths include cost data
- **Committed in:** 6deddb4

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- without cost on all paths, degraded/aborted sessions would still have zero costs.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all cost data is wired from real CostTracker instances.

## Next Phase Readiness
- Cost data now flows through discuss pipeline end-to-end
- FALLBACK_EVENT structured logs enable monitoring/alerting on model substitutions
- Ready for Phase 05 Plan 02 or any downstream observability work

---
*Phase: 05-resilience-observability*
*Completed: 2026-04-07*
