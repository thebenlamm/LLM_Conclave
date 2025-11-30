import OpenAI from 'openai';
import LLMProvider from './LLMProvider';

/**
 * Grok (xAI) provider implementation
 * Uses OpenAI-compatible API
 * Supports models like grok-beta, grok-vision-beta
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

  async chat(messages: any[], systemPrompt: string | null = null): Promise<any> {
    try {
      const messageArray = [...messages];

      // Add system prompt if provided
      if (systemPrompt) {
        messageArray.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: messageArray,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Grok';
  }
}
