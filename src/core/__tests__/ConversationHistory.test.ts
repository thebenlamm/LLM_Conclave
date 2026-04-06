import ConversationHistory from '../ConversationHistory';
import { DiscussionHistoryEntry } from '../../types/index';

// Mock ContextOptimizer
jest.mock('../../utils/ContextOptimizer', () => ({
  ContextOptimizer: {
    compressEntryForAgent: jest.fn((entry: any) => entry.positionSummary || entry.content),
    getCompressionTier: jest.fn().mockReturnValue('position'),
    compressRound: jest.fn().mockReturnValue('[round summary]'),
  },
}));

// Mock TokenCounter
jest.mock('../../utils/TokenCounter', () => ({
  __esModule: true,
  default: {
    estimateMessagesTokens: jest.fn().mockReturnValue(500),
    getModelLimits: jest.fn().mockReturnValue({ maxInput: 128000, maxOutput: 4096 }),
    truncateMessages: jest.fn().mockImplementation((msgs: any) => ({ messages: msgs, truncated: false })),
    summarizeWithLLM: jest.fn().mockResolvedValue('[llm compressed summary]'),
  },
}));

import TokenCounter from '../../utils/TokenCounter';

// Helper to create a ConversationHistory for testing
function createHistory(
  entries: DiscussionHistoryEntry[] = [],
  overrides: {
    currentRound?: number;
    config?: any;
    agents?: Record<string, any>;
    taskRouter?: any;
  } = {}
): ConversationHistory {
  const config = overrides.config ?? {
    turn_management: 'roundrobin',
    max_rounds: 5,
    agents: {
      Agent1: { model: 'gpt-4o', prompt: 'You are Agent1' },
      Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2' },
    },
    judge: { model: 'gpt-4o', prompt: 'You are the judge' },
  };

  const agents = overrides.agents ?? {
    Agent1: { model: 'gpt-4o', prompt: 'You are Agent1', systemPrompt: 'You are Agent1' },
    Agent2: { model: 'claude-sonnet-4-5', prompt: 'You are Agent2', systemPrompt: 'You are Agent2' },
  };

  return new ConversationHistory(
    entries,
    config,
    () => overrides.currentRound ?? 1,
    () => new Map(),
    () => agents,
    () => overrides.taskRouter ?? null,
    () => {} // onCacheInvalidated no-op
  );
}

