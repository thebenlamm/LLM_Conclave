import ProviderFactory from '../providers/ProviderFactory';
import { preFlightTpmCheck, inferProviderFromModel } from '../providers/tpmLimits.js';
import ConversationHistory from './ConversationHistory.js';
import AgentTurnExecutor from './AgentTurnExecutor.js';
import JudgeEvaluator from './JudgeEvaluator.js';
import { EventBus } from './EventBus';
import { SpeakerSelector, AgentInfo, AgentTurnStats, FairnessContext } from './SpeakerSelector';
import TurnDistributionReporter from './TurnDistributionReporter.js';
import { reconcileConfidence, MachinerySignals, Confidence } from './ConfidenceReconciler.js';
import { TaskRouter } from './TaskRouter';
import { DEFAULT_SELECTOR_MODEL } from '../constants';
import { DiscussionHistoryEntry, Config } from '../types/index.js';
import { CostTracker } from './CostTracker';

/**
 * Manages the multi-agent conversation.
 *
 * After Phase 02 decomposition:
 *   - ConversationHistory owns history manipulation (grouping, compression, message preparation)
 *   - AgentTurnExecutor owns the agent call cycle (retry, fallback, circuit breaker)
 *   - JudgeEvaluator owns all judge evaluation (consensus, final vote, quality analysis)
 *
 * CONTEXT_OVERFLOW_PATTERN has been moved to JudgeEvaluator (sole owner).
 */
export default class ConversationManager {
  config: Config;
  agents: { [key: string]: any };
  agentOrder: string[];
  conversationHistory: DiscussionHistoryEntry[];
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

  // Agent turn executor — owns circuit breaker, retry, fallback, and failure tracking
  private agentExecutor!: AgentTurnExecutor;

  // Judge evaluator — owns all judge evaluation logic, consensus detection, and discussion caching
  private judgeEvaluator!: JudgeEvaluator;

  // Abort signal for cancellation from MCP timeout
  abortSignal?: AbortSignal;

  // Model routing for subtasks (summarization)
  private taskRouter: TaskRouter | null;

  // Custom instructions appended to judge prompts (from caller)
  private judgeInstructions: string | null = null;

  // Injected or singleton CostTracker for cost isolation per conversation
  private costTracker: CostTracker;

  // History manipulation delegate — owns grouping, compression, message preparation
  private history!: ConversationHistory;

  // Phase 13 — turn distribution observability + per-agent counters
  private turnDistributionReporter: TurnDistributionReporter;
  private turnsThisRound: Record<string, number> = {};
  private turnsOverall: Record<string, number> = {};
  private tokensByAgent: Record<string, number> = {};

  // Phase 13 Plan 04 — set whenever any agent trips the fairness_alarm event.
  // Consumed by buildMachinerySignals() so the ConfidenceReconciler caps at LOW
  // when turn balance was violated during the run.
  private fairnessAlarmFired: boolean = false;

  // Phase 15.2 Task 3 — hard-stop flag set when the judge declares consensus.
  // Checked at the top of the outer round loop AND at every per-turn entry so
  // post-termination work cannot leak into round N+1. In-memory only; NOT
  // persisted to session.json (D-09).
  private terminated: boolean = false;

