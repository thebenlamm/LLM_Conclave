/**
 * Phase 15.2 — Task 2: per-agent-per-round turn budget regression tests.
 *
 * Source fixture: ~/.llm-conclave/discuss-logs/discuss-2026-04-13T13-35-08-816Z.md
 * In that session, one agent (Security Expert) dominated a dynamic round with
 * 4+ consecutive turns because runDynamicRound had no per-agent cap — only a
 * lax safety limit of Math.max(20, agentOrder.length * 3). This test asserts
 * the new per-agent cap (default 1) holds and that the safety cap is tightened
 * to agentOrder.length * maxPerAgent + 1.
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

// SpeakerSelector mock — the implementation per test installs a custom
// `selectNextSpeaker` strategy on the captured instance.
jest.mock('../SpeakerSelector', () => {
  const mod = {
    __lastInstance: null as any,
    SpeakerSelector: Object.assign(
      jest.fn().mockImplementation(() => {
        const instance: any = {
          selectNextSpeaker: jest.fn(),
          startNewRound: jest.fn(),
          recordTurn: jest.fn(),
          resetForRound: jest.fn(),
          getAgentsWhoHaventSpoken: jest.fn().mockReturnValue([]),
        };
        mod.__lastInstance = instance;
        return instance;
      }),
      { extractExpertise: jest.fn().mockReturnValue('general') }
    ),
  };
  return mod;
});

const SpeakerSelectorMock = require('../SpeakerSelector');

function makeCM(opts: {
  agents: string[];
  maxTurnsPerAgentPerRound?: number;
}) {
  const agentResponseCount: Record<string, number> = {};
  const chatMocks: Record<string, jest.Mock> = {};

  for (const name of opts.agents) {
    agentResponseCount[name] = 0;
    chatMocks[name] = jest.fn().mockImplementation(() => {
      agentResponseCount[name]++;
      return Promise.resolve({ text: `${name} turn ${agentResponseCount[name]}` });
    });
  }

  (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
    const name = model.replace(/^model-/, '');
    return {
      chat: chatMocks[name] || jest.fn().mockResolvedValue({ text: 'fallback' }),
      getProviderName: jest.fn().mockReturnValue('Mock'),
    };
  });

  const agentsConfig: Record<string, any> = {};
  for (const name of opts.agents) {
    agentsConfig[name] = { model: `model-${name}`, prompt: `You are ${name}` };
  }

  const config: any = {
    turn_management: 'dynamic',
    agents: agentsConfig,
    judge: { model: 'model-judge', prompt: 'judge' },
    max_rounds: 1,
    min_rounds: 0,
  };
  if (typeof opts.maxTurnsPerAgentPerRound === 'number') {
    config.maxTurnsPerAgentPerRound = opts.maxTurnsPerAgentPerRound;
  }

  // dynamicSelection=true triggers SpeakerSelector construction.
  const cm = new ConversationManager(
    config,
    null,
    false,
    undefined,
    true, // dynamicSelection
    'model-judge',
    { disableRouting: true }
  );

  return { cm, chatMocks, agentResponseCount };
}

describe('runDynamicRound per-agent turn cap (Phase 15.2)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    (console.log as any).mockRestore();
    (console.warn as any).mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('default cap = 1: a fake selector that always picks A only lets A speak once', async () => {
    const { cm, agentResponseCount } = makeCM({ agents: ['A', 'B', 'C', 'D'] });

    const sel = SpeakerSelectorMock.__lastInstance;
    sel.selectNextSpeaker.mockImplementation(async (_h: any, _ls: any, _lr: any, _r: any, _t: any, exclusions: Set<string>) => {
      // Always ask for A. Once A is in the exclusion set (cap reached),
      // runDynamicRound's eligibleByCap filter will short-circuit BEFORE
      // selectNextSpeaker is called — so this stub will not even be invoked
      // for the cap-exhausted path.
      return { shouldContinue: true, nextSpeaker: 'A', reason: 'A always', confidence: 0.9, handoffRequested: false };
    });

    await cm.runDynamicRound('test task');

    expect(agentResponseCount['A']).toBe(1);
    // B/C/D were never selected.
    expect(agentResponseCount['B']).toBe(0);
    expect(agentResponseCount['C']).toBe(0);
    expect(agentResponseCount['D']).toBe(0);
  });

  it('cap = 2 with 3 agents and round-robin selector: round ends after at most 6 turns', async () => {
    const { cm, agentResponseCount } = makeCM({
      agents: ['A', 'B', 'C'],
      maxTurnsPerAgentPerRound: 2,
    });

    const order = ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C']; // selector keeps trying
    let i = 0;
    const sel = SpeakerSelectorMock.__lastInstance;
    sel.selectNextSpeaker.mockImplementation(async (_h: any, _ls: any, _lr: any, _r: any, _t: any, exclusions: Set<string>) => {
      // Pick the next non-excluded agent in round-robin order.
      while (i < order.length && exclusions.has(order[i])) i++;
      if (i >= order.length) {
        return { shouldContinue: false, nextSpeaker: null, reason: 'exhausted', confidence: 1, handoffRequested: false };
      }
      const next = order[i++];
      return { shouldContinue: true, nextSpeaker: next, reason: 'rr', confidence: 0.9, handoffRequested: false };
    });

    await cm.runDynamicRound('test task');

    const total = agentResponseCount['A'] + agentResponseCount['B'] + agentResponseCount['C'];
    expect(total).toBeLessThanOrEqual(6);
    // Each agent must respect the cap of 2.
    expect(agentResponseCount['A']).toBeLessThanOrEqual(2);
    expect(agentResponseCount['B']).toBeLessThanOrEqual(2);
    expect(agentResponseCount['C']).toBeLessThanOrEqual(2);
  });

  it('tightened safety cap: with default cap=1 and N=4 agents the loop never exceeds 5 total turns', async () => {
    // Pathological selector: ignores exclusions and always picks A. Even with
    // the per-agent filter in place, the selector cannot break the safety cap
    // because the eligible-pool filter empties on iteration 2 and breaks first.
    // This test guards against future regressions where a wildcard or override
    // path bypasses the per-agent filter.
    const { cm, chatMocks } = makeCM({ agents: ['A', 'B', 'C', 'D'] });

    const sel = SpeakerSelectorMock.__lastInstance;
    sel.selectNextSpeaker.mockImplementation(async () => {
      return { shouldContinue: true, nextSpeaker: 'A', reason: 'forced A', confidence: 0.9, handoffRequested: false };
    });

    await cm.runDynamicRound('test task');

    // Across all chat mocks, total invocations must respect agentOrder.length * cap + 1 = 5.
    const total = Object.values(chatMocks).reduce((acc, m) => acc + m.mock.calls.length, 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it('MCP schema additive guarantee: omitting maxTurnsPerAgentPerRound behaves as default 1', async () => {
    // Build CM WITHOUT specifying the new field — ensure behavior matches default 1.
    const { cm, agentResponseCount } = makeCM({ agents: ['A', 'B', 'C'] });

    const sel = SpeakerSelectorMock.__lastInstance;
    let counter = 0;
    sel.selectNextSpeaker.mockImplementation(async (_h: any, _ls: any, _lr: any, _r: any, _t: any, exclusions: Set<string>) => {
      const candidates = ['A', 'B', 'C'].filter(a => !exclusions.has(a));
      if (candidates.length === 0) {
        return { shouldContinue: false, nextSpeaker: null, reason: 'done', confidence: 1, handoffRequested: false };
      }
      counter++;
      return { shouldContinue: true, nextSpeaker: candidates[0], reason: 'next', confidence: 0.9, handoffRequested: false };
    });

    await cm.runDynamicRound('test task');

    // With default cap=1, each of the 3 agents speaks exactly once.
    expect(agentResponseCount['A']).toBe(1);
    expect(agentResponseCount['B']).toBe(1);
    expect(agentResponseCount['C']).toBe(1);
  });
});
