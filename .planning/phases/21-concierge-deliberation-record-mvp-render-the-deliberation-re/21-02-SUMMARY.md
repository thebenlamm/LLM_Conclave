---
phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
plan: "02"
subsystem: consult/formatting
tags: [pdfkit, pdf-formatter, formatter-factory, output-format, tdd]
dependency_graph:
  requires: [21-01]
  provides:
    - DeliberationRecordPdfFormatter.ts (async pdfkit renderer, Promise<Buffer>)
    - FormatterFactory.renderDeliberationRecord() (centralized async dispatch)
    - OutputFormat.PDF enum value + throwing guard in sync switch
    - pdf-parse.d.ts (ambient type declarations)
  affects:
    - src/types/consult.ts (OutputFormat enum extended)
    - src/consult/formatting/FormatterFactory.ts (new async helper + PDF guard)
    - downstream Plans 03/04 that call renderDeliberationRecord()
tech_stack:
  added: []
  patterns: [pdfVersion-1.4-compat, tdd-red-green, whitespace-normalization-for-pdf-parse]
key_files:
  created:
    - src/consult/formatting/DeliberationRecordPdfFormatter.ts
    - src/consult/formatting/__tests__/DeliberationRecordPdf.test.ts
    - src/types/pdf-parse.d.ts
  modified:
    - src/consult/formatting/FormatterFactory.ts
    - src/types/consult.ts
decisions:
  - pdfVersion '1.4' required: pdfkit 0.19.x defaults to compressed XRef (PDF 1.5+), incompatible with pdf.js v1.10.100 in pdf-parse 1.1.4
  - Whitespace normalization for DISCLAIMER test: pdf-parse emits "space+newline" at word-wrap boundaries; .replace(/\s+/g, ' ') before substring check
  - pdf-parse.d.ts ambient module added: no @types/pdf-parse on npm; minimal hand-written declarations
metrics:
  duration: "~15 minutes"
  completed: "2026-06-16"
  tasks_completed: 3
  files_modified: 5
---

# Phase 21 Plan 02: PDF Renderer — DeliberationRecordPdfFormatter Summary

pdfkit PDF renderer walks the same 8-field DeliberationRecordSource as the markdown formatter, embeds Title/Author/CreationDate metadata, applies the sanitizeFraming gate to all LLM free-text, renders per-request branding, and is centralized in FormatterFactory.renderDeliberationRecord() with a throwing guard on the sync switch.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| Task 1 RED | Failing tests for DeliberationRecordPdfFormatter (pdf-parse.d.ts included) | ea52ed1 | __tests__/DeliberationRecordPdf.test.ts, pdf-parse.d.ts |
| Task 1 GREEN | Implement DeliberationRecordPdfFormatter + pdfVersion fix + test whitespace normalization | 23c71ed | DeliberationRecordPdfFormatter.ts, __tests__/DeliberationRecordPdf.test.ts |
| Task 2 | OutputFormat.PDF + throwing guard + renderDeliberationRecord() on FormatterFactory | 0860d2f | FormatterFactory.ts, src/types/consult.ts |

## Verification

- `npm run build` exits 0
- All 5 new `DeliberationRecordPdf.test.ts` tests pass (buffer magic, headings, metadata, branding, mitigation parity)
- All 7 existing `DeliberationRecord.test.ts` tests pass (markdown byte-identical regression)
- All 17 existing `Formatters.test.ts` tests pass (sync interface unchanged)
- `grep -q "PDF = 'pdf'" src/types/consult.ts` succeeds
- `grep -q "static async renderDeliberationRecord" src/consult/formatting/FormatterFactory.ts` succeeds
- `grep -q "case OutputFormat.PDF" src/consult/formatting/FormatterFactory.ts` with `throw` succeeds
- `grep -c "sanitizeFraming" src/consult/formatting/DeliberationRecordPdfFormatter.ts` returns 10 (>= 5 required)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pdfkit 0.19.x XRef stream incompatibility with pdf-parse 1.1.4**
- **Found during:** Task 1 GREEN (test ran but 2 of 5 failed with "bad XRef entry")
- **Issue:** pdfkit 0.19.x defaults to PDF 1.5+ compressed cross-reference streams. The pdf.js v1.10.100 bundled in pdf-parse 1.1.4 cannot parse compressed XRef streams, causing `getDocument()` to throw `UnknownErrorException`.
- **Fix:** Added `pdfVersion: '1.4'` to the PDFDocument constructor options, forcing the flat cross-reference table format that pdf.js 1.10.100 can parse.
- **Files modified:** `src/consult/formatting/DeliberationRecordPdfFormatter.ts`
- **Commit:** 23c71ed

**2. [Rule 1 - Bug] pdf-parse text extraction: word-wrap at line boundaries**
- **Found during:** Task 1 GREEN (DISCLAIMER substring check failing)
- **Issue:** pdfkit word-wraps the 170-char DISCLAIMER at the content area boundary. pdf-parse extracts wrapped lines separated by "space + newline" (0x20 0x0A). The full DISCLAIMER string (single space between sentences) is not present verbatim.
- **Fix:** Updated test assertion to normalize all whitespace sequences to a single space before the DISCLAIMER `toContain` check: `.replace(/\s+/g, ' ')`.
- **Files modified:** `src/consult/formatting/__tests__/DeliberationRecordPdf.test.ts`
- **Commit:** 23c71ed

**3. [Rule 2 - Missing] pdf-parse ambient type declarations**
- **Found during:** Task 1 RED
- **Issue:** No `@types/pdf-parse` package on npm; TypeScript strict mode rejects the import with TS7016.
- **Fix:** Created `src/types/pdf-parse.d.ts` with minimal `PDFInfo` and `PDFData` interfaces + `export =` function signature.
- **Files modified:** `src/types/pdf-parse.d.ts` (new)
- **Commit:** ea52ed1

## TDD Gate Compliance

- RED commit: `ea52ed1` (TS2307 — module `'../DeliberationRecordPdfFormatter'` not found)
- GREEN commit: `23c71ed` (all 5 tests pass)
- REFACTOR: not needed — implementation was clean on first pass
- Task 2 (non-TDD): `0860d2f` (FormatterFactory centralization)
- Task 3 (formally owns the test file): delivered as the RED phase of Task 1 TDD cycle

## Known Stubs

None. The formatter renders real content from a DeliberationRecordSource; no placeholder or hardcoded data.

## Threat Flags

None new beyond what the plan's threat model covers:
- T-21-01 (LLM text framing): sanitizeFraming applied at all 10 call sites
- T-21-02 (accentColor injection): normalizeAccent validates hex, falls back to #222222

## Self-Check: PASSED

Files:
- FOUND: src/consult/formatting/DeliberationRecordPdfFormatter.ts
- FOUND: src/consult/formatting/__tests__/DeliberationRecordPdf.test.ts
- FOUND: src/types/pdf-parse.d.ts
- FOUND: src/consult/formatting/FormatterFactory.ts (modified)
- FOUND: src/types/consult.ts (modified)

Commits:
- FOUND: ea52ed1 (test RED)
- FOUND: 23c71ed (feat GREEN)
- FOUND: 0860d2f (feat FormatterFactory)
