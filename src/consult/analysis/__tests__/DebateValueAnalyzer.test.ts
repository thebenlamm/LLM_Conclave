import LLMProvider from '../../../providers/LLMProvider';
import { CostTracker } from '../../../core/CostTracker';
import {
  IndependentArtifact,
  CrossExamArtifact,
  VerdictArtifact
} from '../../../types/consult';
import { DebateValueAnalyzer } from '../DebateValueAnalyzer';

class MockProvider extends LLMProvider {
  private responses: string[];

  constructor(responses: string[]) {
    super('gpt-4o-mini');
    this.responses = responses;
  }

  protected async performChat(): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
    const text = this.responses.shift() || '{"change":"same","reasoning":"default"}';
    return {
      text,
      usage: { input_tokens: 12, output_tokens: 8 }
    };
  }

  getProviderName(): string {
    return 'mock';
  }
}

describe('DebateValueAnalyzer', () => {
  const round1Artifact: IndependentArtifact = {
    artifactType: 'independent',
    schemaVersion: '1.0',
    agentId: 'security_expert',
    roundNumber: 1,
    position: 'Use OAuth 2.0 with JWT tokens',
    keyPoints: ['Security', 'Scalability'],
    rationale: 'OAuth is standard',
    confidence: 0.75,
    proseExcerpt: 'OAuth is standard.',
    createdAt: new Date().toISOString()
  };

  const crossExamArtifact: CrossExamArtifact = {
    artifactType: 'cross_exam',
    schemaVersion: '1.0',
    roundNumber: 3,
    challenges: [
      {
        challenger: 'pragmatist',
        targetAgent: 'security_expert',
        challenge: 'OAuth is too complex for MVP',
        evidence: []
      }
    ],
    rebuttals: [],
    unresolved: ['OAuth is too complex for MVP'],
    createdAt: new Date().toISOString()
  };

  const verdictArtifact: VerdictArtifact = {
    artifactType: 'verdict',
    schemaVersion: '1.0',
    roundNumber: 4,
    recommendation: 'Use session-based auth for MVP',
    confidence: 0.88,
    evidence: [],
    dissent: [],
    createdAt: new Date().toISOString()
  };

  it('extracts dissent stance when agent dissents', () => {
    const analyzer = new DebateValueAnalyzer(CostTracker.getInstance(), new MockProvider([]));
    const verdictWithDissent: VerdictArtifact = {
      ...verdictArtifact,
      dissent: [{ agent: 'security_expert', concern: 'Too risky for MVP', severity: 'medium' }]
    };

    const stance = analyzer.extractAgentFinalStance(verdictWithDissent, 'security_expert');
    expect(stance.position).toContain('Too risky for MVP');
    expect(stance.confidence).toBeCloseTo(0.704, 3);
  });

  it('detects influencers for changed positions', () => {
    const analyzer = new DebateValueAnalyzer(CostTracker.getInstance(), new MockProvider([]));
    const influencers = analyzer.detectInfluencers('security_expert', crossExamArtifact, true);
    expect(influencers).toContain('pragmatist');
  });

  it('calculates convergence score for consensus shifts', () => {
    const analyzer = new DebateValueAnalyzer(CostTracker.getInstance(), new MockProvider([]));
    const score = analyzer.calculateConvergenceScore([
      {
        agentId: 'a',
        agentName: 'a',
        round1Position: 'A',
        round1Confidence: 0.6,
        round4Position: 'A',
        round4Confidence: 0.8,
        positionChanged: false,
        changeMagnitude: 'same',
        confidenceDelta: 0.2,
        influencedBy: [],
        semanticReasoning: 'Aligned'
      },
      {
        agentId: 'b',
        agentName: 'b',
        round1Position: 'B',
        round1Confidence: 0.7,
        round4Position: 'B',
        round4Confidence: 0.8,
        positionChanged: false,
        changeMagnitude: 'minor',
        confidenceDelta: 0.1,
        influencedBy: [],
        semanticReasoning: 'Aligned'
      }
    ]);
    expect(score).toBeGreaterThan(0.5);
  });

  it('maps semantic change to magnitude with confidence delta support', () => {
    const analyzer = new DebateValueAnalyzer(CostTracker.getInstance(), new MockProvider([]));
    expect(analyzer.calculateChangeMagnitude({ change: 'same', reasoning: 'same' }, 0.2)).toBe('minor');
    expect(analyzer.calculateChangeMagnitude({ change: 'minor_refinement', reasoning: 'refine' }, 0.05)).toBe('minor');
    expect(analyzer.calculateChangeMagnitude({ change: 'moderate_shift', reasoning: 'shift' }, 0.05)).toBe('moderate');
    expect(analyzer.calculateChangeMagnitude({ change: 'significant_change', reasoning: 'big' }, 0.05)).toBe('significant');
  });

  it('analyzes agent positions with semantic comparison', async () => {
    const provider = new MockProvider(['{"change":"minor_refinement","reasoning":"Refined details"}']);
    const analyzer = new DebateValueAnalyzer(CostTracker.getInstance(), provider);

    const analysis = await analyzer.analyze([round1Artifact], crossExamArtifact, verdictArtifact);

    expect(analysis.totalAgents).toBe(1);
    expect(analysis.agentsChangedPosition).toBe(1);
    expect(analysis.agentAnalyses[0].changeMagnitude).toBe('minor');
    expect(analysis.agentAnalyses[0].influencedBy).toContain('pragmatist');
    expect(analysis.semanticComparisonCost).toBeGreaterThanOrEqual(0);
  });
});
