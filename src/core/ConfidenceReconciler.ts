/**
 * ConfidenceReconciler (Phase 13 — Plan 04)
 *
 * Pure function that combines deterministic machinery signals about a discussion
 * run with the judge's self-reported confidence into a single reconciled
 * `finalConfidence` + human-readable `confidenceReasoning`.
 *
 * Trigger incident: the "Trollix" run produced three different confidence
 * values simultaneously (header ABORTED, table LOW, body HIGH) because the
 * formatter, summary table, and judge each computed confidence independently.
 * This module establishes ONE value that every output path must read.
 *
 * Reconciliation rules (applied in order, first match wins):
 *   1. machinery.aborted           === true  → finalConfidence = LOW
 *   2. machinery.turnBalanceOk     === false → finalConfidence = LOW
 *   3. machinery.allAgentsSpoke    === false → finalConfidence = LOW
 *   4. machinery.roundCompleteness <  1.0    → cap at MEDIUM (use min(judge, MEDIUM))
 *   5. otherwise                              → finalConfidence = judgeConfidence ?? MEDIUM
 *
 * All outputs are deterministic and side-effect free so the module is trivially
 * testable.
 */

import type { ParticipationEntry } from '../types/index.js';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MachinerySignals {
  /** True when the discussion run was aborted (pre-flight fail, timeout, degradation). */
  aborted: boolean;
  /** Optional human-readable reason for the abort, surfaced in reasoning. */
  abortReason?: string;
  /** True when every configured agent contributed at least one non-error turn. */
  allAgentsSpoke: boolean;
  /** False when any agent exceeded the fairness threshold (> 40% token share). */
  turnBalanceOk: boolean;
  /** Fraction of planned rounds actually completed, in [0, 1]. */
  roundCompleteness: number;
  /**
   * Phase 13.1 — per-agent participation report. When supplied, the reconciler
   * applies participation-aware caps (Rules 3.5a/3.5b). When undefined or
   * empty, the reconciler behaves exactly as in Phase 13 (backward compat).
   */
  participation?: ParticipationEntry[];
  /**
   * Phase 13.1 — history-compression state for the run. Informational only:
   * NO reconciler rule reads this field. It exists so the judge prompt's
   * machinery-signals block (JudgeEvaluator.buildMachinerySignalsBlock) can
   * render a History compression line without a separate type.
   */
  compression?: {
    active: boolean;
    activatedAtRound: number | null;
    summaryRegenerations: number;
  };
}

export interface ReconciledConfidence {
  finalConfidence: Confidence;
  confidenceReasoning: string;
  machinerySignals: MachinerySignals;
  judgeConfidence?: Confidence;
}

const RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function minConfidence(a: Confidence, b: Confidence): Confidence {
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * Reconcile machinery signals with the judge's self-reported confidence.
 *
 * @param machinery Deterministic signals captured during the run.
 * @param judgeConfidence Judge's self-assessment; may be undefined (e.g. degraded
 *        path where judge never ran).
 * @returns ReconciledConfidence with the one-true `finalConfidence` + reasoning.
 */
export function reconcileConfidence(
  machinery: MachinerySignals,
  judgeConfidence?: Confidence
): ReconciledConfidence {
  // Rule 1 — aborted run. Machinery is authoritative; judge cannot escape.
  if (machinery.aborted) {
    const reasonSuffix = machinery.abortReason ? ` (${machinery.abortReason})` : '';
    return {
      finalConfidence: 'LOW',
      confidenceReasoning: `Run aborted${reasonSuffix} — confidence capped at LOW regardless of judge self-report.`,
      machinerySignals: machinery,
      judgeConfidence,
    };
  }

  // Rule 2 — turn balance violation (any agent > 40% token share).
  if (!machinery.turnBalanceOk) {
    return {
      finalConfidence: 'LOW',
      confidenceReasoning:
        'Turn balance unacceptable (one or more agents exceeded the fairness threshold) — confidence capped at LOW.',
      machinerySignals: machinery,
      judgeConfidence,
    };
  }

  // Rule 3 — some agents never spoke.
  if (!machinery.allAgentsSpoke) {
    return {
      finalConfidence: 'LOW',
      confidenceReasoning:
        'Agents did not all speak — at least one configured agent never contributed — confidence capped at LOW.',
      machinerySignals: machinery,
      judgeConfidence,
    };
  }

  // Rule 3.5a — Phase 13.1 — all-but-one configured agents absent → cap LOW.
  // Gate on participation presence for backward compat with callers that
  // haven't been updated yet.
  if (machinery.participation && machinery.participation.length >= 2) {
    const nonSpoken = machinery.participation.filter(p => p.status !== 'spoken');
    if (nonSpoken.length >= machinery.participation.length - 1) {
      const names = nonSpoken.map(p => p.agent).join(', ');
      return {
        finalConfidence: 'LOW',
        confidenceReasoning: `All-but-one configured agent absent (${names}) — confidence capped at LOW.`,
        machinerySignals: machinery,
        judgeConfidence,
      };
    }
  }

  // Rule 3.5b — Phase 13.1 — any silent/capped absence → cap MEDIUM.
  // absent-failed alone is intentionally not handled here: Phase 13 Rule 3
  // (allAgentsSpoke=false) already covers it.
  if (machinery.participation && machinery.participation.length > 0) {
    const silentOrCapped = machinery.participation.filter(
      p => p.status === 'absent-silent' || p.status === 'absent-capped'
    );
    if (silentOrCapped.length > 0) {
      const capped = minConfidence(judgeConfidence ?? 'MEDIUM', 'MEDIUM');
      const names = silentOrCapped.map(p => `${p.agent} (${p.status})`).join(', ');
      return {
        finalConfidence: capped,
        confidenceReasoning: `Participation incomplete: ${names} — capping judge confidence (${judgeConfidence ?? 'MEDIUM'}) at MEDIUM.`,
        machinerySignals: machinery,
        judgeConfidence,
      };
    }
  }

  // Rule 4 — partial round completeness caps at MEDIUM.
  if (machinery.roundCompleteness < 1.0) {
    const capped = minConfidence(judgeConfidence ?? 'MEDIUM', 'MEDIUM');
    const pct = Math.round(machinery.roundCompleteness * 100);
    return {
      finalConfidence: capped,
      confidenceReasoning: `Round completeness ${pct}% (<100%) — capping judge confidence (${judgeConfidence ?? 'MEDIUM'}) at MEDIUM.`,
      machinerySignals: machinery,
      judgeConfidence,
    };
  }

  // Rule 5 — machinery clean, trust the judge (default MEDIUM when missing).
  const final = judgeConfidence ?? 'MEDIUM';
  const reasoning = judgeConfidence
    ? `Machinery clean (all agents spoke, turn balance ok, rounds complete); judge reported ${judgeConfidence} — finalConfidence=${final}.`
    : 'Machinery clean (all agents spoke, turn balance ok, rounds complete); judge confidence not available — defaulting to MEDIUM.';
  return {
    finalConfidence: final,
    confidenceReasoning: reasoning,
    machinerySignals: machinery,
    judgeConfidence,
  };
}
