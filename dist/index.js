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
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ConfigCascade_1 = require("./src/cli/ConfigCascade");
const PersonaSystem_1 = require("./src/cli/PersonaSystem");
const ModeDetector_1 = require("./src/cli/ModeDetector");
// Import command handlers
const discuss_1 = require("./src/commands/discuss");
const review_1 = require("./src/commands/review");
const iterate_1 = require("./src/commands/iterate");
const consult_1 = require("./src/commands/consult");
const template_1 = require("./src/commands/template");
const init_1 = require("./src/commands/init");
const templates_1 = require("./src/commands/templates");
const sessions_1 = require("./src/commands/sessions");
const continue_1 = require("./src/commands/continue");
const server_1 = require("./src/commands/server");
const config_1 = require("./src/commands/config");
const personas_1 = require("./src/commands/personas");
const program = new commander_1.Command();
// Banner
console.log(chalk_1.default.cyan(`
╔════════════════════════════════════════════════════════════════════════════════╗
║                              LLM CONCLAVE                                      ║
║                    Multi-Agent LLM Collaboration Tool                          ║
╚════════════════════════════════════════════════════════════════════════════════╝
`));
// Main program configuration
program
    .name('llm-conclave')
    .description('Multi-agent LLM collaboration tool')
    .version('2.0.0');
// Default action (smart mode when no subcommand specified)
program
    .argument('[task...]', 'Task for agents to solve')
    .option('-p, --project <path>', 'Project context (file or directory)')
    .option('-c, --config <path>', 'Custom config file')
    .option('--with <personas>', 'Comma-separated list of personas to use (e.g., security,performance)')
    .option('--quick', 'Quick mode (fewer rounds, faster)')
    .option('--deep', 'Deep mode (more rounds, thorough)')
    .option('--thorough', 'Thorough mode (maximum rounds)')
    .option('--stream', 'Stream agent responses (default: true)', true)
    .option('--no-stream', 'Disable streaming')
    .action(async (taskArgs, options) => {
    const task = taskArgs.join(' ');
    // If no task and no command, show interactive mode
    if (!task) {
        const InteractiveSession = (await Promise.resolve().then(() => __importStar(require('./src/interactive/InteractiveSession')))).default;
        const config = ConfigCascade_1.ConfigCascade.resolve(options);
        const projectId = config.project_id || null;
        const session = new InteractiveSession(config, projectId);
        await session.start();
        return;
    }
    // Smart mode: Auto-detect which mode to use
    await smartMode(task, options);
});
/**
 * Smart mode: Auto-detects the best mode based on task and context
 */
async function smartMode(task, options) {
    const inquirer = (await Promise.resolve().then(() => __importStar(require('inquirer')))).default;
    const ora = (await Promise.resolve().then(() => __importStar(require('ora')))).default;
    // Detect mode
    const detection = ModeDetector_1.ModeDetector.analyze(task, options);
    // Show detection result
    console.log(chalk_1.default.blue(`\n🔍 Task Analysis:`));
    console.log(`   Mode: ${chalk_1.default.bold(detection.mode)}`);
    console.log(`   Confidence: ${Math.round(detection.confidence * 100)}%`);
    console.log(`   Reason: ${detection.reason}\n`);
    // If confidence is low, ask user to confirm
    let finalMode = detection.mode;
    if (detection.confidence < 0.8) {
        const answer = await inquirer.prompt([{
                type: 'list',
                name: 'mode',
                message: 'Confirm mode or choose different:',
                choices: [
                    { name: `${detection.mode} (suggested)`, value: detection.mode },
                    { name: 'consensus - Democratic discussion', value: 'consensus' },
                    { name: 'orchestrated - Structured review', value: 'orchestrated' },
                    { name: 'iterative - Chunk-based collaboration', value: 'iterative' }
                ],
                default: detection.mode
            }]);
        finalMode = answer.mode;
    }
    // Show zero-config message if applicable
    if (ConfigCascade_1.ConfigCascade.shouldUseZeroConfig()) {
        console.log(chalk_1.default.yellow(ConfigCascade_1.ConfigCascade.getZeroConfigMessage()));
    }
    // Route to appropriate handler based on detected mode
    switch (finalMode) {
        case 'consensus':
            await runConsensusMode(task, options);
            break;
        case 'orchestrated':
            await runOrchestratedMode(task, options);
            break;
        case 'iterative':
            await runIterativeMode(task, options);
            break;
    }
}
/**
 * Run consensus mode (discuss command)
 */
