import { displayDashboard } from '../consult-stats';

describe('consult-stats dashboard output', () => {
  it('prints debate value metrics section', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    displayDashboard({
      totalConsultations: 10,
      dateRange: { start: '2025-01-01', end: '2025-01-10', totalDays: 10 },
      activeDays: 5,
      avgPerDay: 2,
      byState: { completed: 8, aborted: 2 },
      performance: { p50: 1000, p95: 2000, p99: 3000, avgDuration: 1500, fastest: { id: 'a', durationMs: 500 }, slowest: { id: 'b', durationMs: 4000 } },
      cost: { total: 1.23, avgPerConsultation: 0.12, totalTokens: 1234, byProvider: {}, mostExpensive: { id: 'a', cost: 0.5 }, cheapest: { id: 'b', cost: 0.1 } },
      quality: { avgConfidence: 80, highConfidence: 5, lowConfidence: 1, withDissent: 2 },
      debateValue: {
        avgPositionChanges: 1.8,
        avgChangeRate: 0.6,
        avgConfidenceIncrease: 0.11,
        avgConvergenceScore: 0.82,
        highValueDebates: 6,
        totalSemanticComparisonCost: 0.012,
        avgTotalAgents: 3
      }
    }, 'all-time');

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Debate Value Metrics');
    expect(output).toContain('Avg Position Changes');
    expect(output).toContain('Semantic Comparison Cost');

    logSpy.mockRestore();
  });
});
