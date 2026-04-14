/**
 * Phase 13.1 — end-to-end Run Integrity integration test.
 *
 * Reconstructs the Trollix-class degraded run that motivated Phase 13.1 and
 * asserts that all four conversation:* signals, the runIntegrity result
 * object, the reconciled confidence, and the rendered markdown agree on a
 * single consistent story. This is the single integration safety net called
 * out in 13.1-CONTEXT.md — if any individual layer drifts it will fail here.
 *
 * Covers:
 *   - conversation:history_compression_failed (first summarizer call throws)
 *   - conversation:history_compressed         (second call succeeds)
 *   - conversation:summarizer_fallback        (TaskRouter.getLastSubstitution non-null)
 *   - conversation:agent_absent               (silent / capped / failed)
 *   - runIntegrity.participation includes absent-failed (msg.error===true path)
 *   - ConfidenceReconciler cap due to participation
 *   - renderRunIntegrity() inline D-03 format with substitution
 */

import ConversationHistory from '../ConversationHistory';
import TurnDistributionReporter from '../TurnDistributionReporter';
import { reconcileConfidence } from '../ConfidenceReconciler';
import { EventBus, ConclaveEvent } from '../EventBus';
import { renderRunIntegrity } from '../../mcp/server.js';
import type {
  DiscussionHistoryEntry,
  ParticipationEntry,
} from '../../types/index';

// ContextOptimizer is imported by ConversationHistory but unused on the
// compression path — mock it out for speed + isolation.
jest.mock('../../utils/ContextOptimizer', () => ({
  ContextOptimizer: {
    compressEntryForAgent: jest.fn((entry: any) => entry.content),
    getCompressionTier: jest.fn().mockReturnValue('position'),
    compressRound: jest.fn().mockReturnValue('[round summary]'),
  },
}));

// TokenCounter is imported but getCompressedHistoryFor uses gpt-tokenizer
// directly — keep the default export callable for any incidental reads.
jest.mock('../../utils/TokenCounter', () => ({
  __esModule: true,
  default: {
    estimateMessagesTokens: jest.fn().mockReturnValue(0),
    getModelLimits: jest.fn().mockReturnValue({ maxInput: 128000, maxOutput: 4096 }),
    truncateMessages: jest
      .fn()
      .mockImplementation((msgs: any) => ({ messages: msgs, truncated: false })),
    summarizeWithLLM: jest.fn().mockResolvedValue('[llm compressed summary]'),
  },
}));

function makeEntry(
  speaker: string,
  content: string,
  extras: Partial<DiscussionHistoryEntry> = {}
): DiscussionHistoryEntry {
  return { role: 'assistant', content, speaker, ...extras };
}

