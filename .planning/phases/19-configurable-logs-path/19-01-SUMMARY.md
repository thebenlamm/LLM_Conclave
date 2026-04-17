---
phase: 19-configurable-logs-path
plan: 01
subsystem: infra
tags: [config, env-var, audit-04, resolver, fs]

# Dependency graph
requires:
  - phase: 18-round-counter-unification
    provides: Stable STATE.md baseline and green test suite (1225 tests) to extend from
provides:
  - getConclaveHome() resolver in src/utils/ConfigPaths.ts with documented precedence
  - Unit test suite locking env/config/fallback precedence behavior
  - Contract for 19-02 to migrate discuss-flow consumers against
affects: [19-02-migration, 19-03-verification, trollix-sandbox-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env-var-first config resolution with silent fall-through"
    - "Mock-fs-via-require pattern in unit tests (project-wide convention)"

key-files:
  created:
    - src/utils/__tests__/ConfigPaths.test.ts
  modified:
    - src/utils/ConfigPaths.ts

key-decisions:
  - "Env var LLM_CONCLAVE_HOME wins over config-file conclaveHome key; both trim before emptiness check so whitespace-only values fall through"
  - "Config file is always read from os.homedir() (not ConfigPaths.globalConfig) to avoid test-env tmpdir redirect shadowing production reads"
  - "Resolver is silent on every fall-through (no logging) because it runs on every artifact path resolution; audit visibility is the caller's concern"
  - "ConfigPaths.globalConfig left untouched — the config file that names the data root cannot itself live under the user-configured data root"
  - "No consumer rewiring in this plan (deferred to 19-02) so contract stabilizes before migration"

patterns-established:
  - "Precedence resolver: env → config-file key → test-env tmpdir → legacy default, each guarded by typed non-empty check"
  - "Project-wide fs mocking: require('fs') inside each test + jest.restoreAllMocks() in beforeEach (avoids 'Cannot redefine property' with namespace imports)"

requirements-completed: [AUDIT-04]

# Metrics
duration: ~25min
completed: 2026-04-17
---

# Phase 19 Plan 01: Configurable Logs Path — Resolver Summary

**Adds `getConclaveHome()` in src/utils/ConfigPaths.ts — a four-level precedence resolver (env → config-file → test-tmpdir → legacy home) that sandboxed MCP callers will use to relocate runtime artifacts without code changes.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-17T14:06:30Z
- **Completed:** 2026-04-17T14:36:35Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- Added `getConclaveHome()` named export to `src/utils/ConfigPaths.ts` with documented precedence and AUDIT-04 citation in JSDoc
- Preserved legacy behavior: default path remains `os.homedir()/.llm-conclave` when no env/config is set, so existing installs see zero change
- Added 16 unit tests in `src/utils/__tests__/ConfigPaths.test.ts` locking every precedence branch, including trimming, empty-string fall-through, malformed-JSON safety, and absolute-path invariant
- Left every existing caller untouched — migration is 19-02's job, which can rely on the now-stable contract
- Full suite still green: 91 suites / 1241 tests passing (up from 1225, +16 from this plan)

## Task Commits

1. **Task 1: Add getConclaveHome() resolver with precedence rules** — `6a4ed54` (feat)
2. **Task 2: Unit tests for getConclaveHome() precedence** — `3795d9a` (test)

_TDD note: This plan landed as `feat` (impl) → `test` (coverage) in the explicit order the plan specified. The resolver was validated by `tsc --noEmit` at Task 1, then locked by Jest tests at Task 2. The plan-level `type: execute` does not enforce a RED-before-GREEN gate at the plan level; individual tasks each had their own verification step._

## Files Created/Modified

- `src/utils/ConfigPaths.ts` — Added `getConclaveHome()` with 4-level precedence chain and JSDoc. `ConfigPaths` object unchanged.
- `src/utils/__tests__/ConfigPaths.test.ts` — 16 precedence tests (env, config, test-env, fallback, trimming, malformed-safe, absolute-path).

## Resolver Contract

```typescript
/**
 * Precedence (highest to lowest):
 *   1. process.env.LLM_CONCLAVE_HOME (trimmed, non-empty)
 *   2. conclaveHome key in ~/.llm-conclave/config.json (string, non-empty after trim)
 *   3. Test-env fallback: path.join(os.tmpdir(), 'llm-conclave-test-logs')
 *      when NODE_ENV==='test' OR JEST_WORKER_ID defined
 *   4. Default: path.join(os.homedir(), '.llm-conclave')
 *
 * Always absolute. Never throws.
 */
export function getConclaveHome(): string;
```

## Test Coverage (locked behaviors)

| Branch | Case | Expected |
|--------|------|----------|
| Env | `LLM_CONCLAVE_HOME="/custom/sandbox"` | `/custom/sandbox` |
| Env | `LLM_CONCLAVE_HOME="  /padded/path  "` | `/padded/path` (trimmed) |
| Env | `LLM_CONCLAVE_HOME=""` | fall-through |
| Env | `LLM_CONCLAVE_HOME="   "` | fall-through |
| Config | `{conclaveHome: "/from/config"}` | `/from/config` |
| Config | `{conclaveHome: "  /cfg/trim  "}` | `/cfg/trim` (trimmed) |
| Config | `{conclaveHome: ""}` | fall-through |
| Config | `{conclaveHome: "   "}` | fall-through |
| Config | malformed JSON | fall-through, no throw |
| Config | JSON array (not object) | fall-through |
| Config | `{conclaveHome: 42}` (non-string) | fall-through |
| Fallback | Jest env + no config | `os.tmpdir()/llm-conclave-test-logs` |
| Precedence | env set AND config set | env wins |
| Invariant | any branch | `path.isAbsolute()` true |

## Decisions Made

- **Env-var precedence over config-file key.** Rationale: sandbox operators (Trollix) need one-shot override without editing files; ops rollout pattern matches every other LLM_* variable in the codebase.
- **Config file read from `os.homedir()` directly, not `ConfigPaths.globalConfig`.** Rationale: `globalConfig` redirects to tmpdir in test env; using it would make `{conclaveHome: ...}` unreachable in production callers when JEST_WORKER_ID leaks (e.g., dev harness). Direct `os.homedir()` read keeps production and test semantics independent.
- **No logging on fall-through.** Rationale: the resolver runs per artifact write; logs would be noisy. Caller-level logging (e.g., MCP response surfacing resolved path) is where the audit trail belongs.
- **`ConfigPaths.globalConfig` left untouched.** Rationale: the config file must live at a deterministic bootstrap location (home or tmpdir); it cannot sit under the user-configured data root without a chicken-and-egg lookup.
- **Deferred consumer rewiring to 19-02.** Rationale: landing the contract + tests first lets 19-02 do purely mechanical migration against a pinned API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test mocking pattern adjusted to match project-wide convention**
- **Found during:** Task 2 (initial test run)
- **Issue:** Plan Action text used `jest.spyOn(fs, 'readFileSync').mockImplementation(...)` against `import * as fs from 'fs'` — this failed with `TypeError: Cannot redefine property: readFileSync` once more than one test tried to re-spy. Jest 30 + ts-jest + namespace imports make the fs namespace object reject property redefinition after the first spy installation.
- **Fix:** Switched to the project-wide pattern already used in `src/mcp/__tests__/server.handlers.test.ts` — `const fs = require('fs')` *inside* each test, paired with `jest.restoreAllMocks()` in `beforeEach`. Same behavior, compatible with current Jest config.
- **Files modified:** `src/utils/__tests__/ConfigPaths.test.ts` only
- **Verification:** All 16 tests green; full suite 1241/1241 green.
- **Committed in:** `3795d9a` (Task 2 commit — final test file reflects the working pattern)

**2. [Rule 2 - Missing Critical] Expanded plan's 7-case minimum to 16 cases**
- **Found during:** Task 2 (authoring)
- **Issue:** Plan listed 9 target behaviors with a `≥7` acceptance gate. While drafting, three additional correctness-critical cases surfaced that the plan didn't enumerate: (a) env var trimming preserves the inner path, (b) config-file trimming likewise, (c) JSON array / non-string `conclaveHome` property must fall through (arrays are `typeof 'object'` — without a `typeof string` guard they'd read index-named properties and crash or mis-resolve).
- **Fix:** Added tests for trim behavior on env, trim behavior on config, JSON-array-as-root, non-string value, and split the "absolute path in every branch" case into three independent tests (env/config/fallback) to avoid cross-branch mutation pollution.
- **Files modified:** `src/utils/__tests__/ConfigPaths.test.ts`
- **Verification:** Each added test fails meaningfully when its guard is removed (hand-verified by temporarily deleting the `typeof 'string'` check).
- **Committed in:** `3795d9a`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical)
**Impact on plan:** No scope creep. Deviation 1 was a pure mechanical pattern swap; deviation 2 strengthened the test coverage beyond the plan floor without touching production code. Both served the plan's actual contract — locking precedence under realistic inputs.

