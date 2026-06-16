---
phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
plan: "06"
subsystem: mcp-rest-api, export-core
tags: [security, hardening, auth, validation, byte-semantics]
dependency_graph:
  requires: [21-04]
  provides: [hardened-export-route, hardened-export-core]
  affects: [src/mcp/server.ts, src/consult/formatting/exportDeliberationRecordCore.ts]
tech_stack:
  added: [crypto.timingSafeEqual, Buffer.byteLength]
  patterns: [constant-time-compare, boundary-type-guard, generic-500-handler]
key_files:
  created: []
  modified:
    - src/mcp/server.ts
    - src/mcp/__tests__/exportRecordRoute.test.ts
    - src/consult/formatting/exportDeliberationRecordCore.ts
    - src/consult/formatting/__tests__/exportDeliberationRecordCore.test.ts
decisions:
  - "timingSafeEqual with length pre-check (not just timingSafeEqual alone) — unequal lengths must short-circuit without calling timingSafeEqual on mismatched buffers which would throw"
  - "Boundary guards (route) AND core guards (typeof) both present — defense-in-depth; route prevents TypeError from reaching core, core independently throws ExportValidationError for defense against non-HTTP callers"
  - "Buffer.byteLength used for byte-accurate cap enforcement; mitKeys.length check (entry count) and trim() check (empty string) preserved unchanged"
  - "':' removed from SESSION_ID_RE — verified safe against SessionManager.generateSessionId which strips colons via .replace(/[:.]/g, '-')"
  - "Generic 500 handler logs full detail server-side via console.error; never echoes raw err.message — honors validatePath FS-suppression precedent"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-16T04:57:00Z"
  tasks: 2
  files_modified: 4
---

# Phase 21 Plan 06: HTTP Route + Core Hardening Summary

**One-liner:** Constant-time bearer auth, non-string session_id 400 boundary guard, generic 500 handler (no FS path leak), colon-free session_id regex, and Buffer.byteLength byte-accurate caps across the export route and shared core.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Harden export route: constant-time auth, non-string 400, generic 500 (WR-02, WR-03, WR-04) | 3ca09e5 | server.ts, exportRecordRoute.test.ts |
| 2 | Core hardening: session_id type guard, ':'-free regex, byte-accurate caps (WR-03 core, IN-01, IN-02) | b97d691 | exportDeliberationRecordCore.ts, exportDeliberationRecordCore.test.ts |

## Success Criteria

- WR-02 resolved: constant-time, length-safe bearer compare via `crypto.timingSafeEqual` — `Buffer.from(provided ?? '')` compared with `Buffer.from(apiKey)` using length pre-check before `timingSafeEqual` call.
- WR-03 resolved: non-string `session_id` returns 400 at BOTH the route boundary (`typeof b.session_id !== 'string'`) and the core (`typeof input.sessionId !== 'string'`). Non-object `branding`/`mitigations` also return 400 at boundary.
- WR-04 resolved: 500 handler returns `{ success: false, error: 'Internal server error' }` and logs full detail via `console.error`; raw `err.message` never echoed to client.
- IN-01 resolved: `:` removed from `SESSION_ID_RE`; regex is now `/^[A-Za-z0-9_\-]{1,200}$/`; docstring and error message updated to remove colon references.
- IN-02 resolved: all 7 per-field cap checks use `Buffer.byteLength(value)` (9 total Buffer.byteLength calls when including error message usage); error messages say "bytes" not "characters"; entry-count and empty-string checks unchanged.

## Tests

- Route suite: 12 tests total, 3 new (non-string session_id → 400, non-object branding → 400, generic 500 message) — all pass.
- Core suite: 16 tests total, 5 new (non-string sessionId throws EVE, colon-containing ID rejected, real-shaped ID accepted, multibyte over-cap rejected, ASCII at-cap accepted) — all pass.
- Full suite: 1578 tests across 108 suites — all green.

## Deviations from Plan

### Auto-added

**1. [Rule 2 - Missing validation] Added non-object branding/mitigations guards**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified non-string session_id guard but noted "branding/mitigations of wrong type are similarly unguarded (less severe — they degrade silently)." The plan action block explicitly included the branding/mitigations guards.
- **Fix:** Added both guards at route boundary; added corresponding test (Test 11) to verify 400 response for string-typed branding.
- **Files modified:** server.ts, exportRecordRoute.test.ts
- **Commit:** 3ca09e5

No other deviations — plan executed as written.

## Known Stubs

None. All guards wired to correct behavior.

## Threat Flags

No new security-relevant surface introduced. Plan closed the following threats from the threat register:

| Closed | Component | Resolution |
|--------|-----------|------------|
| T-21-10 | Auth compare (server.ts:1877) | timingSafeEqual with length pre-check |
| T-21-11 | Route boundary session_id + core | typeof guard at both boundary and core |
| T-21-12 | 500 handler (server.ts:1922) | Generic message; detail logged server-side |
| T-21-13 | SESSION_ID_RE | ':' removed from character class |
| T-21-14 | Per-field caps | Buffer.byteLength enforces true byte semantics |

## Self-Check: PASSED

- [x] `src/mcp/server.ts` modified — verified via `git show b97d691..3ca09e5`
- [x] `src/consult/formatting/exportDeliberationRecordCore.ts` modified — exists and correct
- [x] Commit `3ca09e5` exists — Task 1 route hardening
- [x] Commit `b97d691` exists — Task 2 core hardening
- [x] Full suite 1578/1578 tests passing
