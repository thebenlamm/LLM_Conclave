import ProviderFactory from '../providers/ProviderFactory';

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

  constructor(config: any, memoryManager: any = null) {
    this.config = config;
    this.agents = {};
    this.agentOrder = [];
    this.conversationHistory = [];
    this.currentRound = 0;
    this.maxRounds = config.max_rounds || 20;
    this.memoryManager = memoryManager;

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

      // Each agent takes a turn
      for (const agentName of this.agentOrder) {
        await this.agentTurn(agentName);
      }

      // Judge evaluates consensus
      console.log(`\n[Judge is evaluating consensus...]\n`);
      const judgeResult = await this.judgeEvaluate(judge);

      if (judgeResult.consensusReached) {
        consensusReached = true;
        finalSolution = judgeResult.solution;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CONSENSUS REACHED after ${this.currentRound} rounds!`);
        console.log(`${'='.repeat(80)}\n`);
        break;
      } else {
        console.log(`Judge: ${judgeResult.guidance}\n`);

        // Add judge's guidance to conversation history
        this.conversationHistory.push({
          role: 'user',
          content: `Judge's guidance: ${judgeResult.guidance}`,
          speaker: 'Judge'
        });
      }
    }

    // If max rounds reached without consensus, conduct final vote
    if (!consensusReached) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Maximum rounds (${this.maxRounds}) reached without consensus.`);
      console.log(`Conducting final vote...`);
      console.log(`${'='.repeat(80)}\n`);

      finalSolution = await this.conductFinalVote(judge);
    }

    const result = {
      task: task,
      rounds: this.currentRound,
      consensusReached: consensusReached,
      solution: finalSolution,
      conversationHistory: this.conversationHistory
    };

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

    try {
      // Prepare messages for the agent
      const messages = this.prepareMessagesForAgent();

      // Get agent's response
      const response = await agent.provider.chat(messages, agent.systemPrompt);

      console.log(`${agentName}: ${response}\n`);

      // Add to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        speaker: agentName,
        model: agent.model
      });

    } catch (error: any) {
      console.error(`Error with agent ${agentName}: ${error.message}`);

      // Add error to history
      this.conversationHistory.push({
        role: 'assistant',
        content: `[Error: Unable to respond - ${error.message}]`,
        speaker: agentName,
        model: agent.model,
        error: true
      });
    }
  }

  /**
   * Prepare message array for an agent from conversation history
   * @returns {Array} - Array of messages in OpenAI format
   */
  prepareMessagesForAgent() {
    return this.conversationHistory.map(entry => ({
      role: entry.role === 'user' ? 'user' : 'assistant',
      content: entry.speaker !== 'System' ? `${entry.speaker}: ${entry.content}` : entry.content
    }));
  }

  /**
   * Judge evaluates if consensus has been reached
   * @param {Object} judge - Judge instance
   * @returns {Object} - { consensusReached: boolean, solution?: string, guidance?: string }
   */
  async judgeEvaluate(judge: any) {
    try {
      // Prepare context for judge
      const recentDiscussion = this.conversationHistory
        .slice(-this.agentOrder.length * 2) // Last 2 rounds
        .map(entry => `${entry.speaker}: ${entry.content}`)
        .join('\n\n');

      const judgePrompt = `
Recent discussion:
${recentDiscussion}

Based on the above discussion, have the agents reached sufficient consensus on the task?
If yes, respond with "CONSENSUS_REACHED" on the first line, followed by a summary of the agreed-upon solution.
If no, provide brief guidance (2-3 sentences) to help the agents converge toward a solution.`;

      const messages = [
        {
          role: 'user',
          content: judgePrompt
        }
      ];

      const response = await judge.provider.chat(messages, judge.systemPrompt);

      // Check if consensus reached
      if (response.includes('CONSENSUS_REACHED')) {
        const solution = response.replace('CONSENSUS_REACHED', '').trim();
        return {
          consensusReached: true,
          solution: solution
        };
      }

      return {
        consensusReached: false,
        guidance: response
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

      const finalDecision = await judge.provider.chat(messages, judge.systemPrompt);

      console.log(`\nJudge's Final Decision:\n${finalDecision}\n`);

      return finalDecision;

    } catch (error: any) {
      console.error(`Error conducting final vote: ${error.message}`);
      return 'Unable to reach a final decision due to an error.';
    }
  }
}
