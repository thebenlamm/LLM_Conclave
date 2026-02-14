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
jest.mock('../../core/SpeakerSelector', () => ({
  SpeakerSelector: Object.assign(
    jest.fn().mockImplementation(() => ({
      selectNextSpeaker: jest.fn().mockResolvedValue('Agent1'),
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
      expect(result.confidence).toBe('LOW');
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
});