## Issues Encountered

- The initial test draft used a single persistent `jest.spyOn` installed in `beforeAll`, which surfaced the `Cannot redefine property: readFileSync` error. Resolved by switching to the per-test `require('fs')` + `restoreAllMocks` pattern (see Deviation 1). No impact on delivered behavior.

## User Setup Required

None — this plan only adds internal code and tests. Sandboxed callers that *want* to use the new resolver can pre-set `LLM_CONCLAVE_HOME`, but nothing consumes it yet (that's 19-02). Default behavior for every existing install is unchanged.

## Next Phase Readiness

- Contract is pinned: `getConclaveHome(): string`, 4-level precedence, absolute path, never throws.
- 19-02 can now rewire discuss-flow consumers (discuss-logs, session manifests, active-discussion status) against this resolver without worrying about contract drift.
- 19-03 verification will assert (a) no caller still hardcodes `os.homedir() + '/.llm-conclave'`, (b) a round-trip Trollix-style env override produces artifacts at the sandbox path.
- Full test suite is green (1241/1241, 91 suites) — no regressions to investigate.

## Self-Check: PASSED

- `src/utils/ConfigPaths.ts` exists with `getConclaveHome` export (verified via grep)
- `src/utils/__tests__/ConfigPaths.test.ts` exists with 16 test cases (verified via grep -c "it(")
- Commit `6a4ed54` (Task 1 feat) exists in git log
- Commit `3795d9a` (Task 2 test) exists in git log
- `npx tsc --noEmit` exits 0
- `npx jest` exits 0 with 1241/1241 passing across 91 suites
- `grep -rn "getConclaveHome" src/` shows only definition + test imports (no premature consumer rewiring — correctly deferred to 19-02)
- Existing `ConfigPaths.globalConfig` export unchanged (verified — tmpdir branch intact at line 15)

---
*Phase: 19-configurable-logs-path*
*Completed: 2026-04-17*
