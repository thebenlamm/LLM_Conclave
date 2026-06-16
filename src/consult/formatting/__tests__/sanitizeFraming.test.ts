/**
 * sanitizeFraming.test.ts
 *
 * Phase 21-05 Task 1 (TDD RED→GREEN): Unit coverage for the broadened
 * sanitizeFraming gate (WR-05).
 *
 * Covers:
 *   - Percent-quantified confidence (word class broadened to include "certain", "confidence")
 *   - Decimal-quantified confidence ("confidence of 0.9", "0.9 confidence")
 *   - Override/overrule stems (overrode, overruled, overrides, overriding, overridden, override)
 *   - Locked headers and disclaimer pass through UNCHANGED
 *   - Idempotency: sanitizeFraming(sanitizeFraming(x)) === sanitizeFraming(x)
 */

import { sanitizeFraming, HEADERS, DISCLAIMER } from '../deliberationRecordConstants.js';

describe('sanitizeFraming: percent-quantified confidence (broadened word class)', () => {
  it('"90% confident" → drops quantifier, keeps word', () => {
    const result = sanitizeFraming('We are 90% confident this will work.');
    expect(result).not.toMatch(/\d+\s*%\s*confident/i);
    expect(result).toContain('confident');
  });

  it('"75 % sure" → drops quantifier, keeps word', () => {
    const result = sanitizeFraming('75 % sure this works.');
    expect(result).not.toMatch(/\d+\s*%\s*sure/i);
    expect(result).toContain('sure');
  });

  it('"90% certain" → drops quantifier, keeps word', () => {
    const result = sanitizeFraming('I am 90% certain this is correct.');
    expect(result).not.toMatch(/\d+\s*%\s*certain/i);
    expect(result).toContain('certain');
  });

  it('"95% sure" → drops quantifier, keeps word', () => {
    const result = sanitizeFraming('We are 95% sure of the outcome.');
    expect(result).not.toMatch(/\d+\s*%\s*sure/i);
    expect(result).toContain('sure');
  });

  it('"80% confidence" → drops quantifier, keeps word', () => {
    const result = sanitizeFraming('80% confidence in the estimate.');
    expect(result).not.toMatch(/\d+\s*%\s*confidence/i);
    expect(result).toContain('confidence');
  });

  // WR-01: decimal percents must drop the whole quantifier, not leave a "90." stub
  it('"90.5% confident" → drops the full decimal quantifier, no garbled residue', () => {
    const result = sanitizeFraming('We are 90.5% confident this will work.');
    expect(result).not.toMatch(/\d/); // no dangling digits left
    expect(result).not.toContain('90.');
    expect(result).toContain('confident');
    expect(result).toBe('We are confident this will work.');
  });

  it('"99.99 % certain" → drops the full decimal quantifier with spacing', () => {
    const result = sanitizeFraming('I am 99.99 % certain.');
    expect(result).not.toMatch(/\d/);
    expect(result).toContain('certain');
  });
});

describe('sanitizeFraming: decimal-quantified confidence', () => {
  it('"confidence of 0.9" → neutralized to "confidence"', () => {
    const result = sanitizeFraming('We have a confidence of 0.9 in this decision.');
    expect(result).not.toMatch(/confidence\s+of\s+\d*\.\d+/i);
    expect(result).toContain('confidence');
  });

  it('"confidence of 1.0" → neutralized to "confidence"', () => {
    const result = sanitizeFraming('Confidence of 1.0 was claimed.');
    expect(result).not.toMatch(/confidence\s+of\s+\d*\.\d+/i);
  });

  it('"0.9 confidence" → neutralized to "confidence"', () => {
    const result = sanitizeFraming('0.9 confidence in the model output.');
    expect(result).not.toMatch(/\d*\.\d+\s+confidence/i);
    expect(result).toContain('confidence');
  });

  it('"0.85 certainty" → neutralized to "certainty"', () => {
    const result = sanitizeFraming('0.85 certainty in the recommendation.');
    expect(result).not.toMatch(/\d*\.\d+\s+certainty/i);
    expect(result).toContain('certainty');
  });
});

describe('sanitizeFraming: override/overrule stems', () => {
  it('"overridden" → "addressed"', () => {
    const result = sanitizeFraming('The dissent was overridden by the operator.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverridden\b/i);
  });

  it('"overrode" → "addressed"', () => {
    const result = sanitizeFraming('The operator overrode the warning.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverrode\b/i);
  });

  it('"overruled" → "addressed"', () => {
    const result = sanitizeFraming('The operator overruled the dissent.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverruled\b/i);
  });

  it('"override" → "addressed"', () => {
    const result = sanitizeFraming('The decision to override was documented.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverride\b/i);
  });

  it('"overrides" → "addressed"', () => {
    const result = sanitizeFraming('Operator overrides are documented here.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverrides\b/i);
  });

  it('"overruling" → "addressed"', () => {
    const result = sanitizeFraming('The act of overruling was noted.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverruling\b/i);
  });

  it('"overrule" → "addressed"', () => {
    const result = sanitizeFraming('The operator chose to overrule the concern.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverrule\b/i);
  });

  it('"overriding" → "addressed"', () => {
    const result = sanitizeFraming('The operator was overriding the safety check.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverriding\b/i);
  });
});

describe('sanitizeFraming: locked headers and disclaimer pass through unchanged', () => {
  it('all 8 HEADERS pass through unchanged', () => {
    for (const header of Object.values(HEADERS)) {
      expect(sanitizeFraming(header)).toBe(header);
    }
  });

  it('DISCLAIMER passes through unchanged', () => {
    expect(sanitizeFraming(DISCLAIMER)).toBe(DISCLAIMER);
  });
});

describe('sanitizeFraming: clean text passes through unchanged', () => {
  it('text with no forbidden patterns is unchanged', () => {
    const clean = 'The panel reached consensus on the migration plan.';
    expect(sanitizeFraming(clean)).toBe(clean);
  });

  it('the word "confident" alone (no quantifier) is preserved', () => {
    const text = 'The team felt confident about the outcome.';
    expect(sanitizeFraming(text)).toBe(text);
  });
});

describe('sanitizeFraming: idempotency', () => {
  it('sanitizeFraming(sanitizeFraming(x)) === sanitizeFraming(x) for quantified confidence', () => {
    const input = 'We are 90% confident and overrode the warning at 0.9 confidence.';
    const once = sanitizeFraming(input);
    const twice = sanitizeFraming(once);
    expect(twice).toBe(once);
  });

  it('sanitizeFraming(sanitizeFraming(x)) === sanitizeFraming(x) for override stems', () => {
    const input = 'The operator overruled the dissent with 95% certainty.';
    const once = sanitizeFraming(input);
    const twice = sanitizeFraming(once);
    expect(twice).toBe(once);
  });

  it('sanitizeFraming(sanitizeFraming(x)) === sanitizeFraming(x) for clean text', () => {
    const input = 'The panel addressed the concern and reached consensus.';
    const once = sanitizeFraming(input);
    const twice = sanitizeFraming(once);
    expect(twice).toBe(once);
  });
});
