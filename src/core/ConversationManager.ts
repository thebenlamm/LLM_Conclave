import ProviderFactory from '../providers/ProviderFactory';
import TokenCounter from '../utils/TokenCounter';
import { EventBus } from './EventBus';
import { SpeakerSelector, AgentInfo } from './SpeakerSelector';
import { DiscussionStateExtractor } from './DiscussionStateExtractor';
import { TaskRouter } from './TaskRouter';
import { DEFAULT_SELECTOR_MODEL } from '../constants';

/**
 * Manages the multi-agent conversation
 */
export default class ConversationManager {
  config: any;
  agents: { [key: string]: any };
  agentOrder: string[];
  conversationHistory: any[];
  currentRound: number;
  maxRounds: number;
  minRounds: number;
  memoryManager: any;

  streamOutput: boolean;
  eventBus?: EventBus;

  // Dynamic speaker selection
  private dynamicSelection: boolean;
  private speakerSelector?: SpeakerSelector;
  private selectorModel: string;

  // Performance optimizations: message caching
  private messageCache: any[] = [];
  private lastCacheUpdateIndex: number = 0;
  private cachedRecentDiscussion: string = '';
  private lastJudgeCacheRound: number = 0;

  // Agent failure tracking and fallback
  private persistentlyFailedAgents: Set<string> = new Set();
  private consecutiveAgentFailures: Map<string, number> = new Map();
  private agentSubstitutions: Map<string, { original: string; fallback: string; reason: string }> = new Map();

  // Abort signal for cancellation from MCP timeout
  abortSignal?: AbortSignal;

  // Model routing for subtasks (summarization)
  private taskRouter: TaskRouter | null;

  constructor(
    config: any,
    memoryManager: any = null,
    streamOutput: boolean = false,
    eventBus?: EventBus,
    dynamicSelection: boolean = false,
    selectorModel: string = DEFAULT_SELECTOR_MODEL,
    options?: { disableRouting?: boolean }
  ) {
    this.config = config;
    this.agents = {};
    this.agentOrder = [];
    this.conversationHistory = [];
    this.currentRound = 0;
    this.maxRounds = config.max_rounds || 20;
    this.minRounds = config.min_rounds || 0; // Minimum rounds before consensus can be reached
    this.memoryManager = memoryManager;
    this.streamOutput = streamOutput;
    this.eventBus = eventBus;
    this.dynamicSelection = dynamicSelection;
    this.selectorModel = selectorModel;

    // Initialize task router for cheap subtask routing (summarization)
    // Disabled via options, CONCLAVE_DISABLE_ROUTING env var, or --no-routing CLI flag
    const routingDisabled = options?.disableRouting
      || process.env.CONCLAVE_DISABLE_ROUTING === '1'
      || process.env.CONCLAVE_DISABLE_ROUTING === 'true';
    this.taskRouter = routingDisabled ? null : new TaskRouter();

    this.initializeAgents();
  }

  /**
   * Initialize all agents from configuration
   */
  initializeAgents() {
    const agentInfos: AgentInfo[] = [];

    for (const [name, agentConfig] of Object.entries(this.config.agents) as [string, any][]) {
      // Support both 'prompt' and 'systemPrompt' field names (for compatibility with defaults and custom configs)
      const systemPrompt = agentConfig.prompt || agentConfig.systemPrompt || '';
      this.agents[name] = {
        name: name,
        provider: ProviderFactory.createProvider(agentConfig.model),
        systemPrompt: systemPrompt,
        model: agentConfig.model
      };
      this.agentOrder.push(name);

      // Build agent info for speaker selector
      agentInfos.push({
        name: name,
        model: agentConfig.model,
        expertise: SpeakerSelector.extractExpertise(systemPrompt, name)
      });
    }

    // Initialize speaker selector if dynamic selection enabled
    if (this.dynamicSelection) {
      this.speakerSelector = new SpeakerSelector(agentInfos, this.selectorModel, this.eventBus);
      console.log(`Initialized ${this.agentOrder.length} agents with DYNAMIC speaker selection: ${this.agentOrder.join(', ')}`);
    } else {
      console.log(`Initialized ${this.agentOrder.length} agents: ${this.agentOrder.join(', ')}`);
    }

    if (this.eventBus) {
      this.eventBus.emitEvent('status', {
        message: `Initialized ${this.agentOrder.length} agents`,
        dynamicSelection: this.dynamicSelection
      });
    }
  }

