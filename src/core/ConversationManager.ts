import ProviderFactory from '../providers/ProviderFactory';
import { EventBus } from './EventBus';
import { SpeakerSelector, AgentInfo } from './SpeakerSelector';
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

  constructor(
    config: any,
    memoryManager: any = null,
    streamOutput: boolean = false,
    eventBus?: EventBus,
    dynamicSelection: boolean = false,
    selectorModel: string = DEFAULT_SELECTOR_MODEL
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

      // Judge evaluates consensus
      console.log(`\n[Judge is evaluating consensus...]\n`);
      if (this.eventBus) {
        this.eventBus.emitEvent('agent:thinking', { agent: 'Judge', model: judge.model });
      }

      const judgeResult = await this.judgeEvaluate(judge);

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
    const agent = this.agents[agentName];

    console.log(`[${agentName} (${agent.model}) is thinking...]\n`);
    if (this.streamOutput) {
      console.log(`${agentName}:`);
    }
    
    if (this.eventBus) {
        this.eventBus.emitEvent('agent:thinking', { agent: agentName, model: agent.model });
    }

    try {
      // Prepare messages for the agent
      const messages = this.prepareMessagesForAgent();

      // Get agent's response
      const response = await agent.provider.chat(messages, agent.systemPrompt, this.getChatOptions(agentName));
      const text = typeof response === 'string' ? response : response.text;

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

    } catch (error: any) {
      console.error(`Error with agent ${agentName}: ${error.message}`);
      if (this.eventBus) {
        this.eventBus.emitEvent('error', { message: `Error with agent ${agentName}: ${error.message}` });
      }

      // Extract provider and status from error message for cleaner display
      const errorMsg = error.message || 'Unknown error';
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
      this.conversationHistory.push({
        role: 'assistant',
        content: `[⚠️ ${agentName} unavailable: ${friendlyError}]`,
        speaker: agentName,
        model: agent.model,
        error: true,
        errorDetails: errorMsg
      });
    }
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
    const failedAgentsThisRound: Set<string> = new Set();

    let lastSpeaker: string | null = null;
    let lastResponse: string | null = null;
    let turnCount = 0;
    
    // Safety limit: allow more turns than agents to enable back-and-forth
    // Default to 20 or 3x agent count, whichever is higher, to prevent infinite loops
    const maxTurnsPerRound = Math.max(20, this.agentOrder.length * 3);

    while (turnCount < maxTurnsPerRound) {
      // Select next speaker
      const selection = await this.speakerSelector.selectNextSpeaker(
        this.conversationHistory,
        lastSpeaker,
        lastResponse,
        this.currentRound,
        task,
        failedAgentsThisRound
      );

      // Check if round should end
      if (!selection.shouldContinue) {
        console.log(`[Round ${this.currentRound} complete: ${selection.reason}]`);
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
        }
      }

      // Record turn
      this.speakerSelector.recordTurn(agentName);
      turnCount++;
    }

    if (turnCount >= maxTurnsPerRound) {
      console.log(`[Round ${this.currentRound} ended: safety limit (${maxTurnsPerRound} turns) reached]`);
    }
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
   * Build chat options with streaming callbacks when enabled
   */
  getChatOptions(agentName?: string) {
    if (this.streamOutput || this.eventBus) {
        return {
            stream: true,
            onToken: (token: string) => {
                if (this.streamOutput) process.stdout.write(token);
                if (this.eventBus && agentName) {
                    this.eventBus.emitEvent('token', { agent: agentName, token });
                }
            }
        };
    }
    return {};
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
      const roundContext = this.currentRound > 2 ? `\n\nNote: This is round ${this.currentRound}. ` +
        (isShallowAgreement ? 'The agents appear to be agreeing superficially. Push them to challenge assumptions, explore edge cases, or identify weaknesses that haven\'t been addressed.' : '') : '';

      const judgePrompt = `
Full discussion (all rounds):
${this.cachedRecentDiscussion}
${roundContext}

Evaluate whether the agents have reached GENUINE consensus. True consensus requires:
1. Specific, actionable recommendations (not vague agreement)
2. Trade-offs acknowledged and resolved
3. Potential objections addressed (not just glossed over)
4. Each agent contributing distinct value (not just echoing others)

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
      console.error(`Error with judge evaluation: ${error.message}`);
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
      const fullDiscussion = this.conversationHistory
        .map(entry => `${entry.speaker}: ${entry.content}`)
        .join('\n\n');

      const votePrompt = `
The agents have discussed the following task but haven't reached full consensus within the allowed rounds:

Full discussion:
${fullDiscussion}

As the judge, please analyze the discussion trajectory and determine the DIRECTION the agents were heading.

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
      const text = typeof finalDecision === 'string' ? finalDecision : finalDecision.text;

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
      console.error(`Error conducting final vote: ${error.message}`);
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
