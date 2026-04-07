---
phase: 09-data-correctness
plan: 01
subsystem: consult
tags: [logging, ConsultationFileLogger, ConsultOrchestrator, providers, filenames]

# Dependency graph
requires:
  - phase: 08-output-completeness
    provides: ConsultationFileLogger and ConsultOrchestrator as stable base for data quality fixes
provides:
  - Fixed log filenames: {consultationId}.json and {consultationId}.md without double consult- prefix
  - Accurate provider names (claude, openai, gemini, grok, mistral) in ConsultationResult agents array and all AgentResponse objects
affects: [analytics, session manifests, consult-stats dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider display name: agent.provider.getProviderName().toLowerCase() for all AgentResponse.provider fields"
    - "Log filename: use consultationId directly without re-adding prefix that generateId already includes"

key-files:
  created: []
  modified:
    - src/consult/logging/ConsultationFileLogger.ts
    - src/consult/logging/__tests__/ConsultationFileLogger.test.ts
    - src/orchestration/ConsultOrchestrator.ts
    - src/orchestration/__tests__/ConsultOrchestrator.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorRound2.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorRound3.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorRound4.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorCostGate.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorFiltering.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorHedging.test.ts
    - src/orchestration/__tests__/ConsultOrchestratorPulse.test.ts

key-decisions:
  - "HedgedRequestManager agentConfig.provider must remain agent.model (not display name) — ProviderFactory uses model name as routing key"
  - "Use .toLowerCase() on getProviderName() result for consistent lowercase provider names (claude not Claude)"
  - "Test mocks require getProviderName() method to satisfy the updated ConsultOrchestrator code"

patterns-established:
  - "Provider attribution: always call agent.provider.getProviderName().toLowerCase() for display/result fields; agent.model for routing keys"
  - "Log filename: consultationId IS the full filename base — no prefix needed since generateId('consult') already includes it"

requirements-completed: [DATA-01, DATA-03]

# Metrics
duration: 8min
completed: 2026-04-07
---

# Phase 09 Plan 01: Data Correctness (Filename + Provider) Summary

**Fixed double consult- prefix in log filenames and replaced 7 hardcoded 'unknown' provider fields with actual provider names from getProviderName()**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-07T05:30:00Z
- **Completed:** 2026-04-07T05:38:32Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Log files now named `{consultationId}.json` and `{consultationId}.md` — the double `consult-consult-` prefix is gone
- All 7 AgentResponse.provider and ConsultationResult.agents[].provider fields now populated from `agent.provider.getProviderName().toLowerCase()`
- HedgedRequestManager agentConfig.provider preserved as `agent.model` (routing key, not display name)
- Added 2 new filename tests and updated 8 test files to include getProviderName mock

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix duplicate consult- prefix in log filenames (DATA-01)** - `589cd6f` (fix)
2. **Task 2: Replace hardcoded 'unknown' provider with actual provider name (DATA-03)** - `6b778c0` (fix)

**Plan metadata:** _(docs commit to follow)_

## Files Created/Modified
- `src/consult/logging/ConsultationFileLogger.ts` - writeJsonLog and writeMarkdownLog use `${result.consultationId}` without consult- prefix
- `src/consult/logging/__tests__/ConsultationFileLogger.test.ts` - Updated 2 path assertions, added 2 new no-double-prefix tests
- `src/orchestration/ConsultOrchestrator.ts` - 7 provider field sites replaced with getProviderName().toLowerCase()
- `src/orchestration/__tests__/ConsultOrchestrator*.test.ts` (8 files) - Added getProviderName mock to provider mocks

## Decisions Made
- HedgedRequestManager agentConfig.provider must remain `agent.model` — ProviderFactory uses model string as routing key, not a provider display name. Only AgentResponse.provider and ConsultationResult.agents[].provider got the fix.
- Use `.toLowerCase()` on getProviderName() output so result values are `claude`, `openai`, `gemini`, `grok`, `mistral` (not capitalized).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mocks missing getProviderName method**
- **Found during:** Task 2 (provider name fix)
- **Issue:** 8 test files created mock providers without `getProviderName`, causing TypeError when code now calls it
- **Fix:** Added `getProviderName: jest.fn().mockReturnValue('MockProvider')` to each mock
- **Files modified:** 8 ConsultOrchestrator test files
- **Verification:** All 152 orchestration tests pass
- **Committed in:** 6b778c0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: incomplete test mocks)
**Impact on plan:** Required to make test suite pass after production code change. No scope creep.

## Issues Encountered
None — all fixes straightforward once the HedgedRequestManager routing key distinction was applied correctly.

## Next Phase Readiness
- DATA-01 and DATA-03 resolved; consult log files now correctly named and provider-attributed
- Phase 09 Plan 02 can proceed (DATA-02 timestamps or remaining data quality items)

## Self-Check: PASSED

All files present. All commits verified (589cd6f, 6b778c0).

---
*Phase: 09-data-correctness*
*Completed: 2026-04-07*
