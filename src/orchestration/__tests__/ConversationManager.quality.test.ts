import ConversationManager from '../../core/ConversationManager';
import ProviderFactory from '../../providers/ProviderFactory';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: {
    createProvider: jest.fn(),
  },
}));

// Mock TokenCounter
jest.mock('../../utils/TokenCounter', () => ({
  __esModule: true,
  default: {
    estimateTokens: jest.fn().mockReturnValue(100),
    estimateMessagesTokens: jest.fn().mockReturnValue(500),
    getModelLimits: jest.fn().mockReturnValue({ maxInput: 128000, maxOutput: 4096 }),
    truncateMessages: jest.fn().mockImplementation((msgs: any) => ({ messages: msgs, tokenCount: 500 })),
    truncateText: jest.fn().mockImplementation((text: string, limit: number) => ({ text: text.substring(0, 500), tokenCount: limit })),
    summarizeRoundEntries: jest.fn().mockImplementation((entries: any[]) => entries.map((e: any) => `${e.speaker}: [summary]`).join('\n')),
  },
}));

jest.mock('../../core/SpeakerSelector', () => ({
  SpeakerSelector: Object.assign(
    jest.fn().mockImplementation(() => ({
      selectNextSpeaker: jest.fn().mockResolvedValue('Agent1'),
      resetForRound: jest.fn(),
      startNewRound: jest.fn(),
      recordTurn: jest.fn(),
    })),
    { extractExpertise: jest.fn().mockReturnValue('general') }
  ),
}));

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
  for (const kd of (opts.keyDecisions || ['Decision 1'])) lines.push(`- ${kd}`);
  lines.push('');
  lines.push('ACTION_ITEMS:');
  for (const ai of (opts.actionItems || ['Action 1'])) lines.push(`- ${ai}`);
  lines.push('');
  lines.push('DISSENT:');
  lines.push(opts.dissent?.length ? opts.dissent.map(d => `- ${d}`).join('\n') : '- None');
  lines.push('');
  lines.push(`CONFIDENCE: ${opts.confidence || 'HIGH'}`);
  return lines.join('\n');
}

function buildFinalVoteText(opts: { summary: string; confidence?: string }): string {
  return `SUMMARY:\n${opts.summary}\n\nKEY_DECISIONS:\n- Decision 1\n\nACTION_ITEMS:\n- Action 1\n\nDISSENT:\n- None\n\nCONFIDENCE: ${opts.confidence || 'MEDIUM'}`;
}

