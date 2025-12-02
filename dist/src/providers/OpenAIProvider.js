"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = __importDefault(require("openai"));
const LLMProvider_1 = __importDefault(require("./LLMProvider"));
/**
 * OpenAI provider implementation
 * Supports models like gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.
 */
class OpenAIProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        this.client = new openai_1.default({
            apiKey: apiKey || process.env.OPENAI_API_KEY
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
            // Add tools if provided (OpenAI format)
            if (tools && tools.length > 0) {
                params.tools = tools;
                params.tool_choice = 'auto';
            }
            // Streaming only supported when tools aren't requested to avoid complex partial tool parsing
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
            throw new Error(`OpenAI API error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'OpenAI';
    }
}
exports.default = OpenAIProvider;
