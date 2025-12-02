import { GoogleGenAI } from '@google/genai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions, ToolDefinition } from '../types';

/**
 * Google Gemini provider implementation using new @google/genai package
 * Supports models like gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash-exp
 */
export default class GeminiProvider extends LLMProvider {
  client: GoogleGenAI;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (!key) {
      throw new Error('GEMINI_API_KEY is required. Get one at https://aistudio.google.com/app/apikey');
    }

    this.client = new GoogleGenAI({ apiKey: key });
  }

  async chat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null } = options;

      // Convert our tool definitions to Gemini's function declaration format
      const functionDeclarations = tools ? this.convertToolsToGeminiFormat(tools) : undefined;

      // Convert messages to Gemini Content format
      const contents = this.convertMessagesToGeminiFormat(messages);

      // Build config object
      const config: any = {};

      if (systemPrompt) {
        config.systemInstruction = systemPrompt;
      }

      if (functionDeclarations && functionDeclarations.length > 0) {
        config.tools = [{ functionDeclarations }];
      }

      // Call generateContent with the new API
      const generateConfig: any = {
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
          tool_calls: response.functionCalls.map((fc: any) => ({
            id: fc.name + '_' + Date.now(), // Gemini doesn't provide IDs
            name: fc.name,
            input: fc.args || {}
          })),
          text: response.text || null
        };
      }

      // Return regular text response
      return { text: response.text || null };
    } catch (error: any) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Convert our tool definitions to Gemini's function declaration format
   */
  convertToolsToGeminiFormat(tools: ToolDefinition[] | any[]): any[] {
    const toolArray = Array.isArray(tools) ? tools : [];

    return toolArray.map((tool: any) => {
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
   */
  convertMessagesToGeminiFormat(messages: Message[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool_result') {
        // Gemini expects tool results as function responses
        const toolResult = msg as any;
        contents.push({
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
          contents.push({
            role: 'model',
            parts: assistantMsg.tool_calls.map((tc: any) => ({
              functionCall: {
                name: tc.name,
                args: tc.input
              }
            }))
          });
        } else {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
        }
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'system') {
        // System messages are handled via systemInstruction, skip them here
        continue;
      }
    }

    return contents;
  }

  getProviderName(): string {
    return 'Gemini';
  }
}
