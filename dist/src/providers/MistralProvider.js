"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = __importDefault(require("openai"));
const LLMProvider_1 = __importDefault(require("./LLMProvider"));
/**
 * Mistral AI provider implementation
 * Uses OpenAI-compatible API
 * Supports models like mistral-large-latest, mistral-small-latest, codestral-latest
 */
class MistralProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        const key = apiKey || process.env.MISTRAL_API_KEY;
        if (!key) {
            throw new Error('MISTRAL_API_KEY is required. Get one at https://console.mistral.ai/');
        }
        this.client = new openai_1.default({
            apiKey: key,
            baseURL: 'https://api.mistral.ai/v1'
        });
    }
    async chat(messages, systemPrompt = null, options = {}) {
        try {
            const { tools = null } = options;
            const messageArray = [...messages];
            // Add system prompt if provided
            if (systemPrompt) {
                messageArray.unshift({
                    role: 'system',
                    content: systemPrompt
                });
            }
            const params = {
                model: this.modelName,
                messages: messageArray,
                temperature: 0.7,
            };
            // Add tools if provided (OpenAI format, since Mistral is OpenAI-compatible)
            if (tools && tools.length > 0) {
                params.tools = tools;
                params.tool_choice = 'auto';
            }
            const response = await this.client.chat.completions.create(params);
            const message = response.choices[0].message;
            // Check if response contains tool calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                return {
                    tool_calls: message.tool_calls.map((tc) => ({
                        id: tc.id,
                        name: tc.function.name,
                        input: JSON.parse(tc.function.arguments)
                    })),
                    text: message.content || null
                };
            }
            return { text: message.content };
        }
        catch (error) {
            throw new Error(`Mistral API error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'Mistral';
    }
}
exports.default = MistralProvider;
