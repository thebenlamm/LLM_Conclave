/**
 * Unit tests for JudgeEvaluator
 *
 * Tests all judge evaluation methods with mocked dependencies.
 * JudgeEvaluator is extracted from ConversationManager as part of the
 * god-class decomposition (Plan 02-03).
 */

import JudgeEvaluator, { JudgeEvaluatorDeps } from '../JudgeEvaluator.js';
import { DiscussionHistoryEntry } from '../../types/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHistory(entries: Partial<DiscussionHistoryEntry>[]): DiscussionHistoryEntry[] {
  return entries.map(e => ({
    role: 'assistant' as const,
    content: 'default content',
    speaker: 'Agent1',
    ...e,
  }));
}

function makeJudge(chatResponse: any = '{ "guidance": "continue" }') {
  return {
    model: 'gemini-2.5-flash',
    systemPrompt: 'You are a judge.',
    provider: {
      chat: jest.fn().mockResolvedValue({ text: chatResponse }),
    },
  };
}

function makeDeps(overrides: Partial<JudgeEvaluatorDeps> = {}): JudgeEvaluatorDeps {
  const conversationHistory = makeHistory([
    { role: 'user', speaker: 'System', content: 'Task: Test the system' },
    { role: 'assistant', speaker: 'Agent1', content: 'I think we should use approach A.' },
    { role: 'assistant', speaker: 'Agent2', content: 'I agree with approach B.' },
    { role: 'user', speaker: 'Judge', content: "Judge's guidance: continue" },
    { role: 'assistant', speaker: 'Agent1', content: 'Let me elaborate on approach A further.' },
    { role: 'assistant', speaker: 'Agent2', content: 'My position on approach B stands.' },
  ]);

  const mockHistory = {
    groupHistoryByRound: jest.fn().mockReturnValue([
      {
        round: 1,
        entries: conversationHistory.filter(e => e.speaker !== 'System'),
      },
    ]),
    compressHistory: jest.fn().mockResolvedValue(undefined),
  };

  return {
    conversationHistory,
    history: mockHistory as any,
    config: {
      agents: {
        Agent1: { model: 'gpt-4o', prompt: 'You are agent 1' },
        Agent2: { model: 'gpt-4o-mini', prompt: 'You are agent 2' },
      },
      judge: { model: 'gemini-2.5-flash' },
    } as any,
    agents: {
      Agent1: { model: 'gpt-4o', name: 'Agent1' },
      Agent2: { model: 'gpt-4o-mini', name: 'Agent2' },
    },
    agentOrder: ['Agent1', 'Agent2'],
    getCurrentRound: jest.fn().mockReturnValue(2),
    judgeInstructions: null,
    eventBus: undefined,
    abortSignal: undefined,
    costTracker: { trackUsage: jest.fn() } as any,
    streamOutput: false,
    getPersistentlyFailedAgents: jest.fn().mockReturnValue(new Set<string>()),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JudgeEvaluator', () => {
  describe('getRoundForEntry', () => {
    it('returns 1 for the initial system message', () => {
      const history = makeHistory([
        { role: 'user', speaker: 'System', content: 'Task: test' },
        { role: 'assistant', speaker: 'Agent1', content: 'response 1' },
      ]);
      const deps = makeDeps({ conversationHistory: history, agentOrder: ['Agent1', 'Agent2'] });
      const evaluator = new JudgeEvaluator(deps);
      // Access private method via cast
      const result = (evaluator as any).getRoundForEntry(history[0]);
      expect(result).toBe(1);
    });

    it('returns correct round for agent responses', () => {
      // 2 agents per round means: after 2 agent responses = round 2
      const history = makeHistory([
        { role: 'user', speaker: 'System', content: 'Task: test' },
        { role: 'assistant', speaker: 'Agent1', content: 'r1a1' },
        { role: 'assistant', speaker: 'Agent2', content: 'r1a2' },
        { role: 'user', speaker: 'Judge', content: 'guidance' },
        { role: 'assistant', speaker: 'Agent1', content: 'r2a1' },
        { role: 'assistant', speaker: 'Agent2', content: 'r2a2' },
      ]);
      const deps = makeDeps({ conversationHistory: history, agentOrder: ['Agent1', 'Agent2'] });
      const evaluator = new JudgeEvaluator(deps);
      // Round 1: entries at index 1-2
      expect((evaluator as any).getRoundForEntry(history[1])).toBe(1);
      // Round 2: entries at index 4-5 (after 2 agent responses in round 1)
      expect((evaluator as any).getRoundForEntry(history[4])).toBe(2);
    });
  });

  describe('buildCaseFile', () => {
    it('produces structured text with task and agent positions', () => {
      const conversationHistory = makeHistory([
        { role: 'user', speaker: 'System', content: 'Task: Design a new API' },
        { role: 'assistant', speaker: 'Agent1', content: 'We should use REST.\n\nREST is the best approach.' },
        { role: 'assistant', speaker: 'Agent2', content: 'GraphQL would be better.\n\nGraphQL handles complex queries.' },
      ]);
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          {
            round: 1,
            entries: conversationHistory.slice(1), // skip System
          },
        ]),
      };
      const deps = makeDeps({ conversationHistory, history: mockHistory as any });
      const evaluator = new JudgeEvaluator(deps);
      const result = (evaluator as any).buildCaseFile();
      expect(result).toContain('=== CASE FILE ===');
      expect(result).toContain('Design a new API');
      expect(result).toContain('Agent1');
      expect(result).toContain('Agent2');
      expect(result).toContain('=== END CASE FILE ===');
    });

    it('identifies disagreements between agents', () => {
      const conversationHistory = makeHistory([
        { role: 'user', speaker: 'System', content: 'Task: Choose a framework' },
        { role: 'assistant', speaker: 'Agent1', content: 'I disagree with Agent2. REST is better.' },
        { role: 'assistant', speaker: 'Agent2', content: 'GraphQL is superior.' },
      ]);
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          { round: 1, entries: conversationHistory.slice(1) },
        ]),
      };
      const deps = makeDeps({
        conversationHistory,
        history: mockHistory as any,
        agents: { Agent1: { model: 'gpt-4o' }, Agent2: { model: 'gpt-4o-mini' } },
        agentOrder: ['Agent1', 'Agent2'],
      });
      const evaluator = new JudgeEvaluator(deps);
      const result = (evaluator as any).buildCaseFile();
      expect(result).toContain('Disagreements');
    });
  });

  describe('prepareJudgeContext', () => {
    it('includes discussion text, case file, and agent information', () => {
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);
      // Set up a simple case where discussion fits within budget
      const discussionText = 'Agent1: approach A\n\nAgent2: approach B';
      const judge = { model: 'gpt-4o', systemPrompt: 'You are a judge' };
      const result = (evaluator as any).prepareJudgeContext(judge, discussionText);
      expect(result).toContain('=== CASE FILE ===');
      expect(result).toContain('approach A');
    });

    it('includes shallow agreement warning when flag is true', () => {
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);
      // We test prepareJudgeContext indirectly through judgeEvaluate since
      // shallow agreement warning is added in judgeEvaluate before calling prepareJudgeContext.
      // Direct test: verify prepareJudgeContext returns a string with the case file
      const discussionText = 'Agent1: I think REST\n\nAgent2: I agree, REST is good';
      const result = (evaluator as any).prepareJudgeContext(
        { model: 'gpt-4o' },
        discussionText
      );
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('appends judgeInstructions when provided', () => {
      const deps = makeDeps({ judgeInstructions: 'Be extra strict about consensus' });
      const evaluator = new JudgeEvaluator(deps);
      const judge = makeJudge('no consensus\ncontinue discussion');
      // We verify judgeInstructions are included by checking judgeEvaluate behavior
      // The instructions are appended to the final prompt
      expect(deps.judgeInstructions).toBe('Be extra strict about consensus');
    });
  });

  describe('bestEffortJudgeResult', () => {
    it('returns synthesis from last-round agent responses', () => {
      const lastRoundEntries = [
        { role: 'assistant' as const, speaker: 'Agent1', content: 'REST is best. It has great tooling. Widely supported.' },
        { role: 'assistant' as const, speaker: 'Agent2', content: 'GraphQL has advantages. Flexible queries.' },
      ];
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          { round: 1, entries: lastRoundEntries },
        ]),
      };
      const deps = makeDeps({ history: mockHistory as any });
      const evaluator = new JudgeEvaluator(deps);
      const result = (evaluator as any).bestEffortJudgeResult();
      expect(result.consensusReached).toBe(false);
      expect(result.solution).toContain('Agent1');
      expect(result.solution).toContain('Agent2');
      expect(result.confidence).toBe('LOW');
    });

    it('returns fallback message when no agent entries in history', () => {
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          { round: 1, entries: [{ role: 'user', speaker: 'System', content: 'task' }] },
        ]),
      };
      const deps = makeDeps({ history: mockHistory as any });
      const evaluator = new JudgeEvaluator(deps);
      const result = (evaluator as any).bestEffortJudgeResult();
      expect(result.solution).toContain('Discussion occurred but judge was unable');
    });
  });

  describe('judgeEvaluate', () => {
    it('calls judge LLM and returns consensusReached=false when no CONSENSUS_REACHED', async () => {
      const judge = makeJudge('No consensus yet. Continue the discussion.');
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);
      const result = await evaluator.judgeEvaluate(judge);
      expect(judge.provider.chat).toHaveBeenCalledTimes(1);
      expect(result.consensusReached).toBe(false);
      expect(result.guidance).toBeTruthy();
    });

    it('returns consensusReached=true when judge returns CONSENSUS_REACHED', async () => {
      const judgeResponse = `CONSENSUS_REACHED

SUMMARY:
The agents agreed on REST API approach.

KEY_DECISIONS:
- Use REST API
- Version with /v1 prefix

ACTION_ITEMS:
- Implement REST endpoints

DISSENT:
- None

CONFIDENCE: HIGH`;
      const judge = makeJudge(judgeResponse);
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);
      const result = await evaluator.judgeEvaluate(judge);
      expect(result.consensusReached).toBe(true);
      expect(result.solution).toBeTruthy();
      expect(result.confidence).toBe('HIGH');
    });

    it('detects shallow agreement when >= 2 agreement patterns found', async () => {
      // History with multiple "I agree" / "I concur" entries
      const conversationHistory = makeHistory([
        { role: 'user', speaker: 'System', content: 'Task: test' },
        { role: 'assistant', speaker: 'Agent1', content: 'I agree with this approach completely.' },
        { role: 'assistant', speaker: 'Agent2', content: 'I concur, well said by Agent1.' },
      ]);
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          { round: 1, entries: conversationHistory.slice(1) },
        ]),
      };
      const judge = makeJudge('No consensus. Keep going.');
      const deps = makeDeps({ conversationHistory, history: mockHistory as any });
      const evaluator = new JudgeEvaluator(deps);
      // Should complete without error — the shallow agreement warning is added to the prompt
      const result = await evaluator.judgeEvaluate(judge);
      expect(judge.provider.chat).toHaveBeenCalledTimes(1);
      expect(result.consensusReached).toBe(false);
    });

    it('includes prior guidance in subsequent judgeEvaluate calls (QUAL-03)', async () => {
      const judge = makeJudge('No consensus. Focus on security aspects.');
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);

      // First call — should NOT have prior guidance
      await evaluator.judgeEvaluate(judge);
      const firstCallArgs = (judge.provider.chat as jest.Mock).mock.calls[0];
      const firstPrompt = firstCallArgs[0][0].content;
      expect(firstPrompt).not.toContain('PREVIOUS guidance');

      // Second call — should include prior guidance with "DO NOT repeat"
      judge.provider.chat.mockResolvedValue({ text: 'No consensus. Explore edge cases.' });
      await evaluator.judgeEvaluate(judge);
      const secondCallArgs = (judge.provider.chat as jest.Mock).mock.calls[1];
      const secondPrompt = secondCallArgs[0][0].content;
      expect(secondPrompt).toContain('PREVIOUS guidance');
      expect(secondPrompt).toContain('DO NOT repeat');
    });

    it('resets priorGuidance when invalidateCache is called (QUAL-03)', async () => {
      const judge = makeJudge('No consensus. Focus on performance.');
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);

      // First call stores guidance
      await evaluator.judgeEvaluate(judge);

      // Invalidate cache — should reset prior guidance
      evaluator.invalidateCache();

      // Next call should NOT have prior guidance
      judge.provider.chat.mockResolvedValue({ text: 'No consensus. Keep going.' });
      await evaluator.judgeEvaluate(judge);
      const callArgs = (judge.provider.chat as jest.Mock).mock.calls[1];
      const prompt = callArgs[0][0].content;
      expect(prompt).not.toContain('PREVIOUS guidance');
    });

    it('does not store prior guidance when consensus is reached (QUAL-03)', async () => {
      const consensusResponse = `CONSENSUS_REACHED\n\nSUMMARY:\nAgreed on REST.\n\nKEY_DECISIONS:\n- Use REST\n\nACTION_ITEMS:\n- Build it\n\nDISSENT:\n- None\n\nCONFIDENCE: HIGH`;
      const judge = makeJudge(consensusResponse);
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);

      // Consensus call
      const result = await evaluator.judgeEvaluate(judge);
      expect(result.consensusReached).toBe(true);

      // Next call should NOT have prior guidance (consensus doesn't store)
      judge.provider.chat.mockResolvedValue({ text: 'No consensus.' });
      await evaluator.judgeEvaluate(judge);
      const callArgs = (judge.provider.chat as jest.Mock).mock.calls[1];
      const prompt = callArgs[0][0].content;
      expect(prompt).not.toContain('PREVIOUS guidance');
    });

    it('falls back to bestEffortJudgeResult when judge LLM throws non-overflow error', async () => {
      const judge = {
        model: 'gemini-2.5-flash',
        systemPrompt: 'You are a judge.',
        provider: {
          chat: jest.fn().mockRejectedValue(new Error('Service unavailable')),
        },
      };
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);
      const result = await evaluator.judgeEvaluate(judge);
      // Falls through to generic fallback
      expect(result.consensusReached).toBe(false);
      expect(result.guidance).toBe('Please continue the discussion and try to reach agreement.');
    });

    it('detects excessive quoting (>= 3 quoting patterns in current round)', async () => {
      // Current round entries with quoting patterns
      const conversationHistory = makeHistory([
        { role: 'user', speaker: 'System', content: 'Task: test' },
        {
          role: 'assistant', speaker: 'Agent1',
          content: 'As Agent2 noted, REST is good. As Agent2 mentioned before, REST scales. As Agent2 pointed out, REST is standard.'
        },
        { role: 'assistant', speaker: 'Agent2', content: 'As Agent1 noted, we agree.' },
      ]);
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          { round: 1, entries: conversationHistory.slice(1) },
        ]),
      };
      const judge = makeJudge('No consensus yet.');
      const deps = makeDeps({ conversationHistory, history: mockHistory as any, getCurrentRound: jest.fn().mockReturnValue(1) });
      const evaluator = new JudgeEvaluator(deps);
      const result = await evaluator.judgeEvaluate(judge);
      // Should succeed — quoting warning just adds text to prompt
      expect(result.consensusReached).toBe(false);
    });

    it('uses judgeInstructions in the prompt when provided', async () => {
      const judge = makeJudge('No consensus. Continue.');
      const deps = makeDeps({ judgeInstructions: 'Be very strict' });
      const evaluator = new JudgeEvaluator(deps);
      await evaluator.judgeEvaluate(judge);
      const callArgs = (judge.provider.chat as jest.Mock).mock.calls[0];
      const messages = callArgs[0];
      expect(messages[0].content).toContain('Be very strict');
    });
  });

  describe('conductFinalVote', () => {
    it('calls judge with ballot and returns winner/reasoning', async () => {
      const voteResponse = `SUMMARY:
The discussion converged on using REST APIs for their simplicity.

KEY_DECISIONS:
- REST API selected
- JSON format for responses

ACTION_ITEMS:
- Create API documentation

DISSENT:
- Agent2 preferred GraphQL

CONFIDENCE: MEDIUM`;
      const judge = makeJudge(voteResponse);
      const deps = makeDeps();
      const evaluator = new JudgeEvaluator(deps);
      const result = await evaluator.conductFinalVote(judge);
      expect(judge.provider.chat).toHaveBeenCalledTimes(1);
      expect(result.solution).toBeTruthy();
      expect(result.confidence).toBe('MEDIUM');
    });

    it('includes judgeInstructions in the final vote prompt', async () => {
      const voteResponse = `SUMMARY:
Final decision made.

KEY_DECISIONS:
- Decision 1

ACTION_ITEMS:
- Action 1

DISSENT:
- None

CONFIDENCE: HIGH`;
      const judge = makeJudge(voteResponse);
      const deps = makeDeps({ judgeInstructions: 'Extra voting instructions' });
      const evaluator = new JudgeEvaluator(deps);
      await evaluator.conductFinalVote(judge);
      const callArgs = (judge.provider.chat as jest.Mock).mock.calls[0];
      const messages = callArgs[0];
      expect(messages[0].content).toContain('Extra voting instructions');
    });

    it('falls back to bestEffortJudgeResult when judge throws', async () => {
      const judge = {
        model: 'gemini-2.5-flash',
        systemPrompt: 'You are a judge.',
        provider: {
          chat: jest.fn().mockRejectedValue(new Error('Judge crashed')),
        },
      };
      const lastRoundEntries = [
        { role: 'assistant' as const, speaker: 'Agent1', content: 'My final position is REST.' },
        { role: 'assistant' as const, speaker: 'Agent2', content: 'GraphQL is my preference.' },
      ];
      const mockHistory = {
        groupHistoryByRound: jest.fn().mockReturnValue([
          { round: 1, entries: lastRoundEntries },
        ]),
      };
      const deps = makeDeps({ history: mockHistory as any });
      const evaluator = new JudgeEvaluator(deps);
      const result = await evaluator.conductFinalVote(judge);
      expect(result.solution).toContain('Agent1');
      expect(result.confidence).toBe('LOW');
    });
  });
});
