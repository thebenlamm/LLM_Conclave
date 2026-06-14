/**
 * Normalized types for the Deliberation Record export.
 *
 * Phase 12 — Plan 01: compliance-grade audit artifact produced from a stored
 * Conclave session. Read-only consumer of ConsultationResult / SessionManifest.
 */

/**
 * Operator-supplied inputs that personalize a rendered Deliberation Record.
 * All fields are optional except operatorName, which appears in Field 8 (Provenance).
 */
export interface OperatorInputs {
  /** Name of the human operator/decision-owner — stamped in Field 8 */
  operatorName: string;
  /** Free-text rationale for the panel composition — surfaced in Field 2 */
  panelRationale?: string;
  /**
   * Human mitigations keyed by risk/concern text.
   * When a key matches a dissent concern, the mitigation replaces the placeholder
   * in Field 6. Un-keyed dissents render `_[operator to complete]_`.
   */
  mitigations?: Record<string, string>;
}

/**
 * Normalized intermediate representation of a Deliberation Record.
 * Produced by DeliberationRecordBuilder from either a ConsultationResult (consult)
 * or a SessionManifest (discuss). Consumed by DeliberationRecordFormatter.
 */
export interface DeliberationRecordSource {
  decision: {
    question: string;
    context?: string;
    constraints?: string[];
  };
  panel: Array<{
    name: string;
    provider: string;
    model: string;
    persona?: string;
  }>;
  positions: Array<{
    agent: string;
    provider: string;
    model: string;
    stance: string;
  }>;
  /**
   * Individually attributed dissents. Empty for the discuss path (SessionManifest
   * does not persist attributed Dissent[]). When empty but dissentQuality is set,
   * the formatter surfaces honesty prose instead of silently claiming "none".
   */
  dissents: Array<{
    agent: string;
    severity?: string;
    concern: string;
  }>;
  /**
   * Forwarded from SessionManifest.dissent_quality for the discuss path.
   * Undefined on the consult path (attributed dissents come from result.dissent).
   */
  dissentQuality?: string;
  synthesis: string;
  provenance: {
    date: string;
    operator?: string;
    agents: Array<{ name: string; provider: string; model: string }>;
  };
  /** Discriminates which source path produced this record */
  sourceMode: 'consult' | 'discuss';
}
