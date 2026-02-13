import { Agent } from '../types';
import ToolRegistry from '../tools/ToolRegistry';
import ProviderFactory from '../providers/ProviderFactory';
import { EventBus } from '../core/EventBus';
import { createChatOptions } from './chatOptionsHelper';
import { getToolRestrictionInstruction } from '../tools/ToolPruningInstructions';
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
  startChunk: number;
  agentStateFiles: Map<string, string>;
  sharedOutputFile: string;
  outputDir: string;
  promptsDir: string;
  conversationHistory: any[];
  toolExecutions: any[];
  streamOutput: boolean;
  chunkDurations: number[];
  promptCounter: number;
  eventBus?: EventBus;
  consecutiveFailures: Map<string, number>;
  disabledAgents: Set<string>;
  usedFallbacks: Set<string>;
  private activeProviders: Map<string, { provider: any; model: string }> = new Map();
  private _originalAgents: Agent[] | null = null;
  private _originalJudge: Agent | null = null;

  constructor(
    agents: Agent[],
    judge: Agent,
    toolRegistry: ToolRegistry,
    options: {
      chunkSize?: number;
      maxRoundsPerChunk?: number;
      startChunk?: number;
      outputDir?: string;
      sharedOutputFile?: string;
      streamOutput?: boolean;
      eventBus?: EventBus;
    } = {}
  ) {
    this.agents = agents;
    this.judge = judge;
    this.toolRegistry = toolRegistry;
    this.chunkSize = options.chunkSize || 3;
    this.maxRoundsPerChunk = options.maxRoundsPerChunk || 5;
    this.startChunk = options.startChunk || 1;
    this.outputDir = options.outputDir || './outputs/iterative';
    this.promptsDir = path.join(this.outputDir, 'prompts');
    this.sharedOutputFile = options.sharedOutputFile || 'shared_output.md';
    this.agentStateFiles = new Map();
    this.conversationHistory = [];
    this.toolExecutions = [];
    this.streamOutput = options.streamOutput || false;
    this.chunkDurations = [];
    this.promptCounter = 0;
    this.eventBus = options.eventBus;
    this.consecutiveFailures = new Map();
    this.disabledAgents = new Set();
    this.usedFallbacks = new Set();

    // Ensure output directories exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.promptsDir)) {
      fs.mkdirSync(this.promptsDir, { recursive: true });
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

      // Only create new file if starting fresh (startChunk === 1) or file doesn't exist
      if (this.startChunk === 1 || !fs.existsSync(stateFilePath)) {
        fs.writeFileSync(stateFilePath, `# ${agent.name} - Working Notes\n\n`);
      }
    }
  }

  /**
   * Build chat options with streaming callbacks when enabled
   */
  private getChatOptions(disableStream: boolean = false, agentName?: string) {
    return createChatOptions(
      { streamOutput: this.streamOutput, eventBus: this.eventBus },
      disableStream,
      agentName
    );
  }

  /**
   * Main orchestration method - processes task in chunks with multi-turn discussions
   */
  async run(task: string, projectContext?: string): Promise<void> {
    console.log('\n=== Iterative Collaborative Mode ===');
    console.log(`Chunk size: ${this.chunkSize}`);
    console.log(`Max rounds per chunk: ${this.maxRoundsPerChunk}`);
    if (this.startChunk > 1) {
      console.log(`🔄 Resuming from chunk: ${this.startChunk}`);
    }
    console.log(`Agents: ${this.agents.map(a => a.name).join(', ')}`);
    console.log(`Judge: ${this.judge.name}\n`);
    
    if (this.eventBus) {
        this.eventBus.emitEvent('run:start', { task, mode: 'iterative' });
        this.eventBus.emitEvent('status', { message: `Starting Iterative Mode (Chunk Size: ${this.chunkSize})` });
    }

    // Augment agent + judge system prompts with full project context (activates provider caching)
    // Project context is stable across all chunks; chunk-specific scoped context stays in user messages
    // Always augment from originals to prevent double-augmentation on repeated run() calls
    if (!this._originalAgents) this._originalAgents = this.agents;
    if (!this._originalJudge) this._originalJudge = this.judge;
    if (projectContext) {
      this.agents = this._originalAgents.map(agent => ({
        ...agent,
        systemPrompt: agent.systemPrompt + '\n\n---\n\n' + projectContext + '\n\n---\n\nTask: ' + task
      }));
      this.judge = {
        ...this._originalJudge,
        systemPrompt: this._originalJudge.systemPrompt + '\n\n---\n\n' + projectContext + '\n\n---\n\nTask: ' + task
      };
    } else {
      // Reset to originals when no project context (prevents stale augmentation from prior run)
      this.agents = this._originalAgents;
      this.judge = this._originalJudge;
    }

    // Initialize or append to shared output file
    const sharedOutputPath = path.join(this.outputDir, this.sharedOutputFile);
    if (this.startChunk === 1) {
      // Fresh start - create new file
      fs.writeFileSync(sharedOutputPath, `# Collaborative Output\n\nTask: ${task}\n\n---\n\n`);
    } else {
      // Resuming - append resume marker
      if (fs.existsSync(sharedOutputPath)) {
        fs.appendFileSync(sharedOutputPath, `\n\n---\n🔄 Resuming from chunk ${this.startChunk}\n---\n\n`);
      } else {
        // File doesn't exist, create it anyway
        fs.writeFileSync(sharedOutputPath, `# Collaborative Output\n\nTask: ${task}\n\n---\n🔄 Resuming from chunk ${this.startChunk}\n---\n\n`);
      }
    }

    // Ask judge to break down the task into chunks
    let chunks = await this.planChunks(task, projectContext);

    // Enrich chunks with actual line content from project context
    chunks = this.enrichChunksWithLineContent(chunks, projectContext);

    // Process each chunk with multi-turn discussion
    for (let i = 0; i < chunks.length; i++) {
      const chunkNumber = i + 1;
      const chunk = chunks[i];

      // Skip chunks before startChunk (resume feature)
      if (chunkNumber < this.startChunk) {
        console.log(`\n⏭️  Skipping Chunk ${chunkNumber}/${chunks.length}: ${chunk.description} (already completed)`);
        continue;
      }

      console.log(`\n📦 Processing Chunk ${chunkNumber}/${chunks.length}: ${chunk.description}`);

      if (this.eventBus) {
          this.eventBus.emitEvent('status', { message: `Processing Chunk ${chunkNumber}/${chunks.length}: ${chunk.description}` });
      }

      // Reset per-chunk state: allow fallback retries and give disabled agents a second chance
      this.usedFallbacks.clear();
      this.activeProviders.clear();
      this.resetCircuitBreakers();

      const chunkStart = Date.now();

      const chunkResult = await this.discussChunk(chunk, chunkNumber, projectContext);

      // Judge writes result to shared output
      await this.updateSharedOutput(chunkResult, chunkNumber, chunk.description);

      const elapsedSeconds = (Date.now() - chunkStart) / 1000;
      this.chunkDurations.push(elapsedSeconds);

      const averageSeconds =
        this.chunkDurations.reduce((sum, value) => sum + value, 0) / this.chunkDurations.length;
      const remainingChunks = chunks.length - (i + 1);
      const estimatedRemainingSeconds = averageSeconds * remainingChunks;

      console.log(`✅ Chunk ${i + 1} completed\n`);
      console.log(
        `⏱️ Chunk ${i + 1} processing time: ${this.formatDuration(elapsedSeconds)} | Estimated time remaining: ${this.formatDuration(estimatedRemainingSeconds)} (avg/chunk: ${this.formatDuration(averageSeconds)})`
      );
    }

    console.log('\n🎉 All chunks processed successfully!');
    console.log(`\nOutputs:`);
    console.log(`  Shared output: ${sharedOutputPath}`);
    for (const [agentName, filePath] of this.agentStateFiles) {
      console.log(`  ${agentName} notes: ${filePath}`);
    }
    
    if (this.eventBus) {
        this.eventBus.emitEvent('run:complete', { result: { outputDir: this.outputDir, sharedOutputFile: sharedOutputPath } });
    }
  }

  /**
   * Detect if this is a simple line-by-line task that doesn't need LLM planning
   */
  private isSimpleLineByLineTask(task: string, projectContext?: string): boolean {
    if (!projectContext) {
      return false;
    }

    const taskLower = task.toLowerCase();
    return taskLower.includes('line by line') ||
           taskLower.includes('each line') ||
           taskLower.includes('every line') ||
           (taskLower.includes('line') && taskLower.includes('correct'));
  }

  /**
   * Auto-generate chunks for simple line-by-line processing
   * Batches lines together based on chunkSize for efficiency
   */
  private autoGenerateLineChunks(task: string, projectContext: string): any[] {
    console.log(`  (Auto-generating line-by-line chunks with batch size ${this.chunkSize} - no LLM needed)`);

    // Extract file content from project context
    const codeBlockMatch = projectContext.match(/```\n?([\s\S]*?)\n?```/);
    if (!codeBlockMatch) {
      throw new Error('Could not extract file content from project context');
    }

    const fileContent = codeBlockMatch[1];
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');

    // Determine task details from user's task description
    let taskDetails = 'Process this line';
    if (task.toLowerCase().includes('correct')) {
      taskDetails = 'Correct OCR errors';
    } else if (task.toLowerCase().includes('review')) {
      taskDetails = 'Review and validate';
    } else if (task.toLowerCase().includes('translate')) {
      taskDetails = 'Translate';
    }

    // Generate chunks with batching
    const chunks: any[] = [];
    for (let i = 0; i < lines.length; i += this.chunkSize) {
      const batchLines = lines.slice(i, Math.min(i + this.chunkSize, lines.length));
      const startLine = i + 1;
      const endLine = i + batchLines.length;

      chunks.push({
        description: startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`,
        details: taskDetails,
        lineNumbers: Array.from({ length: batchLines.length }, (_, idx) => startLine + idx),
        lineContent: batchLines.join('\n')
      });
    }

    return chunks;
  }

  /**
   * Ask judge to break down task into manageable chunks
   */
  private async planChunks(task: string, projectContext?: string): Promise<any[]> {
    console.log('🎯 Planning chunks...');

    // Check if this is a simple line-by-line task
    if (this.isSimpleLineByLineTask(task, projectContext)) {
      return this.autoGenerateLineChunks(task, projectContext!);
    }

    // Otherwise use LLM for intelligent planning
    console.log('  (Using LLM for intelligent chunk planning)');

    const planningPrompt = `You are coordinating a collaborative task. Break down the following task into ${this.chunkSize}-sized chunks that can be discussed iteratively.

Task: ${task}

${projectContext ? `The project has ${projectContext.split('\n').length} lines of content available to agents.\n` : ''}

Provide a JSON array of chunks. Each chunk MUST have:
- description: Brief description (e.g., "Lines 1-3" or "Lines 10-12")
- details: Simple instruction (e.g., "Correct OCR errors" or "Review and validate")
- startLine: First line number in this chunk (1-indexed)
- endLine: Last line number in this chunk (1-indexed)

IMPORTANT: Keep details SHORT. Do NOT include actual text content - agents will receive it automatically.
IMPORTANT: Every chunk MUST specify startLine and endLine as integers.

Example format:
\`\`\`json
[
  {
    "description": "Lines 1-3",
    "details": "Correct OCR errors",
    "startLine": 1,
    "endLine": 3
  },
  {
    "description": "Lines 4-6",
    "details": "Correct OCR errors",
    "startLine": 4,
    "endLine": 6
  }
]
\`\`\`

Return ONLY the JSON array, nothing else.`;

    const messages = [{ role: 'user' as const, content: planningPrompt }];
    const response = await this.chatWithFallback(
      this.judge.provider,
      this.judge.model,
      messages,
      this.judge.systemPrompt,
      this.getChatOptions(),
      'Judge'
    );

    if (this.streamOutput) {
      process.stdout.write('\n');
    }

    // Extract JSON from response
    const responseText = response.text || '';

    // Log the planning prompt and response
    this.logPrompt(
      this.judge.name,
      this.judge.model,
      messages,
      this.judge.systemPrompt,
      responseText,
      { phase: 'planning' }
    );

    // Try multiple patterns to extract JSON
    let jsonStr = responseText.trim();

    // Try pattern matching first
    // Pattern 1: ```json ... ```
    let jsonMatch = jsonStr.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Pattern 2: ``` ... ```
      jsonMatch = jsonStr.match(/```\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // Pattern 3: Just strip the markers if present
        jsonStr = jsonStr.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
    }

    // Clean the JSON string
    jsonStr = jsonStr.trim();

    // Remove any trailing commas before closing braces/brackets (common LLM error)
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

    // Fix unescaped quotes within string values (common with Hebrew/special text)
    // This is a heuristic approach: escape quotes that appear within "details": "..." values
    jsonStr = this.fixUnescapedQuotesInJson(jsonStr);

    try {
      const chunks = JSON.parse(jsonStr);

      if (!Array.isArray(chunks)) {
        throw new Error('Expected JSON array of chunks');
      }

      // Post-process: validate startLine/endLine — strip invalid values
      for (const chunk of chunks) {
        if (chunk.startLine != null) chunk.startLine = parseInt(chunk.startLine, 10);
        if (chunk.endLine != null) chunk.endLine = parseInt(chunk.endLine, 10);

        // Remove invalid bounds so enrichment falls back to description parsing
        if (isNaN(chunk.startLine) || isNaN(chunk.endLine) ||
            chunk.startLine < 1 || chunk.endLine < 1 ||
            chunk.endLine < chunk.startLine) {
          delete chunk.startLine;
          delete chunk.endLine;
        }
      }

      console.log(`  Planned ${chunks.length} chunks\n`);
      return chunks;
    } catch (error) {
      console.error(`\nFailed to parse JSON from judge response.`);
      console.error(`Error: ${error}`);
      console.error(`\nReceived JSON string (first 500 chars):`);
      console.error(jsonStr.substring(0, 500));
      console.error(`\nFull response text (first 1000 chars):`);
      console.error(responseText.substring(0, 1000));
      throw new Error(`Failed to parse chunks from judge response: ${error}`);
    }
  }

  /**
   * Fix unescaped quotes within JSON string values
   * Uses a simple state machine to track when we're inside a string
   */
  private fixUnescapedQuotesInJson(jsonStr: string): string {
    let result = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escape) {
        // If we're in an escape sequence, just add the character
        result += char;
        escape = false;
        continue;
      }

      if (char === '\\') {
        // Start of escape sequence
        result += char;
        escape = true;
        continue;
      }

      if (char === '"') {
        if (!inString) {
          // Starting a string
          inString = true;
          result += char;
        } else {
          // Could be ending a string, or could be an unescaped quote inside
          // Check if this is likely a structural quote (followed by : or , or } or ])
          const nextNonWhitespace = this.getNextNonWhitespace(jsonStr, i + 1);

          if (nextNonWhitespace === ':' || nextNonWhitespace === ',' ||
              nextNonWhitespace === '}' || nextNonWhitespace === ']' ||
              nextNonWhitespace === null) {
            // This is likely a closing quote
            inString = false;
            result += char;
          } else {
            // This is likely an unescaped quote inside the string
            result += '\\' + char;
          }
        }
      } else {
        result += char;
      }
    }

    return result;
  }

  /**
   * Get the next non-whitespace character
   */
  private getNextNonWhitespace(str: string, startIndex: number): string | null {
    for (let i = startIndex; i < str.length; i++) {
      const char = str[i];
      if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
        return char;
      }
    }
    return null;
  }

  /**
   * Multi-turn discussion for a single chunk
   * Agents can respond to each other over multiple rounds
   */
  private async discussChunk(chunk: any, chunkNumber: number, projectContext?: string): Promise<string> {
    const chunkMessages: any[] = [];

    // Initial context message
    let contextMessage = '';

    // If we have extracted line content, provide it explicitly
    if (chunk.lineContent !== undefined) {
      // Use windowed context instead of full project context for efficiency
      const windowedContext = chunk.lineNumbers
        ? this.extractWindowedContext(projectContext, chunk.lineNumbers, 3)
        : null;

      contextMessage = `Working on chunk ${chunkNumber}: ${chunk.description}

YOUR TASK: ${chunk.details}

THIS IS THE SPECIFIC TEXT YOU NEED TO WORK ON (and ONLY this text):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${chunk.lineContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT:
- Work on the text above ONLY. Do not process other lines.
- Output ONLY your corrected version of this specific text.
- Do not include explanations or analysis unless requested.

${windowedContext ? `Surrounding Context (±3 lines for reference only - DO NOT correct these):\n${windowedContext}\n` : ''}

Collaborate with other agents to complete this chunk. You can read from and write to your own notes file, but only the judge will write to the shared output.`;
    } else {
      // Fallback for chunks without line content — try to scope context
      let scopedContext = '';
      if (projectContext) {
        // Try to find relevant section from the chunk description
        const lineNums = this.parseLineNumbersFromDescription(chunk.description);
        if (lineNums && lineNums.length > 0) {
          const lineMap = this.extractLinesFromContext(projectContext, lineNums);
          const lines: string[] = [];
          for (const num of lineNums) {
            const line = lineMap.get(num);
            if (line !== undefined) lines.push(line);
          }
          if (lines.length > 0) {
            scopedContext = `\nTEXT TO WORK ON:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          }
        }

        // If we still couldn't scope, provide truncated context with a warning
        if (!scopedContext) {
          const contextLines = projectContext.split('\n');
          const truncated = contextLines.length > 50
            ? contextLines.slice(0, 50).join('\n') + '\n... (truncated)'
            : projectContext;
          scopedContext = `\nProject Context (could not scope to specific lines — review the full text and focus on what matches "${chunk.description}"):\n${truncated}\n`;
        }
      }

      contextMessage = `Working on chunk ${chunkNumber}: ${chunk.description}

YOUR TASK: ${chunk.details}
${scopedContext}
Collaborate with other agents to complete this chunk. You can read from and write to your own notes file, but only the judge will write to the shared output.`;
    }

    for (let round = 1; round <= this.maxRoundsPerChunk; round++) {
      console.log(`\n  Round ${round}/${this.maxRoundsPerChunk}:`);

      // Each agent gets a turn to contribute
      for (const agent of this.agents) {
        // Skip agents disabled by circuit breaker
        if (this.disabledAgents.has(agent.name)) {
          continue;
        }

        console.log(`    💬 ${agent.name}...`);

        // Build agent's context: chunk description + conversation history + their state file
        const agentStateContent = fs.readFileSync(this.agentStateFiles.get(agent.name)!, 'utf-8');

        const toolRestriction = getToolRestrictionInstruction('iterative', 'agent');
        const agentMessages = [
          { role: 'user', content: contextMessage },
          ...chunkMessages,
          {
            role: 'user',
            content: (round === 1
              ? 'Provide your initial thoughts on this chunk.'
              : 'Respond to the other agents\' comments and continue the discussion.') + toolRestriction
          }
        ];

        // Add agent's own state for continuity across chunks and rounds
        if (agentStateContent.trim()) {
          agentMessages.push({
            role: 'user',
            content: `Your previous notes:\n${agentStateContent}`
          });
        }

        // Execute agent with tools + fallback on retryable errors
        try {
          const response = await this.executeAgentWithTools(agent, agentMessages, {
            chunk: chunkNumber,
            round: round
          });

          if (response) {
            this.recordSuccess(agent.name);

            // Add agent's response to conversation
            chunkMessages.push({
              role: 'assistant',
              content: `[${agent.name}]: ${response}`
            });

            // Update agent's state file
            await this.updateAgentState(agent, `## Chunk ${chunkNumber} - Round ${round}\n\n${response}\n\n`);

            console.log(`      ✓ Contributed`);
          } else {
            this.recordFailure(agent.name, 'empty response');
            console.log(`      ⚠️  Empty response`);
          }
        } catch (error: any) {
          const reason = error?.message || String(error);
          console.log(`      ❌ ${agent.name} error: ${reason.substring(0, 120)}`);
          this.recordFailure(agent.name, reason.substring(0, 80));
        }
      }

      // Judge evaluates if chunk is complete
      const judgeEvaluation = await this.judgeEvaluateChunk(chunkMessages, chunk, chunkNumber, round);

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
    const finalResult = await this.judgeSynthesizeResult(chunkMessages, chunk, chunkNumber);
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
  private async executeAgentWithTools(
    agent: Agent,
    messages: any[],
    metadata: { chunk?: number; round?: number } = {}
  ): Promise<string | null> {
    const tools = this.toolRegistry.getAnthropicTools();
    let currentMessages = [...messages];
    let finalText: string | null = null;
    const maxIterations = 25;
    let iterations = 0;
    const toolUsageSummary: string[] = [];

    while (iterations < maxIterations) {
      iterations++;

      // Pass raw Anthropic-format messages — chatWithFallback handles per-provider conversion
      const chatOpts = { tools: tools, ...this.getChatOptions(true) };
      const response = await this.chatWithFallback(
        agent.provider,
        agent.model,
        currentMessages,
        agent.systemPrompt,
        chatOpts,
        agent.name
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

          // Track tool usage for summary (sanitized to avoid corrupting message history)
          const rawInput = toolCall.input?.path || toolCall.input?.file_path || JSON.stringify(toolCall.input);
          const inputSummary = rawInput.replace(/[\n\r]/g, ' ').substring(0, 80);
          toolUsageSummary.push(`${toolCall.name}(${inputSummary})`);

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

    // Prepend tool usage summary so other agents and the judge know what was consulted
    if (toolUsageSummary.length > 0 && finalText) {
      finalText = `[Used tools: ${toolUsageSummary.join(', ')}]\n${finalText}`;
    }

    // Log the full interaction (initial messages + all tool calls + final response)
    this.logPrompt(
      agent.name,
      agent.model,
      messages, // Original messages (for readability)
      agent.systemPrompt,
      finalText || '[No final text - used tools only]',
      { ...metadata, phase: 'agent' }
    );

    return finalText;
  }

  /**
   * Judge evaluates if chunk discussion is complete
   */
  private async judgeEvaluateChunk(
    chunkMessages: any[],
    chunk: any,
    chunkNumber: number,
    round: number
  ): Promise<{ complete: boolean; result?: string; guidance?: string }> {
    const evaluationPrompt = `You are the judge coordinating this collaborative discussion.

Chunk: ${chunk.description}

Discussion so far:
${chunkMessages.map(m => m.content).join('\n\n')}

Evaluate if the agents have reached consensus and completed this chunk.

If complete, respond with:
COMPLETE: [Final result for this chunk]

If not complete, provide guidance:
CONTINUE: [Brief guidance on what still needs discussion]`;

    const messages = [{ role: 'user' as const, content: evaluationPrompt }];
    const response = await this.chatWithFallback(
      this.judge.provider,
      this.judge.model,
      messages,
      this.judge.systemPrompt,
      this.getChatOptions(),
      'Judge'
    );

    if (this.streamOutput) {
      process.stdout.write('\n');
    }

    const responseText = response.text || '';

    // Log the evaluation
    this.logPrompt(
      this.judge.name,
      this.judge.model,
      messages,
      this.judge.systemPrompt,
      responseText,
      { chunk: chunkNumber, round: round, phase: 'evaluation' }
    );

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
  private async judgeSynthesizeResult(chunkMessages: any[], chunk: any, chunkNumber: number): Promise<string> {
    const synthesisPrompt = `You are the judge. The agents have discussed this chunk for the maximum number of rounds.

Chunk: ${chunk.description}

Discussion:
${chunkMessages.map(m => m.content).join('\n\n')}

Synthesize the best result from this discussion:`;

    const messages = [{ role: 'user' as const, content: synthesisPrompt }];
    const response = await this.chatWithFallback(
      this.judge.provider,
      this.judge.model,
      messages,
      this.judge.systemPrompt,
      this.getChatOptions(),
      'Judge'
    );

    if (this.streamOutput) {
      process.stdout.write('\n');
    }

    const responseText = response.text || 'No result synthesized';

    // Log the synthesis
    this.logPrompt(
      this.judge.name,
      this.judge.model,
      messages,
      this.judge.systemPrompt,
      responseText,
      { chunk: chunkNumber, phase: 'synthesis' }
    );

    return responseText;
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
   * Extract specific lines from project context
   * Parses the project context to extract file content and return specific lines
   */
  private extractLinesFromContext(projectContext: string | undefined, lineNumbers: number[]): Map<number, string> {
    const lineMap = new Map<number, string>();

    if (!projectContext) {
      return lineMap;
    }

    // Extract the file content from the project context
    // Format is: # Project Context\n\nFile: filename\n\n```\ncontent\n```
    const codeBlockMatch = projectContext.match(/```\n?([\s\S]*?)\n?```/);

    if (!codeBlockMatch) {
      return lineMap;
    }

    const fileContent = codeBlockMatch[1];
    const lines = fileContent.split('\n');

    // Extract requested line numbers (1-indexed)
    for (const lineNum of lineNumbers) {
      if (lineNum >= 1 && lineNum <= lines.length) {
        lineMap.set(lineNum, lines[lineNum - 1]);
      }
    }

    return lineMap;
  }

  /**
   * Extract a window of context lines around the target lines
   * @param projectContext - The full project context
   * @param lineNumbers - Array of target line numbers
   * @param windowSize - Number of lines to show before and after (default: 3)
   * @returns Formatted string with windowed context
   */
  private extractWindowedContext(
    projectContext: string | undefined,
    lineNumbers: number[],
    windowSize: number = 3
  ): string | null {
    if (!projectContext || lineNumbers.length === 0) {
      return null;
    }

    const codeBlockMatch = projectContext.match(/```\n?([\s\S]*?)\n?```/);
    if (!codeBlockMatch) {
      return null;
    }

    const fileContent = codeBlockMatch[1];
    const lines = fileContent.split('\n');

    // Find min and max line numbers in the target range
    const minTarget = Math.min(...lineNumbers);
    const maxTarget = Math.max(...lineNumbers);

    // Calculate window boundaries
    const startLine = Math.max(1, minTarget - windowSize);
    const endLine = Math.min(lines.length, maxTarget + windowSize);

    // Extract windowed lines
    const windowedLines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i - 1]; // Convert to 0-indexed
      const isTarget = lineNumbers.includes(i);
      windowedLines.push(`${isTarget ? '>' : ' '} ${i}: ${line}`);
    }

    return windowedLines.join('\n');
  }

  /**
   * Parse line numbers from a chunk description.
   * Handles: "Line 5", "Lines 5-7", "Lines 5–7", "Lines 5 to 7"
   */
  private parseLineNumbersFromDescription(description: string): number[] | null {
    // Range: "Lines 5-7", "Lines 5–7", "Lines 5 to 7"
    const rangeMatch = description.match(/Lines?\s+(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || end < start) {
        return null;
      }
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    // Single: "Line 5"
    const singleMatch = description.match(/Lines?\s+(\d+)/i);
    if (singleMatch) {
      return [parseInt(singleMatch[1], 10)];
    }

    return null;
  }

  /**
   * Enrich chunks with actual line content extracted from project context.
   * Handles single lines ("Line 5") and ranges ("Lines 5-7").
   * Also uses startLine/endLine fields if set by planChunks post-processing.
   */
  private enrichChunksWithLineContent(chunks: any[], projectContext: string | undefined): any[] {
    if (!projectContext) return chunks;

    // Collect all needed line numbers across all chunks
    const allLineNumbers: number[] = [];
    const chunkLineRanges: (number[] | null)[] = [];

    for (const chunk of chunks) {
      // Prefer startLine/endLine if already set by planChunks post-processing
      if (chunk.startLine && chunk.endLine && chunk.startLine > 0 && chunk.endLine >= chunk.startLine) {
        const range = Array.from({ length: chunk.endLine - chunk.startLine + 1 }, (_, i) => chunk.startLine + i);
        chunkLineRanges.push(range);
        allLineNumbers.push(...range);
      } else {
        const parsed = this.parseLineNumbersFromDescription(chunk.description);
        chunkLineRanges.push(parsed);
        if (parsed) allLineNumbers.push(...parsed);
      }
    }

    // Get all lines at once
    const uniqueLines = [...new Set(allLineNumbers)];
    const lineMap = this.extractLinesFromContext(projectContext, uniqueLines);

    // Enrich each chunk with its line content
    return chunks.map((chunk, idx) => {
      // Skip if already has lineContent (e.g. from autoGenerateLineChunks)
      if (chunk.lineContent !== undefined) return chunk;

      const lineNums = chunkLineRanges[idx];
      if (!lineNums || lineNums.length === 0) return chunk;

      const lines: string[] = [];
      for (const num of lineNums) {
        const line = lineMap.get(num);
        if (line !== undefined) lines.push(line);
      }

      if (lines.length > 0) {
        return {
          ...chunk,
          lineNumbers: lineNums,
          lineContent: lines.join('\n')
        };
      }

      return chunk;
    });
  }

  /**
   * Get a cross-provider fallback model for resilience.
   * Copied from ConversationManager pattern.
   */
  private getFallbackModel(currentModel: string): string | null {
    const model = currentModel.toLowerCase();
    if (model.includes('claude')) return 'gpt-4o-mini';
    if (model.includes('gemini')) return 'gpt-4o-mini';
    if (/\bo[13]-/.test(model) || /\bo[13]$/.test(model)) return 'claude-sonnet-4-5';
    if (model.includes('gpt') || model.includes('grok') || model.includes('mistral')) return 'claude-sonnet-4-5';
    return 'gpt-4o-mini';
  }

  /**
   * Check if an error is retryable (rate limit, transient server error).
   */
  private isRetryableError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return /429|rate.?limit|502|503|504|timeout|overloaded|capacity/i.test(msg);
  }

  /**
   * Record an agent failure and trip the circuit breaker after 2 consecutive failures.
   */
  private recordFailure(agentName: string, reason: string): void {
    const count = (this.consecutiveFailures.get(agentName) || 0) + 1;
    this.consecutiveFailures.set(agentName, count);

    if (count >= 2) {
      this.disabledAgents.add(agentName);
      console.log(`    ⚡ Circuit breaker: ${agentName} disabled after ${count} consecutive failures (${reason})`);
    }
  }

  /**
   * Reset consecutive failure count for an agent on success.
   */
  private recordSuccess(agentName: string): void {
    this.consecutiveFailures.set(agentName, 0);
  }

  /**
   * Reset circuit breakers at chunk boundaries.
   * Gives disabled agents a fresh chance each chunk — a transient outage
   * in chunk 2 shouldn't permanently remove an agent for chunks 3..N.
   */
  private resetCircuitBreakers(): void {
    if (this.disabledAgents.size > 0) {
      console.log(`    🔄 Re-enabling agents for new chunk: ${[...this.disabledAgents].join(', ')}`);
      this.disabledAgents.clear();
    }
    this.consecutiveFailures.clear();
  }

  /**
   * Check if a provider uses OpenAI-style tool format based on its name.
   */
  private isOpenAIFormat(providerName: string): boolean {
    return providerName === 'OpenAI' || providerName === 'Grok' || providerName === 'Mistral';
  }

  /**
   * Build correct tool schemas for a given provider.
   * Ensures fallback providers receive tools in their expected format.
   */
  private getToolsForProvider(provider: any): any[] {
    const providerName = provider.getProviderName();
    return this.isOpenAIFormat(providerName)
      ? this.toolRegistry.getOpenAITools()
      : this.toolRegistry.getAnthropicTools();
  }

  /**
   * Convert messages to the correct format for a given provider.
   * Raw messages are stored in Anthropic format (tool_result, tool_calls with name/input).
   * OpenAI-family providers need them converted.
   */
  private convertMessagesForProvider(rawMessages: any[], provider: any): any[] {
    const providerName = provider.getProviderName();
    if (this.isOpenAIFormat(providerName)) {
      return this.convertToolCallsToOpenAIFormat(rawMessages);
    }
    return rawMessages;
  }

  /**
   * Execute a provider chat call with fallback on retryable errors.
   * Used for both agents and judge. Transforms both tool schemas AND message
   * format for the fallback provider to avoid cross-provider format mismatches.
   *
   * @param rawMessages - Messages in Anthropic (canonical) format. Converted per-provider before sending.
   */
  private async chatWithFallback(
    provider: any,
    model: string,
    rawMessages: any[],
    systemPrompt: string,
    chatOptions: any,
    callerName: string
  ): Promise<any> {
    // Check if we already have a persisted fallback provider for this caller
    const activeOverride = this.activeProviders.get(callerName);
    const effectiveProvider = activeOverride ? activeOverride.provider : provider;
    const effectiveModel = activeOverride ? activeOverride.model : model;

    try {
      const messages = this.convertMessagesForProvider(rawMessages, effectiveProvider);
      const opts = { ...chatOptions };
      if (opts.tools) {
        opts.tools = this.getToolsForProvider(effectiveProvider);
      }
      return await effectiveProvider.chat(messages, systemPrompt, opts);
    } catch (error: any) {
      // If a persisted fallback fails with a non-retryable error, clear it so
      // the next call retries the original provider (which may have recovered)
      if (activeOverride && !this.isRetryableError(error)) {
        this.activeProviders.delete(callerName);
      }
      if (this.isRetryableError(error)) {
        const fallbackModel = this.getFallbackModel(effectiveModel);
        const fallbackKey = `${callerName}:${fallbackModel}`;
        if (fallbackModel && !this.usedFallbacks.has(fallbackKey)) {
          this.usedFallbacks.add(fallbackKey);
          console.log(`    ⚠️  ${callerName} (${effectiveModel}) failed, falling back to ${fallbackModel}`);
          const fallbackProvider = ProviderFactory.createProvider(fallbackModel);

          // Persist the fallback so subsequent calls for this agent use it
          this.activeProviders.set(callerName, { provider: fallbackProvider, model: fallbackModel });

          // Convert raw messages + tools for the fallback provider's format
          const fallbackMessages = this.convertMessagesForProvider(rawMessages, fallbackProvider);
          const fallbackOptions = { ...chatOptions };
          if (fallbackOptions.tools) {
            fallbackOptions.tools = this.getToolsForProvider(fallbackProvider);
          }

          return await fallbackProvider.chat(fallbackMessages, systemPrompt, fallbackOptions);
        }
      }
      throw error;
    }
  }

  /**
   * Log prompt and response to file for debugging
   */
  private logPrompt(
    agentName: string,
    model: string,
    messages: any[],
    systemPrompt: string,
    response: string,
    metadata: { chunk?: number; round?: number; phase?: string } = {}
  ): void {
    this.promptCounter++;

    // Create timestamp in sortable format
    const now = new Date();
    const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');

    // Build filename
    const parts = [
      timestamp,
      String(this.promptCounter).padStart(4, '0'),
      metadata.chunk ? `chunk${metadata.chunk}` : null,
      metadata.round ? `round${metadata.round}` : null,
      metadata.phase || 'agent',
      agentName.replace(/\s+/g, '_')
    ].filter(p => p !== null);

    const filename = parts.join('_') + '.txt';
    const filepath = path.join(this.promptsDir, filename);

    // Format messages for display
    const formattedMessages = messages.map((msg, idx) => {
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = JSON.stringify(msg.content, null, 2);
      } else {
        content = JSON.stringify(msg, null, 2);
      }

      return `--- Message ${idx + 1} (role: ${msg.role}) ---\n${content}\n`;
    }).join('\n');

    // Build file content
    const fileContent = `${'='.repeat(80)}
PROMPT LOG
${'='.repeat(80)}

Agent: ${agentName}
Model: ${model}
${metadata.chunk ? `Chunk: ${metadata.chunk}\n` : ''}${metadata.round ? `Round: ${metadata.round}\n` : ''}${metadata.phase ? `Phase: ${metadata.phase}\n` : ''}Timestamp: ${now.toISOString()}

${'='.repeat(80)}
SYSTEM PROMPT
${'='.repeat(80)}

${systemPrompt}

${'='.repeat(80)}
MESSAGES
${'='.repeat(80)}

${formattedMessages}

${'='.repeat(80)}
RESPONSE
${'='.repeat(80)}

${response}

${'='.repeat(80)}
`;

    fs.writeFileSync(filepath, fileContent);
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

  /**
   * Format seconds into human-readable time (MM:SS or HH:MM:SS)
   */
  private formatDuration(totalSeconds: number): string {
    const roundedSeconds = Math.round(totalSeconds);
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    const seconds = roundedSeconds % 60;

    const pad = (value: number) => value.toString().padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${minutes}:${pad(seconds)}`;
  }
}
