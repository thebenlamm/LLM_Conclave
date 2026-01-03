import ProviderFactory from '../../providers/ProviderFactory';
import LLMProvider from '../../providers/LLMProvider';
import { CostTracker } from '../../core/CostTracker';
import {
  IndependentArtifact,
  CrossExamArtifact,
  VerdictArtifact,
  AgentPositionChange,
  DebateValueAnalysis
} from '../../types/consult';

type SemanticChange = 'same' | 'minor_refinement' | 'moderate_shift' | 'significant_change';

export interface SemanticComparison {
  change: SemanticChange;
  reasoning: string;
}

type AgentPosition = {
  position: string;
  confidence: number;
};

export class SemanticComparer {
  private provider: LLMProvider;
  private costTracker: CostTracker;
  private totalCostUsd: number = 0;

  constructor(costTracker: CostTracker, provider?: LLMProvider) {
    if (provider) {
      this.provider = provider;
    } else {
      // Allow configuration via environment variable, default to gpt-4o-mini
      const model = process.env.SEMANTIC_ANALYSIS_MODEL || 'gpt-4o-mini';
      try {
        this.provider = ProviderFactory.createProvider(model);
      } catch (error) {
        console.warn(`Failed to create provider for semantic analysis with model '${model}'. Falling back to 'gpt-4o-mini'.`, error);
        this.provider = ProviderFactory.createProvider('gpt-4o-mini');
      }
    }
    this.costTracker = costTracker;
  }

  public async compareSemantically(position1: string, position2: string): Promise<SemanticComparison> {
    const prompt = `
Compare these two positions semantically and determine how much the position changed.

INITIAL POSITION (Round 1):
${position1}

FINAL POSITION (Round 4):
${position2}

Respond with a JSON object:
{
  "change": "same" | "minor_refinement" | "moderate_shift" | "significant_change",
  "reasoning": "Brief explanation of why this classification"
}

Definitions:
- same: Positions are semantically identical or nearly identical
- minor_refinement: Same core recommendation with refined details
- moderate_shift: Same general direction but different specifics
- significant_change: Completely different recommendation
`;

    const beforeCost = this.costTracker.getSummary().totalCost;
    try {
      const response = await this.provider.chat([{ role: 'user', content: prompt }]);
      const afterCost = this.costTracker.getSummary().totalCost;
      this.totalCostUsd += Math.max(0, afterCost - beforeCost);

      const text = response.text || '';
      return this.parseSemanticResponse(text);
    } catch (error: any) {
      const afterCost = this.costTracker.getSummary().totalCost;
      this.totalCostUsd += Math.max(0, afterCost - beforeCost);
      return {
        change: 'moderate_shift',
        reasoning: `Semantic comparison failed: ${error.message || 'unknown error'}`
      };
    }
  }

  public getTotalCostUsd(): number {
    return this.totalCostUsd;
  }

  private parseSemanticResponse(text: string): SemanticComparison {
    const json = this.extractJSON(text);

    const change = json.change as SemanticChange | undefined;
    const reasoning = typeof json.reasoning === 'string' ? json.reasoning : '';

    if (!change) {
      return {
        change: 'moderate_shift',
        reasoning: reasoning || 'No change classification returned; defaulted to moderate_shift.'
      };
    }

    return {
      change,
      reasoning: reasoning || 'No reasoning provided.'
    };
  }

  private extractJSON(text: string): any {
    if (!text) return {};

    const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    let jsonText = text;
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1];
    } else {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = text.substring(firstBrace, lastBrace + 1);
      }
    }

    try {
      return JSON.parse(jsonText);
    } catch {
      return {};
    }
  }
}

export class DebateValueAnalyzer {
  private semanticComparer: SemanticComparer;

  constructor(costTracker: CostTracker, provider?: LLMProvider) {
    this.semanticComparer = new SemanticComparer(costTracker, provider);
  }

  public async analyze(
    round1Artifacts: IndependentArtifact[],
    crossExamArtifact: CrossExamArtifact | null,
    verdictArtifact: VerdictArtifact
  ): Promise<DebateValueAnalysis> {
    const agentAnalyses: AgentPositionChange[] = [];

    for (const artifact of round1Artifacts) {
      const analysis = await this.analyzeAgentPosition(artifact, verdictArtifact, crossExamArtifact);
      agentAnalyses.push(analysis);
    }

    const totalAgents = agentAnalyses.length;
    const agentsChangedPosition = agentAnalyses.filter(a => a.positionChanged).length;
    const changeRate = totalAgents > 0 ? agentsChangedPosition / totalAgents : 0;
    const avgConfidenceIncrease = totalAgents > 0
      ? agentAnalyses.reduce((sum, a) => sum + a.confidenceDelta, 0) / totalAgents
      : 0;
    const keyInfluencers = this.determineKeyInfluencers(agentAnalyses);
    const convergenceScore = this.calculateConvergenceScore(agentAnalyses);
    const semanticComparisonCost = this.semanticComparer.getTotalCostUsd();
    const keyInsights = this.generateKeyInsights(agentAnalyses);

    return {
      agentsChangedPosition,
      totalAgents,
      changeRate,
      avgConfidenceIncrease,
      keyInfluencers,
      convergenceScore,
      semanticComparisonCost,
      agentAnalyses,
      keyInsights
    };
  }

