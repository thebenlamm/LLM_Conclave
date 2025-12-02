import Anthropic from '@anthropic-ai/sdk';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions, ToolCall } from '../types';

/**
 * Claude (Anthropic) provider implementation
 * Supports models like claude-3-5-sonnet-20241022, claude-3-opus, etc.
 */
export default class ClaudeProvider extends LLMProvider {
  client: Anthropic;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken } = options;

      // Claude API expects messages without system role in the messages array
      // System prompt is passed separately
      const messageArray = messages.map(msg => {
        // Handle messages with tool results
        if (msg.role === 'tool_result') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: msg.tool_use_id,
              content: msg.content
            }]
          };
        }

        // Handle messages with tool calls from assistant
        if (msg.role === 'assistant' && msg.tool_calls) {
          return {
            role: 'assistant',
            content: msg.tool_calls.map((tc: any) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input
            }))
          };
        }

        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        };
      });

      const params: any = {
        model: this.modelName,
        max_tokens: 4096,
        messages: messageArray,
        temperature: 0.7,
      };

      // Add system prompt if provided
      if (systemPrompt) {
        params.system = systemPrompt;
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        params.tools = tools;
      }

      // Streaming supported only when tools aren't requested to avoid partial tool parsing
      if (stream && !params.tools) {
        const streamResp: any = await this.client.messages.create({ ...params, stream: true });
        let fullText = '';

        for await (const event of streamResp) {
          const textDelta = (event as any)?.delta?.text;
          if (textDelta) {
            fullText += textDelta;
            if (onToken) onToken(textDelta);
          }
        }

        return { text: fullText || null };
      }

      const response = await this.client.messages.create(params);
      
      const usage = {
        input_tokens: response.usage.input_tokens || 0,
        output_tokens: response.usage.output_tokens || 0,
      };

      // Validate response structure
      if (!response || !response.content) {
        throw new Error(`Invalid response structure: ${JSON.stringify(response)}`);
      }

      // Handle empty content array (Claude chose not to respond)
      if (response.content.length === 0) {
        return { text: "[No response provided - model chose not to contribute]", usage };
      }

      // Check if response contains tool uses
      const toolUses = response.content.filter(block => block.type === 'tool_use');
      if (toolUses.length > 0) {
        // Return tool calls for execution
        return {
          tool_calls: toolUses.map((tu: any) => ({
            id: tu.id,
            name: tu.name,
            input: tu.input
          })),
          text: (response.content.find(block => block.type === 'text') as any)?.text || null,
          usage,
        };
      }

      // Claude responses have a 'text' property in content blocks
      const textContent = response.content.find(block => block.type === 'text') as any;
      if (!textContent || !textContent.text) {
        throw new Error(`No text content in response: ${JSON.stringify(response.content)}`);
      }

      return { text: textContent.text, usage };
    } catch (error: any) {
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Claude';
  }
}
