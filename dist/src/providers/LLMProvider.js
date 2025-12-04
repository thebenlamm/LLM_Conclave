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
     * Check if an error is retryable (network errors, rate limits)
     */
    isRetryableError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        // Network errors
        if (errorMessage.includes('fetch failed') ||
            errorMessage.includes('network error') ||
            errorMessage.includes('econnreset') ||
            errorMessage.includes('etimedout') ||
            errorMessage.includes('socket hang up')) {
            return true;
        }
        // Rate limiting
        if (errorMessage.includes('rate limit') ||
            errorMessage.includes('too many requests') ||
            errorMessage.includes('429')) {
            return true;
        }
        // Service unavailable
        if (errorMessage.includes('503') ||
            errorMessage.includes('service unavailable')) {
            return true;
        }
        return false;
    }
    /**
     * Sleep for a specified number of milliseconds
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Send a message to the LLM and get a response.
     * This method handles the timing, cost tracking, and automatic retries for the call.
     * @param messages - Array of message objects
     * @param systemPrompt - Optional system prompt to guide the LLM
     * @param options - Optional parameters like tools
     * @returns The LLM's response with text and optional tool calls
     */
    async chat(messages, systemPrompt, options) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const startTime = Date.now();
            let success = false;
            let response;
            try {
                response = await this.performChat(messages, systemPrompt, options);
                success = true;
                return response;
            }
            catch (error) {
                lastError = error;
                // Log the call with failure
                const endTime = Date.now();
                const latency = endTime - startTime;
                const inputTokens = response?.usage?.input_tokens || 0;
                const outputTokens = response?.usage?.output_tokens || 0;
                CostTracker_1.CostTracker.getInstance().logCall({
                    provider: this.getProviderName(),
                    model: this.getModelName(),
                    inputTokens,
                    outputTokens,
                    latency,
                    success: false,
                });
                // Check if error is retryable
                if (attempt < maxRetries && this.isRetryableError(error)) {
                    const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    console.log(`      ⚠️  ${this.getProviderName()} error (attempt ${attempt}/${maxRetries}): ${error.message}`);
                    console.log(`      🔄 Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                    continue; // Retry
                }
                // Non-retryable error or max retries reached
                throw error;
            }
            finally {
                // Only log successful calls here (failures logged above)
                if (response) {
                    const endTime = Date.now();
                    const latency = endTime - startTime;
                    const inputTokens = response.usage?.input_tokens || 0;
                    const outputTokens = response.usage?.output_tokens || 0;
                    CostTracker_1.CostTracker.getInstance().logCall({
                        provider: this.getProviderName(),
                        model: this.getModelName(),
                        inputTokens,
                        outputTokens,
                        latency,
                        success: true,
                    });
                }
            }
        }
        // If we get here, all retries failed
        throw lastError;
    }
    /**
     * Get the model name
     */
    getModelName() {
        return this.modelName;
    }
}
exports.default = LLMProvider;
