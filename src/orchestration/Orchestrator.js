/**
 * Orchestrator - Manages structured multi-agent coordination
 *
 * Implements the inter-agent communication protocol:
 * 1. Classify task and route to primary agent
 * 2. Primary agent provides initial response
 * 3. Secondary agents provide critiques
 * 4. Primary agent revises based on feedback
 * 5. Validators review final output
 * 6. Optional consensus detection via ConversationManager
 */

const TaskClassifier = require('./TaskClassifier');
const { AGENT_ROLES, getResolutionMode, requiresValidation } = require('./AgentRoles');
const ProviderFactory = require('../providers/ProviderFactory');

class Orchestrator {
  constructor(config, memoryManager = null) {
    this.config = config;
    this.memoryManager = memoryManager;
    this.agents = {};
    this.conversationHistory = [];

    this.initializeAgents();
  }

  /**
   * Initialize all agents from configuration
   */
  initializeAgents() {
    for (const [name, agentConfig] of Object.entries(this.config.agents)) {
      this.agents[name] = {
        name: name,
        provider: ProviderFactory.createProvider(agentConfig.model),
        systemPrompt: agentConfig.prompt,
        model: agentConfig.model
      };
    }

    console.log(`Initialized ${Object.keys(this.agents).length} agents: ${Object.keys(this.agents).join(', ')}`);
  }

