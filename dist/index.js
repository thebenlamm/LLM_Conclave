#!/usr/bin/env node
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config({ override: true });
const fs = __importStar(require("fs"));
const readline = __importStar(require("readline"));
const path = __importStar(require("path"));
const ConfigLoader_1 = __importDefault(require("./src/core/ConfigLoader"));
const ConversationManager_1 = __importDefault(require("./src/core/ConversationManager"));
const OutputHandler_1 = __importDefault(require("./src/core/OutputHandler"));
const SessionManager_1 = __importDefault(require("./src/core/SessionManager"));
const ContinuationHandler_1 = __importDefault(require("./src/core/ContinuationHandler"));
const ProviderFactory_1 = __importDefault(require("./src/providers/ProviderFactory"));
const ProjectContext_1 = __importDefault(require("./src/utils/ProjectContext"));
const MemoryManager_1 = __importDefault(require("./src/memory/MemoryManager"));
const Orchestrator_1 = __importDefault(require("./src/orchestration/Orchestrator"));
const IterativeCollaborativeOrchestrator_1 = __importDefault(require("./src/orchestration/IterativeCollaborativeOrchestrator"));
const ToolRegistry_1 = __importDefault(require("./src/tools/ToolRegistry"));
const InteractiveInit_1 = __importDefault(require("./src/init/InteractiveInit"));
const ConfigWriter_1 = __importDefault(require("./src/init/ConfigWriter"));
const InteractiveSession_1 = __importDefault(require("./src/interactive/InteractiveSession"));
const CostTracker_1 = require("./src/core/CostTracker");
const TemplateManager_1 = require("./src/core/TemplateManager");
const Server_1 = require("./src/server/Server");
/**
 * Main CLI entry point for LLM Conclave
 */
