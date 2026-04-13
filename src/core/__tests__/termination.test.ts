/**
 * Phase 15.2 — Task 3: judge-consensus hard termination guard regression tests.
 *
 * Source fixture: ~/.llm-conclave/discuss-logs/discuss-2026-04-13T13-35-08-816Z.md
 * In that session the judge declared consensus, but a subsequent round still
 * ran because nothing hard-stopped the loop. This test asserts that once
 * consensus is reached, no further rounds execute and any post-termination
 * turn attempt warns and skips without invoking the provider.
 */

import ConversationManager from '../ConversationManager';
import ProviderFactory from '../../providers/ProviderFactory';

jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: { createProvider: jest.fn() },
}));

jest.mock('../../utils/TokenCounter', () => ({
  __esModule: true,
  default: {
    estimateTokens: jest.fn().mockReturnValue(100),
    estimateMessagesTokens: jest.fn().mockReturnValue(500),
    getModelLimits: jest.fn().mockReturnValue({ maxInput: 128000, maxOutput: 4096 }),
    truncateMessages: jest.fn().mockImplementation((msgs: any) => ({ messages: msgs, tokenCount: 500 })),
  },
}));

function buildConsensusText(summary: string): string {
  return [
    'CONSENSUS_REACHED',
    '',
    'SUMMARY:',
    summary,
    '',
    'KEY_DECISIONS:',
    '- Decision 1',
    '',
    'ACTION_ITEMS:',
    '- Action 1',
    '',
    'DISSENT:',
    '- None',
    '',
    'CONFIDENCE: HIGH',
  ].join('\n');
}

function makeRoundRobinCM(opts: {
  agent1Responses: string[];
  agent2Responses: string[];
  judgeResponses: string[];
  maxRounds?: number;
  minRounds?: number;
}) {
  let i1 = 0, i2 = 0, ij = 0;
  const a1 = jest.fn().mockImplementation(() => {
    const text = opts.agent1Responses[i1] || opts.agent1Responses[opts.agent1Responses.length - 1];
    i1++;
    return Promise.resolve({ text });
  });
  const a2 = jest.fn().mockImplementation(() => {
    const text = opts.agent2Responses[i2] || opts.agent2Responses[opts.agent2Responses.length - 1];
    i2++;
    return Promise.resolve({ text });
  });
  const jChat = jest.fn().mockImplementation(() => {
    const text = opts.judgeResponses[ij] || opts.judgeResponses[opts.judgeResponses.length - 1];
    ij++;
    return Promise.resolve({ text });
  });

  (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
    if (model === 'model-A') return { chat: a1, getProviderName: jest.fn().mockReturnValue('mock') };
    if (model === 'model-B') return { chat: a2, getProviderName: jest.fn().mockReturnValue('mock') };
    return { chat: jChat, getProviderName: jest.fn().mockReturnValue('judge') };
  });

  const config: any = {
    turn_management: 'roundrobin',
    agents: {
      A: { model: 'model-A', prompt: 'You are A' },
      B: { model: 'model-B', prompt: 'You are B' },
    },
    judge: { model: 'model-judge', prompt: 'judge' },
    max_rounds: opts.maxRounds ?? 4,
    min_rounds: opts.minRounds ?? 0,
  };

  const cm = new ConversationManager(
    config, null, false, undefined, false, 'model-judge', { disableRouting: true }
  );

  const judge = {
    provider: { chat: jChat, getProviderName: jest.fn().mockReturnValue('judge') },
    systemPrompt: 'judge',
    model: 'model-judge',
  };

  return { cm, judge, a1, a2, jChat };
}

describe('ConversationManager judge-consensus termination guard (Phase 15.2)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    (console.log as any).mockRestore();
    (console.error as any).mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no further rounds run after judge declares consensus', async () => {
    const { cm, judge, a1, a2 } = makeRoundRobinCM({
      agent1Responses: ['A round 1'],
      agent2Responses: ['B round 1'],
      // First judge call → consensus reached.
      judgeResponses: [buildConsensusText('Consensus on first round')],
      maxRounds: 4,
      minRounds: 0,
    });

    const result = await cm.startConversation('Test task', judge);

    expect(result.consensusReached).toBe(true);
    expect(result.rounds).toBe(1);
    // Each agent spoke exactly once — no second round.
    expect(a1).toHaveBeenCalledTimes(1);
    expect(a2).toHaveBeenCalledTimes(1);
    // Internal flag was set.
    expect((cm as any).terminated).toBe(true);
  });

  it('post-termination turn attempts warn-and-skip without invoking the provider', async () => {
    const { cm, judge, a1 } = makeRoundRobinCM({
      agent1Responses: ['A round 1'],
      agent2Responses: ['B round 1'],
      judgeResponses: [buildConsensusText('Consensus')],
      maxRounds: 4,
      minRounds: 0,
    });

    await cm.startConversation('Test task', judge);

    // After termination, attempt another turn directly via the guarded helper.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const callsBefore = a1.mock.calls.length;
    await (cm as any).runAgentTurnGuarded('A');

    // Provider was NOT called again.
    expect(a1.mock.calls.length).toBe(callsBefore);
    // console.warn was called with the expected prefix and payload shape.
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls[0];
    expect(String(warnArgs[0])).toContain('[ConversationManager]');
    expect(String(warnArgs[0])).toContain('Turn attempted after terminated=true');
    expect(warnArgs[1]).toEqual(expect.objectContaining({ agent: 'A' }));
    warnSpy.mockRestore();
  });

  it('does not throw when guarded helper is called post-termination', async () => {
    const { cm, judge } = makeRoundRobinCM({
      agent1Responses: ['A'],
      agent2Responses: ['B'],
      judgeResponses: [buildConsensusText('Done')],
    });
    await cm.startConversation('Test task', judge);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect((cm as any).runAgentTurnGuarded('A')).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });

  it('terminated flag is in-memory only (not exposed on conversation result)', async () => {
    // session.json schema unchanged (D-09): the terminated flag is a private
    // instance field that does NOT appear on the returned result object.
    const { cm, judge } = makeRoundRobinCM({
      agent1Responses: ['A'],
      agent2Responses: ['B'],
      judgeResponses: [buildConsensusText('Done')],
    });
    const result = await cm.startConversation('Test task', judge);
    expect((result as any).terminated).toBeUndefined();
  });
});
