import { DiscussionHistoryEntry } from '../types';

/**
 * Single source of truth for round membership and contributor identification.
 *
 * `entry.roundNumber` (Phase 18 AUDIT-03) is the authoritative round stamp; it is
 * set at push time in ConversationManager, AgentTurnExecutor, and ContinuationHandler.
 * These helpers read that stamp and apply the ONE canonical predicate for "this entry
 * is an agent's substantive contribution," replacing logic that was previously
 * copy-pasted across the codebase and re-derived via fragile arithmetic.
 */

/**
 * The canonical contributor predicate: a non-error assistant turn from a real
 * agent (not the Judge, not a System note).
 */
export function isAgentContribution(entry: DiscussionHistoryEntry): boolean {
  return (
    entry.role === 'assistant' &&
    !!entry.speaker &&
    entry.speaker !== 'Judge' &&
    entry.speaker !== 'System' &&
    !entry.error
  );
}

/**
 * The round an entry belongs to. Reads the authoritative `entry.roundNumber`
 * stamp when present (including the legitimate 0 for the pre-round-1 task).
 *
 * Falls back to STRUCTURAL boundary inference ONLY when the stamp is absent
 * (legacy in-memory entries / restored sessions / test fixtures): counts the
 * round delimiters before the entry's position and adds 1. Delimiters mirror
 * `ConversationHistory.groupHistoryByRound` exactly — Judge guidance
 * (`role:'user'` + `speaker:'Judge'`) and compressed round summaries
 * (`compressed === true`) — so the two stay in lockstep. It deliberately does
 * NOT use uniform-size arithmetic (responses / agentCount), which silently
 * miscounts the moment any agent fails, skips, or aborts.
 */
export function roundOf(
  entry: DiscussionHistoryEntry,
  history?: DiscussionHistoryEntry[]
): number {
  if (typeof entry.roundNumber === 'number') return entry.roundNumber;
  if (!history || history.length === 0) return 0;

  const index = history.indexOf(entry);
  if (index < 0) return 0;

  let boundaries = 0;
  for (let i = 0; i < index; i++) {
    const e = history[i];
    const isJudgeGuidance = e.speaker === 'Judge' && e.role === 'user';
    const isCompressedRound = (e as { compressed?: boolean }).compressed === true;
    if (isJudgeGuidance || isCompressedRound) boundaries++;
  }
  return boundaries + 1;
}

/**
 * The distinct set of agents that contributed in round `n`. Keys off the round
 * stamp (via `roundOf`) and the canonical predicate, so interleaved System notes
 * or errored turns never truncate or inflate the count — the fix for the
 * beta-feedback #7 abort/participation mismatch.
 */
export function contributorsForRound(
  history: DiscussionHistoryEntry[],
  n: number
): Set<string> {
  const contributors = new Set<string>();
  for (const entry of history) {
    if (isAgentContribution(entry) && roundOf(entry, history) === n) {
      contributors.add(entry.speaker);
    }
  }
  return contributors;
}

/**
 * The distinct set of agents that contributed across the whole discussion.
 */
export function contributorsOverall(history: DiscussionHistoryEntry[]): Set<string> {
  const contributors = new Set<string>();
  for (const entry of history) {
    if (isAgentContribution(entry)) contributors.add(entry.speaker);
  }
  return contributors;
}
