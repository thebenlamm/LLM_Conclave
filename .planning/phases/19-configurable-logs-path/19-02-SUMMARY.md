---
phase: 19-configurable-logs-path
plan: 02
subsystem: infra
tags: [config, env-var, audit-04, resolver, fs, discuss-flow]

# Dependency graph
requires:
  - phase: 19-configurable-logs-path
    plan: 01
    provides: getConclaveHome() resolver with documented env → config → tmpdir → legacy precedence
provides:
  - SessionManager honors LLM_CONCLAVE_HOME for session storage
  - StatusFileManager honors LLM_CONCLAVE_HOME for active-discussion.json
  - DiscussionRunner honors LLM_CONCLAVE_HOME for discuss-logs and outputFiles.json fallback
  - Integration tests locking env-vs-baseDir precedence at each consumer
affects: [19-03-verification, trollix-sandbox-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test-env resolver targets os.tmpdir()/llm-conclave-test-logs — existing tests with explicit baseDir stay orthogonal"
    - "baseDir override preserved as first-priority injection hook for test isolation"

key-files:
  created:
    - src/mcp/__tests__/DiscussionRunner.saveLog.test.ts
  modified:
    - src/core/SessionManager.ts
    - src/mcp/StatusFileManager.ts
    - src/mcp/DiscussionRunner.ts
    - src/core/__tests__/SessionManager.test.ts
    - src/mcp/__tests__/StatusFileManager.test.ts

key-decisions:
  - "Preserve baseDir constructor parameter as highest-priority override so SessionManager/StatusFileManager tests with explicit /tmp/test-sessions paths continue to bypass the resolver"
  - "Remove os import entirely from SessionManager and StatusFileManager — both only used os.homedir() inside the constructor, cleaner to drop than shadow"
  - "Dedicated DiscussionRunner.saveLog.test.ts rather than mixing into the existing jest.mock-heavy DiscussionRunner.test.ts — keeps the saveDiscussionLog path assertion readable and lets us partial-mock fs (requireActual + overrides)"
  - "No updates required to server.handlers.test.ts — its global fs mock already swallows writes regardless of resolved path, so the tmpdir tmpdir resolver path is transparently covered"
  - "Include a HOME-bypass invariant test (process.env.HOME pointed at /should/not/be/used) to lock that no residual legacy concatenation survives"

patterns-established:
  - "Three-way path-priority contract for any future consumer: explicit baseDir → getConclaveHome() → implicit fallback inside the resolver"
  - "grep-based verification: assert 0 matches for os.homedir / process.env.HOME / '.llm-conclave' literal across migrated consumers"

requirements-completed: [AUDIT-04]

# Metrics
duration: ~30min
completed: 2026-04-17
---

# Phase 19 Plan 02: Discuss-Flow Consumer Migration Summary

**Rewires SessionManager, StatusFileManager, and DiscussionRunner to resolve their base directories through the Phase 19-01 `getConclaveHome()` resolver — making `LLM_CONCLAVE_HOME` actually relocate session manifests, active-discussion status, and discuss logs end-to-end while preserving every existing behavior (including the constructor baseDir injection contract).**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 (each TDD: RED commit → GREEN commit)
- **Files modified:** 5 (3 production, 2 test)
- **Files created:** 1 (new targeted saveDiscussionLog test)

## Accomplishments

- **SessionManager**: default `sessionsDir` now derives from `getConclaveHome()` (4 new tests lock env, baseDir override, manifestPath anchoring)
- **StatusFileManager**: default `filePath` now derives from `getConclaveHome()` (3 new tests lock env, baseDir override)
- **DiscussionRunner.saveDiscussionLog**: `logsDir` now derives from `getConclaveHome()` (3 new tests: env-unset tmpdir, env-set sandbox, HOME-bypass invariant)
- **DiscussionRunner.outputFiles.json fallback**: rewired to `getConclaveHome()` (no direct test — covered by grep invariant)
- **AUDIT-04** citations added at every integration point per plan acceptance criteria
- **baseDir constructor contract preserved** for both SessionManager and StatusFileManager — existing tests that inject explicit `/tmp/test-sessions` continue to bypass the resolver
- **Full test suite**: 93 suites / 1261 tests passing (up from 19-01's 1241 baseline; +10 net from this plan's new assertions)
- **E2E smoke test**: `LLM_CONCLAVE_HOME=/tmp/conclave-smoke-NNN node -e "..."` confirms the compiled JS routes sessionsDir to `/tmp/conclave-smoke-NNN/sessions`

## Task Commits

1. **Task 1 RED: failing tests for SessionManager + StatusFileManager** — `a22e07f` (test)
2. **Task 1 GREEN: rewire SessionManager + StatusFileManager to getConclaveHome()** — `2dee142` (feat)
3. **Task 2 RED: failing tests for saveDiscussionLog path** — `c99418e` (test)
4. **Task 2 GREEN: rewire DiscussionRunner to getConclaveHome()** — `24e44c3` (feat)

## Files Created/Modified

### Production code

- **src/core/SessionManager.ts** — Dropped `import * as os from 'os'`; added `import { getConclaveHome }`. Constructor now: `this.sessionsDir = baseDir || path.join(getConclaveHome(), 'sessions');`
- **src/mcp/StatusFileManager.ts** — Dropped `import * as os from 'os'`; added `import { getConclaveHome }`. Constructor now: `const dir = baseDir ?? getConclaveHome();`. JSDoc updated to cite AUDIT-04.
- **src/mcp/DiscussionRunner.ts** — Added `import { getConclaveHome }`. `saveDiscussionLog` `logsDir` now: `path.join(getConclaveHome(), 'discuss-logs')`. `outputFiles.json` fallback path now: `path.join(getConclaveHome(), 'sessions')`. No other lines touched.

### Test code

- **src/core/__tests__/SessionManager.test.ts** — Added `describe('sessionsDir resolution honors getConclaveHome() (AUDIT-04)')` block with 4 tests: test-env tmpdir default, env var override, baseDir override still wins, manifestPath anchored. Also added `readFileSync` to the `fs` jest.mock surface (getConclaveHome reads config.json).
- **src/mcp/__tests__/StatusFileManager.test.ts** — Added `describe('filePath resolution honors getConclaveHome() (AUDIT-04)')` block with 3 tests: test-env tmpdir default, env var override, baseDir override still wins.
- **src/mcp/__tests__/DiscussionRunner.saveLog.test.ts** *(new file)* — Dedicated test for `saveDiscussionLog` path resolution. 3 tests locking: tmpdir default (no env), sandbox-redirect (env set), HOME-bypass invariant (env set, HOME deliberately wrong → result must NOT contain HOME).

## Grep Invariants Proving the Rewire

```
$ grep -c "getConclaveHome" src/core/SessionManager.ts src/mcp/StatusFileManager.ts src/mcp/DiscussionRunner.ts
src/core/SessionManager.ts:2
src/mcp/StatusFileManager.ts:2
src/mcp/DiscussionRunner.ts:3

$ grep -c "os.homedir" src/core/SessionManager.ts src/mcp/StatusFileManager.ts
src/core/SessionManager.ts:0
src/mcp/StatusFileManager.ts:0

$ grep -c "process.env.HOME" src/mcp/DiscussionRunner.ts
0

$ grep -c "'.llm-conclave'" src/mcp/DiscussionRunner.ts
0

$ grep -c "AUDIT-04" src/core/SessionManager.ts src/mcp/StatusFileManager.ts src/mcp/DiscussionRunner.ts
src/core/SessionManager.ts:1
src/mcp/StatusFileManager.ts:2
src/mcp/DiscussionRunner.ts:1

$ grep -c "constructor(baseDir?: string)" src/core/SessionManager.ts src/mcp/StatusFileManager.ts
src/core/SessionManager.ts:1
src/mcp/StatusFileManager.ts:1
```

All invariants satisfied.

## End-to-End Smoke Test

```
$ npm run build
$ LLM_CONCLAVE_HOME=/tmp/conclave-smoke-132392 node -e \
  "const SM = require('./dist/src/core/SessionManager.js').default; \
   const m = new SM(); console.log(m['sessionsDir']);"
/tmp/conclave-smoke-132392/sessions
```

Confirms env var redirects compiled JS output without code change — the AUDIT-04 blocking scope.

## Decisions Made

- **Keep baseDir as first-priority constructor override.** Rationale: SessionManager/StatusFileManager existing tests inject `/tmp/test-sessions` to achieve isolation without env manipulation. Replacing that contract with env-only would force all those tests to manipulate `process.env.LLM_CONCLAVE_HOME` in `beforeEach/afterEach`, causing cross-test pollution risk. The resolver becomes the *default*, not the only source.
- **Dedicated saveLog test file instead of augmenting DiscussionRunner.test.ts.** Rationale: DiscussionRunner.test.ts uses heavyweight `jest.mock('fs', () => …)` with full mock objects for the entire file's tests. Asserting on writeFileSync arguments through that mock is possible but couples the new assertions to unrelated DiscussionRunner concerns. A separate file with `jest.requireActual('fs')` + targeted spies keeps the path-assertion self-contained.
- **HOME-bypass invariant test.** Rationale: a naive "rewrite logsDir" could leave the outputFiles.json fallback unchanged — we want a test that actively pollutes `process.env.HOME` with a wrong value and asserts the resolved path doesn't contain it. This catches partial migrations.
- **No updates to server.handlers.test.ts.** Rationale: the test at lines 325–329 installs a global fs mock (`existsSync` → true, `writeFileSync`/`mkdirSync` → no-ops). Those mocks are path-agnostic — they swallow any path the production code passes in. Verified by running the full handler test suite unchanged after the rewire: 64/64 pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `readFileSync` to the `fs` jest.mock surface in SessionManager.test.ts**
- **Found during:** Task 1 RED (first test run)
- **Issue:** `getConclaveHome()` calls `fs.readFileSync(configPath, 'utf-8')` to check for `conclaveHome` key in `~/.llm-conclave/config.json`. SessionManager.test.ts's original `jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false) }))` only exported `existsSync`. Once SessionManager constructor started invoking getConclaveHome() (Task 1 GREEN), the test would break with "fs.readFileSync is not a function" unless the mock also covered that call.
- **Fix:** Extended the fs mock to include `readFileSync: jest.fn(() => { const err: any = new Error('ENOENT'); err.code = 'ENOENT'; throw err; })`. Simulating ENOENT lets getConclaveHome fall through to the test-env tmpdir branch, matching the behavior we want to lock.
- **Files modified:** `src/core/__tests__/SessionManager.test.ts`
- **Committed in:** `a22e07f` (the RED commit — mock expansion landed with the new tests)

**Total deviations:** 1 auto-fixed (blocking). No architectural deviations, no scope expansion.

## Known Stubs

None — every path assertion points to a fully-wired resolver output.

## Issues Encountered

- Transient test-runner hang: `npx jest` exhibited the pre-existing "Jest did not exit one second after the test run has completed" warning. All 1261 tests pass before the hang; the open-handle leak is unrelated to this plan (same message present in 19-01's test output). Adding `--forceExit` or `--detectOpenHandles` is deferred as it's a project-wide hygiene item, not an AUDIT-04 concern.

## User Setup Required

None. Default behavior (no env var, no config key) is identical to pre-change. Operators who set `LLM_CONCLAVE_HOME=/some/path` will now see:
- session manifests under `/some/path/sessions/`
- active-discussion status at `/some/path/active-discussion.json`
- discuss logs under `/some/path/discuss-logs/`

## Next Phase Readiness

- 19-03 (verification) can now assert:
  - No caller in the discuss-flow file set references `os.homedir()` or `process.env.HOME` directly (grep invariants)
  - A round-trip `LLM_CONCLAVE_HOME=$TMP node dist/src/mcp/server.js` produces artifacts at `$TMP`, not `$HOME/.llm-conclave`
  - Existing installs with the env var unset continue to produce `~/.llm-conclave/{sessions,discuss-logs,active-discussion.json}` (backwards compatibility)
- Out-of-scope paths deliberately left untouched per plan scope_guidance:
  - `src/core/ArtifactStore.ts` (artifacts dir)
  - `src/consult/**/*` (consult-logs, consult-jsonl, consult-analytics.db)
  - `src/utils/ConsultLogger.ts`
  - `src/config/PersonaSystem.ts`, `src/consult/artifacts/FilterConfig.ts` (global config reads)
  - These are consult-flow paths; SC#1 only names discuss-flow. Future phase.

## Self-Check: PASSED

- `src/core/SessionManager.ts` contains `getConclaveHome` (2 matches) and `AUDIT-04` (1 match) — verified via grep
- `src/mcp/StatusFileManager.ts` contains `getConclaveHome` (2 matches) and `AUDIT-04` (2 matches) — verified via grep
- `src/mcp/DiscussionRunner.ts` contains `getConclaveHome` (3 matches), `AUDIT-04` (1 match), 0 matches for `os.homedir`, 0 matches for `process.env.HOME`, 0 matches for `'.llm-conclave'` — verified via grep
- `src/mcp/__tests__/DiscussionRunner.saveLog.test.ts` exists (3 it() blocks)
- Commit `a22e07f` (Task 1 RED) exists in git log
- Commit `2dee142` (Task 1 GREEN) exists in git log
- Commit `c99418e` (Task 2 RED) exists in git log
- Commit `24e44c3` (Task 2 GREEN) exists in git log
- `npx tsc --noEmit` exits 0
- `npx jest --no-coverage` reports 1261/1261 tests passing across 93 suites
- E2E smoke test with `LLM_CONCLAVE_HOME=/tmp/conclave-smoke-NNN` prints `/tmp/conclave-smoke-NNN/sessions` from compiled JS
- Constructor signatures unchanged: `grep -c "constructor(baseDir?: string)"` returns 1 in both SessionManager.ts and StatusFileManager.ts
- ConfigPaths.ts left untouched (resolver contract stable as pinned by 19-01)

---
*Phase: 19-configurable-logs-path*
*Completed: 2026-04-17*
