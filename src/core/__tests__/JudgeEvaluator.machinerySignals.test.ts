import { buildMachinerySignalsBlock } from '../JudgeEvaluator';
import type { MachinerySignals } from '../ConfidenceReconciler';

function baseSignals(overrides: Partial<MachinerySignals> = {}): MachinerySignals {
  return {
    aborted: false,
    allAgentsSpoke: true,
    turnBalanceOk: true,
    roundCompleteness: 1.0,
    ...overrides,
  };
}

describe('JudgeEvaluator.buildMachinerySignalsBlock (Phase 13.1)', () => {
  it('returns empty string when no signals supplied', () => {
    expect(buildMachinerySignalsBlock(undefined)).toBe('');
  });

  it('nominal signals: no Participation or History compression lines', () => {
    const block = buildMachinerySignalsBlock(baseSignals());
    expect(block).not.toContain('Participation:');
    expect(block).not.toContain('History compression:');
    expect(block).toContain('Run aborted: no');
    expect(block).toContain('All agents spoke: yes');
  });

  it('renders Participation line with absent-silent agent including name and reason', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        participation: [
          { agent: 'agent-a', turns: 3, status: 'spoken' },
          { agent: 'agent-b', turns: 2, status: 'spoken' },
          { agent: 'agent-c', turns: 0, status: 'absent-silent' },
        ],
      })
    );
    expect(block).toContain('Participation:');
    expect(block).toContain('agent-c');
    expect(block).toContain('never selected');
  });

  it('renders Participation line with absent-capped agent including ratio 2.80', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        participation: [
          { agent: 'agent-a', turns: 5, status: 'spoken' },
          { agent: 'agent-b', turns: 0, status: 'absent-capped', ratioAtExclusion: 2.8 },
        ],
      })
    );
    expect(block).toContain('Participation:');
    expect(block).toContain('agent-b');
    expect(block).toContain('fairness cap');
    expect(block).toContain('ratio 2.80');
  });

  it('renders Participation line with absent-failed agent', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        participation: [
          { agent: 'agent-a', turns: 3, status: 'spoken' },
          { agent: 'agent-b', turns: 0, status: 'absent-failed' },
        ],
      })
    );
    expect(block).toContain('agent-b');
    expect(block).toContain('all turns failed');
  });

  it('renders "all configured agents spoke" when participation present but empty of absences', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        participation: [
          { agent: 'agent-a', turns: 3, status: 'spoken' },
          { agent: 'agent-b', turns: 2, status: 'spoken' },
        ],
      })
    );
    expect(block).toContain('Participation: all configured agents spoke.');
  });

  it('renders History compression line when active', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        compression: { active: true, activatedAtRound: 3, summaryRegenerations: 2 },
      })
    );
    expect(block).toContain('History compression: active from round 3 (2 summary updates).');
  });

  it('omits History compression line when inactive', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        compression: { active: false, activatedAtRound: null, summaryRegenerations: 0 },
      })
    );
    expect(block).not.toContain('History compression:');
  });

  it('renders both Participation and History compression together', () => {
    const block = buildMachinerySignalsBlock(
      baseSignals({
        participation: [
          { agent: 'agent-a', turns: 4, status: 'spoken' },
          { agent: 'agent-b', turns: 0, status: 'absent-silent' },
        ],
        compression: { active: true, activatedAtRound: 5, summaryRegenerations: 1 },
      })
    );
    expect(block).toContain('Participation:');
    expect(block).toContain('agent-b');
    expect(block).toContain('History compression: active from round 5');
  });
});