  constructor(
    config: Config,
    memoryManager: any = null,
    streamOutput: boolean = false,
    eventBus?: EventBus,
    dynamicSelection: boolean = false,
    selectorModel: string = DEFAULT_SELECTOR_MODEL,
    options?: { disableRouting?: boolean; judgeInstructions?: string; costTracker?: CostTracker; strictModels?: boolean }
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
    this.judgeInstructions = options?.judgeInstructions ?? null;
    this.costTracker = options?.costTracker ?? CostTracker.getInstance();

    this.initializeAgents();

    // agentExecutor must be created before history so getAgentSubstitutions()
    // callback below can forward to agentExecutor (lazy via closure, safe).
    // history is passed as a placeholder reference — assigned after history creation.
    // We use a two-step init: agentExecutor first (no history ref needed at ctor time),
    // then history (references agentExecutor via closure).
    this.agentExecutor = new AgentTurnExecutor({
      agents: this.agents,
      config: this.config,
      conversationHistory: this.conversationHistory,
      history: null as any, // will be set after history is created
      streamOutput: this.streamOutput,
      eventBus: this.eventBus,
      abortSignal: this.abortSignal,
      taskRouter: this.taskRouter,
      costTracker: this.costTracker,
      strictModels: options?.strictModels === true,
    });

    this.history = new ConversationHistory(
      this.conversationHistory,
      this.config,
      () => this.currentRound,
      () => this.agentExecutor.getAgentSubstitutions(),
      () => this.agents,
      () => this.taskRouter,
      // onCacheInvalidated: reset JudgeEvaluator's discussion cache after compression.
      // judgeEvaluator is set after this constructor returns, so we use a lazy closure.
      () => { if (this.judgeEvaluator) this.judgeEvaluator.invalidateCache(); }
    );

    // Wire history back into agentExecutor now that it's created
    (this.agentExecutor as any).deps.history = this.history;

    // Phase 13 — turn distribution reporter + console listener (non-MCP only).
    this.turnDistributionReporter = new TurnDistributionReporter();
    if (this.streamOutput && this.eventBus) {
      // streamOutput=true is the existing CLI/non-MCP signal (MCP discuss
      // handler constructs CM with streamOutput=false to avoid stdout pollution
      // on the MCP stdio transport).
      this.eventBus.on('turn_distribution_updated', (evt: any) => {
        const payload = evt?.payload || evt;
        if (!payload?.perAgent) return;
        const parts = payload.perAgent.map(
          (a: any) => `${a.name}:${a.turns}(${Math.round(a.tokenShare * 100)}%)`
        );
        console.log(`[Turns r${payload.round}] ${parts.join(' ')}`);
      });
      this.eventBus.on('fairness_alarm', (evt: any) => {
        const p = evt?.payload || evt;
        this.fairnessAlarmFired = true;
        console.warn(
          `[Fairness alarm r${p.round}] ${p.agent} at ${Math.round(p.tokenShare * 100)}% (threshold ${Math.round(p.threshold * 100)}%)`
        );
      });
    }
    // Phase 13 Plan 04 — always track fairness alarms (not just in streamOutput mode)
    // so the reconciler can see them in MCP mode too. Separate listener with no logging.
    if (this.eventBus && !this.streamOutput) {
      this.eventBus.on('fairness_alarm', () => {
        this.fairnessAlarmFired = true;
      });
    }

    // Create JudgeEvaluator with all judge dependencies.
    // Must be created after agentExecutor and history are available.
    this.judgeEvaluator = new JudgeEvaluator({
      conversationHistory: this.conversationHistory,
      history: this.history,
      config: this.config,
      agents: this.agents,
      agentOrder: this.agentOrder,
      getCurrentRound: () => this.currentRound,
      judgeInstructions: this.judgeInstructions,
      eventBus: this.eventBus,
      abortSignal: this.abortSignal,
      costTracker: this.costTracker,
      streamOutput: this.streamOutput,
      getPersistentlyFailedAgents: () => this.agentExecutor.getPersistentlyFailedAgents(),
    });
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
        provider: ProviderFactory.createProvider(agentConfig.model, { costTracker: this.costTracker }),
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
   * Restore agent substitutions recorded in a prior session (Phase 12-04).
   * Called by `llm_conclave_continue` after constructing a new ConversationManager:
   * the substitution metadata is re-applied to AgentTurnExecutor, and the
   * in-memory `agents` map is rewired so subsequent turns use the substitute
   * provider/model — the originally-configured model is NOT retried.
   *
   * Rationale: mid-session model switches would invalidate prior-round history
   * produced by the substitute, and the user has already accepted the
   * substitution by choosing to continue.
   */
  restoreAgentSubstitutions(
    subs: Record<string, { original: string; fallback: string; reason: string }>
  ): void {
    if (!subs) return;
    this.agentExecutor.restoreAgentSubstitutions(subs);
    for (const [name, sub] of Object.entries(subs)) {
      const agent = this.agents[name];
      if (!agent) continue;
      // Only rewire when the recorded substitution's fallback differs from the
      // currently-configured model — otherwise the resume config already
      // matches the substitute (e.g. user updated their config in the meantime).
      if (agent.model !== sub.fallback) {
        try {
          agent.provider = ProviderFactory.createProvider(sub.fallback, { costTracker: this.costTracker });
          agent.model = sub.fallback;
          console.log(`[continue: ${name} restored to substitute model ${sub.fallback} (original ${sub.original})]`);
        } catch (err: any) {
          console.error(`[continue: failed to restore substitute provider for ${name}: ${err?.message || err}]`);
        }
      }
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
    // Pre-flight TPM guard (Phase 12) — fail fast before any LLM call,
    // before any history seeding, and before any run:start event so a
    // pre-flight failure produces no session side effects. Matches the
    // CostTracker pre-flight gate pattern: abort before work begins.
    // Throws PreFlightTpmError on violation; MCP discuss handler catches.
    const projectContextText: string | undefined =
      projectContext && typeof projectContext.formatContext === 'function'
        ? projectContext.formatContext()
        : (typeof projectContext === 'string' ? projectContext : undefined);
    preFlightTpmCheck(
      this.agents,
      task,
      projectContextText,
      (this.config as any)?.tpmOverrides
    );

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
      speaker: 'System',
      timestamp: new Date().toISOString()
    });

    let consensusReached = false;
    let finalSolution: string | null = null;
    let keyDecisions: string[] = [];
    let actionItems: string[] = [];
    let dissent: string[] = [];
    let confidence: string = 'MEDIUM';

    // Main conversation loop
    while (this.currentRound < this.maxRounds && !consensusReached) {
      // Phase 15.2 Task 3 — hard stop: if the judge declared consensus on a
      // previous iteration, do not start a new round. In-flight turns from
      // the prior round have already finished. Defense-in-depth on top of
      // the consensusReached loop condition; protects against any future
      // refactor that bypasses the local boolean.
      if (this.terminated) {
        console.log(`\n[Discussion terminated: judge consensus, no further rounds]\n`);
        break;
      }
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

      // Phase 13 — round boundary resets for fairness + observability state.
      this.turnsThisRound = {};
      if (this.speakerSelector && typeof this.speakerSelector.resetForRound === 'function') {
        this.speakerSelector.resetForRound();
      }
      this.turnDistributionReporter.resetForRound(this.currentRound);

      // Phase 13 — for round 2+, prime the compressed history. This refreshes
      // the running summary cache inside ConversationHistory and exercises the
      // sliding-window path. The raw `conversationHistory` array is left intact
      // (compression is non-destructive — see ConversationHistory.ts:405).
      if (this.currentRound >= 2) {
        // Build a string-provider shape for ConversationHistory. `this.agents`
        // stores `.provider` as an LLMProvider *instance*, but
        // getCompressedHistoryFor expects a provider-name string for TPM
        // resolution. Pass model only and let inferProviderFromModel derive
        // the provider name — this is the authoritative mapping.
        const agentsForCompression: Record<string, { model: string; provider: string }> = {};
        for (const [agentName, agent] of Object.entries(this.agents)) {
          const model = (agent as any)?.model;
          if (typeof model !== 'string' || model.length === 0) continue;
          agentsForCompression[agentName] = {
            model,
            provider: inferProviderFromModel(model),
          };
        }
        try {
          await this.history.getCompressedHistoryFor(agentsForCompression, {
            taskRouter: this.taskRouter ?? undefined,
            config: (this.config as any)?.compression,
            tpmOverrides: (this.config as any)?.tpmOverrides,
          });
        } catch (err: any) {
          console.warn(`[ConversationManager] compression refresh failed: ${err?.message || err}`);
          // Surface regressions in dev/test so a silent swallow can't hide
          // another shape mismatch like the one that motivated this fix.
          if (process.env.NODE_ENV === 'test' || process.env.LLM_CONCLAVE_STRICT_COMPRESSION === '1') {
            throw err;
          }
        }
      }

      // Each agent takes a turn - either dynamic or round-robin
      if (this.dynamicSelection && this.speakerSelector) {
        await this.runDynamicRound(task);
      } else {
        for (const agentName of this.agentOrder) {
          const historyLenBefore = this.conversationHistory.length;
          await this.runAgentTurnGuarded(agentName);
          // Phase 13 — record per-agent turn + token stats and report.
          this.recordAgentTurnStats(agentName, historyLenBefore);
          this.turnDistributionReporter.report(
            Object.keys(this.agents).map(name => ({
              name,
              turns: this.turnsOverall[name] || 0,
              tokens: this.tokensByAgent[name] || 0,
            })),
            this.currentRound,
            this.eventBus
          );
        }
      }

      // Early abort: count how many agents actually contributed THIS round.
      // If fewer than 2 agents responded (and we have 2+ agents total), the discussion
      // has degraded into a monologue or silence — abort immediately instead of continuing.
      const roundContributors = new Set<string>();
      // Scan history entries added this round (entries after the round-start boundary)
      for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
        const entry = this.conversationHistory[i];
        // Stop scanning when we hit a Judge entry (previous round boundary) or System entry
        if (entry.speaker === 'Judge' || entry.speaker === 'System') break;
        if (entry.role === 'assistant' && entry.speaker && !entry.error) {
          roundContributors.add(entry.speaker);
        }
      }

      const totalAgents = this.agentOrder.length;
      if (roundContributors.size < 2 && totalAgents >= 2) {
        const degradedReason = `Only ${roundContributors.size} of ${totalAgents} agents responded in round ${this.currentRound}`;
        console.log(`\n[Discussion aborted: ${degradedReason}]\n`);
        if (this.eventBus) {
          this.eventBus.emitEvent('status', { message: `Discussion aborted: ${degradedReason}` });
        }

        // Build failedAgentDetails for the degraded return
        const degradedFailedDetails: Record<string, { error: string; model: string }> = {};
        for (const entry of this.conversationHistory) {
          if (entry.error === true && entry.speaker) {
            degradedFailedDetails[entry.speaker] = {
              error: entry.errorDetails || 'Unknown error',
              model: entry.model || 'unknown',
            };
          }
        }
        const degradedFailedAgents = [...new Set(
          this.conversationHistory.filter((msg: any) => msg.error === true).map((msg: any) => msg.speaker)
        )];

        // Phase 13 Plan 04 — build machinery signals for the degraded judge call.
        const degradedMachinery = this.buildMachinerySignals(true, degradedReason);

        // Attempt judge summary of whatever exists
        let degradedSolution: string;
        let degradedJudgeConfidence: Confidence | undefined;
        try {
          const voteResult = await this.judgeEvaluator.conductFinalVote(judge, degradedMachinery);
          degradedSolution = voteResult.solution;
          degradedJudgeConfidence = this.normalizeConfidence(voteResult.confidence);
        } catch {
          const bestEffort = this.judgeEvaluator.bestEffortJudgeResult();
          degradedSolution = bestEffort.solution;
        }

        const degradedCostSummary = this.costTracker.getSummary();

        // Compute turn analytics from whatever history exists (degraded path)
        const degradedTurnCounts: Record<string, number> = {};
        const degradedAgentTokens: Record<string, number> = {};
        for (const entry of this.conversationHistory) {
          if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
            const name = entry.speaker;
            degradedTurnCounts[name] = (degradedTurnCounts[name] || 0) + 1;
            degradedAgentTokens[name] = (degradedAgentTokens[name] || 0) + Math.ceil((entry.content?.length || 0) / 4);
          }
        }
        const degradedTotalTokens = Object.values(degradedAgentTokens).reduce((a, b) => a + b, 0) || 1;
        const degradedTokenShare: Record<string, number> = {};
        for (const [name, tokens] of Object.entries(degradedAgentTokens)) {
          degradedTokenShare[name] = Math.round((tokens / degradedTotalTokens) * 100);
        }
        const degradedSortedAgents = Object.entries(degradedTurnCounts).sort((a, b) => b[1] - a[1]);

        // Phase 13 Plan 04 — reconcile machinery signals with whatever the judge reported.
        const degradedReconciled = reconcileConfidence(degradedMachinery, degradedJudgeConfidence);

        return {
          task: task,
          rounds: this.currentRound,
          maxRounds: this.maxRounds,
          minRounds: this.minRounds,
          consensusReached: false,
          solution: degradedSolution,
          keyDecisions: [] as string[],
          actionItems: [] as string[],
          dissent: [degradedReason],
          confidence: degradedReconciled.finalConfidence,
          finalConfidence: degradedReconciled.finalConfidence,
          confidenceReasoning: degradedReconciled.confidenceReasoning,
          conversationHistory: this.conversationHistory,
          failedAgents: degradedFailedAgents,
          failedAgentDetails: degradedFailedDetails,
          agentSubstitutions: this.agentExecutor.getAgentSubstitutions(),
          agents_config: Object.fromEntries(
            Object.entries(this.agents).map(([name, cfg]: [string, any]) => [name, { model: cfg.model }])
          ),
          degraded: true,
          degradedReason,
          turn_analytics: {
            per_agent: degradedSortedAgents.map(([name, turns]) => ({
              name,
              turns,
              token_share_pct: degradedTokenShare[name] || 0,
            })),
          },
          dissent_quality: this.computeDegradedDissentQuality(degradedSortedAgents, [degradedReason]),
          cost: {
            totalCost: degradedCostSummary.totalCost,
            totalTokens: {
              input: degradedCostSummary.totalTokens.input,
              output: degradedCostSummary.totalTokens.output,
            },
            totalCalls: degradedCostSummary.totalCalls,
          },
        };
      }