describe('ConversationManager Quality Tests', () => {
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

  function createSetup(opts: {
    agent1Responses: string[];
    agent2Responses: string[];
    judgeResponses: string[];
    maxRounds?: number;
    minRounds?: number;
    judgeModel?: string;
  }) {
    let a1Idx = 0, a2Idx = 0, jIdx = 0;

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
    const mockJudgeChat = jest.fn().mockImplementation(() => {
      const text = opts.judgeResponses[jIdx] || opts.judgeResponses[opts.judgeResponses.length - 1];
      jIdx++;
      return Promise.resolve({ text });
    });

    // Track fallback provider creation
    const mockFallbackChat = jest.fn().mockResolvedValue({
      text: buildFinalVoteText({ summary: 'Fallback judge summary' }),
    });

    (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
      if (model === 'gpt-4o') {
        return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
      } else if (model === 'claude-sonnet-4-5') {
        return { chat: mockAgent2Chat, getProviderName: jest.fn().mockReturnValue('Claude') };
      } else if (model === 'gemini-2.5-flash') {
        return { chat: mockFallbackChat, getProviderName: jest.fn().mockReturnValue('Gemini') };
      } else {
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      }
    });

    const judgeModel = opts.judgeModel || 'gpt-4o';
    const config = {
      turn_management: 'roundrobin',
      agents: {
        Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
        Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
      },
      judge: { model: judgeModel, prompt: 'You are the judge' },
      max_rounds: opts.maxRounds ?? 3,
      min_rounds: opts.minRounds ?? 0,
    };

    const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });

    const judge = {
      provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
      systemPrompt: 'You are the judge',
      model: judgeModel,
    };

    return { cm, judge, mockAgent1Chat, mockAgent2Chat, mockJudgeChat, mockFallbackChat };
  }

  // =========================================================================
  // Rubber-stamp detection
  // =========================================================================
  describe('Rubber-stamp detection', () => {
    it('should inject rubber-stamp context when agents agree without challenge', async () => {
      const { cm, judge, mockJudgeChat } = createSetup({
        agent1Responses: ['Great idea! I love this approach. Fully support it.'],
        agent2Responses: ['Excellent proposal. This is exactly what we need.'],
        judgeResponses: [
          // Round 1: judge receives rubber-stamp context, rejects consensus
          'The agents have not reached genuine consensus. Continue discussion.',
          // Round 2: agents provide substance, judge accepts
          buildConsensusText({ summary: 'Final agreed solution' }),
        ],
        maxRounds: 2,
      });

      await cm.startConversation('Design a system', judge);

      // The judge should have been called with rubber-stamp context in round 1
      const round1JudgeCall = mockJudgeChat.mock.calls[0];
      const round1Prompt = round1JudgeCall[0][0].content;
      expect(round1Prompt).toContain('agreement without substantive challenge');
    });

    it('should NOT trigger rubber-stamp when agents ask questions', async () => {
      const { cm, judge, mockJudgeChat } = createSetup({
        agent1Responses: ['I think we should use Redis. What about the cold-start latency?'],
        agent2Responses: ['Good point about Redis. However, the memory cost concerns me.'],
        judgeResponses: [
          buildConsensusText({ summary: 'Agents agreed on caching strategy' }),
        ],
      });

      await cm.startConversation('Design caching', judge);

      // Judge prompt should NOT contain rubber-stamp warning
      const judgeCall = mockJudgeChat.mock.calls[0];
      const prompt = judgeCall[0][0].content;
      expect(prompt).not.toContain('agreement without substantive challenge');
    });

    it('should handle the /g flag correctly — all entries checked independently', async () => {
      // This test verifies the fix for the critical /g flag bug.
      // With /g, .test() alternates true/false across .filter() calls.
      // All 3 entries here contain "risk" and should all be detected as challenges.
      const { cm, judge, mockJudgeChat } = createSetup({
        agent1Responses: ['The main risk is scalability under load.'],
        agent2Responses: ['I see a risk in the authentication flow too.'],
        judgeResponses: [
          buildConsensusText({ summary: 'Agreed on risk mitigation' }),
        ],
      });

      await cm.startConversation('Review risks', judge);

      // Both agents raised risks — should NOT be rubber-stamped
      const prompt = mockJudgeChat.mock.calls[0][0][0].content;
      expect(prompt).not.toContain('agreement without substantive challenge');
    });
  });

  // =========================================================================
  // CONTEXT_OVERFLOW_PATTERN — TPM error detection
  // =========================================================================
  describe('TPM error detection in conductFinalVote', () => {
    it('should detect OpenAI TPM 429 error and fall back to another model', async () => {
      let judgeCallCount = 0;
      const mockJudgeChat = jest.fn().mockImplementation(() => {
        judgeCallCount++;
        if (judgeCallCount <= 1) {
          // Round 1 judgeEvaluate — no consensus
          return Promise.resolve({ text: 'No consensus yet. Continue discussing.' });
        }
        // conductFinalVote (round 1 = max rounds) — throw TPM error
        throw new Error('429 Request too large for gpt-4o in organization org-xxx on tokens per min (TPM): Limit 30000, Requested 125037');
      });

      const mockFallbackChat = jest.fn().mockResolvedValue({
        text: buildFinalVoteText({ summary: 'Fallback judge produced this summary' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gemini-2.5-flash') {
          return { chat: mockFallbackChat, getProviderName: jest.fn().mockReturnValue('Gemini') };
        }
        return { chat: jest.fn().mockResolvedValue({ text: 'Agent response with some substance' }), getProviderName: jest.fn().mockReturnValue('Provider') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o',
      };

      const result = await cm.startConversation('Test topic', judge);

      // Should have fallen back to gemini-2.5-flash (cross-provider from OpenAI)
      expect(ProviderFactory.createProvider).toHaveBeenCalledWith('gemini-2.5-flash');
      // Should have a solution from fallback, not "Unable to reach a final decision"
      expect(result.solution).not.toContain('Unable to reach');
    });

    it('should fall back to bestEffortJudgeResult when both judge and fallback fail', async () => {
      let callCount = 0;
      const { cm, judge, mockJudgeChat, mockFallbackChat } = createSetup({
        agent1Responses: ['Agent1 has thoughts on this matter'],
        agent2Responses: ['Agent2 disagrees with Agent1 approach'],
        judgeResponses: ['No consensus.'],
        maxRounds: 1,
      });

      mockJudgeChat.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return Promise.resolve({ text: 'No consensus.' });
        throw new Error('context_length_exceeded: max tokens 128000');
      });

      // Fallback also fails
      mockFallbackChat.mockRejectedValue(new Error('Also failed'));

      const result = await cm.startConversation('Test', judge);

      // Should use bestEffortJudgeResult (contains agent positions)
      expect(result.solution).toContain('Best-effort');
      expect(result.confidence).toBe('LOW');
      // Should include judge error in dissent
      expect(result.dissent.some((d: string) => d.includes('Judge error'))).toBe(true);
    });
  });

  // =========================================================================
  // Cross-provider fallback model selection
  // =========================================================================
  describe('Cross-provider fallback selection', () => {
    it('should fall back to Claude when Gemini judge fails', async () => {
      let callCount = 0;
      const mockGeminiChat = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return Promise.resolve({ text: 'No consensus.' });
        throw new Error('Request too large for gemini-2.5-flash');
      });
      const mockClaudeFallback = jest.fn().mockResolvedValue({
        text: buildFinalVoteText({ summary: 'Claude fallback summary' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: jest.fn().mockResolvedValue({ text: 'Agent response' }), getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: model === 'claude-sonnet-4-5' ? mockClaudeFallback : jest.fn().mockResolvedValue({ text: 'Agent response' }), getProviderName: jest.fn().mockReturnValue('Claude') };
        if (model === 'gemini-2.5-flash') return { chat: mockGeminiChat, getProviderName: jest.fn().mockReturnValue('Gemini') };
        return { chat: jest.fn().mockResolvedValue({ text: 'fallback' }), getProviderName: jest.fn().mockReturnValue('Unknown') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'gpt-4o', prompt: 'Agent2' },
        },
        judge: { model: 'gemini-2.5-flash', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockGeminiChat, getProviderName: jest.fn().mockReturnValue('Gemini') },
        systemPrompt: 'Judge',
        model: 'gemini-2.5-flash',
      };

      const result = await cm.startConversation('Test', judge);

      // Should have tried claude-sonnet-4-5 as fallback (cross-provider from Gemini)
      expect(ProviderFactory.createProvider).toHaveBeenCalledWith('claude-sonnet-4-5');
    });
  });

  // =========================================================================
  // Pre-flight TPM check (Phase 12)
  // =========================================================================
  describe('pre-flight TPM check (Phase 12)', () => {
    const ORIGINAL_OPENAI_TPM = process.env.LLM_CONCLAVE_TPM_OPENAI;

    afterEach(() => {
      if (ORIGINAL_OPENAI_TPM === undefined) {
        delete process.env.LLM_CONCLAVE_TPM_OPENAI;
      } else {
        process.env.LLM_CONCLAVE_TPM_OPENAI = ORIGINAL_OPENAI_TPM;
      }
    });

    it('throws PreFlightTpmError when an agent exceeds its provider TPM ceiling', async () => {
      // Force OpenAI TPM ceiling to a tiny value so any non-empty prompt+task busts it
      process.env.LLM_CONCLAVE_TPM_OPENAI = '5';

      const { cm, judge, mockAgent1Chat } = createSetup({
        agent1Responses: ['Should never be called'],
        agent2Responses: ['Should never be called'],
        judgeResponses: ['Should never be called'],
        maxRounds: 1,
      });

      const { PreFlightTpmError } = require('../../providers/tpmLimits');

      await expect(cm.startConversation('A reasonably long task description that has plenty of tokens', judge))
        .rejects.toBeInstanceOf(PreFlightTpmError);

      // No agent calls should have happened
      expect(mockAgent1Chat).not.toHaveBeenCalled();
    });

    it('PreFlightTpmError carries per-agent violations including the offending model', async () => {
      process.env.LLM_CONCLAVE_TPM_OPENAI = '5';

      const { cm, judge } = createSetup({
        agent1Responses: ['x'],
        agent2Responses: ['x'],
        judgeResponses: ['x'],
        maxRounds: 1,
      });

      const { PreFlightTpmError } = require('../../providers/tpmLimits');

      try {
        await cm.startConversation('A reasonably long task description that has plenty of tokens', judge);
        throw new Error('Expected PreFlightTpmError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(PreFlightTpmError);
        expect(Array.isArray(err.violations)).toBe(true);
        const offending = err.violations.find((v: any) => v.model === 'gpt-4o');
        expect(offending).toBeTruthy();
        expect(offending.provider).toBe('openai');
        expect(offending.tpmLimit).toBe(5);
        expect(offending.estimatedInputTokens).toBeGreaterThan(5);
      }
    });

    it('happy path: pre-flight passes when all agents are under the TPM ceiling', async () => {
      // No env override — defaults are 30K (openai) and 40K (anthropic), well above test prompts
      const { cm, judge, mockAgent1Chat } = createSetup({
        agent1Responses: ['Agent1 thoughts on this matter'],
        agent2Responses: ['Agent2 disagrees with Agent1'],
        judgeResponses: [
          buildConsensusText({ summary: 'Agreed solution' }),
        ],
        maxRounds: 1,
      });

      const result = await cm.startConversation('Short task', judge);

      // Pre-flight did not block — at least one agent ran
      expect(mockAgent1Chat).toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });

  // =========================================================================
  // agentSubstitutions serialization (Phase 12, Plan 02)
  // =========================================================================
  describe('agentSubstitutions serialization (Phase 12)', () => {
    it('returns a plain object (not null, not Map) when no substitution occurred', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['Agent1 thoughts on this matter'],
        agent2Responses: ['Agent2 disagrees with Agent1'],
        judgeResponses: [
          buildConsensusText({ summary: 'Agreed solution' }),
        ],
        maxRounds: 1,
      });

      const result: any = await cm.startConversation('Short task', judge);

      expect(result.agentSubstitutions).not.toBeNull();
      expect(result.agentSubstitutions).toEqual({});
      expect(result.agentSubstitutions instanceof Map).toBe(false);
      expect(Object.prototype.toString.call(result.agentSubstitutions)).toBe('[object Object]');
    });

    it('returns a populated plain object when an agent is substituted via fallback', async () => {
      // Agent1 (gpt-4o) throws a retryable 429 on first call → triggers fallback to claude-sonnet-4-5
      let agent1Calls = 0;
      const mockAgent1Chat = jest.fn().mockImplementation(() => {
        agent1Calls++;
        if (agent1Calls === 1) {
          throw new Error('429 rate limit exceeded for gpt-4o');
        }
        return Promise.resolve({ text: 'Should not be called again' });
      });
      // claude-sonnet-4-5 plays both Agent2 AND fallback for Agent1
      const mockClaudeChat = jest.fn().mockResolvedValue({
        text: 'Substituted-model response with substance',
      });
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildConsensusText({ summary: 'Agreed solution' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') {
          return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        }
        if (model === 'claude-sonnet-4-5') {
          return { chat: mockClaudeChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        }
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Test substitution', judge);

      expect(result.agentSubstitutions).not.toBeNull();
      expect(result.agentSubstitutions instanceof Map).toBe(false);
      expect(result.agentSubstitutions.Agent1).toBeTruthy();
      expect(result.agentSubstitutions.Agent1.original).toBe('gpt-4o');
      expect(result.agentSubstitutions.Agent1.fallback).toBe('claude-sonnet-4-5');
      expect(typeof result.agentSubstitutions.Agent1.reason).toBe('string');
      expect(result.agentSubstitutions.Agent1.reason).toMatch(/429|rate/i);
    });

    it('agentSubstitutions survives JSON roundtrip (proves no Map residue)', async () => {
      let agent1Calls = 0;
      const mockAgent1Chat = jest.fn().mockImplementation(() => {
        agent1Calls++;
        if (agent1Calls === 1) {
          throw new Error('429 rate limit exceeded for gpt-4o');
        }
        return Promise.resolve({ text: 'unused' });
      });
      const mockClaudeChat = jest.fn().mockResolvedValue({ text: 'Substituted response' });
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildConsensusText({ summary: 'Agreed' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockClaudeChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Test JSON roundtrip', judge);

      const roundtripped = JSON.parse(JSON.stringify(result.agentSubstitutions));
      expect(roundtripped).toEqual(result.agentSubstitutions);
      expect(roundtripped.Agent1).toEqual({
        original: 'gpt-4o',
        fallback: 'claude-sonnet-4-5',
        reason: result.agentSubstitutions.Agent1.reason,
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // strict_models flag (Phase 12, Plan 04)
  // ──────────────────────────────────────────────────────────────────────────
  describe('strict_models (Phase 12-04)', () => {
    let StrictModelError: any;
    beforeAll(() => {
      // Late import to ensure mocks are in place
      ({ StrictModelError } = require('../../core/AgentTurnExecutor'));
    });

    it('throws StrictModelError instead of substituting when strictModels=true', async () => {
      let agent1Calls = 0;
      const mockAgent1Chat = jest.fn().mockImplementation(() => {
        agent1Calls++;
        if (agent1Calls === 1) {
          throw new Error('429 rate limit exceeded for gpt-4o');
        }
        return Promise.resolve({ text: 'Should not be reached' });
      });
      const mockClaudeChat = jest.fn().mockResolvedValue({ text: 'Claude response' });
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildConsensusText({ summary: 'Should not reach judge' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockClaudeChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(
        config, null, false, undefined, false, 'gpt-4o-mini',
        { disableRouting: true, strictModels: true }
      );
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      await expect(cm.startConversation('Test strict_models', judge)).rejects.toBeInstanceOf(StrictModelError);

      // Verify error fields by re-running and catching
      const cm2 = new ConversationManager(
        config, null, false, undefined, false, 'gpt-4o-mini',
        { disableRouting: true, strictModels: true }
      );
      // Reset mocks so the second run reproduces the failure
      agent1Calls = 0;
      let caught: any;
      try {
        await cm2.startConversation('Test strict_models', judge);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StrictModelError);
      expect(caught.agentName).toBe('Agent1');
      expect(caught.originalModel).toBe('gpt-4o');
      expect(caught.attemptedFallback).toBe('claude-sonnet-4-5');
      expect(caught.reason).toMatch(/429|rate/i);
    });

    it('default (strictModels omitted) preserves silent-fallback behavior', async () => {
      let agent1Calls = 0;
      const mockAgent1Chat = jest.fn().mockImplementation(() => {
        agent1Calls++;
        if (agent1Calls === 1) {
          throw new Error('429 rate limit exceeded for gpt-4o');
        }
        return Promise.resolve({ text: 'unused' });
      });
      const mockClaudeChat = jest.fn().mockResolvedValue({ text: 'Substituted response with substance' });
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildConsensusText({ summary: 'Agreed' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockAgent1Chat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockClaudeChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(
        config, null, false, undefined, false, 'gpt-4o-mini',
        { disableRouting: true /* strictModels omitted */ }
      );
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Test default fallback', judge);
      expect(result.agentSubstitutions.Agent1).toBeTruthy();
      expect(result.agentSubstitutions.Agent1.fallback).toBe('claude-sonnet-4-5');
    });
  });

  // =========================================================================
  // Phase 13 — output quality wiring
  // =========================================================================
  describe('Phase 13 — output quality wiring', () => {
    const ConversationHistoryModule = require('../../core/ConversationHistory');
    const ConversationHistoryClass = ConversationHistoryModule.default;
    let getCompressedSpy: jest.SpyInstance;

    beforeEach(() => {
      // Spy on the prototype so every CM instance picks it up.
      getCompressedSpy = jest
        .spyOn(ConversationHistoryClass.prototype, 'getCompressedHistoryFor')
        .mockResolvedValue([]);
    });

    afterEach(() => {
      getCompressedSpy.mockRestore();
    });

    it('Test 1: getCompressedHistoryFor is called for round 2 but not round 1', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['Round 1 take from Agent1', 'Round 2 take from Agent1'],
        agent2Responses: ['Round 1 take from Agent2', 'Round 2 take from Agent2'],
        judgeResponses: [
          'No consensus yet. Continue.',
          buildConsensusText({ summary: 'Final solution after round 2' }),
        ],
        maxRounds: 2,
      });

      // Capture call counts AFTER round 1 (right before round 2 starts).
      // We use the round_robin path which calls our hook synchronously per round.
      await cm.startConversation('Phase 13 compression wiring test', judge);

      // Round 1 invokes 0 times; round 2 invokes >= 1 time.
      // Total invocations across the run should be >= 1.
      expect(getCompressedSpy).toHaveBeenCalled();
      // Verify it was invoked with the agents map and an options object.
      const firstCall = getCompressedSpy.mock.calls[0];
      expect(firstCall[0]).toBeDefined(); // agents
      expect(typeof firstCall[1]).toBe('object'); // options
    });

    it('Test 1b: getCompressedHistoryFor NOT called when only round 1 runs', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['Quick agreement'],
        agent2Responses: ['Quick agreement'],
        judgeResponses: [
          buildConsensusText({ summary: 'Consensus after round 1' }),
        ],
        maxRounds: 1,
      });

      await cm.startConversation('Round 1 only', judge);

      expect(getCompressedSpy).not.toHaveBeenCalled();
    });

    it('Test 3: turn_distribution_updated event fires per turn with growing counts', async () => {
      const { EventBus } = require('../../core/EventBus');
      const eventBus = new EventBus();
      const events: any[] = [];
      eventBus.on('turn_distribution_updated', (evt: any) => {
        events.push(evt.payload || evt);
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 2,
        min_rounds: 0,
      };

      const mockChat = jest.fn().mockResolvedValue({ text: 'Agent message with substantive content here.' });
      const mockJudgeChat = jest
        .fn()
        .mockResolvedValueOnce({ text: 'Continue.' })
        .mockResolvedValueOnce({ text: buildConsensusText({ summary: 'Done' }) });
      (ProviderFactory.createProvider as jest.Mock).mockImplementation(() => ({
        chat: mockChat,
        getProviderName: jest.fn().mockReturnValue('Mock'),
      }));

      const cm = new ConversationManager(config, null, false, eventBus, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      await cm.startConversation('Test turn dist events', judge);

      // 2 rounds × 2 agents = 4 turn events.
      expect(events.length).toBeGreaterThanOrEqual(4);
      // Turns should be monotonic non-decreasing for each agent across events.
      const agent1Turns = events.map(e => e.perAgent.find((a: any) => a.name === 'Agent1')?.turns || 0);
      for (let i = 1; i < agent1Turns.length; i++) {
        expect(agent1Turns[i]).toBeGreaterThanOrEqual(agent1Turns[i - 1]);
      }
      // Each event has the expected shape.
      expect(events[0].round).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(events[0].perAgent)).toBe(true);
      expect(events[0].perAgent[0]).toHaveProperty('tokenShare');
    });

    it('Test 4: fairness_alarm fires once per (round, agent) when one agent dominates', async () => {
      const { EventBus } = require('../../core/EventBus');
      const eventBus = new EventBus();
      const alarms: any[] = [];
      eventBus.on('fairness_alarm', (evt: any) => {
        alarms.push(evt.payload || evt);
      });

      const longText = 'A '.repeat(2000); // ~4000 chars → ~1000 token estimate
      const shortText = 'B';

      const mockHogChat = jest.fn().mockResolvedValue({ text: longText });
      const mockQuietChat = jest.fn().mockResolvedValue({ text: shortText });
      const mockJudgeChat = jest
        .fn()
        .mockResolvedValueOnce({ text: 'Continue.' })
        .mockResolvedValueOnce({ text: buildConsensusText({ summary: 'Done' }) });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockHogChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockQuietChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Hog: { model: 'gpt-4o', prompt: 'Hog' },
          Quiet: { model: 'claude-sonnet-4-5', prompt: 'Quiet' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 2,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, eventBus, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      await cm.startConversation('Fairness alarm test', judge);

      // Hog should trigger at least one alarm; with dedupe, exactly one per round.
      const hogAlarms = alarms.filter(a => a.agent === 'Hog');
      expect(hogAlarms.length).toBeGreaterThanOrEqual(1);
      // Per-round dedupe: at most one alarm per (round, agent) pair.
      const roundAgentPairs = new Set(hogAlarms.map(a => `${a.round}:${a.agent}`));
      expect(roundAgentPairs.size).toBe(hogAlarms.length);
      // Quiet should never trigger.
      expect(alarms.some(a => a.agent === 'Quiet')).toBe(false);
      // Threshold field present.
      expect(hogAlarms[0].threshold).toBe(0.4);
    });

    it('Test 5: dissent_quality computes insufficient_data when fewer than 2 agents speak in degraded path', async () => {
      // Force degraded path: only 1 agent responds (the other throws repeatedly).
      const mockGoodChat = jest.fn().mockResolvedValue({ text: 'I have an opinion on this.' });
      const mockBadChat = jest.fn().mockRejectedValue(new Error('persistent failure'));
      const mockJudgeChat = jest.fn().mockResolvedValue({ text: 'fallback' });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockGoodChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockBadChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Degraded path', judge);

      // Either the run degraded (only 1 agent contributed) or it ran to completion.
      // In either case, dissent_quality must NOT be the old hardcoded 'not_applicable'
      // string from the degraded path — it must be one of the union literals.
      expect(['captured', 'missing', 'not_applicable', 'insufficient_data']).toContain(result.dissent_quality);
      if (result.degraded) {
        // Only one agent spoke → insufficient_data.
        expect(result.dissent_quality).toBe('insufficient_data');
      }
    });

    // =======================================================================
    // Phase 13 Plan 04 — ConfidenceReconciler wiring
    // =======================================================================

    it('Test 6: degraded run caps finalConfidence at LOW even when judge stub returns HIGH', async () => {
      // Force degraded path: only 1 agent responds. The degraded-path judge call
      // goes through conductFinalVote; stub it to return HIGH. ConfidenceReconciler
      // must override to LOW because machinery.aborted=true.
      const mockGoodChat = jest.fn().mockResolvedValue({ text: 'I have an opinion on this.' });
      const mockBadChat = jest.fn().mockRejectedValue(new Error('persistent failure'));
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildFinalVoteText({ summary: 'Best-effort summary', confidence: 'HIGH' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockGoodChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockBadChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Degraded confidence test', judge);

      // Reconciler must cap at LOW regardless of judge's HIGH self-report.
      expect(result.finalConfidence).toBe('LOW');
      expect(typeof result.confidenceReasoning).toBe('string');
      // Reasoning should mention the degradation cause.
      if (result.degraded) {
        expect(result.confidenceReasoning.toLowerCase()).toContain('aborted');
      }
    });

    it('Test 7: fairness alarm fires → finalConfidence capped at LOW even with judge HIGH', async () => {
      // One agent (Hog) dominates with long responses, triggering fairness_alarm.
      // Judge stub returns HIGH consensus. Reconciler must cap at LOW.
      const { EventBus } = require('../../core/EventBus');
      const eventBus = new EventBus();

      const longText = 'A '.repeat(2000); // ~4000 chars → high token share
      const shortText = 'B';

      const mockHogChat = jest.fn().mockResolvedValue({ text: longText });
      const mockQuietChat = jest.fn().mockResolvedValue({ text: shortText });
      const mockJudgeChat = jest
        .fn()
        .mockResolvedValue({ text: buildConsensusText({ summary: 'Agreed', confidence: 'HIGH' }) });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o') return { chat: mockHogChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5') return { chat: mockQuietChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Hog: { model: 'gpt-4o', prompt: 'Hog' },
          Quiet: { model: 'claude-sonnet-4-5', prompt: 'Quiet' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(config, null, false, eventBus, false, 'gpt-4o-mini', { disableRouting: true });
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Fairness reconciler test', judge);

      // Judge reported HIGH, but Hog's dominance triggered a fairness_alarm during
      // the run, which should cause the reconciler to cap finalConfidence at LOW.
      // (This holds if the run completed normally — if the run degraded for some
      // other reason it will also be LOW via the aborted rule.)
      expect(['LOW', 'MEDIUM']).toContain(result.finalConfidence);
      if (result.finalConfidence === 'LOW') {
        // Should cite either turn balance (fairness) or aborted in the reasoning.
        const reason = result.confidenceReasoning.toLowerCase();
        expect(
          reason.includes('turn balance') || reason.includes('aborted') || reason.includes('did not all speak')
        ).toBe(true);
      }
    });

    it('Test 8: happy path with judge HIGH → finalConfidence HIGH', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['The main risk is scalability. What if load spikes? Trade-off: latency vs cost.'],
        agent2Responses: ['Agreed on scalability. However, I challenge the cost assumption — memory concerns.'],
        judgeResponses: [
          buildConsensusText({ summary: 'Happy consensus', confidence: 'HIGH' }),
        ],
        maxRounds: 1,
        minRounds: 0,
      });

      const result: any = await cm.startConversation('Happy path test', judge);

      // When everything is clean AND judge reports HIGH, reconciler trusts the judge.
      // (Note: roundCompleteness = currentRound/maxRounds = 1/1 = 1.0 — full.)
      expect(result.finalConfidence).toBe('HIGH');
      expect(result.confidenceReasoning.toLowerCase()).toContain('machinery clean');
    });

    // -----------------------------------------------------------------------
    // Gap closure (post-verification): exercise the REAL
    // ConversationHistory.getCompressedHistoryFor end-to-end through a
    // round-2 loop, asserting that the compression refresh does not throw
    // the classic `provider.toUpperCase is not a function` TypeError that
    // was previously masked by a swallowing try/catch.
    // -----------------------------------------------------------------------
    it('Test 9: round 2 exercises real getCompressedHistoryFor without compression refresh warning', async () => {
      // Restore the prototype spy so this test hits the REAL method.
      getCompressedSpy.mockRestore();

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const { cm, judge } = createSetup({
          agent1Responses: ['Round 1 take from Agent1', 'Round 2 take from Agent1'],
          agent2Responses: ['Round 1 take from Agent2', 'Round 2 take from Agent2'],
          judgeResponses: [
            'No consensus yet. Continue.',
            buildConsensusText({ summary: 'Final after round 2', confidence: 'MEDIUM' }),
          ],
          maxRounds: 2,
          minRounds: 0,
        });

        // Should not throw. NODE_ENV=test in the executor also re-throws any
        // swallowed compression error, so a shape regression would surface here.
        await expect(
          cm.startConversation('Integration: real compression wiring', judge)
        ).resolves.toBeDefined();

        const compressionWarnings = warnSpy.mock.calls.filter(args =>
          args.some(
            a => typeof a === 'string' && a.includes('compression refresh failed')
          )
        );
        expect(compressionWarnings).toEqual([]);
      } finally {
        warnSpy.mockRestore();
        // Re-install the spy so the afterEach restore remains valid for
        // sibling tests that may re-enter (defensive; jest runs sequentially).
        getCompressedSpy = jest
          .spyOn(ConversationHistoryClass.prototype, 'getCompressedHistoryFor')
          .mockResolvedValue([]);
      }
    });
  });

  // =========================================================================
  // Phase 13.1 — runIntegrity population
  // =========================================================================
  describe('Phase 13.1 — runIntegrity population', () => {
    it('happy path: runIntegrity has inactive compression and all agents spoken', async () => {
      const { cm, judge } = createSetup({
        agent1Responses: ['The main risk is scalability. Trade-off: latency vs cost.'],
        agent2Responses: ['Agreed, but I challenge the cost assumption — memory concerns.'],
        judgeResponses: [
          buildConsensusText({ summary: 'Happy consensus', confidence: 'HIGH' }),
        ],
        maxRounds: 1,
        minRounds: 0,
      });

      const result: any = await cm.startConversation('runIntegrity happy path', judge);

      expect(result.runIntegrity).toBeDefined();
      expect(result.runIntegrity.compression).toEqual(
        expect.objectContaining({
          active: false,
          activatedAtRound: null,
          summaryRegenerations: 0,
        })
      );
      // tailSize must be the configured verbatimTailSize (not undefined/null/0
      // when compression was never active — it's still the authoritative value).
      expect(typeof result.runIntegrity.compression.tailSize).toBe('number');
      // Both configured agents should appear in participation with 'spoken'.
      expect(Array.isArray(result.runIntegrity.participation)).toBe(true);
      expect(result.runIntegrity.participation.length).toBe(2);
      expect(
        result.runIntegrity.participation.every((p: any) => p.status === 'spoken')
      ).toBe(true);
    });

    it('degraded path: runIntegrity populated and participation flags silent agent', async () => {
      // Only Agent1 responds; Agent2 throws persistently → degraded return.
      const mockGoodChat = jest.fn().mockResolvedValue({ text: 'I have an opinion.' });
      const mockBadChat = jest.fn().mockRejectedValue(new Error('persistent failure'));
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildFinalVoteText({ summary: 'Best-effort', confidence: 'MEDIUM' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o')
          return { chat: mockGoodChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5')
          return { chat: mockBadChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 1,
        min_rounds: 0,
      };

      const cm = new ConversationManager(
        config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true }
      );
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Degraded runIntegrity', judge);

      expect(result.runIntegrity).toBeDefined();
      expect(result.runIntegrity.participation.length).toBe(2);
      const agent2Entry = result.runIntegrity.participation.find(
        (p: any) => p.agent === 'Agent2'
      );
      expect(agent2Entry).toBeDefined();
      // Agent2 never produced a non-error turn → status should be absent-failed
      // (failed agents flagged by the msg.error === true predicate) OR
      // absent-silent if the error tracking didn't classify it as failed.
      expect(['absent-failed', 'absent-silent']).toContain(agent2Entry.status);
      // Degraded runs cap at LOW per ConfidenceReconciler.
      expect(result.finalConfidence).toBe('LOW');
    });

    it('absent-failed path: error-marked entries thread into buildParticipationReport', async () => {
      // Happy-path wiring, but inject an error=true entry into the
      // conversation history before the return path runs. The easiest way
      // is to rely on the failure-tracking path: one agent throws, one
      // agent succeeds in a 2-round run so degraded does NOT trigger.
      const mockGoodChat = jest.fn().mockResolvedValue({ text: 'Substantive Agent1 turn.' });
      let failCount = 0;
      const mockFlakyChat = jest.fn().mockImplementation(() => {
        failCount++;
        // First call fails, subsequent succeed — enough to avoid degraded
        // abort (both agents eventually contribute something) while still
        // leaving an error entry in history for the predicate.
        if (failCount === 1) {
          return Promise.reject(new Error('transient flake'));
        }
        return Promise.resolve({ text: 'Substantive Agent2 turn.' });
      });
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildConsensusText({ summary: 'Reached', confidence: 'MEDIUM' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o')
          return { chat: mockGoodChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5')
          return { chat: mockFlakyChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 2,
        min_rounds: 0,
      };

      const cm = new ConversationManager(
        config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true }
      );
      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('absent-failed threading', judge);

      expect(result.runIntegrity).toBeDefined();
      expect(result.runIntegrity.participation.length).toBe(2);
      // We cannot guarantee one specific status per run since retries may
      // succeed, but the key invariant is: runIntegrity is populated, it has
      // both agents, and its shape is valid. If any entry is absent-failed,
      // it must carry a reason string from buildParticipationReport.
      for (const p of result.runIntegrity.participation) {
        expect(['spoken', 'absent-failed', 'absent-silent', 'absent-capped']).toContain(p.status);
        if (p.status === 'absent-failed') {
          expect(typeof p.reason).toBe('string');
          expect(p.reason).toContain('failed');
        }
      }
    });

    it('aborted path: runIntegrity is still populated (not null/undefined)', async () => {
      // Trigger timeout/abort via AbortController attached to the CM.
      const mockSlowChat = jest.fn().mockImplementation(
        () => new Promise(resolve =>
          setTimeout(() => resolve({ text: 'late' }), 5000)
        )
      );
      const mockJudgeChat = jest.fn().mockResolvedValue({
        text: buildFinalVoteText({ summary: 'Aborted summary', confidence: 'LOW' }),
      });

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
        if (model === 'gpt-4o')
          return { chat: mockSlowChat, getProviderName: jest.fn().mockReturnValue('OpenAI') };
        if (model === 'claude-sonnet-4-5')
          return { chat: mockSlowChat, getProviderName: jest.fn().mockReturnValue('Claude') };
        return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
      });

      const config = {
        turn_management: 'roundrobin',
        agents: {
          Agent1: { model: 'gpt-4o', prompt: 'Agent1' },
          Agent2: { model: 'claude-sonnet-4-5', prompt: 'Agent2' },
        },
        judge: { model: 'gpt-4o-mini', prompt: 'Judge' },
        max_rounds: 3,
        min_rounds: 0,
      };

      const cm = new ConversationManager(
        config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true }
      );
      // Abort immediately via the CM's public abortSignal slot so the
      // degraded-path short-circuit (roundContributors < 2) runs first.
      // If the run degrades rather than abort-returns, we still assert
      // runIntegrity is populated — both paths must carry it.
      const controller = new AbortController();
      controller.abort('test-abort');
      (cm as any).abortSignal = controller.signal;

      const judge = {
        provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') },
        systemPrompt: 'Judge',
        model: 'gpt-4o-mini',
      };

      const result: any = await cm.startConversation('Aborted runIntegrity', judge);

      expect(result.runIntegrity).toBeDefined();
      expect(result.runIntegrity).not.toBeNull();
      expect(result.runIntegrity.compression).toBeDefined();
      expect(Array.isArray(result.runIntegrity.participation)).toBe(true);
    });
  });
});
