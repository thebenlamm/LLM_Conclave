"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = __importDefault(require("openai"));
const LLMProvider_1 = __importDefault(require("./LLMProvider"));
/**
 * Grok (xAI) provider implementation
 * Uses OpenAI-compatible API
 * Supports models like grok-beta, grok-vision-beta
 */
class GrokProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        this.client = new openai_1.default({
            apiKey: apiKey || process.env.XAI_API_KEY,
            baseURL: 'https://api.x.ai/v1'
        });
    }
    async chat(messages, systemPrompt = null) {
        try {
            const messageArray = [...messages];
            // Add system prompt if provided
            if (systemPrompt) {
                messageArray.unshift({
                    role: 'system',
                    content: systemPrompt
                });
            }
            const response = await this.client.chat.completions.create({
                model: this.modelName,
                messages: messageArray,
                temperature: 0.7,
            });
            return response.choices[0].message.content;
        }
        catch (error) {
            throw new Error(`Grok API error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'Grok';
    }
}
exports.default = GrokProvider;
