import { DiscussionHistoryEntry } from '../../types';
import {
  isAgentContribution,
  roundOf,
  contributorsForRound,
  contributorsOverall,
} from '../roundMembership';

const agent = (
  speaker: string,
  round?: number,
  over: Partial<DiscussionHistoryEntry> = {}
): DiscussionHistoryEntry =>
  ({ role: 'assistant', speaker, content: `${speaker} says something`, roundNumber: round, ...over } as DiscussionHistoryEntry);

const errored = (speaker: string, round?: number): DiscussionHistoryEntry =>
  agent(speaker, round, { error: true, content: `[${speaker} unavailable]` });

const judgeGuidance = (round?: number): DiscussionHistoryEntry =>
  ({ role: 'user', speaker: 'Judge', content: 'guidance', roundNumber: round } as DiscussionHistoryEntry);

const systemNote = (round?: number): DiscussionHistoryEntry =>
  ({ role: 'user', speaker: 'System', content: '[System: X removed]', roundNumber: round } as DiscussionHistoryEntry);

const task = (): DiscussionHistoryEntry =>
  ({ role: 'user', speaker: 'System', content: 'Task: decide', roundNumber: 0 } as DiscussionHistoryEntry);

describe('isAgentContribution', () => {
  it('accepts a non-error assistant turn with a real speaker', () => {
    expect(isAgentContribution(agent('Agent1', 1))).toBe(true);
  });
  it('rejects Judge, System, errors, the task, and empty speakers', () => {
    expect(isAgentContribution(judgeGuidance(1))).toBe(false);
    expect(isAgentContribution(systemNote(1))).toBe(false);
    expect(isAgentContribution(errored('Agent1', 1))).toBe(false);
    expect(isAgentContribution(task())).toBe(false);
    expect(isAgentContribution({ role: 'assistant', speaker: '', content: 'x' } as any)).toBe(false);
  });
});

describe('roundOf', () => {
  it('returns the authoritative stamp when present (including 0)', () => {
    expect(roundOf(task())).toBe(0);
    expect(roundOf(agent('Agent1', 3))).toBe(3);
  });
  it('falls back to structural boundary inference when the stamp is absent', () => {
    // Legacy/unstamped history: task, r1a1, r1a2, judge, r2a1, r2a2
    const h: DiscussionHistoryEntry[] = [
      { role: 'user', speaker: 'System', content: 'Task: t' } as DiscussionHistoryEntry,
      agent('Agent1'), agent('Agent2'),
      { role: 'user', speaker: 'Judge', content: 'g' } as DiscussionHistoryEntry,
      agent('Agent1'), agent('Agent2'),
    ];
    expect(roundOf(h[0], h)).toBe(1); // task → round 1 (0 boundaries before)
    expect(roundOf(h[1], h)).toBe(1);
    expect(roundOf(h[4], h)).toBe(2); // after one Judge-guidance boundary
  });
  it('counts compressed-summary entries as boundaries in the fallback', () => {
    const h: DiscussionHistoryEntry[] = [
      agent('Agent1'),
      { role: 'user', speaker: 'System', content: '[Round 1 summary]', compressed: true } as any,
      agent('Agent1'),
    ];
    expect(roundOf(h[2], h)).toBe(2);
  });
  it('returns 0 for an unstamped entry with no history context', () => {
    expect(roundOf(agent('Agent1'))).toBe(0);
  });
});

describe('contributorsForRound — immune to interleaved System notes (#7)', () => {
  // Two healthy agents + a failing agent's error + breaker System note, all stamped round 2.
  // The System-note POSITION must not change the result.
  const build = (notePos: 'first' | 'middle' | 'last'): DiscussionHistoryEntry[] => {
    const a = agent('Agent2', 2), b = agent('Agent3', 2);
    const fail = errored('AgentFail', 2), note = systemNote(2);
    const round2 =
      notePos === 'first' ? [fail, note, a, b] :
      notePos === 'middle' ? [a, fail, note, b] :
      [a, b, fail, note];
    return [task(), agent('Agent2', 1), agent('Agent3', 1), judgeGuidance(1), ...round2];
  };
  it.each(['first', 'middle', 'last'] as const)('counts both healthy agents with System note %s', (pos) => {
    const set = contributorsForRound(build(pos), 2);
    expect(set).toEqual(new Set(['Agent2', 'Agent3']));
  });
  it('returns a genuinely-doomed round (1 distinct agent) as size 1', () => {
    const h = [task(), agent('Agent2', 1), errored('AgentFail', 1), systemNote(1)];
    expect(contributorsForRound(h, 1)).toEqual(new Set(['Agent2']));
  });
});

describe('contributorsOverall', () => {
  it('unions distinct agent speakers across all rounds, excluding errors/Judge/System', () => {
    const h = [
      task(), agent('A', 1), agent('B', 1), errored('C', 1), judgeGuidance(1),
      agent('A', 2), agent('C', 2),
    ];
    expect(contributorsOverall(h)).toEqual(new Set(['A', 'B', 'C']));
  });
});
