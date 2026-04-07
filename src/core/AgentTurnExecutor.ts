import ProviderFactory from '../providers/ProviderFactory.js';
import TokenCounter from '../utils/TokenCounter.js';
import { ContextOptimizer } from '../utils/ContextOptimizer.js';
import type { DiscussionHistoryEntry, Config } from '../types/index.js';
import type ConversationHistory from './ConversationHistory.js';
import type { EventBus } from './EventBus.js';
import type { TaskRouter } from './TaskRouter.js';
import type { CostTracker } from './CostTracker.js';

export interface AgentTurnDeps {
  agents: { [key: string]: any };
  config: Config;
  conversationHistory: DiscussionHistoryEntry[];
  history: ConversationHistory;
  streamOutput: boolean;
  eventBus?: EventBus;
  abortSignal?: AbortSignal;
  taskRouter: TaskRouter | null;
  costTracker: CostTracker;
}

/**
 * Owns the full single-agent call cycle extracted from ConversationManager.
 *
 * Responsibilities:
 *   - Circuit breaker (persistentlyFailedAgents)
 *   - Empty-response retry
 *   - Connection-error retry with delay
 *   - Model fallback on retryable errors
 *   - Abort signal bridging per-call
 *   - Agent failure/success tracking
 *   - Pushing responses to conversationHistory
 */
export default class AgentTurnExecutor {
  // Circuit breaker state — agents permanently removed after 2 consecutive failures
  private persistentlyFailedAgents: Set<string> = new Set();
  private consecutiveAgentFailures: Map<string, number> = new Map();
  // Model substitution tracking — for post-discussion reporting
  private agentSubstitutions: Map<string, { original: string; fallback: string; reason: string }> = new Map();

  constructor(private deps: AgentTurnDeps) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Execute one agent's turn in the conversation.
   * Preserves identical logic from ConversationManager.agentTurn().
   */
  async agentTurn(agentName: string): Promise<void> {
    // Circuit breaker: skip agents that have failed repeatedly
    if (this.persistentlyFailedAgents.has(agentName)) {
      return;
    }

    const agent = this.deps.agents[agentName];

    console.log(`[${agentName} (${agent.model}) is thinking...]\n`);
    if (this.deps.streamOutput) {
      console.log(`${agentName}:`);
    }

    if (this.deps.eventBus) {
      this.deps.eventBus.emitEvent('agent:thinking', { agent: agentName, model: agent.model });
    }

    try {
      // Prepare messages with token budget check
      const messages = this.deps.history.prepareMessagesWithBudget(agentName);
      if (!messages) {
        // Agent's context window can't fit the conversation even after truncation
        console.log(`[${agentName} skipped: conversation too large for ${agent.model} context window]\n`);
        if (this.deps.eventBus) {
          this.deps.eventBus.emitEvent('error', {
            message: `${agentName} skipped: context exceeds ${agent.model} limits`,
            context: 'token_budget_exceeded'
          });
        }
        this.deps.conversationHistory.push({
          role: 'assistant',
          content: `[${agentName} unavailable: conversation exceeds ${agent.model} context window]`,
          speaker: agentName,
          model: agent.model,
          error: true,
          errorDetails: 'token_budget_exceeded',
          timestamp: new Date().toISOString()
        });
        this.recordAgentFailure(agentName, 'context window exceeded');
        return;
      }

      // Get agent's response (with one retry on empty response)
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefixPattern = new RegExp(`^\\s*${escapeRegex(agentName)}\\s*:\\s*`, 'i');

      let text = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        // Clone messages per attempt — providers may mutate in place, corrupting future turns
        const attemptMessages = messages.map((m: any) => ({ ...m }));
        const { controller: callController, cleanup: callCleanup } = this.createCallAbortController();
        let response;
        try {
          const chatOpts = { ...this.getChatOptions(agentName), signal: callController.signal };
          response = await agent.provider.chat(attemptMessages, agent.systemPrompt, chatOpts);
        } finally {
          callCleanup();
        }
        text = typeof response === 'string' ? response : (response.text ?? '');

        // Strip leading speaker name prefix if LLM echoed it back (prevents compounding prefixes)
        text = text.replace(prefixPattern, '').trim();

        if (text && text.length > 0) break; // Got a valid response

        if (attempt === 0) {
          console.log(`[${agentName} returned empty response, retrying once...]`);
        }
      }

      // Handle empty/whitespace-only responses after retry
      if (!text || text.length === 0) {
        console.log(`[${agentName} returned empty response after retry, skipping]\n`);
        if (this.deps.eventBus) {
          this.deps.eventBus.emitEvent('error', {
            message: `${agentName} returned empty response after retry`,
            context: 'empty_response'
          });
        }
        // Record failure in history so consensus/summary can account for this agent
        this.deps.conversationHistory.push({
          role: 'assistant',
          content: `[${agentName} unavailable: returned empty response after retry]`,
          speaker: agentName,
          model: agent.model,
          error: true,
          errorDetails: 'empty_response_after_retry',
          timestamp: new Date().toISOString()
        });
        this.recordAgentFailure(agentName, 'empty_response');
        return;
      }

      if (this.deps.streamOutput) {
        process.stdout.write('\n');
      } else {
        console.log(`${agentName}: ${text}\n`);
      }

      if (this.deps.eventBus) {
        this.deps.eventBus.emitEvent('agent:response', { agent: agentName, content: text });
      }

      // Add to conversation history (with context optimization extraction if enabled)
      this.pushAgentResponse(text, agentName, agent.model);

      // Circuit breaker: reset failure count on success
      this.recordAgentSuccess(agentName);

    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`Error with agent ${agentName}: ${errorMsg}`);

