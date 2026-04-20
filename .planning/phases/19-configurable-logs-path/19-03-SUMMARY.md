---
phase: 19-configurable-logs-path
plan: 03
subsystem: mcp
tags: [config, env-var, audit-04, observability, mcp-response, session-manifest]
requirements: [AUDIT-04]

# Dependency graph
requires:
  - phase: 19-configurable-logs-path
    plan: 02
    provides: getConclaveHome()-rewired SessionManager/StatusFileManager/DiscussionRunner — discuss-flow artifacts already land under LLM_CONCLAVE_HOME
provides:
  - SessionManifest.conclaveHome (optional string) — session.json self-describes its data root
  - formatDiscussionResultJson `conclave_home` field — additive top-level string in MCP discuss JSON responses
  - handleStatus renders `**Conclave home:** <path>` on all three status-tool branches
  - README.md `## Environment Variables` section documenting LLM_CONCLAVE_HOME precedence + example
  - Handler tests pinning conclave_home against env-set and env-unset paths
affects: [trollix-sandbox-integration, phase-19-closeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive MCP response field convention (top-level snake_case, no existing-field disruption)"
    - "Per-branch markdown rendering of resolved root across handleStatus's active / recent-session / no-sessions paths"
    - "Direct unit test of pure formatter (formatDiscussionResultJson) rather than going through full handler to keep assertions self-contained"

key-files:
  created: []
  modified:
    - src/types/index.ts
    - src/core/SessionManager.ts
    - src/mcp/server.ts
    - src/mcp/__tests__/server.handlers.test.ts
    - src/core/__tests__/SessionManager.test.ts
    - README.md

key-decisions:
  - "Field names follow project convention: SessionManifest uses camelCase (conclaveHome), MCP JSON response uses snake_case (conclave_home). Matches the existing split seen across the codebase (e.g., agentSubstitutions on manifest vs substitutions/section_order in JSON)"
  - "conclaveHome is optional on SessionManifest so pre-Phase-19 session.json files still parse — backward compat per CLAUDE.md behavioral-compatibility rule"
  - "handleStatus resolves the root ONCE at the top of the function and renders it in every return branch, instead of repeating the getConclaveHome() call per branch"
  - "Handler tests target formatDiscussionResultJson directly (exported since 17-03) rather than round-tripping through the full handler — keeps the AUDIT-04 assertion decoupled from orchestration mocks"
  - "Runtime code MUST continue to re-resolve getConclaveHome() fresh instead of trusting session.conclaveHome (T-19-09 in threat model). The persisted value is informational only"

patterns-established:
  - "Observable-resolver pattern: every configurable resolver output must be surfaced (a) in the API response the caller invoked, (b) in the persisted artifact, (c) in the status/health tool, and (d) in README docs. This plan is the reference implementation of that four-surface contract"
  - "Additive-field regression test: assert that newly-added response keys do NOT disturb existing keys (task, summary, session_id, log_file) in the same test that asserts the new field's presence — catches accidental renames/removals"

requirements-completed: [AUDIT-04]

# Metrics
duration: ~27min
completed: 2026-04-17
---

# Phase 19 Plan 03: Configurable Logs Path — Observability + Docs Summary

**Surfaces the resolved `LLM_CONCLAVE_HOME` root in three caller-visible places (session.json, MCP discuss JSON response, llm_conclave_status markdown) and documents the precedence chain in README.md — closing AUDIT-04 success criteria #3 and #4 and completing Phase 19 as a whole.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-04-17T16:04:11Z
- **Completed:** 2026-04-17T16:31:41Z
- **Tasks:** 2 (each TDD: RED commit → GREEN commit)
- **Files modified:** 6 (4 production, 2 test — no new files created)

## Accomplishments

- **SessionManifest.conclaveHome** — New optional string field populated at `createSessionManifest()` time via `getConclaveHome()`. Session.json now self-describes its data root.
- **MCP discuss JSON response** — Added top-level `conclave_home` key to `formatDiscussionResultJson`. No existing field renamed/removed/retyped.
- **handleStatus markdown** — All three branches now render `**Conclave home:** <path>`:
  - active-discussion branch (line before `*Updated:* timestamp)
  - recent-completed-session bullet list
  - no-active-no-sessions fallback message
- **README.md** — New `## Environment Variables` section (AUDIT-04 cited) with:
  - precedence order: env var > config key > default
  - bash one-liner example
  - MCP-config JSON example showing `env.LLM_CONCLAVE_HOME`
  - cross-references to all three observability surfaces
- **6 new handler/manager tests** pin the behavior across env-set and env-unset paths:
  - 3 for SessionManifest.conclaveHome (env unset, env set, orthogonal-to-cost)
  - 3 for formatDiscussionResultJson.conclave_home (env unset, env set, existing-fields-preserved)
- **Full suite**: 93 suites / 1267 tests passing (up from 19-02's 1261 baseline; +6 net from this plan). `tsc --noEmit` exits 0.

## Task Commits

1. **Task 1 RED — failing tests for SessionManifest.conclaveHome** — `c4ee7c2` (test)
2. **Task 1 GREEN — populate SessionManifest.conclaveHome at save time** — `4672697` (feat)
3. **Task 2 RED — failing tests for MCP conclave_home JSON field** — `f743c10` (test)
4. **Task 2 GREEN — surface conclave_home in MCP responses + README docs** — `32d0d74` (feat)

## Files Created/Modified

### Production code

- **src/types/index.ts** — Added optional `conclaveHome?: string` to `SessionManifest` with AUDIT-04 JSDoc citation. Field sits at the bottom of the interface, after `outputFiles`.
- **src/core/SessionManager.ts** — `createSessionManifest()` now stamps `conclaveHome: getConclaveHome()` onto the returned manifest. No other changes (the `getConclaveHome` import was already present from 19-02).
- **src/mcp/server.ts** — Added `import { getConclaveHome }`; rendered `**Conclave home:** <path>` on all 3 `handleStatus` branches (resolved once at top of function); added top-level `conclave_home` field to the `formatDiscussionResultJson` return.
- **README.md** — New `## Environment Variables` / `### LLM_CONCLAVE_HOME (AUDIT-04)` section inserted above `## Troubleshooting`. Documents precedence, bash example, MCP-config JSON example, and cross-references the three observability surfaces.

### Test code

- **src/core/__tests__/SessionManager.test.ts** — New `describe('createSessionManifest populates conclaveHome (AUDIT-04)')` block with 3 tests: env-unset tmpdir default, LLM_CONCLAVE_HOME override, field present when result.cost missing.
- **src/mcp/__tests__/server.handlers.test.ts** — New `describe('Phase 19 — AUDIT-04 conclave_home reporting')` block with 3 tests: env-unset tmpdir default on JSON response, LLM_CONCLAVE_HOME override on JSON response, existing fields preserved.

## Grep Invariants Proving the Surface

```
$ grep -c "conclaveHome?:" src/types/index.ts
1

$ grep -c "conclaveHome: getConclaveHome()" src/core/SessionManager.ts
1

$ grep -c "conclave_home" src/mcp/server.ts
1    # (in formatDiscussionResultJson)

$ grep -c "Conclave home" src/mcp/server.ts
3    # (handleStatus: active / recent / no-sessions branches)

$ grep -c "getConclaveHome" src/mcp/server.ts
3    # (import + handleStatus top + formatDiscussionResultJson)

$ grep -c "LLM_CONCLAVE_HOME" README.md
4    # (heading + precedence + bash example + JSON example)

$ grep -c "conclaveHome" README.md
2    # (config-key name + SessionManifest reference)

$ grep -c "AUDIT-04" README.md
1    # (section traceability citation)

$ grep -c "conclave_home" src/mcp/__tests__/server.handlers.test.ts
8    # (describe + 3 tests × 2 assertions each + 1 hasOwnProperty check)
```

All invariants satisfied. No existing response field renamed/removed (spot-checked `task`, `summary`, `session_id`, `log_file` remain as their own assertion in the "existing fields preserved" test).

## AUDIT-04 Success Criteria Coverage (Phase 19 close-out)

Mapping ROADMAP Phase 19 success criteria to code location:

| SC | Description | Covered by |
|----|-------------|------------|
| SC#1 | `LLM_CONCLAVE_HOME` redirects discuss-flow artifacts (sessions, discuss-logs, active-discussion.json) | 19-02 Task 1+2 — SessionManager, StatusFileManager, DiscussionRunner rewired |
| SC#2 | Default behavior unchanged for installs without env var / config key | 19-01 precedence chain (fallback to `os.homedir()/.llm-conclave`) + 19-02 baseline test |
| SC#3 | Resolved root reported in MCP tool responses or session manifests | **19-03** — formatDiscussionResultJson `conclave_home`, SessionManifest `conclaveHome`, handleStatus markdown |
| SC#4 | Precedence documented + covered by tests on env-set and env-unset paths | **19-03** — README `Environment Variables` section + handler tests pinning both paths |

Phase 19 is complete.

## Decisions Made

- **camelCase on SessionManifest, snake_case in JSON response.** Rationale: matches existing project convention. The manifest uses camelCase throughout (`agentSubstitutions`, `currentRound`), while `formatDiscussionResultJson` uses snake_case (`consensus_reached`, `section_order`). Introducing a different casing for one field would break grep-ability and confuse downstream consumers.
- **Optional field on manifest, required-shape in JSON.** Rationale: SessionManifest files from pre-Phase-19 runs live on disk and must still parse; JSON responses are generated fresh per tool call, so `conclave_home` is always populated and never undefined. The `?` belongs on the persisted field only.
- **Resolve getConclaveHome() once per handleStatus invocation.** Rationale: called multiple times per request, but the resolver is cheap. Resolving once and reusing reads cleanly and makes future tests that mock the resolver simpler (single call to track).
- **Test the pure formatter directly instead of the full handler.** Rationale: `formatDiscussionResultJson` was exported in 17-03 specifically to enable direct unit testing. Going through `callToolHandler → handleDiscuss` would require orchestration mocks that don't add value for a field-presence assertion.
- **Informational-only persisted field.** Rationale: `session.conclaveHome` is a snapshot, not a directive. Production code that needs the current root calls `getConclaveHome()` fresh at runtime — preventing the T-19-09 tampering case where a doctored session.json could redirect writes.

## Deviations from Plan

None — plan executed exactly as written.

Both tasks' acceptance criteria met on first GREEN attempt; no Rule 1/2/3 auto-fixes needed. The `getConclaveHome` import was already present in `SessionManager.ts` from 19-02 (confirmed via grep; plan anticipated this with a "don't duplicate" note) and absent in `src/mcp/server.ts` (so the Task 2 action to add it applied as-written).

## Known Stubs

None — every new field is fully wired to a real resolver output. No placeholders, no "coming soon" strings, no mock data.

## Threat Flags

None — the only new trust-boundary-adjacent surface is the persisted/returned path string, which was explicitly addressed in the plan's threat model (T-19-07, T-19-08, T-19-09 all accepted with documented rationale). No new surface introduced beyond what the plan anticipated.

## Issues Encountered

- **Jest open-handle warning** (pre-existing): `npx jest` exhibits the "Jest did not exit one second after the test run has completed" warning. All 1267 tests pass before the hang. Same issue present in 19-01 and 19-02 outputs; not introduced by this plan.
- **Concurrent jest runs during development** (self-inflicted, resolved): a background jest invocation was re-spawned while the first was still running. Cleaned up via `kill`; does not affect the committed state.

## User Setup Required

None. Default behavior (no env var, no config key) produces the same output as pre-Phase-19 runs plus the new `conclaveHome` / `conclave_home` fields pointing at `~/.llm-conclave`. Sandboxed operators who set `LLM_CONCLAVE_HOME=/some/path` will see:
- every `session.json` has `"conclaveHome": "/some/path"`
- every `llm_conclave_discuss` JSON response has `"conclave_home": "/some/path"`
- `llm_conclave_status` markdown includes `**Conclave home:** \`/some/path\``

## Phase 19 Close-Out Summary

Phase 19 (configurable-logs-path / AUDIT-04) is now complete across three plans:

- **19-01** — `getConclaveHome()` resolver contract (env → config-file → tmpdir → legacy) + 16 precedence unit tests. Baseline: 1241 tests green.
- **19-02** — SessionManager, StatusFileManager, DiscussionRunner rewired to the resolver. +20 integration tests. Baseline: 1261 tests green.
- **19-03** — Observability + docs (this plan). SessionManifest, MCP JSON, handleStatus, README. +6 handler/manager tests. Baseline: 1267 tests green.

All four ROADMAP success criteria for Phase 19 have at least one test asserting the behavior; the contract is documented end-to-end from resolver through consumer to observability surface. Trollix (and any future sandboxed MCP caller) can now redirect all discuss-flow artifacts by setting a single env var, verify the redirect via any of three response surfaces, and read the documented precedence in the README.

Out-of-scope paths deliberately NOT migrated (consult-flow: `ArtifactStore`, `src/consult/**`, `ConsultLogger`, `PersonaSystem`, `FilterConfig`) remain on their original paths. Those are consult-flow concerns, not covered by AUDIT-04 SC#1 which names only discuss-flow. Future phase candidate.

## Self-Check: PASSED

- `src/types/index.ts` contains `conclaveHome?:` (1 match) — verified via grep
- `src/types/index.ts` contains `AUDIT-04` (1 match for new field JSDoc) — verified via grep
- `src/core/SessionManager.ts` contains `conclaveHome: getConclaveHome()` (1 match) — verified via grep
- `src/core/SessionManager.ts` contains `AUDIT-04` (2 matches: Phase 18 invariant + Phase 19 field stamp) — verified via grep
- `src/mcp/server.ts` contains `conclave_home` (1 match in formatDiscussionResultJson) — verified via grep
- `src/mcp/server.ts` contains `Conclave home` (3 matches for handleStatus branches) — verified via grep
- `src/mcp/server.ts` contains `getConclaveHome` (3 matches: import + handleStatus + formatDiscussionResultJson) — verified via grep
- `README.md` contains `LLM_CONCLAVE_HOME` (4 matches: heading, precedence, bash example, JSON example) — verified via grep
- `README.md` contains `conclaveHome` (2 matches: config-key name + SessionManifest field reference) — verified via grep
- `README.md` contains `AUDIT-04` (1 match: section heading) — verified via grep
- `src/mcp/__tests__/server.handlers.test.ts` contains `conclave_home` (8 matches across 3 new tests) — verified via grep
- Commit `c4ee7c2` (Task 1 RED) exists in git log
- Commit `4672697` (Task 1 GREEN) exists in git log
- Commit `f743c10` (Task 2 RED) exists in git log
- Commit `32d0d74` (Task 2 GREEN) exists in git log
- `npx tsc --noEmit` exits 0
- `npx jest --no-coverage` reports 1267/1267 tests passing across 93 suites
- No existing MCP response field renamed/removed (assertion in "existing fields preserved" test)
- SessionManifest backward compat preserved (field is optional, pre-Phase-19 session.json still parses)

---
*Phase: 19-configurable-logs-path*
*Completed: 2026-04-17*
