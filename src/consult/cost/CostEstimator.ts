import { Agent } from '../../types';

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export class CostEstimator {
  public static readonly PRICING = {
    'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
    // Defaults/Fallbacks
    'default': { input: 0.003, output: 0.015 }
  };

  private static readonly TOKENS_PER_ROUND = 2000;

  /**
   * Estimate the cost of a consultation
   */
  public estimateCost(question: string, agents: Agent[], rounds: number = 4): CostEstimate {
    const safeRounds = Math.max(0, rounds);
    // 1. Estimate Input Tokens
    // Question length / 4
    const questionTokens = Math.ceil(question.length / 4);

    // Story guidance: use question length only for input tokens (basic estimate)
    const totalInputTokens = questionTokens * agents.length;

    // 2. Estimate Output Tokens
    const outputTokensPerAgent = safeRounds * CostEstimator.TOKENS_PER_ROUND;
    const totalOutputTokens = outputTokensPerAgent * agents.length;
    
    // 3. Calculate Cost
    let totalUsd = 0;
    
    for (const agent of agents) {
      const price = CostEstimator.getPrice(agent.model);
      
      // Cost for this agent
      // Input: question text sent once per agent for basic estimate
      const agentInputCost = (questionTokens / 1000) * price.input;
      const agentOutputCost = (outputTokensPerAgent / 1000) * price.output;
      
      totalUsd += agentInputCost + agentOutputCost;
    }
    
    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCostUsd: totalUsd
    };
  }

  public static getPrice(model: string): { input: number; output: number } {
    // Normalize model name if needed
    const normalized = model.toLowerCase();
    if (normalized.includes('claude')) return this.getPricing('claude-sonnet-4-5');
    if (normalized.includes('gpt-4o')) return this.getPricing('gpt-4o');
    if (normalized.includes('gemini')) return this.getPricing('gemini-2.5-pro');
    
    return this.getPricing('default');
  }
  
  public static getPricing(key: keyof typeof CostEstimator.PRICING) {
      return CostEstimator.PRICING[key] || CostEstimator.PRICING['default'];
  }

  /**
   * Calculate potential savings from early termination
   * Assumes skipping Rounds 3 and 4
   */
  public calculateEarlyTerminationSavings(agents: Agent[], roundsSkipped: number = 2): number {
    let totalSavings = 0;
    
    // Cost per round = tokens * price
    const tokensPerRound = CostEstimator.TOKENS_PER_ROUND;

    for (const agent of agents) {
        const price = CostEstimator.getPrice(agent.model);
        const roundCost = (tokensPerRound / 1000) * (price.input + price.output);
        totalSavings += roundCost * roundsSkipped;
    }

    return totalSavings;
  }

  /**
   * Estimate token savings between unfiltered and filtered artifacts
   */
  public estimateTokenSavings(
    unfilteredArtifacts: any[],
    filteredArtifacts: any[]
  ): number {
    const unfilteredTokens = this.estimateTokens(JSON.stringify(unfilteredArtifacts));
    const filteredTokens = this.estimateTokens(JSON.stringify(filteredArtifacts));
    return Math.max(0, unfilteredTokens - filteredTokens);
  }

  /**
   * Calculate efficiency percentage
   * @param saved Tokens saved via filtering
   * @param total Theoretical total tokens without filtering (used + saved)
   */
  public calculateEfficiencyPercentage(saved: number, total: number): number {
    if (total === 0) return 0;
    // Edge case: saved should never exceed total (Story 2.6, Fix #6)
    if (saved > total) {
      throw new Error(`Invalid token savings calculation: saved (${saved}) exceeds total (${total})`);
    }
    return Math.min(100, (saved / total) * 100);
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }
}
