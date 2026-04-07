---
phase: 06-judge-quality
plan: 02
subsystem: core
tags: [judge, guidance, deduplication, markdown, sentence-extraction]

requires:
  - phase: 02-conversationmanager-decomposition
    provides: JudgeEvaluator extracted class with judgeEvaluate and bestEffortJudgeResult

provides:
  - Prior guidance injection preventing duplicate judge directions across rounds
  - Markdown header filtering in bestEffortJudgeResult sentence extraction

affects: [judge-quality, discussion-quality]

tech-stack:
  added: []
  patterns:
    - "Prior guidance accumulation: priorGuidance[] stores each round's guidance, injected into next prompt"
    - "Line-level filtering before sentence regex: split by newlines, filter headers, rejoin before matching"

key-files:
  created: []
  modified:
    - src/core/JudgeEvaluator.ts
    - src/core/__tests__/JudgeEvaluator.test.ts

key-decisions:
  - "Filter markdown headers at line level (split/filter/join) rather than post-regex filtering — regex captures multi-line content as single sentences"
  - "Store priorGuidance only on non-consensus path — consensus ends the discussion so no future rounds need it"

patterns-established:
  - "Prior guidance pattern: accumulate guidance strings, inject into next prompt with explicit DO NOT repeat instruction"

requirements-completed: [QUAL-03, QUAL-04]

duration: 3min
completed: 2026-04-07
---

# Phase 06 Plan 02: Judge Guidance Deduplication and Markdown Header Filtering Summary

**Prior guidance injection with DO NOT repeat instruction prevents duplicate judge directions; markdown header filter ensures bestEffortJudgeResult extracts content sentences only**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T01:56:43Z
- **Completed:** 2026-04-07T01:59:40Z
- **Tasks:** 2 (TDD: 4 commits total)
- **Files modified:** 2

## Accomplishments
- Judge now sees its prior guidance each round with explicit instruction to give new, different direction
- bestEffortJudgeResult no longer extracts markdown headers (# ## ###) as "sentences"
- priorGuidance resets on cache invalidation, preserving clean state after compression
- All 24 JudgeEvaluator tests pass (was 12, added 12 new)

## Task Commits

Each task was committed atomically (TDD RED then GREEN):

1. **Task 1: Prior guidance injection (QUAL-03)**
   - `de8c01a` (test: failing tests for prior guidance)
   - `e1a9ec1` (feat: implement prior guidance injection)
2. **Task 2: Markdown header filtering (QUAL-04)**
   - `6684003` (test: failing tests for markdown header filtering)
   - `426d771` (feat: implement markdown header filter)

## Files Created/Modified
- `src/core/JudgeEvaluator.ts` - Added priorGuidance field, injection into judge prompt, markdown header line filter in bestEffortJudgeResult
- `src/core/__tests__/JudgeEvaluator.test.ts` - 12 new tests covering prior guidance tracking, reset, consensus skip, and markdown header filtering

## Decisions Made
- Filter markdown headers at the line level (split by newlines, filter `#`-prefixed lines, rejoin) rather than post-regex filtering. The sentence regex `[^.!?]*[.!?]` captures content across newlines as one "sentence", making post-regex filtering lose real content.
- Store priorGuidance only when consensusReached is false. When consensus is reached the discussion is over, so there's no next round to inject guidance into.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed markdown filter approach from post-regex to pre-regex line filtering**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Plan specified `filter(s => !s.trimStart().startsWith('#'))` on regex matches, but the sentence regex captures `# Header\nContent.` as one sentence, so filtering it removes valid content too
- **Fix:** Split content by newlines, filter header lines, rejoin, then apply sentence regex
- **Files modified:** src/core/JudgeEvaluator.ts
- **Verification:** All 4 QUAL-04 tests pass including edge cases
- **Committed in:** 426d771

**2. [Rule 3 - Blocking] Added explicit type annotation to filter callback**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** TypeScript strict mode required explicit `(s: string)` type on `.filter()` callback since `match()` returns `RegExpMatchArray | null`
- **Fix:** Changed `filter(s => ...)` to `filter((s: string) => ...)`
- **Files modified:** src/core/JudgeEvaluator.ts
- **Committed in:** 426d771

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. Approach change produces better results than plan's original filter strategy.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Judge quality improvements (QUAL-01 through QUAL-04) all complete
- Phase 06 ready for verification

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 06-judge-quality*
*Completed: 2026-04-07*
