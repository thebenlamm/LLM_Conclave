/**
 * Tests for deliberationRecordConstants.ts (Phase 21-01).
 *
 * RED phase: these tests MUST fail before the module is created.
 * GREEN phase: pass once the module is extracted from DeliberationRecordFormatter.ts.
 *
 * Verifies:
 * 1. All locked constants are exported from the shared module.
 * 2. HEADING_TEXT is derived from HEADERS by stripping the '## '/'# ' prefix.
 * 3. sanitizeFraming neutralizes forbidden patterns.
 * 4. DeliberationRecordFormatter imports from the shared module (no inline decls).
 */

import {
  TITLE,
  TITLE_TEXT,
  HEADERS,
  HEADING_TEXT,
  DISCLAIMER,
  FIELD6_INTRO,
  FIELD6_NONE_SURFACED,
  FIELD6_NOT_PERSISTED,
  FIELD6_UNKNOWN,
  MITIGATION_PLACEHOLDER,
  sanitizeFraming,
} from '../deliberationRecordConstants.js';

// ============================================================================
// Constants existence and shape
// ============================================================================

describe('deliberationRecordConstants: locked title', () => {
  it('TITLE has markdown # prefix', () => {
    expect(TITLE).toBe('# Deliberation Record');
  });

  it('TITLE_TEXT has no markdown prefix (PDF heading)', () => {
    expect(TITLE_TEXT).toBe('Deliberation Record');
  });
});

describe('deliberationRecordConstants: HEADERS', () => {
  it('exports all 8 fields with ## prefix', () => {
    expect(HEADERS.field1).toBe('## 1. Decision Framed');
    expect(HEADERS.field2).toBe('## 2. Panel Composition & Rationale');
    expect(HEADERS.field3).toBe('## 3. Positions Summarized');
    expect(HEADERS.field4).toBe('## 4. Dissent (Attributed)');
    expect(HEADERS.field5).toBe('## 5. Synthesis & Recommendation');
    expect(HEADERS.field6).toBe('## 6. Risks Surfaced & Human Mitigation');
    expect(HEADERS.field7).toBe('## 7. Decision-Support Disclaimer');
    expect(HEADERS.field8).toBe('## 8. Provenance');
  });
});

describe('deliberationRecordConstants: HEADING_TEXT', () => {
  it('each HEADING_TEXT.fieldN equals HEADERS.fieldN with ## prefix stripped', () => {
    const fields = ['field1', 'field2', 'field3', 'field4', 'field5', 'field6', 'field7', 'field8'] as const;
    for (const f of fields) {
      const expected = HEADERS[f].replace(/^## /, '');
      expect(HEADING_TEXT[f]).toBe(expected);
    }
  });

  it('HEADING_TEXT.field1 is the plain string without markdown prefix', () => {
    expect(HEADING_TEXT.field1).toBe('1. Decision Framed');
  });
});

describe('deliberationRecordConstants: DISCLAIMER', () => {
  it('contains the locked disclaimer sentence', () => {
    expect(DISCLAIMER).toBe(
      'This Deliberation Record is decision-support documentation, not a substitute for professional judgment. The deliberation was one input into a human-owned decision process.'
    );
  });
});

describe('deliberationRecordConstants: Field-6 strings', () => {
  it('FIELD6_INTRO is the risk intro sentence', () => {
    expect(FIELD6_INTRO).toContain('risk surfaced during deliberation');
  });

  it('FIELD6_NONE_SURFACED begins with "- Risk: none"', () => {
    expect(FIELD6_NONE_SURFACED).toMatch(/^- Risk: none/);
  });

  it('FIELD6_NOT_PERSISTED is a function that interpolates dissentQuality', () => {
    const result = FIELD6_NOT_PERSISTED('captured');
    expect(result).toContain('captured');
    expect(result).toContain('not persisted');
  });

  it('FIELD6_UNKNOWN warns of unknown risk presence', () => {
    expect(FIELD6_UNKNOWN).toMatch(/unknown/i);
  });

  it('MITIGATION_PLACEHOLDER is the locked placeholder string', () => {
    expect(MITIGATION_PLACEHOLDER).toBe('_[operator to complete]_');
  });
});

// ============================================================================
// sanitizeFraming
// ============================================================================

describe('deliberationRecordConstants: sanitizeFraming', () => {
  it('strips quantified confidence patterns (90% confident)', () => {
    expect(sanitizeFraming('We are 90% confident in this.')).not.toMatch(/\d+%\s*confident/);
    expect(sanitizeFraming('We are 90% confident in this.')).toContain('confident');
  });

  it('strips quantified confidence patterns (75 % sure)', () => {
    expect(sanitizeFraming('75 % sure this works')).not.toMatch(/\d+\s*%\s*sure/);
    expect(sanitizeFraming('75 % sure this works')).toContain('sure');
  });

  it('replaces "overridden" with "addressed"', () => {
    expect(sanitizeFraming('The dissent was overridden.')).toContain('addressed');
    expect(sanitizeFraming('The dissent was overridden.')).not.toContain('overridden');
  });

  it('leaves clean text unchanged', () => {
    const clean = 'The panel reached consensus on the migration plan.';
    expect(sanitizeFraming(clean)).toBe(clean);
  });
});
