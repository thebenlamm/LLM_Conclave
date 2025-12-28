"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReviewCommand = createReviewCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ConfigCascade_1 = require("../cli/ConfigCascade");
const PersonaSystem_1 = require("../cli/PersonaSystem");
const Orchestrator_1 = __importDefault(require("../orchestration/Orchestrator"));
/**
 * Review command - Orchestrated mode
 * Structured review with primary/secondary/validation agents
 */
function createReviewCommand() {
    const cmd = new commander_1.Command('review');
    cmd
        .description('Structured review mode (orchestrated)')
        .argument('<task...>', 'Task to review')
        .option('-p, --project <path>', 'Project context (file or directory)')
        .option('-c, --config <path>', 'Custom config file')
        .option('--with <personas>', 'Comma-separated list of personas (e.g., security,performance)')
        .option('--judge <model>', 'Override judge model')
        .option('--primary <agent>', 'Force primary agent')
        .option('--stream', 'Stream agent responses', true)
        .option('--no-stream', 'Disable streaming')
        .action(async (taskArgs, options) => {
        const task = taskArgs.join(' ');
        console.log(chalk_1.default.blue('\n📝 Starting structured review...\n'));
        // Resolve configuration
        const config = ConfigCascade_1.ConfigCascade.resolve(options);
        // Use personas if specified
        if (options.with) {
            console.log(chalk_1.default.cyan(`Using personas: ${options.with}\n`));
            const personas = PersonaSystem_1.PersonaSystem.getPersonas(options.with);
            config.agents = PersonaSystem_1.PersonaSystem.personasToAgents(personas);
        }
        // Override judge if specified
        if (options.judge) {
            config.judge = {
                ...config.judge,
                model: options.judge
            };
        }
        console.log(chalk_1.default.blue(`Judge: ${config.judge.model}\n`));
        // Initialize and run orchestrator
        const orchestrator = new Orchestrator_1.default(config);
        await orchestrator.executeTask(task, options.project || null);
        console.log(chalk_1.default.green('\n✓ Review complete!\n'));
    });
    return cmd;
}
