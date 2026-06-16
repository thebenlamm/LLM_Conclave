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

// WR-03: the override/overrule gate is narrowed to dissent-framing contexts.
// It neutralizes the stem ONLY when its object is a dissent-like noun, in
// active or passive voice, and leaves generic technical "override" vocabulary
// untouched.
describe('sanitizeFraming: override/overrule framing of dissent (WR-03 — dissent-context only)', () => {
  it('passive "the dissent was overridden" → neutralized', () => {
    const result = sanitizeFraming('The dissent was overridden by the operator.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverridden\b/i);
  });

  it('active "overrode the warning" → "addressed the warning"', () => {
    const result = sanitizeFraming('The operator overrode the warning.');
    expect(result).toContain('addressed the warning');
    expect(result).not.toMatch(/\boverrode\b/i);
  });

  it('active "overruled the dissent" → "addressed the dissent"', () => {
    const result = sanitizeFraming('The operator overruled the dissent.');
    expect(result).toContain('addressed the dissent');
    expect(result).not.toMatch(/\boverruled\b/i);
  });

  it('active "overrule the concern" → "addressed the concern"', () => {
    const result = sanitizeFraming('The operator chose to overrule the concern.');
    expect(result).toContain('addressed the concern');
    expect(result).not.toMatch(/\boverrule\b/i);
  });

  it('passive "their concerns were overruled" → neutralized', () => {
    const result = sanitizeFraming('Their concerns were overruled during review.');
    expect(result).toContain('addressed');
    expect(result).not.toMatch(/\boverruled\b/i);
  });

  it('active "overriding the minority view" → neutralized', () => {
    const result = sanitizeFraming('The operator was overriding the minority view.');
    expect(result).toContain('addressed the minority');
    expect(result).not.toMatch(/\boverriding\b/i);
  });
});

// WR-03: generic technical "override" vocabulary must pass through verbatim —
// the gate must not corrupt legitimate software terminology in the audit record.
describe('sanitizeFraming: generic technical "override" vocabulary passes through (WR-03)', () => {
  it('"config override pattern" is preserved verbatim', () => {
    const text = 'Use the config override pattern for environment values.';
    expect(sanitizeFraming(text)).toBe(text);
  });

  it('"method override" is preserved verbatim', () => {
    const text = 'The subclass uses a method override to customize behavior.';
    expect(sanitizeFraming(text)).toBe(text);
  });

  it('"the flag overrides the default" is preserved verbatim', () => {
    const text = 'When set, the flag overrides the default timeout.';
    expect(sanitizeFraming(text)).toBe(text);
  });

  it('standalone "override was documented" is preserved verbatim', () => {
    const text = 'The decision to override was documented.';
    expect(sanitizeFraming(text)).toBe(text);
  });

  it('"overriding the safety check" (non-dissent object) is preserved verbatim', () => {
    const text = 'The operator was overriding the safety check.';
    expect(sanitizeFraming(text)).toBe(text);
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
