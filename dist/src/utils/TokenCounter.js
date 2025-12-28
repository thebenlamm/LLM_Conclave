"use strict";
/**
 * TokenCounter - Estimates and manages token usage
 * Helps prevent hitting API token limits
 */
Object.defineProperty(exports, "__esModule", { value: true });
class TokenCounter {
    /**
     * Rough estimation: 1 token ≈ 4 characters
     * This is a simplification but works for prevention
     */
    static estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    /**
     * Estimate tokens for an array of messages
     */
    static estimateMessagesTokens(messages, systemPrompt = null) {
        let total = 0;
        // Count system prompt
        if (systemPrompt) {
            total += this.estimateTokens(systemPrompt);
        }
        // Count each message
        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                total += this.estimateTokens(msg.content);
            }
            else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    if (part.text) {
                        total += this.estimateTokens(part.text);
                    }
                }
            }
            // Count tool calls if present
            if (msg.tool_calls) {
                total += this.estimateTokens(JSON.stringify(msg.tool_calls));
            }
        }
        // Add overhead for message structure (~50 tokens per message)
        total += messages.length * 50;
        return total;
    }
    /**
     * Truncate messages to fit within token limit
     * Keeps most recent messages, removes older ones
     */
    static truncateMessages(messages, systemPrompt, maxTokens) {
        const currentTokens = this.estimateMessagesTokens(messages, systemPrompt);
        if (currentTokens <= maxTokens) {
            return { messages, truncated: false };
        }
        // Keep removing the oldest messages until we fit
        let truncatedMessages = [...messages];
        while (truncatedMessages.length > 1) {
            truncatedMessages.shift(); // Remove oldest
            const newTotal = this.estimateMessagesTokens(truncatedMessages, systemPrompt);
            if (newTotal <= maxTokens) {
                break;
            }
        }
        return {
            messages: truncatedMessages,
            truncated: true
        };
    }
    /**
     * Truncate a single text block to fit token limit
     */
    static truncateText(text, maxTokens) {
        const currentTokens = this.estimateTokens(text);
        if (currentTokens <= maxTokens) {
            return { text, truncated: false };
        }
        // Rough character limit
        const maxChars = maxTokens * 4;
        const truncatedText = text.substring(0, maxChars) + '\n\n[... truncated for length ...]';
        return {
            text: truncatedText,
            truncated: true
        };
    }
    /**
     * Get recommended limits per model
     */
    static getModelLimits(modelName) {
        const lowerModel = modelName.toLowerCase();
        // GPT-4 family
        if (lowerModel.includes('gpt-4o')) {
            return { maxInput: 128000, maxOutput: 16000 }; // 128k context
        }
        if (lowerModel.includes('gpt-4-turbo')) {
            return { maxInput: 128000, maxOutput: 4096 };
        }
        if (lowerModel.includes('gpt-4')) {
            return { maxInput: 8000, maxOutput: 2000 };
        }
        // GPT-3.5
        if (lowerModel.includes('gpt-3.5')) {
            return { maxInput: 16000, maxOutput: 4000 };
        }
        // Claude family
        if (lowerModel.includes('claude')) {
            return { maxInput: 200000, maxOutput: 4096 }; // 200k context
        }
        // Gemini
        if (lowerModel.includes('gemini-2')) {
            return { maxInput: 1000000, maxOutput: 8192 }; // 1M context
        }
        if (lowerModel.includes('gemini')) {
            return { maxInput: 1000000, maxOutput: 2048 };
        }
        // Grok
        if (lowerModel.includes('grok')) {
            return { maxInput: 128000, maxOutput: 16000 };
        }
        // Mistral
        if (lowerModel.includes('mistral')) {
            return { maxInput: 32000, maxOutput: 8000 };
        }
        // Default conservative limits
        return { maxInput: 8000, maxOutput: 2000 };
    }
    /**
     * Check if messages exceed safe limits and provide warning
     */
    static checkLimits(messages, systemPrompt, modelName) {
        const currentTokens = this.estimateMessagesTokens(messages, systemPrompt);
        const limits = this.getModelLimits(modelName);
        const percentUsed = (currentTokens / limits.maxInput) * 100;
        // Use 80% of limit as safety threshold
        const safeLimit = Math.floor(limits.maxInput * 0.8);
        const safe = currentTokens <= safeLimit;
        let warning;
        if (!safe) {
            warning = `Token usage (${currentTokens}) exceeds 80% of ${modelName} limit (${limits.maxInput}). Consider reducing context.`;
        }
        return {
            safe,
            currentTokens,
            maxTokens: limits.maxInput,
            percentUsed: Math.round(percentUsed),
            warning
        };
    }
}
exports.default = TokenCounter;
