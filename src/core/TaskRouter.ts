/**
 * TaskRouter - Routes subtasks to cheaper models for cost savings
 *
 * Uses a cheap model (default: gpt-4o-mini at ~$0.15/MTok) for
 * subtasks like history summarization. Falls back gracefully to
 * null (caller uses heuristic) on any failure.
 *
 * Phase 2 Context Tax: Model Routing for Subtasks (2.3)
 */

import ProviderFactory from '../providers/ProviderFactory';

export class TaskRouter {
  private cheapProvider: any = null;
  private readonly enabled: boolean;
  private readonly cheapModel: string;

  constructor(options?: { cheapModel?: string; enabled?: boolean }) {
    this.enabled = options?.enabled ?? true;
    this.cheapModel = options?.cheapModel ?? 'gpt-4o-mini';

    if (this.enabled) {
      try {
        this.cheapProvider = ProviderFactory.createProvider(this.cheapModel);
      } catch (err: any) {
        console.error(`[TaskRouter] Failed to initialize cheap model '${this.cheapModel}': ${err?.message || err}`);
        this.cheapProvider = null;
      }
    }
  }

  /**
   * Route a subtask to the cheap model.
   * Returns null if disabled, provider unavailable, or on failure.
   * Caller should fall back to heuristic when null is returned.
   */
  async route(
    task: 'summarize' | 'extract_state',
    prompt: string,
    systemPrompt?: string
  ): Promise<string | null> {
    if (!this.enabled || !this.cheapProvider) {
      return null;
    }

    try {
      const messages = [{ role: 'user' as const, content: prompt }];
      const response = await this.cheapProvider.chat(
        messages,
        systemPrompt || 'You are a concise summarization assistant. Respond with only the requested output, no preamble.',
        { maxTokens: 500 }
      );

      const text = typeof response === 'string' ? response : response.text;
      return text && text.trim().length > 0 ? text.trim() : null;
    } catch {
      // API error — fall back to heuristic
      return null;
    }
  }

  /**
   * Check if the router is active (enabled + provider available).
   */
  isActive(): boolean {
    return this.enabled && this.cheapProvider !== null;
  }
}
