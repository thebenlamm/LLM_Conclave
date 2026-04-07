/**
 * Tests for ContinuationHandler — covers INTEG-01 through INTEG-04.
 *
 * INTEG-01: Speaker attribution loss (speaker field dropped on new entries)
 * INTEG-02: Content contamination from wrong speaker prefixes
 * INTEG-03: Orphan judge guidance leaking into continuations
 * INTEG-04: Duplicate task prompt injection
 */
import ContinuationHandler from '../ContinuationHandler.js';
import { SessionMessage, SessionManifest } from '../../types/index.js';

/**
 * Build a realistic SessionMessage[] mimicking a 2-round discussion
 * with agent entries, judge guidance, and system task.
 */
function makeSessionHistory(): SessionMessage[] {
  return [
    // Round 1: task
    {
      role: 'user',
      content: 'Task: Discuss the merits of functional programming',
      speaker: 'System',
      timestamp: '2026-04-01T00:00:00Z',
      roundNumber: 1,
    },
    // Round 1: agent responses
    {
      role: 'assistant',
      content: 'Functional programming emphasizes immutability...',
      speaker: 'AgentAlpha',
      model: 'gpt-4o',
      timestamp: '2026-04-01T00:01:00Z',
      roundNumber: 1,
    },
    {
      role: 'assistant',
      content: 'I agree with the benefits of pure functions...',
      speaker: 'AgentBeta',
      model: 'claude-sonnet-4-20250514',
      timestamp: '2026-04-01T00:02:00Z',
      roundNumber: 1,
    },
    // Round 1: judge guidance
    {
      role: 'user',
      content: 'Judge evaluation: Both agents provided solid initial points. Please explore practical trade-offs.',
      speaker: 'Judge',
      timestamp: '2026-04-01T00:03:00Z',
      roundNumber: 1,
    },
    // Round 2: agent responses
    {
      role: 'assistant',
      content: 'The practical trade-off is debugging complexity...',
      speaker: 'AgentAlpha',
      model: 'gpt-4o',
      timestamp: '2026-04-01T00:04:00Z',
      roundNumber: 2,
    },
    {
      role: 'assistant',
      content: 'Performance overhead in deeply recursive FP patterns...',
      speaker: 'AgentBeta',
      model: 'claude-sonnet-4-20250514',
      timestamp: '2026-04-01T00:05:00Z',
      roundNumber: 2,
    },
    // Round 2: judge guidance
    {
      role: 'user',
      content: 'Judge evaluation: Good exploration of trade-offs. Converging on practical recommendations.',
      speaker: 'Judge',
      timestamp: '2026-04-01T00:06:00Z',
      roundNumber: 2,
    },
  ];
}

/**
 * Build a minimal SessionManifest for prepareForContinuation tests.
 */
function makeSession(history?: SessionMessage[]): SessionManifest {
  return {
    id: 'session-test-001',
    timestamp: '2026-04-01T00:00:00Z',
    mode: 'consensus',
    task: 'Discuss the merits of functional programming',
    status: 'completed',
    agents: [
      { name: 'AgentAlpha', model: 'gpt-4o', provider: 'openai', systemPrompt: 'You are AgentAlpha' },
      { name: 'AgentBeta', model: 'claude-sonnet-4-20250514', provider: 'anthropic', systemPrompt: 'You are AgentBeta' },
    ],
    judge: { name: 'Judge', model: 'gemini-2.5-flash', provider: 'gemini', systemPrompt: 'You are a judge' },
    conversationHistory: history || makeSessionHistory(),
    currentRound: 2,
    maxRounds: 4,
    finalSolution: 'FP offers clarity and safety but requires pragmatic trade-offs for performance-critical paths.',
    cost: { totalCost: 0, totalTokens: { input: 0, output: 0 }, totalCalls: 0 },
    outputFiles: { transcript: 'test.log', json: 'test.json' },
  } as SessionManifest;
}

