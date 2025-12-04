"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
class IterativeCollaborativeOrchestrator {
    constructor(agents, judge, toolRegistry, options = {}) {
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
    initializeAgentStateFiles() {
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
    getChatOptions(disableStream = false) {
        if (disableStream || !this.streamOutput)
            return {};
        return { stream: true, onToken: (token) => process.stdout.write(token) };
    }
    /**
     * Main orchestration method - processes task in chunks with multi-turn discussions
     */
    async run(task, projectContext) {
        console.log('\n=== Iterative Collaborative Mode ===');
        console.log(`Chunk size: ${this.chunkSize}`);
        console.log(`Max rounds per chunk: ${this.maxRoundsPerChunk}`);
        if (this.startChunk > 1) {
            console.log(`🔄 Resuming from chunk: ${this.startChunk}`);
        }
        console.log(`Agents: ${this.agents.map(a => a.name).join(', ')}`);
        console.log(`Judge: ${this.judge.name}\n`);
        // Initialize or append to shared output file
        const sharedOutputPath = path.join(this.outputDir, this.sharedOutputFile);
        if (this.startChunk === 1) {
            // Fresh start - create new file
            fs.writeFileSync(sharedOutputPath, `# Collaborative Output\n\nTask: ${task}\n\n---\n\n`);
        }
        else {
            // Resuming - append resume marker
            if (fs.existsSync(sharedOutputPath)) {
                fs.appendFileSync(sharedOutputPath, `\n\n---\n🔄 Resuming from chunk ${this.startChunk}\n---\n\n`);
            }
            else {
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
            const chunkStart = Date.now();
            const chunkResult = await this.discussChunk(chunk, chunkNumber, projectContext);
            // Judge writes result to shared output
            await this.updateSharedOutput(chunkResult, chunkNumber, chunk.description);
            const elapsedSeconds = (Date.now() - chunkStart) / 1000;
            this.chunkDurations.push(elapsedSeconds);
            const averageSeconds = this.chunkDurations.reduce((sum, value) => sum + value, 0) / this.chunkDurations.length;
            const remainingChunks = chunks.length - (i + 1);
            const estimatedRemainingSeconds = averageSeconds * remainingChunks;
            console.log(`✅ Chunk ${i + 1} completed\n`);
            console.log(`⏱️ Chunk ${i + 1} processing time: ${this.formatDuration(elapsedSeconds)} | Estimated time remaining: ${this.formatDuration(estimatedRemainingSeconds)} (avg/chunk: ${this.formatDuration(averageSeconds)})`);
        }
        console.log('\n🎉 All chunks processed successfully!');
        console.log(`\nOutputs:`);
        console.log(`  Shared output: ${sharedOutputPath}`);
        for (const [agentName, filePath] of this.agentStateFiles) {
            console.log(`  ${agentName} notes: ${filePath}`);
        }
    }
    /**
     * Detect if this is a simple line-by-line task that doesn't need LLM planning
     */
    isSimpleLineByLineTask(task, projectContext) {
        if (!projectContext || this.chunkSize !== 1) {
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
     */
    autoGenerateLineChunks(task, projectContext) {
        console.log('  (Auto-generating line-by-line chunks - no LLM needed)');
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
        }
        else if (task.toLowerCase().includes('review')) {
            taskDetails = 'Review and validate';
        }
        else if (task.toLowerCase().includes('translate')) {
            taskDetails = 'Translate';
        }
        // Generate chunks
        const chunks = lines.map((line, index) => ({
            description: `Line ${index + 1}`,
            details: taskDetails
        }));
        return chunks;
    }
    /**
     * Ask judge to break down task into manageable chunks
     */
    async planChunks(task, projectContext) {
        console.log('🎯 Planning chunks...');
        // Check if this is a simple line-by-line task
        if (this.isSimpleLineByLineTask(task, projectContext)) {
            return this.autoGenerateLineChunks(task, projectContext);
        }
        // Otherwise use LLM for intelligent planning
        console.log('  (Using LLM for intelligent chunk planning)');
        const planningPrompt = `You are coordinating a collaborative task. Break down the following task into ${this.chunkSize}-sized chunks that can be discussed iteratively.

Task: ${task}

${projectContext ? `The project has ${projectContext.split('\n').length} lines of content available to agents.\n` : ''}

Provide a JSON array of chunks. Each chunk should have:
- description: Brief description (e.g., "Line 5" or "Lines 10-12")
- details: Simple instruction (e.g., "Correct OCR errors" or "Review and validate")

IMPORTANT: Keep details SHORT. Do NOT include actual text content - agents can read files themselves.

Example format:
\`\`\`json
[
  {
    "description": "Line 1",
    "details": "Correct OCR errors"
  },
  {
    "description": "Line 2",
    "details": "Correct OCR errors"
  }
]
\`\`\`

Return ONLY the JSON array, nothing else.`;
        const messages = [{ role: 'user', content: planningPrompt }];
        const response = await this.judge.provider.chat(messages, this.judge.systemPrompt, this.getChatOptions());
        if (this.streamOutput) {
            process.stdout.write('\n');
        }
        // Extract JSON from response
        const responseText = response.text || '';
        // Log the planning prompt and response
        this.logPrompt(this.judge.name, this.judge.model, messages, this.judge.systemPrompt, responseText, { phase: 'planning' });
        // Try multiple patterns to extract JSON
        let jsonStr = responseText.trim();
        // Try pattern matching first
        // Pattern 1: ```json ... ```
        let jsonMatch = jsonStr.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }
        else {
            // Pattern 2: ``` ... ```
            jsonMatch = jsonStr.match(/```\s*\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }
            else {
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
            console.log(`  Planned ${chunks.length} chunks\n`);
            return chunks;
        }
        catch (error) {
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
    fixUnescapedQuotesInJson(jsonStr) {
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
                }
                else {
                    // Could be ending a string, or could be an unescaped quote inside
                    // Check if this is likely a structural quote (followed by : or , or } or ])
                    const nextNonWhitespace = this.getNextNonWhitespace(jsonStr, i + 1);
                    if (nextNonWhitespace === ':' || nextNonWhitespace === ',' ||
                        nextNonWhitespace === '}' || nextNonWhitespace === ']' ||
                        nextNonWhitespace === null) {
                        // This is likely a closing quote
                        inString = false;
                        result += char;
                    }
                    else {
                        // This is likely an unescaped quote inside the string
                        result += '\\' + char;
                    }
                }
            }
            else {
                result += char;
            }
        }
        return result;
    }
    /**
     * Get the next non-whitespace character
     */
    getNextNonWhitespace(str, startIndex) {
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
    async discussChunk(chunk, chunkNumber, projectContext) {
        const chunkMessages = [];
        // Initial context message
        let contextMessage = '';
        // If we have extracted line content, provide it explicitly
        if (chunk.lineContent !== undefined) {
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

${projectContext ? `Reference Context (for understanding only - DO NOT correct these lines):\n${projectContext}\n` : ''}

Collaborate with other agents to complete this chunk. You can read from and write to your own notes file, but only the judge will write to the shared output.`;
        }
        else {
            // Fallback for chunks without line content
            contextMessage = `Working on chunk ${chunkNumber}: ${chunk.description}

${chunk.details}

${projectContext ? `Project Context:\n${projectContext}\n` : ''}

Collaborate with other agents to complete this chunk. You can read from and write to your own notes file, but only the judge will write to the shared output.`;
        }
        for (let round = 1; round <= this.maxRoundsPerChunk; round++) {
            console.log(`\n  Round ${round}/${this.maxRoundsPerChunk}:`);
            // Each agent gets a turn to contribute
            for (const agent of this.agents) {
                console.log(`    💬 ${agent.name}...`);
                // Build agent's context: chunk description + conversation history + their state file
                const agentStateContent = fs.readFileSync(this.agentStateFiles.get(agent.name), 'utf-8');
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
                // Add agent's own state for continuity across chunks and rounds
                if (agentStateContent.trim()) {
                    agentMessages.push({
                        role: 'user',
                        content: `Your previous notes:\n${agentStateContent}`
                    });
                }
                // Execute agent with tools
                const response = await this.executeAgentWithTools(agent, agentMessages, {
                    chunk: chunkNumber,
                    round: round
                });
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
            const judgeEvaluation = await this.judgeEvaluateChunk(chunkMessages, chunk, chunkNumber, round);
            if (judgeEvaluation.complete) {
                console.log(`    ✅ Judge: Chunk consensus reached`);
                return judgeEvaluation.result || '';
            }
            else {
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
    convertToolCallsToOpenAIFormat(messages) {
        return messages.map(msg => {
            // Convert assistant messages with tool_calls
            if (msg.role === 'assistant' && msg.tool_calls) {
                return {
                    ...msg,
                    tool_calls: msg.tool_calls.map((tc) => ({
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
    async executeAgentWithTools(agent, messages, metadata = {}) {
        const tools = this.toolRegistry.getAnthropicTools();
        let currentMessages = [...messages];
        let finalText = null;
        const maxIterations = 25;
        let iterations = 0;
        while (iterations < maxIterations) {
            iterations++;
            const providerName = agent.provider.getProviderName();
            const useOpenAIFormat = providerName === 'OpenAI' || providerName === 'Grok' || providerName === 'Mistral';
            // Convert tool_calls to OpenAI format if needed
            const messagesToSend = useOpenAIFormat ? this.convertToolCallsToOpenAIFormat(currentMessages) : currentMessages;
            const response = await agent.provider.chat(messagesToSend, agent.systemPrompt, { tools: useOpenAIFormat ? this.toolRegistry.getOpenAITools() : tools, ...this.getChatOptions(true) });
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
        // Log the full interaction (initial messages + all tool calls + final response)
        this.logPrompt(agent.name, agent.model, messages, // Original messages (for readability)
        agent.systemPrompt, finalText || '[No final text - used tools only]', { ...metadata, phase: 'agent' });
        return finalText;
    }
    /**
     * Judge evaluates if chunk discussion is complete
     */
    async judgeEvaluateChunk(chunkMessages, chunk, chunkNumber, round) {
        const evaluationPrompt = `You are the judge coordinating this collaborative discussion.

Chunk: ${chunk.description}

Discussion so far:
${chunkMessages.map(m => m.content).join('\n\n')}

Evaluate if the agents have reached consensus and completed this chunk.

If complete, respond with:
COMPLETE: [Final result for this chunk]

If not complete, provide guidance:
CONTINUE: [Brief guidance on what still needs discussion]`;
        const messages = [{ role: 'user', content: evaluationPrompt }];
        const response = await this.judge.provider.chat(messages, this.judge.systemPrompt, this.getChatOptions());
        if (this.streamOutput) {
            process.stdout.write('\n');
        }
        const responseText = response.text || '';
        // Log the evaluation
        this.logPrompt(this.judge.name, this.judge.model, messages, this.judge.systemPrompt, responseText, { chunk: chunkNumber, round: round, phase: 'evaluation' });
        if (responseText.startsWith('COMPLETE:')) {
            return {
                complete: true,
                result: responseText.replace('COMPLETE:', '').trim()
            };
        }
        else if (responseText.startsWith('CONTINUE:')) {
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
    async judgeSynthesizeResult(chunkMessages, chunk, chunkNumber) {
        const synthesisPrompt = `You are the judge. The agents have discussed this chunk for the maximum number of rounds.

Chunk: ${chunk.description}

Discussion:
${chunkMessages.map(m => m.content).join('\n\n')}

Synthesize the best result from this discussion:`;
        const messages = [{ role: 'user', content: synthesisPrompt }];
        const response = await this.judge.provider.chat(messages, this.judge.systemPrompt, this.getChatOptions());
        if (this.streamOutput) {
            process.stdout.write('\n');
        }
        const responseText = response.text || 'No result synthesized';
        // Log the synthesis
        this.logPrompt(this.judge.name, this.judge.model, messages, this.judge.systemPrompt, responseText, { chunk: chunkNumber, phase: 'synthesis' });
        return responseText;
    }
    /**
     * Update agent's state/notes file
     */
    async updateAgentState(agent, content) {
        const stateFile = this.agentStateFiles.get(agent.name);
        fs.appendFileSync(stateFile, content);
    }
    /**
     * Update shared output file (only called by judge)
     */
    async updateSharedOutput(result, chunkNumber, chunkDescription) {
        const sharedOutputPath = path.join(this.outputDir, this.sharedOutputFile);
        const chunkSection = `## Chunk ${chunkNumber}: ${chunkDescription}\n\n${result}\n\n---\n\n`;
        fs.appendFileSync(sharedOutputPath, chunkSection);
    }
    /**
     * Extract specific lines from project context
     * Parses the project context to extract file content and return specific lines
     */
    extractLinesFromContext(projectContext, lineNumbers) {
        const lineMap = new Map();
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
     * Enrich chunks with actual line content extracted from project context
     */
    enrichChunksWithLineContent(chunks, projectContext) {
        // Extract all line numbers from chunk descriptions
        const lineNumbers = [];
        for (const chunk of chunks) {
            const match = chunk.description.match(/Line (\d+)/i);
            if (match) {
                lineNumbers.push(parseInt(match[1], 10));
            }
        }
        // Get all lines at once
        const lineMap = this.extractLinesFromContext(projectContext, lineNumbers);
        // Enrich each chunk with its line content
        return chunks.map(chunk => {
            const match = chunk.description.match(/Line (\d+)/i);
            if (match) {
                const lineNum = parseInt(match[1], 10);
                const lineContent = lineMap.get(lineNum);
                if (lineContent !== undefined) {
                    return {
                        ...chunk,
                        lineNumber: lineNum,
                        lineContent: lineContent
                    };
                }
            }
            return chunk;
        });
    }
    /**
     * Log prompt and response to file for debugging
     */
    logPrompt(agentName, model, messages, systemPrompt, response, metadata = {}) {
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
            }
            else if (Array.isArray(msg.content)) {
                content = JSON.stringify(msg.content, null, 2);
            }
            else {
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
    getSummary() {
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
    formatDuration(totalSeconds) {
        const roundedSeconds = Math.round(totalSeconds);
        const hours = Math.floor(roundedSeconds / 3600);
        const minutes = Math.floor((roundedSeconds % 3600) / 60);
        const seconds = roundedSeconds % 60;
        const pad = (value) => value.toString().padStart(2, '0');
        if (hours > 0) {
            return `${hours}:${pad(minutes)}:${pad(seconds)}`;
        }
        return `${minutes}:${pad(seconds)}`;
    }
}
exports.default = IterativeCollaborativeOrchestrator;
