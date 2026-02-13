/**
 * TokenCounter - Estimates and manages token usage
 * Helps prevent hitting API token limits
 *
 * Uses gpt-tokenizer for accurate BPE counting (works well for
 * OpenAI, Grok, Mistral models). Claude and Gemini use different
 * tokenizers but BPE is within ~5-10% for natural language, which
 * is accurate enough for budget and cliff-guard decisions.
 */

import { encode } from 'gpt-tokenizer';
import { TaskRouter } from '../core/TaskRouter';

export default class TokenCounter {
  /**
   * Estimate token count using gpt-tokenizer (BPE).
   * Falls back to char/4 heuristic if encoding fails.
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    try {
      return encode(text).length;
    } catch {
      // Fallback to heuristic if encoding fails
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Provider-specific exact token counting for cliff-sensitive paths.
   * Returns null when provider-native counting is not available.
   * (Anthropic countTokens, Gemini countTokens will be wired up when
   * those providers are available in the counting context.)
   */
  static async exactTokenCount(
    provider: string,
    params: { model: string; system?: any; tools?: any[]; messages?: any[] }
  ): Promise<number | null> {
    // Not yet implemented — provider-specific counting requires
    // access to provider instances. The cliff guard uses this for
    // pre-flight checks; callers should fall back to estimateTokens.
    return null;
  }

  /**
   * Check if an estimated token count is near the Claude 200K pricing cliff.
   * Above 200K input tokens, Claude doubles ALL token prices (input AND output)
   * for the entire request. This guard helps avoid accidentally crossing it.
   */
  static isNearClaudeCliff(estimatedTokens: number): boolean {
    const CLAUDE_CLIFF = 200_000;
    const SAFETY_MARGIN = 20_000; // 10% margin
    return estimatedTokens > (CLAUDE_CLIFF - SAFETY_MARGIN);
  }

