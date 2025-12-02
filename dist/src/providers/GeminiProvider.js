"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const genai_1 = require("@google/genai");
const LLMProvider_1 = __importDefault(require("./LLMProvider"));
/**
 * Google Gemini provider implementation using new @google/genai package
 * Supports models like gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash-exp
 */
class GeminiProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (!key) {
            throw new Error('GEMINI_API_KEY is required. Get one at https://aistudio.google.com/app/apikey');
        }
        this.client = new genai_1.GoogleGenAI({ apiKey: key });
    }
    async chat(messages, systemPrompt = null, options = {}) {
        try {
            const { tools = null } = options;
            // Convert our tool definitions to Gemini's function declaration format
            const functionDeclarations = tools ? this.convertToolsToGeminiFormat(tools) : undefined;
            // Convert messages to Gemini Content format
            const contents = this.convertMessagesToGeminiFormat(messages);
            // Build config object
            const config = {};
            if (systemPrompt) {
                config.systemInstruction = systemPrompt;
            }
            if (functionDeclarations && functionDeclarations.length > 0) {
                config.tools = [{ functionDeclarations }];
            }
            // Call generateContent with the new API
            const generateConfig = {
                model: this.modelName,
                contents: contents,
            };
            if (Object.keys(config).length > 0) {
                generateConfig.config = config;
            }
            const response = await this.client.models.generateContent(generateConfig);
            // Check for function calls
            if (response.functionCalls && response.functionCalls.length > 0) {
                return {
                    tool_calls: response.functionCalls.map((fc) => ({
                        id: fc.name + '_' + Date.now(), // Gemini doesn't provide IDs
                        name: fc.name,
                        input: fc.args || {}
                    })),
                    text: response.text || null
                };
            }
            // Return regular text response
            return { text: response.text || null };
        }
        catch (error) {
            throw new Error(`Gemini API error: ${error.message}`);
        }
    }
    /**
     * Convert our tool definitions to Gemini's function declaration format
     */
    convertToolsToGeminiFormat(tools) {
        const toolArray = Array.isArray(tools) ? tools : [];
        return toolArray.map((tool) => {
            // If it's OpenAI format (has type: 'function')
            if (tool.type === 'function') {
                return {
                    name: tool.function.name,
                    description: tool.function.description,
                    parametersJsonSchema: tool.function.parameters
                };
            }
            // If it's Anthropic format (our standard format)
            return {
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.input_schema
            };
        });
    }
    /**
     * Convert our message format to Gemini's Content format
     * New API expects Content[] with role (user/model) and parts
     * Gemini requires: all function responses must be grouped together after function calls
     */
    convertMessagesToGeminiFormat(messages) {
        const contents = [];
        let pendingFunctionResponses = [];
        let lastToolCallsMap = new Map(); // Map tool_use_id to function name
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === 'tool_result') {
                // Collect tool results to be grouped together
                const toolResult = msg;
                const functionName = lastToolCallsMap.get(toolResult.tool_use_id) || 'unknown';
                pendingFunctionResponses.push({
                    functionResponse: {
                        name: functionName,
                        response: {
                            result: toolResult.content
                        }
                    }
                });
            }
            else {
                // If we have pending function responses, add them before this message
                if (pendingFunctionResponses.length > 0) {
                    contents.push({
                        role: 'function',
                        parts: pendingFunctionResponses
                    });
                    pendingFunctionResponses = [];
                }
                if (msg.role === 'assistant') {
                    const assistantMsg = msg;
                    if (assistantMsg.tool_calls) {
                        // Store tool call IDs and names for later function response matching
                        lastToolCallsMap.clear();
                        for (const tc of assistantMsg.tool_calls) {
                            lastToolCallsMap.set(tc.id, tc.name);
                        }
                        // Convert tool calls to function calls
                        contents.push({
                            role: 'model',
                            parts: assistantMsg.tool_calls.map((tc) => ({
                                functionCall: {
                                    name: tc.name,
                                    args: tc.input
                                }
                            }))
                        });
                    }
                    else {
                        contents.push({
                            role: 'model',
                            parts: [{ text: msg.content }]
                        });
                    }
                }
                else if (msg.role === 'user') {
                    contents.push({
                        role: 'user',
                        parts: [{ text: msg.content }]
                    });
                }
                else if (msg.role === 'system') {
                    // System messages are handled via systemInstruction, skip them here
                    continue;
                }
            }
        }
        // Add any remaining function responses
        if (pendingFunctionResponses.length > 0) {
            contents.push({
                role: 'function',
                parts: pendingFunctionResponses
            });
        }
        return contents;
    }
    getProviderName() {
        return 'Gemini';
    }
}
exports.default = GeminiProvider;