      // Connection-error retry: detect stale connections (common in long-running launchd processes)
      // and retry once before falling through to model-fallback logic.
      const isConnectionError = /connection.?error|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket.?hang.?up|fetch.?failed|network|aborted|per-call timeout/i.test(errorMsg);
      const isClientError = /4\d{2}|unauthorized|forbidden|bad.?request/i.test(errorMsg);
      if (isConnectionError && !isClientError) {
        console.log(`[${agentName}: Connection error detected, retrying once after 2s...]`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const retryMessages = this.deps.history.prepareMessagesWithBudget(agentName);
          if (retryMessages) {
            const retryMsgs = retryMessages.map((m: any) => ({ ...m }));
            const { controller: retryController, cleanup: retryCleanup } = this.createCallAbortController(90_000);
            let retryResponse;
            try {
              const retryOpts = { ...this.getChatOptions(agentName), signal: retryController.signal };
              retryResponse = await agent.provider.chat(retryMsgs, agent.systemPrompt, retryOpts);
            } finally {
              retryCleanup();
            }
            let retryText = typeof retryResponse === 'string' ? retryResponse : (retryResponse.text ?? '');
            const escapeRegex2 = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prefixPattern2 = new RegExp(`^\\s*${escapeRegex2(agentName)}\\s*:\\s*`, 'i');
            retryText = retryText.replace(prefixPattern2, '').trim();

            if (retryText && retryText.length > 0) {
              console.log(`[${agentName}: Connection retry succeeded]`);
              if (!this.deps.streamOutput) {
                console.log(`${agentName}: ${retryText}\n`);
              }
              if (this.deps.eventBus) {
                this.deps.eventBus.emitEvent('agent:response', { agent: agentName, content: retryText });
              }
              this.pushAgentResponse(retryText, agentName, agent.model);
              this.recordAgentSuccess(agentName);
              return;
            }
          }
        } catch (retryError: any) {
          console.error(`[${agentName}: Connection retry also failed: ${retryError.message}]`);
        }
        // Fall through to existing fallback/failure logic
      }

