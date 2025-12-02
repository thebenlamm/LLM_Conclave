import OpenAI from 'openai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions } from '../types';

/**
 * Grok (xAI) provider implementation
 * Uses OpenAI-compatible API
 * Supports models like grok-3, grok-vision-3
 */
export default class GrokProvider extends LLMProvider {
  client: OpenAI;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1'
    });
  }

  async chat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
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

      const params: any = {
        model: this.modelName,
        messages: messageArray,
        temperature: 0.7,
      };

      // Add tools if provided (OpenAI format, since Grok is OpenAI-compatible)
      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      const response = await this.client.chat.completions.create(params);

      const message = response.choices[0].message;

      // Check if response contains tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        return {
          tool_calls: message.tool_calls.map((tc: any) => ({
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          })),
          text: message.content || null
        };
      }

      return { text: message.content };
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Grok';
  }
}
