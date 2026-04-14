import { EventBus } from './EventBus.js';
import type { ParticipationEntry, AgentAbsentPayload } from '../types/index.js';

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
 *
 * Phase 13.1 extensions:
 *   - Tracks cap-exclusions recorded by SpeakerSelector's max_turn_ratio branch.
 *   - Builds a participation report over all configured agents.
 *   - Emits one `conversation:agent_absent` event per non-spoken agent
 *     at end-of-discussion via finalizeAbsenceEvents().
 */
export default class TurnDistributionReporter {
  private alarmedThisRound: Set<string> = new Set();

  // Phase 13.1 state
  private eventBus?: EventBus;
  private _turnCounts: Map<string, number> = new Map();
  private _capExclusions: Map<string, { rounds: number[]; firstRatio: number }> = new Map();
  private _absenceEventsFinalized: boolean = false;

  /**
   * @param eventBus - Optional EventBus instance for finalizeAbsenceEvents().
   *                   Legacy callers omit this and pass the bus per-report().
   */
  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

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
    // Phase 13.1 — track cumulative turn counts from snapshots so
    // buildParticipationReport() can classify agents after the run.
    for (const s of snapshots) {
      const prev = this._turnCounts.get(s.name) ?? 0;
      if (s.turns > prev) this._turnCounts.set(s.name, s.turns);
      else if (!this._turnCounts.has(s.name)) this._turnCounts.set(s.name, s.turns);
    }

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

  /**
   * Phase 13.1 — record that SpeakerSelector's max_turn_ratio cap excluded
   * an agent in a given round. Stores first-exclusion ratio, dedupes repeats
   * of the same (agent, round) pair. No event emitted here; absence events
   * fire once at end-of-discussion via finalizeAbsenceEvents().
   */
  public recordCapExclusion(agent: string, round: number, ratio: number): void {
    const existing = this._capExclusions.get(agent);
    if (!existing) {
      this._capExclusions.set(agent, { rounds: [round], firstRatio: ratio });
      return;
    }
    if (!existing.rounds.includes(round)) existing.rounds.push(round);
  }

  /**
   * Phase 13.1 — produce a ParticipationEntry for every configured agent.
   *
   * Precedence for zero-turn agents:
   *   1. failedAgents (set)        → 'absent-failed'
   *   2. cap-exclusion recorded    → 'absent-capped' (rounds + ratioAtExclusion)
   *   3. otherwise                 → 'absent-silent'
   */
  public buildParticipationReport(
    configuredAgents: string[],
    failedAgents: Set<string> = new Set()
  ): ParticipationEntry[] {
    return configuredAgents.map(agent => {
      const turns = this._turnCounts.get(agent) ?? 0;
      if (turns > 0) {
        return { agent, turns, status: 'spoken' as const };
      }
      if (failedAgents.has(agent)) {
        return {
          agent,
          turns: 0,
          status: 'absent-failed' as const,
          reason: 'all attempted turns failed',
        };
      }
      const cap = this._capExclusions.get(agent);
      if (cap) {
        return {
          agent,
          turns: 0,
          status: 'absent-capped' as const,
          rounds: [...cap.rounds],
          ratioAtExclusion: cap.firstRatio,
          reason: `fairness cap (ratio ${cap.firstRatio.toFixed(2)} exceeded threshold)`,
        };
      }
      return {
        agent,
        turns: 0,
        status: 'absent-silent' as const,
        reason: 'never selected by speaker selector',
      };
    });
  }

  /**
   * Phase 13.1 — emit one `conversation:agent_absent` event per non-spoken
   * ParticipationEntry. Idempotent: repeated calls are a no-op.
   */
  public finalizeAbsenceEvents(report: ParticipationEntry[]): void {
    if (this._absenceEventsFinalized) return;
    this._absenceEventsFinalized = true;
    if (!this.eventBus) return;
    for (const entry of report) {
      if (entry.status === 'spoken') continue;
      const shortStatus: AgentAbsentPayload['status'] =
        entry.status === 'absent-capped'
          ? 'capped'
          : entry.status === 'absent-failed'
            ? 'failed'
            : 'silent';
      const payload: AgentAbsentPayload = {
        agentName: entry.agent,
        status: shortStatus,
        rounds: entry.rounds ?? [],
        reason: entry.reason ?? '',
      };
      this.eventBus.emitEvent('conversation:agent_absent', payload);
    }
  }
}
