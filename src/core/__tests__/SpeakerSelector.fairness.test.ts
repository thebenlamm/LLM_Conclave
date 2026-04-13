import { SpeakerSelector, AgentInfo, AgentTurnStats, FairnessConfig } from '../SpeakerSelector';
import { EventBus } from '../EventBus';
import ProviderFactory from '../../providers/ProviderFactory';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory', () => ({
  createProvider: jest.fn()
}));

describe('SpeakerSelector fairness (Phase 13)', () => {
  let selector: SpeakerSelector;
  let eventBus: EventBus;
  let mockProvider: { chat: jest.Mock };

  const agentInfos: AgentInfo[] = [
    { name: 'A', model: 'gpt-4', expertise: 'Alpha' },
    { name: 'B', model: 'gpt-4', expertise: 'Bravo' },
    { name: 'C', model: 'gpt-4', expertise: 'Charlie' },
    { name: 'D', model: 'gpt-4', expertise: 'Delta' }
  ];

  const fairnessConfig: FairnessConfig = {
    maxTurnRatio: 2.0,
    forcedRotationAfter: 4
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    eventBus = EventBus.getInstance();
    eventBus.on('error', () => {});

    mockProvider = { chat: jest.fn() };
    (ProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

    selector = new SpeakerSelector(agentInfos, 'gpt-4o-mini', eventBus, fairnessConfig);
  });

  function buildStats(turnsThisRound: Record<string, number>, turnsOverall?: Record<string, number>): Record<string, AgentTurnStats> {
    const stats: Record<string, AgentTurnStats> = {};
    const total = Object.values(turnsThisRound).reduce((a, b) => a + b, 0) || 1;
    for (const name of Object.keys(turnsThisRound)) {
      stats[name] = {
        turnsThisRound: turnsThisRound[name],
        turnsOverall: (turnsOverall && turnsOverall[name]) ?? turnsThisRound[name],
        tokenShare: turnsThisRound[name] / total
      };
    }
    return stats;
  }

  test('Test 1: parse-failure fallback returns fewest-turns agent (round-robin)', async () => {
    mockProvider.chat.mockResolvedValue('NOT_AN_AGENT_NAME');
    const stats = buildStats({ A: 3, B: 1, C: 1, D: 2 });

    const result = await selector.selectNextSpeaker(
      [], null, null, 1, 'task', new Set(), { stats, totalTurnsThisRound: 7 }
    );

    expect(result.shouldContinue).toBe(true);
    // B and C have fewest (1 each); deterministic stable order picks B
    expect(['B', 'C']).toContain(result.nextSpeaker);
    expect(result.nextSpeaker).toBe('B');
  });

  test('Test 2: forced rotation skips LLM after threshold and picks zero-turn agent', async () => {
    mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'A', shouldContinue: true }));
    const stats = buildStats({ A: 2, B: 2, C: 0, D: 0 });

    const result = await selector.selectNextSpeaker(
      [], null, null, 1, 'task', new Set(), { stats, totalTurnsThisRound: 4 }
    );

    expect(['C', 'D']).toContain(result.nextSpeaker);
    expect(result.nextSpeaker).toBe('C');
    expect(mockProvider.chat).not.toHaveBeenCalled();
    expect(result.reason).toMatch(/forced rotation/i);
  });

  test('Test 3: max_turn_ratio excludes monopolizing agent from candidate list', async () => {
    // 3 agents only for this test
    const threeAgents: AgentInfo[] = [
      { name: 'A', model: 'gpt-4', expertise: 'Alpha' },
      { name: 'B', model: 'gpt-4', expertise: 'Bravo' },
      { name: 'C', model: 'gpt-4', expertise: 'Charlie' }
    ];
    const sel = new SpeakerSelector(threeAgents, 'gpt-4o-mini', eventBus, { maxTurnRatio: 2.0 });
    mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'B', shouldContinue: true }));

    // mean = (10+2+2)/3 = 4.67; cap = 9.34; A=10 exceeds → excluded
    const stats = buildStats({ A: 10, B: 2, C: 2 });

    const result = await sel.selectNextSpeaker(
      [], null, null, 1, 'task', new Set(), { stats, totalTurnsThisRound: 14 }
    );

    expect(mockProvider.chat).toHaveBeenCalled();
    const promptArg = mockProvider.chat.mock.calls[0][0][0].content as string;
    // Candidate list section should not include A as eligible
    expect(promptArg).toContain('AVAILABLE AGENTS');
    // The agent descriptions block should exclude A
    const availSection = promptArg.split('AVAILABLE AGENTS')[1].split('LAST SPEAKER')[0] || promptArg.split('AVAILABLE AGENTS')[1];
    expect(availSection).not.toMatch(/^- A \(/m);
    expect(availSection).toMatch(/^- B \(/m);
    expect(availSection).toMatch(/^- C \(/m);
    expect(result.nextSpeaker).toBe('B');
  });

  test('Test 4: prompt contains diversity table and instruction', async () => {
    mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'B', shouldContinue: true }));
    const stats = buildStats({ A: 2, B: 1, C: 1, D: 1 });

    await selector.selectNextSpeaker(
      [], null, null, 1, 'task', new Set(), { stats, totalTurnsThisRound: 5 }
    );

    expect(mockProvider.chat).toHaveBeenCalled();
    const promptArg = mockProvider.chat.mock.calls[0][0][0].content as string;
    expect(promptArg).toContain('| Agent |');
    expect(promptArg).toContain('Turns this round');
    expect(promptArg).toContain('Token share');
    expect(promptArg).toContain('Favor under-represented voices');
  });

  test('Test 5: resetForRound clears forced-rotation flag so it can fire again', async () => {
    const stats1 = buildStats({ A: 2, B: 2, C: 0, D: 0 });

    // Round 1 forced rotation fires
    const r1 = await selector.selectNextSpeaker(
      [], null, null, 1, 'task', new Set(), { stats: stats1, totalTurnsThisRound: 4 }
    );
    expect(r1.reason).toMatch(/forced rotation/i);

    // Without reset, second call at same threshold should NOT force again
    mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'A', shouldContinue: true }));
    const r2 = await selector.selectNextSpeaker(
      [], null, null, 1, 'task', new Set(), { stats: stats1, totalTurnsThisRound: 5 }
    );
    expect(r2.reason).not.toMatch(/forced rotation/i);

    // Now reset and verify forced rotation can fire again
    selector.resetForRound();
    mockProvider.chat.mockClear();
    const r3 = await selector.selectNextSpeaker(
      [], null, null, 2, 'task', new Set(), { stats: stats1, totalTurnsThisRound: 4 }
    );
    expect(r3.reason).toMatch(/forced rotation/i);
    expect(mockProvider.chat).not.toHaveBeenCalled();
  });
});
