---
phase: 08-output-completeness
plan: 01
subsystem: output
tags: [formatting, session-manifest, typescript, jest, tdd]

# Dependency graph
requires:
  - phase: 07-cost-pipeline
    provides: SessionManager, DiscussionRunner, and cost tracking already wired
provides:
  - Degraded-status banner rendering in MarkdownFormatter for completed_degraded status
  - outputFiles.transcript and outputFiles.json populated in session manifest before saveSession
  - consensusReached field on SessionSummary interface and in index manifest
affects:
  - 09-data-correctness (shares SessionManager, outputFiles, session listing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD cycle: write failing test, minimal implementation, verify green"
    - "jest.mock hoisting workaround: use mutable object reference or last-item filter for writeFile call inspection"

key-files:
  created: []
  modified:
    - src/consult/formatting/MarkdownFormatter.ts
    - src/consult/formatting/__tests__/Formatters.test.ts
    - src/mcp/DiscussionRunner.ts
    - src/mcp/__tests__/DiscussionRunner.test.ts
    - src/types/index.ts
    - src/core/SessionManager.ts
    - src/core/__tests__/SessionManager.test.ts

key-decisions:
  - "Access sessionsDir via bracket notation (sessionManager['sessionsDir']) to read the private field path for outputFiles.json construction"
  - "Use last writeFile call (not first) when verifying index manifest writes — initialize() also writes an empty manifest before updateIndexManifest"
  - "jest.mock hoisting: use mutable object (const mockState = {}) as shared state between factory and tests, or use filter+last instead of find"

patterns-established:
  - "outputFiles path population: set after createSessionManifest, before saveSession"
  - "SessionSummary extension: add field to interface, copy in updateIndexManifest"

requirements-completed: [COST-03, DATA-04, DATA-05]

# Metrics
duration: 18min
completed: 2026-04-06
---

# Phase 8 Plan 1: Output Completeness Summary

**Three output metadata gaps closed: degraded-status banner in MarkdownFormatter, outputFiles paths in session manifest, and consensusReached in session listing — all with TDD coverage.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-06T00:00:00Z
- **Completed:** 2026-04-06T00:18:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- MarkdownFormatter now renders a visible `> **Degraded Results**` banner when `result.status === 'completed_degraded'`, surfacing judge fallback to callers
- DiscussionRunner now sets `session.outputFiles.transcript` and `session.outputFiles.json` to actual file paths before calling `saveSession`, eliminating empty string fields
- `SessionSummary` interface gains `consensusReached?: boolean` and `updateIndexManifest` copies the value from session, enabling callers to read consensus outcome from listing without loading full session JSON

## Task Commits

Each task was committed atomically:

1. **Task 1: Add degraded-status banner to MarkdownFormatter** - `a21e576` (feat)
2. **Task 2: Populate outputFiles paths in DiscussionRunner** - `e645754` (feat)
3. **Task 3: Add consensusReached to SessionSummary and listing** - `90e41f0` (feat)

## Files Created/Modified
- `src/consult/formatting/MarkdownFormatter.ts` - Added completed_degraded banner block before partial banner
- `src/consult/formatting/__tests__/Formatters.test.ts` - Two new tests for degraded banner
- `src/mcp/DiscussionRunner.ts` - Set outputFiles.transcript and outputFiles.json after createSessionManifest
- `src/mcp/__tests__/DiscussionRunner.test.ts` - Two new tests verifying non-empty outputFiles paths
- `src/types/index.ts` - Added `consensusReached?: boolean` to SessionSummary interface
- `src/core/SessionManager.ts` - Copy consensusReached from session to summary in updateIndexManifest
- `src/core/__tests__/SessionManager.test.ts` - Two new tests for consensusReached in index manifest

## Decisions Made
- Access `sessionManager['sessionsDir']` via bracket notation to build the `outputFiles.json` path — avoids exposing the private field while keeping implementation simple
- When verifying manifest writes in tests, use the LAST writeFile call with `"sessions"` in the body, since `initialize()` writes an empty manifest before `updateIndexManifest` writes the populated one

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jest.mock hoisting required test restructuring for SessionManager tests**
- **Found during:** Task 3 (consensusReached test implementation)
- **Issue:** Initial approach using `let mockWriteFileCalls = []` failed — jest hoists `jest.mock()` before variable declarations, leaving the captured variable in TDZ when mock factory runs
- **Fix:** Switched to inspecting `writeFileMock.mock.calls` (accessed via `import * as fsMock`) and filtering for the LAST write call containing `"sessions"` (not the first, which is the empty manifest from `initialize()`)
- **Files modified:** src/core/__tests__/SessionManager.test.ts
- **Verification:** All 4 SessionManager tests pass
- **Committed in:** 90e41f0 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking test infrastructure issue)
**Impact on plan:** No scope creep. Required adapting test assertions to account for multiple writeFile calls per saveSession invocation.

## Issues Encountered
- jest.mock hoisting is a recurring footgun — the LAST writeFile call filter pattern is now documented as an established pattern for future tests that inspect `updateIndexManifest` behavior.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three output completeness requirements met (COST-03, DATA-04, DATA-05)
- Session listing now returns consensusReached, ready for consumer integration
- Phase 9 (data-correctness) can proceed: QUAL-05, DATA-01, DATA-02, DATA-03

---
*Phase: 08-output-completeness*
*Completed: 2026-04-06*
