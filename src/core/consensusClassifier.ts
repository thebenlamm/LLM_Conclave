/**
 * Non-consensus classification (V1, formatter-level).
 *
 * Field feedback (Ben Sofer): when a panel does not reach consensus the output
 * read as a soft failure — a bare "Consensus: No" with no framing. But on hard,
 * no-clean-answer problems, non-convergence is often the *verdict*, not a bug.
 * And some "No"s are really detector strictness at small panel sizes, not real
 * disagreement.
 *
 * This classifies a non-consensus outcome from signals ALREADY on the result —
 * it does NOT change the consensus detection threshold (that work waits on
 * wider-panel convergence data). It is intentionally honest: the ambiguous
 * "no consensus, no recorded dissent" case is surfaced as a *hypothesis*
 * (possible detector strictness), never asserted.
 */

export type NonConsensusCategory =
  | 'genuine_disagreement' // completed; substantive dissent captured → live fault lines (a verdict)
  | 'unresolved'           // completed; no substantive dissent → possible detector strictness (hypothesis)
  | 'incomplete';          // degraded / timed out / aborted before a clean verdict

export interface NonConsensusSignals {
  rounds: number;
  maxRounds: number;
  roundsExhausted: boolean;
  agentCount: number;
  dissentCaptured: boolean;
  degraded: boolean;
  timedOut: boolean;
  runIntegrityStatus: string;
}

export interface NonConsensusClassification {
  category: NonConsensusCategory;
  /** Short headline suitable for a "Verdict:" line. */
  label: string;
  /** One-to-two sentence explanation of the call and the signals behind it. */
  reasoning: string;
  /** The dissent items when genuine_disagreement; empty otherwise. */
  faultLines: string[];
  signals: NonConsensusSignals;
}

/** Fields the classifier reads. A superset of these lives on DiscussionResult. */
export interface ClassifierInput {
  consensusReached?: boolean;
  rounds?: number;
  maxRounds?: number;
  agentCount?: number;
  dissent?: string[];
  dissent_quality?: string;
  degraded?: boolean;
  degradedReason?: string;
  timedOut?: boolean;
  runIntegrity?: { status?: string };
}

/**
 * A dissent entry counts as substantive if it carries real content — mirrors the
 * dissent_quality threshold in ConversationManager (>10 chars, not a "none"
 * placeholder).
 */
function isSubstantiveDissent(d: unknown): d is string {
  if (typeof d !== 'string') return false;
  const t = d.trim();
  return t.length > 10 && !/^(none|n\/a|no dissent)\.?$/i.test(t);
}

/**
 * Classify a non-consensus outcome. Returns null when consensus WAS reached
 * (no classification needed — callers should render nothing).
 */
export function classifyNonConsensus(r: ClassifierInput): NonConsensusClassification | null {
  if (r.consensusReached) return null;

  const rounds = r.rounds ?? 0;
  const maxRounds = r.maxRounds ?? rounds;
  const roundsExhausted = maxRounds > 0 && rounds >= maxRounds;
  const degraded = !!r.degraded;
  const timedOut = !!r.timedOut;
  const runIntegrityStatus = r.runIntegrity?.status ?? 'OK';
  const agentCount = r.agentCount ?? 0;

  const faultLines = (Array.isArray(r.dissent) ? r.dissent : []).filter(isSubstantiveDissent);
  const dissentCaptured = r.dissent_quality === 'captured' || faultLines.length > 0;

  const signals: NonConsensusSignals = {
    rounds,
    maxRounds,
    roundsExhausted,
    agentCount,
    dissentCaptured,
    degraded,
    timedOut,
    runIntegrityStatus,
  };

  const panelSize = agentCount > 0 ? `${agentCount} agent${agentCount === 1 ? '' : 's'}` : 'this panel size';

  // 1. Process failure — the run never produced a clean verdict, so "No" is not
  //    a real epistemic outcome.
  if (degraded || timedOut || runIntegrityStatus === 'DEGRADED') {
    const why = degraded
      ? `the run degraded${r.degradedReason ? ` (${r.degradedReason})` : ''}`
      : timedOut
        ? 'the run was aborted or timed out'
        : 'run integrity was degraded';
    return {
      category: 'incomplete',
      label: 'Run did not complete cleanly — verdict unavailable',
      reasoning: `No consensus, but ${why} before a clean verdict — treat the result as incomplete rather than as genuine non-convergence.`,
      faultLines: [],
      signals,
    };
  }

  // 2. Genuine disagreement — the panel completed and surfaced substantive
  //    dissent. This is a VERDICT: the fault lines are the product. Keyed on
  //    actual fault lines (not dissent_quality alone) so the label never reports
  //    "0 live fault lines".
  if (faultLines.length > 0) {
    const n = faultLines.length;
    return {
      category: 'genuine_disagreement',
      label: `Panel did not converge — ${n} live fault line${n === 1 ? '' : 's'}`,
      reasoning:
        'The panel surfaced substantive disagreement. This is the verdict, not a failure to agree — the dissenting positions below are the signal.',
      faultLines,
      signals,
    };
  }

  // 3. Unresolved — completed without consensus AND without SUBSTANTIVE recorded
  //    dissent. Ambiguous: could be detector strictness (agents may have largely
  //    agreed) OR dissent that went unarticulated. Surface as a hypothesis,
  //    never asserted — true detector-strictness detection needs wider-panel data.
  //
  //    Distinguish "no dissent at all" from "brief, below-threshold dissent": the
  //    markdown renders a Dissenting Views section for ANY raw dissent, so claiming
  //    "none captured" while that section is populated would contradict itself.
  const hasThinDissent = (Array.isArray(r.dissent) ? r.dissent : []).some(
    d => typeof d === 'string' && d.trim().length > 0
  );
  const ranInfo = roundsExhausted
    ? `Ran all ${maxRounds} round${maxRounds === 1 ? '' : 's'}`
    : `Stopped after ${rounds}/${maxRounds} rounds`;
  const dissentClause = hasThinDissent
    ? 'only brief, below-threshold dissent was recorded'
    : 'no substantive disagreement was captured';
  return {
    category: 'unresolved',
    label: hasThinDissent
      ? 'Panel did not converge — only brief dissent recorded'
      : 'Panel did not converge — no substantive dissent recorded',
    reasoning:
      `${ranInfo} without convergence, but ${dissentClause}. ` +
      `At ${panelSize} this may reflect detector strictness rather than real disagreement — ` +
      `flagging for review, not asserted.`,
    faultLines: [],
    signals,
  };
}
