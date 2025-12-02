import { Agent } from '../types';
import ToolRegistry from '../tools/ToolRegistry';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Iterative Collaborative Orchestrator
 *
 * Enables multi-turn discussions within chunks where agents can respond to each other.
 * Key features:
 * - Processes work in configurable chunks (e.g., 3 lines at a time)
 * - Multiple rounds of discussion per chunk
 * - Each agent maintains their own state/notes file
 * - Only judge/coordinator writes to shared output files
 * - Shared state builds cumulatively across chunks
 */
export default class IterativeCollaborativeOrchestrator {
  agents: Agent[];
  judge: Agent;
  toolRegistry: ToolRegistry;
  chunkSize: number;
  maxRoundsPerChunk: number;
  agentStateFiles: Map<string, string>;
  sharedOutputFile: string;
  outputDir: string;
  conversationHistory: any[];
  toolExecutions: any[];

  constructor(
    agents: Agent[],
    judge: Agent,
    toolRegistry: ToolRegistry,
    options: {
      chunkSize?: number;
      maxRoundsPerChunk?: number;
      outputDir?: string;
      sharedOutputFile?: string;
    } = {}
  ) {
    this.agents = agents;
    this.judge = judge;
    this.toolRegistry = toolRegistry;
    this.chunkSize = options.chunkSize || 3;
    this.maxRoundsPerChunk = options.maxRoundsPerChunk || 5;
    this.outputDir = options.outputDir || './outputs/iterative';
    this.sharedOutputFile = options.sharedOutputFile || 'shared_output.md';
    this.agentStateFiles = new Map();
    this.conversationHistory = [];
    this.toolExecutions = [];

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Initialize agent state files
    this.initializeAgentStateFiles();
  }

  /**
   * Initialize state files for each agent
   */
  private initializeAgentStateFiles(): void {
    for (const agent of this.agents) {
      const stateFilePath = path.join(this.outputDir, `${agent.name}_notes.md`);
      this.agentStateFiles.set(agent.name, stateFilePath);

      // Create initial state file
      fs.writeFileSync(stateFilePath, `# ${agent.name} - Working Notes\n\n`);
    }
  }

