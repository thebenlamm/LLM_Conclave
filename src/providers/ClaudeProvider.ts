import Anthropic from '@anthropic-ai/sdk';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions } from '../types';

/**
 * Claude (Anthropic) provider implementation
 * Supports models like claude-3-5-sonnet-20241022, claude-3-opus, etc.
 */
export default class ClaudeProvider extends LLMProvider {
  client: Anthropic;
  private contextEditingEnabled: boolean;

  constructor(modelName: string, apiKey?: string, options?: { contextEditing?: boolean }) {
    super(modelName);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.contextEditingEnabled = options?.contextEditing ?? (process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING === '1');
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken, signal } = options;

      // Claude API expects messages without system role in the messages array
      // System prompt is passed separately - collect any system messages to merge
      const additionalSystemMessages: string[] = [];

      const messageArray = messages
        .filter(msg => {
          // Extract system messages to merge into system prompt
          if (msg.role === 'system') {
            additionalSystemMessages.push(msg.content);
            return false; // Don't include in message array
          }
          return true;
        })
        .map(msg => {
          // Handle messages with tool results
          if (msg.role === 'tool_result') {
            return {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: (msg as any).tool_use_id,
                content: msg.content
              }]
            };
          }

          // Handle messages with tool calls from assistant
          // FIXED: Preserve text content alongside tool_use blocks
          if (msg.role === 'assistant' && (msg as any).tool_calls) {
            const content: any[] = [];

            // Add text content if present (preserves reasoning/explanation)
            if (msg.content && msg.content.trim()) {
              content.push({ type: 'text', text: msg.content });
            }

            // Add tool_use blocks
            content.push(...(msg as any).tool_calls.map((tc: any) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input
            })));

            return {
              role: 'assistant',
              content
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

      // Merge system prompt with any system messages found in conversation
      // FIXED: System messages merged into system param, not converted to user
      const combinedSystemPrompt = [
        systemPrompt,
        ...additionalSystemMessages
      ].filter(Boolean).join('\n\n');

      // Pass system prompt as content block array with cache_control for Anthropic prompt caching.
      // cache_control: { type: 'ephemeral' } marks a cache breakpoint (5-min TTL, refreshed on hit).
      // Minimum cacheable prefix is 1,024 tokens; smaller prompts will simply skip caching.
      if (combinedSystemPrompt) {
        params.system = [{
          type: 'text',
          text: combinedSystemPrompt,
          cache_control: { type: 'ephemeral' },
        }];
      }

      // Add tools if provided, with cache_control on the LAST tool definition.
      // Anthropic requires the breakpoint on the last item of a cacheable block.
      // System prompt + tools = 2 breakpoints (max 4 allowed per request).
      if (tools && tools.length > 0) {
        params.tools = tools.map((tool: any, i: number) =>
          i === tools.length - 1
            ? { ...tool, cache_control: { type: 'ephemeral' } }
            : tool
        );
      }

      // Context editing uses the beta endpoint (client.beta.messages.create) which accepts
      // `betas` and `context_management` in the body params. The regular endpoint rejects them.
      const apiOptions: any = {};
      if (signal) apiOptions.signal = signal;

      // Helper: choose between regular and beta messages endpoint
      const createMessage = (messageParams: any, opts: any) => {
        if (this.contextEditingEnabled) {
          // Beta endpoint: betas + context_management go in the body params
          return (this.client.beta.messages as any).create({
            ...messageParams,
            betas: ['context-management-2025-06-27'],
            context_management: {
              edits: [{
                type: 'clear_tool_uses_20250919',
                trigger: { type: 'input_tokens', value: 50000 },
                keep: { type: 'tool_uses', value: 3 },
                clear_at_least: { type: 'input_tokens', value: 10000 },
              }],
            },
          }, opts);
        }
        return this.client.messages.create(messageParams, opts);
      };

      // Streaming supported only when tools aren't requested to avoid partial tool parsing
      if (stream && !params.tools) {
        const streamResp: any = await createMessage({ ...params, stream: true }, apiOptions);
        let fullText = '';
        let streamUsage: { input_tokens: number; output_tokens: number } | undefined;

        for await (const event of streamResp) {
          const textDelta = (event as any)?.delta?.text;
          if (textDelta) {
            fullText += textDelta;
            if (onToken) onToken(textDelta);
          }
          // message_start event contains input token count and cache info
          if ((event as any)?.type === 'message_start' && (event as any)?.message?.usage) {
            const msgUsage = (event as any).message.usage;
            streamUsage = {
              input_tokens: msgUsage.input_tokens || 0,
              output_tokens: 0,
            };
            // Log cache performance from streaming response
            const cacheCreated = msgUsage.cache_creation_input_tokens || 0;
            const cacheRead = msgUsage.cache_read_input_tokens || 0;
            if (cacheRead > 0) {
              console.log(`      💾 Cache hit: ${cacheRead} tokens read from cache (90% cost savings)`);
            }
            if (cacheCreated > 0) {
              console.log(`      💾 Cache miss: ${cacheCreated} tokens written to cache`);
            }
          }
          // message_delta event contains output token count
          if ((event as any)?.type === 'message_delta' && (event as any)?.usage) {
            if (streamUsage) {
              streamUsage.output_tokens = (event as any).usage.output_tokens || 0;
            } else {
              streamUsage = {
                input_tokens: 0,
                output_tokens: (event as any).usage.output_tokens || 0,
              };
            }
          }
        }

        return { text: fullText || null, usage: streamUsage };
      }

      const response: any = await createMessage(params, apiOptions);

      const usage = {
        input_tokens: response.usage.input_tokens || 0,
        output_tokens: response.usage.output_tokens || 0,
      };

      // Log prompt caching performance when cache fields are present
      const responseUsage = response.usage as any;
      if (responseUsage.cache_creation_input_tokens || responseUsage.cache_read_input_tokens) {
        const cacheCreated = responseUsage.cache_creation_input_tokens || 0;
        const cacheRead = responseUsage.cache_read_input_tokens || 0;
        if (cacheRead > 0) {
          console.log(`      💾 Cache hit: ${cacheRead} tokens read from cache (90% cost savings)`);
        }
        if (cacheCreated > 0) {
          console.log(`      💾 Cache miss: ${cacheCreated} tokens written to cache (25% write surcharge, subsequent reads at 90% savings)`);
        }
      }

      // Validate response structure
      if (!response || !response.content) {
        throw new Error(`Invalid response structure: ${JSON.stringify(response)}`);
      }

      // Handle empty content array (Claude chose not to respond)
      if (response.content.length === 0) {
        return { text: "[No response provided - model chose not to contribute]", usage };
      }

      // Check if response contains tool uses
      const toolUses = response.content.filter((block: any) => block.type === 'tool_use');
      if (toolUses.length > 0) {
        // Return tool calls for execution
        return {
          tool_calls: toolUses.map((tu: any) => ({
            id: tu.id,
            name: tu.name,
            input: tu.input
          })),
          text: (response.content.find((block: any) => block.type === 'text') as any)?.text || null,
          usage,
        };
      }

      // Claude responses have a 'text' property in content blocks
      const textContent = response.content.find((block: any) => block.type === 'text') as any;
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