  /**
   * Start the conversation with a given task
   * @param {string} task - The task for agents to solve
   * @param {Object} judge - Judge instance with provider and prompt
   * @param {Object} projectContext - Optional ProjectContext instance
   * @returns {Object} - Final result with consensus and history
   */
  async startConversation(task: string, judge: any, projectContext: any = null) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TASK: ${task}`);
    console.log(`${'='.repeat(80)}\n`);

    if (this.eventBus) {
      this.eventBus.emitEvent('run:start', { task, mode: 'consensus' });
    }

    // Build initial message with optional project memory
    let initialMessage = '';

    // Add project memory context if available
    if (this.memoryManager && this.memoryManager.projectMemory) {
      const memoryContext = this.memoryManager.getRelevantMemory(task);
      if (memoryContext) {
        initialMessage += memoryContext;
        initialMessage += '\n---\n\n';
      }
    }

    // Add project file context if provided
    if (projectContext) {
      initialMessage += projectContext.formatContext();
      initialMessage += '\n---\n\n';
    }

    initialMessage += `Task: ${task}\n\nPlease share your perspective on how to approach this task.`;

    // Add initial task to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: initialMessage,
      speaker: 'System'
    });

    let consensusReached = false;
    let finalSolution: string | null = null;
    let keyDecisions: string[] = [];
    let actionItems: string[] = [];
    let dissent: string[] = [];
    let confidence: string = 'MEDIUM';

    // Main conversation loop
    while (this.currentRound < this.maxRounds && !consensusReached) {
      // Check abort signal before starting new round
      if (this.abortSignal?.aborted) {
        console.log(`\n[Discussion aborted: ${this.abortSignal.reason || 'timeout'}]\n`);
        break;
      }

      this.currentRound++;
      console.log(`\n--- Round ${this.currentRound} ---\n`);

      if (this.eventBus) {
        this.eventBus.emitEvent('round:start', { round: this.currentRound });
      }

      // Each agent takes a turn - either dynamic or round-robin
      if (this.dynamicSelection && this.speakerSelector) {
        await this.runDynamicRound(task);
      } else {
        for (const agentName of this.agentOrder) {
          await this.agentTurn(agentName);
        }
      }

      // Check if enough agents remain for meaningful discussion after failures
      if (this.persistentlyFailedAgents.size > 0) {
        const aliveAgents = this.agentOrder.filter(a => !this.persistentlyFailedAgents.has(a));
        if (aliveAgents.length <= 1) {
          console.log(`\n[Discussion ending early: only ${aliveAgents.length} agent(s) remaining after failures]\n`);
          if (this.eventBus) {
            this.eventBus.emitEvent('status', { message: `Discussion ending early: only ${aliveAgents.length} agent(s) remaining` });
          }
          break;
        }
      }

      // Judge evaluates consensus
      console.log(`\n[Judge is evaluating consensus...]\n`);
      if (this.eventBus) {
        this.eventBus.emitEvent('agent:thinking', { agent: 'Judge', model: judge.model });
      }

      const judgeResult = await this.judgeEvaluate(judge);

      // Hard enforcement: Check if all active agents have contributed (don't trust LLM judge alone)
      // Exclude agents disabled by circuit breaker — they can't contribute
      const contributingAgents = new Set<string>();
      for (const entry of this.conversationHistory) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          contributingAgents.add(entry.speaker);
        }
      }
      const activeAgents = this.agentOrder.filter(a => !this.persistentlyFailedAgents.has(a));
      const allAgentsContributed = activeAgents.every(agent => contributingAgents.has(agent));

      // Override judge if not all active agents have contributed
      if (judgeResult.consensusReached && !allAgentsContributed) {
        const missingAgents = activeAgents.filter(agent => !contributingAgents.has(agent));
        const verb = missingAgents.length === 1 ? "hasn't" : "haven't";
        console.log(`\n[Consensus deferred to next round: ${missingAgents.join(', ')} ${verb} contributed yet (skipped due to context overflow or error)]\n`);
        judgeResult.consensusReached = false;
        judgeResult.guidance = `Cannot declare consensus until all agents have contributed. Missing: ${missingAgents.join(', ')}. Please ensure these agents share their perspective before concluding.`;
      }

      // Only allow consensus if we've completed minimum rounds
      if (judgeResult.consensusReached && this.currentRound >= this.minRounds) {
        consensusReached = true;
        finalSolution = judgeResult.solution || null;
        keyDecisions = judgeResult.keyDecisions || [];
        actionItems = judgeResult.actionItems || [];
        dissent = judgeResult.dissent || [];
        confidence = judgeResult.confidence || 'MEDIUM';
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CONSENSUS REACHED after ${this.currentRound} rounds!`);
        console.log(`${'='.repeat(80)}\n`);

        if (this.eventBus) {
            this.eventBus.emitEvent('status', { message: `Consensus reached after ${this.currentRound} rounds` });
        }
        break;
      } else if (judgeResult.consensusReached && this.currentRound < this.minRounds) {
        // Consensus claimed but minimum rounds not met - continue discussion
        console.log(`\n[Potential consensus detected, but minimum rounds (${this.minRounds}) not yet reached. Round ${this.currentRound}/${this.minRounds}. Continuing discussion...]\n`);

        if (this.eventBus) {
            this.eventBus.emitEvent('status', { message: `Minimum rounds not met (${this.currentRound}/${this.minRounds}). Continuing.` });
        }

        // Include judge's actual feedback + guidance to continue exploring
        const judgeContext = judgeResult.solution || judgeResult.guidance || '';
        this.conversationHistory.push({
          role: 'user',
          content: `Judge's evaluation: ${judgeContext}\n\nNote: While the above solution shows promise, we need more thorough discussion (round ${this.currentRound}/${this.minRounds}). Please challenge assumptions, explore edge cases, identify potential weaknesses, or offer alternative perspectives that haven't been fully considered yet.`,
          speaker: 'Judge'
        });
      } else {
        console.log(`Judge: ${judgeResult.guidance}\n`);
        
        if (this.eventBus) {
            this.eventBus.emitEvent('agent:response', { agent: 'Judge', content: judgeResult.guidance });
        }

        // Add judge's guidance to conversation history
        this.conversationHistory.push({
          role: 'user',
          content: `Judge's guidance: ${judgeResult.guidance}`,
          speaker: 'Judge'
        });
      }
      
      if (this.eventBus) {
        this.eventBus.emitEvent('round:complete', { round: this.currentRound });
      }

      // Compress history if it's getting too large (prevents context overflow in later rounds)
      await this.compressHistory();
    }

    // If aborted (e.g. MCP timeout), return partial result immediately — skip final vote
    if (this.abortSignal?.aborted) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Discussion aborted after ${this.currentRound} rounds.`);
      console.log(`${'='.repeat(80)}\n`);

      if (this.eventBus) {
        this.eventBus.emitEvent('status', { message: `Discussion aborted after ${this.currentRound} rounds` });
      }

      // Build best-effort result from whatever we have
      const bestEffort = this.bestEffortJudgeResult();

      const failedAgentsList = this.conversationHistory
        .filter((msg: any) => msg.error === true)
        .map((msg: any) => msg.speaker);

      return {
        task: task,
        rounds: this.currentRound,
        maxRounds: this.maxRounds,
        consensusReached: false,
        solution: bestEffort.solution,
        keyDecisions: [],
        actionItems: [],
        dissent: [`Discussion was interrupted (${this.abortSignal.reason || 'aborted'})`],
        confidence: 'LOW',
        conversationHistory: this.conversationHistory,
        failedAgents: [...new Set(failedAgentsList)],
        agentSubstitutions: Object.fromEntries(this.agentSubstitutions),
        timedOut: true,
      };
    }

    // If max rounds reached without consensus, conduct final vote
    if (!consensusReached) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Maximum rounds (${this.maxRounds}) reached without consensus.`);
      console.log(`Conducting final vote...`);
      console.log(`${'='.repeat(80)}\n`);

      if (this.eventBus) {
        this.eventBus.emitEvent('status', { message: 'Max rounds reached. Conducting final vote.' });
      }

      const voteResult = await this.conductFinalVote(judge);
      finalSolution = voteResult.solution;
      keyDecisions = voteResult.keyDecisions;
      actionItems = voteResult.actionItems;
      dissent = voteResult.dissent;
      confidence = voteResult.confidence;
    }

    // Count failed agents for reporting
    const failedAgents = this.conversationHistory
      .filter((msg: any) => msg.error === true)
      .map((msg: any) => msg.speaker);
    const uniqueFailedAgents = [...new Set(failedAgents)];

    // Report agent substitutions so user can debug provider issues
    if (this.agentSubstitutions.size > 0) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`⚠️  Agent Model Substitutions (provider issues detected):`);
      for (const [agent, sub] of this.agentSubstitutions) {
        console.log(`   ${agent}: ${sub.original} → ${sub.fallback} (reason: ${sub.reason})`);
      }
      console.log(`   💡 Action: Check provider credits/quotas for the original models.`);
      console.log(`${'─'.repeat(60)}\n`);
    }

    const result = {
      task: task,
      rounds: this.currentRound,
      maxRounds: this.maxRounds,
      consensusReached: consensusReached,
      solution: finalSolution,
      keyDecisions: keyDecisions,
      actionItems: actionItems,
      dissent: dissent,
      confidence: confidence,
      conversationHistory: this.conversationHistory,
      failedAgents: uniqueFailedAgents,
      agentSubstitutions: Object.fromEntries(this.agentSubstitutions),
    };
    
    if (this.eventBus) {
        this.eventBus.emitEvent('run:complete', { result });
    }

    // Record conversation in project memory if available
    if (this.memoryManager && this.memoryManager.projectMemory) {
      try {
        await this.memoryManager.recordConversation({
          task: task,
          agents: this.agentOrder,
          consensusReached: consensusReached,
          rounds: this.currentRound,
          outputPath: null // Will be set by the caller if needed
        });
      } catch (error: any) {
        console.error(`Warning: Failed to record conversation in memory: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Execute one agent's turn in the conversation
   * @param {string} agentName - Name of the agent
   */
  async agentTurn(agentName: string) {
    // Circuit breaker: skip agents that have failed repeatedly
    if (this.persistentlyFailedAgents.has(agentName)) {
      return;
    }

    const agent = this.agents[agentName];

    console.log(`[${agentName} (${agent.model}) is thinking...]\n`);
    if (this.streamOutput) {
      console.log(`${agentName}:`);
    }
    
    if (this.eventBus) {
        this.eventBus.emitEvent('agent:thinking', { agent: agentName, model: agent.model });
    }

    try {
      // Prepare messages with token budget check
      const messages = this.prepareMessagesWithBudget(agentName);
      if (!messages) {
        // Agent's context window can't fit the conversation even after truncation
        console.log(`[${agentName} skipped: conversation too large for ${agent.model} context window]\n`);
        if (this.eventBus) {
          this.eventBus.emitEvent('error', {
            message: `${agentName} skipped: context exceeds ${agent.model} limits`,
            context: 'token_budget_exceeded'
          });
        }
        this.conversationHistory.push({
          role: 'assistant',
          content: `[${agentName} unavailable: conversation exceeds ${agent.model} context window]`,
          speaker: agentName,
          model: agent.model,
          error: true,
          errorDetails: 'token_budget_exceeded'
        });
        this.recordAgentFailure(agentName, 'context window exceeded');
        return;
      }

      // Get agent's response (with one retry on empty response)
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefixPattern = new RegExp(`^\\s*${escapeRegex(agentName)}\\s*:\\s*`, 'i');

      let text = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        // Clone messages per attempt — prepareMessagesForAgent() returns a cached array
        // that some providers may mutate in place, corrupting future turns
        const attemptMessages = messages.map(m => ({ ...m }));
        const response = await agent.provider.chat(attemptMessages, agent.systemPrompt, this.getChatOptions(agentName));
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
        if (this.eventBus) {
          this.eventBus.emitEvent('error', {
            message: `${agentName} returned empty response after retry`,
            context: 'empty_response'
          });
        }
        // Record failure in history so consensus/summary can account for this agent
        this.conversationHistory.push({
          role: 'assistant',
          content: `[${agentName} unavailable: returned empty response after retry]`,
          speaker: agentName,
          model: agent.model,
          error: true,
          errorDetails: 'empty_response_after_retry'
        });
        this.recordAgentFailure(agentName, 'empty_response');
        return;
      }

      if (this.streamOutput) {
        process.stdout.write('\n');
      } else {
        console.log(`${agentName}: ${text}\n`);
      }

      if (this.eventBus) {
        this.eventBus.emitEvent('agent:response', { agent: agentName, content: text });
      }

      // Add to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: text,
        speaker: agentName,
        model: agent.model
      });

      // Circuit breaker: reset failure count on success
      this.recordAgentSuccess(agentName);

    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`Error with agent ${agentName}: ${errorMsg}`);

      // Try fallback to a different provider on retryable errors (429, 502, 503)
      // NOTE: Emit error event AFTER fallback attempt — if fallback succeeds, no error to report
      const isRetryable = /429|rate.?limit|502|503|service.?error/i.test(errorMsg);
      if (isRetryable && !this.agentSubstitutions.has(agentName)) {
        const fallbackModel = this.getFallbackModel(agent.model);
        if (fallbackModel) {
          console.log(`[${agentName}: ${agent.model} failed, falling back to ${fallbackModel}]`);
          try {
            const fallbackProvider = ProviderFactory.createProvider(fallbackModel);
            // Use budget-aware message preparation against fallback model's limits
            const rawMessages = this.prepareMessagesForAgent();
            const fallbackLimits = TokenCounter.getModelLimits(fallbackModel);
            const fallbackBudget = fallbackLimits.maxInput - 6000;
            const fallbackTokens = TokenCounter.estimateMessagesTokens(rawMessages, agent.systemPrompt);
            let messages = rawMessages;
            if (fallbackTokens > fallbackBudget * 0.8) {
              const { messages: truncated } = TokenCounter.truncateMessages(
                rawMessages.map(m => ({ ...m })),
                agent.systemPrompt,
                Math.floor(fallbackBudget * 0.75)
              );
              messages = truncated;
            }
            const fallbackResponse = await fallbackProvider.chat(messages, agent.systemPrompt, this.getChatOptions(agentName));
            let fallbackText = typeof fallbackResponse === 'string' ? fallbackResponse : (fallbackResponse.text ?? '');

            const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prefixPattern = new RegExp(`^\\s*${escapeRegex(agentName)}\\s*:\\s*`, 'i');
            fallbackText = fallbackText.replace(prefixPattern, '').trim();

            if (fallbackText && fallbackText.length > 0) {
              if (this.streamOutput) {
                process.stdout.write('\n');
              } else {
                console.log(`${agentName}: ${fallbackText}\n`);
              }
              if (this.eventBus) {
                this.eventBus.emitEvent('agent:response', { agent: agentName, content: fallbackText });
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

              this.conversationHistory.push({
                role: 'assistant',
                content: fallbackText,
                speaker: agentName,
                model: fallbackModel
              });
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
      if (this.eventBus) {
        this.eventBus.emitEvent('error', { message: `Error with agent ${agentName}: ${errorMsg}` });
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
      this.conversationHistory.push({
        role: 'assistant',
        content: `[${agentName} unavailable: ${friendlyError}${fallbackNote}]`,
        speaker: agentName,
        model: agent.model,
        error: true,
        errorDetails: errorMsg + fallbackNote
      });

      // Circuit breaker: track consecutive failures
      this.recordAgentFailure(agentName, friendlyError);
    }
  }

  /**
   * Track consecutive failures for an agent and trip the circuit breaker after 2.
   */
  private recordAgentFailure(agentName: string, reason: string): void {
    const count = (this.consecutiveAgentFailures.get(agentName) || 0) + 1;
    this.consecutiveAgentFailures.set(agentName, count);

    if (count >= 2) {
      this.persistentlyFailedAgents.add(agentName);
      console.log(`[Circuit breaker: ${agentName} disabled after ${count} consecutive failures (${reason})]`);
      if (this.eventBus) {
        this.eventBus.emitEvent('status', {
          message: `Circuit breaker tripped for ${agentName}: ${reason}`
        });
      }
      // Add system note to history so judge/summary can account for it
      this.conversationHistory.push({
        role: 'user',
        content: `[System: ${agentName} has been removed from the discussion after ${count} consecutive failures (${reason}). Remaining agents should continue without them.]`,
        speaker: 'System'
      });
    }
  }

  /**
   * Reset consecutive failure count for an agent on success.
   */
  private recordAgentSuccess(agentName: string): void {
    this.consecutiveAgentFailures.set(agentName, 0);
  }

  /**
   * Run a round with dynamic speaker selection.
   * Instead of fixed order, an LLM moderator selects who speaks next
   * based on conversation context and agent expertise.
   */
  async runDynamicRound(task: string): Promise<void> {
    if (!this.speakerSelector) {
      throw new Error('Speaker selector not initialized for dynamic selection');
    }

    // Start fresh turn tracking for this round
    this.speakerSelector.startNewRound();
    // Thread abort signal so selector LLM calls can be cancelled
    if (this.abortSignal) {
      this.speakerSelector.abortSignal = this.abortSignal;
    }
    const failedAgentsThisRound: Set<string> = new Set(this.persistentlyFailedAgents);
    const agentsWhoContributedThisRound: Set<string> = new Set();

    let lastSpeaker: string | null = null;
    let lastResponse: string | null = null;
    let turnCount = 0;

    // Safety limit: allow more turns than agents to enable back-and-forth
    // Default to 20 or 3x agent count, whichever is higher, to prevent infinite loops
    const maxTurnsPerRound = Math.max(20, this.agentOrder.length * 3);

    while (turnCount < maxTurnsPerRound) {
      // Check abort signal before each turn in dynamic mode
      if (this.abortSignal?.aborted) {
        console.log(`[Round ${this.currentRound} aborted: ${this.abortSignal.reason || 'timeout'}]`);
        break;
      }

      // Select next speaker
      const selection = await this.speakerSelector.selectNextSpeaker(
        this.conversationHistory,
        lastSpeaker,
        lastResponse,
        this.currentRound,
        task,
        failedAgentsThisRound
      );

      // Check if round should end - BUT ensure all agents have contributed at least once
      if (!selection.shouldContinue) {
        const agentsWhoHaventSpoken = this.speakerSelector.getAgentsWhoHaventSpoken()
          .filter(name => !failedAgentsThisRound.has(name));

        if (agentsWhoHaventSpoken.length > 0 && turnCount < this.agentOrder.length) {
          // Override: force remaining agents to speak before ending round
          console.log(`[Round ${this.currentRound}: ${agentsWhoHaventSpoken.length} agent(s) haven't spoken yet, continuing...]`);
          // Pick the first agent who hasn't spoken
          const forcedSpeaker = agentsWhoHaventSpoken[0];
          console.log(`[Forcing turn for ${forcedSpeaker}]`);

          const historyLengthBefore = this.conversationHistory.length;
          await this.agentTurn(forcedSpeaker);

          if (this.conversationHistory.length > historyLengthBefore) {
            const latestEntry = this.conversationHistory[this.conversationHistory.length - 1];
            if (latestEntry.error) {
              failedAgentsThisRound.add(forcedSpeaker);
            } else {
              lastResponse = latestEntry.content;
              lastSpeaker = forcedSpeaker;
              agentsWhoContributedThisRound.add(forcedSpeaker);
            }
          } else {
            // Empty response from forced speaker - treat as failure
            failedAgentsThisRound.add(forcedSpeaker);
          }

          this.speakerSelector.recordTurn(forcedSpeaker);
          turnCount++;
          continue;
        }

        // Check if round ended because all remaining agents failed
        if (agentsWhoContributedThisRound.size < this.agentOrder.length - failedAgentsThisRound.size) {
          console.log(`[Round ${this.currentRound} complete: remaining agents unavailable]`);
        } else {
          console.log(`[Round ${this.currentRound} complete: ${selection.reason}]`);
        }
        break;
      }

      const agentName = selection.nextSpeaker;
      
      // Stop if selector returned a speaker that doesn't exist (safety check)
      if (!agentName) {
        console.log(`[Round ${this.currentRound} ended: No next speaker selected]`);
        break;
      }

      // Log selection reasoning
      if (selection.handoffRequested) {
        console.log(`[Handoff to ${agentName} (requested by ${lastSpeaker})]`);
      } else if (selection.confidence < 0.6) {
        console.log(`[Selected ${agentName} - ${selection.reason} (confidence: ${(selection.confidence * 100).toFixed(0)}%)]`);
      } else {
        console.log(`[Selected ${agentName} - ${selection.reason}]`);
      }

      // Execute agent turn and capture response
      const historyLengthBefore = this.conversationHistory.length;
      await this.agentTurn(agentName);

      // Get the response that was just added
      if (this.conversationHistory.length > historyLengthBefore) {
        const latestEntry = this.conversationHistory[this.conversationHistory.length - 1];

        // Handle error cases: don't pass error messages as conversation context
        if (latestEntry.error) {
          lastResponse = `[System: The previous agent (${agentName}) failed to respond due to an error. Please select a different agent to continue the discussion.]`;
          // Don't update lastSpeaker so we don't attribute the system message to the agent
          // Record as failed to prevent immediate re-selection
          failedAgentsThisRound.add(agentName);
        } else {
          lastResponse = latestEntry.content;
          lastSpeaker = agentName;
          agentsWhoContributedThisRound.add(agentName);
        }
      } else {
        // Agent returned empty response (agentTurn returned early without adding to history)
        // Treat this as a failure to prevent re-selection and infinite loops
        failedAgentsThisRound.add(agentName);
        lastResponse = `[System: ${agentName} returned an empty response.]`;
      }

      // Check if too many agents have failed to continue meaningfully
      const aliveCount = this.agentOrder.length - failedAgentsThisRound.size;
      if (aliveCount === 0) {
        console.log(`[Round ${this.currentRound} aborted: all agents have failed]`);
        break;
      }
      if (aliveCount === 1 && agentsWhoContributedThisRound.size >= 1) {
        console.log(`[Round ${this.currentRound} ending early: only 1 agent remaining]`);
        break;
      }

      // Record turn
      this.speakerSelector.recordTurn(agentName);
      turnCount++;
    }

    if (turnCount >= maxTurnsPerRound) {
      console.log(`[Round ${this.currentRound} ended: safety limit (${maxTurnsPerRound} turns) reached]`);
    }

    // Log summary of who contributed
    if (agentsWhoContributedThisRound.size > 0) {
      console.log(`[Round ${this.currentRound} contributors: ${Array.from(agentsWhoContributedThisRound).join(', ')}]`);
    }
    if (failedAgentsThisRound.size > 0) {
      console.log(`[Round ${this.currentRound} failed agents: ${Array.from(failedAgentsThisRound).join(', ')}]`);
    }

    // Note: persistent failure tracking is now handled by the circuit breaker
    // in recordAgentFailure() — agents are disabled after 2 consecutive failures
    // regardless of error type (context overflow, rate limit, empty response, etc.)
  }

  /**
   * Model-aware token threshold for triggering history compression.
   * Claude models use a higher threshold (150K) to stay below the 200K pricing cliff
   * which doubles ALL token prices (input AND output) for the entire request.
   * Other models use the original 80K threshold.
   */
  private getHistoryTokenThreshold(): number {
    // Check if any agent or the judge uses a Claude model
    const hasClaudeModel = Object.values(this.agents).some(
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

    for (const entry of this.conversationHistory) {
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
   */
  async compressHistory(): Promise<void> {
    const totalTokens = TokenCounter.estimateMessagesTokens(
      this.conversationHistory.map(e => ({ role: e.role, content: e.content })),
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

    const newHistory: any[] = [];

    for (let i = 0; i < roundGroups.length; i++) {
      const group = roundGroups[i];
      const isFirst = i === 0;
      const isLastTwo = i >= roundGroups.length - 2;

      if (isFirst || isLastTwo) {
        // Keep verbatim
        newHistory.push(...group.entries);
      } else {
        // Compress to summary — use LLM router if available, else heuristic
        const summary = await TokenCounter.summarizeWithLLM(group.entries, group.round, this.taskRouter);
        newHistory.push({
          role: 'user',
          content: `[Round ${group.round} summary]\n${summary}`,
          speaker: 'System',
          compressed: true
        });
      }
    }

    const beforeCount = this.conversationHistory.length;
    this.conversationHistory = newHistory;

    // Reset all caches since history structure changed
    this.messageCache = [];
    this.lastCacheUpdateIndex = 0;
    this.cachedRecentDiscussion = '';
    this.lastJudgeCacheRound = 0;

    const newTokens = TokenCounter.estimateMessagesTokens(
      newHistory.map(e => ({ role: e.role, content: e.content })),
      null
    );
    console.log(`[History compressed: ${beforeCount} → ${newHistory.length} entries, ${totalTokens} → ${newTokens} tokens]`);
  }

  /**
   * Prepare message array for an agent from conversation history
   * Uses incremental caching to avoid rebuilding the entire array every turn
   * @returns {Array} - Array of messages in OpenAI format
   */
  prepareMessagesForAgent() {
    // If no new messages since last cache update, return cached version
    if (this.lastCacheUpdateIndex === this.conversationHistory.length) {
      return this.messageCache;
    }

    // Process only new messages since last cache update
    const newMessages = this.conversationHistory
      .slice(this.lastCacheUpdateIndex)
      .map(entry => ({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: entry.speaker !== 'System'
          ? `${entry.speaker}: ${entry.content}`
          : entry.content
      }));

    // Append to cache
    this.messageCache.push(...newMessages);
    this.lastCacheUpdateIndex = this.conversationHistory.length;

    return this.messageCache;
  }

  /**
   * Prepare messages with token budget awareness for a specific agent.
   * Returns null if messages cannot fit within the agent's model limits even after truncation.
   */
  prepareMessagesWithBudget(agentName: string): any[] | null {
    const agent = this.agents[agentName];
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

  /**
   * Build chat options with streaming callbacks when enabled
   */
  getChatOptions(agentName?: string) {
    const options: any = {};

    if (this.streamOutput || this.eventBus) {
        options.stream = true;
        options.onToken = (token: string) => {
            if (this.streamOutput) process.stdout.write(token);
            if (this.eventBus && agentName) {
                this.eventBus.emitEvent('token', { agent: agentName, token });
            }
        };
    }

    if (this.abortSignal) {
      options.signal = this.abortSignal;
    }

    return options;
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
   * Parse structured output from judge responses.
   * Extracts KEY_DECISIONS, ACTION_ITEMS, DISSENT, and CONFIDENCE from text.
   */
  parseStructuredOutput(text: string): {
    summary: string;
    keyDecisions: string[];
    actionItems: string[];
    dissent: string[];
    confidence: string;
  } {
    if (!text) {
      return { summary: '', keyDecisions: [], actionItems: [], dissent: [], confidence: 'LOW' };
    }

    const extractSection = (sectionName: string): string[] => {
      const regex = new RegExp(`${sectionName}:\\s*\\n((?:- [^\\n]+\\n?)+)`, 'i');
      const match = text.match(regex);
      if (!match) return [];
      return match[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(line => line.length > 0 && line.toLowerCase() !== 'none');
    };

    const summaryMatch = text.match(/SUMMARY:\s*\n([^\n]+(?:\n[^\n]+)*?)(?=\n\nKEY_DECISIONS:|$)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);

    return {
      summary: summaryMatch ? summaryMatch[1].trim() : text.replace('CONSENSUS_REACHED', '').trim(),
      keyDecisions: extractSection('KEY_DECISIONS'),
      actionItems: extractSection('ACTION_ITEMS'),
      dissent: extractSection('DISSENT'),
      confidence: confidenceMatch ? confidenceMatch[1].toUpperCase() : 'MEDIUM'
    };
  }

  /**
   * Calculate which round an entry belongs to based on its position in history
   */
  private getRoundForEntry(entry: any): number {
    const index = this.conversationHistory.indexOf(entry);
    if (index <= 0) return 1; // Initial task is round 1

    // Count how many complete agent cycles have occurred before this entry
    // Each round = agentOrder.length agent responses + judge guidance
    const agentResponsesBefore = this.conversationHistory
      .slice(1, index) // Skip initial task
      .filter(e => e.role === 'assistant' && e.speaker !== 'Judge').length;

    return Math.floor(agentResponsesBefore / this.agentOrder.length) + 1;
  }

  /**
   * Build a case-file header for the judge with critical information placed at the
   * start (high attention zone per LLM U-shaped attention). Extracts:
   * - The original task/question
   * - Each agent's current position (from the latest round)
   * - Points of disagreement between agents
   *
   * This is deterministic extraction — no LLM calls.
   */
  private buildCaseFile(): string {
    // Extract the original task from the first user message
    const firstUserMsg = this.conversationHistory.find(
      (e: any) => e.role === 'user' && e.speaker === 'System'
    );
    const taskText = firstUserMsg
      ? firstUserMsg.content.replace(/^Task:\s*/i, '').trim()
      : 'Unknown task';

    // Extract per-agent positions from the latest round
    const roundGroups = this.groupHistoryByRound();
    const lastRound = roundGroups.length > 0 ? roundGroups[roundGroups.length - 1] : null;

    const agentPositions: { name: string; position: string }[] = [];
    if (lastRound) {
      for (const entry of lastRound.entries) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          // Extract the last paragraph as position summary (most likely contains conclusion)
          const paragraphs = entry.content.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
          const lastParagraph = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1].trim() : '';
          // Fallback: if the last paragraph is very short, take last 2 paragraphs
          let position: string;
          if (lastParagraph.length < 50 && paragraphs.length >= 2) {
            position = paragraphs.slice(-2).join(' ').trim();
          } else {
            position = lastParagraph;
          }
          // Cap at 300 chars to keep the case file concise
          if (position.length > 300) {
            position = position.substring(0, 297) + '...';
          }
          agentPositions.push({ name: entry.speaker, position });
        }
      }
    }

    // Identify disagreements: look for contradiction/disagreement markers between agents
    const disagreements: string[] = [];
    if (lastRound) {
      const agentContents = lastRound.entries
        .filter((e: any) => e.role === 'assistant' && e.speaker !== 'Judge' && !e.error)
        .map((e: any) => ({ name: e.speaker, content: e.content.toLowerCase() }));

      // Check for explicit disagreement language referencing other agents
      const disagreementPatterns = /(?:disagree|differ|however|on the other hand|unlike|contrary to|pushback|concern about|risk with|problem with|issue with|but I think|I'd argue|not convinced)/i;
      for (const agent of agentContents) {
        if (disagreementPatterns.test(agent.content)) {
          // Find which other agent they might be disagreeing with
          for (const other of agentContents) {
            if (other.name !== agent.name && agent.content.includes(other.name.toLowerCase())) {
              disagreements.push(`${agent.name} vs ${other.name}`);
            }
          }
          // If no specific agent referenced, note the general disagreement
          if (!agentContents.some(o => o.name !== agent.name && agent.content.includes(o.name.toLowerCase()))) {
            disagreements.push(`${agent.name} raised concerns`);
          }
        }
      }
    }

    // Build the case file
    let caseFile = '=== CASE FILE ===\n\n';
    caseFile += `Task: ${taskText}\n\n`;

    if (agentPositions.length > 0) {
      caseFile += 'Current Agent Positions:\n';
      for (const ap of agentPositions) {
        caseFile += `- ${ap.name}: ${ap.position}\n`;
      }
      caseFile += '\n';
    }

    if (disagreements.length > 0) {
      const uniqueDisagreements = [...new Set(disagreements)];
      caseFile += 'Disagreements:\n';
      for (const d of uniqueDisagreements) {
        caseFile += `- ${d}\n`;
      }
      caseFile += '\n';
    } else {
      caseFile += 'Disagreements: None detected (agents may be in agreement)\n\n';
    }

    caseFile += '=== END CASE FILE ===\n';

    return caseFile;
  }

  /**
   * Prepare discussion text for the judge, compressing middle rounds if the
   * full text would exceed the judge model's context window.
   * Prepends a case-file header with critical info for U-shaped attention optimization.
   */
  private prepareJudgeContext(judge: any, discussionText: string): string {
    const limits = TokenCounter.getModelLimits(judge.model);
    // Reserve ~6K for the prompt template + system prompt + response
    const budget = limits.maxInput - 6000;

    // Build case file header (placed at START for high attention)
    const caseFile = this.buildCaseFile();
    const caseFileTokens = TokenCounter.estimateTokens(caseFile);

    // Extract discussion state for richer judge signal (Phase 2 Context Tax)
    const roundGroups = this.groupHistoryByRound();
    const currentRound = roundGroups.length > 0 ? roundGroups[roundGroups.length - 1].round : 1;
    const discussionState = DiscussionStateExtractor.extract(roundGroups, currentRound);
    const stateText = discussionState ? DiscussionStateExtractor.format(discussionState) : '';
    const stateTokens = stateText ? TokenCounter.estimateTokens(stateText) : 0;

    // Budget for the discussion text after accounting for the case file and state
    const discussionBudget = Math.max(0, budget - caseFileTokens - stateTokens);
    const textTokens = TokenCounter.estimateTokens(discussionText);

    if (textTokens <= discussionBudget) {
      return caseFile + '\n' + stateText + '\n' + discussionText;
    }

    // Compress middle rounds using the shared helper
    console.log(`[Judge context: ${textTokens} tokens exceeds ${judge.model} budget (${discussionBudget} after case file), compressing]`);

    if (roundGroups.length <= 3) {
      // Not enough rounds to selectively compress — truncate text directly
      const { text } = TokenCounter.truncateText(discussionText, discussionBudget);
      return caseFile + '\n' + stateText + '\n' + text;
    }

    // Keep first round + last 2 rounds verbatim, compress middle
    const parts: string[] = [];
    for (let i = 0; i < roundGroups.length; i++) {
      const group = roundGroups[i];
      const isFirst = i === 0;
      const isLastTwo = i >= roundGroups.length - 2;

      if (isFirst || isLastTwo) {
        for (const entry of group.entries) {
          parts.push(`[Round ${group.round}] ${entry.speaker}: ${entry.content}`);
        }
      } else {
        const summary = TokenCounter.summarizeRoundEntries(group.entries);
        parts.push(`[Round ${group.round} - compressed]\n${summary}`);
      }
    }

    const compressed = parts.join('\n\n');
    const compressedTokens = TokenCounter.estimateTokens(compressed);
    console.log(`[Judge context compressed: ${textTokens} → ${compressedTokens} tokens]`);

    // If still over budget after compression, truncate as last resort
    if (compressedTokens > discussionBudget) {
      const { text } = TokenCounter.truncateText(compressed, discussionBudget);
      return caseFile + '\n' + stateText + '\n' + text;
    }

    return caseFile + '\n' + stateText + '\n' + compressed;
  }

  /**
   * Generate a best-effort judge result from raw history without an LLM call.
   * Used as ultimate fallback when the judge model itself fails.
   */
  private bestEffortJudgeResult(): {
    consensusReached: boolean;
    solution: string;
    guidance: string;
    keyDecisions: string[];
    actionItems: string[];
    dissent: string[];
    confidence: string;
  } {
    // Extract unique agent positions from the last round
    const roundGroups = this.groupHistoryByRound();
    const lastRound = roundGroups[roundGroups.length - 1];
    const agentPositions: string[] = [];

    if (lastRound) {
      for (const entry of lastRound.entries) {
        if (entry.role === 'assistant' && entry.speaker !== 'Judge' && !entry.error) {
          // Take first 2 sentences as position summary
          const sentences = entry.content.match(/[^.!?]*[.!?]/g);
          const summary = sentences
            ? sentences.slice(0, 2).join('').trim()
            : entry.content.substring(0, 200).trim();
          agentPositions.push(`${entry.speaker}: ${summary}`);
        }
      }
    }

    const solution = agentPositions.length > 0
      ? `Best-effort summary (judge unavailable):\n${agentPositions.join('\n')}`
      : 'Discussion occurred but judge was unable to summarize results.';

    return {
      consensusReached: false,
      solution,
      guidance: 'Judge evaluation failed. Summary generated from last round agent positions.',
      keyDecisions: [],
      actionItems: [],
      dissent: ['Judge model exceeded context limits — results are approximate'],
      confidence: 'LOW'
    };
  }

  /**
   * Judge evaluates if consensus has been reached
   * Uses cached FULL discussion to ensure judge sees complete decision journey
   * @param {Object} judge - Judge instance
   * @returns {Object} - { consensusReached: boolean, solution?: string, guidance?: string }
   */
  async judgeEvaluate(judge: any) {
    try {
      // Cache formatted FULL discussion instead of rebuilding each time
      // CRITICAL: We must pass the full history so the judge sees the complete decision journey,
      // including proposals that were made AND rejected. Without full context, the judge may
      // hallucinate decisions that were actually rejected in earlier rounds.
      if (!this.cachedRecentDiscussion || this.lastJudgeCacheRound !== this.currentRound) {
        this.cachedRecentDiscussion = this.conversationHistory
          .map(entry => `[Round ${this.getRoundForEntry(entry)}] ${entry.speaker}: ${entry.content}`)
          .join('\n\n');

        this.lastJudgeCacheRound = this.currentRound;
      }

      // Detect if agents are just agreeing without adding value
      const agreementPatterns = /I agree|I concur|well said|exactly right|nothing to add|fully support/gi;
      const agreementMatches = this.cachedRecentDiscussion.match(agreementPatterns) || [];
      const isShallowAgreement = agreementMatches.length >= 2;

      // Check which agents have contributed to the discussion
      const contributingAgents = new Set<string>();
      for (const entry of this.conversationHistory) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          contributingAgents.add(entry.speaker);
        }
      }
      const activeAgents = this.agentOrder.filter(agent => !this.persistentlyFailedAgents.has(agent));
      const allAgentsContributed = activeAgents.every(agent => contributingAgents.has(agent));
      const missingAgents = activeAgents.filter(agent => !contributingAgents.has(agent));

      let roundContext = '';
      if (!allAgentsContributed) {
        roundContext = `\n\n⚠️ WARNING: Not all agents have contributed yet. Missing: ${missingAgents.join(', ')}. Consensus CANNOT be declared until all agents have had a chance to speak.`;
      } else if (this.currentRound > 2 && isShallowAgreement) {
        roundContext = `\n\nNote: This is round ${this.currentRound}. The agents appear to be agreeing superficially. Push them to challenge assumptions, explore edge cases, or identify weaknesses that haven't been addressed.`;
      }

      // Compress discussion text if it would overflow the judge's context window.
      // prepareJudgeContext() prepends a case file header at the START (high attention zone).
      const fittedDiscussion = this.prepareJudgeContext(judge, this.cachedRecentDiscussion);

      // Structure: Case file (START - high attention) -> Discussion (MIDDLE) -> Judge instruction (END - highest attention)
      const judgePrompt = `${fittedDiscussion}
${roundContext}

Given the case file and discussion above, evaluate whether the agents have reached GENUINE consensus. True consensus requires:
1. All active agents must have contributed at least once (agents disabled by errors are excluded)
2. Specific, actionable recommendations (not vague agreement)
3. Trade-offs acknowledged and resolved
4. Potential objections addressed (not just glossed over)
5. Each agent contributing distinct value (not just echoing others)

WARNING: "I agree with X" statements without new insights do NOT constitute genuine consensus. This is shallow agreement.

If YES (genuine consensus reached), respond with EXACTLY this format:
CONSENSUS_REACHED

SUMMARY:
[2-3 sentence summary of the FINAL agreed solution]

CRITICAL SUMMARY RULES:
- ONLY summarize what the agents FINALLY agreed upon
- Do NOT include proposals that were mentioned but later REJECTED or SUPERSEDED
- Do NOT synthesize a "balanced" view that includes options the agents explicitly moved away from
- If an option was proposed in Round 1 but rejected in Round 2, it should NOT appear in the summary
- The summary must reflect the ACTUAL FINAL POSITION, not a compromise of all positions mentioned

KEY_DECISIONS:
- [Decision 1 - must reflect final agreed position only]
- [Decision 2]
- [etc.]

ACTION_ITEMS:
- [Action 1]
- [Action 2]
- [etc.]

DISSENT:
- [Any minority opinions or unresolved concerns, or "None" if full agreement]

CONFIDENCE: [HIGH/MEDIUM/LOW based on strength of agreement]

If NO (no genuine consensus), provide SPECIFIC, CHALLENGING guidance:
- If agents are just agreeing: "Play devil's advocate on [specific point]. What could go wrong with [recommendation]? What's the strongest argument AGAINST this approach?"
- If discussion is circular: "We've covered [X] enough. Focus next on [unexplored aspect Y]."
- If one perspective is missing: "No one has addressed [gap]. [Agent name], challenge the current thinking."

Your guidance should FORCE new insights, not just encourage more discussion.`;

      const messages = [
        {
          role: 'user',
          content: judgePrompt
        }
      ];

      const response = await judge.provider.chat(messages, judge.systemPrompt, this.getChatOptions('Judge'));
      const text = typeof response === 'string' ? response : response.text || '';

      if (this.streamOutput) {
        process.stdout.write('\n');
      }

      // Check if consensus reached
      if (text.includes('CONSENSUS_REACHED')) {
        const structured = this.parseStructuredOutput(text);
        return {
          consensusReached: true,
          solution: structured.summary,
          keyDecisions: structured.keyDecisions,
          actionItems: structured.actionItems,
          dissent: structured.dissent,
          confidence: structured.confidence
        };
      }

      return {
        consensusReached: false,
        guidance: text
      };

    } catch (error: any) {
      const errorMsg = error.message || '';
      console.error(`Error with judge evaluation: ${errorMsg}`);

      // If context overflow, retry with a larger-context model
      const isContextOverflow = /context.?length|token.?limit|too.?long|max.?tokens|content_too_large/i.test(errorMsg);
      if (isContextOverflow && !judge.model.includes('claude')) {
        console.log(`[Judge ${judge.model} context overflow, retrying with claude-sonnet-4-5 (200K context)]`);
        try {
          const fallbackProvider = ProviderFactory.createProvider('claude-sonnet-4-5');
          const fittedDiscussion = this.prepareJudgeContext(
            { model: 'claude-sonnet-4-5' },
            this.cachedRecentDiscussion
          );
          const fallbackPrompt = `Full discussion:\n${fittedDiscussion}\n\nProvide brief guidance for the next round of discussion.`;
          const response = await fallbackProvider.chat(
            [{ role: 'user', content: fallbackPrompt }],
            judge.systemPrompt,
            this.getChatOptions('Judge')
          );
          const text = typeof response === 'string' ? response : (response.text ?? '');
          if (text && text.length > 0) {
            if (text.includes('CONSENSUS_REACHED')) {
              const structured = this.parseStructuredOutput(text);
              return {
                consensusReached: true,
                solution: structured.summary,
                keyDecisions: structured.keyDecisions,
                actionItems: structured.actionItems,
                dissent: structured.dissent,
                confidence: structured.confidence
              };
            }
            return { consensusReached: false, guidance: text };
          }
        } catch (fallbackError: any) {
          console.error(`[Judge fallback also failed: ${fallbackError.message}]`);
        }

        // Ultimate fallback: heuristic summary without LLM
        console.log(`[Judge: using best-effort heuristic summary]`);
        const bestEffort = this.bestEffortJudgeResult();
        return {
          consensusReached: false,
          guidance: bestEffort.guidance
        };
      }

      return {
        consensusReached: false,
        guidance: 'Please continue the discussion and try to reach agreement.'
      };
    }
  }

  /**
   * Conduct a final vote when max rounds reached
   * @param {Object} judge - Judge instance
   * @returns {Object} - Structured final decision
   */
  async conductFinalVote(judge: any): Promise<{
    solution: string;
    keyDecisions: string[];
    actionItems: string[];
    dissent: string[];
    confidence: string;
  }> {
    try {
      const rawDiscussion = this.conversationHistory
        .map(entry => `${entry.speaker}: ${entry.content}`)
        .join('\n\n');

      // Compress if needed for judge's context window
      const fullDiscussion = this.prepareJudgeContext(judge, rawDiscussion);

      // Structure: Case file (START - high attention) -> Discussion (MIDDLE) -> Judge instruction (END - highest attention)
      const votePrompt = `${fullDiscussion}

The agents haven't reached full consensus within the allowed rounds. Given the case file and discussion above, analyze the discussion trajectory and determine the DIRECTION the agents were heading.

CRITICAL: Your summary must reflect where the discussion CONVERGED, not a "balanced synthesis" of all options mentioned.

Respond with EXACTLY this format:

SUMMARY:
[2-3 sentence summary of the direction the discussion was heading]

CRITICAL SUMMARY RULES:
- Identify which position gained the most support by the END of the discussion
- Do NOT include proposals that were mentioned but later REJECTED or SUPERSEDED
- Do NOT create a "fair compromise" that includes options agents moved away from
- If Agent A proposed X in Round 1 but agents converged on Y in later rounds, summarize Y not X
- The summary must reflect the ACTUAL TRAJECTORY, not an average of all positions

KEY_DECISIONS:
- [Decision 1 - based on where discussion was heading]
- [Decision 2]
- [etc.]

ACTION_ITEMS:
- [Action 1]
- [Action 2]
- [etc.]

DISSENT:
- [Any minority opinions or unresolved concerns from specific agents]

CONFIDENCE: [HIGH/MEDIUM/LOW based on clarity of the discussion direction]`;

      const messages = [
        {
          role: 'user',
          content: votePrompt
        }
      ];

      const finalDecision = await judge.provider.chat(messages, judge.systemPrompt, this.getChatOptions('Judge'));
      const text = typeof finalDecision === 'string' ? finalDecision : (finalDecision.text ?? '');

      if (this.streamOutput) {
        process.stdout.write('\n');
      }

      const structured = this.parseStructuredOutput(text);
      console.log(`\nJudge's Final Decision:\n${structured.summary}\n`);

      return {
        solution: structured.summary,
        keyDecisions: structured.keyDecisions,
        actionItems: structured.actionItems,
        dissent: structured.dissent,
        confidence: structured.confidence
      };

    } catch (error: any) {
      const errorMsg = error.message || '';
      console.error(`Error conducting final vote: ${errorMsg}`);

      // If context overflow, try best-effort heuristic summary
      const isContextOverflow = /context.?length|token.?limit|too.?long|max.?tokens|content_too_large/i.test(errorMsg);
      if (isContextOverflow) {
        console.log(`[Final vote: judge context overflow, using best-effort summary]`);
        const bestEffort = this.bestEffortJudgeResult();
        return {
          solution: bestEffort.solution,
          keyDecisions: bestEffort.keyDecisions,
          actionItems: bestEffort.actionItems,
          dissent: bestEffort.dissent,
          confidence: bestEffort.confidence
        };
      }

      return {
        solution: 'Unable to reach a final decision due to an error.',
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        confidence: 'LOW'
      };
    }
  }
}