async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
║                              LLM CONCLAVE                                      ║
║                    Multi-Agent LLM Collaboration Tool                          ║
╚════════════════════════════════════════════════════════════════════════════════╝
`);
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        // Handle --server flag
        if (args.includes('--server')) {
            const portIndex = args.indexOf('--port');
            const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : 3000;
            console.log(`Starting Web UI Server...`);
            new Server_1.Server(port);
            // Keep process alive
            return;
        }
        // If no arguments, launch interactive mode
        if (args.length === 0) {
            // Load configuration
            let config;
            try {
                config = ConfigLoader_1.default.load();
            }
            catch (error) {
                console.error(`\n❌ Configuration Error: ${error.message}\n`);
                console.log(`Run 'llm-conclave --init' to create a configuration file.\n`);
                process.exit(1);
            }
            // Get project ID from config if available
            const projectId = config.project_id || null;
            // Launch interactive session
            const session = new InteractiveSession_1.default(config, projectId);
            await session.start();
            return; // Interactive session handles its own exit
        }
        // Handle special commands
        if (args.includes('--help') || args.includes('-h')) {
            printHelp();
            process.exit(0);
        }
        if (args.includes('--list-templates')) {
            const templateManager = new TemplateManager_1.TemplateManager();
            const templates = templateManager.listTemplates();
            console.log(`\nAvailable Templates:\n`);
            templates.forEach(t => {
                console.log(`  ${t.name.padEnd(20)} - ${t.description} [Mode: ${t.mode}]`);
            });
            console.log(`\nUsage: llm-conclave --template <name> [options] "Task"\n`);
            process.exit(0);
        }
        if (args.includes('--init')) {
            // Check if user wants template-only mode
            const templateOnly = args.includes('--template-only');
            if (templateOnly) {
                // Create template config (old behavior)
                await ConfigWriter_1.default.createTemplate();
            }
            else {
                // Run interactive init
                const projectNameIndex = args.indexOf('--init');
                const projectName = args[projectNameIndex + 1] && !args[projectNameIndex + 1].startsWith('--')
                    ? args[projectNameIndex + 1]
                    : null;
                // Get scanning options
                const scan = args.includes('--scan');
                const noScan = args.includes('--no-scan');
                const scanTimeoutIndex = args.indexOf('--scan-timeout');
                const scanTimeout = scanTimeoutIndex !== -1 ? parseInt(args[scanTimeoutIndex + 1]) : null;
                const init = new InteractiveInit_1.default({
                    projectName,
                    overwrite: args.includes('--overwrite'),
                    scan,
                    noScan,
                    scanTimeout
                });
                await init.run();
            }
            process.exit(0);
        }
        // Handle project memory commands
        if (args.includes('--init-project')) {
            await handleInitProject(args);
            process.exit(0);
        }
        if (args.includes('--list-projects')) {
            await handleListProjects();
            process.exit(0);
        }
        if (args.includes('--project-info')) {
            await handleProjectInfo(args);
            process.exit(0);
        }
        if (args.includes('--delete-project')) {
            await handleDeleteProject(args);
            process.exit(0);
        }
        // Handle session management commands
        if (args.includes('--list-sessions')) {
            await handleListSessions(args);
            process.exit(0);
        }
        if (args.includes('--show-session')) {
            await handleShowSession(args);
            process.exit(0);
        }
        if (args.includes('--delete-session')) {
            await handleDeleteSession(args);
            process.exit(0);
        }
        // Handle resume/continue
        if (args.includes('--continue') || args.includes('--resume')) {
            await handleResumeSession(args);
            process.exit(0);
        }
        // Load configuration or template
        let config;
        const configIndex = args.indexOf('--config');
        const configPath = configIndex !== -1 ? args[configIndex + 1] : null;
        const templateIndex = args.indexOf('--template') !== -1 ? args.indexOf('--template') : args.indexOf('--runbook');
        const templateName = templateIndex !== -1 ? args[templateIndex + 1] : null;
        let templateMode = null;
        let templateChunkSize;
        try {
            if (templateName) {
                console.log(`Loading template: ${templateName}`);
                const templateManager = new TemplateManager_1.TemplateManager();
                const template = templateManager.getTemplate(templateName);
                if (!template) {
                    throw new Error(`Template '${templateName}' not found. Use --list-templates to see available options.`);
                }
                config = templateManager.convertToConfig(template);
                templateMode = template.mode;
                templateChunkSize = template.chunkSize;
                console.log(`✓ Template loaded (Mode: ${template.mode})`);
            }
            else {
                // Load from file
                config = ConfigLoader_1.default.load(configPath);
            }
        }
        catch (error) {
            console.error(`\n❌ Configuration Error: ${error.message}\n`);
            if (!templateName) {
                console.log(`Run 'node index.js --init' to create an example configuration file.\n`);
            }
            process.exit(1);
        }
        // Check for project memory
        let memoryManager = null;
        const projectIdIndex = args.indexOf('--project-id');
        let projectId = projectIdIndex !== -1 ? args[projectIdIndex + 1] : null;
        // If no --project-id flag, check if config has a default project_id
        if (!projectId && config.project_id) {
            projectId = config.project_id;
            console.log(`\nUsing default project from config: ${projectId}`);
        }
        if (projectId) {
            console.log(projectIdIndex !== -1 ? `\nLoading project memory: ${projectId}` : '');
            memoryManager = new MemoryManager_1.default();
            try {
                await memoryManager.loadProject(projectId);
                console.log(`✓ Project memory loaded`);
                if (memoryManager.projectMemory) {
                    console.log(`  Total conversations: ${memoryManager.projectMemory.metadata.totalConversations}`);
                    console.log(`  Total decisions: ${memoryManager.projectMemory.metadata.totalDecisions}\n`);
                }
            }
            catch (error) {
                console.error(`\n❌ ${error.message}\n`);
                process.exit(1);
            }
        }
        // Check for project context
        let projectContext = null;
        const projectIndex = args.indexOf('--project');
        const projectPath = projectIndex !== -1 ? args[projectIndex + 1] : null;
        if (projectPath) {
            console.log(`\nLoading project context from: ${projectPath}`);
            projectContext = new ProjectContext_1.default(projectPath);
            const loadResult = await projectContext.load();
            if (!loadResult.success) {
                console.error(`\n❌ Project Context Error: ${loadResult.error}\n`);
                process.exit(1);
            }
            console.log(`✓ ${projectContext.getSummary()}\n`);
        }
        // Get task from arguments or prompt user
        let task = null;
        // Check if task is provided as argument
        const configValue = configIndex !== -1 ? args[configIndex + 1] : null;
        const projectValue = projectIndex !== -1 ? args[projectIndex + 1] : null;
        const templateValue = templateIndex !== -1 ? args[templateIndex + 1] : null;
        const nonFlagArgs = args.filter(arg => !arg.startsWith('--') &&
            arg !== configValue &&
            arg !== projectValue &&
            arg !== templateValue);
        if (nonFlagArgs.length > 0) {
            task = nonFlagArgs.join(' ');
        }
        // Check if task is a file path
        if (task && fs.existsSync(task)) {
            console.log(`Reading task from file: ${task}`);
            task = fs.readFileSync(task, 'utf8').trim();
        }
        // If no task provided, prompt for it
        if (!task) {
            task = await promptForTask();
        }
        if (!task || task.trim() === '') {
            console.error('❌ No task provided. Exiting.\n');
            process.exit(1);
        }
        console.log(`\nTask: ${task}\n`);
        console.log(`Agents: ${Object.keys(config.agents).join(', ')}`);
        // Check operational mode
        const orchestrated = args.includes('--orchestrated') || (!args.includes('--iterative') && templateMode === 'orchestrated');
        const iterative = args.includes('--iterative') || (!args.includes('--orchestrated') && templateMode === 'iterative');
        const streamOutput = args.includes('--stream');
        let result;
        if (iterative) {
            // Use iterative collaborative mode
            console.log(`Mode: Iterative Collaborative (Multi-turn chunk-based discussion)\n`);
            // Parse chunk size and max rounds per chunk
            const chunkSizeIndex = args.indexOf('--chunk-size');
            const chunkSize = chunkSizeIndex !== -1 ? parseInt(args[chunkSizeIndex + 1]) : (templateChunkSize || 3);
            const maxRoundsIndex = args.indexOf('--max-rounds-per-chunk');
            const maxRoundsPerChunk = maxRoundsIndex !== -1 ? parseInt(args[maxRoundsIndex + 1]) : 5;
            const startChunkIndex = args.indexOf('--start-chunk');
            const startChunk = startChunkIndex !== -1 ? parseInt(args[startChunkIndex + 1]) : 1;
            // Initialize agents
            const agents = Object.entries(config.agents).map(([name, agentConfig]) => ({
                name,
                model: agentConfig.model,
                provider: ProviderFactory_1.default.createProvider(agentConfig.model),
                systemPrompt: agentConfig.prompt
            }));
            // Initialize judge
            const judge = {
                name: 'Judge',
                model: config.judge.model,
                provider: ProviderFactory_1.default.createProvider(config.judge.model),
                systemPrompt: config.judge.prompt
            };
            // Initialize tool registry
            const toolRegistry = new ToolRegistry_1.default();
            // Create iterative orchestrator
            const orchestrator = new IterativeCollaborativeOrchestrator_1.default(agents, judge, toolRegistry, {
                chunkSize,
                maxRoundsPerChunk,
                startChunk,
                outputDir: './outputs/iterative',
                sharedOutputFile: 'shared_output.md',
                streamOutput
            });
            // Run the iterative process
            const contextString = projectContext ? projectContext.formatContext() : undefined;
            await orchestrator.run(task, contextString);
            // Get and print summary
            const summary = orchestrator.getSummary();
            console.log(`\n${'='.repeat(80)}`);
            console.log(`ITERATIVE COLLABORATIVE SESSION COMPLETE`);
            console.log(`${'='.repeat(80)}\n`);
            console.log(`Files saved:`);
            console.log(`  - Shared output: ${summary.sharedOutputFile}`);
            for (const [agentName, filePath] of Object.entries(summary.agentStateFiles)) {
                console.log(`  - ${agentName} notes: ${filePath}`);
            }
            console.log();
        }
        else if (orchestrated) {
            // Use orchestrated mode
            console.log(`Mode: Orchestrated (Primary/Secondary/Validation flow)\n`);
            const orchestrator = new Orchestrator_1.default(config, memoryManager, streamOutput);
            result = await orchestrator.executeTask(task, projectContext);
            // Save orchestrated results
            const filePaths = saveOrchestratedResults(result);
            printOrchestratedSummary(result, filePaths);
        }
        else {
            // Use standard consensus mode
            console.log(`Judge Model: ${config.judge.model}`);
            console.log(`Max Rounds: ${config.max_rounds}`);
            console.log(`Turn Management: ${config.turn_management}\n`);
            // Initialize judge
            const judge = {
                provider: ProviderFactory_1.default.createProvider(config.judge.model),
                systemPrompt: config.judge.prompt
            };
            // Create conversation manager with optional memory manager
            const conversationManager = new ConversationManager_1.default(config, memoryManager, streamOutput);
            // Start the conversation
            console.log(`Starting conversation...\n`);
            result = await conversationManager.startConversation(task, judge, projectContext);
            // Save results (async with parallel writes)
            const filePaths = await OutputHandler_1.default.saveResults(result);
            // Print summary
            OutputHandler_1.default.printSummary(result, filePaths);
            // Save session for resume/continuation
            const sessionManager = new SessionManager_1.default();
            const session = sessionManager.createSessionManifest('consensus', task, Object.values(conversationManager.agents), result.conversationHistory, { ...result, ...filePaths }, judge, projectContext?.formatContext());
            await sessionManager.saveSession(session);
            console.log(`\n✓ Session saved: ${session.id}`);
            console.log(`  Use --continue or --resume ${session.id} to ask follow-up questions\n`);
        }
        const summary = CostTracker_1.CostTracker.getInstance().getSummary();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`SESSION COST & PERFORMANCE`);
        console.log(`${'='.repeat(80)}\n`);
        console.log(`Total Cost: $${summary.totalCost.toFixed(6)}`);
        console.log(`Total Tokens: ${summary.totalTokens.input + summary.totalTokens.output} (Input: ${summary.totalTokens.input}, Output: ${summary.totalTokens.output})`);
        console.log(`Total Calls: ${summary.totalCalls}`);
        console.log(`Average Latency: ${summary.averageLatency.toFixed(2)}ms`);
        const logs = CostTracker_1.CostTracker.getInstance().getLogs();
        const costLogPath = path.join(process.cwd(), 'cost_log.json');
        fs.writeFileSync(costLogPath, JSON.stringify({
            summary: summary,
            calls: logs,
            timestamp: new Date().toISOString()
        }, null, 2));
        console.log(`\nCost log saved to: ${costLogPath}`);
        console.log(`\n${'='.repeat(80)}\n`);
    }
    catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}
/**
 * Prompt user for task input
 */
async function promptForTask() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question('Enter the task for the agents to solve: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
/**
 * Print help information
 */
function printHelp() {
    console.log(`
