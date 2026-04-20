---
phase: 20-degraded-status-judge-coinage
plan: 02
subsystem: testing
tags: [audit, judge-coinage, test-first, red-phase, tokenization, jest, ts-jest, AUDIT-06]
requirements: [AUDIT-06]

# Dependency graph
requires:
  - phase: 20-degraded-status-judge-coinage
    provides: "Plan 20-01 — shared phase context and ROADMAP success criteria for AUDIT-06"
provides:
  - Failing 15-test Jest suite pinning the detectJudgeCoinage(synthesisText, agentTurns) contract
  - Two fixture JSON files capturing realistic grounded vs. coined synthesis cases
  - Committed RED state that Wave 2 (Plan 20-03) turns green by creating src/consult/coinage/detectJudgeCoinage.ts
affects: [20-03, 20-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test-first (RED) contract pinning for risky judge-adjacent features (per CLAUDE.md)"
    - "Fixture-driven tests co-located under __tests__/fixtures/ for realistic session-shape coverage"
    - "Module-not-found failure as the committed RED state (no stub implementation)"

key-files:
  created:
    - src/consult/coinage/__tests__/detectJudgeCoinage.test.ts
    - src/consult/coinage/__tests__/fixtures/grounded-synthesis.json
    - src/consult/coinage/__tests__/fixtures/coined-synthesis.json
  modified: []

key-decisions:
  - "Committed RED as module-not-found (not a stub) — Plan 20-03's GREEN commit is the sole owner of detectJudgeCoinage.ts"
  - "All 15 tests use exact-array .toEqual assertions (no regex, no snapshots) so the tokenization contract is literal and reviewable"
  - "Sentence-initial stopword list pinned: The/And/But/A/An/This/That/It/He/She/We/They/I/You"
  - "Phrase length capped at 3 tokens; 5-token runs truncate to the first 3 (Test 8 pins this)"
  - "Case-insensitive substring grounding against agent-turn corpus; ALL-CAPS >= 2 chars counts as a proper-noun candidate"

patterns-established:
  - "AUDIT-06 contract is now specified in executable form (Jest), not prose — Plan 20-03 must satisfy the tests verbatim"
  - "Fixture JSON files use { synthesis, turns, expected | expectedContains/expectedDoesNotContain } shape for test portability"

requirements-completed: []  # AUDIT-06 is only partially addressed — tests committed; implementation (GREEN) is Plan 20-03's responsibility.

# Metrics
duration: ~4min
completed: 2026-04-17
---

# Phase 20 Plan 02: detectJudgeCoinage RED Tests Summary

**15-test Jest suite pinning the detectJudgeCoinage(synthesisText, agentTurns) contract with 2 fixture JSON files; fails with `Cannot find module '../detectJudgeCoinage'` as the intentional committed RED state.**

## Performance

- **Duration:** ~4 minutes
- **Started:** 2026-04-17T20:16:xxZ
- **Completed:** 2026-04-17T20:20:16Z
- **Tasks:** 1/1
- **Files modified:** 3 created

## Accomplishments

- Committed a RED Jest suite (15 tests) that pins the tokenization + grounding contract for AUDIT-06 judge coinage detection
- Contract covers: 1-3 token Title-Case / ALL-CAPS phrase extraction, sentence-initial English stopword filtering, case-insensitive substring grounding, deduplication in order of first appearance, markdown-syntax stripping, and phrase-length truncation at 3 tokens
- Two fixture JSON files committed (grounded + coined) so integration-shaped cases are locked in alongside pure extraction cases
- Pre-existing Jest suite (93 suites / 1267 tests) continues to pass — the new RED is contained to the new file

## Task Commits

1. **Task 1: Write fixture JSON files + failing test suite specifying detectJudgeCoinage contract (RED)** — `c53e2c9` (test)

_Note: This is a plan-level TDD RED phase. No `feat(...)` commit is produced here by design; Plan 20-03 (Wave 2) owns the GREEN commit that adds `src/consult/coinage/detectJudgeCoinage.ts`._

## Files Created/Modified

- `src/consult/coinage/__tests__/detectJudgeCoinage.test.ts` — 15-test Jest suite pinning the AUDIT-06 detectJudgeCoinage contract
- `src/consult/coinage/__tests__/fixtures/grounded-synthesis.json` — fixture where every proper-noun phrase in the synthesis is grounded by at least one agent turn (expected empty output)
- `src/consult/coinage/__tests__/fixtures/coined-synthesis.json` — fixture where "Benthic Protocol" and "Operation Clearsky" appear in zero agent turns (expected to be flagged)

## Decisions Made

- **RED as module-not-found, not a stub:** Committed the failing import directly rather than writing a trivial stub that returns `[]`. This prevents an accidental pass via the empty-array path and ensures Plan 20-03's GREEN commit is the sole owner of `detectJudgeCoinage.ts`.
- **Exact-array assertions (`.toEqual([...])`):** Each of Tests 1-13 pins the return shape literally so Plan 20-03 has an unambiguous contract. No regex matchers or snapshots, per plan guidance.
- **Phrase truncation (Test 8):** When the synthesis contains a 5-token capitalized run ("Red Blue Green Yellow Framework"), the detector returns only the first 3 tokens ("Red Blue Green"). This is a deliberate contract choice — pinned in the tests so Plan 20-03 implements it exactly.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** N/A — all 10 acceptance criteria satisfied verbatim; RED state confirmed by `npx jest` emitting `Cannot find module '../detectJudgeCoinage'`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `npx jest src/consult/coinage/__tests__/detectJudgeCoinage.test.ts` output contains `Cannot find module '../detectJudgeCoinage'` and `Test suite failed to run` (RED-STATE-CONFIRMED)
- `npx jest --testPathIgnorePatterns="detectJudgeCoinage"` shows 93 passed, 0 failed (1267 tests) — new file's failure is contained
- `src/consult/coinage/detectJudgeCoinage.ts` does NOT exist (confirmed via `ls` → "No such file")
- Both fixture JSON files parse cleanly (`node -e "JSON.parse(fs.readFileSync(...))"` exits 0)
- Test file: 1 `from '../detectJudgeCoinage'` import, 1 `describe('AUDIT-06` block, 15 `it(...)` tests
- Fixture counts: `Benthic Protocol` appears 2× in coined fixture, `Operation Clearsky` appears 2× in coined fixture, `Apollo Framework` appears 2× in grounded fixture

## TDD Gate Compliance

**Plan type:** `tdd` (plan-level RED phase only)

- [x] RED gate: `test(20-02): add failing detectJudgeCoinage test suite + fixtures (AUDIT-06 RED)` — commit `c53e2c9`
- [ ] GREEN gate: owned by Plan 20-03 — will be `feat(20-03): implement detectJudgeCoinage (AUDIT-06 GREEN)`
- [ ] REFACTOR gate: TBD by Plan 20-03 if needed

This is the intended plan-level split: Wave 1 (this plan) commits RED; Wave 2 (Plan 20-03) commits GREEN. Gate sequence completion is tracked at the phase level.

## Next Phase Readiness

- Plan 20-03 has a concrete, literal 15-test contract to implement against
- Implementation must live at `src/consult/coinage/detectJudgeCoinage.ts` with exported `detectJudgeCoinage(synthesisText, agentTurns, options?)`
- Plan 20-03 is expected to (a) create the implementation file, (b) run `npx jest src/consult/coinage/` to observe all 15 tests turning green, (c) optionally refactor without breaking tests
- Caller-side filtering rule reminder for Plan 20-03 integration: map `SessionMessage[]` → `AgentTurnLike[]` via `role === 'assistant' && speaker && speaker !== 'Judge' && speaker !== 'System'`

## Self-Check: PASSED

Verified claims:

- FOUND: `src/consult/coinage/__tests__/detectJudgeCoinage.test.ts`
- FOUND: `src/consult/coinage/__tests__/fixtures/grounded-synthesis.json`
- FOUND: `src/consult/coinage/__tests__/fixtures/coined-synthesis.json`
- FOUND commit: `c53e2c9` (`test(20-02): add failing detectJudgeCoinage test suite + fixtures (AUDIT-06 RED)`)
- CONFIRMED: `src/consult/coinage/detectJudgeCoinage.ts` does NOT exist
- CONFIRMED: `npx jest <new test file>` fails with module-not-found; all other suites pass (93 suites, 1267 tests)

---
*Phase: 20-degraded-status-judge-coinage*
*Plan: 02*
*Completed: 2026-04-17*
