import ProviderFactory from '../providers/ProviderFactory';
import { EventBus } from './EventBus';

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
  memoryManager: any;

  streamOutput: boolean;
  eventBus?: EventBus;

  // Performance optimizations: message caching
  private messageCache: any[] = [];
  private lastCacheUpdateIndex: number = 0;
  private cachedRecentDiscussion: string = '';
  private lastJudgeCacheRound: number = 0;

  constructor(config: any, memoryManager: any = null, streamOutput: boolean = false, eventBus?: EventBus) {
    this.config = config;
    this.agents = {};
    this.agentOrder = [];
    this.conversationHistory = [];
    this.currentRound = 0;
    this.maxRounds = config.max_rounds || 20;
    this.memoryManager = memoryManager;
    this.streamOutput = streamOutput;
    this.eventBus = eventBus;

    this.initializeAgents();
  }

  /**
   * Initialize all agents from configuration
   */
  initializeAgents() {
    for (const [name, agentConfig] of Object.entries(this.config.agents) as [string, any][]) {
      this.agents[name] = {
        name: name,
        provider: ProviderFactory.createProvider(agentConfig.model),
        systemPrompt: agentConfig.prompt,
        model: agentConfig.model
      };
      this.agentOrder.push(name);
    }

    console.log(`Initialized ${this.agentOrder.length} agents: ${this.agentOrder.join(', ')}`);
    if (this.eventBus) {
      this.eventBus.emitEvent('status', { message: `Initialized ${this.agentOrder.length} agents` });
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
    let finalSolution = null;

    // Main conversation loop
    while (this.currentRound < this.maxRounds && !consensusReached) {
      this.currentRound++;
      console.log(`\n--- Round ${this.currentRound} ---\n`);
      
      if (this.eventBus) {
        this.eventBus.emitEvent('round:start', { round: this.currentRound });
      }

      // Each agent takes a turn
      for (const agentName of this.agentOrder) {
        await this.agentTurn(agentName);
      }

      // Judge evaluates consensus
      console.log(`\n[Judge is evaluating consensus...]\n`);
      if (this.eventBus) {
        this.eventBus.emitEvent('agent:thinking', { agent: 'Judge', model: judge.model });
      }

      const judgeResult = await this.judgeEvaluate(judge);

      if (judgeResult.consensusReached) {
        consensusReached = true;
        finalSolution = judgeResult.solution;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CONSENSUS REACHED after ${this.currentRound} rounds!`);
        console.log(`${'='.repeat(80)}\n`);
        
        if (this.eventBus) {
            this.eventBus.emitEvent('status', { message: `Consensus reached after ${this.currentRound} rounds` });
        }
        break;
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

      finalSolution = await this.conductFinalVote(judge);
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
   * Judge evaluates if consensus has been reached
   * Uses cached recent discussion to avoid rebuilding every time
   * @param {Object} judge - Judge instance
   * @returns {Object} - { consensusReached: boolean, solution?: string, guidance?: string }
   */
  async judgeEvaluate(judge: any) {
    try {
      // Cache formatted recent discussion instead of rebuilding each time
      if (!this.cachedRecentDiscussion || this.lastJudgeCacheRound !== this.currentRound) {
        this.cachedRecentDiscussion = this.conversationHistory
          .slice(-this.agentOrder.length * 2) // Last 2 rounds
          .map(entry => `${entry.speaker}: ${entry.content}`)
          .join('\n\n');

        this.lastJudgeCacheRound = this.currentRound;
      }

      const judgePrompt = `
Recent discussion:
${this.cachedRecentDiscussion}

Based on the above discussion, have the agents reached sufficient consensus on the task?
If yes, respond with "CONSENSUS_REACHED" on the first line, followed by a summary of the agreed-upon solution.
If no, provide brief guidance (2-3 sentences) to help the agents converge toward a solution.`;

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
        const solution = text.replace('CONSENSUS_REACHED', '').trim();
        return {
          consensusReached: true,
          solution: solution
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
   * @returns {string} - Final solution
   */
  async conductFinalVote(judge: any) {
    try {
      const fullDiscussion = this.conversationHistory
        .map(entry => `${entry.speaker}: ${entry.content}`)
        .join('\n\n');

      const votePrompt = `
The agents have discussed the following task but haven't reached full consensus within the allowed rounds:

Full discussion:
${fullDiscussion}

As the judge, please analyze all perspectives and synthesize the best solution based on the discussion. Provide a final decision that incorporates the strongest ideas from each agent.`;

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

      console.log(`\nJudge's Final Decision:\n${text}\n`);

      return text;

    } catch (error: any) {
      console.error(`Error conducting final vote: ${error.message}`);
      return 'Unable to reach a final decision due to an error.';
    }
  }
}
