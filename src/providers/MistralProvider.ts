import OpenAI from 'openai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions } from '../types';

/**
 * Mistral AI provider implementation
 * Uses OpenAI-compatible API
 * Supports models like mistral-large-latest, mistral-small-latest, codestral-latest
 */
export default class MistralProvider extends LLMProvider {
  client: OpenAI;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    const key = apiKey || process.env.MISTRAL_API_KEY;

    if (!key) {
      throw new Error('MISTRAL_API_KEY is required. Get one at https://console.mistral.ai/');
    }

    this.client = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.mistral.ai/v1'
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
      throw new Error(`Mistral API error: ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Mistral';
  }
}