describe('ContinuationHandler', () => {
  let handler: ContinuationHandler;

  beforeEach(() => {
    handler = new ContinuationHandler();
  });

  describe('INTEG-01/02: Speaker attribution preservation', () => {
    it('preserves speaker field on existing history entries through mergeContinuationContext', () => {
      const history = makeSessionHistory();
      const result = handler.mergeContinuationContext(
        history,
        'Follow up on performance trade-offs',
        'Discuss the merits of functional programming',
        'FP offers clarity...'
      );

      // All original assistant entries must keep their speaker names
      const assistantEntries = result.filter(m => m.role === 'assistant');
      expect(assistantEntries).toHaveLength(4); // 2 per round
      expect(assistantEntries[0].speaker).toBe('AgentAlpha');
      expect(assistantEntries[1].speaker).toBe('AgentBeta');
      expect(assistantEntries[2].speaker).toBe('AgentAlpha');
      expect(assistantEntries[3].speaker).toBe('AgentBeta');
    });

    it('sets speaker="System" on continuation marker created by mergeContinuationContext', () => {
      const history = makeSessionHistory();
      const result = handler.mergeContinuationContext(
        history,
        'Follow up question',
        'Original task',
      );

      // The continuation marker is the second-to-last entry
      const marker = result[result.length - 2];
      expect(marker.content).toContain('[CONTINUATION FROM PREVIOUS SESSION]');
      expect(marker.speaker).toBe('System');
    });

    it('sets speaker="System" on user message created by mergeContinuationContext', () => {
      const history = makeSessionHistory();
      const result = handler.mergeContinuationContext(
        history,
        'Follow up question',
        'Original task',
      );

      // The user message is the last entry
      const userMsg = result[result.length - 1];
      expect(userMsg.role).toBe('user');
      expect(userMsg.speaker).toBe('System');
    });
  });

  describe('INTEG-03: Orphan judge guidance filtering', () => {
    it('filters out judge guidance entries from continuation context', () => {
      const history = makeSessionHistory();
      const result = handler.mergeContinuationContext(
        history,
        'Follow up question',
        'Original task',
      );

      // No judge entries should survive
      const judgeEntries = result.filter(m => m.speaker === 'Judge');
      expect(judgeEntries).toHaveLength(0);
    });

    it('keeps non-judge user entries (speaker="System")', () => {
      const history = makeSessionHistory();
      const result = handler.mergeContinuationContext(
        history,
        'Follow up question',
        'Original task',
      );

      // The original System task entry must remain
      const systemUserEntries = result.filter(
        m => m.role === 'user' && m.speaker === 'System'
      );
      // At least the original task + the new continuation user message
      expect(systemUserEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('filters judge entries in compressHistory path (includeFullHistory=false)', () => {
      const session = makeSession();
      const result = handler.prepareForContinuation(session, 'Follow up', {
        includeFullHistory: false,
      });

      const judgeEntries = result.mergedHistory.filter(m => m.speaker === 'Judge');
      expect(judgeEntries).toHaveLength(0);
    });
  });

  describe('INTEG-04: Duplicate task prompt', () => {
    it('does not produce duplicate continuation prompt in prepareForContinuation', () => {
      const session = makeSession();
      const followUp = 'Follow up on performance trade-offs';

      const result = handler.prepareForContinuation(session, followUp, {
        includeFullHistory: true,
      });

      // The continuation prompt text should appear exactly once in mergedHistory
      const promptOccurrences = result.mergedHistory.filter(
        m => m.content.includes('NEW FOLLOW-UP QUESTION/TASK:')
      );
      expect(promptOccurrences).toHaveLength(1);
    });
  });

  describe('prepareForContinuation resetDiscussion=true', () => {
    it('preserves summary but has no orphan judge entries', () => {
      const session = makeSession();
      const result = handler.prepareForContinuation(session, 'New direction', {
        resetDiscussion: true,
      });

      // Should have a summary message
      expect(result.mergedHistory.some(m => m.content.includes('Previous session context'))).toBe(true);

      // No judge entries
      const judgeEntries = result.mergedHistory.filter(m => m.speaker === 'Judge');
      expect(judgeEntries).toHaveLength(0);
    });
  });

  describe('compressHistory speaker on summaryMarker', () => {
    it('sets speaker="System" on summary marker in compressed history', () => {
      const session = makeSession();
      const result = handler.prepareForContinuation(session, 'Follow up', {
        includeFullHistory: false,
      });

      // Find the summary marker
      const summaryMarker = result.mergedHistory.find(
        m => m.content.includes('messages summarized')
      );
      expect(summaryMarker).toBeDefined();
      expect(summaryMarker!.speaker).toBe('System');
    });
  });
});
