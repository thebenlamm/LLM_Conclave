"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CostTracker_1 = require("../core/CostTracker");
/**
 * Base class for all LLM providers
 * Defines the interface that all LLM implementations must follow
 */
class LLMProvider {
    constructor(modelName) {
        this.modelName = modelName;
    }
    /**
     * Send a message to the LLM and get a response.
     * This method handles the timing and cost tracking for the call.
     * @param messages - Array of message objects
     * @param systemPrompt - Optional system prompt to guide the LLM
     * @param options - Optional parameters like tools
     * @returns The LLM's response with text and optional tool calls
     */
    async chat(messages, systemPrompt, options) {
        const startTime = Date.now();
        let success = false;
        let response;
        try {
            response = await this.performChat(messages, systemPrompt, options);
            success = true;
            return response;
        }
        catch (error) {
            // Re-throw the error after logging
            throw error;
        }
        finally {
            const endTime = Date.now();
            const latency = endTime - startTime;
            // @ts-ignore
            const inputTokens = response?.usage?.input_tokens || 0;
            // @ts-ignore
            const outputTokens = response?.usage?.output_tokens || 0;
            CostTracker_1.CostTracker.getInstance().logCall({
                provider: this.getProviderName(),
                model: this.getModelName(),
                inputTokens,
                outputTokens,
                latency,
                success,
            });
        }
    }
    /**
     * Get the model name
     */
    getModelName() {
        return this.modelName;
    }
}
exports.default = LLMProvider;