      // Try fallback to a different provider on retryable errors (429, 502, 503)
      // NOTE: Emit error event AFTER fallback attempt — if fallback succeeds, no error to report
      const isRetryable = /429|rate.?limit|502|503|service.?error/i.test(errorMsg);
      if (isRetryable && !this.agentSubstitutions.has(agentName)) {
        const fallbackModel = this.getFallbackModel(agent.model);
        if (fallbackModel) {
          console.log(`[${agentName}: ${agent.model} failed, falling back to ${fallbackModel}]`);
          try {
            const fallbackProvider = ProviderFactory.createProvider(fallbackModel, { costTracker: this.deps.costTracker });
            // Use budget-aware message preparation against fallback model's limits
            const rawMessages = this.deps.history.prepareMessagesForAgent();
            const fallbackLimits = TokenCounter.getModelLimits(fallbackModel);
            const fallbackBudget = fallbackLimits.maxInput - 6000;
            const fallbackTokens = TokenCounter.estimateMessagesTokens(rawMessages, agent.systemPrompt);
            let fallbackMessages = rawMessages;
            if (fallbackTokens > fallbackBudget * 0.8) {
              const { messages: truncated } = TokenCounter.truncateMessages(
                rawMessages.map((m: any) => ({ ...m })),
                agent.systemPrompt,
                Math.floor(fallbackBudget * 0.75)
              );
              fallbackMessages = truncated;
            }
            const { controller: fbController, cleanup: fbCleanup } = this.createCallAbortController(60_000);
            let fallbackResponse;
            try {
              const fbOpts = { ...this.getChatOptions(agentName), signal: fbController.signal };
              fallbackResponse = await fallbackProvider.chat(fallbackMessages, agent.systemPrompt, fbOpts);
            } finally {
              fbCleanup();
            }
            let fallbackText = typeof fallbackResponse === 'string' ? fallbackResponse : (fallbackResponse.text ?? '');

            const escapeRegex3 = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prefixPattern3 = new RegExp(`^\\s*${escapeRegex3(agentName)}\\s*:\\s*`, 'i');
            fallbackText = fallbackText.replace(prefixPattern3, '').trim();

            if (fallbackText && fallbackText.length > 0) {
              if (this.deps.streamOutput) {
                process.stdout.write('\n');
              } else {
                console.log(`${agentName}: ${fallbackText}\n`);
              }
              if (this.deps.eventBus) {
                this.deps.eventBus.emitEvent('agent:response', { agent: agentName, content: fallbackText });
              }

              const originalModel = agent.model;
              this.agentSubstitutions.set(agentName, {
                original: originalModel,
                fallback: fallbackModel,
                reason: errorMsg
              });
              agent.provider = fallbackProvider;
              agent.model = fallbackModel;
              console.log(`[${agentName}: Switched from ${originalModel} to ${fallbackModel} for remainder of discussion]`);
              // Structured fallback event log for observability (RESIL-01)
              console.log(JSON.stringify({
                event: 'FALLBACK_EVENT',
                agent: agentName,
                originalModel: originalModel,
                fallbackModel: fallbackModel,
                reason: errorMsg,
                timestamp: new Date().toISOString()
              }));

              this.pushAgentResponse(fallbackText, agentName, fallbackModel);
              // Fallback counts as success — reset consecutive failure counter
              this.recordAgentSuccess(agentName);
              return; // Fallback succeeded
            }
          } catch (fallbackError: any) {
            console.error(`[${agentName}: Fallback to ${fallbackModel} also failed: ${fallbackError.message}]`);
            // Include fallback failure context for debugging
            (error as any).fallbackError = fallbackError.message;
          }
        }
      }

      // Emit error event only after all recovery attempts have been exhausted
      if (this.deps.eventBus) {
        this.deps.eventBus.emitEvent('error', { message: `Error with agent ${agentName}: ${errorMsg}` });
      }

      // Extract provider and status from error message for cleaner display
      const statusMatch = errorMsg.match(/\((\d{3})\)/);
      const status = statusMatch ? statusMatch[1] : '';
      const providerMatch = errorMsg.match(/^(\w+) API error/);
      const provider = providerMatch ? providerMatch[1] : '';

      // Create user-friendly error message
      const friendlyError = status === '400' ? `${provider || 'Provider'} rejected request`
        : status === '429' ? `${provider || 'Provider'} rate limited`
        : status === '500' || status === '502' || status === '503' ? `${provider || 'Provider'} service error`
        : errorMsg;

      // Add error to history with cleaner message
      const fallbackNote = (error as any).fallbackError
        ? ` (fallback also failed: ${(error as any).fallbackError})`
        : '';
      this.deps.conversationHistory.push({
        role: 'assistant',
        content: `[${agentName} unavailable: ${friendlyError}${fallbackNote}]`,
        speaker: agentName,
        model: agent.model,
        error: true,
        errorDetails: errorMsg + fallbackNote,
        timestamp: new Date().toISOString()
      });

