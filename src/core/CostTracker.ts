export interface CallLog {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latency: number; // in milliseconds
  success: boolean;
  cost: number;
}

export interface ModelPricing {
  [model: string]: {
    input: number; // cost per 1000 tokens
    output: number; // cost per 1000 tokens
  };
}

export class CostTracker {
  private static instance: CostTracker;
  private logs: CallLog[] = [];
  private pricing: ModelPricing = {
    // OpenAI
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },

    // Anthropic
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },

    // Google
    'gemini-pro': { input: 0.000125, output: 0.000375 },
    'gemini-1.5-pro-latest': { input: 0.0035, output: 0.0105 },
    'gemini-1.5-flash-latest': { input: 0.00035, output: 0.00105 },

    // Mistral
    'mistral-large-latest': { input: 0.008, output: 0.024 },
    'mistral-small-latest': { input: 0.002, output: 0.006 },
    'codestral-latest': { input: 0.008, output: 0.024 },

    // Grok
    'grok-3': { input: 0.0, output: 0.0 }, // Placeholder, pricing not public
  };

  private constructor() {}

  public static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker();
    }
    return CostTracker.instance;
  }

  public logCall(log: Omit<CallLog, 'cost'>): void {
    const price = this.pricing[log.model] || { input: 0, output: 0 };
    const cost = (log.inputTokens / 1000) * price.input + (log.outputTokens / 1000) * price.output;
    this.logs.push({ ...log, cost });
  }

  public getSummary(): { totalCost: number; totalCalls: number; totalTokens: { input: number; output: number }, averageLatency: number } {
    const totalCost = this.logs.reduce((sum, log) => sum + log.cost, 0);
    const totalCalls = this.logs.length;
    const totalTokens = this.logs.reduce((sum, log) => ({
      input: sum.input + log.inputTokens,
      output: sum.output + log.outputTokens,
    }), { input: 0, output: 0 });
    const totalLatency = this.logs.reduce((sum, log) => sum + log.latency, 0);
    const averageLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;

    return { totalCost, totalCalls, totalTokens, averageLatency };
  }

  public getLogs(): CallLog[] {
    return this.logs;
  }
}