async function runConsensusMode(task, options) {
    const ConversationManager = (await Promise.resolve().then(() => __importStar(require('./src/core/ConversationManager')))).default;
    const OutputHandler = (await Promise.resolve().then(() => __importStar(require('./src/core/OutputHandler')))).default;
    const ProviderFactory = (await Promise.resolve().then(() => __importStar(require('./src/providers/ProviderFactory')))).default;
    const ProjectContext = (await Promise.resolve().then(() => __importStar(require('./src/utils/ProjectContext')))).default;
    const config = ConfigCascade_1.ConfigCascade.resolve(options);
    // Use personas if specified
    if (options.with) {
        const personas = PersonaSystem_1.PersonaSystem.getPersonas(options.with);
        config.agents = PersonaSystem_1.PersonaSystem.personasToAgents(personas);
    }
    // Load project context if specified
    let context = null;
    if (options.project) {
        const projectContext = new ProjectContext(options.project);
        context = await projectContext.formatContext();
    }
    // Create judge
    const judge = {
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.'
    };
    // Run conversation
    const conversationManager = new ConversationManager(config, null, options.stream);
    const result = await conversationManager.startConversation(task, judge, context ? { formatContext: async () => context } : null);
    // Output results
    const filePaths = await OutputHandler.saveResults(result);
    OutputHandler.printSummary(result, filePaths);
    console.log(chalk_1.default.green('\n✓ Conversation complete!\n'));
}
/**
 * Run orchestrated mode (review command)
 */
async function runOrchestratedMode(task, options) {
    const Orchestrator = (await Promise.resolve().then(() => __importStar(require('./src/orchestration/Orchestrator')))).default;
    const config = ConfigCascade_1.ConfigCascade.resolve(options);
    // Use personas if specified
    if (options.with) {
        const personas = PersonaSystem_1.PersonaSystem.getPersonas(options.with);
        config.agents = PersonaSystem_1.PersonaSystem.personasToAgents(personas);
    }
    console.log(chalk_1.default.blue('Starting orchestrated review mode...\n'));
    // Initialize and run orchestrator
    const orchestrator = new Orchestrator(config);
    await orchestrator.executeTask(task, options.project || null);
    console.log(chalk_1.default.green('\n✓ Review complete!\n'));
}
/**
 * Run iterative mode (iterate command)
 */
async function runIterativeMode(task, options) {
    const IterativeCollaborativeOrchestrator = (await Promise.resolve().then(() => __importStar(require('./src/orchestration/IterativeCollaborativeOrchestrator')))).default;
    const config = ConfigCascade_1.ConfigCascade.resolve(options);
    // Use personas if specified
    if (options.with) {
        const personas = PersonaSystem_1.PersonaSystem.getPersonas(options.with);
        config.agents = PersonaSystem_1.PersonaSystem.personasToAgents(personas);
    }
    // Determine chunk size and rounds
    const chunkSize = options.chunkSize ||
        (options.project ? ModeDetector_1.ModeDetector.suggestChunkSize(options.project) : 3);
    const maxRounds = ModeDetector_1.ModeDetector.suggestRounds(task, options.quick ? 'quick' : options.deep ? 'deep' : options.thorough ? 'thorough' : undefined);
    console.log(chalk_1.default.blue(`Starting iterative mode (${chunkSize} items per chunk, ${maxRounds} rounds)...\n`));
    // Convert agents config to Agent[] format
    const ProviderFactory = (await Promise.resolve().then(() => __importStar(require('./src/providers/ProviderFactory')))).default;
    const agents = Object.keys(config.agents).map((name) => {
        const agentConfig = config.agents[name];
        return {
            name,
            model: agentConfig.model,
            provider: ProviderFactory.createProvider(agentConfig.model),
            systemPrompt: agentConfig.prompt || agentConfig.systemPrompt || ''
        };
    });
    // Create judge
    const judge = {
        name: 'Judge',
        model: config.judge.model,
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge coordinating the agents.'
    };
    // Initialize tool registry
    const ToolRegistry = (await Promise.resolve().then(() => __importStar(require('./src/tools/ToolRegistry')))).default;
    const toolRegistry = new ToolRegistry();
    // Initialize and run orchestrator
    const orchestrator = new IterativeCollaborativeOrchestrator(agents, judge, toolRegistry, { chunkSize, maxRoundsPerChunk: maxRounds, startChunk: options.startChunk || 1 });
    await orchestrator.run(task, options.project || null);
    console.log(chalk_1.default.green('\n✓ Iterative collaboration complete!\n'));
}
// Add subcommands
program.addCommand((0, discuss_1.createDiscussCommand)());
program.addCommand((0, review_1.createReviewCommand)());
program.addCommand((0, iterate_1.createIterateCommand)());
program.addCommand((0, consult_1.createConsultCommand)());
program.addCommand((0, template_1.createTemplateCommand)());
program.addCommand((0, init_1.createInitCommand)());
program.addCommand((0, templates_1.createTemplatesCommand)());
program.addCommand((0, personas_1.createPersonasCommand)());
program.addCommand((0, sessions_1.createSessionsCommand)());
program.addCommand((0, continue_1.createContinueCommand)());
program.addCommand((0, server_1.createServerCommand)());
program.addCommand((0, config_1.createConfigCommand)());
// Parse arguments
program.parse(process.argv);
