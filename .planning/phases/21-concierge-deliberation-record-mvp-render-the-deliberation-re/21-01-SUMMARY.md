---
phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
plan: "01"
subsystem: consult/formatting
tags: [constants-extraction, pdf-deps, types, tdd]
dependency_graph:
  requires: []
  provides:
    - deliberationRecordConstants.ts (SSOT for 8-field structure, sanitizeFraming)
    - ExportFormat/BrandingInputs/DeliberationExportResult types
    - pdfkit + pdf-parse dependencies
  affects:
    - DeliberationRecordFormatter.ts (imports from constants module)
    - downstream PDF renderer (21-02 consumes deliberationRecordConstants)
    - downstream export core (21-03 consumes DeliberationExportResult type)
tech_stack:
  added: [pdfkit@^0.19.1, pdf-parse@^1.1.1, "@types/pdfkit@^0.13.0"]
  patterns: [extract-shared-module, tdd-red-green]
key_files:
  created:
    - src/consult/formatting/deliberationRecordConstants.ts
    - src/consult/formatting/__tests__/deliberationRecordConstants.test.ts
  modified:
    - src/consult/formatting/DeliberationRecordFormatter.ts
    - src/types/deliberationRecord.ts
    - package.json
    - package-lock.json
decisions:
  - Use pdfkit@^0.19.1 (actual latest) not plan-specified ^0.15.0 — npm view returned 0.19.1
  - pdf-parse@^1.1.1 resolves to 1.1.4 (1.x series present on npm, per plan)
metrics:
  duration: "~8 minutes"
  completed: "2026-06-15"
  tasks_completed: 3
  files_modified: 6
---

# Phase 21 Plan 01: Shared Foundation — Constants, Types, PDF Dependencies Summary

Extracted the 8-field deliberation record constants and sanitizeFraming gate into a single shared module (D-06), added the BrandingInputs/ExportFormat/DeliberationExportResult types for downstream plans, and bumped the Node.js engine requirement and PDF dependencies. Markdown formatter output is byte-identical to Phase 12.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Bump engines >=20.0.0 + add pdfkit/pdf-parse deps | 1500d71 | package.json, package-lock.json |
| 2 (RED) | TDD: failing tests for deliberationRecordConstants module | 32958ea | __tests__/deliberationRecordConstants.test.ts |
| 2 (GREEN) | Extract constants module + refactor markdown formatter | 4b5f0f8 | deliberationRecordConstants.ts, DeliberationRecordFormatter.ts |
| 3 | Add BrandingInputs, ExportFormat, DeliberationExportResult types | 75a17a6 | src/types/deliberationRecord.ts |

## Verification

- `npm run build` exits 0
- All 7 existing `DeliberationRecord.test.ts` tests pass (markdown byte-identical regression)
- All 15 new `deliberationRecordConstants.test.ts` tests pass
- `node -e "require('pdfkit'); require('pdf-parse')"` exits 0
- `node -e "require('./package.json').engines.node"` returns `>=20.0.0`

## Deviations from Plan

### Auto-adjusted: pdfkit version

**Found during:** Task 1
**Issue:** Plan specified `^0.15.0` as example but instructed to run `npm view pdfkit version` and use the current major.minor. `npm view pdfkit version` returned `0.19.1`.
**Fix:** Used `"pdfkit": "^0.19.1"` (current latest).
**Rule applied:** Plan instruction explicitly says to use the result of npm view.

No other deviations.

## TDD Gate Compliance

- RED commit: `32958ea` (test suite fails with TS2307 — module not found)
- GREEN commit: `4b5f0f8` (22 tests pass across both suites)
- REFACTOR: not needed; implementation was clean on first pass

## Known Stubs

None. This plan creates foundational infrastructure (constants, types, deps) with no rendering or UI output.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

Files:
- FOUND: src/consult/formatting/deliberationRecordConstants.ts
- FOUND: src/consult/formatting/__tests__/deliberationRecordConstants.test.ts
- FOUND: src/consult/formatting/DeliberationRecordFormatter.ts (modified)
- FOUND: src/types/deliberationRecord.ts (modified)

Commits:
- FOUND: 1500d71
- FOUND: 32958ea
- FOUND: 4b5f0f8
- FOUND: 75a17a6
