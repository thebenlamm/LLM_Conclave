import TurnDistributionReporter, { AgentTurnSnapshot } from '../TurnDistributionReporter';
import { EventBus } from '../EventBus';

describe('TurnDistributionReporter — Phase 13.1 cap-exclusion + participation + absence events', () => {
  let reporter: TurnDistributionReporter;
  let eventBus: EventBus;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    reporter = new TurnDistributionReporter();
    eventBus = new EventBus();
    spy = jest.spyOn(eventBus, 'emitEvent');
  });

  function spoke(name: string, turns: number, tokens = turns * 100): AgentTurnSnapshot {
    return { name, turns, tokens };
  }

  it('recordCapExclusion stores round + ratio on first call, dedupes repeated rounds', () => {
    reporter.recordCapExclusion('bob', 2, 2.8);
    reporter.recordCapExclusion('bob', 2, 3.1); // same round — should dedupe
    reporter.recordCapExclusion('bob', 3, 3.5); // new round — should append
    const report = reporter.buildParticipationReport(['bob']);
    const bob = report.find(r => r.agent === 'bob')!;
    expect(bob.status).toBe('absent-capped');
    expect(bob.rounds).toEqual([2, 3]);
    expect(bob.ratioAtExclusion).toBe(2.8); // first ratio wins
  });

  it('buildParticipationReport returns "spoken" for agents with turns > 0', () => {
    reporter.report([spoke('alice', 3)], 1, eventBus);
    const report = reporter.buildParticipationReport(['alice']);
    expect(report).toHaveLength(1);
    expect(report[0]).toEqual({ agent: 'alice', turns: 3, status: 'spoken' });
  });

  it('buildParticipationReport returns "absent-silent" for zero-turn agent with no cap/fail data', () => {
    reporter.report([spoke('alice', 2), spoke('carol', 0)], 1, eventBus);
    const report = reporter.buildParticipationReport(['alice', 'carol']);
    const carol = report.find(r => r.agent === 'carol')!;
    expect(carol.status).toBe('absent-silent');
    expect(carol.turns).toBe(0);
    expect(carol.reason).toMatch(/never selected/i);
  });

  it('buildParticipationReport returns "absent-capped" with rounds + ratioAtExclusion', () => {
    reporter.report([spoke('alice', 5), spoke('bob', 0)], 1, eventBus);
    reporter.recordCapExclusion('bob', 2, 2.8);
    const report = reporter.buildParticipationReport(['alice', 'bob']);
    const bob = report.find(r => r.agent === 'bob')!;
    expect(bob.status).toBe('absent-capped');
    expect(bob.rounds).toEqual([2]);
    expect(bob.ratioAtExclusion).toBeCloseTo(2.8);
    expect(bob.reason).toMatch(/fairness cap/i);
  });

  it('buildParticipationReport returns "absent-failed" when agent is in failedAgents set', () => {
    reporter.report([spoke('alice', 2), spoke('dave', 0)], 1, eventBus);
    const report = reporter.buildParticipationReport(
      ['alice', 'dave'],
      new Set(['dave'])
    );
    const dave = report.find(r => r.agent === 'dave')!;
    expect(dave.status).toBe('absent-failed');
    expect(dave.reason).toMatch(/failed/i);
  });

  it('failedAgents takes precedence over cap exclusion for an agent with zero turns', () => {
    reporter.recordCapExclusion('dave', 1, 3.0);
    const report = reporter.buildParticipationReport(['dave'], new Set(['dave']));
    expect(report[0].status).toBe('absent-failed');
  });

  it('finalizeAbsenceEvents emits one conversation:agent_absent per non-spoken entry', () => {
    reporter = new TurnDistributionReporter(eventBus);
    reporter.report([spoke('alice', 2), spoke('bob', 0), spoke('carol', 0)], 1, eventBus);
    reporter.recordCapExclusion('bob', 2, 2.8);
    const report = reporter.buildParticipationReport(
      ['alice', 'bob', 'carol', 'dave'],
      new Set(['dave'])
    );
    reporter.finalizeAbsenceEvents(report);

    const absentCalls = spy.mock.calls.filter(c => c[0] === 'conversation:agent_absent');
    expect(absentCalls).toHaveLength(3); // bob, carol, dave — not alice

    const agents = absentCalls.map(c => c[1].agentName).sort();
    expect(agents).toEqual(['bob', 'carol', 'dave']);

    const bobCall = absentCalls.find(c => c[1].agentName === 'bob')!;
    expect(bobCall[1]).toMatchObject({
      agentName: 'bob',
      status: 'capped',
      rounds: [2],
    });

    const daveCall = absentCalls.find(c => c[1].agentName === 'dave')!;
    expect(daveCall[1].status).toBe('failed');

    const carolCall = absentCalls.find(c => c[1].agentName === 'carol')!;
    expect(carolCall[1].status).toBe('silent');
  });

  it('finalizeAbsenceEvents is idempotent — calling twice does not double-emit', () => {
    reporter = new TurnDistributionReporter(eventBus);
    reporter.recordCapExclusion('bob', 2, 2.8);
    const report = reporter.buildParticipationReport(['bob']);
    reporter.finalizeAbsenceEvents(report);
    reporter.finalizeAbsenceEvents(report);
    const absentCalls = spy.mock.calls.filter(c => c[0] === 'conversation:agent_absent');
    expect(absentCalls).toHaveLength(1);
  });

  it('existing report() still emits turn_distribution_updated and fairness_alarm', () => {
    reporter.report(
      [
        { name: 'alice', turns: 10, tokens: 5000 },
        { name: 'bob', turns: 1, tokens: 100 },
      ],
      1,
      eventBus
    );
    const types = spy.mock.calls.map(c => c[0]);
    expect(types).toContain('turn_distribution_updated');
    expect(types).toContain('fairness_alarm');
  });
});
