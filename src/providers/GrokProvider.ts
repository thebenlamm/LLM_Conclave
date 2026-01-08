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
      console.error(`[GrokProvider] Failed to parse tool arguments: ${jsonString.substring(0, 100)}`);
      return fallback;
    }
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken } = options;

      // Convert messages to OpenAI format (handles tool_result → tool)
      const messageArray = this.convertMessagesToOpenAIFormat(messages);

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

      // Guard against empty choices array
      if (!response.choices || response.choices.length === 0) {
        throw new Error('Grok returned empty choices array');
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
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Grok';
  }
}