  /**
   * Main orchestration method - processes task in chunks with multi-turn discussions
   */
  async run(task: string, projectContext?: string): Promise<void> {
    console.log('\n=== Iterative Collaborative Mode ===');
    console.log(`Chunk size: ${this.chunkSize}`);
    console.log(`Max rounds per chunk: ${this.maxRoundsPerChunk}`);
    console.log(`Agents: ${this.agents.map(a => a.name).join(', ')}`);
    console.log(`Judge: ${this.judge.name}\n`);

    // Initialize shared output file
    const sharedOutputPath = path.join(this.outputDir, this.sharedOutputFile);
    fs.writeFileSync(sharedOutputPath, `# Collaborative Output\n\nTask: ${task}\n\n---\n\n`);

    // Ask judge to break down the task into chunks
    const chunks = await this.planChunks(task, projectContext);

    // Process each chunk with multi-turn discussion
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n📦 Processing Chunk ${i + 1}/${chunks.length}: ${chunk.description}`);

      const chunkResult = await this.discussChunk(chunk, i + 1, projectContext);

      // Judge writes result to shared output
      await this.updateSharedOutput(chunkResult, i + 1, chunk.description);

      console.log(`✅ Chunk ${i + 1} completed\n`);
    }

    console.log('\n🎉 All chunks processed successfully!');
    console.log(`\nOutputs:`);
    console.log(`  Shared output: ${sharedOutputPath}`);
    for (const [agentName, filePath] of this.agentStateFiles) {
      console.log(`  ${agentName} notes: ${filePath}`);
    }
  }

  /**
   * Ask judge to break down task into manageable chunks
   */
  private async planChunks(task: string, projectContext?: string): Promise<any[]> {
    console.log('🎯 Planning chunks...');

    const planningPrompt = `You are coordinating a collaborative task. Break down the following task into ${this.chunkSize}-sized chunks that can be discussed iteratively.

Task: ${task}

${projectContext ? `Project Context:\n${projectContext}\n` : ''}

Provide a JSON array of chunks, where each chunk has:
- description: Brief description of what this chunk involves
- details: Specific information needed for agents to work on this chunk

Example format:
\`\`\`json
[
  {
    "description": "Lines 1-3 of oz.txt",
    "details": "Correct Hebrew OCR errors in the first 3 lines"
  },
  {
    "description": "Lines 4-6 of oz.txt",
    "details": "Correct Hebrew OCR errors in lines 4-6"
  }
]
\`\`\`

Return ONLY the JSON array, nothing else.`;

    const response = await this.judge.provider.chat(
      [{ role: 'user', content: planningPrompt }],
      this.judge.systemPrompt
    );

    // Extract JSON from response
    const responseText = response.text || '';
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || responseText.match(/```\n?([\s\S]*?)\n?```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : responseText;

    try {
      const chunks = JSON.parse(jsonStr.trim());
      console.log(`  Planned ${chunks.length} chunks\n`);
      return chunks;
    } catch (error) {
      throw new Error(`Failed to parse chunks from judge response: ${error}`);
    }
  }

  /**
   * Multi-turn discussion for a single chunk
   * Agents can respond to each other over multiple rounds
   */
  private async discussChunk(chunk: any, chunkNumber: number, projectContext?: string): Promise<string> {
    const chunkMessages: any[] = [];

    // Initial context message
    const contextMessage = `Working on chunk ${chunkNumber}: ${chunk.description}

${chunk.details}

${projectContext ? `Project Context:\n${projectContext}\n` : ''}

Collaborate with other agents to complete this chunk. You can read from and write to your own notes file, but only the judge will write to the shared output.`;

    for (let round = 1; round <= this.maxRoundsPerChunk; round++) {
      console.log(`\n  Round ${round}/${this.maxRoundsPerChunk}:`);

      // Each agent gets a turn to contribute
      for (const agent of this.agents) {
        console.log(`    💬 ${agent.name}...`);

        // Build agent's context: chunk description + conversation history + their state file
        const agentStateContent = fs.readFileSync(this.agentStateFiles.get(agent.name)!, 'utf-8');

        const agentMessages = [
          { role: 'user', content: contextMessage },
          ...chunkMessages,
          {
            role: 'user',
            content: round === 1
              ? 'Provide your initial thoughts on this chunk.'
              : 'Respond to the other agents\' comments and continue the discussion.'
          }
        ];

        // Add agent's own state for continuity
        if (round > 1) {
          agentMessages.push({
            role: 'user',
            content: `Your previous notes:\n${agentStateContent}`
          });
        }

        // Execute agent with tools
        const response = await this.executeAgentWithTools(agent, agentMessages);

        if (response) {
          // Add agent's response to conversation
          chunkMessages.push({
            role: 'assistant',
            content: `[${agent.name}]: ${response}`
          });

          // Update agent's state file
          await this.updateAgentState(agent, `## Chunk ${chunkNumber} - Round ${round}\n\n${response}\n\n`);

          console.log(`      ✓ Contributed`);
        }
      }

      // Judge evaluates if chunk is complete
      const judgeEvaluation = await this.judgeEvaluateChunk(chunkMessages, chunk);

      if (judgeEvaluation.complete) {
        console.log(`    ✅ Judge: Chunk consensus reached`);
        return judgeEvaluation.result || '';
      } else {
        console.log(`    ⏭️  Judge: Continue discussion - ${judgeEvaluation.guidance}`);
        chunkMessages.push({
          role: 'assistant',
          content: `[Judge]: ${judgeEvaluation.guidance}`
        });
      }
    }

    // Max rounds reached - judge synthesizes final result
    console.log(`    ⚠️  Max rounds reached - judge synthesizing result`);
    const finalResult = await this.judgeSynthesizeResult(chunkMessages, chunk);
    return finalResult;
  }

  /**
   * Convert tool_calls and tool_result messages to OpenAI format
   */
  private convertToolCallsToOpenAIFormat(messages: any[]): any[] {
    return messages.map(msg => {
      // Convert assistant messages with tool_calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          ...msg,
          tool_calls: msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input)
            }
          }))
        };
      }
      // Convert tool_result messages to OpenAI's 'tool' role
      if (msg.role === 'tool_result') {
        return {
          role: 'tool',
          tool_call_id: msg.tool_use_id,
          content: msg.content
        };
      }
      return msg;
    });
  }

  /**
   * Execute agent with tool support
   */
  private async executeAgentWithTools(agent: Agent, messages: any[]): Promise<string | null> {
    const tools = this.toolRegistry.getAnthropicTools();
    let currentMessages = [...messages];
    let finalText: string | null = null;
    const maxIterations = 25;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const providerName = agent.provider.getProviderName();
      const useOpenAIFormat = providerName === 'OpenAI' || providerName === 'Grok' || providerName === 'Mistral';

      // Convert tool_calls to OpenAI format if needed
      const messagesToSend = useOpenAIFormat ? this.convertToolCallsToOpenAIFormat(currentMessages) : currentMessages;

      const response = await agent.provider.chat(
        messagesToSend,
        agent.systemPrompt,
        { tools: useOpenAIFormat ? this.toolRegistry.getOpenAITools() : tools }
      );

      if (response.tool_calls && response.tool_calls.length > 0) {
        currentMessages.push({
          role: 'assistant',
          content: response.text || '',
          tool_calls: response.tool_calls
        });

        for (const toolCall of response.tool_calls) {
          const result = await this.toolRegistry.executeTool(toolCall.name, toolCall.input);

          this.toolExecutions.push({
            agent: agent.name,
            tool: toolCall.name,
            input: toolCall.input,
            success: result.success,
            summary: result.summary || result.error || 'Tool executed'
          });

          currentMessages.push({
            role: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.success ? result.result : `Error: ${result.error}`
          });
        }

        continue;
      }

      finalText = response.text;
      break;
    }

    if (iterations >= maxIterations) {
      console.warn(`      ⚠️  Tool calling loop exceeded maximum iterations for ${agent.name}`);
    }

    return finalText;
  }

  /**
   * Judge evaluates if chunk discussion is complete
   */
  private async judgeEvaluateChunk(chunkMessages: any[], chunk: any): Promise<{ complete: boolean; result?: string; guidance?: string }> {
    const evaluationPrompt = `You are the judge coordinating this collaborative discussion.

Chunk: ${chunk.description}

Discussion so far:
${chunkMessages.map(m => m.content).join('\n\n')}

Evaluate if the agents have reached consensus and completed this chunk.

If complete, respond with:
COMPLETE: [Final result for this chunk]

If not complete, provide guidance:
CONTINUE: [Brief guidance on what still needs discussion]`;

    const response = await this.judge.provider.chat(
      [{ role: 'user', content: evaluationPrompt }],
      this.judge.systemPrompt
    );

    const responseText = response.text || '';

    if (responseText.startsWith('COMPLETE:')) {
      return {
        complete: true,
        result: responseText.replace('COMPLETE:', '').trim()
      };
    } else if (responseText.startsWith('CONTINUE:')) {
      return {
        complete: false,
        guidance: responseText.replace('CONTINUE:', '').trim()
      };
    }

    // Default to continue if format unclear
    return {
      complete: false,
      guidance: responseText
    };
  }

  /**
   * Judge synthesizes final result when max rounds reached
   */
  private async judgeSynthesizeResult(chunkMessages: any[], chunk: any): Promise<string> {
    const synthesisPrompt = `You are the judge. The agents have discussed this chunk for the maximum number of rounds.

Chunk: ${chunk.description}

Discussion:
${chunkMessages.map(m => m.content).join('\n\n')}

Synthesize the best result from this discussion:`;

    const response = await this.judge.provider.chat(
      [{ role: 'user', content: synthesisPrompt }],
      this.judge.systemPrompt
    );

    return response.text || 'No result synthesized';
  }

  /**
   * Update agent's state/notes file
   */
  private async updateAgentState(agent: Agent, content: string): Promise<void> {
    const stateFile = this.agentStateFiles.get(agent.name)!;
    fs.appendFileSync(stateFile, content);
  }

  /**
   * Update shared output file (only called by judge)
   */
  private async updateSharedOutput(result: string, chunkNumber: number, chunkDescription: string): Promise<void> {
    const sharedOutputPath = path.join(this.outputDir, this.sharedOutputFile);

    const chunkSection = `## Chunk ${chunkNumber}: ${chunkDescription}\n\n${result}\n\n---\n\n`;

    fs.appendFileSync(sharedOutputPath, chunkSection);
  }

  /**
   * Get summary of the orchestration session
   */
  getSummary(): any {
    return {
      mode: 'iterative_collaborative',
      chunkSize: this.chunkSize,
      maxRoundsPerChunk: this.maxRoundsPerChunk,
      agents: this.agents.map(a => a.name),
      judge: this.judge.name,
      toolExecutions: this.toolExecutions,
      outputDir: this.outputDir,
      sharedOutputFile: path.join(this.outputDir, this.sharedOutputFile),
      agentStateFiles: Object.fromEntries(this.agentStateFiles)
    };
  }
}
