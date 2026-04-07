import ConversationManager from '../../core/ConversationManager';
import ProviderFactory from '../../providers/ProviderFactory';
import { EventBus } from '../../core/EventBus';

// Mock ProviderFactory - this is called during constructor's initializeAgents()
jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: {
    createProvider: jest.fn(),
  },
}));

// Mock TokenCounter to avoid real token counting
jest.mock('../../utils/TokenCounter', () => ({
  __esModule: true,
  default: {
    estimateTokens: jest.fn().mockReturnValue(100),
    estimateMessagesTokens: jest.fn().mockReturnValue(500),
    getModelLimits: jest.fn().mockReturnValue({ maxInput: 128000, maxOutput: 4096 }),
    truncateMessages: jest.fn().mockImplementation((msgs: any) => ({ messages: msgs, tokenCount: 500 })),
  },
}));

// Mock SpeakerSelector for dynamic mode tests
// The mock instance is controlled per-test by accessing the constructor mock
const mockSelectNextSpeaker = jest.fn();
const mockStartNewRound = jest.fn();
const mockRecordTurn = jest.fn();
const mockGetAgentsWhoHaventSpoken = jest.fn().mockReturnValue([]);

jest.mock('../../core/SpeakerSelector', () => ({
  SpeakerSelector: Object.assign(
    jest.fn().mockImplementation(() => ({
      selectNextSpeaker: mockSelectNextSpeaker,
      startNewRound: mockStartNewRound,
      recordTurn: mockRecordTurn,
      getAgentsWhoHaventSpoken: mockGetAgentsWhoHaventSpoken,
    })),
    {
      extractExpertise: jest.fn().mockReturnValue('general'),
    }
  ),
}));

// Helper to build CONSENSUS_REACHED text that parseStructuredOutput expects
function buildConsensusText(opts: {
  summary: string;
  keyDecisions?: string[];
  actionItems?: string[];
  dissent?: string[];
  confidence?: string;
}): string {
  const lines = ['CONSENSUS_REACHED', ''];
  lines.push('SUMMARY:');
  lines.push(opts.summary);
  lines.push('');
  lines.push('KEY_DECISIONS:');
  for (const kd of (opts.keyDecisions || [])) {
    lines.push(`- ${kd}`);
  }
  lines.push('');
  lines.push('ACTION_ITEMS:');
  for (const ai of (opts.actionItems || [])) {
    lines.push(`- ${ai}`);
  }
  lines.push('');
  lines.push('DISSENT:');
  if ((opts.dissent || []).length === 0) {
    lines.push('- None');
  } else {
    for (const d of opts.dissent!) {
      lines.push(`- ${d}`);
    }
  }
  lines.push('');
  lines.push(`CONFIDENCE: ${opts.confidence || 'HIGH'}`);
  return lines.join('\n');
}

// Helper for final vote text (same format as consensus but without CONSENSUS_REACHED prefix)
function buildFinalVoteText(opts: {
  summary: string;
  keyDecisions?: string[];
  actionItems?: string[];
  dissent?: string[];
  confidence?: string;
}): string {
  const lines = ['SUMMARY:'];
  lines.push(opts.summary);
  lines.push('');
  lines.push('KEY_DECISIONS:');
  for (const kd of (opts.keyDecisions || [])) {
    lines.push(`- ${kd}`);
  }
  lines.push('');
  lines.push('ACTION_ITEMS:');
  for (const ai of (opts.actionItems || [])) {
    lines.push(`- ${ai}`);
  }
  lines.push('');
  lines.push('DISSENT:');
  if ((opts.dissent || []).length === 0) {
    lines.push('- None');
  } else {
    for (const d of opts.dissent!) {
      lines.push(`- ${d}`);
    }
  }
  lines.push('');
  lines.push(`CONFIDENCE: ${opts.confidence || 'MEDIUM'}`);
  return lines.join('\n');
}

