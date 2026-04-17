---
phase: 20-degraded-status-judge-coinage
plan: 03
subsystem: judge-coinage
tags: [audit, judge-coinage, mcp-response, session-manifest, green-phase, AUDIT-06]
requirements: [AUDIT-06]
dependency_graph:
  requires: [20-02-SUMMARY.md (RED contract), 20-01-SUMMARY.md (session_status neighbor), detectJudgeCoinage.test.ts, formatDiscussionResultJson, SessionManager.createSessionManifest]
  provides: [detectJudgeCoinage pure function, MCP JSON response judge_coinage field, SessionManifest.judgeCoinage persistence]
  affects: [src/consult/coinage/detectJudgeCoinage.ts, src/types/index.ts, src/core/SessionManager.ts, src/mcp/server.ts, src/mcp/__tests__/server.handlers.test.ts]
tech_stack:
  added: []
  patterns:
    - "Pure-function audit signal (no I/O, no external deps) — mirrors computeSessionStatus from 20-01"
    - "Sentence-initial Title-Case scaffolding filter (English prose heuristic without a dictionary)"
    - "Markdown heading-line strip so `## Key Decisions` scaffolding never reaches token extraction"
    - "Always-emit empty array (never undefined) for additive JSON fields — matches AUDIT-04 / AUDIT-05 convention"
    - "Caller-side Judge+System filter on grounding corpus — judge-self-grounding explicitly rejected"
key_files:
  created:
    - src/consult/coinage/detectJudgeCoinage.ts
  modified:
    - src/types/index.ts
    - src/core/SessionManager.ts
    - src/mcp/server.ts
    - src/mcp/__tests__/server.handlers.test.ts
decisions:
  - "Sentence-initial single Title-Case (non-ALL-CAPS) tokens are filtered as English scaffolding — avoids hardcoding a verb list while still letting ALL-CAPS acronyms (NATO) through at sentence-initial position"
  - "Markdown heading LINES are stripped entirely (not just the `#` prefix) — `## Key Decisions` is section metadata, not prose; inline emphasis wrappers are unwrapped so the inner words survive"
  - "Sentence-splitting uses newlines AND sentence-terminator punctuation (`. `, `! `, `? `) so each sentence gets its own sentence-initial filter; heading/bullet lines don't glue onto surrounding prose"
  - "Phrase-length cap at maxLen advances past the ENTIRE run on truncation so a 5-token capitalized phrase yields exactly one 3-token candidate (not a 3-token + 2-token pair) — Test 8 pins this"
  - "judge_coinage is always an array (empty on grounded runs) rather than optional/undefined — makes `if (json.judge_coinage.length)` the canonical consumer pattern, matching AUDIT-04 conclave_home and AUDIT-05 session_status conventions"
  - "SessionManager imports detectJudgeCoinage via the same-relative-path-with-.js extension convention used for conclave_home (19-03) and computeSessionStatus (20-01)"
metrics:
  duration: ~6m
  completed_date: 2026-04-17
  tasks_completed: 2
  tests_added: 5
  commits: 3
---

# Phase 20 Plan 03: Judge Coinage Wiring Summary

`detectJudgeCoinage` implemented and wired into both the MCP discuss/continue JSON response (additive `judge_coinage: string[]`) and the persisted SessionManifest (additive `judgeCoinage?: string[]`). Closes AUDIT-06 end-to-end — the 20-02 RED test suite (15 tests) lands GREEN on first pass; 5 new handler tests pin the wiring including Judge/System exclusion and SC#5 non-regression.

## What Shipped

### `src/consult/coinage/detectJudgeCoinage.ts`

Pure function, no I/O, no external deps. Algorithm:

1. Strip markdown heading lines (`## Decision` → removed entirely), bullet markers (`- `, `* `, `+ `), bold/italic/underscore emphasis wrappers, and inline code wrappers
2. Split stripped text into sentence-like units by newline and by `.` / `!` / `?` terminators
3. Tokenize each sentence on whitespace and trim surrounding punctuation per token
4. Sentence-initial filter: skip the first token if Title-Case but NOT ALL-CAPS ("Use", "Deploy", "Adopt", "Key", "The" — English scaffolding)
5. Extract valid candidates as multi-token Title-Case runs OR single ALL-CAPS tokens
6. Truncate runs longer than `maxPhraseLength` (default 3); advance past the entire run on truncation
7. Case-insensitive substring grounding against concatenated agent-turn corpus
8. Deduplicate coined phrases by lowercase key in first-appearance order

