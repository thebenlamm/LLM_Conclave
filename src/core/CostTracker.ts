export interface CallLog {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens?: number;    // Tokens served from provider cache (discounted)
  cachedWriteTokens?: number;   // Tokens written to provider cache (surcharge on first call)
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
  // Last Updated: 2025-12-03
  // Pricing sources:
  // - OpenAI: https://openai.com/api/pricing/
  // - Anthropic: https://www.anthropic.com/pricing
  // - Google Gemini: https://ai.google.dev/pricing
  // - Mistral: https://mistral.ai/technology/#pricing
  private pricing: ModelPricing = {
    // OpenAI
    'gpt-5': { input: 0.00125, output: 0.01 },
    'gpt-5-mini': { input: 0.00025, output: 0.002 },
    'gpt-5-nano': { input: 0.0001, output: 0.0004 }, // Estimated: reported to scale down further
    'gpt-4.1': { input: 0.003, output: 0.012 },
    'gpt-4.1-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'o1-preview': { input: 0.015, output: 0.06 },
    'o1-mini': { input: 0.003, output: 0.012 },

    // Anthropic Claude (full API names and shorthand)
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
    // Shorthand names (mapped by ProviderFactory)
    'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
    'claude-opus-4-5': { input: 0.005, output: 0.025 },
    'claude-haiku-4-5': { input: 0.001, output: 0.005 },

    // Google
    'gemini-pro': { input: 0.000125, output: 0.000375 },
    'gemini-1.5-pro-latest': { input: 0.0035, output: 0.0105 },
    'gemini-1.5-flash-latest': { input: 0.00035, output: 0.00105 },
    'gemini-2.0-flash': { input: 0.00035, output: 0.00105 },          // Check pricing against current Gemini 2.0 rates
    'gemini-2.5-flash': { input: 0.00035, output: 0.00105 },          // Note: Pricing needs verification
    'gemini-2.5-pro': { input: 0.0035, output: 0.0105 },              // Pro-tier pricing subject to updates
    'gemini-2.5-pro-exp': { input: 0.0, output: 0.0 },                // Experimental preview
    'gemini-3-pro': { input: 0.0, output: 0.0 },                      // Pricing not yet published
    'gemini-exp-1206': { input: 0.0, output: 0.0 },                   // Free experimental model

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

  // Cache discount rates by provider
  private static CACHE_READ_DISCOUNT: Record<string, number> = {
    anthropic: 0.9,   // 90% discount on cached reads
    openai: 0.5,      // 50% discount
    grok: 0.5,        // 50% discount (OpenAI-compatible)
    gemini: 0.75,     // 75-90% discount, use conservative estimate
    mistral: 0,       // No provider caching
  };

  private static CACHE_WRITE_SURCHARGE: Record<string, number> = {
    anthropic: 0.25,  // 25% surcharge on cache writes (5-min TTL)
    openai: 0,        // No write surcharge
    grok: 0,          // No write surcharge
    gemini: 0,        // Storage fee is separate, not per-token surcharge
    mistral: 0,
  };

  public logCall(log: Omit<CallLog, 'cost'>): void {
    const price = this.pricing[log.model] || { input: 0, output: 0 };
    const cachedRead = log.cachedReadTokens || 0;
    const cachedWrite = log.cachedWriteTokens || 0;
    const uncachedInput = log.inputTokens - cachedRead - cachedWrite;

    const readDiscount = CostTracker.CACHE_READ_DISCOUNT[log.provider] || 0;
    const writeSurcharge = CostTracker.CACHE_WRITE_SURCHARGE[log.provider] || 0;

    const cost =
      (uncachedInput / 1000) * price.input +
      (cachedRead / 1000) * price.input * (1 - readDiscount) +
      (cachedWrite / 1000) * price.input * (1 + writeSurcharge) +
      (log.outputTokens / 1000) * price.output;

    this.logs.push({ ...log, cachedReadTokens: cachedRead, cachedWriteTokens: cachedWrite, cost });
  }

  public getSummary(): {
    totalCost: number;
    totalCalls: number;
    totalTokens: { input: number; output: number };
    cachedTokens: { read: number; write: number };
    cacheHitRate: number;
    costWithoutCache: number;
    averageLatency: number;
  } {
    let totalCost = 0;
    let costWithoutCache = 0;
    let totalLatency = 0;
    const totalTokens = { input: 0, output: 0 };
    const cachedTokens = { read: 0, write: 0 };

    for (const log of this.logs) {
      totalCost += log.cost;
      totalLatency += log.latency;
      totalTokens.input += log.inputTokens;
      totalTokens.output += log.outputTokens;
      cachedTokens.read += log.cachedReadTokens || 0;
      cachedTokens.write += log.cachedWriteTokens || 0;

      // Calculate what this would have cost without caching
      const price = this.pricing[log.model] || { input: 0, output: 0 };
      costWithoutCache += (log.inputTokens / 1000) * price.input + (log.outputTokens / 1000) * price.output;
    }

    const totalCalls = this.logs.length;
    const averageLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;
    const totalCacheableInput = totalTokens.input;
    const cacheHitRate = totalCacheableInput > 0 ? cachedTokens.read / totalCacheableInput : 0;

    return { totalCost, totalCalls, totalTokens, cachedTokens, cacheHitRate, costWithoutCache, averageLatency };
  }

  public getLogs(): CallLog[] {
    return this.logs;
  }
}