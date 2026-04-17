---
phase: 20-degraded-status-judge-coinage
plan: 01
subsystem: session-status
tags: [audit, degraded-status, session-manifest, mcp-response, audit-05]
requirements: [AUDIT-05]
dependency_graph:
  requires: [SessionManager.createSessionManifest, formatDiscussionResultJson, RunIntegrity (Phase 13.1), agentSubstitutions (Phase 12-02)]
  provides: [computeSessionStatus, SessionManifest.status 'completed_degraded', MCP response session_status]
  affects: [src/core/SessionManager.ts, src/types/index.ts, src/mcp/server.ts, src/mcp/__tests__/server.handlers.test.ts, src/core/__tests__/SessionManager.degraded.test.ts]
tech_stack:
  added: []
  patterns: [pure-function-fold-of-signals, additive-enum-value, additive-json-field, named-export-alongside-default]
key_files:
  created:
    - src/core/__tests__/SessionManager.degraded.test.ts
  modified:
    - src/types/index.ts
    - src/core/SessionManager.ts
    - src/mcp/server.ts
    - src/mcp/__tests__/server.handlers.test.ts
decisions:
  - Compression-active-alone is NOT degraded — only summarizer fallback counts as a degradation signal; compression activation is normal behavior under token pressure.
  - session_status is an ADDITIVE field, distinct from pre-existing `degraded` / `degraded_reason` (which mean "discussion aborted mid-run" — a different concept).
  - computeSessionStatus is a named export alongside the default SessionManager class — utilities are named exports per project convention.
  - Test-double for SessionManager uses `jest.requireActual` to delegate `computeSessionStatus` to the real implementation, so session_status derivation is exercised end-to-end rather than stubbed.
metrics:
  duration: ~25m
  completed_date: 2026-04-17
  tasks_completed: 2
  tests_added: 17
  commits: 4
---

# Phase 20 Plan 01: Degraded Status Summary

`completed_degraded` session status derived from four degradation signals (substitution, failed agents, absent participation, summarizer fallback) and surfaced on session.json, the MCP discuss/continue JSON response, and handleStatus/handleSessions markdown.

## What Shipped

### computeSessionStatus helper (`src/core/SessionManager.ts`)

Pure function, named export. Folds four degradation signals from a ConversationManager result into a two-valued status:

- `agentSubstitutions` non-empty → `completed_degraded`
- `failedAgents` non-empty → `completed_degraded`
- Any `runIntegrity.participation[i].status !== 'spoken'` (absent-capped, absent-silent, absent-failed) → `completed_degraded`
- `runIntegrity.compression.summarizerFallback` non-null → `completed_degraded`
- Otherwise → `completed`

Defensive against missing `runIntegrity` (pre-Phase-13.1 fixtures) — participation/summarizer checks skip; substitution/failed-agents checks still apply.

### SessionManifest.status union extended (`src/types/index.ts`)

```typescript
status: 'in_progress' | 'completed' | 'completed_degraded' | 'interrupted' | 'error';
```

Additive — existing consumers that only check for `'completed'` continue to parse the response; they simply will not treat a degraded completion as clean.

### createSessionManifest wired (`src/core/SessionManager.ts`)

Replaced hard-coded `status: 'completed'` with `status: computeSessionStatus(result)`. The invariant at line 269 (round counter drift check from Phase 18) is unchanged.

### MCP response `session_status` field (`src/mcp/server.ts`)

`formatDiscussionResultJson` gains an additive top-level `session_status` field next to the pre-existing `degraded` / `degraded_reason` (which keep their "aborted mid-run" semantics).

### handleStatus + handleSessions markdown (`src/mcp/server.ts`)

Both branches that render session summaries now emit `- **Status:** <value>` between the Consensus and Rounds lines, so a user checking `llm_conclave_status` or `llm_conclave_sessions` sees clean-vs-degraded at a glance.

## Test Coverage

### Task 1 — `src/core/__tests__/SessionManager.degraded.test.ts` (11 tests + 1 type-level)

Pure-helper tests:
1. clean run → `completed`
2. substitution fired → `completed_degraded`
3. failed agent → `completed_degraded`
4. absent-silent participation → `completed_degraded`
5. absent-capped participation → `completed_degraded`
6. absent-failed participation → `completed_degraded`
7. summarizer fallback → `completed_degraded`
8. compression-active-alone (no fallback) → `completed` (NEGATIVE — compression activation is normal)
9. missing runIntegrity defensively → `completed` (NEGATIVE — pre-13.1 fixtures)

