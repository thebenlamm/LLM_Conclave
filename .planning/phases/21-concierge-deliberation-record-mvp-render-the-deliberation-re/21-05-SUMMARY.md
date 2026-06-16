---
phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
plan: "05"
subsystem: compliance-formatting
tags: [pdf, sanitizeFraming, deliberation-record, framing-gate, compliance]

# Dependency graph
requires:
  - phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re
    provides: DeliberationRecordPdfFormatter (21-02), deliberationRecordConstants (21-01)
provides:
  - Broadened sanitizeFraming gate: percent+decimal confidence, all override/overrule stems
  - Structural PDF framing gate at draw primitives — no draw site can drift
  - Null-safe synthesis fallback in PDF renderer (no TypeError on undefined)
  - Accurate sanitizeFraming docstring (best-effort, not blanket guarantee)
affects:
  - 21-06 (next plan in phase 21)
  - Any future formatter that imports sanitizeFraming

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate at primitive: move sanitizeFraming inside body/bullet/heading so every draw is gated once structurally"
    - "Explicit chrome wraps: sanitizeFraming(orgLabel) and sanitizeFraming(footerText) for non-primitive draws"
    - "TDD: RED commit (test) followed by GREEN commit (feat) per task"

key-files:
  created:
    - src/consult/formatting/__tests__/sanitizeFraming.test.ts
  modified:
    - src/consult/formatting/deliberationRecordConstants.ts
    - src/consult/formatting/DeliberationRecordPdfFormatter.ts
    - src/consult/formatting/__tests__/DeliberationRecordPdf.test.ts

key-decisions:
  - "Gate at primitive: sanitizeFraming moved inside body/bullet/heading rather than added per call site — structural guarantee that no future draw site can drift (mirrors markdown's fully-assembled gate approach)"
  - "Remove redundant inline sanitizeFraming() wraps at call sites after moving gate to primitives — double-wrapping is harmless (idempotent) but removed for clarity"
  - "Null-safe synthesis: body(source.synthesis || fallback) — body() sanitizes the chosen string; no pre-sanitize of possibly-undefined value"
  - "Docstring rewritten to 'best-effort neutralization of known forbidden phrasings' — compliance artifact must not overstate its protection guarantee (WR-05)"

patterns-established:
  - "Framing gate D-06: both markdown and PDF call sanitizeFraming; markdown gates fully-assembled output, PDF gates at draw primitives — equivalent protection, cannot drift"

requirements-completed: [SPEC-R1, SPEC-R3]

# Metrics
duration: 15min
completed: 2026-06-16
---

# Phase 21 Plan 05: Framing Gate Compliance Closure Summary

**sanitizeFraming broadened (percent+decimal confidence, all override/overrule stems) and applied structurally at PDF draw primitives — PDF and markdown Deliberation Records are now framing-equivalent**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-16
- **Completed:** 2026-06-16
- **Tasks:** 2 (each with TDD RED/GREEN)
- **Files modified:** 4

## Accomplishments

- WR-05 resolved: sanitizeFraming broadened to catch "certain", "confidence", decimal forms (0.9 confidence), and all override/overrule stems (overrode, overruled, overrule, overrules, overruling, override, overrides, overriding, overridden); docstring now says "best-effort neutralization of known forbidden phrasings"
- WR-01 resolved: sanitizeFraming moved inside body/bullet/heading primitives so every PDF-drawn string is gated exactly once; chrome draws (orgLabel, footerText) explicitly wrapped
- IN-03 resolved: synthesis fallback is now null-safe — body(source.synthesis || '(No synthesis recorded.)') avoids TypeError on undefined synthesis
- 84 formatting tests pass (6 suites), 0 regressions, 7 markdown assertions byte-identical

## Task Commits

Each task was committed atomically (TDD = 2 commits per task):

1. **Task 1 RED: sanitizeFraming tests (WR-05)** - `790048b` (test)
2. **Task 1 GREEN: broaden sanitizeFraming + docstring** - `34ce415` (feat)
3. **Task 2 RED: PDF framing gate + synthesis tests** - `e280f6d` (test)
4. **Task 2 GREEN: gate at primitives + null-safe synthesis** - `c56a47a` (feat)

## Files Created/Modified

- `src/consult/formatting/__tests__/sanitizeFraming.test.ts` - 24 unit tests for broadened gate: percent/decimal confidence, all override stems, header/disclaimer passthrough, idempotency
- `src/consult/formatting/deliberationRecordConstants.ts` - 5 new regex patterns in sanitizeFraming; rewritten docstring
- `src/consult/formatting/__tests__/DeliberationRecordPdf.test.ts` - 5 new tests: panelRationale/mitigation/operatorName/companyName framing neutralization + undefined synthesis fallback
- `src/consult/formatting/DeliberationRecordPdfFormatter.ts` - sanitizeFraming inside 3 primitives; explicit chrome wraps; null-safe synthesis; updated threat comment

## Decisions Made

- Gate at primitive (not per call site): mirrors how markdown gates the fully-assembled output; future draw sites added to writeBody cannot forget the gate
- Removed redundant inline sanitizeFraming() at former call sites (primitives now gate centrally) — idempotent so no correctness risk, removed for clarity
- Null-safe synthesis: let body() sanitize rather than pre-sanitizing a possibly-undefined value before the null coalesce

## Deviations from Plan

None - plan executed exactly as written. The plan explicitly described moving sanitizeFraming into primitives and removing inline wraps; both were implemented as specified.

## Issues Encountered

None.

## Next Phase Readiness

- All three review findings (WR-01, WR-05, IN-03) closed
- PDF and markdown Deliberation Records are framing-equivalent
- sanitizeFraming gate is structural — no future draw site can bypass it
- Ready for Plan 21-06

## Known Stubs

None.

## Threat Flags

None — this plan only modifies the rendering gate internals; no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `src/consult/formatting/__tests__/sanitizeFraming.test.ts` - EXISTS
- `src/consult/formatting/deliberationRecordConstants.ts` - MODIFIED
- `src/consult/formatting/DeliberationRecordPdfFormatter.ts` - MODIFIED
- `src/consult/formatting/__tests__/DeliberationRecordPdf.test.ts` - MODIFIED
- Commits verified: 790048b, 34ce415, e280f6d, c56a47a

---
*Phase: 21-concierge-deliberation-record-mvp-render-the-deliberation-re*
*Completed: 2026-06-16*
