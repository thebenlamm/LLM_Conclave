import OpenAI from 'openai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions } from '../types';
import { CostTracker } from '../core/CostTracker';

/**
 * The Sonar model family Perplexity exposes. Exported so PreflightChecker can
 * validate model names locally: Perplexity has no reliable /models endpoint to
 * ping, so without this a typo'd Sonar model ('sonar-pr') would pass preflight
 * and burn a full run before failing live.
 */
export const SONAR_MODELS = [
  'sonar',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-reasoning-pro',
  'sonar-deep-research',
] as const;

/**
 * Perplexity provider implementation
 * Uses OpenAI-compatible API at https://api.perplexity.ai
 * Supports the Sonar family: sonar, sonar-pro, sonar-reasoning,
 * sonar-reasoning-pro, sonar-deep-research.
 *
 * Perplexity models are web-grounded — they return live-search answers,
 * which makes this provider the conclave's source of current/factual takes
 * (the other providers reason from training data only).
 */
export default class PerplexityProvider extends LLMProvider {
  client: OpenAI;

  constructor(modelName: string, apiKey?: string, costTracker?: CostTracker) {
    super(modelName, costTracker);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai'
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
      console.error(`[PerplexityProvider] Failed to parse tool arguments: ${jsonString.substring(0, 100)}`);
      return fallback;
    }
  }

  /**
   * Build a "Sources:" footer from Perplexity's web-grounding metadata —
   * web-grounding is the entire reason this provider exists, so the sources must
   * reach the judge/user rather than being dropped. Prefers the richer
   * `search_results` ({ title, url, ... }) and falls back to the bare
   * `citations` URL array; both are top-level response fields. ONLY the URLs and
   * titles the API actually returned are emitted — nothing is synthesized.
   * Returns '' when no sources are present.
   */
  private formatSources(citations?: unknown, searchResults?: unknown): string {
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const lines = searchResults.map((r: any, i: number) => {
        const title = (r?.title && String(r.title)) || (r?.url && String(r.url)) || `Source ${i + 1}`;
        const url = r?.url ? String(r.url) : '';
        return url && url !== title ? `${i + 1}. ${title} — ${url}` : `${i + 1}. ${title}`;
      });
      return `\n\nSources:\n${lines.join('\n')}`;
    }
    if (Array.isArray(citations) && citations.length > 0) {
      const lines = citations.map((c: unknown, i: number) => `${i + 1}. ${String(c)}`);
      return `\n\nSources:\n${lines.join('\n')}`;
    }
    return '';
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken, signal } = options;

      const messageArray = this.convertMessagesToOpenAIFormat(messages);

      // System prompt prepended first to maintain stable prefix
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

      // Perplexity supports OpenAI-style tool calling on the Sonar models.
      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      if (stream && !params.tools) {
        params.stream = true;
        // include_usage makes the final chunk carry token usage; without it
        // streamed Sonar calls log $0 cost (Perplexity is a paid web-search
        // provider, so that silently corrupts cost analytics). Mirrors OpenAIProvider.
        params.stream_options = { include_usage: true };
        const streamResp = await this.client.chat.completions.create(params, { signal });
        let fullText = '';
        let streamUsage: { input_tokens: number; output_tokens: number } | undefined;
        let citations: unknown;
        let searchResults: unknown;

        for await (const chunk of streamResp as any) {
          const delta = chunk.choices?.[0]?.delta;
          const contentPiece = delta?.content;
          if (contentPiece) {
            const token = Array.isArray(contentPiece) ? contentPiece.join('') : contentPiece;
            fullText += token;
            if (onToken) onToken(token);
          }
          // Final chunk carries usage when stream_options.include_usage is true.
          if (chunk.usage) {
            streamUsage = {
              input_tokens: chunk.usage.prompt_tokens || 0,
              output_tokens: chunk.usage.completion_tokens || 0,
            };
          }
          // citations / search_results arrive at the top level of the chunk(s);
          // keep the latest non-empty set seen across the stream.
          if (Array.isArray(chunk.citations) && chunk.citations.length > 0) citations = chunk.citations;
          if (Array.isArray(chunk.search_results) && chunk.search_results.length > 0) searchResults = chunk.search_results;
        }

        return { text: fullText + this.formatSources(citations, searchResults), usage: streamUsage };
      }

      const response = await this.client.chat.completions.create(params, { signal });

      // Guard against empty choices array
      if (!response.choices || response.choices.length === 0) {
        throw new Error('Perplexity returned empty choices array');
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

      // Append web sources (citations / search_results) to the final answer.
      // Preserve the original null when there is neither content nor sources.
      const sources = this.formatSources((response as any).citations, (response as any).search_results);
      return { text: sources ? (message.content ?? '') + sources : message.content, usage };
    } catch (error: any) {
      throw new Error(`Perplexity API error: ${error.message}`);
    }
  }

  getProviderName(): string {
    return 'Perplexity';
  }
}