Integration tests:
10. end-to-end createSessionManifest with substitution → manifest.status `completed_degraded`
11. end-to-end createSessionManifest with clean result → manifest.status `completed`

Type-level: `const _s: SessionManifest['status'] = 'completed_degraded'` — tsc trips if the union is reverted.

### Task 2 — `src/mcp/__tests__/server.handlers.test.ts` Phase 20 describe block (6 tests)

1. clean-run JSON → `session_status === 'completed'`
2. degraded-run JSON → `session_status === 'completed_degraded'`
3. SC#5 non-regression: every pre-existing top-level field preserved on a degraded run; `degraded` / `degraded_reason` remain `undefined` (they mean "aborted", not "completed with fallback")
4. handleStatus last-completed branch renders `**Status:** completed_degraded` on a degraded session
5. handleStatus last-completed branch renders `**Status:** completed` on a clean session
6. handleSessions listing renders both `**Status:**` lines across a 2-session mixed listing

## Metrics

| Metric | Value |
|---|---|
| Total tests (before) | 1267 |
| Total tests (after) | 1284 |
| New tests added | 17 (11 SessionManager + 6 handler) |
| Suites affected | 2 (both clean) |
| `tsc --noEmit` | clean |
| Files created | 1 |
| Files modified | 4 |
| Commits | 4 (RED/GREEN × 2 tasks) |

## Commits

| Commit | Message |
|---|---|
| 6c55397 | test(20-01): add failing tests for AUDIT-05 computeSessionStatus + degraded status |
| dc56886 | feat(20-01): implement AUDIT-05 computeSessionStatus + completed_degraded |
| fed3721 | test(20-01): add failing tests for AUDIT-05 session_status on MCP response + Status markdown |
| 559947a | feat(20-01): surface session_status on MCP response + Status markdown (AUDIT-05) |

## Deviations from Plan

None — plan executed exactly as written. Only a trivial test-infrastructure augmentation was required: the existing `jest.mock('../../core/SessionManager.js', ...)` stub in `server.handlers.test.ts` did not expose the new named export, so after the GREEN edit to `server.ts` the Phase 20 handler tests hit `computeSessionStatus is not a function`. Resolved by having the mock delegate the named export to `jest.requireActual` — a mechanical mock-completeness fix, not a design deviation.

## Authentication Gates

None — no auth surface touched.

## TDD Gate Compliance

Both tasks followed RED → GREEN:

- **Task 1 RED** (`6c55397`): test commit lands 11 failing tests + 1 type assertion — tsc rejects `computeSessionStatus` import because it's not yet exported.
- **Task 1 GREEN** (`dc56886`): feat commit exports `computeSessionStatus`, extends the status union, wires helper into createSessionManifest — all 11 pass + tsc clean.
- **Task 2 RED** (`fed3721`): test commit lands 6 failing Phase 20 tests — 3 fail on missing `session_status` field, 3 fail on absent `**Status:**` markdown lines.
- **Task 2 GREEN** (`559947a`): feat commit adds `session_status` to JSON response, renders `**Status:**` in both markdown branches — all 6 pass.

No REFACTOR step needed — both GREEN implementations are already minimal.

## Known Stubs

None. Every new code path is wired to live data (computeSessionStatus reads the production ConversationManager result shape; the MCP response emits the derived value directly).

## Self-Check: PASSED

Files verified present:
- FOUND: src/core/__tests__/SessionManager.degraded.test.ts
- FOUND: src/types/index.ts (modified — status union extended)
- FOUND: src/core/SessionManager.ts (modified — computeSessionStatus exported, wired)
- FOUND: src/mcp/server.ts (modified — session_status + 2 Status renders)
- FOUND: src/mcp/__tests__/server.handlers.test.ts (modified — Phase 20 describe block)

Commits verified present in git log:
- FOUND: 6c55397 (Task 1 RED)
- FOUND: dc56886 (Task 1 GREEN)
- FOUND: fed3721 (Task 2 RED)
- FOUND: 559947a (Task 2 GREEN)

Test suite verified: 1284 passing, 94 suites green, tsc clean.
