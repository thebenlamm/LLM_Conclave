---
phase: 07-cost-pipeline
plan: 01
subsystem: api
tags: [cost-tracking, cost-pipeline, discuss, session, formatting]

# Dependency graph
requires:
  - phase: 05-observability
    provides: Per-session CostTracker wired through DiscussionRunner; result.cost object on ConversationManager output
provides:
  - Real cost data (tokens, USD) in formatDiscussionResult markdown output
  - Real cost data in formatDiscussionResultJson (tokens.input/output/total, cost_usd)
  - Session manifest confirmed to store CostTracker cost data with fallback to zeros
affects: [08-output-completeness, 09-data-correctness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read result.cost from ConversationManager output; never fabricate cost from heuristics"
    - "Graceful fallback: if costData absent or totalCalls==0, display 'unavailable' not an estimate"

key-files:
  created:
    - src/core/__tests__/SessionManager.test.ts
  modified:
    - src/mcp/server.ts
    - src/mcp/__tests__/server.handlers.test.ts

key-decisions:
  - "Remove msgCount*750 heuristic entirely — no fallback estimate, show 'unavailable' when cost data absent"
  - "formatDiscussionResultJson field rename: estimated_tokens -> tokens.{input,output,total}; estimated_cost -> cost_usd"

patterns-established:
  - "Cost display: always use result.cost from CostTracker; guard with costData.totalCalls > 0 check"

requirements-completed: [COST-01, COST-02]

# Metrics
duration: 8min
completed: 2026-04-06
---

# Phase 7 Plan 1: Cost Pipeline Summary

**Replaced msgCount*750 fabricated cost estimates with real CostTracker token/USD data in both discuss output formatters, and confirmed session manifest cost pipeline with tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-06T21:20:00Z
- **Completed:** 2026-04-06T21:28:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed heuristic `msgCount * 750` token estimation from `formatDiscussionResult` and `formatDiscussionResultJson`
- `formatDiscussionResult` now shows actual token breakdown (input/output) and precise USD cost from `result.cost`
- `formatDiscussionResultJson` now returns `tokens.{input,output,total}` and `cost_usd` fields (not `estimated_tokens`/`estimated_cost`)
- Added `createSessionManifest cost data (COST-01)` test block confirming cost pipeline from CostTracker through session manifest
- Added `Cost data in discuss output (COST-02)` test block confirming real cost appears in both markdown and JSON formatter output
- All 27 tests in the two test files pass; build succeeds with zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SessionManager cost pipeline test (COST-01)** - `526f9f3` (test)
2. **Task 2: Replace heuristic cost estimates with real CostTracker data in formatters (COST-02)** - `bee39e6` (feat)

**Plan metadata:** _(docs commit to follow)_

## Files Created/Modified
- `src/core/__tests__/SessionManager.test.ts` - New test file; two tests confirm createSessionManifest stores cost data and falls back to zeros when absent
- `src/mcp/server.ts` - Replaced heuristic block in both `formatDiscussionResult` and `formatDiscussionResultJson` with `result.cost` reads
- `src/mcp/__tests__/server.handlers.test.ts` - Added COST-02 test block; asserts markdown shows real tokens/cost, JSON returns tokens object and cost_usd, neither contains legacy estimated_* fields

## Decisions Made
- Remove the heuristic entirely rather than keeping it as a fallback — an incorrect estimate is worse than "unavailable", which signals callers to look at session JSON for actual data
- Rename `estimated_tokens`/`estimated_cost` in JSON output to `tokens`/`cost_usd` — cleaner API; heuristic names would mislead callers into thinking values are real

## Deviations from Plan

None - plan executed exactly as written. Both task implementations and tests were already partially in place from prior work; verified they met all acceptance criteria and committed the remaining changes.

## Issues Encountered

None - all tests green, build clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 8 (output-completeness: COST-03, DATA-04, DATA-05) can proceed — cost pipeline is fully wired
- Session manifest and tool responses now show real token/cost data to callers

---
*Phase: 07-cost-pipeline*
*Completed: 2026-04-06*
