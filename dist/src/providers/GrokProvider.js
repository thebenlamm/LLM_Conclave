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
 * Supports models like grok-3, grok-vision-3
 */
class GrokProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        this.client = new openai_1.default({
            apiKey: apiKey || process.env.XAI_API_KEY,
            baseURL: 'https://api.x.ai/v1'
        });
    }
    async chat(messages, systemPrompt = null, options = {}) {
        try {
            const { tools = null, stream = false, onToken } = options;
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
            // Add tools if provided (OpenAI format, since Grok is OpenAI-compatible)
            if (tools && tools.length > 0) {
                params.tools = tools;
                params.tool_choice = 'auto';
            }
            if (stream && !params.tools) {
                params.stream = true;
                const streamResp = await this.client.chat.completions.create(params);
                let fullText = '';
                for await (const chunk of streamResp) {
                    const delta = chunk.choices?.[0]?.delta;
                    const contentPiece = delta?.content;
                    if (contentPiece) {
                        const token = Array.isArray(contentPiece) ? contentPiece.join('') : contentPiece;
                        fullText += token;
                        if (onToken)
                            onToken(token);
                    }
                }
                return { text: fullText };
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
            throw new Error(`Grok API error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'Grok';
    }
}
exports.default = GrokProvider;