STOPWORDS set pins the 20-02 sentence-initial stopword list (The, And, But, A, An, This, That, It, He, She, We, They, I, You, Is, Are, Was, Were, Be, Been + common prepositions).

### `src/types/index.ts` — SessionManifest.judgeCoinage?

Additive optional field alongside `conclaveHome?` (AUDIT-04). Optional at the type level for back-compat with pre-Phase-20 session.json files; always populated by the production `createSessionManifest` code path going forward.

### `src/core/SessionManager.ts` — createSessionManifest wiring

Imports `detectJudgeCoinage` + `AgentTurnLike` from the new module. Before building the session literal, filters `conversationHistory` to non-Judge / non-System / non-error assistant turns, maps to `AgentTurnLike[]`, and calls `detectJudgeCoinage(result.solution || result.finalOutput || '', agentTurnCorpus)`. Result stamped onto the session as `judgeCoinage`, immediately after `conclaveHome`. Plan 20-01's `status: computeSessionStatus(result)` wiring is untouched and remains functional.

### `src/mcp/server.ts` — formatDiscussionResultJson wiring

Imports `detectJudgeCoinage`. Before the final `return { ... }`, applies the same Judge/System filter to `conversationHistory` and emits top-level `judge_coinage: judgeCoinage` immediately after `section_order` and before `session_id`, keeping the end-of-object metadata tail (`session_id` / `log_file` / `session_status` / `conclave_home`) contiguous.

## Test Coverage

### Task 1 GREEN — 20-02 RED suite (`src/consult/coinage/__tests__/detectJudgeCoinage.test.ts`)

All 15 tests from Plan 20-02 pass on first implementation pass:

1. Empty synthesis → `[]`
2. Empty turns → all proper-noun phrases from synthesis
3. Fully grounded → `[]`
4. Two coined phrases in order of appearance
5. Case-insensitive grounding (ALL-CAPS synthesis, lowercase turn)
6. Lowercase synthesis words are not candidates
7. Sentence-initial capitalized stopwords filtered
8. Phrase-length cap (5-token run → first 3 tokens only)
9. Deduplication on repeated coinage
10. Mixed grounded + coined → only coined returned
11. ALL-CAPS single token (NATO) counted as proper noun
12. ALL-CAPS grounded by lowercase turn
13. Markdown syntax stripped without contaminating extraction
14. Fixture: grounded-synthesis.json → `[]`
15. Fixture: coined-synthesis.json → contains Benthic Protocol and Operation Clearsky

### Task 2 — 5 new handler tests (`src/mcp/__tests__/server.handlers.test.ts`)

New describe block `Phase 20 — AUDIT-06 judge_coinage reporting`:

1. Grounded-run JSON → `json.judge_coinage.toEqual([])`
2. Coined-run JSON → `json.judge_coinage.toContain('Benthic Protocol')`
3. SC#5 non-regression — all pre-existing top-level fields preserved (`task`, `summary`, `session_id`, `log_file`, `conclave_home`, `rounds`, `agents`, `per_agent_positions`, `realized_panel`, `section_order`); `session_status` (AUDIT-05) still present; new `judge_coinage` populated
4. Judge + System turns excluded from grounding corpus — Platonic Ideal flagged even when Judge's own turn contains it
5. `createSessionManifest` (via real `SessionManager` through `jest.requireActual`) stamps `judgeCoinage` on the manifest — populated on coined runs, empty array on grounded runs

## Metrics

| Metric | Value |
|---|---|
| Total tests (before) | 1299 (1284 Plan 20-01 baseline + 15 Plan 20-02 RED) |
| Total tests (after) | 1304 |
| New tests added | 5 (handler tests in server.handlers.test.ts) |
| 20-02 RED tests turned GREEN | 15 (all on first implementation pass) |
| Suites affected | 2 (detectJudgeCoinage.test.ts, server.handlers.test.ts — both clean) |
| `tsc --noEmit` | clean |
| Files created | 1 (`src/consult/coinage/detectJudgeCoinage.ts`) |
| Files modified | 4 (types, SessionManager, server, handler tests) |
| Commits | 3 |

## Commits

| Commit | Message |
|---|---|
| 936c73f | feat(20-03): implement detectJudgeCoinage (AUDIT-06 GREEN) |
| 23a7b08 | test(20-03): add failing tests for AUDIT-06 judge_coinage + SessionManifest (RED) |
| a8f0e7f | feat(20-03): wire judge_coinage into MCP response + SessionManifest (AUDIT-06 GREEN) |

