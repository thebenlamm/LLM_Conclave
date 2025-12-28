"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIterateCommand = createIterateCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ConfigCascade_1 = require("../cli/ConfigCascade");
const PersonaSystem_1 = require("../cli/PersonaSystem");
const ModeDetector_1 = require("../cli/ModeDetector");
const IterativeCollaborativeOrchestrator_1 = __importDefault(require("../orchestration/IterativeCollaborativeOrchestrator"));
const ToolRegistry_1 = __importDefault(require("../tools/ToolRegistry"));
const ProviderFactory_1 = __importDefault(require("../providers/ProviderFactory"));
/**
 * Iterate command - Iterative collaborative mode
 * Chunk-based multi-turn discussions
 */
function createIterateCommand() {
    const cmd = new commander_1.Command('iterate');
    cmd
        .description('Iterative collaborative mode (chunk-based)')
        .argument('<task...>', 'Task to iterate on')
        .option('-p, --project <path>', 'Project context (file or directory)')
        .option('-c, --config <path>', 'Custom config file')
        .option('--with <personas>', 'Comma-separated list of personas (e.g., security,performance)')
        .option('--chunk-size <n>', 'Items per chunk (auto-detected if omitted)')
        .option('--rounds <n>', 'Rounds per chunk (auto-detected if omitted)')
        .option('--start-chunk <n>', 'Resume from chunk number', '1')
        .option('--quick', 'Quick mode (2 rounds per chunk)')
        .option('--deep', 'Deep mode (7 rounds per chunk)')
        .option('--thorough', 'Thorough mode (10 rounds per chunk)')
        .option('--stream', 'Stream agent responses', true)
        .option('--no-stream', 'Disable streaming')
        .action(async (taskArgs, options) => {
        const task = taskArgs.join(' ');
        console.log(chalk_1.default.blue('\n🔄 Starting iterative collaboration...\n'));
        // Resolve configuration
        const config = ConfigCascade_1.ConfigCascade.resolve(options);
        // Use personas if specified
        if (options.with) {
            console.log(chalk_1.default.cyan(`Using personas: ${options.with}\n`));
            const personas = PersonaSystem_1.PersonaSystem.getPersonas(options.with);
            config.agents = PersonaSystem_1.PersonaSystem.personasToAgents(personas);
        }
        // Determine chunk size (auto-detect if not specified)
        const chunkSize = options.chunkSize ?
            parseInt(options.chunkSize) :
            (options.project ? ModeDetector_1.ModeDetector.suggestChunkSize(options.project) : 3);
        // Determine rounds per chunk
        const maxRounds = options.rounds ?
            parseInt(options.rounds) :
            ModeDetector_1.ModeDetector.suggestRounds(task, options.quick ? 'quick' :
                options.deep ? 'deep' :
                    options.thorough ? 'thorough' :
                        undefined);
        console.log(chalk_1.default.cyan(`Chunk size: ${chunkSize}`));
        console.log(chalk_1.default.cyan(`Rounds per chunk: ${maxRounds}\n`));
        // Convert agents config to Agent[] format
        const agents = Object.keys(config.agents).map((name) => {
            const agentConfig = config.agents[name];
            return {
                name,
                model: agentConfig.model,
                provider: ProviderFactory_1.default.createProvider(agentConfig.model),
                systemPrompt: agentConfig.prompt || agentConfig.systemPrompt || ''
            };
        });
        // Create judge
        const judge = {
            name: 'Judge',
            model: config.judge.model,
            provider: ProviderFactory_1.default.createProvider(config.judge.model),
            systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge coordinating the agents.'
        };
        // Initialize tool registry
        const toolRegistry = new ToolRegistry_1.default();
        // Initialize and run orchestrator
        const orchestrator = new IterativeCollaborativeOrchestrator_1.default(agents, judge, toolRegistry, {
            chunkSize,
            maxRoundsPerChunk: maxRounds,
            startChunk: parseInt(options.startChunk)
        });
        await orchestrator.run(task, options.project || null);
        console.log(chalk_1.default.green('\n✓ Iterative collaboration complete!\n'));
    });
    return cmd;
}