  /**
   * Execute orchestrated conversation
   * @param {string} task - The task to accomplish
   * @param {Object} projectContext - Optional project file context
   * @returns {Object} - Result with final output and metadata
   */
  async executeTask(task, projectContext = null) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ORCHESTRATED TASK: ${task}`);
    console.log(`${'='.repeat(80)}\n`);

    // Step 1: Classify task and determine primary agent
    const availableAgents = Object.keys(this.agents);
    const classification = TaskClassifier.classify(task, availableAgents);
    console.log(`\n[Orchestrator] Task Classification:`);
    console.log(`  Primary Agent: ${classification.primaryAgent}`);
    console.log(`  Task Type: ${classification.taskType}`);
    console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
    console.log(`  Reasoning: ${classification.reasoning}\n`);

    // Build initial context
    let initialContext = this.buildInitialContext(task, projectContext);

    // Step 2: Primary agent responds
    console.log(`\n--- Phase 1: Primary Agent Response ---\n`);
    const primaryResponse = await this.getPrimaryResponse(
      classification.primaryAgent,
      task,
      initialContext
    );

    // Step 3: Secondary agents critique
    console.log(`\n--- Phase 2: Secondary Agent Critiques ---\n`);
    const critiques = await this.collectCritiques(
      classification.primaryAgent,
      primaryResponse,
      task,
      initialContext
    );

    // Step 4: Primary agent revises
    console.log(`\n--- Phase 3: Primary Agent Revision ---\n`);
    const revisedResponse = await this.getRevision(
      classification.primaryAgent,
      primaryResponse,
      critiques,
      task,
      initialContext
    );

    // Step 5: Validation gates
    let finalOutput = revisedResponse;
    if (requiresValidation(task)) {
      console.log(`\n--- Phase 4: Validation Gates ---\n`);
      const validationResults = await this.runValidation(
        revisedResponse,
        task,
        initialContext
      );

      finalOutput = {
        content: revisedResponse,
        validations: validationResults
      };
    }

    // Record in memory
    if (this.memoryManager && this.memoryManager.projectMemory) {
      await this.recordInMemory(task, classification, finalOutput);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`ORCHESTRATION COMPLETE`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      task,
      classification,
      primaryResponse,
      critiques,
      revisedResponse,
      validations: finalOutput.validations || null,
      finalOutput: typeof finalOutput === 'string' ? finalOutput : finalOutput.content,
      conversationHistory: this.conversationHistory
    };
  }

  /**
   * Build initial context from memory and project files
   */
  buildInitialContext(task, projectContext) {
    let context = '';

    // Add project memory if available
    if (this.memoryManager && this.memoryManager.projectMemory) {
      const memoryContext = this.memoryManager.getRelevantMemory(task);
      if (memoryContext) {
        context += memoryContext;
        context += '\n---\n\n';
      }
    }

    // Add project file context if provided
    if (projectContext) {
      context += projectContext.formatContext();
      context += '\n---\n\n';
    }

    return context;
  }

  /**
   * Get primary agent's initial response
   */
  async getPrimaryResponse(agentName, task, context) {
    const agent = this.agents[agentName];
    if (!agent) {
      throw new Error(`Agent ${agentName} not found in configuration`);
    }

    console.log(`[${agentName} (${agent.model}) is responding...]\n`);

    const prompt = `${context}Task: ${task}\n\nAs the primary agent for this task, provide your initial response. Be comprehensive but concise.`;

    const messages = [{ role: 'user', content: prompt }];

    try {
      const response = await agent.provider.chat(messages, agent.systemPrompt);
      console.log(`${agentName}:\n${response}\n`);

      this.conversationHistory.push({
        phase: 'primary_response',
        agent: agentName,
        content: response,
        role: 'primary'
      });

      return response;
    } catch (error) {
      console.error(`Error with ${agentName}: ${error.message}`);
      return `[Error: Unable to get response from ${agentName}]`;
    }
  }

  /**
   * Collect critiques from secondary agents
   */
  async collectCritiques(primaryAgent, primaryResponse, task, context) {
    const availableAgents = Object.keys(this.agents);
    const secondaryAgents = TaskClassifier.getSecondaryAgents(primaryAgent, availableAgents);
    const critiques = [];

    for (const agentName of secondaryAgents) {
      const agent = this.agents[agentName];
      if (!agent) continue;

      console.log(`[${agentName} (${agent.model}) is critiquing...]\n`);

      const critiquePrompt = `${context}Task: ${task}

Primary Agent (${primaryAgent}) Response:
${primaryResponse}

As a secondary agent, provide a structured critique:
1. Concise critique (1-3 sentences)
2. Specific improvement suggestion
3. One clarifying question (if needed)
4. Agreement: Do you agree with the overall direction? (Yes/No/Partial)

Keep your critique constructive and focused.`;

      const messages = [{ role: 'user', content: critiquePrompt }];

      try {
        const critique = await agent.provider.chat(messages, agent.systemPrompt);
        console.log(`${agentName} Critique:\n${critique}\n`);

        critiques.push({
          agent: agentName,
          content: critique
        });

        this.conversationHistory.push({
          phase: 'critique',
          agent: agentName,
          content: critique,
          role: 'secondary'
        });

      } catch (error) {
        console.error(`Error with ${agentName}: ${error.message}`);
      }
    }

    return critiques;
  }

  /**
   * Get revised response from primary agent
   */
  async getRevision(primaryAgent, originalResponse, critiques, task, context) {
    const agent = this.agents[primaryAgent];

    console.log(`[${primaryAgent} is revising based on feedback...]\n`);

    const critiquesSummary = critiques
      .map(c => `${c.agent}:\n${c.content}`)
      .join('\n\n---\n\n');

    const revisionPrompt = `${context}Task: ${task}

Your Original Response:
${originalResponse}

Critiques from Secondary Agents:
${critiquesSummary}

Based on the feedback above, provide a revised response. Incorporate valid suggestions while maintaining your domain expertise. Be clear about what you changed and why.`;

    const messages = [{ role: 'user', content: revisionPrompt }];

    try {
      const revision = await agent.provider.chat(messages, agent.systemPrompt);
      console.log(`${primaryAgent} Revised Response:\n${revision}\n`);

      this.conversationHistory.push({
        phase: 'revision',
        agent: primaryAgent,
        content: revision,
        role: 'primary'
      });

      return revision;
    } catch (error) {
      console.error(`Error with ${primaryAgent}: ${error.message}`);
      return originalResponse; // Fallback to original
    }
  }

  /**
   * Run validation gates
   */
  async runValidation(content, task, context) {
    const availableAgents = Object.keys(this.agents);
    const validators = TaskClassifier.getValidators(availableAgents);
    const validationResults = [];

    for (const validatorName of validators) {
      const agent = this.agents[validatorName];
      if (!agent) continue;

      console.log(`[${validatorName} is validating...]\n`);

      const validationPrompt = `${context}Task: ${task}

Proposed Output:
${content}

As a validator, review the above output for your domain concerns. Provide:
1. Status: PASS / FAIL / NEEDS_REVISION
2. Issues found (if any)
3. Recommendations for improvement (if any)

Be thorough but concise.`;

      const messages = [{ role: 'user', content: validationPrompt }];

      try {
        const validation = await agent.provider.chat(messages, agent.systemPrompt);
        console.log(`${validatorName} Validation:\n${validation}\n`);

        const status = this.extractValidationStatus(validation);

        validationResults.push({
          validator: validatorName,
          status,
          content: validation
        });

        this.conversationHistory.push({
          phase: 'validation',
          agent: validatorName,
          content: validation,
          role: 'validator',
          status
        });

      } catch (error) {
        console.error(`Error with ${validatorName}: ${error.message}`);
      }
    }

    return validationResults;
  }

  /**
   * Extract validation status from response
   */
  extractValidationStatus(response) {
    const upper = response.toUpperCase();
    if (upper.includes('STATUS: PASS') || upper.includes('PASS')) return 'PASS';
    if (upper.includes('STATUS: FAIL') || upper.includes('FAIL')) return 'FAIL';
    if (upper.includes('STATUS: NEEDS_REVISION') || upper.includes('NEEDS_REVISION')) return 'NEEDS_REVISION';
    return 'UNKNOWN';
  }

  /**
   * Record conversation in project memory
   */
  async recordInMemory(task, classification, finalOutput) {
    try {
      await this.memoryManager.recordConversation({
        task,
        agents: Object.keys(this.agents),
        consensusReached: true,
        rounds: 1,
        primaryAgent: classification.primaryAgent,
        taskType: classification.taskType
      });

      // Record as a decision if it's a significant outcome
      if (classification.confidence > 0.6) {
        const availableAgents = Object.keys(this.agents);
        await this.memoryManager.recordDecision({
          topic: classification.taskType,
          description: task,
          outcome: typeof finalOutput === 'string' ? finalOutput : finalOutput.content,
          participants: [classification.primaryAgent],
          validators: TaskClassifier.getValidators(availableAgents),
          consensusReached: true
        });
      }
    } catch (error) {
      console.error(`Warning: Failed to record in memory: ${error.message}`);
    }
  }
}

module.exports = Orchestrator;
