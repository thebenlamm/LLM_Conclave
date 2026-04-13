import ConversationHistory, { CompressionConfig } from '../ConversationHistory';
import { DiscussionHistoryEntry } from '../../types/index';

// Mock ContextOptimizer (not used by compression path, but module imports it)
jest.mock('../../utils/ContextOptimizer', () => ({
  ContextOptimizer: {
    compressEntryForAgent: jest.fn((entry: any) => entry.content),
    getCompressionTier: jest.fn().mockReturnValue('position'),
    compressRound: jest.fn().mockReturnValue('[round summary]'),
  },
}));

// Use the REAL TokenCounter for compression tests so we exercise actual
// gpt-tokenizer encoding against the TPM threshold. ConversationHistory.ts
// imports TokenCounter as a side-effect, but getCompressedHistoryFor uses
// gpt-tokenizer directly.
jest.mock('../../utils/TokenCounter', () => ({
  __esModule: true,
  default: {
    estimateMessagesTokens: jest.fn().mockReturnValue(0),
    getModelLimits: jest.fn().mockReturnValue({ maxInput: 128000, maxOutput: 4096 }),
    truncateMessages: jest.fn().mockImplementation((msgs: any) => ({ messages: msgs, truncated: false })),
    summarizeWithLLM: jest.fn().mockResolvedValue('[llm compressed summary]'),
  },
}));

function makeEntry(speaker: string, content: string, role: 'user' | 'assistant' = 'assistant'): DiscussionHistoryEntry {
  return { role, content, speaker };
}

function createHistory(entries: DiscussionHistoryEntry[]): ConversationHistory {
  const config: any = {
    turn_management: 'roundrobin',
    max_rounds: 5,
    agents: {},
    judge: { model: 'gpt-4o', prompt: 'judge' },
  };
  return new ConversationHistory(
    entries,
    config,
    () => 2,
    () => ({}),
    () => ({}),
    () => null,
    () => {}
  );
}

describe('ConversationHistory compression (Phase 13)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Test 1: below threshold returns full history unchanged', async () => {
    const entries: DiscussionHistoryEntry[] = [
      makeEntry('Alice', 'short message one'),
      makeEntry('Bob', 'short message two'),
      makeEntry('Alice', 'short message three'),
    ];
    const history = createHistory(entries);

    // Gemini has a 1M TPM ceiling — 3 short messages stay below threshold
    const result = await history.getCompressedHistoryFor(
      { gemAgent: { model: 'gemini-2.5-pro', provider: 'google' } },
      {}
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(entries[0]);
    expect(result[1]).toEqual(entries[1]);
    expect(result[2]).toEqual(entries[2]);
  });

  test('Test 2: above threshold returns summary block + last N verbatim', async () => {
    // OpenAI default TPM = 30K, threshold 0.5 → 15K tokens triggers compression.
    // 30 messages × ~8000 chars ≈ ~2K tokens each = ~60K tokens total → above threshold.
    const longContent = 'X '.repeat(4000); // ~4000 tokens worth
    const entries: DiscussionHistoryEntry[] = [];
    for (let i = 0; i < 30; i++) {
      entries.push(makeEntry(`Agent${i % 3}`, `${longContent} message ${i}`));
    }
    const history = createHistory(entries);

    const mockRouter = {
      route: jest.fn().mockResolvedValue('MOCK_SUMMARY_A'),
      isActive: () => true,
    };

    const result = await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any }
    );

    // 1 summary block + last 6 verbatim = 7
    expect(result).toHaveLength(7);
    expect(result[0].speaker).toBe('System');
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('MOCK_SUMMARY_A');
    // Last 6 should be verbatim — entries[24..29]
    for (let i = 0; i < 6; i++) {
      expect(result[i + 1]).toEqual(entries[24 + i]);
    }
    expect(mockRouter.route).toHaveBeenCalledTimes(1);
  });

  test('Test 3: summary regenerated every K turns, cached between', async () => {
    const longContent = 'Y '.repeat(4000);
    const entries: DiscussionHistoryEntry[] = [];
    for (let i = 0; i < 30; i++) {
      entries.push(makeEntry(`Agent${i % 3}`, `${longContent} ${i}`));
    }
    const history = createHistory(entries);

    const mockRouter = {
      route: jest
        .fn()
        .mockResolvedValueOnce('MOCK_SUMMARY_A')
        .mockResolvedValueOnce('MOCK_SUMMARY_B'),
      isActive: () => true,
    };

    const config: CompressionConfig = { recentWindowSize: 6, summaryRefreshEveryNTurns: 4, thresholdRatio: 0.5 };
    const agents = { openAgent: { model: 'gpt-4o', provider: 'openai' } };

    // First call → summary A generated
    const r1 = await history.getCompressedHistoryFor(agents, { taskRouter: mockRouter as any, config });
    expect(r1[0].content).toContain('MOCK_SUMMARY_A');
    expect(mockRouter.route).toHaveBeenCalledTimes(1);

    // Push 1 more message → still within K, cached
    entries.push(makeEntry('Agent0', `${longContent} 30`));
    const r2 = await history.getCompressedHistoryFor(agents, { taskRouter: mockRouter as any, config });
    expect(r2[0].content).toContain('MOCK_SUMMARY_A');
    expect(mockRouter.route).toHaveBeenCalledTimes(1);

    // Push 3 more (total 4 since last refresh) → summary B regenerated
    entries.push(makeEntry('Agent1', `${longContent} 31`));
    entries.push(makeEntry('Agent2', `${longContent} 32`));
    entries.push(makeEntry('Agent0', `${longContent} 33`));
    const r3 = await history.getCompressedHistoryFor(agents, { taskRouter: mockRouter as any, config });
    expect(r3[0].content).toContain('MOCK_SUMMARY_B');
    expect(mockRouter.route).toHaveBeenCalledTimes(2);
  });

  test('Test 4: raw history is never mutated', async () => {
    const longContent = 'Z '.repeat(4000);
    const entries: DiscussionHistoryEntry[] = [];
    for (let i = 0; i < 30; i++) {
      entries.push(makeEntry(`Agent${i % 3}`, `${longContent} ${i}`));
    }
    const history = createHistory(entries);
    const snapshotBefore = JSON.parse(JSON.stringify(entries));

    const mockRouter = {
      route: jest.fn().mockResolvedValue('SUMMARY'),
      isActive: () => true,
    };

    await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any }
    );

    expect(entries).toEqual(snapshotBefore);
    expect(entries).toHaveLength(30);
  });

  test('Test 5: TaskRouter unavailable → deterministic rollup fallback', async () => {
    const longContent = 'W '.repeat(4000);
    const entries: DiscussionHistoryEntry[] = [];
    for (let i = 0; i < 30; i++) {
      entries.push(makeEntry(`Agent${i % 3}`, `${longContent} ${i}`));
    }
    const history = createHistory(entries);

    const result = await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: undefined }
    );

    expect(result).toHaveLength(7);
    expect(result[0].speaker).toBe('System');
    expect(result[0].content).toMatch(/^Earlier turns/);
    expect(result[0].content).toContain('|');
  });
});
