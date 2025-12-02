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
const ConfigLoader_1 = __importDefault(require("./src/core/ConfigLoader"));
const ConversationManager_1 = __importDefault(require("./src/core/ConversationManager"));
const OutputHandler_1 = __importDefault(require("./src/core/OutputHandler"));
const ProviderFactory_1 = __importDefault(require("./src/providers/ProviderFactory"));
const ProjectContext_1 = __importDefault(require("./src/utils/ProjectContext"));
const MemoryManager_1 = __importDefault(require("./src/memory/MemoryManager"));
const Orchestrator_1 = __importDefault(require("./src/orchestration/Orchestrator"));
const IterativeCollaborativeOrchestrator_1 = __importDefault(require("./src/orchestration/IterativeCollaborativeOrchestrator"));
const ToolRegistry_1 = __importDefault(require("./src/tools/ToolRegistry"));
const InteractiveInit_1 = __importDefault(require("./src/init/InteractiveInit"));
const ConfigWriter_1 = __importDefault(require("./src/init/ConfigWriter"));
const InteractiveSession_1 = __importDefault(require("./src/interactive/InteractiveSession"));
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
        // Load configuration
        let config;
        const configIndex = args.indexOf('--config');
        const configPath = configIndex !== -1 ? args[configIndex + 1] : null;
        try {
            config = ConfigLoader_1.default.load(configPath);
        }
        catch (error) {
            console.error(`\n❌ Configuration Error: ${error.message}\n`);
            console.log(`Run 'node index.js --init' to create an example configuration file.\n`);
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
        const nonFlagArgs = args.filter(arg => !arg.startsWith('--') &&
            arg !== configValue &&
            arg !== projectValue);
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
        const orchestrated = args.includes('--orchestrated');
        const iterative = args.includes('--iterative');
        let result;
        if (iterative) {
            // Use iterative collaborative mode
            console.log(`Mode: Iterative Collaborative (Multi-turn chunk-based discussion)\n`);
            // Parse chunk size and max rounds per chunk
            const chunkSizeIndex = args.indexOf('--chunk-size');
            const chunkSize = chunkSizeIndex !== -1 ? parseInt(args[chunkSizeIndex + 1]) : 3;
            const maxRoundsIndex = args.indexOf('--max-rounds-per-chunk');
            const maxRoundsPerChunk = maxRoundsIndex !== -1 ? parseInt(args[maxRoundsIndex + 1]) : 5;
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
                outputDir: './outputs/iterative',
                sharedOutputFile: 'shared_output.md'
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
            const orchestrator = new Orchestrator_1.default(config, memoryManager);
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
            const conversationManager = new ConversationManager_1.default(config, memoryManager);
            // Start the conversation
            console.log(`Starting conversation...\n`);
            result = await conversationManager.startConversation(task, judge, projectContext);
            // Save results
            const filePaths = OutputHandler_1.default.saveResults(result);
            // Print summary
            OutputHandler_1.default.printSummary(result, filePaths);
        }
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
  --project <path>    Include file or directory context for analysis
  --orchestrated      Use orchestrated mode (primary/secondary/validation flow)
  --iterative         Use iterative collaborative mode (multi-turn chunk discussion)
  --chunk-size <n>    Chunk size for iterative mode (default: 3)
  --max-rounds-per-chunk <n>  Max discussion rounds per chunk (default: 5)

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
