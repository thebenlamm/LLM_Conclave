import { EventBus } from './EventBus.js';

export interface AgentTurnSnapshot {
  name: string;
  turns: number;
  tokens: number; // cumulative input+output proxy
}

export const FAIRNESS_TOKEN_SHARE_THRESHOLD = 0.40;

/**
 * Phase 13 — real-time observability for speaker fairness.
 *
 * Computes per-agent token shares and emits events on the shared EventBus
 * after each turn. Closes the visibility gap surfaced by the Trollix run
 * (EmpiricalMethodologist 55% / LiteraryReader 7% with no live signal).
 *
 * Events emitted:
 *   - `turn_distribution_updated` on every report() call.
 *   - `fairness_alarm` once per (round, agent) pair when tokenShare > 0.40.
 */
export default class TurnDistributionReporter {
  private alarmedThisRound: Set<string> = new Set();

  /**
   * Clear the per-round dedupe set. Called at the start of each new round.
   */
  resetForRound(_round: number): void {
    this.alarmedThisRound.clear();
  }

  /**
   * Compute token shares and emit observability events.
   *
   * @param snapshots - per-agent counters (cumulative)
   * @param round - current round number
   * @param eventBus - target EventBus instance (optional; no-op if absent)
   */
  report(snapshots: AgentTurnSnapshot[], round: number, eventBus?: EventBus): void {
    const totalTokens = snapshots.reduce((s, a) => s + a.tokens, 0) || 1;
    const perAgent = snapshots.map(a => ({
      name: a.name,
      turns: a.turns,
      tokenShare: a.tokens / totalTokens,
    }));

    if (!eventBus) return;

    eventBus.emitEvent('turn_distribution_updated', { round, perAgent });

    for (const a of perAgent) {
      if (a.tokenShare > FAIRNESS_TOKEN_SHARE_THRESHOLD && !this.alarmedThisRound.has(a.name)) {
        this.alarmedThisRound.add(a.name);
        eventBus.emitEvent('fairness_alarm', {
          round,
          agent: a.name,
          tokenShare: a.tokenShare,
          threshold: FAIRNESS_TOKEN_SHARE_THRESHOLD,
        });
      }
    }
  }
}
