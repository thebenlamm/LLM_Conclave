---
phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
plan: "04"
subsystem: mcp/http-route
tags: [http-route, auth, body-size-cap, fail-closed, tdd, pdf-export, hosting-docs]
dependency_graph:
  requires: [21-03]
  provides:
    - POST /api/export_record route (fail-closed auth, 64kb body cap, JSON envelope)
    - registerExportRoute(app) exported factory for test isolation
    - Startup log line for export route
    - README single-tenant hosting section (reverse-proxy + TLS + mandatory API key)
  affects:
    - src/mcp/server.ts (new route registered before global json parser)
    - README.md (hosting section)
    - src/mcp/__tests__/exportRecordRoute.test.ts (new test file)
tech_stack:
  added: []
  patterns:
    - fail-closed-auth (invert optional auth to mandatory; unset key = 503)
    - route-scoped-body-size-cap (express.json({limit:'64kb'}) BEFORE global parser)
    - route-level-4arg-error-middleware (entity.too.large → 400 JSON)
    - shared-core-delegate (route is thin; all record logic in exportDeliberationRecordCore)
    - tdd-red-green
key_files:
  created:
    - src/mcp/__tests__/exportRecordRoute.test.ts
  modified:
    - src/mcp/server.ts
    - README.md
decisions:
  - Export registerExportRoute(app) factory from server.ts — test mounts route on a real
    Express app without booting the full SSE server (avoids 20+ mocks, real HTTP behavior)
  - Route registered BEFORE app.use(express.json()) in startSSE so 64kb cap is live
    (body-parser skips if req._body already true — plan interface note)
  - Route-level 4-arg error middleware maps entity.too.large to 400 (no global handler)
  - Minimal MCP SDK mocks in test + no express mock — real express + real http for accurate
    body-size regression guard
  - Fail-closed 503 (not 401) when CONCLAVE_API_KEY unset — signals misconfiguration vs. auth failure
metrics:
  duration: "~25 minutes"
  completed: "2026-06-15"
  tasks_completed: 3
  files_modified: 3
---

# Phase 21 Plan 04: HTTP Export Route + Hosting Docs Summary

Hardened `POST /api/export_record` HTTP route delegating to the Plan 03 shared core: fail-closed `CONCLAVE_API_KEY` auth (503 when unset, 401 on bad token), route-scoped `express.json({limit:'64kb'})` registered before the global parser (live cap), route-level error middleware mapping `entity.too.large` → 400 JSON, full `{ success, format, content, concern_keys, unmatched_mitigations }` envelope, base64 PDF encoding, and README single-tenant TLS/reverse-proxy hosting section.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| Task 1 RED | Failing tests for POST /api/export_record (registerExportRoute not exported) | 34196cf | `exportRecordRoute.test.ts` |
| Task 1 GREEN | Implement registerExportRoute + wire into startSSE + startup log | c78c6c9 | `server.ts` |
| Task 3 | README single-tenant hosting section (reverse proxy, TLS, mandatory key) | 900bfa0 | `README.md` |

Note: Task 2 (route test file) and Task 1 RED are the same artifact. The test file written in RED covers all of Task 2's behavior block. No separate Task 2 commit was needed — the test file passes after Task 1 GREEN.

## Verification

- `npm run build` exits 0
- All 9 `exportRecordRoute.test.ts` tests pass (auth matrix, envelope, base64 PDF, traversal-400, oversize-400 body-size error, mitigation reconciliation)
- Full suite: 108 suites, 1570 tests — all pass (no regressions)
- `grep -q "/api/export_record" src/mcp/server.ts` → PASS
- `grep -q "limit: '64kb'" src/mcp/server.ts` → PASS
- `grep -q "entity.too.large" src/mcp/server.ts` → PASS
- `grep -q "if (!apiKey)" src/mcp/server.ts` → PASS (fail-closed 503 branch)
- `grep -q "concern_keys" src/mcp/server.ts` → PASS
- `grep -q "unmatched_mitigations" src/mcp/server.ts` → PASS
- Startup log: `POST http://localhost:${port}/api/export_record` at L2103 → PASS
- Route at L1840 (`registerExportRoute(app)` call at L1934) BEFORE `app.use(express.json())` at L1936 → PASS
- README: reverse proxy, TLS, 127.0.0.1, /api/export_record, CONCLAVE_API_KEY → all present

## Deviations from Plan

### Design Adjustments (not bugs — plan-directed options exercised)

**1. [Plan option used] Extracted `registerExportRoute(app)` factory**
- **Rationale:** Plan Task 2 says "extract the route handler into a small exported factory in server.ts if needed". Used this option to allow the test to mount the route on a minimal express app without booting the full SSE server.
- **Effect:** The factory is exported from server.ts; all acceptance criteria patterns (entity.too.large, limit:'64kb', etc.) remain in server.ts (not a separate module). No acceptance criteria violated.
- **Files modified:** `server.ts` (export added)

**2. [Design] Minimal MCP SDK mocking in test (not full handler-test mock set)**
- **Rationale:** The test needs REAL express (no mock) and REAL http to test body-size enforcement. Unlike server.handlers.test.ts (which mocks express), the route test starts a real http server on port 0 and makes actual HTTP requests.
- **Effect:** Only MCP SDK modules are mocked (to suppress side effects on import); all else is real. This correctly exercises the body-size cap, 4-arg error middleware, and header parsing.

### None — plan executed within design options

## TDD Gate Compliance

- RED commit: `34196cf` (TS2305 — 'registerExportRoute' not exported from '../server')
- GREEN commit: `c78c6c9` (all 9 tests pass)
- REFACTOR: not needed — implementation clean on first pass

## Known Stubs

None. The route is fully wired: auth → body parse → core delegate → base64 encode → envelope. No hardcoded values or placeholders.

## Threat Flags

All threats from the plan's threat model are mitigated by this implementation:

| Flag | File | Description |
|------|------|-------------|
| T-21-08 mitigated | server.ts L1866-1873 | Fail-closed: `if (!apiKey)` → 503; `provided !== apiKey` → 401 |
| T-21-09 mitigated | server.ts L1841-1862 | Route-scoped `express.json({limit:'64kb'})` + 4-arg error mw maps entity.too.large → 400 |
| T-21-10 mitigated | server.ts L1922 | ExportValidationError (from core SESSION_ID_RE guard) mapped to 400 |
| T-21-11 mitigated | server.ts L1904+, README | Never 200 with empty content; 500 path logs server-side; raw port not exposed (reverse-proxy + TLS doc) |

No new threat surface beyond what the plan's threat model covers.

## Self-Check: PASSED

Files:
- FOUND: src/mcp/server.ts (modified — registerExportRoute exported, route in startSSE before global parser)
- FOUND: src/mcp/__tests__/exportRecordRoute.test.ts (created)
- FOUND: README.md (modified — hosting section added)

Commits:
- FOUND: 34196cf (test RED)
- FOUND: c78c6c9 (feat GREEN)
- FOUND: 900bfa0 (docs Task 3)