Usage: node index.js [options] [task]

Options:
  --help, -h          Show this help message
  --init [name]       Interactive setup wizard (creates config and project)
  --init --template-only    Create template config without interactive setup
  --config <path>     Specify a custom configuration file path
  --template <name>   Use a built-in template (alias: --runbook)
  --list-templates    List all available templates
  --project <path>    Include file or directory context for analysis
  --orchestrated      Use orchestrated mode (primary/secondary/validation flow)
  --iterative         Use iterative collaborative mode (multi-turn chunk discussion)
  --stream            Stream agent responses as they are generated
  --chunk-size <n>    Chunk size for iterative mode (default: 3)
  --max-rounds-per-chunk <n>  Max discussion rounds per chunk (default: 5)
  --start-chunk <n>   Resume from specific chunk number (default: 1)

Init Options:
  --scan              Force project directory scanning
  --no-scan           Skip project scanning (faster setup)
  --scan-timeout <s>  Scan timeout in seconds (default: 30)

Project Memory Options:
  --init-project <id>       Create a new project with persistent memory
  --project-id <id>         Use an existing project (loads its memory)
  --list-projects           List all projects
  --project-info <id>       Show information about a project
  --delete-project <id>     Delete a project

Session Management Options:
  --list-sessions           List all saved conversation sessions
  --show-session <id>       Show details of a specific session
  --continue                Continue the most recent session with a follow-up
  --resume <id>             Resume a specific session by ID
  --delete-session <id>     Delete a saved session

