import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions, ToolDefinition } from '../types';

/**
 * Google Gemini provider implementation
 * Supports models like gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash
 */
export default class GeminiProvider extends LLMProvider {
  client: GoogleGenerativeAI;
  model: GenerativeModel;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    this.client = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY || '');

    // Model will be initialized with system instructions in chat() method
    this.model = this.client.getGenerativeModel({ model: modelName });
  }

  async chat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null } = options;

      // Convert our tool definitions to Gemini's function declaration format
      const functionDeclarations = tools ? this.convertToolsToGeminiFormat(tools) : undefined;

      // Create model with system instruction and tools
      const modelConfig: any = { model: this.modelName };
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
          tool_calls: functionCalls.map((fc: any) => ({
            id: fc.name + '_' + Date.now(), // Gemini doesn't provide IDs
            name: fc.name,
            input: fc.args
          })),
          text: response.text() || null
        };
      }

      // Return regular text response
      return { text: response.text() };
    } catch (error: any) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Convert our tool definitions to Gemini's function declaration format
   */
  convertToolsToGeminiFormat(tools: ToolDefinition[] | any[]): any[] {
    // Handle both Anthropic format and OpenAI format
    const toolArray = Array.isArray(tools) ? tools : [];

    return toolArray.map((tool: any) => {
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
  convertMessagesToGeminiFormat(messages: Message[]): { history: any[], latestMessage: string } {
    const history: any[] = [];
    let currentContent = '';

    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];

      if (msg.role === 'tool_result') {
        // Gemini expects tool results as function responses in parts
        const toolResult = msg as any;
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
      } else if (msg.role === 'assistant') {
        const assistantMsg = msg as any;
        if (assistantMsg.tool_calls) {
          // Convert tool calls to function calls
          history.push({
            role: 'model',
            parts: assistantMsg.tool_calls.map((tc: any) => ({
              functionCall: {
                name: tc.name,
                args: tc.input
              }
            }))
          });
        } else {
          history.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
        }
      } else if (msg.role === 'user') {
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

  getProviderName(): string {
    return 'Gemini';
  }
}
