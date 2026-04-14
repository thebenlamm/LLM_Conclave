import { encode } from 'gpt-tokenizer';
import { ContextOptimizer } from '../utils/ContextOptimizer.js';
import TokenCounter from '../utils/TokenCounter.js';
import { getTpmLimit, inferProviderFromModel } from '../providers/tpmLimits.js';
import type {
  DiscussionHistoryEntry,
  Config,
  SummarizerFallbackInfo,
  HistoryCompressedPayload,
  HistoryCompressionFailedPayload,
  SummarizerFallbackPayload,
} from '../types/index.js';
import { EventBus } from './EventBus.js';

// Type-only import — avoid hard runtime dependency so tests can inject mocks.
import type { TaskRouter } from './TaskRouter.js';

/**
 * Phase 13 compression knobs. All optional; defaults are applied inline.
 */
export interface CompressionConfig {
  /** Number of most-recent messages to keep verbatim. Default 6. */
  recentWindowSize?: number;
  /**
   * Phase 13.1 D-11: authoritative "tail size" emitted in the
   * history_compressed payload and consumed by runIntegrity.compression
   * (plan 13.1-05). When omitted, falls back to recentWindowSize so the
   * two knobs never disagree.
   */
  verbatimTailSize?: number;
  /** Regenerate the running summary only every K new turns. Default 4. */
  summaryRefreshEveryNTurns?: number;
  /** Fraction of the minimum active-provider TPM ceiling that triggers compression. Default 0.5. */
  thresholdRatio?: number;
}

const DEFAULT_COMPRESSION_CONFIG: Required<CompressionConfig> = {
  recentWindowSize: 6,
  verbatimTailSize: 6,
  summaryRefreshEveryNTurns: 4,
  thresholdRatio: 0.5,
};

/**
 * Owns all history manipulation for a conversation session.
 *
 * Extracted from ConversationManager as part of the god-class decomposition.
 * Responsible for:
 *   - Grouping history by round
 *   - Compressing history when over token threshold
 *   - Formatting history entries as provider messages
 *   - Preparing message arrays with various context budget strategies
 */
export default class ConversationHistory {
  // Performance optimizations: message caching
  private messageCache: any[] = [];
  private lastCacheUpdateIndex: number = 0;

  // Phase 13 — sliding-window compression state
  private _runningSummary: string | null = null;
  private _summaryCoversUpToIndex: number = 0;
  private _turnsSinceLastSummaryRefresh: number = 0;
  private _lastSeenEntriesLength: number = 0;

  // Phase 13.1 — compression transparency state (D-11, D-12, D-14)
  private _compressionActivatedAtRound: number | null = null;
  private _summaryRegenerationCount: number = 0;
  private _lastSummarizerModel: string | null = null;
  private _lastSummarizerFallback: SummarizerFallbackInfo | null = null;
  private eventBus?: EventBus;
  /**
   * Last resolved compression config — persisted so plan 13.1-05's
   * runIntegrity.compression.tailSize can read the same authoritative
   * source that the history_compressed payload emits.
   */
  private _lastResolvedCompressionConfig: Required<CompressionConfig> | null = null;

  /**
   * @param entries - Shared reference to ConversationManager.conversationHistory.
   *   ConversationHistory mutates this array in-place so both sides always see the same data.
   * @param config - Config reference for agents and context optimization settings
   * @param getCurrentRound - Callback returning ConversationManager.currentRound
   * @param getAgentSubstitutions - Callback returning the agentSubstitutions plain object
   * @param getAgents - Callback returning the agents map keyed by agent name
   * @param getTaskRouter - Callback returning the taskRouter (may be null)
   * @param onCacheInvalidated - Callback invoked after compression to reset CM-side caches
   *   (cachedRecentDiscussion, lastJudgeCacheRound)
   */
  constructor(
    private entries: DiscussionHistoryEntry[],
    private config: Config,
    private getCurrentRound: () => number,
    private getAgentSubstitutions: () => Record<string, { original: string; fallback: string; reason: string }>,
    private getAgents: () => Record<string, any>,
    private getTaskRouter: () => any,
    private onCacheInvalidated: () => void,
    eventBus?: EventBus
  ) {
    this.eventBus = eventBus;
  }

