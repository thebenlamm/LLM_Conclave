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

  /**
   * Convert messages to OpenAI format, handling tool_result messages
   */
  private convertMessagesToOpenAIFormat(messages: Message[]): any[] {
    return messages.map(msg => {
      // Convert tool_result to OpenAI's tool format
      if (msg.role === 'tool_result') {
        const toolResult = msg as any;
        return {
          role: 'tool',
          tool_call_id: toolResult.tool_use_id,
          content: typeof toolResult.content === 'string'
            ? toolResult.content
            : JSON.stringify(toolResult.content)
        };
      }

      // Convert assistant messages with tool_calls
      if (msg.role === 'assistant' && (msg as any).tool_calls) {
        const assistantMsg = msg as any;
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: assistantMsg.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input)
            }
          }))
        };
      }

      // Pass through other messages
      return {
        role: msg.role,
        content: msg.content
      };
    });
  }

  /**
   * Safely parse JSON with fallback
   */
  private safeJsonParse(jsonString: string, fallback: any = {}): any {
    try {
      return JSON.parse(jsonString);
    } catch {
      console.error(`[OpenAIProvider] Failed to parse tool arguments: ${jsonString.substring(0, 100)}`);
      return fallback;
    }
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken, signal } = options;

      // Convert messages to OpenAI format (handles tool_result → tool)
      const convertedMessages = this.convertMessagesToOpenAIFormat(messages);
      const messageArray = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...convertedMessages]
        : convertedMessages;

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
        params.stream_options = { include_usage: true };
        const streamResp = await this.client.chat.completions.create(params, { signal: signal as any });
        let fullText = '';
        let streamUsage: { input_tokens: number; output_tokens: number } | undefined;

        for await (const chunk of streamResp as any) {
          const delta = chunk.choices?.[0]?.delta;
          const contentPiece = delta?.content;
          if (contentPiece) {
            const token = Array.isArray(contentPiece) ? contentPiece.join('') : contentPiece;
            fullText += token;
            if (onToken) onToken(token);
          }
          // Final chunk includes usage when stream_options.include_usage is true
          if (chunk.usage) {
            streamUsage = {
              input_tokens: chunk.usage.prompt_tokens || 0,
              output_tokens: chunk.usage.completion_tokens || 0,
            };
          }
        }

        return { text: fullText, usage: streamUsage };
      }

      const response = await this.client.chat.completions.create(params, { signal: signal as any });

      // Guard against empty choices array
      if (!response.choices || response.choices.length === 0) {
        throw new Error('OpenAI returned empty choices array');
      }

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
            input: this.safeJsonParse(tc.function.arguments)
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