## Deviations from Plan

None — plan executed as written. The algorithm sketch in the plan's `<action>` block noted two likely iteration points (Test 8 phrase-length cap, Test 13 markdown stripping); both behaved as designed on first implementation pass. The one clarification relative to the sketch: sentence-initial filtering is applied per-sentence rather than globally, so words like "Use" and "Deploy" at the start of a bullet are filtered without needing a curated common-verb list — exactly the behavior the 20-02 fixtures encode. Documented inline in the JSDoc on `detectJudgeCoinage`.

## Authentication Gates

None — no auth surface touched.

## Known Stubs

None. Every new code path is wired to live data: detectJudgeCoinage consumes the production ConversationManager `result` shape (via both createSessionManifest and formatDiscussionResultJson entry points); the MCP response emits the derived value directly; the SessionManifest persists it to disk.

## TDD Gate Compliance

Task 2 followed a formal RED → GREEN cycle:

- **Task 2 RED** (`23a7b08`): test commit lands 5 failing tests — 4 fail on missing `json.judge_coinage` field, 1 fails on missing `manifest.judgeCoinage`.
- **Task 2 GREEN** (`a8f0e7f`): feat commit extends SessionManifest type, wires `detectJudgeCoinage` into both `createSessionManifest` and `formatDiscussionResultJson` — all 5 pass.

Task 1 was structured as an implementation pass against the pre-existing 20-02 RED contract (the test file was committed RED in Plan 20-02 `c53e2c9`); the `936c73f` feat commit is the GREEN counterpart. No refactor commit needed — the first implementation pass already hits all 15 tests.

No edits to `src/consult/coinage/__tests__/detectJudgeCoinage.test.ts` or the fixture JSONs across this plan's three commits (confirmed via `git log --oneline -- src/consult/coinage/__tests__/` showing only the original 20-02 commit).

## Verification

- `npx tsc --noEmit` — exits 0
- `npx jest src/consult/coinage/__tests__/detectJudgeCoinage.test.ts --forceExit --no-coverage` — 15/15 GREEN (closes 20-02 RED)
- `npx jest src/mcp/__tests__/server.handlers.test.ts --testNamePattern="AUDIT-06" --forceExit --no-coverage` — 5/5 GREEN
- `npx jest --forceExit --no-coverage` — 1304/1304 passing across 95 suites
- `grep -c "judgeCoinage?:" src/types/index.ts` → 1
- `grep -c "AUDIT-06" src/mcp/server.ts` → 2
- `grep -c "judge_coinage:" src/mcp/server.ts` → 1
- `grep -c "detectJudgeCoinage(" src/core/SessionManager.ts` → 1
- `grep -c "detectJudgeCoinage(" src/mcp/server.ts` → 1
- No deletions across the three commits (`git diff --diff-filter=D --name-only HEAD~3 HEAD` is empty)
- No edits to 20-02 test file or fixtures (`git log --oneline -- src/consult/coinage/__tests__/` shows only 20-02's `c53e2c9`)

## Self-Check: PASSED

Files verified present:

- FOUND: `src/consult/coinage/detectJudgeCoinage.ts`
- FOUND: `src/types/index.ts` (modified — `judgeCoinage?: string[]` added)
- FOUND: `src/core/SessionManager.ts` (modified — `detectJudgeCoinage` imported + `judgeCoinage` stamped on session literal)
- FOUND: `src/mcp/server.ts` (modified — `detectJudgeCoinage` imported + `judge_coinage` emitted on JSON response)
- FOUND: `src/mcp/__tests__/server.handlers.test.ts` (modified — Phase 20 AUDIT-06 describe block with 5 tests)

Commits verified present in git log:

- FOUND: `936c73f` (Task 1 GREEN — detectJudgeCoinage implementation)
- FOUND: `23a7b08` (Task 2 RED — 5 failing handler tests)
- FOUND: `a8f0e7f` (Task 2 GREEN — judge_coinage wired into MCP + manifest)

Test suite verified: 1304 passing, 95 suites green, tsc clean. 20-02 RED → GREEN transition confirmed. 20-01 AUDIT-05 work (session_status, computeSessionStatus) untouched and still passing.

---
*Phase: 20-degraded-status-judge-coinage*
*Plan: 03*
*Completed: 2026-04-17*
