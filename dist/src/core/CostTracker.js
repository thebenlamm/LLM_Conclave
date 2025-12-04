"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostTracker = void 0;
class CostTracker {
    constructor() {
        this.logs = [];
        // Last Updated: 2025-12-03
        // Pricing sources:
        // - OpenAI: https://openai.com/api/pricing/
        // - Anthropic: https://www.anthropic.com/pricing
        // - Google Gemini: https://ai.google.dev/pricing
        // - Mistral: https://mistral.ai/technology/#pricing
        this.pricing = {
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
            'claude-opus-4-5': { input: 0.015, output: 0.075 },
            'claude-haiku-4-5': { input: 0.0008, output: 0.004 },
            // Google
            'gemini-pro': { input: 0.000125, output: 0.000375 },
            'gemini-1.5-pro-latest': { input: 0.0035, output: 0.0105 },
            'gemini-1.5-flash-latest': { input: 0.00035, output: 0.00105 },
            'gemini-2.0-flash': { input: 0.00035, output: 0.00105 }, // Check pricing against current Gemini 2.0 rates
            'gemini-2.5-flash': { input: 0.00035, output: 0.00105 }, // Note: Pricing needs verification
            'gemini-2.5-pro': { input: 0.0035, output: 0.0105 }, // Pro-tier pricing subject to updates
            'gemini-2.5-pro-exp': { input: 0.0, output: 0.0 }, // Experimental preview
            'gemini-3-pro': { input: 0.0, output: 0.0 }, // Pricing not yet published
            'gemini-exp-1206': { input: 0.0, output: 0.0 }, // Free experimental model
            // Mistral
            'mistral-large-latest': { input: 0.008, output: 0.024 },
            'mistral-small-latest': { input: 0.002, output: 0.006 },
            'codestral-latest': { input: 0.008, output: 0.024 },
            // Grok
            'grok-3': { input: 0.0, output: 0.0 }, // Placeholder, pricing not public
        };
    }
    static getInstance() {
        if (!CostTracker.instance) {
            CostTracker.instance = new CostTracker();
        }
        return CostTracker.instance;
    }
    logCall(log) {
        const price = this.pricing[log.model] || { input: 0, output: 0 };
        const cost = (log.inputTokens / 1000) * price.input + (log.outputTokens / 1000) * price.output;
        this.logs.push({ ...log, cost });
    }
    getSummary() {
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
    getLogs() {
        return this.logs;
    }
}
exports.CostTracker = CostTracker;
