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
    async performChat(messages, systemPrompt = null, options = {}) {
        try {
            const { tools = null, stream = false, onToken } = options;
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
            const generateConfig = {
                model: this.modelName,
                contents,
                ...config,
            };
            if (Object.keys(config).length > 0) {
                generateConfig.config = config;
            }
            // Handle streaming mode (no tools support in streaming)
            if (stream && (!config.tools || config.tools.length === 0)) {
                const streamResp = await this.client.models.generateContentStream(generateConfig);
                let fullText = '';
                for await (const chunk of streamResp) {
                    const textPart = chunk.text();
                    if (textPart) {
                        fullText += textPart;
                        if (onToken)
                            onToken(textPart);
                    }
                }
                // Note: Token usage not available in streaming mode
                return { text: fullText || null };
            }
            // Non-streaming mode with improved token usage tracking
            const result = await this.client.models.generateContent(generateConfig);
            let usage = { input_tokens: 0, output_tokens: 0 };
            // @ts-ignore
            if (result.usageMetadata) {
                usage = {
                    // @ts-ignore
                    input_tokens: result.usageMetadata.promptTokenCount || 0,
                    // @ts-ignore
                    output_tokens: result.usageMetadata.candidatesTokenCount || 0,
                };
            }
            else {
                // Fallback to manual counting, but run in parallel
                if (result.candidates && result.candidates.length > 0) {
                    const [inputTokenResponse, outputTokenResponse] = await Promise.all([
                        this.client.models.countTokens({ ...generateConfig, contents }),
                        this.client.models.countTokens({ ...generateConfig, contents: result.candidates[0].content })
                    ]);
                    usage = {
                        input_tokens: inputTokenResponse.totalTokens ?? 0,
                        output_tokens: outputTokenResponse.totalTokens ?? 0,
                    };
                }
            }
            // Ensure we have a valid response
            if (!result.candidates || result.candidates.length === 0) {
                throw new Error('No candidates in Gemini response');
            }
            // Store the candidate to help TypeScript understand it's not null
            const candidate = result.candidates[0];
            if (!candidate.content || !candidate.content.parts) {
                throw new Error('Invalid candidate structure in Gemini response');
            }
            // Check for function calls
            if (candidate.content.parts.some((p) => p.functionCall)) {
                return {
                    tool_calls: candidate.content.parts
                        .filter((p) => p.functionCall)
                        .map((p) => ({
                        id: p.functionCall.name + '_' + Date.now(), // Gemini doesn't provide IDs
                        name: p.functionCall.name,
                        input: p.functionCall.args || {}
                    })),
                    text: candidate.content.parts.find((p) => p.text)?.text || null,
                    usage
                };
            }
            const text = candidate.content.parts.map((p) => p.text).join('');
            // Return regular text response
            return { text: text || null, usage };
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
