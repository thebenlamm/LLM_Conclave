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
 * confidence (percent and decimal forms) and override/overrule framing *of a
 * dissent*. Not an exhaustive guarantee against all possible confidence/override
 * phrasings.
 *
 * WR-03: the override/overrule rule is NARROWED to dissent-framing contexts. A
 * prior pass replaced every override/overrule stem unconditionally, which
 * silently corrupted ubiquitous software vocabulary ("config override pattern",
 * "method override", "the flag overrides the default") in an artifact whose
 * entire value is a *faithful* audit record. The gate now only neutralizes the
 * stem when its grammatical object is a dissent-like noun (dissent, concern,
 * objection, warning, minority view, reservation, disagreement, caveat), in
 * either active ("overruled the dissent") or passive ("the concern was
 * overridden") voice. This is a deliberate trade: we accept some false-negatives
 * (a generic "override" of a non-dissent noun passes through verbatim) to
 * eliminate false-positive corruption of legitimate technical text. The intent
 * — never frame *dissent* as overruled — is preserved.
 *
 * The Deliberation Record embeds free-text drawn from LLM output (synthesis,
 * decision question/context, dissent concerns, position stances). The locked
 * headers and disclaimer contain none of these patterns, so a final pass cannot
 * corrupt them. Function is idempotent: sanitizeFraming(sanitizeFraming(x)) ===
 * sanitizeFraming(x).
 */
// Override/overrule verb stems: override, overrides, overriding, overridden,
// overrode, overrule, overrules, overruled, overruling.
const OVERRIDE_STEM = '(?:overrid(?:e|es|ing|den)|overr(?:ode|ule[ds]?|uling))';
// Dissent-like noun (with optional plural/suffix) the gate protects from being
// framed as overruled. "minorit\\w*" covers "minority"/"minorities".
const DISSENT_NOUN = '(?:dissent|concern|objection|warning|minorit\\w*|reservation|disagreement|caveat)\\w*';
// Optional determiner that may sit between the verb and its dissent object.
const DETERMINER = '(?:the|a|an|their|its|his|her|our|your|my|this|these|those|any|each|all|every)';

// Active voice: "overruled the dissent" / "overrode their concerns" /
// "overriding the minority view". Captures the object so it is preserved.
const ACTIVE_OVERRIDE = new RegExp(
  `\\b${OVERRIDE_STEM}\\b(\\s+(?:${DETERMINER}\\s+)?${DISSENT_NOUN})`,
  'gi'
);
// Passive voice: "the dissent was overridden" / "their concerns were overruled".
// Captures the noun + linking-verb run so only the stem is rewritten.
const PASSIVE_OVERRIDE = new RegExp(
  `\\b(${DISSENT_NOUN}(?:\\s+\\w+){0,3}?\\s+(?:was|were|been|is|are|got|being|gets|get)\\s+)${OVERRIDE_STEM}\\b`,
  'gi'
);

export function sanitizeFraming(text: string): string {
  return (
    text
      // "90% confident" / "75 % sure" / "80% certain" / "90.5% confidence" →
      // drop the quantified percent (integer or decimal), keep the word
      .replace(/\b\d+(?:\.\d+)?\s*%\s*(sure|certain|confident|confidence)\b/gi, '$1')
      // "confidence of 0.9" → "confidence"
      .replace(/\bconfidence\s+of\s+\d*\.\d+\b/gi, 'confidence')
      // "0.9 confidence" / "0.85 certainty" → keep the word
      .replace(/\b\d*\.\d+\s+(confidence|certainty)\b/gi, '$1')
      // override/overrule stems must never frame a *dissent* in a compliance
      // artifact — but only when the object IS a dissent (WR-03), not for
      // generic technical "override" vocabulary.
      .replace(ACTIVE_OVERRIDE, 'addressed$1')
      .replace(PASSIVE_OVERRIDE, '$1addressed')
  );
}
