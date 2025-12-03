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

import TaskClassifier from './TaskClassifier';
import { requiresValidation } from './AgentRoles';
import ProviderFactory from '../providers/ProviderFactory';
import ToolRegistry from '../tools/ToolRegistry';
import MemoryManager from '../memory/MemoryManager';
import {
  Config,
  Agent,
  ConversationHistoryEntry,
  ToolExecution,
  OrchestratorOptions,
  OrchestrationResult
} from '../types';

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
export default class Orchestrator {
  config: Config;
  memoryManager: MemoryManager | null;
  agents: Record<string, Agent>;
  conversationHistory: ConversationHistoryEntry[];
  toolRegistry: ToolRegistry;
  toolExecutions: ToolExecution[];
  streamOutput: boolean;

  constructor(config: Config, memoryManager: MemoryManager | null = null, streamOutput: boolean = false) {
    this.config = config;
    this.memoryManager = memoryManager;
    this.agents = {};
    this.conversationHistory = [];
    this.toolRegistry = new ToolRegistry();
    this.toolExecutions = []; // Track tool executions for output
    this.streamOutput = streamOutput;

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
    }

    console.log(`Initialized ${Object.keys(this.agents).length} agents: ${Object.keys(this.agents).join(', ')}`);
  }

  /**
   * Build chat options with streaming callbacks when enabled
   */
  getChatOptions(disableStream: boolean = false) {
    if (disableStream || !this.streamOutput) return {};
    return { stream: true, onToken: (token: string) => process.stdout.write(token) };
  }

  /**
   * Execute orchestrated conversation
   * @param task - The task to accomplish
   * @param projectContext - Optional project file context
   * @param options - Execution options with quiet mode and status callback
   * @returns Result with final output and metadata
   */
  async executeTask(task: string, projectContext: any = null, options: OrchestratorOptions = {}): Promise<OrchestrationResult> {
    const { quiet = false, onStatus = undefined } = options;

    if (!quiet) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`ORCHESTRATED TASK: ${task}`);
      console.log(`${'='.repeat(80)}\n`);
    }

    // Step 1: Classify task and determine primary agent
    const availableAgents = Object.keys(this.agents);
    const classification = TaskClassifier.classify(task, availableAgents);

    if (!quiet) {
      console.log(`\n[Orchestrator] Task Classification:`);
      console.log(`  Primary Agent: ${classification.primaryAgent}`);
      console.log(`  Task Type: ${classification.taskType}`);
      console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
      console.log(`  Reasoning: ${classification.reasoning}\n`);
    }

    // Build initial context
    let initialContext = this.buildInitialContext(task, projectContext);

    // Step 2: Primary agent responds
    if (onStatus) onStatus(1, 4, `${classification.primaryAgent} analyzing...`);
    if (!quiet) console.log(`\n--- Phase 1: Primary Agent Response ---\n`);

    const primaryResponse = await this.getPrimaryResponse(
      classification.primaryAgent,
      task,
      initialContext,
      quiet
    );

    // Step 3: Secondary agents critique
    if (onStatus) onStatus(2, 4, 'Collecting critiques...');
    if (!quiet) console.log(`\n--- Phase 2: Secondary Agent Critiques ---\n`);

    const critiques = await this.collectCritiques(
      classification.primaryAgent,
      primaryResponse,
      task,
      initialContext,
      quiet
    );

    // Step 4: Primary agent revises
    if (onStatus) onStatus(3, 4, 'Refining response...');
    if (!quiet) console.log(`\n--- Phase 3: Primary Agent Revision ---\n`);

    const revisedResponse = await this.getRevision(
      classification.primaryAgent,
      primaryResponse,
      critiques,
      task,
      initialContext,
      quiet
    );

    // Step 5: Validation gates
    let finalOutput: any = revisedResponse;
    if (requiresValidation(task)) {
      if (onStatus) onStatus(4, 4, 'Running validation...');
      if (!quiet) console.log(`\n--- Phase 4: Validation Gates ---\n`);

      const validationResults = await this.runValidation(
        revisedResponse,
        task,
        initialContext,
        quiet
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

    if (!quiet) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`ORCHESTRATION COMPLETE`);
      console.log(`${'='.repeat(80)}\n`);
    }

    const outputContent = typeof finalOutput === 'string' ? finalOutput : finalOutput.content;

    return {
      task,
      classification,
      primaryResponse,
      critiques,
      revisedResponse,
      validations: finalOutput.validations || null,
      output: outputContent,
      finalOutput: outputContent,
      conversationHistory: this.conversationHistory,
      toolExecutions: this.toolExecutions // Include tool execution summary
    };
  }

  /**
   * Build initial context from memory and project files
   */
  buildInitialContext(task: string, projectContext: any): string {
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
   * Execute agent with tool support (handles tool calling loop)
   */
  async executeAgentWithTools(agent: any, messages: any[], quiet: boolean = false): Promise<string | null> {
    const tools = this.toolRegistry.getAnthropicTools(); // Works for both Anthropic and OpenAI
    let currentMessages = [...messages];
    let finalText: string | null = null;
    const maxIterations = 25; // Prevent infinite loops (increased for iterative tasks)
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Call agent with tools
      // Grok and Mistral use OpenAI format since they're OpenAI-compatible
      const providerName = agent.provider.getProviderName();
      const useOpenAIFormat = providerName === 'OpenAI' || providerName === 'Grok' || providerName === 'Mistral';
      const response = await agent.provider.chat(
        currentMessages,
        agent.systemPrompt,
        { tools: useOpenAIFormat ? this.toolRegistry.getOpenAITools() : tools, ...this.getChatOptions(true) }
      );

      // Check if response has tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Add the assistant's message with tool_use blocks first
        // This is required by Claude - tool_result must follow tool_use
        currentMessages.push({
          role: 'assistant',
          content: response.text || '',
          tool_calls: response.tool_calls
        });

        // Execute each tool and add results
        for (const toolCall of response.tool_calls) {
          const result = await this.toolRegistry.executeTool(toolCall.name, toolCall.input);

          // Track tool execution for output
          this.toolExecutions.push({
            agent: agent.name,
            tool: toolCall.name,
            input: toolCall.input,
            success: result.success,
            summary: result.summary || result.error || 'Tool executed'
          });

          if (!quiet) {
            console.log(`  ✓ ${result.summary || result.error}`);
          }

          // Add tool result to messages
          currentMessages.push({
            role: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.success ? result.result : `Error: ${result.error}`
          });
        }

        // Continue loop to get agent's next response
        continue;
      }

      // No tool calls - agent is done
      finalText = response.text;
      break;
    }

    if (iterations >= maxIterations) {
      throw new Error('Tool calling loop exceeded maximum iterations');
    }

    return finalText;
  }

  /**
   * Get primary agent's initial response
   */
  async getPrimaryResponse(agentName: string, task: string, context: string, quiet: boolean = false): Promise<string> {
    const agent = this.agents[agentName];
    if (!agent) {
      throw new Error(`Agent ${agentName} not found in configuration`);
    }

    if (!quiet) {
      console.log(`[${agentName} (${agent.model}) is responding...]\n`);
    }

    const prompt = `${context}Task: ${task}\n\nAs the primary agent for this task, provide your initial response. Be comprehensive but concise.

You have access to tools to read and write files, list files, edit files, and run commands. Use these tools to take concrete actions rather than just discussing what should be done.

Important: Once you've read a file, you have access to its complete contents in the conversation history. If you need additional context from a file you've already read, refer back to that content rather than requesting more information.`;

    const messages = [{ role: 'user', content: prompt }];

    try {
      const response = await this.executeAgentWithTools(agent, messages, quiet);

      if (!quiet && response) {
        console.log(`${agentName}:\n${response}\n`);
      }

      this.conversationHistory.push({
        phase: 'primary_response',
        agent: agentName,
        content: response || '[Agent used tools only]',
        role: 'primary'
      });

      return response || '[Agent completed task using tools]';
    } catch (error: any) {
      console.error(`Error with ${agentName}: ${error.message}`);
      return `[Error: Unable to get response from ${agentName}]`;
    }
  }

  /**
   * Collect critiques from secondary agents
   */
  async collectCritiques(primaryAgent: string, primaryResponse: string, task: string, context: string, quiet: boolean = false): Promise<any[]> {
    const availableAgents = Object.keys(this.agents);
    const secondaryAgents = TaskClassifier.getSecondaryAgents(primaryAgent, availableAgents);
    const critiques: any[] = [];

    for (const agentName of secondaryAgents) {
      const agent = this.agents[agentName];
      if (!agent) continue;

      if (!quiet) {
        console.log(`[${agentName} (${agent.model}) is critiquing...]\n`);
      }

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
      const response = await agent.provider.chat(messages, agent.systemPrompt, this.getChatOptions());
        const critique = typeof response === 'string' ? response : response.text;

        if (!quiet) {
          console.log(`${agentName} Critique:\n${critique}\n`);
        }

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

      } catch (error: any) {
        if (!quiet) {
          console.error(`Error with ${agentName}: ${error.message}`);
        }
      }
    }

    return critiques;
  }

  /**
   * Get revised response from primary agent
   */
  async getRevision(primaryAgent: string, originalResponse: string, critiques: any[], task: string, context: string, quiet: boolean = false): Promise<string> {
    const agent = this.agents[primaryAgent];

    if (!quiet) {
      console.log(`[${primaryAgent} is revising based on feedback...]\n`);
    }

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
      const response = await agent.provider.chat(messages, agent.systemPrompt, this.getChatOptions());
      const revision = typeof response === 'string' ? response : response.text;

      if (!quiet) {
        if (this.streamOutput) {
          process.stdout.write('\n');
        } else {
          console.log(`${primaryAgent} Revised Response:\n${revision}\n`);
        }
      }

      this.conversationHistory.push({
        phase: 'revision',
        agent: primaryAgent,
        content: revision,
        role: 'primary'
      });

      return revision;
    } catch (error: any) {
      if (!quiet) {
        console.error(`Error with ${primaryAgent}: ${error.message}`);
      }
      return originalResponse; // Fallback to original
    }
  }

  /**
   * Run validation gates
   */
  async runValidation(content: string, task: string, context: string, quiet: boolean = false): Promise<any[]> {
    const availableAgents = Object.keys(this.agents);
    const validators = TaskClassifier.getValidators(availableAgents);
    const validationResults: any[] = [];

    for (const validatorName of validators) {
      const agent = this.agents[validatorName];
      if (!agent) continue;

      if (!quiet) {
        console.log(`[${validatorName} is validating...]\n`);
      }

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
        const response = await agent.provider.chat(messages, agent.systemPrompt, this.getChatOptions());
        const validation = typeof response === 'string' ? response : response.text;

        if (!quiet) {
          if (this.streamOutput) {
            process.stdout.write('\n');
          } else {
            console.log(`${validatorName} Validation:\n${validation}\n`);
          }
        }

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

      } catch (error: any) {
        if (!quiet) {
          console.error(`Error with ${validatorName}: ${error.message}`);
        }
      }
    }

    return validationResults;
  }

  /**
   * Extract validation status from response
   */
  extractValidationStatus(response: string): string {
    const upper = response.toUpperCase();
    if (upper.includes('STATUS: PASS') || upper.includes('PASS')) return 'PASS';
    if (upper.includes('STATUS: FAIL') || upper.includes('FAIL')) return 'FAIL';
    if (upper.includes('STATUS: NEEDS_REVISION') || upper.includes('NEEDS_REVISION')) return 'NEEDS_REVISION';
    return 'UNKNOWN';
  }

  /**
   * Record conversation in project memory
   */
  async recordInMemory(task: string, classification: any, finalOutput: any): Promise<void> {
    if (!this.memoryManager) return;

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
    } catch (error: any) {
      console.error(`Warning: Failed to record in memory: ${error.message}`);
    }
  }
}
