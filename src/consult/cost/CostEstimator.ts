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
    
    // Each agent receives the question in Round 1
    // And context accumulates. For a rough pre-flight estimate, we assume:
    // Round 1: Question
    // Round 2: Question + Round 1 responses
    // Round 3: Question + Round 1 + Round 2
    // Round 4: Question + All history
    // This is complex. The story asks for "basic pre-flight cost".
    // "Input tokens from question text"
    // "Expected output tokens (agents x rounds x 2000 tokens/round)"
    
    // We will stick to the simplified formula from the story for now, 
    // but maybe add a multiplier for input context growing.
    
    const totalInputTokens = questionTokens * agents.length * rounds; // Simplified: input sent every time? 
    // Actually input context grows. But let's follow the story's "basic" guidance if it was specific.
    // Story says: "- Input tokens from question text (length / 4 rough estimate)"
    // "- Expected output tokens (agents x rounds x 2000 tokens/round)"
    // "- Total estimated cost using provider pricing"
    
    const inputTokens = questionTokens; // Base input
    
    // 2. Estimate Output Tokens
    const outputTokensPerAgent = rounds * CostEstimator.TOKENS_PER_ROUND;
    const totalOutputTokens = outputTokensPerAgent * agents.length;
    
    // 3. Calculate Cost
    let totalUsd = 0;
    
    for (const agent of agents) {
      const price = this.getPrice(agent.model);
      
      // Cost for this agent
      // Input: Assumes question is sent to agent (plus overhead/context which is hard to predict exactly pre-flight without context size)
      // We will assume "Input Tokens" applies to each agent call for now.
      const agentInputCost = (inputTokens / 1000) * price.input * rounds; 
      const agentOutputCost = (outputTokensPerAgent / 1000) * price.output;
      
      totalUsd += agentInputCost + agentOutputCost;
    }
    
    return {
      inputTokens: inputTokens * agents.length * rounds,
      outputTokens: totalOutputTokens,
      totalTokens: (inputTokens * agents.length * rounds) + totalOutputTokens,
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