  // Phase 13.1 — public compression-state getters (D-11, D-12, D-14)
  public get compressionActivatedAtRound(): number | null {
    return this._compressionActivatedAtRound;
  }
  public get summaryRegenerationCount(): number {
    return this._summaryRegenerationCount;
  }
  public get lastSummarizerModel(): string | null {
    return this._lastSummarizerModel;
  }
  public get lastSummarizerFallback(): SummarizerFallbackInfo | null {
    return this._lastSummarizerFallback;
  }
  /**
   * The authoritative "tail size" from the last resolved compression config.
   * Plan 13.1-05 reads this for runIntegrity.compression.tailSize so the
   * history_compressed payload and runIntegrity never disagree.
   */
  public get verbatimTailSize(): number {
    return (
      this._lastResolvedCompressionConfig?.verbatimTailSize
      ?? this._lastResolvedCompressionConfig?.recentWindowSize
      ?? DEFAULT_COMPRESSION_CONFIG.verbatimTailSize
    );
  }

  /**
   * Model-aware token threshold for triggering history compression.
   * Claude models use a higher threshold (150K) to stay below the 200K pricing cliff.
   * Other models use the original 80K threshold.
   */
  getHistoryTokenThreshold(): number {
    const agents = this.getAgents();
    const hasClaudeModel = Object.values(agents).some(
      (a: any) => a.model?.toLowerCase().includes('claude')
    ) || this.config?.judge?.model?.toLowerCase().includes('claude');

    if (hasClaudeModel) {
      return 150_000; // Leave 50K headroom before 200K pricing cliff
    }
    return 80_000; // Default for other models
  }

  /**
   * Group conversation history entries by round.
   * Uses Judge guidance entries as round delimiters.
   */
  groupHistoryByRound(): { round: number; entries: any[] }[] {
    const rounds: { round: number; entries: any[] }[] = [];
    let currentRound = 1;
    let currentEntries: any[] = [];

    for (const entry of this.entries) {
      currentEntries.push(entry);

      // Round delimiters: Judge guidance OR compressed round summaries
      const isJudgeGuidance = entry.speaker === 'Judge' && entry.role === 'user';
      const isCompressedRound = entry.compressed === true;
      if (isJudgeGuidance || isCompressedRound) {
        rounds.push({ round: currentRound, entries: currentEntries });
        currentRound++;
        currentEntries = [];
      }
    }

    // Don't forget the current in-progress round
    if (currentEntries.length > 0) {
      rounds.push({ round: currentRound, entries: currentEntries });
    }

    return rounds;
  }

  /**
   * Compress conversation history if it exceeds the token threshold.
   * Keeps round 1 (initial positions) and last 2 rounds verbatim.
   * Compresses middle rounds into summaries.
   * Uses TaskRouter for LLM-powered summarization when available.
   *
   * Mutates the shared entries array IN-PLACE so ConversationManager's
   * conversationHistory reference stays valid after compression.
   */
  async compressHistory(): Promise<void> {
    const totalTokens = TokenCounter.estimateMessagesTokens(
      this.entries.map(e => ({ role: e.role, content: e.content })),
      null
    );

    const threshold = this.getHistoryTokenThreshold();
    if (totalTokens < threshold) {
      return;
    }

    const roundGroups = this.groupHistoryByRound();
    if (roundGroups.length <= 3) {
      // Not enough rounds to compress (need at least 4: keep first + last 2, compress middle)
      return;
    }

    console.log(`[History compression: ${totalTokens} tokens exceeds ${threshold} threshold, compressing ${roundGroups.length - 3} middle rounds]`);

    const newHistory: DiscussionHistoryEntry[] = [];
    const taskRouter = this.getTaskRouter();

    for (let i = 0; i < roundGroups.length; i++) {
      const group = roundGroups[i];
      const isFirst = i === 0;
      const isLastTwo = i >= roundGroups.length - 2;

      if (isFirst || isLastTwo) {
        // Keep verbatim
        newHistory.push(...group.entries);
      } else {
        // Compress to summary — use LLM router if available, else heuristic
        const summary = await TokenCounter.summarizeWithLLM(group.entries, group.round, taskRouter);
        newHistory.push({
          role: 'user',
          content: `[Round ${group.round} summary]\n${summary}`,
          speaker: 'System',
          compressed: true
        } as DiscussionHistoryEntry);
      }
    }

    const beforeCount = this.entries.length;

    // Mutate in-place to keep ConversationManager's reference valid
    this.entries.splice(0, this.entries.length, ...newHistory);

    // Reset message cache since history structure changed
    this.messageCache = [];
    this.lastCacheUpdateIndex = 0;

    // Signal ConversationManager to reset its judge-side caches
    this.onCacheInvalidated();

    const newTokens = TokenCounter.estimateMessagesTokens(
      newHistory.map(e => ({ role: e.role, content: e.content })),
      null
    );
    console.log(`[History compressed: ${beforeCount} → ${newHistory.length} entries, ${totalTokens} → ${newTokens} tokens]`);
  }

