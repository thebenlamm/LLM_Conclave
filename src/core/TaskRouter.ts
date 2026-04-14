/**
 * TaskRouter - Routes subtasks to cheaper models for cost savings
 *
 * Uses a cheap model (default: gpt-4o-mini at ~$0.15/MTok) for
 * subtasks like history summarization. On primary failure, attempts
 * exactly one secondary provider before throwing.
 *
 * Phase 2 Context Tax: Model Routing for Subtasks (2.3)
 * Phase 13.1: secondary fallback + getLastSubstitution() (D-12, D-14)
 */

import ProviderFactory from '../providers/ProviderFactory';
import type { SummarizerFallbackInfo } from '../types/index.js';

export class TaskRouter {
  private cheapProvider: any = null;
  private readonly enabled: boolean;
  private readonly cheapModel: string;
  private secondaryProvider: any = null;
  private readonly secondaryModel: string;
  private _lastSubstitution: SummarizerFallbackInfo | null = null;

  constructor(options?: { cheapModel?: string; enabled?: boolean; secondaryModel?: string }) {
    this.enabled = options?.enabled ?? true;
    this.cheapModel = options?.cheapModel ?? 'gpt-4o-mini';
    // Rule: if primary is a gpt* model, secondary is claude-haiku-4-5; else gpt-4o-mini.
    this.secondaryModel = options?.secondaryModel
      ?? (this.cheapModel.startsWith('gpt') ? 'claude-haiku-4-5' : 'gpt-4o-mini');

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
   *
   * Returns null if disabled or the provider is unavailable. On primary
   * provider throw, attempts one retry against the secondary model. If the
   * secondary also fails (or cannot be initialized), THROWS an Error
   * wrapping both failure messages — the caller is responsible for handling
   * the hard-failure path (e.g. emitting history_compression_failed).
   */
  async route(
    task: 'summarize' | 'extract_state',
    prompt: string,
    systemPrompt?: string
  ): Promise<string | null> {
    this._lastSubstitution = null;

    if (!this.enabled || !this.cheapProvider) {
      return null;
    }

    const messages = [{ role: 'user' as const, content: prompt }];
    const sysPrompt = systemPrompt
      || 'You are a concise summarization assistant. Respond with only the requested output, no preamble.';

    try {
      const response = await this.cheapProvider.chat(messages, sysPrompt, { maxTokens: 500 });
      const text = typeof response === 'string' ? response : response.text;
      return text && text.trim().length > 0 ? text.trim() : null;
    } catch (primaryErr: any) {
      const primaryMsg = primaryErr?.message ?? String(primaryErr);
      console.warn(
        `[TaskRouter] primary '${this.cheapModel}' failed: ${primaryMsg} — attempting secondary '${this.secondaryModel}'`
      );

      // Lazy-init secondary provider so the startup cost is never paid
      // unless the fallback is actually needed.
      if (!this.secondaryProvider) {
        try {
          this.secondaryProvider = ProviderFactory.createProvider(this.secondaryModel);
        } catch (initErr: any) {
          throw new Error(
            `TaskRouter: primary '${this.cheapModel}' failed (${primaryMsg}) and secondary '${this.secondaryModel}' init failed (${initErr?.message ?? initErr})`
          );
        }
      }

      try {
        const secondaryResponse = await this.secondaryProvider.chat(messages, sysPrompt, { maxTokens: 500 });
        const secondaryText = typeof secondaryResponse === 'string' ? secondaryResponse : secondaryResponse.text;
        if (!secondaryText || secondaryText.trim().length === 0) {
          throw new Error('secondary returned empty response');
        }
        this._lastSubstitution = {
          original: this.cheapModel,
          substitute: this.secondaryModel,
          reason: primaryMsg,
        };
        return secondaryText.trim();
      } catch (secondaryErr: any) {
        const secondaryMsg = secondaryErr?.message ?? String(secondaryErr);
        throw new Error(
          `TaskRouter: primary '${this.cheapModel}' failed (${primaryMsg}); secondary '${this.secondaryModel}' failed (${secondaryMsg})`
        );
      }
    }
  }

  /**
   * Check if the router is active (enabled + provider available).
   */
  isActive(): boolean {
    return this.enabled && this.cheapProvider !== null;
  }

  /**
   * Returns substitution info populated during the most recent route() call,
   * or null if no substitution occurred.
   */
  getLastSubstitution(): SummarizerFallbackInfo | null {
    return this._lastSubstitution;
  }
}
