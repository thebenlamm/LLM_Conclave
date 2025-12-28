"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDiscussCommand = createDiscussCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ConfigCascade_1 = require("../cli/ConfigCascade");
const PersonaSystem_1 = require("../cli/PersonaSystem");
const ConversationManager_1 = __importDefault(require("../core/ConversationManager"));
const OutputHandler_1 = __importDefault(require("../core/OutputHandler"));
const ProviderFactory_1 = __importDefault(require("../providers/ProviderFactory"));
const ProjectContext_1 = __importDefault(require("../utils/ProjectContext"));
/**
 * Discuss command - Consensus mode
 * Democratic discussion where all agents contribute equally
 */
function createDiscussCommand() {
    const cmd = new commander_1.Command('discuss');
    cmd
        .description('Democratic discussion mode (consensus)')
        .argument('<task...>', 'Task to discuss')
        .option('-p, --project <path>', 'Project context (file or directory)')
        .option('-c, --config <path>', 'Custom config file')
        .option('--with <personas>', 'Comma-separated list of personas (e.g., security,performance)')
        .option('-r, --rounds <n>', 'Number of discussion rounds', '3')
        .option('--stream', 'Stream agent responses', true)
        .option('--no-stream', 'Disable streaming')
        .action(async (taskArgs, options) => {
        const task = taskArgs.join(' ');
        console.log(chalk_1.default.blue('\n🗣️  Starting democratic discussion...\n'));
        // Resolve configuration
        const config = ConfigCascade_1.ConfigCascade.resolve(options);
        // Use personas if specified
        if (options.with) {
            console.log(chalk_1.default.cyan(`Using personas: ${options.with}\n`));
            const personas = PersonaSystem_1.PersonaSystem.getPersonas(options.with);
            const personaAgents = PersonaSystem_1.PersonaSystem.personasToAgents(personas);
            // Convert to config format (model + prompt instead of systemPrompt)
            config.agents = {};
            for (const [name, agent] of Object.entries(personaAgents)) {
                config.agents[name] = {
                    model: agent.model,
                    prompt: agent.systemPrompt
                };
            }
        }
        // Set max_rounds from options
        config.max_rounds = parseInt(options.rounds);
        // Load project context if specified
        let projectContext = null;
        if (options.project) {
            console.log(chalk_1.default.cyan(`Loading project context: ${options.project}...\n`));
            projectContext = new ProjectContext_1.default(options.project);
        }
        console.log(chalk_1.default.blue(`Agents: ${Object.keys(config.agents).join(', ')}\n`));
        // Create judge
        const judge = {
            provider: ProviderFactory_1.default.createProvider(config.judge.model),
            systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.'
        };
        // Run conversation
        const conversationManager = new ConversationManager_1.default(config, null, options.stream);
        const result = await conversationManager.startConversation(task, judge, projectContext);
        // Output results
        const filePaths = await OutputHandler_1.default.saveResults(result);
        OutputHandler_1.default.printSummary(result, filePaths);
        console.log(chalk_1.default.green('\n✓ Discussion complete!\n'));
    });
    return cmd;
}