describe('Phase 13.1 — RunIntegrity end-to-end', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('degraded run with silent + capped + failed agents produces consistent events, result, and rendered markdown', async () => {
    // ------------------------------------------------------------------
    // 1. EventBus + listeners for all four Phase 13.1 signals
    // ------------------------------------------------------------------
    const eventBus = new EventBus();
    const events: Array<{ type: string; payload: any }> = [];
    const signalTypes = [
      'conversation:history_compressed',
      'conversation:history_compression_failed',
      'conversation:agent_absent',
      'conversation:summarizer_fallback',
    ] as const;
    for (const t of signalTypes) {
      eventBus.on(t, (ev: ConclaveEvent) => {
        events.push({ type: ev.type, payload: ev.payload });
      });
    }

    // ------------------------------------------------------------------
    // 2. TaskRouter mock — first route() throws, second succeeds and
    //    advertises a substitution via getLastSubstitution().
    // ------------------------------------------------------------------
    const substitution = {
      original: 'gpt-4o-mini',
      substitute: 'claude-haiku-4-5',
      reason: 'rate limit',
    };
    let routeCallCount = 0;
    let lastSub: typeof substitution | null = null;
    const mockTaskRouter = {
      cheapModel: 'gpt-4o-mini',
      route: jest.fn().mockImplementation(async () => {
        routeCallCount += 1;
        if (routeCallCount === 1) {
          throw new Error('rate limit');
        }
        lastSub = substitution;
        return '- alpha position X; - beta silent; - gamma capped; - delta failed';
      }),
      getLastSubstitution: () => lastSub,
      isActive: () => true,
    };

    // ------------------------------------------------------------------
    // 3. ConversationHistory wired to the shared entries array. Round 3
    //    is "current" so compression activates there.
    // ------------------------------------------------------------------
    const entries: DiscussionHistoryEntry[] = [];
    const config: any = {
      turn_management: 'dynamic',
      max_rounds: 4,
      agents: {},
      judge: { model: 'gpt-4o', prompt: 'judge' },
    };
    const currentRoundRef = { value: 3 };
    const history = new ConversationHistory(
      entries,
      config,
      () => currentRoundRef.value,
      () => ({}),
      () => ({}),
      () => mockTaskRouter,
      () => {},
      eventBus
    );

    // Seed history with enough content to exceed the OpenAI 30K-TPM * 0.5
    // threshold (~15K tokens). Each ~4000-char chunk is ~2000 tokens via
    // gpt-tokenizer, so 20 entries ≈ 40K tokens — well above the gate.
    const longContent = 'X '.repeat(4000);
    // alpha: 4 normal turns (1 round 1, 1 round 2, 2 round 3)
    entries.push(makeEntry('alpha', `${longContent} r1`));
    entries.push(makeEntry('alpha', `${longContent} r2`));
    entries.push(makeEntry('alpha', `${longContent} r3a`));
    entries.push(makeEntry('alpha', `${longContent} r3b`));
    // filler so we clear the 15K threshold comfortably
    for (let i = 0; i < 16; i++) {
      entries.push(makeEntry('alpha', `${longContent} filler ${i}`));
    }
    // delta: one entry with error:true — this is the msg.error===true
    // predicate the absent-failed wiring from Plan 13.1-05 reads.
    entries.push(
      makeEntry('delta', 'delta attempted turn failed', { error: true } as any)
    );

    const agentsForCompression = {
      alpha: { model: 'gpt-4o', provider: 'openai' },
      beta: { model: 'gpt-4o', provider: 'openai' },
      gamma: { model: 'gpt-4o', provider: 'openai' },
      delta: { model: 'gpt-4o', provider: 'openai' },
    };

    // First call — summarizer throws → history_compression_failed fires,
    // deterministic non-LLM rollup serves the summary, NO history_compressed.
    await history.getCompressedHistoryFor(agentsForCompression, {
      taskRouter: mockTaskRouter as any,
    });

    // Append 4 more entries so the refresh counter hits the default K=4
    // and the next call will actually re-run the summarizer.
    for (let i = 0; i < 4; i++) {
      entries.push(makeEntry('alpha', `${longContent} post-${i}`));
    }

    // Second call — summarizer succeeds and TaskRouter reports a
    // substitution → summarizer_fallback + history_compressed both fire.
    await history.getCompressedHistoryFor(agentsForCompression, {
      taskRouter: mockTaskRouter as any,
    });

    expect(mockTaskRouter.route).toHaveBeenCalledTimes(2);

    // ------------------------------------------------------------------
    // 4. TurnDistributionReporter — record alpha turns, mark gamma as
    //    fairness-capped in round 2, then derive failedAgents from the
    //    history entries carrying error:true (absent-failed path).
    // ------------------------------------------------------------------
    const reporter = new TurnDistributionReporter(eventBus);
    reporter.report(
      [
        { name: 'alpha', turns: 4, tokens: 4000 },
        { name: 'beta', turns: 0, tokens: 0 },
        { name: 'gamma', turns: 0, tokens: 0 },
        { name: 'delta', turns: 0, tokens: 0 },
      ],
      3,
      eventBus
    );
    reporter.recordCapExclusion('gamma', 2, 2.8);

    const failedAgents = new Set<string>(
      entries
        .filter((e: any) => e.error === true)
        .map(e => e.speaker)
    );
    expect(failedAgents.has('delta')).toBe(true);

    const participation: ParticipationEntry[] = reporter.buildParticipationReport(
      ['alpha', 'beta', 'gamma', 'delta'],
      failedAgents
    );
    reporter.finalizeAbsenceEvents(participation);

    // ------------------------------------------------------------------
    // 5. Assemble runIntegrity exactly as ConversationManager does.
    // ------------------------------------------------------------------
    const compression = {
      active: history.compressionActivatedAtRound !== null,
      activatedAtRound: history.compressionActivatedAtRound,
      tailSize: history.verbatimTailSize,
      summaryRegenerations: history.summaryRegenerationCount,
      summarizerFallback: history.lastSummarizerFallback,
    };
    const runIntegrity = { compression, participation };

    // ------------------------------------------------------------------
    // 6. Reconcile confidence — judge said HIGH, machinery should cap it.
    // ------------------------------------------------------------------
    const reconciled = reconcileConfidence(
      {
        aborted: false,
        // Participation is the authoritative signal in 13.1 — leave the
        // legacy allAgentsSpoke gate open so Rule 3.5b (participation-aware
        // cap) drives the downgrade instead of Rule 3's blanket LOW.
        allAgentsSpoke: true,
        turnBalanceOk: true,
        roundCompleteness: 1.0,
        participation,
        compression: {
          active: compression.active,
          activatedAtRound: compression.activatedAtRound,
          summaryRegenerations: compression.summaryRegenerations,
        },
      },
      'HIGH'
    );
    const finalConfidence = reconciled.finalConfidence;
    const confidenceReasoning = reconciled.confidenceReasoning;

    // ==================================================================
    // Event assertions — all four signal types present with right shape
    // ==================================================================
    expect(
      events.some(e => e.type === 'conversation:history_compression_failed'
        && e.payload.fallbackAction === 'serve-uncompressed')
    ).toBe(true);
    expect(events.some(e => e.type === 'conversation:history_compressed')).toBe(true);
    expect(
      events.some(
        e =>
          e.type === 'conversation:summarizer_fallback' &&
          e.payload.originalModel === 'gpt-4o-mini' &&
          e.payload.substituteModel === 'claude-haiku-4-5'
      )
    ).toBe(true);
    expect(
      events.some(
        e =>
          e.type === 'conversation:agent_absent' &&
          e.payload.agentName === 'beta' &&
          e.payload.status === 'silent'
      )
    ).toBe(true);
    expect(
      events.some(
        e =>
          e.type === 'conversation:agent_absent' &&
          e.payload.agentName === 'gamma' &&
          e.payload.status === 'capped'
      )
    ).toBe(true);
    expect(
      events.some(
        e =>
          e.type === 'conversation:agent_absent' &&
          e.payload.agentName === 'delta' &&
          e.payload.status === 'failed'
      )
    ).toBe(true);

    // ==================================================================
    // runIntegrity result-shape assertions
    // ==================================================================
    expect(runIntegrity.compression.active).toBe(true);
    expect(runIntegrity.compression.activatedAtRound).toBe(3);
    expect(runIntegrity.compression.summarizerFallback).toEqual(
      expect.objectContaining({
        original: 'gpt-4o-mini',
        substitute: 'claude-haiku-4-5',
        reason: 'rate limit',
      })
    );
    expect(runIntegrity.compression.summaryRegenerations).toBeGreaterThanOrEqual(1);

    const statuses = runIntegrity.participation.map(p => p.status).sort();
    expect(statuses).toEqual([
      'absent-capped',
      'absent-failed',
      'absent-silent',
      'spoken',
    ]);

    // ==================================================================
    // Confidence cap assertions
    // ==================================================================
    expect(['MEDIUM', 'LOW']).toContain(finalConfidence);
    expect(finalConfidence).not.toBe('HIGH');
    expect(confidenceReasoning.toLowerCase()).toMatch(/participation|absent/);

    // ==================================================================
    // Rendered markdown — D-03 single-line format
    // ==================================================================
    const md = renderRunIntegrity(runIntegrity, { includeParticipation: true });
    expect(md).toContain('## Run Integrity');
    expect(md).toContain('### Participation');
    expect(md).toContain('beta: absent-silent');
    expect(md).toContain('gamma: absent-capped');
    expect(md).toContain('delta: absent-failed');

    const compressionLine =
      md.split('\n').find(l => l.startsWith('- History compression:')) ?? '';
    expect(compressionLine).toContain('substituted from gpt-4o-mini');
    expect(compressionLine).toContain('claude-haiku-4-5');

    // No dead double-emit line (D-03: substitution is inline, not its own row)
    expect(md).not.toContain('Summarizer fallback:');
  });
});
