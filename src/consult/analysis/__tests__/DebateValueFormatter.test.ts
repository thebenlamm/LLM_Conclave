import { DebateValueFormatter } from '../DebateValueFormatter';
import { DebateValueAnalysis } from '../../../types/consult';

describe('DebateValueFormatter', () => {
  it('formats debate value summary output', () => {
    const analysis: DebateValueAnalysis = {
      agentsChangedPosition: 1,
      totalAgents: 2,
      changeRate: 0.5,
      avgConfidenceIncrease: 0.1,
      keyInfluencers: ['pragmatist'],
      convergenceScore: 0.8,
      semanticComparisonCost: 0.001,
      agentAnalyses: [
        {
          agentId: 'security',
          agentName: 'Security Expert',
          round1Position: 'Use OAuth',
          round1Confidence: 0.7,
          round4Position: 'Use sessions',
          round4Confidence: 0.8,
          positionChanged: true,
          changeMagnitude: 'significant',
          confidenceDelta: 0.1,
          influencedBy: ['pragmatist'],
          semanticReasoning: 'Changed direction'
        },
        {
          agentId: 'architect',
          agentName: 'Architect',
          round1Position: 'Use OAuth',
          round1Confidence: 0.8,
          round4Position: 'Use OAuth',
          round4Confidence: 0.85,
          positionChanged: false,
          changeMagnitude: 'same',
          confidenceDelta: 0.05,
          influencedBy: [],
          semanticReasoning: 'Aligned'
        }
      ],
      keyInsights: ['Debate revealed MVP complexity concerns']
    };

    const formatter = new DebateValueFormatter();
    const output = formatter.formatValueSummary(analysis);

    expect(output).toContain('Debate Value Analysis');
    expect(output).toContain('Security Expert');
    expect(output).toContain('Key Insights');
    expect(output).toContain('Debate revealed MVP complexity concerns');
  });
});
