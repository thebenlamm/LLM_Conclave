---
phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
plan: "03"
subsystem: consult/formatting
tags: [shared-core, export-core, input-guards, path-traversal, mitigation-reconciliation, tdd]
dependency_graph:
  requires: [21-02]
  provides:
    - exportDeliberationRecordCore.ts (shared export core D-07, Promise<DeliberationExportResult>)
    - ExportValidationError (typed error; transports map to 400)
    - ExportCoreInput interface
    - MCP handleExportRecord rewired to shared core
    - export_record tool schema extended with format/branding/mitigations
  affects:
    - src/mcp/server.ts (handleExportRecord + tool schema)
    - src/mcp/__tests__/server.handlers.test.ts (FormatterFactory mock + handler test)
    - downstream Plan 04 (HTTP route will call exportDeliberationRecordCore)
tech_stack:
  added: []
  patterns:
    - shared-core-across-transports (D-07)
    - session-id-allowlist-regex (D-09)
    - per-field-length-caps (D-10)
    - tdd-red-green
    - throw-never-return-empty (SPEC-R4/R7)
key_files:
  created:
    - src/consult/formatting/exportDeliberationRecordCore.ts
    - src/consult/formatting/__tests__/exportDeliberationRecordCore.test.ts
  modified:
    - src/mcp/server.ts
    - src/mcp/__tests__/server.handlers.test.ts
decisions:
  - Use getMostRecentSession manifest directly (no second loadSession call) — session already loaded, avoiding redundant FS read
  - All input guards run inline in core before any FS touch — transport-independent protection (D-09/D-10)
  - ExportValidationError is throw-only — never return success envelope with empty content (SPEC-R7)
  - Per-field caps are defense-in-depth only; aggregate body cap deferred to Plan 04 HTTP body-size limit
  - MCP PDF response returns base64 text + concern summary (MCP has no HTTP status codes)
metrics:
  duration: "~15 minutes"
  completed: "2026-06-15"
  tasks_completed: 2
  files_modified: 4
---

# Phase 21 Plan 03: Shared Export Core — exportDeliberationRecordCore Summary

Shared export core (D-07) that both MCP and future HTTP transports delegate to: loads session read-only, builds DeliberationRecordSource once (D-05), dispatches markdown vs PDF via FormatterFactory (D-08), threads keyed mitigations into Field 6 (SPEC-R5), computes concernKeys + unmatchedMitigations (SPEC-R6), and enforces session_id allowlist + field-length caps inline before any FS touch (D-09/D-10). MCP handleExportRecord rewired to delegate to the core; mitigations:{} hardcode removed.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| Task 1 RED | Failing tests for exportDeliberationRecordCore (TS2307 — module not found) | d2d8928 | `__tests__/exportDeliberationRecordCore.test.ts` |
| Task 1 GREEN | Implement exportDeliberationRecordCore with all guards, reconciliation, dispatch | d88ac2b | `exportDeliberationRecordCore.ts` |
| Task 2 | Rewire MCP handleExportRecord + extend tool schema + fix handler test mock | ee5499f | `server.ts`, `server.handlers.test.ts` |

## Verification

- `npm run build` exits 0
- All 11 new `exportDeliberationRecordCore.test.ts` tests pass
- All 1,561 existing tests across 107 suites pass (no regressions)
- `grep -q "export async function exportDeliberationRecordCore" src/consult/formatting/exportDeliberationRecordCore.ts` succeeds
- SESSION_ID_RE guard at line 192; first `sm.loadSession` at line 217 — guard fires before FS touch
- `grep -c "mitigations: {}" src/mcp/server.ts` returns 0 (hardcode removed)
- `grep -q "exportDeliberationRecordCore" src/mcp/server.ts` succeeds
- `grep -q "format" src/mcp/server.ts` within export_record schema (format/branding/mitigations added)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FormatterFactory mock missing renderDeliberationRecord method**
- **Found during:** Task 2 (server.handlers.test.ts export test failed with "not a function")
- **Issue:** The Jest mock for `FormatterFactory` in `server.handlers.test.ts` only mocked `format` (sync method). The new `exportDeliberationRecordCore` calls `FormatterFactory.renderDeliberationRecord` (async), which was `undefined` in the mock context.
- **Fix:** Added `renderDeliberationRecord: jest.fn().mockResolvedValue('# Deliberation Record\n\n...')` to the `FormatterFactory` mock.
- **Files modified:** `src/mcp/__tests__/server.handlers.test.ts`
- **Commit:** ee5499f

**2. [Rule 1 - Bug] Handler test asserted implementation detail invalidated by refactor**
- **Found during:** Task 2 (test expected `mockLoadSession.toHaveBeenCalledWith('recent-1')`)
- **Issue:** The old `handleExportRecord` called `renderDeliberationRecordFromSession(recent.id, ...)` which internally called `loadSession`. The new core uses the manifest returned directly by `getMostRecentSession`, eliminating the redundant second `loadSession` call. The test was asserting this internal detail.
- **Fix:** Updated the test to assert `getMostRecentSession` was called (the correct behavioral check) rather than `loadSession` with the specific id. Renamed the test description to reflect the new behavior. Behavioral assertion (`# Deliberation Record` in content) unchanged.
- **Files modified:** `src/mcp/__tests__/server.handlers.test.ts`
- **Commit:** ee5499f

## TDD Gate Compliance

- RED commit: `d2d8928` (TS2307 — module `'../exportDeliberationRecordCore'` not found)
- GREEN commit: `d88ac2b` (all 11 tests pass)
- REFACTOR: not needed — implementation was clean on first pass
- Task 2 (non-TDD): `ee5499f` (MCP handler rewire)

## Known Stubs

None. The shared core is fully wired: guards, session load, builder, reconciliation, and format dispatch all execute real logic. No placeholder or hardcoded data.

## Threat Flags

All threats from plan's threat model are mitigated inline:

| Flag | File | Description |
|------|------|-------------|
| T-21-04 mitigated | exportDeliberationRecordCore.ts L152-191 | SESSION_ID_RE allowlist + '..'/null-byte check at L192, before loadSession at L217 |
| T-21-05 mitigated | exportDeliberationRecordCore.ts L100-143 | Per-field caps (operatorName/panelRationale/branding/mitigations key+value+count) |
| T-21-06 mitigated | exportDeliberationRecordCore.ts L222-223 | Verbatim concern-key match; unmatched keys in unmatchedMitigations, never positional |
| T-21-07 mitigated | exportDeliberationRecordCore.ts L210-215 | throw (not return empty) on session not found / no sessions |

No new threat surface introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

Files:
- FOUND: src/consult/formatting/exportDeliberationRecordCore.ts
- FOUND: src/consult/formatting/__tests__/exportDeliberationRecordCore.test.ts
- FOUND: src/mcp/server.ts (modified)
- FOUND: src/mcp/__tests__/server.handlers.test.ts (modified)

Commits:
- FOUND: d2d8928 (test RED)
- FOUND: d88ac2b (feat GREEN)
- FOUND: ee5499f (feat Task 2)
