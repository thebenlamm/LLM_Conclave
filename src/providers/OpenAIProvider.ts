import OpenAI from 'openai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions } from '../types';

/**
 * OpenAI provider implementation
 * Supports models like gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.
 */
export default class OpenAIProvider extends LLMProvider {
  client: OpenAI;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken } = options;
      const messageArray = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      const params: any = {
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

        for await (const chunk of streamResp as any) {
          const delta = chunk.choices?.[0]?.delta;
          const contentPiece = delta?.content;
          if (contentPiece) {
            const token = Array.isArray(contentPiece) ? contentPiece.join('') : contentPiece;
            fullText += token;
            if (onToken) onToken(token);
          }
        }

        return { text: fullText };
      }

      const response = await this.client.chat.completions.create(params);

      const message = response.choices[0].message;
      const usage = {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      };

      // Check if response contains tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        return {
          tool_calls: message.tool_calls.map((tc: any) => ({
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          })),
          text: message.content || null,
          usage,
        };
      }

      return { text: message.content, usage };
    } catch (error: any) {
      // Detailed error logging for debugging
      const errorDetails = {
        provider: 'OpenAI',
        model: this.modelName,
        status: error.status || error.statusCode || 'unknown',
        code: error.code || 'unknown',
        type: error.type || error.name || 'unknown',
        message: error.message,
        // Include rate limit info for 429 errors
        ...(error.status === 429 && {
          retryAfter: error.headers?.['retry-after'],
          rateLimitRemaining: error.headers?.['x-ratelimit-remaining-requests'],
          rateLimitReset: error.headers?.['x-ratelimit-reset-requests'],
        }),
      };
      console.error('[OpenAIProvider] API Error:', JSON.stringify(errorDetails, null, 2));
      throw new Error(`OpenAI API error (${errorDetails.status}): ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'OpenAI';
  }
}
