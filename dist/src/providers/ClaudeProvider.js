"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const LLMProvider_1 = __importDefault(require("./LLMProvider"));
/**
 * Claude (Anthropic) provider implementation
 * Supports models like claude-3-5-sonnet-20241022, claude-3-opus, etc.
 */
class ClaudeProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        this.client = new sdk_1.default({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY
        });
    }
    async chat(messages, systemPrompt = null, options = {}) {
        try {
            const { tools = null } = options;
            // Claude API expects messages without system role in the messages array
            // System prompt is passed separately
            const messageArray = messages.map(msg => {
                // Handle messages with tool results
                if (msg.role === 'tool_result') {
                    return {
                        role: 'user',
                        content: [{
                                type: 'tool_result',
                                tool_use_id: msg.tool_use_id,
                                content: msg.content
                            }]
                    };
                }
                // Handle messages with tool calls from assistant
                if (msg.role === 'assistant' && msg.tool_calls) {
                    return {
                        role: 'assistant',
                        content: msg.tool_calls.map((tc) => ({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.name,
                            input: tc.input
                        }))
                    };
                }
                return {
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content
                };
            });
            const params = {
                model: this.modelName,
                max_tokens: 4096,
                messages: messageArray,
                temperature: 0.7,
            };
            // Add system prompt if provided
            if (systemPrompt) {
                params.system = systemPrompt;
            }
            // Add tools if provided
            if (tools && tools.length > 0) {
                params.tools = tools;
            }
            const response = await this.client.messages.create(params);
            // Validate response structure
            if (!response || !response.content) {
                throw new Error(`Invalid response structure: ${JSON.stringify(response)}`);
            }
            // Handle empty content array (Claude chose not to respond)
            if (response.content.length === 0) {
                return { text: "[No response provided - model chose not to contribute]" };
            }
            // Check if response contains tool uses
            const toolUses = response.content.filter(block => block.type === 'tool_use');
            if (toolUses.length > 0) {
                // Return tool calls for execution
                return {
                    tool_calls: toolUses.map((tu) => ({
                        id: tu.id,
                        name: tu.name,
                        input: tu.input
                    })),
                    text: response.content.find(block => block.type === 'text')?.text || null
                };
            }
            // Claude responses have a 'text' property in content blocks
            const textContent = response.content.find(block => block.type === 'text');
            if (!textContent || !textContent.text) {
                throw new Error(`No text content in response: ${JSON.stringify(response.content)}`);
            }
            return { text: textContent.text };
        }
        catch (error) {
            throw new Error(`Claude API error: ${error.message}`);
        }
    }
    getProviderName() {
        return 'Claude';
    }
}
exports.default = ClaudeProvider;
