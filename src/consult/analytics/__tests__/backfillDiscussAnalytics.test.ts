import {
  sessionToAnalyticsInput,
  backfillDiscussAnalytics,
} from '../backfillDiscussAnalytics';
import { SessionManifest } from '../../../types/index';

function makeSession(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    id: 'sess-1',
    timestamp: '2026-05-01T00:00:00Z',
    mode: 'consensus',
    task: 'which video vendor',
    status: 'completed',
    agents: [
      { name: 'AgentA', model: 'claude-sonnet-4-5', provider: 'ClaudeProvider', systemPrompt: '' },
      { name: 'AgentB', model: 'gpt-5.5', provider: 'OpenAIProvider', systemPrompt: '' },
    ],
    conversationHistory: [],
    currentRound: 4,
    maxRounds: 4,
    finalSolution: 'Migrate to Whereby',
    dissent_quality: 'captured',
    agentSubstitutions: {},
    cost: { totalCost: 0.21, totalTokens: { input: 3000, output: 1200 }, totalCalls: 8 },
    outputFiles: { transcript: 't', json: 'j' },
    ...overrides,
  } as SessionManifest;
}

describe('sessionToAnalyticsInput', () => {
  it('maps a completed discuss session to the analytics input', () => {
    const input = sessionToAnalyticsInput(makeSession())!;
    expect(input).toMatchObject({
      id: 'sess-1',
      question: 'which video vendor',
      mode: 'discuss',
      recommendation: 'Migrate to Whereby',
      confidence: null, // band not persisted historically
      totalCost: 0.21,
      totalTokens: 4200,
      durationMs: 0,
      timestamp: '2026-05-01T00:00:00Z',
      state: 'complete',
      hasDissent: true,
    });
    // provider normalized from the model (legacy 'ClaudeProvider' string ignored)
    expect(input.agents).toEqual([
      { name: 'AgentA', model: 'claude-sonnet-4-5', provider: 'claude' },
      { name: 'AgentB', model: 'gpt-5.5', provider: 'openai' },
    ]);
  });

  it('classifies continuations (parentSessionId) as mode=continue', () => {
    const input = sessionToAnalyticsInput(makeSession({ parentSessionId: 'parent-1' }))!;
    expect(input.mode).toBe('continue');
  });

  it('returns null for in-progress sessions', () => {
    expect(sessionToAnalyticsInput(makeSession({ status: 'in_progress' }))).toBeNull();
  });

  it('maps status to the analytics state', () => {
    expect(sessionToAnalyticsInput(makeSession({ status: 'completed_degraded' }))!.state).toBe('degraded');
    expect(sessionToAnalyticsInput(makeSession({ status: 'error' }))!.state).toBe('error');
    expect(sessionToAnalyticsInput(makeSession({ status: 'interrupted' }))!.state).toBe('interrupted');
  });

  it('sets hasDissent only when dissent_quality is captured', () => {
    expect(sessionToAnalyticsInput(makeSession({ dissent_quality: 'missing' }))!.hasDissent).toBe(false);
    expect(sessionToAnalyticsInput(makeSession({ dissent_quality: undefined }))!.hasDissent).toBe(false);
    expect(sessionToAnalyticsInput(makeSession({ dissent_quality: 'captured' }))!.hasDissent).toBe(true);
  });

  it('tolerates a session missing cost/agents', () => {
    const input = sessionToAnalyticsInput(makeSession({ cost: undefined as any, agents: undefined as any }))!;
    expect(input.totalCost).toBe(0);
    expect(input.totalTokens).toBe(0);
    expect(input.agents).toEqual([]);
  });
});

describe('backfillDiscussAnalytics', () => {
  const fakeIndexer = (existingIds: string[] = []) => {
    const written: any[] = [];
    return {
      written,
      indexer: {
        hasConsultation: (id: string) => existingIds.includes(id),
        indexDiscussion: (x: any) => written.push(x),
      } as any,
    };
  };

  const fakeSessions = (sessions: SessionManifest[]) =>
    ({
      listSessions: async () => sessions.map(s => ({ id: s.id })),
      loadSession: async (id: string) => sessions.find(s => s.id === id) ?? null,
    } as any);

  it('imports mappable sessions and reports counts', async () => {
    const sessions = [
      makeSession({ id: 'a' }),
      makeSession({ id: 'b', parentSessionId: 'a' }),
      makeSession({ id: 'c', status: 'in_progress' }), // unmappable
    ];
    const { indexer, written } = fakeIndexer();
    const res = await backfillDiscussAnalytics({ sessionManager: fakeSessions(sessions), indexer });

    expect(res).toEqual({ scanned: 3, imported: 2, skippedExisting: 0, skippedUnmappable: 1 });
    expect(written.map(w => w.id)).toEqual(['a', 'b']);
    expect(written.find(w => w.id === 'b').mode).toBe('continue');
  });

  it('gap-fills only — skips ids already recorded, never overwriting', async () => {
    const sessions = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    const { indexer, written } = fakeIndexer(['a']); // 'a' already in the DB
    const res = await backfillDiscussAnalytics({ sessionManager: fakeSessions(sessions), indexer });

    expect(res).toMatchObject({ imported: 1, skippedExisting: 1 });
    expect(written.map(w => w.id)).toEqual(['b']);
  });

  it('dry run writes nothing but still counts what it would import', async () => {
    const sessions = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    const { indexer, written } = fakeIndexer();
    const res = await backfillDiscussAnalytics({ sessionManager: fakeSessions(sessions), indexer, dryRun: true });

    expect(res.imported).toBe(2);
    expect(written).toHaveLength(0);
  });

  it('skips sessions that fail to load', async () => {
    const sm = {
      listSessions: async () => [{ id: 'a' }, { id: 'missing' }],
      loadSession: async (id: string) => (id === 'a' ? makeSession({ id: 'a' }) : null),
    } as any;
    const { indexer, written } = fakeIndexer();
    const res = await backfillDiscussAnalytics({ sessionManager: sm, indexer });

    expect(res).toMatchObject({ scanned: 2, imported: 1, skippedUnmappable: 1 });
    expect(written.map(w => w.id)).toEqual(['a']);
  });
});
