"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const generative_ai_1 = require("@google/generative-ai");
const LLMProvider_1 = __importDefault(require("./LLMProvider"));
/**
 * Google Gemini provider implementation
 * Supports models like gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash
 */
class GeminiProvider extends LLMProvider_1.default {
    constructor(modelName, apiKey) {
        super(modelName);
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (!key) {
            throw new Error('GEMINI_API_KEY is required. Get one at https://aistudio.google.com/app/apikey');
        }
        this.client = new generative_ai_1.GoogleGenerativeAI(key);
        // Model will be initialized with system instructions in chat() method
        this.model = this.client.getGenerativeModel({ model: modelName });
    }
    async chat(messages, systemPrompt = null, options = {}) {
        try {
            const { tools = null } = options;
            // Convert our tool definitions to Gemini's function declaration format
            const functionDeclarations = tools ? this.convertToolsToGeminiFormat(tools) : undefined;
            // Create model with system instruction and tools
            const modelConfig = { model: this.modelName };
            if (systemPrompt) {
                modelConfig.systemInstruction = systemPrompt;
            }
            if (functionDeclarations) {
                modelConfig.tools = [{ functionDeclarations }];
            }
            this.model = this.client.getGenerativeModel(modelConfig);
            // Convert messages to Gemini format
            const geminiMessages = this.convertMessagesToGeminiFormat(messages);
            // Start chat with history
            const chat = this.model.startChat({
                history: geminiMessages.history,
            });
            // Send the latest message
            const result = await chat.sendMessage(geminiMessages.latestMessage);
            const response = result.response;
            // Check for function calls
            const functionCalls = response.functionCalls();
            if (functionCalls && functionCalls.length > 0) {
                return {
                    tool_calls: functionCalls.map((fc) => ({
                        id: fc.name + '_' + Date.now(), // Gemini doesn't provide IDs
                        name: fc.name,
                        input: fc.args
                    })),
                    text: response.text() || null
                };
            }
            // Return regular text response
            return { text: response.text() };
        }
        catch (error) {
            throw new Error(`Gemini API error: ${error.message}`);
        }
    }
    /**
     * Convert our tool definitions to Gemini's function declaration format
     */
    convertToolsToGeminiFormat(tools) {
        // Handle both Anthropic format and OpenAI format
        const toolArray = Array.isArray(tools) ? tools : [];
        return toolArray.map((tool) => {
            // If it's OpenAI format (has type: 'function')
            if (tool.type === 'function') {
                return {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                };
            }
            // If it's Anthropic format (our standard format)
            return {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema
            };
        });
    }
    /**
     * Convert our message format to Gemini's format
     * Gemini uses "user" and "model" roles, and requires alternating turns
     */
    convertMessagesToGeminiFormat(messages) {
        const history = [];
        let currentContent = '';
        for (let i = 0; i < messages.length - 1; i++) {
            const msg = messages[i];
            if (msg.role === 'tool_result') {
                // Gemini expects tool results as function responses in parts
                const toolResult = msg;
                history.push({
                    role: 'function',
                    parts: [{
                            functionResponse: {
                                name: toolResult.tool_use_id || 'unknown',
                                response: {
                                    result: toolResult.content
                                }
                            }
                        }]
                });
            }
            else if (msg.role === 'assistant') {
                const assistantMsg = msg;
                if (assistantMsg.tool_calls) {
                    // Convert tool calls to function calls
                    history.push({
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
                    history.push({
                        role: 'model',
                        parts: [{ text: msg.content }]
                    });
                }
            }
            else if (msg.role === 'user') {
                history.push({
                    role: 'user',
                    parts: [{ text: msg.content }]
                });
            }
        }
        // The last message becomes the current message to send
        const lastMessage = messages[messages.length - 1];
        const latestMessage = lastMessage.content;
        return { history, latestMessage };
    }
    getProviderName() {
        return 'Gemini';
    }
}
exports.default = GeminiProvider;