describe('ConversationHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TokenCounter.estimateMessagesTokens as jest.Mock).mockReturnValue(500);
  });

  // ──────────────────────────────────────────────
  // groupHistoryByRound
  // ──────────────────────────────────────────────

  describe('groupHistoryByRound', () => {
    it('returns empty array when no entries', () => {
      const history = createHistory([]);
      const rounds = history.groupHistoryByRound();
      expect(rounds).toEqual([]);
    });

    it('returns single round when no judge guidance or compressed entries', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
        { role: 'assistant', content: 'Agent2 response', speaker: 'Agent2' },
      ];
      const history = createHistory(entries);
      const rounds = history.groupHistoryByRound();
      expect(rounds).toHaveLength(1);
      expect(rounds[0].round).toBe(1);
      expect(rounds[0].entries).toHaveLength(3);
    });

    it('creates round boundary when judge guidance entry is found', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
        // Judge guidance = round delimiter (role: user, speaker: Judge)
        { role: 'user', content: 'Judge guidance round 1', speaker: 'Judge' },
        { role: 'assistant', content: 'Agent1 round 2', speaker: 'Agent1' },
      ];
      const history = createHistory(entries);
      const rounds = history.groupHistoryByRound();
      expect(rounds).toHaveLength(2);
      expect(rounds[0].round).toBe(1);
      expect(rounds[0].entries).toHaveLength(3); // task + agent1 + judge guidance
      expect(rounds[1].round).toBe(2);
      expect(rounds[1].entries).toHaveLength(1); // agent1 round 2
    });

    it('creates round boundary when compressed entry is found', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: '[Round 1 summary]\nCompressed', speaker: 'System', compressed: true },
        { role: 'assistant', content: 'Agent1 round 2', speaker: 'Agent1' },
      ];
      const history = createHistory(entries);
      const rounds = history.groupHistoryByRound();
      expect(rounds).toHaveLength(2);
      expect(rounds[0].entries[0].compressed).toBe(true);
    });

    it('handles multiple round boundaries correctly', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 r1', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r1', speaker: 'Judge' },
        { role: 'assistant', content: 'Agent1 r2', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r2', speaker: 'Judge' },
        { role: 'assistant', content: 'Agent1 r3', speaker: 'Agent1' },
      ];
      const history = createHistory(entries);
      const rounds = history.groupHistoryByRound();
      expect(rounds).toHaveLength(3);
      expect(rounds[0].round).toBe(1);
      expect(rounds[1].round).toBe(2);
      expect(rounds[2].round).toBe(3);
    });
  });

  // ──────────────────────────────────────────────
  // formatEntryAsMessage (tested through prepareMessagesForAgent)
  // ──────────────────────────────────────────────

  describe('formatEntryAsMessage behavior', () => {
    it('formats assistant entry as assistant role message with speaker prefix', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'My analysis', speaker: 'Agent1' },
      ];
      const history = createHistory(entries, { currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      const assistantMsg = messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.content).toContain('Agent1');
      expect(assistantMsg.content).toContain('My analysis');
    });

    it('with compress=false returns full content with speaker prefix', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Full analysis text', speaker: 'Agent1' },
      ];
      // compress is only enabled when contextOptimization is enabled
      const config = {
        turn_management: 'roundrobin',
        max_rounds: 5,
        agents: { Agent1: { model: 'gpt-4o', prompt: '' } },
        judge: { model: 'gpt-4o', prompt: '' },
        contextOptimization: { enabled: false },
      };
      const history = createHistory(entries, { config, currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      const assistantMsg = messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.content).toContain('Full analysis text');
    });

    it('with compress=true and positionSummary uses compressEntryForAgent', () => {
      const { ContextOptimizer } = require('../../utils/ContextOptimizer');
      // compressEntryForAgent returns positionSummary when set
      (ContextOptimizer.compressEntryForAgent as jest.Mock).mockReturnValue('Brief position summary');

      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Long reasoning content', speaker: 'Agent1', positionSummary: 'Brief position summary' },
      ];
      const config = {
        turn_management: 'roundrobin',
        max_rounds: 5,
        agents: { Agent1: { model: 'gpt-4o', prompt: '' } },
        judge: { model: 'gpt-4o', prompt: '' },
        contextOptimization: { enabled: true },
      };
      // Round 1, so prepareMessagesWithRoundCompression is NOT called (round > 1 required)
      // But contextOpt enabled still passes compress=true to formatEntryAsMessage in non-round-compression path
      // Actually with currentRound=1, contextOpt enabled, and round <= 1, it uses the else branch
      const history = createHistory(entries, { config, currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      // compressEntryForAgent should have been called since contextOpt is enabled
      expect(ContextOptimizer.compressEntryForAgent).toHaveBeenCalled();
      const assistantMsg = messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.content).toContain('Brief position summary');
    });
  });

  // ──────────────────────────────────────────────
  // prepareMessagesForAgent
  // ──────────────────────────────────────────────

  describe('prepareMessagesForAgent', () => {
    it('returns array of {role, content} messages', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
      ];
      const history = createHistory(entries, { currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      expect(Array.isArray(messages)).toBe(true);
      for (const msg of messages) {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(['user', 'assistant']).toContain(msg.role);
        expect(typeof msg.content).toBe('string');
      }
    });

    it('filters out error entries', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Error response', speaker: 'Agent1', error: true },
        { role: 'assistant', content: 'Valid response', speaker: 'Agent2' },
      ];
      const history = createHistory(entries, { currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      const contents = messages.map((m: any) => m.content).join(' ');
      expect(contents).not.toContain('Error response');
      expect(contents).toContain('Valid response');
    });

    it('merges consecutive same-role messages', () => {
      // Two user-role messages in a row should be merged
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'First task', speaker: 'System' },
        { role: 'user', content: 'Additional context', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
      ];
      const history = createHistory(entries, { currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      // The two user messages should be merged into one
      const userMsgs = messages.filter((m: any) => m.role === 'user');
      // First user message should contain merged content
      const firstUser = userMsgs[0];
      expect(firstUser.content).toContain('First task');
      expect(firstUser.content).toContain('Additional context');
    });

    it('appends trailing user message when last message is assistant', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
      ];
      const history = createHistory(entries, { currentRound: 1 });
      const messages = history.prepareMessagesForAgent();

      const last = messages[messages.length - 1];
      expect(last.role).toBe('user');
    });
  });

  // ──────────────────────────────────────────────
  // getHistoryTokenThreshold
  // ──────────────────────────────────────────────

  describe('getHistoryTokenThreshold', () => {
    it('returns 80000 by default for non-Claude models', () => {
      const history = createHistory([], {
        agents: { Agent1: { model: 'gpt-4o' }, Agent2: { model: 'gemini-2.5-flash' } },
        config: {
          turn_management: 'roundrobin',
          max_rounds: 5,
          agents: {},
          judge: { model: 'gpt-4o', prompt: '' },
        },
      });
      const threshold = history.getHistoryTokenThreshold();
      expect(threshold).toBe(80_000);
    });

    it('returns 150000 when an agent uses a Claude model', () => {
      const history = createHistory([], {
        agents: { Agent1: { model: 'claude-sonnet-4-5' }, Agent2: { model: 'gpt-4o' } },
        config: {
          turn_management: 'roundrobin',
          max_rounds: 5,
          agents: {},
          judge: { model: 'gpt-4o', prompt: '' },
        },
      });
      const threshold = history.getHistoryTokenThreshold();
      expect(threshold).toBe(150_000);
    });

    it('returns 150000 when judge uses a Claude model', () => {
      const history = createHistory([], {
        agents: { Agent1: { model: 'gpt-4o' } },
        config: {
          turn_management: 'roundrobin',
          max_rounds: 5,
          agents: {},
          judge: { model: 'claude-sonnet-4-5', prompt: '' },
        },
      });
      const threshold = history.getHistoryTokenThreshold();
      expect(threshold).toBe(150_000);
    });
  });

  // ──────────────────────────────────────────────
  // compressHistory
  // ──────────────────────────────────────────────

  describe('compressHistory', () => {
    it('does nothing when total tokens below threshold', async () => {
      (TokenCounter.estimateMessagesTokens as jest.Mock).mockReturnValue(500);
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
      ];
      const history = createHistory(entries);
      const originalLength = entries.length;
      await history.compressHistory();
      expect(entries).toHaveLength(originalLength);
    });

    it('does nothing when fewer than 4 round groups even if over threshold', async () => {
      (TokenCounter.estimateMessagesTokens as jest.Mock).mockReturnValue(200_000);
      // Only 3 entries, all in one round (no judge guidance)
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1', speaker: 'Agent1' },
        { role: 'assistant', content: 'Agent2', speaker: 'Agent2' },
      ];
      const history = createHistory(entries);
      const originalLength = entries.length;
      await history.compressHistory();
      // No compression since only 1 round group
      expect(entries).toHaveLength(originalLength);
    });

    it('compresses middle rounds in-place when over threshold with enough rounds', async () => {
      let callCount = 0;
      (TokenCounter.estimateMessagesTokens as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 200_000 : 5_000;
      });
      (TokenCounter.summarizeWithLLM as jest.Mock).mockResolvedValue('Compressed middle round');

      // Build 4 round groups: each group ends with a Judge guidance entry
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 r1', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r1', speaker: 'Judge' },      // delimiter → round 1
        { role: 'assistant', content: 'Agent1 r2', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r2', speaker: 'Judge' },      // delimiter → round 2
        { role: 'assistant', content: 'Agent1 r3', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r3', speaker: 'Judge' },      // delimiter → round 3
        { role: 'assistant', content: 'Agent1 r4', speaker: 'Agent1' }, // round 4 (current)
      ];
      const history = createHistory(entries);
      await history.compressHistory();

      // Middle round (round 2) should be compressed
      const compressedEntries = entries.filter(e => e.compressed === true);
      expect(compressedEntries.length).toBeGreaterThan(0);
    });

    it('calls onCacheInvalidated callback after compression', async () => {
      let callCount = 0;
      (TokenCounter.estimateMessagesTokens as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 200_000 : 5_000;
      });

      const onCacheInvalidated = jest.fn();
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 r1', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r1', speaker: 'Judge' },
        { role: 'assistant', content: 'Agent1 r2', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r2', speaker: 'Judge' },
        { role: 'assistant', content: 'Agent1 r3', speaker: 'Agent1' },
        { role: 'user', content: 'Judge r3', speaker: 'Judge' },
        { role: 'assistant', content: 'Agent1 r4', speaker: 'Agent1' },
      ];

      const config = {
        turn_management: 'roundrobin',
        max_rounds: 5,
        agents: { Agent1: { model: 'gpt-4o', prompt: '' } },
        judge: { model: 'gpt-4o', prompt: '' },
      };

      const history = new ConversationHistory(
        entries,
        config,
        () => 4,
        () => new Map(),
        () => ({ Agent1: { model: 'gpt-4o', systemPrompt: '' } }),
        () => null,
        onCacheInvalidated
      );

      await history.compressHistory();
      expect(onCacheInvalidated).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────
  // prepareMessagesWithBudget
  // ──────────────────────────────────────────────

  describe('prepareMessagesWithBudget', () => {
    it('returns messages directly when under 80% of input budget', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
      ];
      // 500 tokens << 80% of 128000 = 102400
      (TokenCounter.estimateMessagesTokens as jest.Mock).mockReturnValue(500);
      (TokenCounter.getModelLimits as jest.Mock).mockReturnValue({ maxInput: 128000, maxOutput: 4096 });

      const history = createHistory(entries, { currentRound: 1 });
      const result = history.prepareMessagesWithBudget('Agent1');
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns null when messages cannot fit even after truncation', () => {
      const entries: DiscussionHistoryEntry[] = [
        { role: 'user', content: 'Task', speaker: 'System' },
        { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1' },
      ];
      // Simulate way over limit even after truncation
      (TokenCounter.estimateMessagesTokens as jest.Mock).mockReturnValue(150_000);
      (TokenCounter.getModelLimits as jest.Mock).mockReturnValue({ maxInput: 128000, maxOutput: 4096 });
      // Truncation doesn't help — still over limit
      (TokenCounter.truncateMessages as jest.Mock).mockReturnValue({
        messages: entries,
        truncated: true,
      });

      const history = createHistory(entries, { currentRound: 1 });
      const result = history.prepareMessagesWithBudget('Agent1');
      expect(result).toBeNull();
    });
  });
});
