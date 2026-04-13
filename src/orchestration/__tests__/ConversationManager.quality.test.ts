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
});
