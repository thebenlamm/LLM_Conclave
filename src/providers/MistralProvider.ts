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

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken } = options;
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
        provider: 'Mistral',
        model: this.modelName,
        status: error.status || error.statusCode || 'unknown',
        code: error.code || 'unknown',
        type: error.type || error.name || 'unknown',
        message: error.message,
        // Include request info for 400 errors (bad request debugging)
        ...(error.status === 400 && {
          messageCount: messages.length,
          hasTools: !!(options.tools?.length),
          firstMessageRole: messages[0]?.role,
          lastMessageRole: messages[messages.length - 1]?.role,
        }),
        // Include rate limit headers for 429 errors
        ...(error.status === 429 && {
          retryAfter: error.headers?.['retry-after'],
          rateLimitRemaining: error.headers?.['x-ratelimit-remaining'],
        }),
      };
      console.error('[MistralProvider] API Error:', JSON.stringify(errorDetails, null, 2));
      throw new Error(`Mistral API error (${errorDetails.status}): ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Mistral';
  }
}