      // Also check circuit breaker: if persistently failed agents leave only 1 alive, stop
      if (this.agentExecutor.getPersistentlyFailedAgents().size > 0) {
        const aliveAgents = this.agentOrder.filter(a => !this.agentExecutor.getPersistentlyFailedAgents().has(a));
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

      // Phase 13 Plan 04 — supply machinery signals so the judge cannot
      // produce HIGH confidence on a degraded run.
      const preJudgeMachinery = this.buildMachinerySignals(false);
      const judgeResult = await this.judgeEvaluator.judgeEvaluate(judge, preJudgeMachinery);

      // Hard enforcement: Check if all active agents have contributed (don't trust LLM judge alone)
      // Exclude agents disabled by circuit breaker — they can't contribute
      const contributingAgents = new Set<string>();
      for (const entry of this.conversationHistory) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          contributingAgents.add(entry.speaker);
        }
      }
      const activeAgents = this.agentOrder.filter(a => !this.agentExecutor.getPersistentlyFailedAgents().has(a));
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
        // Phase 15.2 Task 3 — set BEFORE any return/break so the round-loop
        // guard (and any post-termination turn attempt) cannot miss it.
        this.terminated = true;
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
          speaker: 'Judge',
          timestamp: new Date().toISOString()
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
          speaker: 'Judge',
          timestamp: new Date().toISOString()
        });
      }
      
      if (this.eventBus) {
        this.eventBus.emitEvent('round:complete', { round: this.currentRound });
      }

      // Compress history if it's getting too large (prevents context overflow in later rounds)
      await this.history.compressHistory();
    }

    // If aborted (e.g. MCP timeout), attempt judge summary before falling back to heuristic.
    // The judge didn't fail — only the discussion was cut short. A proper summary is still valuable.
    if (this.abortSignal?.aborted) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Discussion aborted after ${this.currentRound} rounds. Attempting judge summary...`);
      console.log(`${'='.repeat(80)}\n`);

      if (this.eventBus) {
        this.eventBus.emitEvent('status', { message: `Discussion aborted after ${this.currentRound} rounds. Running judge summary...` });
      }

      const failedAgentsList = this.conversationHistory
        .filter((msg: any) => msg.error === true)
        .map((msg: any) => msg.speaker);

      // Build detailed error map for abort return
      const failedAgentDetails: Record<string, { error: string; model: string }> = {};
      for (const entry of this.conversationHistory) {
        if (entry.error === true && entry.speaker) {
          failedAgentDetails[entry.speaker] = {
            error: entry.errorDetails || 'Unknown error',
            model: entry.model || 'unknown',
          };
        }
      }

      // Try to get a proper judge summary with a fresh (non-aborted) signal.
      // The abort signal cancelled the discussion loop, but the judge can still summarize.
      // Replace with a new 30-second timeout guard to prevent hanging indefinitely.
      const abortReason = this.abortSignal.reason || 'aborted';
      const judgeController = new AbortController();
      const judgeTimeout = setTimeout(() => judgeController.abort('judge-timeout'), 30_000);
      this.abortSignal = judgeController.signal;
      if (this.speakerSelector) {
        this.speakerSelector.abortSignal = undefined;
      }

      let solution: string;
      let keyDecisions: string[] = [];
      let actionItems: string[] = [];
      let dissent: string[] = [`Discussion was interrupted (${abortReason})`];
      let confidence: string = 'LOW';

      // Phase 13 Plan 04 — mark the run as aborted so the reconciler caps at LOW
      // and the judge sees degraded signals in its prompt.
      const abortedMachinery = this.buildMachinerySignals(true, String(abortReason));
      let abortedJudgeConfidence: Confidence | undefined;

      try {
        const voteResult = await this.judgeEvaluator.conductFinalVote(judge, abortedMachinery);
        solution = voteResult.solution;
        keyDecisions = voteResult.keyDecisions;
        actionItems = voteResult.actionItems;
        dissent = [...(voteResult.dissent || []), `Discussion was interrupted after ${this.currentRound}/${this.maxRounds} rounds (${abortReason})`];
        confidence = voteResult.confidence;
        abortedJudgeConfidence = this.normalizeConfidence(voteResult.confidence);
        console.log(`[Judge summary succeeded despite timeout]`);
      } catch (judgeError: any) {
        console.error(`[Judge summary failed after timeout: ${judgeError.message}]`);
        // Fall back to heuristic only if judge itself fails
        const bestEffort = this.judgeEvaluator.bestEffortJudgeResult();
        solution = bestEffort.solution;
      } finally {
        clearTimeout(judgeTimeout);
      }

      const abortedCostSummary = this.costTracker.getSummary();

      // Compute turn analytics from whatever history exists (abort/timeout path)
      const abortTurnCounts: Record<string, number> = {};
      const abortAgentTokens: Record<string, number> = {};
      for (const entry of this.conversationHistory) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          const name = entry.speaker;
          abortTurnCounts[name] = (abortTurnCounts[name] || 0) + 1;
          abortAgentTokens[name] = (abortAgentTokens[name] || 0) + Math.ceil((entry.content?.length || 0) / 4);
        }
      }
      const abortTotalTokens = Object.values(abortAgentTokens).reduce((a, b) => a + b, 0) || 1;
      const abortTokenShare: Record<string, number> = {};
      for (const [name, tokens] of Object.entries(abortAgentTokens)) {
        abortTokenShare[name] = Math.round((tokens / abortTotalTokens) * 100);
      }
      const abortSortedAgents = Object.entries(abortTurnCounts).sort((a, b) => b[1] - a[1]);

      // Phase 13 Plan 04 — reconcile with machinery-aborted signals.
      const abortedReconciled = reconcileConfidence(abortedMachinery, abortedJudgeConfidence);

      return {
        task: task,
        rounds: this.currentRound,
        maxRounds: this.maxRounds,
        minRounds: this.minRounds,
        consensusReached: false,
        solution,
        keyDecisions,
        actionItems,
        dissent,
        confidence,
        finalConfidence: abortedReconciled.finalConfidence,
        confidenceReasoning: abortedReconciled.confidenceReasoning,
        conversationHistory: this.conversationHistory,
        failedAgents: [...new Set(failedAgentsList)],
        failedAgentDetails,
        agentSubstitutions: this.agentExecutor.getAgentSubstitutions(),
        agents_config: Object.fromEntries(
          Object.entries(this.agents).map(([name, cfg]: [string, any]) => [name, { model: cfg.model }])
        ),
        timedOut: true,
        turn_analytics: {
          per_agent: abortSortedAgents.map(([name, turns]) => ({
            name,
            turns,
            token_share_pct: abortTokenShare[name] || 0,
          })),
        },
        dissent_quality: this.computeDegradedDissentQuality(abortSortedAgents, dissent),
        cost: {
          totalCost: abortedCostSummary.totalCost,
          totalTokens: {
            input: abortedCostSummary.totalTokens.input,
            output: abortedCostSummary.totalTokens.output,
          },
          totalCalls: abortedCostSummary.totalCalls,
        },
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

      const finalVoteMachinery = this.buildMachinerySignals(false);
      const voteResult = await this.judgeEvaluator.conductFinalVote(judge, finalVoteMachinery);
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

    // Build detailed error map for failed agents (surfaces actual error messages, not just names)
    const failedAgentDetails: Record<string, { error: string; model: string }> = {};
    for (const entry of this.conversationHistory) {
      if (entry.error === true && entry.speaker) {
        failedAgentDetails[entry.speaker] = {
          error: entry.errorDetails || 'Unknown error',
          model: entry.model || 'unknown',
        };
      }
    }

    // Report agent substitutions so user can debug provider issues
    const subsForReport = this.agentExecutor.getAgentSubstitutions();
    if (Object.keys(subsForReport).length > 0) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`⚠️  Agent Model Substitutions (provider issues detected):`);
      for (const [agent, sub] of Object.entries(subsForReport)) {
        console.log(`   ${agent}: ${sub.original} → ${sub.fallback} (reason: ${sub.reason})`);
      }
      console.log(`   💡 Action: Check provider credits/quotas for the original models.`);
      console.log(`${'─'.repeat(60)}\n`);
    }

    // Build cost data from CostTracker for session persistence (OBSRV-01)
    const costSummary = this.costTracker.getSummary();

    // Compute per-agent turn analytics (D-09, D-12)
    const turnCounts: Record<string, number> = {};
    const agentTokens: Record<string, number> = {};
    for (const entry of this.conversationHistory) {
      if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
        const name = entry.speaker;
        turnCounts[name] = (turnCounts[name] || 0) + 1;
        // Use content length as token proxy (actual per-entry tokens not tracked)
        agentTokens[name] = (agentTokens[name] || 0) + Math.ceil((entry.content?.length || 0) / 4);
      }
    }
    const totalTokensEstimate = Object.values(agentTokens).reduce((a, b) => a + b, 0) || 1;
    const tokenShare: Record<string, number> = {};
    for (const [name, tokens] of Object.entries(agentTokens)) {
      tokenShare[name] = Math.round((tokens / totalTokensEstimate) * 100);
    }
    const sortedAgents = Object.entries(turnCounts).sort((a, b) => b[1] - a[1]);
    const turn_analytics = {
      per_agent: sortedAgents.map(([name, turns]) => ({
        name,
        turns,
        token_share_pct: tokenShare[name] || 0,
      })),
    };

    // Determine dissent quality (D-15, D-16)
    let dissent_quality: 'captured' | 'missing' | 'not_applicable' | 'insufficient_data';
    if (consensusReached) {
      dissent_quality = 'not_applicable';
    } else {
      const substantiveDissent = dissent.filter(
        (d: string) => d && d.toLowerCase() !== 'none' && d.length > 10
      );
      dissent_quality = substantiveDissent.length > 0 ? 'captured' : 'missing';
    }

    // Phase 13 Plan 04 — reconcile machinery signals with the judge's confidence
    // for the happy-path return. Machinery flags are computed against the actual
    // run state (fairness alarms, per-agent coverage, completed rounds).
    const happyPathMachinery = this.buildMachinerySignals(false);
    const happyReconciled = reconcileConfidence(
      happyPathMachinery,
      this.normalizeConfidence(confidence)
    );

    const result = {
      task: task,
      rounds: this.currentRound,
      maxRounds: this.maxRounds,
      minRounds: this.minRounds,
      consensusReached: consensusReached,
      solution: finalSolution,
      keyDecisions: keyDecisions,
      actionItems: actionItems,
      dissent: dissent,
      confidence: confidence,
      finalConfidence: happyReconciled.finalConfidence,
      confidenceReasoning: happyReconciled.confidenceReasoning,
      conversationHistory: this.conversationHistory,
      failedAgents: uniqueFailedAgents,
      failedAgentDetails,
      agentSubstitutions: this.agentExecutor.getAgentSubstitutions(),
      agents_config: Object.fromEntries(
        Object.entries(this.agents).map(([name, cfg]: [string, any]) => [name, { model: cfg.model }])
      ),
      turn_analytics,
      dissent_quality,
      cost: {
        totalCost: costSummary.totalCost,
        totalTokens: {
          input: costSummary.totalTokens.input,
          output: costSummary.totalTokens.output,
        },
        totalCalls: costSummary.totalCalls,
      },
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

  // agentTurn, recordAgentFailure, pushAgentResponse, recordAgentSuccess,
  // createCallAbortController, and getFallbackModel have been extracted to AgentTurnExecutor.
  // Access them via this.agentExecutor.*

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
    const failedAgentsThisRound: Set<string> = new Set(this.agentExecutor.getPersistentlyFailedAgents());
    const agentsWhoContributedThisRound: Set<string> = new Set();

    let lastSpeaker: string | null = null;
    let lastResponse: string | null = null;
    let turnCount = 0;

    // Phase 15.2 Task 2 — per-agent-per-round turn cap. Default 1.
    // When the eligible-agent pool empties, runDynamicRound early-returns
    // immediately (no wildcard turn). MCP schema is unchanged for callers
    // that omit this field.
    const maxPerAgent = this.config.maxTurnsPerAgentPerRound ?? 1;
    const perAgentTurns = new Map<string, number>();

    // Phase 15.2 Task 2 — tightened safety cap (defense-in-depth).
    // Was: Math.max(20, this.agentOrder.length * 3) — far too lax.
    // Now: agentOrder.length * maxPerAgent + 1, so with default cap=1 and
    // 4 agents the safety cap is 5 instead of 20.
    const maxTurnsPerRound = this.agentOrder.length * maxPerAgent + 1;

    while (turnCount < maxTurnsPerRound) {
      // Check abort signal before each turn in dynamic mode
      if (this.abortSignal?.aborted) {
        console.log(`[Round ${this.currentRound} aborted: ${this.abortSignal.reason || 'timeout'}]`);
        break;
      }

      // Phase 13 — build fairness context from per-agent counters.
      const fairnessContext: FairnessContext = {
        stats: this.buildAgentTurnStats(),
        totalTurnsThisRound: Object.values(this.turnsThisRound).reduce((a, b) => a + b, 0),
      };

      // Phase 15.2 Task 2 — filter pool by per-agent turn cap BEFORE selector.
      // Mirrors the SpeakerSelector.ts:656-662 fallback / early-return style.
      const eligibleByCap = this.agentOrder.filter(
        name => !failedAgentsThisRound.has(name) && (perAgentTurns.get(name) ?? 0) < maxPerAgent
      );
      if (eligibleByCap.length === 0) {
        // Pool exhausted under per-agent cap — end round, let outer loop decide next steps.
        // No wildcard turn (D-04).
        console.log(`[Round ${this.currentRound} complete: per-agent turn cap (${maxPerAgent}) exhausted pool]`);
        break;
      }
      // Pass the capped-eligible pool to the selector as the additional-fail set
      // (selector treats failedAgents as "do not pick"). Union the cap exclusions
      // with failedAgentsThisRound so the selector cannot pick a capped agent.
      const cappedExclusions = new Set<string>(failedAgentsThisRound);
      for (const name of this.agentOrder) {
        if ((perAgentTurns.get(name) ?? 0) >= maxPerAgent) cappedExclusions.add(name);
      }

      // Select next speaker
      const selection = await this.speakerSelector.selectNextSpeaker(
        this.conversationHistory,
        lastSpeaker,
        lastResponse,
        this.currentRound,
        task,
        cappedExclusions,
        fairnessContext
      );

      // Check if round should end — respect the selector's decision (D-04).
      // In dynamic mode, not all agents need to speak every round. The per-discussion
      // allAgentsContributed check (after judge evaluation) ensures every agent has spoken
      // at least once across all rounds before consensus can be declared.
      if (!selection.shouldContinue) {
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

      // Phase 15.2 Task 2 — hard guard: even if the selector ignored the
      // exclusion set we passed in, a capped agent must NEVER take another
      // turn. This is the structural guarantee the per-agent cap exists to
      // enforce — it is not advisory.
      if ((perAgentTurns.get(agentName) ?? 0) >= maxPerAgent) {
        console.log(`[Round ${this.currentRound} complete: selector picked capped agent ${agentName}, ending round]`);
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
      await this.runAgentTurnGuarded(agentName);

      // Phase 13 — record per-agent turn + token stats and report.
      this.recordAgentTurnStats(agentName, historyLengthBefore);
      this.turnDistributionReporter.report(
        Object.keys(this.agents).map(name => ({
          name,
          turns: this.turnsOverall[name] || 0,
          tokens: this.tokensByAgent[name] || 0,
        })),
        this.currentRound,
        this.eventBus
      );

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
      // Phase 15.2 Task 2 — bump per-agent counter (success or error: a slot
      // was consumed either way, matching the placement of turnCount++).
      perAgentTurns.set(agentName, (perAgentTurns.get(agentName) ?? 0) + 1);
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
   * Phase 15.2 Task 3 — per-turn entry guard. If the discussion has already
   * been terminated (judge consensus), warn-and-skip without invoking the
   * provider. Never throws (D-08); returns void so the surrounding loop can
   * decide what to do next (typically: break via the cap-exhausted or
   * terminated check on the following iteration).
   */
  private async runAgentTurnGuarded(agentName: string): Promise<void> {
    if (this.terminated) {
      console.warn('[ConversationManager] Turn attempted after terminated=true', {
        agent: agentName,
        round: this.currentRound,
      });
      return;
    }
    await this.agentExecutor.agentTurn(agentName);
  }

  // ---------------------------------------------------------------------------
  // Phase 13 — fairness + observability helpers
  // ---------------------------------------------------------------------------

  /**
   * Increment per-agent turn counters and accumulate token estimate from
   * the most-recently-appended history entry (if any belongs to `agentName`
   * and is not an error). Token proxy matches the existing degraded-path
   * formula at line ~367: `Math.ceil(content.length / 4)`.
   */
  private recordAgentTurnStats(agentName: string, historyLenBefore: number): void {
    if (this.conversationHistory.length <= historyLenBefore) return;
    const latest = this.conversationHistory[this.conversationHistory.length - 1];
    if (!latest || latest.error || latest.speaker !== agentName) return;

    this.turnsThisRound[agentName] = (this.turnsThisRound[agentName] || 0) + 1;
    this.turnsOverall[agentName] = (this.turnsOverall[agentName] || 0) + 1;
    const tokenEstimate = Math.ceil((latest.content?.length || 0) / 4);
    this.tokensByAgent[agentName] = (this.tokensByAgent[agentName] || 0) + tokenEstimate;
  }

  /**
   * Build a stats map suitable for SpeakerSelector.FairnessContext.
   * tokenShare is computed over the running per-agent totals.
   */
  private buildAgentTurnStats(): Record<string, AgentTurnStats> {
    const totalTokens = Object.values(this.tokensByAgent).reduce((a, b) => a + b, 0) || 1;
    const stats: Record<string, AgentTurnStats> = {};
    for (const name of Object.keys(this.agents)) {
      stats[name] = {
        turnsThisRound: this.turnsThisRound[name] || 0,
        turnsOverall: this.turnsOverall[name] || 0,
        tokenShare: (this.tokensByAgent[name] || 0) / totalTokens,
      };
    }
    return stats;
  }

  /**
   * Phase 13 — replace the hardcoded `'not_applicable'` literal in the
   * degraded / aborted return paths with a computed value:
   *
   *   - `'insufficient_data'` when fewer than 2 agents actually spoke.
   *   - Otherwise reuse the existing inline dissent-quality heuristic
   *     (substantive dissent strings → `'captured'`, else `'missing'`).
   *
   * Note: the codebase has no dedicated dissent scorer module — the existing
   * scoring lives inline in the success path at ~line 706. We replicate that
   * heuristic here rather than reach into another file (single-file scope).
   */
  private computeDegradedDissentQuality(
    sortedAgents: Array<[string, number]>,
    dissent: string[] = []
  ): 'captured' | 'missing' | 'insufficient_data' {
    const agentsWhoSpoke = sortedAgents.filter(([, turns]) => turns > 0);
    if (agentsWhoSpoke.length < 2) return 'insufficient_data';
    try {
      const substantive = dissent.filter(
        d => d && d.toLowerCase() !== 'none' && d.length > 10
      );
      return substantive.length > 0 ? 'captured' : 'missing';
    } catch (err) {
      console.warn('[ConversationManager] dissent scorer failed in degraded path:', err);
      return 'insufficient_data';
    }
  }

  /**
   * Phase 13 Plan 04 — build MachinerySignals from existing run state.
   * Consumed by ConfidenceReconciler immediately before every return path so
   * the final result carries a single reconciled finalConfidence value.
   *
   * @param degraded Whether this is a degraded/aborted return path. Forces
   *                 aborted=true so the reconciler caps at LOW.
   * @param degradedReason Optional human-readable reason (included in reasoning).
   */
  private buildMachinerySignals(degraded: boolean, degradedReason?: string): MachinerySignals {
    // All configured agents, including those disabled by the circuit breaker —
    // the reconciler's "all agents spoke" rule is about the user's configured panel,
    // not what happened to be alive mid-run.
    const configuredAgents = Object.keys(this.agents);
    const allSpoke = configuredAgents.length > 0
      && configuredAgents.every(a => (this.turnsOverall[a] || 0) > 0);

    // Round completeness — fraction of the configured max_rounds that actually ran.
    // Using max_rounds as denominator is a conservative estimate: a run that hits
    // early consensus on round 2 of 3 still counts as roundCompleteness=2/3, which
    // matches the intent (the judge didn't get to stress-test until round 3).
    // Clamped to [0, 1].
    const denom = this.maxRounds > 0 ? this.maxRounds : 1;
    const completeness = Math.min(1, Math.max(0, this.currentRound / denom));

    return {
      aborted: degraded,
      abortReason: degradedReason,
      allAgentsSpoke: allSpoke,
      turnBalanceOk: !this.fairnessAlarmFired,
      roundCompleteness: completeness,
    };
  }

  /**
   * Normalize a free-form confidence string (from the judge) into the
   * LOW/MEDIUM/HIGH enum used by ConfidenceReconciler. Anything unrecognized
   * returns undefined so the reconciler falls back to its MEDIUM default.
   */
  private normalizeConfidence(raw: unknown): Confidence | undefined {
    if (typeof raw !== 'string') return undefined;
    const upper = raw.trim().toUpperCase();
    if (upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') {
      return upper;
    }
    return undefined;
  }

  // groupHistoryByRound, getHistoryTokenThreshold, compressHistory,
  // formatEntryAsMessage, prepareMessagesForAgent, prepareMessagesWithRoundCompression,
  // and prepareMessagesWithBudget have been extracted to ConversationHistory.
  // Access them via this.history.*

  // getChatOptions, createCallAbortController, parseStructuredOutput, getRoundForEntry,
  // buildCaseFile, prepareJudgeContext, bestEffortJudgeResult, judgeEvaluate, and conductFinalVote
  // have been extracted to JudgeEvaluator.
  // Access them via this.judgeEvaluator.*

}