  /**
   * Estimate tokens for an array of messages
   */
  static estimateMessagesTokens(messages: any[], systemPrompt: string | null = null): number {
    let total = 0;

    // Count system prompt
    if (systemPrompt) {
      total += this.estimateTokens(systemPrompt);
    }

    // Count each message
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.text) {
            total += this.estimateTokens(part.text);
          }
        }
      }

      // Count tool calls if present
      if (msg.tool_calls) {
        total += this.estimateTokens(JSON.stringify(msg.tool_calls));
      }
    }

    // Add overhead for message structure (~50 tokens per message)
    total += messages.length * 50;

    return total;
  }

  /**
   * Truncate messages to fit within token limit
   * Keeps most recent messages, removes older ones
   */
  static truncateMessages(
    messages: any[],
    systemPrompt: string | null,
    maxTokens: number
  ): { messages: any[]; truncated: boolean } {
    const currentTokens = this.estimateMessagesTokens(messages, systemPrompt);

    if (currentTokens <= maxTokens) {
      return { messages, truncated: false };
    }

    // Keep removing the oldest messages until we fit
    let truncatedMessages = [...messages];
    while (truncatedMessages.length > 1) {
      truncatedMessages.shift(); // Remove oldest
      const newTotal = this.estimateMessagesTokens(truncatedMessages, systemPrompt);
      if (newTotal <= maxTokens) {
        break;
      }
    }

    return {
      messages: truncatedMessages,
      truncated: true
    };
  }

  /**
   * Truncate a single text block to fit token limit
   */
  static truncateText(text: string, maxTokens: number): { text: string; truncated: boolean } {
    const currentTokens = this.estimateTokens(text);

    if (currentTokens <= maxTokens) {
      return { text, truncated: false };
    }

    // Binary search for the character position that fits within maxTokens.
    // Start with a conservative char estimate, then adjust.
    let lo = 0;
    let hi = text.length;
    let bestFit = Math.min(text.length, maxTokens * 4); // initial guess

    // Quick check: if initial guess already fits, use it directly
    try {
      while (hi - lo > 100) {
        const mid = Math.floor((lo + hi) / 2);
        const tokens = encode(text.substring(0, mid)).length;
        if (tokens <= maxTokens) {
          bestFit = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
    } catch {
      // Fallback to heuristic if encoding fails
      bestFit = Math.min(text.length, maxTokens * 4);
    }

    const truncatedText = text.substring(0, bestFit) + '\n\n[... truncated for length ...]';

    return {
      text: truncatedText,
      truncated: true
    };
  }

  /**
   * Get recommended limits per model
   */
  static getModelLimits(modelName: string): { maxInput: number; maxOutput: number } {
    const lowerModel = modelName.toLowerCase();

    // GPT-5 family
    if (lowerModel.includes('gpt-5')) {
      return { maxInput: 400000, maxOutput: 32768 }; // 400K context per OpenAI docs
    }

    // GPT-4 family (order matters: use startsWith/exact patterns to avoid cross-matching)
    // gpt-4.1 family: match 'gpt-4.1' but NOT 'gpt-4.10' etc — anchor with word boundary
    if (/gpt-4\.1(?:-|$)/.test(lowerModel) || lowerModel === 'gpt-4.1') {
      return { maxInput: 1000000, maxOutput: 32768 }; // 1M context
    }
    if (lowerModel.includes('gpt-4o')) {
      return { maxInput: 128000, maxOutput: 16000 }; // 128k context
    }
    // gpt-4-turbo and dated preview models (gpt-4-1106-preview, gpt-4-0125-preview)
    if (lowerModel.includes('gpt-4-turbo') || /gpt-4-\d{4}/.test(lowerModel)) {
      return { maxInput: 128000, maxOutput: 4096 };
    }
    if (lowerModel.includes('gpt-4')) {
      return { maxInput: 8000, maxOutput: 2000 };
    }

    // GPT-3.5
    if (lowerModel.includes('gpt-3.5')) {
      return { maxInput: 16000, maxOutput: 4000 };
    }

    // Claude family
    if (lowerModel.includes('claude')) {
      return { maxInput: 200000, maxOutput: 4096 }; // 200k context
    }

    // Gemini
    if (lowerModel.includes('gemini-2')) {
      return { maxInput: 1000000, maxOutput: 8192 }; // 1M context
    }
    if (lowerModel.includes('gemini')) {
      return { maxInput: 1000000, maxOutput: 2048 };
    }

    // Grok
    if (lowerModel.includes('grok')) {
      return { maxInput: 128000, maxOutput: 16000 };
    }

    // Mistral
    if (lowerModel.includes('mistral')) {
      return { maxInput: 32000, maxOutput: 8000 };
    }

    // Default conservative limits
    return { maxInput: 8000, maxOutput: 2000 };
  }

  /**
   * Summarize a group of conversation history entries into a compact bullet-point summary.
   * Extracts the first 2 sentences from each agent's response.
   */
  static summarizeRoundEntries(entries: { speaker: string; content: string; role: string }[]): string {
    const lines: string[] = [];
    for (const entry of entries) {
      if (entry.role !== 'assistant' || !entry.content) continue;
      // Extract first 2 sentences (split on ., !, ?)
      const sentences = entry.content.match(/[^.!?]*[.!?]/g);
      const summary = sentences
        ? sentences.slice(0, 2).join('').trim()
        : entry.content.substring(0, 200).trim();
      lines.push(`- ${entry.speaker}: ${summary}`);
    }
    return lines.length > 0 ? lines.join('\n') : '[No agent responses in this round]';
  }

  /**
   * Summarize round entries using an LLM router if available,
   * falling back to the heuristic summarizeRoundEntries().
   */
  static async summarizeWithLLM(
    entries: { speaker: string; content: string; role: string }[],
    round: number,
    router: TaskRouter | null
  ): Promise<string> {
    if (!router || !router.isActive()) {
      return this.summarizeRoundEntries(entries);
    }

    // Build the prompt with the round's conversation
    const conversation = entries
      .filter(e => e.role === 'assistant' && e.content)
      .map(e => `${e.speaker}: ${e.content}`)
      .join('\n\n');

    if (!conversation) {
      return this.summarizeRoundEntries(entries);
    }

    const prompt = `Summarize this discussion round into 2-4 bullet points. Capture key positions, disagreements, and conclusions. Be concise.\n\nRound ${round}:\n${conversation}`;

    const result = await router.route('summarize', prompt);
    return result || this.summarizeRoundEntries(entries);
  }

  /**
   * Check if messages exceed safe limits and provide warning
   */
  static checkLimits(
    messages: any[],
    systemPrompt: string | null,
    modelName: string
  ): {
    safe: boolean;
    currentTokens: number;
    maxTokens: number;
    percentUsed: number;
    warning?: string;
  } {
    const currentTokens = this.estimateMessagesTokens(messages, systemPrompt);
    const limits = this.getModelLimits(modelName);
    const percentUsed = (currentTokens / limits.maxInput) * 100;

    // Use 80% of limit as safety threshold
    const safeLimit = Math.floor(limits.maxInput * 0.8);
    const safe = currentTokens <= safeLimit;

    let warning: string | undefined;
    if (!safe) {
      warning = `Token usage (${currentTokens}) exceeds 80% of ${modelName} limit (${limits.maxInput}). Consider reducing context.`;
    }

    return {
      safe,
      currentTokens,
      maxTokens: limits.maxInput,
      percentUsed: Math.round(percentUsed),
      warning
    };
  }
}
