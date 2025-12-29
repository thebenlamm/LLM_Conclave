import { Agent } from '../../types';

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export class CostEstimator {
  private static readonly PRICING = {
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
    // 1. Estimate Input Tokens
    // Question length / 4
    const questionTokens = Math.ceil(question.length / 4);

    // Story guidance: use question length only for input tokens (basic estimate)
    const totalInputTokens = questionTokens * agents.length;

    // 2. Estimate Output Tokens
    const outputTokensPerAgent = rounds * CostEstimator.TOKENS_PER_ROUND;
    const totalOutputTokens = outputTokensPerAgent * agents.length;
    
    // 3. Calculate Cost
    let totalUsd = 0;
    
    for (const agent of agents) {
      const price = this.getPrice(agent.model);
      
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

  private getPrice(model: string): { input: number; output: number } {
    // Normalize model name if needed
    if (model.includes('claude')) return this.getPricing('claude-sonnet-4-5');
    if (model.includes('gpt-4o')) return this.getPricing('gpt-4o');
    if (model.includes('gemini')) return this.getPricing('gemini-2.5-pro');
    
    return this.getPricing('default');
  }
  
  private getPricing(key: keyof typeof CostEstimator.PRICING) {
      return CostEstimator.PRICING[key] || CostEstimator.PRICING['default'];
  }
}