  public extractAgentPosition(artifact: IndependentArtifact): AgentPosition {
    return {
      position: artifact.position,
      confidence: artifact.confidence
    };
  }

  public extractAgentFinalStance(verdict: VerdictArtifact, agentId: string): AgentPosition {
    const dissent = verdict.dissent.find(d => d.agent === agentId);
    if (dissent) {
      return {
        position: `Dissent: ${dissent.concern}`,
        confidence: verdict.confidence * 0.8
      };
    }

    return {
      position: verdict.recommendation,
      confidence: verdict.confidence
    };
  }

  public calculateChangeMagnitude(semantic: SemanticComparison, confidenceDelta: number): AgentPositionChange['changeMagnitude'] {
    if (semantic.change === 'same' && Math.abs(confidenceDelta) >= 0.15) {
      return 'minor';
    }

    switch (semantic.change) {
      case 'same':
        return 'same';
      case 'minor_refinement':
        return 'minor';
      case 'moderate_shift':
        return 'moderate';
      case 'significant_change':
        return 'significant';
      default:
        return 'moderate';
    }
  }

  public detectInfluencers(
    agentId: string,
    crossExam: CrossExamArtifact | null,
    positionChanged: boolean
  ): string[] {
    if (!positionChanged || !crossExam) return [];

    const challengesReceived = crossExam.challenges.filter(c => c.targetAgent === agentId);
    if (challengesReceived.length === 0) return [];

    const influencers = challengesReceived
      .filter(challenge => {
        if (crossExam.unresolved.length === 0) return true;
        const snippet = challenge.challenge.slice(0, 30);
        return crossExam.unresolved.some(item => item.includes(snippet));
      })
      .map(challenge => challenge.challenger);

    return [...new Set(influencers)];
  }

  public calculateConvergenceScore(analyses: AgentPositionChange[]): number {
    if (analyses.length === 0) return 0;

    const avgConfidenceIncrease = analyses.reduce((sum, a) => sum + a.confidenceDelta, 0) / analyses.length;
    const confidenceScore = Math.min(Math.max(avgConfidenceIncrease / 0.3, 0), 1);
    const convergentChanges = analyses.filter(a => a.changeMagnitude === 'same' || a.changeMagnitude === 'minor').length;
    const diversityScore = convergentChanges / analyses.length;

    return (confidenceScore * 0.3) + (diversityScore * 0.7);
  }

  private async analyzeAgentPosition(
    round1: IndependentArtifact,
    verdict: VerdictArtifact,
    crossExam: CrossExamArtifact | null
  ): Promise<AgentPositionChange> {
    const round1Position = this.extractAgentPosition(round1);
    const finalStance = this.extractAgentFinalStance(verdict, round1.agentId);
    const semanticResult = await this.semanticComparer.compareSemantically(
      round1Position.position,
      finalStance.position
    );
    const confidenceDelta = finalStance.confidence - round1Position.confidence;
    const changeMagnitude = this.calculateChangeMagnitude(semanticResult, confidenceDelta);
    const positionChanged = semanticResult.change !== 'same';
    const influencedBy = this.detectInfluencers(round1.agentId, crossExam, positionChanged);

    return {
      agentId: round1.agentId,
      agentName: round1.agentId,
      round1Position: round1Position.position,
      round1Confidence: round1Position.confidence,
      round4Position: finalStance.position,
      round4Confidence: finalStance.confidence,
      positionChanged,
      changeMagnitude,
      confidenceDelta,
      influencedBy,
      semanticReasoning: semanticResult.reasoning
    };
  }

  private determineKeyInfluencers(analyses: AgentPositionChange[]): string[] {
    const influencerCounts: Record<string, number> = {};

    analyses.forEach(analysis => {
      analysis.influencedBy.forEach(influencer => {
        influencerCounts[influencer] = (influencerCounts[influencer] || 0) + 1;
      });
    });

    return Object.entries(influencerCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([influencer]) => influencer);
  }

  private generateKeyInsights(analyses: AgentPositionChange[]): string[] {
    const insights: string[] = [];

    const unchanged = analyses.filter(a => !a.positionChanged);
    if (analyses.length > 0 && unchanged.length >= analyses.length * 0.66) {
      insights.push('Strong initial consensus - agents aligned from Round 1');
    }

    const significantShifts = analyses.filter(a => a.changeMagnitude === 'significant');
    if (significantShifts.length > 0) {
      insights.push(`Debate revealed critical new perspectives (${significantShifts.length} major position shifts)`);
    }

    const influencerCounts: Record<string, number> = {};
    analyses.flatMap(a => a.influencedBy).forEach(influencer => {
      influencerCounts[influencer] = (influencerCounts[influencer] || 0) + 1;
    });
    const topInfluencer = Object.entries(influencerCounts).sort((a, b) => b[1] - a[1])[0];
    if (topInfluencer && topInfluencer[1] >= 2) {
      insights.push(`${topInfluencer[0]} was the key influencer in this debate`);
    }

    return insights;
  }
}