Modes:
  Standard Mode (default):
    - All agents discuss together in rounds
    - Judge evaluates consensus
    - Best for open-ended collaboration

  Orchestrated Mode (--orchestrated):
    - Primary agent responds first (based on task classification)
    - Secondary agents provide structured critiques
    - Primary agent revises based on feedback
    - Validator agents review final output
    - Best for domain-specific advisory workflows

  Iterative Collaborative Mode (--iterative):
    - Work is divided into configurable chunks
    - Each chunk has multi-turn discussion rounds
    - Agents can respond to each other within each chunk
    - Each agent maintains their own state/notes file
    - Only judge writes to shared output file
    - Best for incremental, collaborative tasks (e.g., OCR correction, line-by-line editing)

Task Input:
  You can provide the task in three ways:
  1. As a command-line argument: node index.js "Design a social media app"
  2. As a file path: node index.js task.txt
  3. Interactively: node index.js (you'll be prompted)

Project Context:
  Use --project to point the conclave at a file or directory.
  - Single file: Reads and includes that file's content
  - Directory: Reads all files with smart filtering (excludes node_modules, .git, binaries, large files)

Configuration:
  The tool looks for .llm-conclave.json in the current directory.
  Use --init to create an example configuration file.

Examples:
  # Interactive Setup (Recommended - First Time)
  node index.js --init                    # Guided setup with AI-generated agents
  node index.js --init my-project         # Setup with project name
  node index.js --init --scan             # Force project scanning
  node index.js --init --no-scan          # Skip scanning (faster)

  # Running Tasks
  node index.js "Create a task management app"
  node index.js task.txt
  node index.js --orchestrated "Name our product"
  node index.js --orchestrated "Plan our launch strategy"

  # Iterative Collaborative Mode
  node index.js --iterative --project oz.txt "Correct all OCR errors line by line"
  node index.js --iterative --chunk-size 5 "Review and improve documentation"
  node index.js --iterative --max-rounds-per-chunk 3 "Edit code incrementally"

Environment Variables:
  OPENAI_API_KEY      - OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY   - Anthropic API key (for Claude models)
  XAI_API_KEY         - xAI API key (for Grok models)

  Create a .env file in the project root with these variables.
`);
}
/**
 * Handle --init-project command
 */
async function handleInitProject(args) {
    const index = args.indexOf('--init-project');
    const projectId = args[index + 1];
    if (!projectId) {
        console.error('❌ Please provide a project ID: --init-project <id>\n');
        process.exit(1);
    }
    const memoryManager = new MemoryManager_1.default();
    try {
        await memoryManager.createProject(projectId, {});
        console.log(`✓ Created project: ${projectId}`);
        console.log(`  Memory stored in: .conclave/projects/${projectId}.json`);
        console.log(`\nNext steps:`);
        console.log(`  1. Run: node index.js --project-id ${projectId} "your task"`);
        console.log(`  2. The project will remember all decisions and context\n`);
    }
    catch (error) {
        console.error(`❌ ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --list-projects command
 */
async function handleListProjects() {
    const memoryManager = new MemoryManager_1.default();
    try {
        const projects = await memoryManager.listProjects();
        if (projects.length === 0) {
            console.log('No projects found. Create one with: --init-project <id>\n');
            return;
        }
        console.log(`Found ${projects.length} project(s):\n`);
        for (const projectId of projects) {
            const info = await memoryManager.getProjectInfo(projectId);
            console.log(`  ${projectId}`);
            if (info) {
                console.log(`    Created: ${new Date(info.created).toLocaleDateString()}`);
                console.log(`    Last Modified: ${new Date(info.lastModified).toLocaleDateString()}`);
                console.log(`    Conversations: ${info.totalConversations}, Decisions: ${info.totalDecisions}`);
                if (info.overview) {
                    console.log(`    Overview: ${info.overview}`);
                }
            }
            console.log();
        }
    }
    catch (error) {
        console.error(`❌ ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --project-info command
 */
async function handleProjectInfo(args) {
    const index = args.indexOf('--project-info');
    const projectId = args[index + 1];
    if (!projectId) {
        console.error('❌ Please provide a project ID: --project-info <id>\n');
        process.exit(1);
    }
    const memoryManager = new MemoryManager_1.default();
    try {
        await memoryManager.loadProject(projectId);
        const memory = memoryManager.projectMemory;
        if (!memory) {
            throw new Error('Project memory not loaded');
        }
        console.log(`\nProject: ${projectId}`);
        console.log(`${'='.repeat(80)}\n`);
        console.log(`Created: ${new Date(memory.created).toLocaleString()}`);
        console.log(`Last Modified: ${new Date(memory.lastModified).toLocaleString()}\n`);
        if (memory.coreContext.overview) {
            console.log(`Overview: ${memory.coreContext.overview}\n`);
        }
        if (memory.coreContext.goals.length > 0) {
            console.log(`Goals:`);
            memory.coreContext.goals.forEach((g) => console.log(`  - ${g}`));
            console.log();
        }
        console.log(`Statistics:`);
        console.log(`  Total Conversations: ${memory.metadata.totalConversations}`);
        console.log(`  Total Decisions: ${memory.metadata.totalDecisions}`);
        if (Object.keys(memory.metadata.agentParticipation).length > 0) {
            console.log(`\nAgent Participation:`);
            Object.entries(memory.metadata.agentParticipation).forEach(([agent, count]) => {
                console.log(`  ${agent}: ${count} conversations`);
            });
        }
        if (memory.decisions.length > 0) {
            console.log(`\nRecent Decisions (last 5):`);
            memory.decisions.slice(-5).forEach((d) => {
                console.log(`  - ${d.topic} (${new Date(d.timestamp).toLocaleDateString()})`);
                if (d.outcome) {
                    console.log(`    ${d.outcome.substring(0, 100)}${d.outcome.length > 100 ? '...' : ''}`);
                }
            });
        }
        console.log();
    }
    catch (error) {
        console.error(`❌ ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --delete-project command
 */
async function handleDeleteProject(args) {
    const index = args.indexOf('--delete-project');
    const projectId = args[index + 1];
    if (!projectId) {
        console.error('❌ Please provide a project ID: --delete-project <id>\n');
        process.exit(1);
    }
    const memoryManager = new MemoryManager_1.default();
    try {
        await memoryManager.deleteProject(projectId);
        console.log(`✓ Deleted project: ${projectId}\n`);
    }
    catch (error) {
        console.error(`❌ ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --list-sessions command
 */
async function handleListSessions(args) {
    const sessionManager = new SessionManager_1.default();
    await sessionManager.initialize();
    // Parse filters from args
    const modeIndex = args.indexOf('--mode');
    const mode = modeIndex !== -1 ? args[modeIndex + 1] : undefined;
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 10;
    try {
        const sessions = await sessionManager.listSessions({ mode, limit });
        if (sessions.length === 0) {
            console.log('\nNo sessions found.\n');
            console.log('Sessions are automatically saved after each conversation.');
            console.log('Run a conversation first, then use --list-sessions to see it.\n');
            return;
        }
        console.log(`\nRecent Sessions (showing ${sessions.length}):\n`);
        sessions.forEach((session, index) => {
            console.log(sessionManager.formatSessionSummary(session, index + 1));
            console.log();
        });
        console.log(`\nUse --show-session <id> to see full details`);
        console.log(`Use --continue or --resume <id> to continue a conversation\n`);
    }
    catch (error) {
        console.error(`❌ Error listing sessions: ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --show-session command
 */
async function handleShowSession(args) {
    const sessionManager = new SessionManager_1.default();
    const continuationHandler = new ContinuationHandler_1.default();
    const index = args.indexOf('--show-session');
    const sessionId = args[index + 1];
    if (!sessionId) {
        console.error('❌ Please provide a session ID: --show-session <id>\n');
        console.log('Use --list-sessions to see available sessions\n');
        process.exit(1);
    }
    try {
        const session = await sessionManager.loadSession(sessionId);
        if (!session) {
            console.error(`❌ Session '${sessionId}' not found.\n`);
            console.log('Use --list-sessions to see available sessions\n');
            process.exit(1);
        }
        console.log('\n' + '='.repeat(80));
        console.log('SESSION DETAILS');
        console.log('='.repeat(80) + '\n');
        console.log(continuationHandler.extractSessionSummary(session));
        console.log('\n' + '='.repeat(80) + '\n');
    }
    catch (error) {
        console.error(`❌ Error loading session: ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --delete-session command
 */
async function handleDeleteSession(args) {
    const sessionManager = new SessionManager_1.default();
    const index = args.indexOf('--delete-session');
    const sessionId = args[index + 1];
    if (!sessionId) {
        console.error('❌ Please provide a session ID: --delete-session <id>\n');
        console.log('Use --list-sessions to see available sessions\n');
        process.exit(1);
    }
    try {
        const success = await sessionManager.deleteSession(sessionId);
        if (success) {
            console.log(`✓ Deleted session: ${sessionId}\n`);
        }
        else {
            console.error(`❌ Failed to delete session: ${sessionId}\n`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error(`❌ Error deleting session: ${error.message}\n`);
        process.exit(1);
    }
}
/**
 * Handle --continue or --resume command
 */
async function handleResumeSession(args) {
    const sessionManager = new SessionManager_1.default();
    const continuationHandler = new ContinuationHandler_1.default();
    // Determine if it's --continue (most recent) or --resume <id>
    const isContinue = args.includes('--continue');
    const resumeIndex = args.indexOf('--resume');
    let sessionId = null;
    if (isContinue) {
        // Load most recent session
        const recentSession = await sessionManager.getMostRecentSession();
        if (!recentSession) {
            console.error('❌ No sessions found to continue.\n');
            console.log('Run a conversation first before using --continue\n');
            process.exit(1);
        }
        sessionId = recentSession.id;
    }
    else if (resumeIndex !== -1) {
        // Load specific session
        sessionId = args[resumeIndex + 1];
        if (!sessionId) {
            console.error('❌ Please provide a session ID: --resume <id>\n');
            console.log('Use --list-sessions to see available sessions\n');
            process.exit(1);
        }
    }
    if (!sessionId) {
        console.error('❌ No session specified\n');
        process.exit(1);
    }
    // Load session
    const session = await sessionManager.loadSession(sessionId);
    if (!session) {
        console.error(`❌ Session '${sessionId}' not found.\n`);
        console.log('Use --list-sessions to see available sessions\n');
        process.exit(1);
    }
    // Validate resumable
    const validation = continuationHandler.validateResumable(session);
    if (!validation.isValid) {
        console.error(`❌ Cannot resume session:\n`);
        validation.warnings.forEach(w => console.error(`  - ${w}`));
        console.error();
        process.exit(1);
    }
    if (validation.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        validation.warnings.forEach(w => console.log(`  - ${w}`));
        console.log();
    }
    // Display session info
    console.log('\n' + '='.repeat(80));
    console.log('RESUMING SESSION');
    console.log('='.repeat(80) + '\n');
    console.log(`Session ID: ${session.id}`);
    console.log(`Original Task: ${session.task}`);
    console.log(`Mode: ${session.mode}`);
    console.log(`Previous Rounds: ${session.currentRound}`);
    if (session.finalSolution) {
        const preview = session.finalSolution.substring(0, 150);
        console.log(`Previous Outcome: ${preview}${session.finalSolution.length > 150 ? '...' : ''}`);
    }
    console.log('\n' + '='.repeat(80) + '\n');
    // Get follow-up task
    const followUpTaskIndex = args.findIndex(arg => !arg.startsWith('--') && arg !== sessionId);
    let followUpTask;
    if (followUpTaskIndex !== -1) {
        followUpTask = args[followUpTaskIndex];
    }
    else {
        // Prompt for follow-up
        followUpTask = await promptForFollowUp();
    }
    if (!followUpTask || followUpTask.trim() === '') {
        console.error('❌ No follow-up question provided\n');
        process.exit(1);
    }
    console.log(`Follow-up: ${followUpTask}\n`);
    // Prepare continuation
    const prepared = continuationHandler.prepareForContinuation(session, followUpTask);
    // Load configuration based on session's agents
    let config;
    try {
        config = ConfigLoader_1.default.load();
    }
    catch (error) {
        // Create minimal config from session
        config = {
            turn_management: 'consensus',
            max_rounds: 3,
            judge: {
                model: session.judge?.model || 'gpt-4o',
                prompt: session.judge?.systemPrompt || 'You are the judge. Evaluate consensus.'
            },
            agents: {}
        };
        session.agents.forEach(agent => {
            config.agents[agent.name] = {
                model: agent.model,
                prompt: agent.systemPrompt
            };
        });
    }
    // Create conversation manager
    const conversationManager = new ConversationManager_1.default(config, null, false);
    // Create judge
    const judge = {
        provider: ProviderFactory_1.default.createProvider(session.judge?.model || config.judge.model),
        systemPrompt: session.judge?.systemPrompt || config.judge.prompt
    };
    // Start continuation
    console.log(`Starting continuation...\n`);
    const result = await conversationManager.startConversation(prepared.newTask, judge, null);
    // Save as new session linked to parent
    const newSession = sessionManager.createSessionManifest(session.mode, prepared.newTask, Object.values(conversationManager.agents), result.conversationHistory, result, judge, session.projectContext);
    newSession.parentSessionId = session.id;
    await sessionManager.saveSession(newSession);
    // Save outputs
    const filePaths = await OutputHandler_1.default.saveResults(result);
    OutputHandler_1.default.printSummary(result, filePaths);
    // Show cost summary
    const summary = CostTracker_1.CostTracker.getInstance().getSummary();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`SESSION COST & PERFORMANCE`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`Total Cost: $${summary.totalCost.toFixed(6)}`);
    console.log(`Total Tokens: ${summary.totalTokens.input + summary.totalTokens.output}`);
    console.log();
    console.log(`✓ Continuation saved as session: ${newSession.id}`);
    console.log(`  (Parent session: ${session.id})\n`);
}
/**
 * Prompt for follow-up question
 */
async function promptForFollowUp() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question('Enter your follow-up question or task: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
/**
 * Save orchestrated conversation results
 */
function saveOrchestratedResults(result) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const outputDir = `outputs/conclave-${timestamp}`;
    // Create output directory
    if (!fs.existsSync('outputs')) {
        fs.mkdirSync('outputs');
    }
    fs.mkdirSync(outputDir);
    const transcriptPath = `${outputDir}/conclave-${timestamp}-orchestrated-transcript.md`;
    const finalPath = `${outputDir}/conclave-${timestamp}-final-output.md`;
    const jsonPath = `${outputDir}/conclave-${timestamp}-full.json`;
    // Generate transcript
    let transcript = `# LLM Conclave Orchestrated Conversation\n\n`;
    transcript += `**Task:** ${result.task}\n\n`;
    transcript += `**Mode:** Orchestrated\n\n`;
    transcript += `**Primary Agent:** ${result.classification.primaryAgent}\n`;
    transcript += `**Task Type:** ${result.classification.taskType}\n`;
    transcript += `**Confidence:** ${(result.classification.confidence * 100).toFixed(0)}%\n\n`;
    transcript += `---\n\n`;
    transcript += `## Phase 1: Primary Response\n\n`;
    transcript += `**Agent:** ${result.classification.primaryAgent}\n\n`;
    transcript += `${result.primaryResponse}\n\n`;
    transcript += `---\n\n`;
    transcript += `## Phase 2: Critiques\n\n`;
    result.critiques.forEach((critique) => {
        transcript += `### ${critique.agent}\n\n`;
        transcript += `${critique.content}\n\n`;
    });
    transcript += `---\n\n`;
    transcript += `## Phase 3: Revised Response\n\n`;
    transcript += `**Agent:** ${result.classification.primaryAgent}\n\n`;
    transcript += `${result.revisedResponse}\n\n`;
    if (result.validations && result.validations.length > 0) {
        transcript += `---\n\n`;
        transcript += `## Phase 4: Validation\n\n`;
        result.validations.forEach((validation) => {
            transcript += `### ${validation.validator}\n\n`;
            transcript += `**Status:** ${validation.status}\n\n`;
            transcript += `${validation.content}\n\n`;
        });
    }
    // Write files
    fs.writeFileSync(transcriptPath, transcript);
    let finalOutput = `# Final Output\n\n`;
    finalOutput += `**Task:** ${result.task}\n\n`;
    finalOutput += `---\n\n`;
    finalOutput += `${result.finalOutput}\n`;
    if (result.validations && result.validations.length > 0) {
        finalOutput += `\n---\n\n## Validation Summary\n\n`;
        result.validations.forEach((v) => {
            finalOutput += `- **${v.validator}:** ${v.status}\n`;
        });
    }
    fs.writeFileSync(finalPath, finalOutput);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    return {
        transcript: transcriptPath,
        final: finalPath,
        json: jsonPath
    };
}
/**
 * Print orchestrated conversation summary
 */
function printOrchestratedSummary(result, filePaths) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ORCHESTRATED CONVERSATION COMPLETE`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`Task: ${result.task}`);
    console.log(`Primary Agent: ${result.classification.primaryAgent}`);
    console.log(`Task Type: ${result.classification.taskType}\n`);
    if (result.validations && result.validations.length > 0) {
        console.log(`Validation Results:`);
        result.validations.forEach((v) => {
            const icon = v.status === 'PASS' ? '✓' : v.status === 'FAIL' ? '✗' : '⚠';
            console.log(`  ${icon} ${v.validator}: ${v.status}`);
        });
        console.log();
    }
    console.log(`Files saved:`);
    console.log(`  - Full transcript: ${filePaths.transcript}`);
    console.log(`  - Final output: ${filePaths.final}`);
    console.log(`  - JSON data: ${filePaths.json}\n`);
    console.log(`Final Output:`);
    console.log(`${'-'.repeat(80)}`);
    const preview = result.finalOutput.substring(0, 500);
    console.log(preview);
    if (result.finalOutput.length > 500) {
        console.log(`\n... (see ${filePaths.final} for full output)`);
    }
    console.log(`${'-'.repeat(80)}\n`);
}
// Run main function
if (require.main === module) {
    main();
}
module.exports = { main };