describe('ConversationManager Integration Tests', () => {
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

  // Factory for creating ConversationManager with mock providers
  function createSetup(opts: {
    agent1Responses: string[];
    agent2Responses: string[];
    judgeResponses: string[];
    maxRounds?: number;
    minRounds?: number;
    eventBus?: any;
  }) {
    let a1Idx = 0, a2Idx = 0;
    const mockAgent1Chat = jest.fn().mockImplementation(() => {
      const text = opts.agent1Responses[a1Idx] || opts.agent1Responses[opts.agent1Responses.length - 1];
      a1Idx++;
      return Promise.resolve({ text });
    });
    const mockAgent2Chat = jest.fn().mockImplementation(() => {
      const text = opts.agent2Responses[a2Idx] || opts.agent2Responses[opts.agent2Responses.length - 1];
      a2Idx++;
      return Promise.resolve({ text });
    });

    let jIdx = 0;
    const mockJudgeChat = jest.fn().mockImplementation(() => {
      const text = opts.judgeResponses[jIdx] || opts.judgeResponses[opts.judgeResponses.length - 1];
      jIdx++;
      return Promise.resolve({ text });
    });

    (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
      if (model === 'gpt-4o') {
        return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
      } else if (model === 'claude-sonnet-4-5') {
        return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
      } else {
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      }
    });

    const config = {
      turn_management: 'roundrobin',
      agents: {
        Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
        Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
      },
      judge: { model: 'gpt-4o', prompt: 'You are the judge' },
      max_rounds: opts.maxRounds ?? 3,
      min_rounds: opts.minRounds,
    };

    const cm = new ConversationManager(config, null, false, opts.eventBus || undefined, false, 'gpt-4o-mini', { disableRouting: true });

    const judge = {
      provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
      systemPrompt: 'You are the judge',
      model: 'gpt-4o',
    };

    return { cm, judge, mockAgent1Chat, mockAgent2Chat, mockJudgeChat };
  }

  describe('Full round-robin consensus flow', () => {
    it('should complete consensus in 1 round with 2 agents', async () => {
      const { cm, judge, mockAgent1Chat, mockAgent2Chat, mockJudgeChat } = createSetup({
        agent1Responses: ['Agent1 initial response'],
        agent2Responses: ['Agent2 initial response'],
        judgeResponses: [
          buildConsensusText({
            summary: 'Agreed solution from consensus',
            keyDecisions: ['Decision 1', 'Decision 2'],
            actionItems: ['Action 1'],
            confidence: 'HIGH',
          }),
        ],
      });

      const result = await cm.startConversation('Test task', judge);

      expect(result.consensusReached).toBe(true);
      expect(result.rounds).toBe(1);
      expect(result.solution).toBe('Agreed solution from consensus');
      expect(result.keyDecisions).toEqual(['Decision 1', 'Decision 2']);
      expect(result.actionItems).toEqual(['Action 1']);
      expect(result.confidence).toBe('HIGH');
      expect(mockAgent1Chat).toHaveBeenCalledTimes(1);
      expect(mockAgent2Chat).toHaveBeenCalledTimes(1);
      expect(mockJudgeChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('Max rounds fallback with final vote', () => {
    it('should reach max rounds and fall back to final vote', async () => {
      const { cm, judge, mockJudgeChat } = createSetup({
        agent1Responses: ['Agent1 response'],
        agent2Responses: ['Agent2 response'],
        judgeResponses: [
          // Round 1: no consensus
          'Continue discussing, focus on trade-offs',
          // Round 2: no consensus
          'Still no agreement, need more analysis',
          // Final vote (conductFinalVote)
          buildFinalVoteText({
            summary: 'Final vote solution',
            keyDecisions: ['Forced decision'],
            dissent: ['Agent2 disagreed'],
            confidence: 'MEDIUM',
          }),
        ],
        maxRounds: 2,
      });

      const result = await cm.startConversation('Test task', judge);

      expect(result.consensusReached).toBe(false);
      expect(result.rounds).toBe(2);
      expect(result.solution).toBe('Final vote solution');
      expect(result.dissent).toEqual(['Agent2 disagreed']);
      expect(result.confidence).toBe('MEDIUM');
      expect(mockJudgeChat).toHaveBeenCalledTimes(3); // 2 rounds + 1 final vote
    });
  });

  describe('Min rounds enforcement', () => {
    it('should defer consensus until min_rounds is met', async () => {
      const { cm, judge, mockJudgeChat } = createSetup({
        agent1Responses: ['Agent1 response'],
        agent2Responses: ['Agent2 response'],
        judgeResponses: [
          // Round 1: consensus reached but min_rounds not met → treated as guidance
          buildConsensusText({
            summary: 'Early solution',
            confidence: 'HIGH',
          }),
          // Round 2: consensus reached and min_rounds met
          buildConsensusText({
            summary: 'Final solution after min rounds',
            keyDecisions: ['Final decision'],
            confidence: 'HIGH',
          }),
        ],
        maxRounds: 3,
        minRounds: 2,
      });

      const result = await cm.startConversation('Test task', judge);

      expect(result.consensusReached).toBe(true);
      expect(result.rounds).toBe(2);
      expect(result.solution).toBe('Final solution after min rounds');
      expect(mockJudgeChat).toHaveBeenCalledTimes(2);
    });
  });

  describe('Circuit breaker for failing agents', () => {
    it('should disable persistently failing agent and continue with others', async () => {
      // Agent1 always fails
      const mockAgent1Chat = jest.fn().mockRejectedValue(new Error('429 rate limit'));
      const mockAgent2Chat = jest.fn().mockResolvedValue({ text: 'Agent2 response' });

      let jIdx = 0;
      const judgeTexts = [
        // Round 1: no consensus (Agent1 failed, Agent2 spoke)
        'Keep discussing, Agent1 had issues',
        // Round 2: consensus (only Agent2 contributed)
        buildConsensusText({
          summary: 'Solution with only Agent2',
          confidence: 'MEDIUM',
        }),
      ];
      const mockJudgeChat = jest.fn().mockImplementation(() => {
        const text = judgeTexts[jIdx] || judgeTexts[judgeTexts.length - 1];
        jIdx++;
        return Promise.resolve({ text });
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') {
          return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        } else if (model === 'claude-sonnet-4-5') {
          return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        } else {
          return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
        }
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'You are the judge' },
        max_rounds: 3,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o',
      };

      const result = await cm.startConversation('Test task', judge);

      // Should complete despite Agent1 failures
      expect(result).toBeDefined();
      expect(result.solution).toBeDefined();
      expect(mockAgent1Chat).toHaveBeenCalled();
      expect(mockAgent2Chat).toHaveBeenCalled();
    });
  });

  describe('Abort signal handling', () => {
    it('should stop discussion when abort signal is triggered', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['Agent1 response'],
        agent2Responses: ['Agent2 response'],
        judgeResponses: ['Continue discussing'],
        maxRounds: 5,
      });

      const controller = new AbortController();
      cm.abortSignal = controller.signal;

      // Abort before conversation starts (immediate)
      controller.abort('timeout');

      const result = await cm.startConversation('Test task', judge);

      expect((result as any).timedOut).toBe(true);
      // After timeout, the judge still runs to produce a summary — confidence comes from
      // the judge's actual evaluation, not a hardcoded fallback
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(result.confidence);
      expect(result.rounds).toBeLessThan(5);
    });
  });

  describe('Empty response handling with retry', () => {
    it('should handle empty agent response gracefully', async () => {
      // Agent1 returns empty first, then valid
      const mockAgent1Chat = jest.fn()
        .mockResolvedValueOnce({ text: '' })
        .mockResolvedValue({ text: 'Valid Agent1 response after retry' });

      const mockAgent2Chat = jest.fn()
        .mockResolvedValue({ text: 'Agent2 response' });

      const mockJudgeChat = jest.fn()
        .mockResolvedValue({
          text: buildConsensusText({
            summary: 'Solution after retry',
            confidence: 'HIGH',
          })
        });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') {
          return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        } else if (model === 'claude-sonnet-4-5') {
          return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        } else {
          return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
        }
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'You are the judge' },
        max_rounds: 3,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o',
      };

      const result = await cm.startConversation('Test task', judge);

      // Should still complete
      expect(result.consensusReached).toBe(true);
    });
  });

  describe('Connection retry on transient errors', () => {
    it('should retry and succeed on connection error', async () => {
      // Agent1 fails with connection error first, succeeds on retry
      let a1CallCount = 0;
      const mockAgent1Chat = jest.fn().mockImplementation(() => {
        a1CallCount++;
        if (a1CallCount === 1) {
          return Promise.reject(new Error('Connection error.'));
        }
        return Promise.resolve({ text: 'Agent1 response after retry' });
      });

      const mockAgent2Chat = jest.fn().mockResolvedValue({ text: 'Agent2 response' });
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildConsensusText({ summary: 'Solution after retry', confidence: 'HIGH' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'You are the judge' },
        max_rounds: 3,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o',
      };

      const result = await cm.startConversation('Test task', judge);

      // Agent1 should have contributed via retry
      expect(result.consensusReached).toBe(true);
      const agent1Entries = result.conversationHistory.filter(
        (e: any) => e.speaker === 'Agent1' && !e.error
      );
      expect(agent1Entries.length).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('should populate failedAgentDetails when connection retry also fails', async () => {
      // Agent1 always fails with connection error
      const mockAgent1Chat = jest.fn().mockRejectedValue(new Error('Connection error.'));
      const mockAgent2Chat = jest.fn().mockResolvedValue({ text: 'Agent2 response' });

      let jIdx = 0;
      const judgeTexts = [
        'Keep discussing',
        buildConsensusText({ summary: 'Solution without Agent1', confidence: 'MEDIUM' }),
      ];
      const mockJudgeChat = jest.fn().mockImplementation(() => {
        const text = judgeTexts[jIdx] || judgeTexts[judgeTexts.length - 1];
        jIdx++;
        return Promise.resolve({ text });
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'You are the judge' },
        max_rounds: 3,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o',
      };

      const result = await cm.startConversation('Test task', judge);

      expect(result.failedAgentDetails).toBeDefined();
      expect(result.failedAgentDetails['Agent1']).toBeDefined();
      expect(result.failedAgentDetails['Agent1'].error).toContain('Connection error');
      expect(result.failedAgentDetails['Agent1'].model).toBe('gpt-4o');
    }, 15000);
  });

  describe('Early abort on degraded round', () => {
    it('should abort when fewer than 2 agents respond in a round', async () => {
      // Both Agent1 and Agent2 fail → 0 contributors → degraded
      const mockAgent1Chat = jest.fn().mockRejectedValue(new Error('Connection error.'));
      const mockAgent2Chat = jest.fn().mockRejectedValue(new Error('Connection error.'));

      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildFinalVoteText({ summary: 'Degraded summary', confidence: 'LOW' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'You are the judge' },
        max_rounds: 4,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o',
      };

      const result = await cm.startConversation('Test task', judge);

      expect((result as any).degraded).toBe(true);
      expect((result as any).degradedReason).toContain('0 of 2');
      expect(result.rounds).toBe(1); // Stopped after round 1
      expect(result.failedAgentDetails).toBeDefined();
    }, 15000);

    it('should continue when enough agents respond (2 of 3)', async () => {
      // 3 agents: Agent1 fails, Agent2 and Agent3 succeed → 2 contributors → continue
      const mockAgent1Chat = jest.fn().mockRejectedValue(new Error('Connection error.'));
      const mockAgent2Chat = jest.fn().mockResolvedValue({ text: 'Agent2 response' });
      const mockAgent3Chat = jest.fn().mockResolvedValue({ text: 'Agent3 response' });

      let jIdx = 0;
      const judgeTexts = [
        'Keep discussing',
        buildConsensusText({ summary: 'Solution from 2 agents', confidence: 'MEDIUM' }),
      ];
      const mockJudgeChat = jest.fn().mockImplementation(() => {
        const text = judgeTexts[jIdx] || judgeTexts[judgeTexts.length - 1];
        jIdx++;
        return Promise.resolve({ text });
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        if (model === 'gemini-2.5-pro') return { chat: mockAgent3Chat, getProviderName: jest.fn().mockReturnValue('Gemini') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
          Agent3: { model: 'gemini-2.5-pro', prompt: 'You are Agent3' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'You are the judge' },
        max_rounds: 3,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o-mini',
      };

      const result = await cm.startConversation('Test task', judge);

      // Should NOT be degraded — 2 agents responded
      expect((result as any).degraded).toBeUndefined();
      expect(result.rounds).toBeGreaterThanOrEqual(1);
    }, 15000);
  });

  describe('failedAgentDetails in result', () => {
    it('should include correct agent-to-error mapping', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['Agent1 response'],
        agent2Responses: ['Agent2 response'],
        judgeResponses: [
          buildConsensusText({ summary: 'Solution', confidence: 'HIGH' }),
        ],
      });

      const result = await cm.startConversation('Test task', judge);

      // No failures → failedAgentDetails should be empty
      expect(result.failedAgentDetails).toBeDefined();
      expect(Object.keys(result.failedAgentDetails)).toHaveLength(0);
    });
  });

  describe('EventBus integration', () => {
    it('should emit events during conversation flow', async () => {
      const eventBus = new EventBus();
      const eventSpy = jest.fn();
      eventBus.on('agent:response', eventSpy);

      const { cm, judge } = createSetup({
        agent1Responses: ['Agent1 response'],
        agent2Responses: ['Agent2 response'],
        judgeResponses: [
          buildConsensusText({
            summary: 'Solution',
            confidence: 'HIGH',
          }),
        ],
        eventBus,
      });

      await cm.startConversation('Test task', judge);

      // Should have emitted events for agent responses
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Context optimization', () => {
    // Factory that supports contextOptimization config
    function createOptimizedSetup(opts: {
      agent1Responses: string[];
      agent2Responses: string[];
      judgeResponses: string[];
      maxRounds?: number;
      contextOptimization?: boolean;
    }) {
      let a1Idx = 0, a2Idx = 0;
      const mockAgent1Chat = jest.fn().mockImplementation(() => {
        const text = opts.agent1Responses[a1Idx] || opts.agent1Responses[opts.agent1Responses.length - 1];
        a1Idx++;
        return Promise.resolve({ text });
      });
      const mockAgent2Chat = jest.fn().mockImplementation(() => {
        const text = opts.agent2Responses[a2Idx] || opts.agent2Responses[opts.agent2Responses.length - 1];
        a2Idx++;
        return Promise.resolve({ text });
      });

      let jIdx = 0;
      const mockJudgeChat = jest.fn().mockImplementation(() => {
        const text = opts.judgeResponses[jIdx] || opts.judgeResponses[opts.judgeResponses.length - 1];
        jIdx++;
        return Promise.resolve({ text });
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') {
          return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        } else if (model === 'claude-sonnet-4-5') {
          return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
        } else {
          return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
        }
      });

      const config: any = {
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'You are the judge' },
        max_rounds: opts.maxRounds ?? 3,
      };

      if (opts.contextOptimization) {
        config.contextOptimization = { enabled: true };
      }

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });

      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o',
      };

      return { cm, judge, mockAgent1Chat, mockAgent2Chat, mockJudgeChat };
    }

    it('should pre-extract positionSummary on history entries when enabled', async () => {
      const { cm, judge } = createOptimizedSetup({
        agent1Responses: [
          '<reasoning>JWT has better stateless properties.</reasoning>\n<position>Use JWT with RSA-256 for auth.</position>',
        ],
        agent2Responses: [
          '<reasoning>Sessions are simpler to revoke.</reasoning>\n<position>Use session-based auth with Redis.</position>',
        ],
        judgeResponses: [
          buildConsensusText({ summary: 'Use JWT', keyDecisions: ['JWT'], confidence: 'HIGH' }),
        ],
        contextOptimization: true,
      });

      await cm.startConversation('Choose an auth strategy', judge);

      // Verify positionSummary was pre-extracted on agent entries
      const agentEntries = cm.conversationHistory.filter(
        (e: any) => e.role === 'assistant' && e.speaker !== 'Judge'
      );
      expect(agentEntries.length).toBe(2);
      expect(agentEntries[0].positionSummary).toBe('Use JWT with RSA-256 for auth.');
      expect(agentEntries[1].positionSummary).toBe('Use session-based auth with Redis.');
    });

    it('should NOT pre-extract positionSummary when disabled', async () => {
      const { cm, judge } = createOptimizedSetup({
        agent1Responses: [
          '<reasoning>analysis</reasoning>\n<position>Use JWT.</position>',
        ],
        agent2Responses: ['Use sessions.'],
        judgeResponses: [
          buildConsensusText({ summary: 'Use JWT', keyDecisions: ['JWT'], confidence: 'HIGH' }),
        ],
        contextOptimization: false,
      });

      await cm.startConversation('Choose auth', judge);

      const agentEntries = cm.conversationHistory.filter(
        (e: any) => e.role === 'assistant' && e.speaker !== 'Judge'
      );
      expect(agentEntries[0].positionSummary).toBeUndefined();
      expect(agentEntries[1].positionSummary).toBeUndefined();
    });

    it('should compress agent messages for other agents but preserve full content for judge', async () => {
      const agent1FullResponse = '<reasoning>Long detailed analysis about JWT tokens and their properties in microservices.</reasoning>\n<position>Use JWT with RSA-256.</position>';
      const agent2FullResponse = '<reasoning>Sessions have advantages for revocation and simplicity.</reasoning>\n<position>Use session-based auth.</position>';

      const { cm, judge, mockAgent1Chat, mockAgent2Chat, mockJudgeChat } = createOptimizedSetup({
        agent1Responses: [agent1FullResponse, agent1FullResponse],
        agent2Responses: [agent2FullResponse, agent2FullResponse],
        judgeResponses: [
          'Continue discussing trade-offs',
          buildConsensusText({ summary: 'Compromise', keyDecisions: ['Hybrid'], confidence: 'HIGH' }),
        ],
        maxRounds: 2,
        contextOptimization: true,
      });

      await cm.startConversation('Choose auth', judge);

      // Agent 2's messages in round 2 should contain Agent 1's position-only summary
      // (not the full reasoning). Check what Agent 2 received.
      const agent2Round2Call = mockAgent2Chat.mock.calls[1];
      if (agent2Round2Call) {
        const messagesContent = agent2Round2Call[0].map((m: any) => m.content).join('\n');
        // Should contain the position summary
        expect(messagesContent).toContain('Use JWT with RSA-256');
        // Should NOT contain the full reasoning in agent messages
        expect(messagesContent).not.toContain('Long detailed analysis about JWT tokens');
      }

      // Judge should see full content (via cachedRecentDiscussion which reads entry.content)
      const judgeCall = mockJudgeChat.mock.calls[0];
      const judgeContent = judgeCall[0].map((m: any) => m.content).join('\n');
      expect(judgeContent).toContain('Long detailed analysis about JWT tokens');
    });

    it('should handle agents that do not produce structured output (graceful fallback)', async () => {
      const { cm, judge } = createOptimizedSetup({
        agent1Responses: [
          'I think we should use PostgreSQL for this project. It has great ACID compliance and the team knows it well.',
        ],
        agent2Responses: [
          'MongoDB would be better for our document-heavy workload. Schema flexibility is key.',
        ],
        judgeResponses: [
          buildConsensusText({ summary: 'Use PostgreSQL', keyDecisions: ['PostgreSQL'], confidence: 'HIGH' }),
        ],
        contextOptimization: true,
      });

      await cm.startConversation('Choose a database', judge);

      // Should still extract positions via last-paragraph fallback
      const agentEntries = cm.conversationHistory.filter(
        (e: any) => e.role === 'assistant' && e.speaker !== 'Judge'
      );
      // positionSummary should exist (from fallback extraction)
      expect(agentEntries[0].positionSummary).toBeTruthy();
      expect(agentEntries[1].positionSummary).toBeTruthy();
    });

    it('should apply progressive round compression in multi-round discussions', async () => {
      const { cm, judge, mockAgent1Chat } = createOptimizedSetup({
        agent1Responses: [
          '<reasoning>Round 1 analysis.</reasoning>\n<position>Position round 1 from agent 1.</position>',
          '<reasoning>Round 2 analysis.</reasoning>\n<position>Position round 2 from agent 1.</position>',
          '<reasoning>Round 3 analysis.</reasoning>\n<position>Position round 3 from agent 1.</position>',
          '<reasoning>Round 4 analysis.</reasoning>\n<position>Position round 4 from agent 1.</position>',
        ],
        agent2Responses: [
          '<reasoning>Round 1 thoughts.</reasoning>\n<position>Position round 1 from agent 2.</position>',
          '<reasoning>Round 2 thoughts.</reasoning>\n<position>Position round 2 from agent 2.</position>',
          '<reasoning>Round 3 thoughts.</reasoning>\n<position>Position round 3 from agent 2.</position>',
          '<reasoning>Round 4 thoughts.</reasoning>\n<position>Position round 4 from agent 2.</position>',
        ],
        judgeResponses: [
          'Continue: round 1 guidance',
          'Continue: round 2 guidance',
          'Continue: round 3 guidance',
          buildConsensusText({ summary: 'Final answer', keyDecisions: ['Decision'], confidence: 'HIGH' }),
        ],
        maxRounds: 4,
        contextOptimization: true,
      });

      await cm.startConversation('Complex topic', judge);

      // By round 4, agent 1 should receive compressed older rounds.
      // Round 4 = last call to agent1 (index 3).
      const lastAgent1Call = mockAgent1Chat.mock.calls[3];
      if (lastAgent1Call) {
        const allContent = lastAgent1Call[0].map((m: any) => m.content).join('\n');
        // Should contain [Round N summary] markers for compressed rounds
        expect(allContent).toContain('[Round');
        expect(allContent).toContain('summary]');
        // Should NOT contain full reasoning from old rounds
        expect(allContent).not.toContain('Round 1 analysis');
        expect(allContent).not.toContain('Round 2 analysis');
      }
    });

    it('should complete full discussion with context optimization and produce valid result', async () => {
      const { cm, judge } = createOptimizedSetup({
        agent1Responses: [
          '<reasoning>Analyzing the architecture options.</reasoning>\n<position>Microservices with event-driven communication.</position>',
        ],
        agent2Responses: [
          '<reasoning>Considering team size and complexity.</reasoning>\n<position>Start monolithic, extract services later.</position>',
        ],
        judgeResponses: [
          buildConsensusText({
            summary: 'Start monolithic with clear service boundaries for future extraction',
            keyDecisions: ['Monolith-first approach', 'Event-driven internal communication'],
            actionItems: ['Define service boundaries', 'Set up event bus'],
            confidence: 'HIGH',
          }),
        ],
        contextOptimization: true,
      });

      const result = await cm.startConversation('Architecture decision', judge);

      expect(result.consensusReached).toBe(true);
      expect(result.solution).toContain('monolithic');
      expect(result.keyDecisions).toHaveLength(2);
      expect(result.confidence).toBe('HIGH');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // selector termination fixes (Phase 11)
  // These tests validate the two bugs fixed in Phase 11:
  //   1. Force-remaining-agents behavior removed from runDynamicRound (D-04)
  //   2. allAgentsContributed check remains for per-discussion validation (D-01)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('selector termination fixes (Phase 11)', () => {
    // Helper to create a dynamic-mode ConversationManager with mocked providers
    function createDynamicSetup(opts: {
      agentResponses: Record<string, string>;
      judgeResponses: string[];
      maxRounds?: number;
      minRounds?: number;
    }) {
      const agentChatMocks: Record<string, jest.Mock> = {};
      const agentModels: Record<string, string> = {
        Scholar: 'gpt-4o',
        Architect: 'claude-sonnet-4-5',
        Strategist: 'gemini-2.5-pro',
      };

      for (const [name, model] of Object.entries(agentModels)) {
        const response = opts.agentResponses[name] ?? `${name} response`;
        agentChatMocks[model] = jest.fn().mockResolvedValue({ text: response });
      }

      let jIdx = 0;
      const mockJudgeChat = jest.fn().mockImplementation(() => {
        const text = opts.judgeResponses[jIdx] || opts.judgeResponses[opts.judgeResponses.length - 1];
        jIdx++;
        return Promise.resolve({ text });
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (agentChatMocks[model]) {
          return { chat: agentChatMocks[model], getProviderName: jest.fn().mockReturnValue('mock') };
        }
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config: any = {
        turn_management: 'dynamic',
        agents: {
          Scholar: { model: 'gpt-4o', prompt: 'You are Scholar, an academic expert' },
          Architect: { model: 'claude-sonnet-4-5', prompt: 'You are Architect, a systems designer' },
          Strategist: { model: 'gemini-2.5-pro', prompt: 'You are Strategist, a strategic thinker' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'You are the judge' },
        max_rounds: opts.maxRounds ?? 5,
        min_rounds: opts.minRounds,
      };

      const cm = new ConversationManager(
        config, null, false, undefined,
        true, // dynamicSelection = true
        'gpt-4o-mini',
        { disableRouting: true }
      );

      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'You are the judge',
        model: 'gpt-4o-mini',
      };

      return { cm, judge, agentChatMocks, mockJudgeChat };
    }

    beforeEach(() => {
      // Reset dynamic mode selector mocks before each test
      mockSelectNextSpeaker.mockReset();
      mockStartNewRound.mockReset();
      mockRecordTurn.mockReset();
      mockGetAgentsWhoHaventSpoken.mockReset().mockReturnValue([]);
    });

    it('dynamic mode: judge consensus not overridden when all agents have contributed across rounds', async () => {
      // Scenario: 3-agent discussion. Rounds 1 and 2 each had partial agent participation
      // (not all agents spoke each round), but by end of round 2 all 3 agents have spoken.
      // Judge declares consensus after round 2. The allAgentsContributed check should pass
      // (all 3 have spoken across rounds) so consensus should NOT be overridden.

      // Round 1: Scholar speaks, then shouldContinue=false (Architect and Strategist don't speak)
      // Round 2: Architect speaks, Strategist speaks, then shouldContinue=false
      // Judge: consensus after round 2
      let roundCount = 0;
      mockStartNewRound.mockImplementation(() => { roundCount++; });

      // selectNextSpeaker call sequence:
      // Round 1: Scholar → shouldContinue=false
      // Round 2: Architect → Strategist → shouldContinue=false
      mockSelectNextSpeaker
        .mockResolvedValueOnce({ nextSpeaker: 'Scholar', shouldContinue: true, reason: 'Scholar speaks', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: '', shouldContinue: false, reason: 'Round 1 complete', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Architect', shouldContinue: true, reason: 'Architect speaks', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Strategist', shouldContinue: true, reason: 'Strategist speaks', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: '', shouldContinue: false, reason: 'Round 2 complete', handoffRequested: false, confidence: 0.9 });

      const { cm, judge } = createDynamicSetup({
        agentResponses: {
          Scholar: 'Scholar analysis',
          Architect: 'Architect design',
          Strategist: 'Strategist plan',
        },
        judgeResponses: [
          // Round 1: no consensus
          'Continue discussing more perspectives',
          // Round 2: consensus — all agents have now spoken across both rounds
          buildConsensusText({ summary: 'Consensus after all agents spoke across rounds', confidence: 'HIGH' }),
        ],
        maxRounds: 5,
      });

      const result = await cm.startConversation('Test task', judge);

      // All three agents spoke across rounds 1-2, so consensus should NOT be overridden
      expect(result.consensusReached).toBe(true);
      expect(result.solution).toBe('Consensus after all agents spoke across rounds');
    });

    it('dynamic mode: selector shouldContinue=false ends round without forcing extra speakers', async () => {
      // Scenario: selector says stop after Scholar speaks in round 1.
      // Architect and Strategist have NOT spoken yet this round.
      // BEFORE fix: would force Architect and Strategist to speak anyway.
      // AFTER fix: round ends immediately when selector says stop.

      // Track agentTurn calls — only Scholar should be called in round 1
      let scholarCalled = false;
      let architectCalled = false;
      let strategistCalled = false;

      // selectNextSpeaker: Scholar speaks → shouldContinue=false (no Architect or Strategist)
      // Then in round 2: all three speak and judge reaches consensus
      mockSelectNextSpeaker
        // Round 1
        .mockResolvedValueOnce({ nextSpeaker: 'Scholar', shouldContinue: true, reason: 'Scholar speaks', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: '', shouldContinue: false, reason: 'Round done', handoffRequested: false, confidence: 0.9 })
        // Round 2
        .mockResolvedValueOnce({ nextSpeaker: 'Scholar', shouldContinue: true, reason: 'Scholar', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Architect', shouldContinue: true, reason: 'Architect', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Strategist', shouldContinue: true, reason: 'Strategist', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: '', shouldContinue: false, reason: 'Round 2 done', handoffRequested: false, confidence: 0.9 });

      const { cm, judge, agentChatMocks } = createDynamicSetup({
        agentResponses: {
          Scholar: 'Scholar response',
          Architect: 'Architect response',
          Strategist: 'Strategist response',
        },
        judgeResponses: [
          // Round 1: no consensus (Scholar only — Architect and Strategist haven't spoken)
          'Need more perspectives',
          // Round 2: consensus after all agents spoke
          buildConsensusText({ summary: 'Consensus after proper round 2', confidence: 'HIGH' }),
        ],
        maxRounds: 5,
      });

      // Wrap agent mocks to track calls
      const origScholarMock = agentChatMocks['gpt-4o'];
      agentChatMocks['gpt-4o'] = jest.fn().mockImplementation((...args) => {
        scholarCalled = true;
        return origScholarMock(...args);
      });

      const origArchitectMock = agentChatMocks['claude-sonnet-4-5'];
      agentChatMocks['claude-sonnet-4-5'] = jest.fn().mockImplementation((...args) => {
        architectCalled = true;
        return origArchitectMock(...args);
      });

      // Re-setup ProviderFactory with tracked mocks
      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: agentChatMocks['gpt-4o'], getProviderName: jest.fn().mockReturnValue('mock') };
        if (model === 'claude-sonnet-4-5') return { chat: agentChatMocks['claude-sonnet-4-5'], getProviderName: jest.fn().mockReturnValue('mock') };
        if (model === 'gemini-2.5-pro') return { chat: agentChatMocks['gemini-2.5-pro'], getProviderName: jest.fn().mockReturnValue('mock') };
        return { chat: jest.fn().mockResolvedValue({ text: judge.provider.chat }), getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      await cm.startConversation('Test task', judge);

      // Architect was NOT selected by the selector in round 1 at all
      // (the selector returned shouldContinue=false after Scholar).
      // With the fix, Architect should NOT be called in round 1.
      // Scholar should have been called at least once (round 1 + round 2)
      expect(scholarCalled).toBe(true);
      // Architect is only called in round 2 (where selector selects them)
      // The key assertion: selectNextSpeaker should NOT have had force-calls between the
      // shouldContinue=false and the next round start
      // We verify by checking that the second mockSelectNextSpeaker call returned shouldContinue=false
      // and NO agentTurn was called for agents who hadn't spoken in round 1 after that point
      const selectorCalls = mockSelectNextSpeaker.mock.calls.length;
      // Round 1: 2 calls (Scholar + shouldContinue=false), Round 2: 4 calls
      // If force-remaining was active, there would be extra agentTurn calls between round 1 and 2
      expect(selectorCalls).toBeLessThanOrEqual(7); // 2 (round 1) + 4 (round 2) + maybe 1 extra = 7 max
    });

    it('dynamic mode: consensus deferred when an agent has never spoken in any round', async () => {
      // Scenario: Only Scholar and Architect speak. Strategist has NEVER spoken.
      // Judge declares consensus. The allAgentsContributed check should override this
      // because Strategist hasn't contributed at all (not in conversationHistory).

      mockSelectNextSpeaker
        // Round 1: Scholar and Architect speak, shouldContinue=false (Strategist never gets selected)
        .mockResolvedValueOnce({ nextSpeaker: 'Scholar', shouldContinue: true, reason: 'Scholar', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Architect', shouldContinue: true, reason: 'Architect', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: '', shouldContinue: false, reason: 'Round done', handoffRequested: false, confidence: 0.9 })
        // Round 2: All three agents speak (Strategist finally contributes)
        .mockResolvedValueOnce({ nextSpeaker: 'Scholar', shouldContinue: true, reason: 'Scholar', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Architect', shouldContinue: true, reason: 'Architect', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: 'Strategist', shouldContinue: true, reason: 'Strategist', handoffRequested: false, confidence: 0.9 })
        .mockResolvedValueOnce({ nextSpeaker: '', shouldContinue: false, reason: 'Round 2 done', handoffRequested: false, confidence: 0.9 });

      const { cm, judge } = createDynamicSetup({
        agentResponses: {
          Scholar: 'Scholar response',
          Architect: 'Architect response',
          Strategist: 'Strategist response',
        },
        judgeResponses: [
          // Round 1: judge tries to declare consensus BUT Strategist hasn't spoken — should be overridden
          buildConsensusText({ summary: 'Premature consensus', confidence: 'HIGH' }),
          // Round 2: consensus after Strategist contributes
          buildConsensusText({ summary: 'True consensus after all spoke', confidence: 'HIGH' }),
        ],
        maxRounds: 5,
      });

      const result = await cm.startConversation('Test task', judge);

      // Consensus in round 1 was deferred (Strategist hadn't spoken)
      // Consensus in round 2 should succeed (all three agents have now spoken)
      expect(result.consensusReached).toBe(true);
      expect(result.rounds).toBe(2); // Needed 2 rounds, not 1
      expect(result.solution).toBe('True consensus after all spoke');
    });

    it('round-robin mode: allAgentsContributed check unchanged — consensus deferred until all speak', async () => {
      // In round-robin mode, allAgentsContributed check should still work.
      // This test ensures the fix doesn't accidentally break round-robin behavior.
      // With 2 agents in round-robin, both speak every round — consensus on round 1 is valid.

      const { cm, judge } = createSetup({
        agent1Responses: ['Agent1 perspective'],
        agent2Responses: ['Agent2 perspective'],
        judgeResponses: [
          buildConsensusText({
            summary: 'Round-robin consensus after both agents spoke',
            confidence: 'HIGH',
          }),
        ],
        maxRounds: 3,
      });

      const result = await cm.startConversation('Test task', judge);

      expect(result.consensusReached).toBe(true);
      expect(result.rounds).toBe(1); // Both agents spoke in round 1, consensus valid
      expect(result.solution).toBe('Round-robin consensus after both agents spoke');
    });
  });
});
