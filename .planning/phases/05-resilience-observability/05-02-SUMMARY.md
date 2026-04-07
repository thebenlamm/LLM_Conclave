---
phase: 05-resilience-observability
plan: 02
subsystem: orchestration
tags: [resilience, fallback, judge, token-counting, consult]

requires:
  - phase: 01-foundation
    provides: CostTracker DI, ProviderFactory with costTracker param
provides:
  - Judge fallback in R2/R3/R4 consult rounds (cross-provider)
  - completed_degraded status for judge-degraded consultations
  - Partial result return on pulse-cancel instead of exception
  - Actual token counting in createFinalResult (replaces estimates)
  - Partial confidence from R1 agent scores when no verdict exists
affects: [consult-output-consumers, session-persistence, metrics]

tech-stack:
  added: []
  patterns: [cross-provider-fallback, degraded-status-tracking]

key-files:
  created: []
  modified:
    - src/orchestration/ConsultOrchestrator.ts
    - src/types/consult.ts

key-decisions:
  - "Cross-provider fallback pattern: gemini->claude, claude->gemini, others->gemini"
  - "Hoist messages before try block in R2 so catch can reuse them for fallback"
  - "Partial confidence derived from average of R1 agent confidence scores"
  - "createPartialResult delegates to createFinalResult then overrides status"

patterns-established:
  - "Judge fallback: try primary, catch -> create fallback provider, set judgeDegraded flag"
  - "Degraded tracking: private boolean flag checked after result construction"

requirements-completed: [RESIL-02, RESIL-03, RESIL-04, OBSRV-02]

duration: 4min
completed: 2026-04-07
---

# Phase 05 Plan 02: Consult Resilience Summary

**Judge fallback in synthesis/cross-exam/verdict rounds with degraded status tracking, partial abort returns, and actual token counts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-07T01:39:22Z
- **Completed:** 2026-04-07T01:43:39Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Judge failures in R2 Synthesis, R3 Cross-Exam synthesis, and R4 Verdict now fall back to an alternative model instead of aborting
- Pulse-cancel returns a partial ConsultationResult with perspectives and averaged confidence from R1 agents
- New `completed_degraded` status tracks when judge fallback was used during a run
- Token counts in final results now use actual sums from agentResponses instead of pre-flight CostEstimator values

## Task Commits

Each task was committed atomically:

1. **Task 1: Add judge fallback, fix partial abort, degraded status, and token counting** - `56171e7` (feat)
2. **Task 2: Run tests and fix any failures from changes** - No commit needed (all tests pass, 0 regressions)

## Files Created/Modified
- `src/orchestration/ConsultOrchestrator.ts` - Judge fallback in 3 round catch blocks, judgeDegraded flag, actual token calculation, partial abort return, confidence averaging
- `src/types/consult.ts` - Added `completed_degraded` to status union on ConsultationResult and PartialConsultationResult

## Decisions Made
- Cross-provider fallback pattern reuses existing JudgeEvaluator convention: gemini->claude-sonnet-4-5, claude->gemini-2.5-flash, others->gemini-2.5-flash
- Messages array hoisted before try block in R2 Synthesis so the catch block can reuse them for fallback call
- Partial confidence calculated as average of R1 agent confidence scores when no verdict artifact exists
- createPartialResult delegates to createFinalResult then overrides status/state, keeping result structure consistent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Consult resilience complete with judge fallback, degraded tracking, and accurate token reporting
- Ready for downstream consumers to handle `completed_degraded` status in session display/metrics

---
*Phase: 05-resilience-observability*
*Completed: 2026-04-07*
