import { ContextOptimizer } from '../utils/ContextOptimizer.js';
import TokenCounter from '../utils/TokenCounter.js';
import type { DiscussionHistoryEntry, Config } from '../types/index.js';

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

  /**
   * @param entries - Shared reference to ConversationManager.conversationHistory.
   *   ConversationHistory mutates this array in-place so both sides always see the same data.
   * @param config - Config reference for agents and context optimization settings
   * @param getCurrentRound - Callback returning ConversationManager.currentRound
   * @param getAgentSubstitutions - Callback returning the agentSubstitutions Map
   * @param getAgents - Callback returning the agents map keyed by agent name
   * @param getTaskRouter - Callback returning the taskRouter (may be null)
   * @param onCacheInvalidated - Callback invoked after compression to reset CM-side caches
   *   (cachedRecentDiscussion, lastJudgeCacheRound)
   */
  constructor(
    private entries: DiscussionHistoryEntry[],
    private config: Config,
    private getCurrentRound: () => number,
    private getAgentSubstitutions: () => Map<string, { original: string; fallback: string; reason: string }>,
    private getAgents: () => Record<string, any>,
    private getTaskRouter: () => any,
    private onCacheInvalidated: () => void
  ) {}

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
}