  /**
   * Format a history entry as a message for agent consumption.
   * When compress=true, agent responses use position-only summaries.
   */
  private formatEntryAsMessage(entry: any, compress: boolean): { role: string; content: string } {
    const isAgentResponse = entry.role === 'assistant' && entry.speaker !== 'System' && entry.speaker !== 'Judge';
    const content = (compress && isAgentResponse)
      ? `${entry.speaker}: ${ContextOptimizer.compressEntryForAgent(entry)}`
      : (entry.speaker !== 'System'
        ? `${entry.speaker}: ${entry.content}`
        : entry.content);
    return {
      role: entry.role === 'user' ? 'user' : 'assistant',
      content
    };
  }

  /**
   * Prepare message array for an agent from conversation history.
   * Rebuilds from scratch each call to correctly filter errors and merge
   * consecutive same-role messages (required by Claude's alternation rule).
   */
  prepareMessagesForAgent(): any[] {
    // Rebuild from scratch every time — merging consecutive same-role messages
    // requires a full pass (incremental append can't merge with previous tail).
    const contextOptEnabled = this.config.contextOptimization?.enabled;

    // Use progressive round compression when context optimization is enabled.
    let rawMessages: { role: string; content: string }[];

    if (contextOptEnabled && this.getCurrentRound() > 1) {
      rawMessages = this.prepareMessagesWithRoundCompression();
    } else {
      rawMessages = this.entries
        .filter(entry => !entry.error)
        .map(entry => this.formatEntryAsMessage(entry, !!contextOptEnabled));
    }

    // Merge consecutive same-role messages to avoid Claude's
    // "must alternate user/assistant" rejection.
    const merged: any[] = [];
    for (const msg of rawMessages) {
      if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
        merged[merged.length - 1].content += '\n\n' + msg.content;
      } else {
        merged.push({ ...msg });
      }
    }

    // Ensure array ends with a user message — Claude rejects assistant-last sequences.
    if (merged.length > 0 && merged[merged.length - 1].role === 'assistant') {
      merged.push({
        role: 'user',
        content: 'Please continue the discussion with your perspective.'
      });
    }

