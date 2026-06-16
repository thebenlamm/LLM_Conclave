/**
 * deliberationRecordConstants
 *
 * Single source of truth for the 8 locked record headers, disclaimer, Field-6
 * strings, and sanitizeFraming used by both the markdown and PDF renderers.
 *
 * Phase 21-01 (D-06): extracted verbatim from DeliberationRecordFormatter.ts L17-65.
 * Markdown formatter imports these — output is byte-identical to Phase 12.
 * PDF formatter imports HEADING_TEXT (prefix-stripped) to print styled headings.
 */

// ============================================================================
// Locked title
// ============================================================================

/** Markdown title (includes `# ` prefix). */
export const TITLE = '# Deliberation Record';

/** Plain heading text for PDF rendering (no markdown prefix). */
export const TITLE_TEXT = 'Deliberation Record';

// ============================================================================
// Locked headers — markdown form (includes `## ` prefix)
// ============================================================================

export const HEADERS = {
  field1: '## 1. Decision Framed',
  field2: '## 2. Panel Composition & Rationale',
  field3: '## 3. Positions Summarized',
  field4: '## 4. Dissent (Attributed)',
  field5: '## 5. Synthesis & Recommendation',
  field6: '## 6. Risks Surfaced & Human Mitigation',
  field7: '## 7. Decision-Support Disclaimer',
  field8: '## 8. Provenance',
} as const;

/**
 * Plain heading text for PDF rendering — each value is the corresponding
 * HEADERS.fieldN string with the leading `## ` stripped.
 */
export const HEADING_TEXT = {
  field1: '1. Decision Framed',
  field2: '2. Panel Composition & Rationale',
  field3: '3. Positions Summarized',
  field4: '4. Dissent (Attributed)',
  field5: '5. Synthesis & Recommendation',
  field6: '6. Risks Surfaced & Human Mitigation',
  field7: '7. Decision-Support Disclaimer',
  field8: '8. Provenance',
} as const;

// ============================================================================
// Locked disclaimer
// ============================================================================

export const DISCLAIMER =
  'This Deliberation Record is decision-support documentation, not a substitute for professional judgment. The deliberation was one input into a human-owned decision process.';

// ============================================================================
// Field-6 locked strings
// ============================================================================

export const FIELD6_INTRO =
  'Each item below records a risk surfaced during deliberation and the human decider\'s mitigation.';

export const FIELD6_NONE_SURFACED = '- Risk: none surfaced during deliberation.';

export const FIELD6_NOT_PERSISTED = (dissentQuality: string): string =>
  `- Attributed risks were not persisted in the stored session (dissent quality: ${dissentQuality}). Operator to enumerate the surfaced risks and record mitigations.`;

// CR-01: discuss session with no persisted dissent signal — risk presence unknown.
export const FIELD6_UNKNOWN =
  '- Risks were not persisted in the stored session and dissent presence is unknown. Operator to confirm whether risks were surfaced and record any mitigations.';

export const MITIGATION_PLACEHOLDER = '_[operator to complete]_';

// ============================================================================
// Framing gate (WR-01)
// ============================================================================

/**
 * Render-time framing gate (WR-01).
 *
 * Best-effort neutralization of the known forbidden phrasings: quantified
 * confidence (percent and decimal forms) and override/overrule framing of
 * dissent. Not an exhaustive guarantee against all possible
 * confidence/override phrasings.
 *
 * The Deliberation Record embeds free-text drawn from LLM output (synthesis,
 * decision question/context, dissent concerns, position stances). The locked
 * headers and disclaimer contain none of these patterns, so a final pass cannot
 * corrupt them. Function is idempotent: sanitizeFraming(sanitizeFraming(x)) ===
 * sanitizeFraming(x).
 */
export function sanitizeFraming(text: string): string {
  return (
    text
      // "90% confident" / "75 % sure" / "80% certain" / "95% confidence" →
      // drop the quantified percent, keep the word
      .replace(/\b\d+\s*%\s*(sure|certain|confident|confidence)\b/gi, '$1')
      // "confidence of 0.9" → "confidence"
      .replace(/\bconfidence\s+of\s+\d*\.\d+\b/gi, 'confidence')
      // "0.9 confidence" / "0.85 certainty" → keep the word
      .replace(/\b\d*\.\d+\s+(confidence|certainty)\b/gi, '$1')
      // override/overrule stems must never frame a dissent in a compliance artifact
      // covers: override, overrides, overriding, overridden
      .replace(/\boverrid(?:e|es|ing|den)\b/gi, 'addressed')
      // covers: overrode, overrule, overrules, overruled, overruling
      .replace(/\boverr(?:ode|ule[ds]?|uling)\b/gi, 'addressed')
  );
}
