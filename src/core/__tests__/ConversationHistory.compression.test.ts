import ConversationHistory, { CompressionConfig } from '../ConversationHistory';
import { DiscussionHistoryEntry } from '../../types/index';
import { EventBus } from '../EventBus';

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

// ---------------------------------------------------------------------------
// Phase 13.1 — compression state getters + event emissions
// ---------------------------------------------------------------------------

function createHistoryWithRoundAndBus(
  entries: DiscussionHistoryEntry[],
  getCurrentRound: () => number,
  eventBus?: EventBus
): ConversationHistory {
  const config: any = {
    turn_management: 'roundrobin',
    max_rounds: 5,
    agents: {},
    judge: { model: 'gpt-4o', prompt: 'judge' },
  };
  return new ConversationHistory(
    entries,
    config,
    getCurrentRound,
    () => ({}),
    () => ({}),
    () => null,
    () => {},
    eventBus
  );
}

function buildLargeEntries(marker: string, count: number = 30): DiscussionHistoryEntry[] {
  const longContent = `${marker} `.repeat(4000);
  const entries: DiscussionHistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push(makeEntry(`Agent${i % 3}`, `${longContent} ${i}`));
  }
  return entries;
}

describe('ConversationHistory — Phase 13.1 getters and events', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getters return null/0 before any compression has fired', () => {
    const history = createHistoryWithRoundAndBus([], () => 1, new EventBus());
    expect(history.compressionActivatedAtRound).toBeNull();
    expect(history.summaryRegenerationCount).toBe(0);
    expect(history.lastSummarizerModel).toBeNull();
    expect(history.lastSummarizerFallback).toBeNull();
  });

  test('after a successful regeneration: compressionActivatedAtRound is set and regenerationCount === 1', async () => {
    const entries = buildLargeEntries('A');
    const eventBus = new EventBus();
    const emitSpy = jest.spyOn(eventBus, 'emitEvent');
    const history = createHistoryWithRoundAndBus(entries, () => 3, eventBus);

    const mockRouter = {
      route: jest.fn().mockResolvedValue('MOCK_SUMMARY_A'),
      getLastSubstitution: jest.fn().mockReturnValue(null),
      cheapModel: 'gpt-4o-mini',
      isActive: () => true,
    };

    const config: CompressionConfig = { recentWindowSize: 6, verbatimTailSize: 6 };
    await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any, config }
    );

    expect(history.compressionActivatedAtRound).toBe(3);
    expect(history.summaryRegenerationCount).toBe(1);
    expect(history.lastSummarizerModel).toBe('gpt-4o-mini');

    // history_compressed emitted with tailSize from configured verbatimTailSize
    expect(emitSpy).toHaveBeenCalledWith(
      'conversation:history_compressed',
      expect.objectContaining({
        round: 3,
        cumulativeRegenerations: 1,
        tailSize: 6,
      })
    );
  });

  test('second regeneration bumps regenerationCount to 2 but compressionActivatedAtRound stays on the first round', async () => {
    const entries = buildLargeEntries('B');
    const eventBus = new EventBus();
    let round = 3;
    const history = createHistoryWithRoundAndBus(entries, () => round, eventBus);

    const mockRouter = {
      route: jest
        .fn()
        .mockResolvedValueOnce('SUMMARY_ONE')
        .mockResolvedValueOnce('SUMMARY_TWO'),
      getLastSubstitution: jest.fn().mockReturnValue(null),
      cheapModel: 'gpt-4o-mini',
      isActive: () => true,
    };

    const config: CompressionConfig = { recentWindowSize: 6, summaryRefreshEveryNTurns: 4 };
    const agents = { openAgent: { model: 'gpt-4o', provider: 'openai' } };

    await history.getCompressedHistoryFor(agents, { taskRouter: mockRouter as any, config });
    expect(history.compressionActivatedAtRound).toBe(3);
    expect(history.summaryRegenerationCount).toBe(1);

    // Push 4 more messages to trigger re-regeneration, advance round
    const longContent = 'B '.repeat(4000);
    for (let i = 30; i < 34; i++) {
      entries.push(makeEntry(`Agent${i % 3}`, `${longContent} ${i}`));
    }
    round = 5;

    await history.getCompressedHistoryFor(agents, { taskRouter: mockRouter as any, config });
    expect(history.compressionActivatedAtRound).toBe(3); // unchanged
    expect(history.summaryRegenerationCount).toBe(2);
  });

  test('history_compressed payload sources tailSize from configured verbatimTailSize (not recentWindowSize)', async () => {
    const entries = buildLargeEntries('C');
    const eventBus = new EventBus();
    const emitSpy = jest.spyOn(eventBus, 'emitEvent');
    const history = createHistoryWithRoundAndBus(entries, () => 2, eventBus);

    const mockRouter = {
      route: jest.fn().mockResolvedValue('SUMMARY'),
      getLastSubstitution: jest.fn().mockReturnValue(null),
      cheapModel: 'gpt-4o-mini',
      isActive: () => true,
    };

    // verbatimTailSize is an explicit override; recentWindowSize controls the
    // actual slice. We intentionally diverge them to prove the payload uses
    // verbatimTailSize.
    const config: CompressionConfig = { recentWindowSize: 6, verbatimTailSize: 9 };
    await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any, config }
    );

    expect(emitSpy).toHaveBeenCalledWith(
      'conversation:history_compressed',
      expect.objectContaining({ tailSize: 9 })
    );
    expect(history.verbatimTailSize).toBe(9);
  });

  test('TaskRouter.route() throws → history_compression_failed emitted, deterministic rollback, no regenerationCount bump', async () => {
    const entries = buildLargeEntries('D');
    const eventBus = new EventBus();
    const emitSpy = jest.spyOn(eventBus, 'emitEvent');
    const history = createHistoryWithRoundAndBus(entries, () => 4, eventBus);

    const mockRouter = {
      route: jest.fn().mockRejectedValue(new Error('primary failed; secondary failed')),
      getLastSubstitution: jest.fn().mockReturnValue(null),
      cheapModel: 'gpt-4o-mini',
      isActive: () => true,
    };

    const result = await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any }
    );

    // Deterministic rollup still produced a usable summary block
    expect(result).toHaveLength(7);
    expect(result[0].speaker).toBe('System');
    expect(result[0].content).toMatch(/^Earlier turns/);

    // history_compression_failed was emitted with serve-uncompressed
    expect(emitSpy).toHaveBeenCalledWith(
      'conversation:history_compression_failed',
      expect.objectContaining({
        round: 4,
        fallbackAction: 'serve-uncompressed',
      })
    );

    // history_compressed was NOT emitted on the failure path
    const compressedCalls = emitSpy.mock.calls.filter(
      c => c[0] === 'conversation:history_compressed'
    );
    expect(compressedCalls).toHaveLength(0);

    // Regeneration counter is not bumped on failure
    expect(history.summaryRegenerationCount).toBe(0);
  });

  test('TaskRouter succeeds with substitution → summarizer_fallback emitted and state populated', async () => {
    const entries = buildLargeEntries('E');
    const eventBus = new EventBus();
    const emitSpy = jest.spyOn(eventBus, 'emitEvent');
    const history = createHistoryWithRoundAndBus(entries, () => 2, eventBus);

    const substitutionInfo = {
      original: 'gpt-4o-mini',
      substitute: 'claude-haiku-4-5',
      reason: 'rate limit',
    };
    const mockRouter = {
      route: jest.fn().mockResolvedValue('SECONDARY_SUMMARY'),
      getLastSubstitution: jest.fn().mockReturnValue(substitutionInfo),
      cheapModel: 'gpt-4o-mini',
      isActive: () => true,
    };

    await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any }
    );

    expect(emitSpy).toHaveBeenCalledWith(
      'conversation:summarizer_fallback',
      expect.objectContaining({
        round: 2,
        originalModel: 'gpt-4o-mini',
        substituteModel: 'claude-haiku-4-5',
        reason: 'rate limit',
      })
    );
    expect(history.lastSummarizerFallback).toEqual(
      expect.objectContaining({ original: 'gpt-4o-mini', substitute: 'claude-haiku-4-5' })
    );
    expect(history.lastSummarizerModel).toBe('claude-haiku-4-5');
  });

  test('TaskRouter succeeds without substitution → no summarizer_fallback event, lastSummarizerModel === primary cheapModel', async () => {
    const entries = buildLargeEntries('F');
    const eventBus = new EventBus();
    const emitSpy = jest.spyOn(eventBus, 'emitEvent');
    const history = createHistoryWithRoundAndBus(entries, () => 2, eventBus);

    const mockRouter = {
      route: jest.fn().mockResolvedValue('NOMINAL_SUMMARY'),
      getLastSubstitution: jest.fn().mockReturnValue(null),
      cheapModel: 'gpt-4o-mini',
      isActive: () => true,
    };

    await history.getCompressedHistoryFor(
      { openAgent: { model: 'gpt-4o', provider: 'openai' } },
      { taskRouter: mockRouter as any }
    );

    const fallbackCalls = emitSpy.mock.calls.filter(
      c => c[0] === 'conversation:summarizer_fallback'
    );
    expect(fallbackCalls).toHaveLength(0);
    expect(history.lastSummarizerModel).toBe('gpt-4o-mini');
    expect(history.lastSummarizerFallback).toBeNull();
  });
});