      // Circuit breaker: track consecutive failures
      this.recordAgentFailure(agentName, friendlyError);
    }
  }

  /**
   * Returns the set of agents permanently disabled by the circuit breaker.
   * ConversationManager uses this to check alive agent counts.
   */
  getPersistentlyFailedAgents(): Set<string> {
    return this.persistentlyFailedAgents;
  }

  /**
   * Returns the map of model substitutions made during this conversation.
   * ConversationManager uses this for post-discussion reporting.
   */
  getAgentSubstitutions(): Map<string, { original: string; fallback: string; reason: string }> {
    return this.agentSubstitutions;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Track consecutive failures for an agent and trip the circuit breaker after 2.
   */
  private recordAgentFailure(agentName: string, reason: string): void {
    // Timeouts/aborts are infrastructure failures, not agent failures — don't count them.
    // Match specific patterns to avoid false positives from unrelated error messages.
    if (/per-call timeout|main abort|^timeout$|request was aborted/i.test(reason)) {
      return;
    }
    const count = (this.consecutiveAgentFailures.get(agentName) || 0) + 1;
    this.consecutiveAgentFailures.set(agentName, count);

    if (count >= 2) {
      this.persistentlyFailedAgents.add(agentName);
      console.log(`[Circuit breaker: ${agentName} disabled after ${count} consecutive failures (${reason})]`);
      if (this.deps.eventBus) {
        this.deps.eventBus.emitEvent('status', {
          message: `Circuit breaker tripped for ${agentName}: ${reason}`
        });
      }
      // Add system note to history so judge/summary can account for it
      this.deps.conversationHistory.push({
        role: 'user',
        content: `[System: ${agentName} has been removed from the discussion after ${count} consecutive failures (${reason}). Remaining agents should continue without them.]`,
        speaker: 'System',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Push an agent response to conversation history, pre-extracting
   * position summary when context optimization is enabled.
   */
  private pushAgentResponse(text: string, speaker: string, model: string): void {
    const entry: any = {
      role: 'assistant',
      content: text,
      speaker,
      model,
      timestamp: new Date().toISOString()
    };
    if (this.deps.config.contextOptimization?.enabled) {
      entry.positionSummary = ContextOptimizer.extractPosition(text);
    }
    this.deps.conversationHistory.push(entry);
  }

  /**
   * Reset consecutive failure count for an agent on success.
   */
  private recordAgentSuccess(agentName: string): void {
    this.consecutiveAgentFailures.set(agentName, 0);
  }

  /**
   * Create a per-call AbortController that respects the main abort signal.
   * Each provider call gets its own timeout so one slow call doesn't kill the whole discussion.
   * @param timeoutMs - Per-call timeout in milliseconds (default: 150s for primary, 60s for fallback)
   */
  private createCallAbortController(timeoutMs: number = 150_000): { controller: AbortController; cleanup: () => void } {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('per-call timeout'), timeoutMs);

    // Bridge main abort signal to per-call controller
    let onMainAbort: (() => void) | undefined;
    if (this.deps.abortSignal) {
      if (this.deps.abortSignal.aborted) {
        controller.abort('main abort');
        clearTimeout(timeout);
      } else {
        onMainAbort = () => controller.abort('main abort');
        this.deps.abortSignal.addEventListener('abort', onMainAbort, { once: true });
      }
    }

    const cleanup = () => {
      clearTimeout(timeout);
      if (onMainAbort && this.deps.abortSignal) {
        this.deps.abortSignal.removeEventListener('abort', onMainAbort);
      }
    };

    return { controller, cleanup };
  }

  /**
   * Get a fallback model from a different provider family to avoid hitting the same rate limit.
   */
  private getFallbackModel(currentModel: string): string | null {
    const model = currentModel.toLowerCase();
    if (model.includes('claude')) {
      return 'gpt-4o-mini';
    }
    if (model.includes('gemini')) {
      return 'gpt-4o-mini';
    }
    // OpenAI reasoning models (o1-*, o3-*) — match at word boundary to avoid date false positives
    if (/\bo[13]-/.test(model) || /\bo[13]$/.test(model)) {
      return 'claude-sonnet-4-5';
    }
    // For GPT, Grok, Mistral — fall back to Claude
    if (model.includes('gpt') || model.includes('grok') || model.includes('mistral')) {
      return 'claude-sonnet-4-5';
    }
    return 'gpt-4o-mini';
  }

  /**
   * Build chat options with streaming callbacks when enabled.
   * Mirrors ConversationManager.getChatOptions() — uses deps instead of `this`.
   */
  private getChatOptions(agentName?: string): any {
    const options: any = {};

    if (this.deps.streamOutput) {
      options.stream = true;
      options.onToken = (token: string) => {
        if (this.deps.streamOutput) process.stdout.write(token);
        if (this.deps.eventBus && agentName) {
          this.deps.eventBus.emitEvent('token', { agent: agentName, token });
        }
      };
    }

    return options;
  }
}
