"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const OpenAIProvider_1 = __importDefault(require("./OpenAIProvider"));
const ClaudeProvider_1 = __importDefault(require("./ClaudeProvider"));
const GrokProvider_1 = __importDefault(require("./GrokProvider"));
/**
 * Factory for creating LLM provider instances
 */
class ProviderFactory {
    /**
     * Create a provider instance based on the model name
     * @param {string} modelIdentifier - Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022", "grok-beta")
     * @returns {any} - Instance of the appropriate provider
     */
    static createProvider(modelIdentifier) {
        const modelLower = modelIdentifier.toLowerCase();
        // OpenAI models
        if (modelLower.includes('gpt')) {
            return new OpenAIProvider_1.default(modelIdentifier);
        }
        // Claude models
        if (modelLower.includes('claude') || modelLower.includes('sonnet') ||
            modelLower.includes('opus') || modelLower.includes('haiku')) {
            // Map common shorthand to full model names
            let fullModelName = modelIdentifier;
            if (modelLower === 'sonnet' || modelLower === 'sonnet-4.5') {
                fullModelName = 'claude-sonnet-4-5';
            }
            else if (modelLower === 'opus' || modelLower === 'opus-4.5') {
                fullModelName = 'claude-opus-4-5';
            }
            else if (modelLower === 'haiku' || modelLower === 'haiku-4.5') {
                fullModelName = 'claude-haiku-4-5';
            }
            return new ClaudeProvider_1.default(fullModelName);
        }
        // Grok models
        if (modelLower.includes('grok')) {
            return new GrokProvider_1.default(modelIdentifier);
        }
        throw new Error(`Unknown model: ${modelIdentifier}. Supported models: GPT (OpenAI), Claude (Anthropic), Grok (xAI)`);
    }
    /**
     * Get a list of supported model patterns
     * @returns {Array<string>}
     */
    static getSupportedModels() {
        return [
            'gpt-4o, gpt-4-turbo, gpt-3.5-turbo (OpenAI)',
            'claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5, sonnet, opus, haiku (Anthropic)',
            'grok-3, grok-vision-3 (xAI)'
        ];
    }
}
exports.default = ProviderFactory;