    return merged;
  }

  /**
   * Build messages with progressive round compression.
   * Groups history by round, applies tiered compression based on round age,
   * then flattens back into a message array.
   */
  private prepareMessagesWithRoundCompression(): { role: string; content: string }[] {
    const roundGroups = this.groupHistoryByRound();
    // Use currentRound as totalRounds since we're preparing context for the current
    // round which may not have entries in history yet. This ensures older rounds
    // get compressed relative to where we actually are, not just what's in history.
    const totalRounds = Math.max(roundGroups.length, this.getCurrentRound());
    const messages: { role: string; content: string }[] = [];

    for (const group of roundGroups) {
      const tier = ContextOptimizer.getCompressionTier(group.round, totalRounds);

      if (tier === 'position') {
        for (const entry of group.entries) {
          if (entry.error) continue;
          messages.push(this.formatEntryAsMessage(entry, true));
        }
      } else {
        // oneSentence or bullet tier: replace agent entries with a single summary
        // at the first agent's chronological position.
        const compressed = ContextOptimizer.compressRound(group.entries, tier);
        let summaryEmitted = false;

        for (const entry of group.entries) {
          if (entry.error) continue;
          const isAgentResponse = entry.role === 'assistant' && entry.speaker !== 'System' && entry.speaker !== 'Judge';

          if (isAgentResponse) {
            if (!summaryEmitted && compressed) {
              messages.push({
                role: 'assistant',
                content: `[Round ${group.round} summary]\n${compressed}`
              });
              summaryEmitted = true;
            }
            continue;
          }

          messages.push(this.formatEntryAsMessage(entry, false));
        }
      }
    }

    return messages;
  }

  /**
   * Prepare messages with token budget awareness for a specific agent.
   * Returns null if messages cannot fit within the agent's model limits even after truncation.
   */
  prepareMessagesWithBudget(agentName: string): any[] | null {
    const agents = this.getAgents();
    const agent = agents[agentName];
    const messages = this.prepareMessagesForAgent();
    const limits = TokenCounter.getModelLimits(agent.model);

    // Reserve space for response (~6K tokens for overhead + response)
    const inputBudget = limits.maxInput - 6000;
    const currentTokens = TokenCounter.estimateMessagesTokens(messages, agent.systemPrompt);

    // Under 80% of input budget: safe to proceed as-is
    const safeBudget = Math.floor(inputBudget * 0.8);
    if (currentTokens <= safeBudget) {
      return messages;
    }

    // Over 80% of budget: truncate a COPY to 75% of budget (don't mutate shared messageCache)
    const targetTokens = Math.floor(inputBudget * 0.75);
    const percentUsed = Math.round((currentTokens / limits.maxInput) * 100);
    console.log(`[${agentName}: ${currentTokens}/${limits.maxInput} tokens (~${percentUsed}% of ${agent.model} configured limit), truncating to fit]`);

    const { messages: truncated, truncated: didTruncate } = TokenCounter.truncateMessages(
      messages.map(m => ({ ...m })),  // Copy to avoid mutating cache
      agent.systemPrompt,
      targetTokens
    );

    if (didTruncate) {
      console.log(`[${agentName}: truncated from ${messages.length} to ${truncated.length} messages]`);
    }

    // Verify we're now under the hard limit
    const postCheck = TokenCounter.estimateMessagesTokens(truncated, agent.systemPrompt);
    if (postCheck > inputBudget) {
      console.log(`[${agentName}: still over limit after truncation (${postCheck}/${inputBudget} tokens), skipping]`);
      return null;
    }

    return truncated;
  }

  // ---------------------------------------------------------------------------
  // Phase 13 — Sliding-window compression with running summary
  // ---------------------------------------------------------------------------

  /**
   * Phase 13 — sliding-window compression. Closes the unbounded-history-replay
   * TPM blowup identified in the Trollix run (562K input / 40K output, 14:1 ratio).
   *
   * Returns a compressed view of the conversation history for downstream agent
   * prompt assembly. Below the configured token threshold this returns the raw
   * history unchanged. Above the threshold, older messages are replaced with a
   * single running summary block and only the last N messages are kept verbatim.
   *
   * The running summary is regenerated only every K new turns; intervening
   * calls reuse the cached summary. The raw entries array is NEVER mutated.
   *
   * Summarization is routed via the injected TaskRouter (cheapest healthy
   * provider). If no router is supplied or the router fails, falls back to a
   * deterministic non-LLM rollup of the older messages.
   *
   * @param agents - Active agent panel; provider/model used to compute the
   *   minimum TPM ceiling that gates compression activation.
   * @param options - taskRouter (optional), config (optional knobs), tpmOverrides.
   */
  async getCompressedHistoryFor(
    agents: Record<string, { model: string; provider?: string }>,
    options: {
      taskRouter?: TaskRouter;
      config?: CompressionConfig;
      tpmOverrides?: Record<string, number>;
    } = {}
  ): Promise<DiscussionHistoryEntry[]> {
    const resolvedRecentWindowSize =
      options.config?.recentWindowSize ?? DEFAULT_COMPRESSION_CONFIG.recentWindowSize;
    const cfg: Required<CompressionConfig> = {
      recentWindowSize: resolvedRecentWindowSize,
      // Phase 13.1 D-11: verbatimTailSize is the authoritative tail-size
      // field; when not explicitly supplied, mirror recentWindowSize so the
      // two knobs never disagree.
      verbatimTailSize:
        options.config?.verbatimTailSize ?? resolvedRecentWindowSize,
      summaryRefreshEveryNTurns:
        options.config?.summaryRefreshEveryNTurns ?? DEFAULT_COMPRESSION_CONFIG.summaryRefreshEveryNTurns,
      thresholdRatio: options.config?.thresholdRatio ?? DEFAULT_COMPRESSION_CONFIG.thresholdRatio,
    };
    this._lastResolvedCompressionConfig = cfg;

    // Track how many new entries have appeared since the last call so we can
    // increment the refresh counter without coupling to ConversationManager's
    // push site (Plan 03 will wire the explicit hook).
    const delta = this.entries.length - this._lastSeenEntriesLength;
    if (delta > 0) {
      this._turnsSinceLastSummaryRefresh += delta;
      this._lastSeenEntriesLength = this.entries.length;
    }

    // Compute total estimated input tokens for the assembled history.
    const totalTokens = this.entries.reduce(
      (sum, e) => sum + encode(`${e.speaker}: ${e.content}`).length,
      0
    );

    // Compute the threshold from the minimum TPM ceiling across active agents.
    let minTpm = Number.POSITIVE_INFINITY;
    for (const cfgAgent of Object.values(agents)) {
      // Belt-and-suspenders: callers historically passed the ConversationManager
      // agent map whose `.provider` is an LLMProvider *instance*, not a string.
      // That tripped `provider.toUpperCase()` inside tpmLimits and — hidden by a
      // swallowing try/catch — silently disabled compression. Coerce non-string
      // providers through the model-based inference path.
      const provider =
        typeof cfgAgent.provider === 'string' && cfgAgent.provider.length > 0
          ? cfgAgent.provider
          : inferProviderFromModel(cfgAgent.model);
      const limit = getTpmLimit(provider, cfgAgent.model, options.tpmOverrides);
      if (limit < minTpm) minTpm = limit;
    }
    const threshold = Number.isFinite(minTpm) ? minTpm * cfg.thresholdRatio : Number.POSITIVE_INFINITY;

    // Below threshold: return the raw history unchanged (immutable copy).
    if (totalTokens < threshold) {
      return this.entries.slice();
    }

    // Above threshold: ensure the running summary is fresh, then assemble.
    const olderEnd = Math.max(0, this.entries.length - cfg.recentWindowSize);

    // Phase 13.1 D-11: record the first round at which compression activated.
    const currentRound = this.getCurrentRound();
    if (this._compressionActivatedAtRound === null) {
      this._compressionActivatedAtRound = currentRound;
    }

    await this._refreshSummaryIfDue(olderEnd, cfg, options.taskRouter, currentRound);

    const summaryEntry: DiscussionHistoryEntry = {
      role: 'user',
      content: this._runningSummary || '',
      speaker: 'System',
      compressed: true,
    };

    const recent = this.entries.slice(olderEnd);
    return [summaryEntry, ...recent];
  }

  /**
   * Refresh `_runningSummary` if the refresh counter has reached K, OR if no
   * summary has been generated yet. Otherwise reuses the cached summary.
   * Falls back to a deterministic rollup if the TaskRouter is unavailable
   * or returns null.
   */
  private async _refreshSummaryIfDue(
    olderEnd: number,
    cfg: Required<CompressionConfig>,
    taskRouter?: TaskRouter,
    currentRound: number = this.getCurrentRound()
  ): Promise<void> {
    const needsInitial = this._runningSummary === null;
    const dueByCounter = this._turnsSinceLastSummaryRefresh >= cfg.summaryRefreshEveryNTurns;

    if (!needsInitial && !dueByCounter) {
      return; // cached summary is still fresh
    }

    const olderMessages = this.entries.slice(0, olderEnd);
    if (olderMessages.length === 0) {
      this._runningSummary = '';
      this._summaryCoversUpToIndex = 0;
      this._turnsSinceLastSummaryRefresh = 0;
      return;
    }

    const oldMessagesAsText = olderMessages
      .map(e => `${e.speaker}: ${e.content}`)
      .join('\n\n');

    const prompt =
      'Summarize the following multi-agent discussion turns into a dense bullet list ' +
      "preserving each agent's positions, disagreements, and decisions. " +
      'Output only the bullets, no preamble.\n\n<turns>\n' +
      oldMessagesAsText +
      '\n</turns>';

    // Phase 13.1 D-12: no more silent try/catch. If TaskRouter throws on a
    // hard failure (both primary and secondary exhausted), emit a
    // history_compression_failed event with fallbackAction='serve-uncompressed'
    // and fall through to the deterministic non-LLM rollup. This fixes the
    // Phase 13 Truth #1 PARTIAL silent-swallow bug.
    let summary: string | null = null;
    let summarizerThrew = false;
    if (taskRouter && typeof (taskRouter as any).route === 'function') {
      try {
        summary = await (taskRouter as any).route('summarize', prompt);
      } catch (err: any) {
        summarizerThrew = true;
        const errorMessage = err?.message ?? String(err);
        const failedPayload: HistoryCompressionFailedPayload = {
          round: currentRound,
          error: errorMessage,
          fallbackAction: 'serve-uncompressed',
        };
        this.eventBus?.emitEvent('conversation:history_compression_failed', failedPayload);
        console.error(
          `[ConversationHistory] summarizer failed round ${currentRound}: ${errorMessage} — falling back to deterministic rollup`
        );
        summary = null;
      }
    }

    // Phase 13.1 D-14: whenever route() succeeded, read getLastSubstitution()
    // and surface any substitution via conversation:summarizer_fallback.
    if (!summarizerThrew && summary && taskRouter) {
      const fallbackInfo: SummarizerFallbackInfo | null =
        typeof (taskRouter as any).getLastSubstitution === 'function'
          ? ((taskRouter as any).getLastSubstitution() ?? null)
          : null;
      if (fallbackInfo) {
        this._lastSummarizerModel = fallbackInfo.substitute;
        this._lastSummarizerFallback = fallbackInfo;
        const fallbackPayload: SummarizerFallbackPayload = {
          round: currentRound,
          originalModel: fallbackInfo.original,
          substituteModel: fallbackInfo.substitute,
          reason: fallbackInfo.reason,
        };
        this.eventBus?.emitEvent('conversation:summarizer_fallback', fallbackPayload);
      } else if (this._lastSummarizerModel === null && (taskRouter as any).cheapModel) {
        this._lastSummarizerModel = (taskRouter as any).cheapModel;
      }
    }

    if (!summary || summary.trim().length === 0) {
      // Deterministic non-LLM fallback rollup (also used when router threw).
      const parts = olderMessages.map(e => {
        const text = `${e.speaker}: ${e.content}`;
        return text.length > 200 ? text.slice(0, 200) : text;
      });
      summary = `Earlier turns (${olderMessages.length} messages): ` + parts.join(' | ');
    }

    const isRegeneratedBySummarizer = !summarizerThrew;

    this._runningSummary = summary;
    this._summaryCoversUpToIndex = olderEnd;
    this._turnsSinceLastSummaryRefresh = 0;

    // Phase 13.1 D-11: emit history_compressed only for successful summarizer
    // regenerations (not the degraded fallback path, which already emitted
    // history_compression_failed above).
    if (isRegeneratedBySummarizer) {
      this._summaryRegenerationCount += 1;
      const compressedPayload: HistoryCompressedPayload = {
        round: currentRound,
        messagesCompressed: olderMessages.length,
        // D-11: tailSize comes from the configured verbatimTailSize (the
        // authoritative single source of truth). Plan 13.1-05 reads the same
        // value when populating runIntegrity.compression.tailSize.
        tailSize: cfg.verbatimTailSize,
        summaryLengthTokens: Math.ceil((summary?.length ?? 0) / 4),
        cumulativeRegenerations: this._summaryRegenerationCount,
      };
      this.eventBus?.emitEvent('conversation:history_compressed', compressedPayload);
    }
  }
}
