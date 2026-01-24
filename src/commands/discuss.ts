import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigCascade } from '../cli/ConfigCascade';
import { PersonaSystem } from '../cli/PersonaSystem';
import ConversationManager from '../core/ConversationManager';
import OutputHandler from '../core/OutputHandler';
import ProviderFactory from '../providers/ProviderFactory';
import ProjectContext from '../utils/ProjectContext';
import { DEFAULT_SELECTOR_MODEL } from '../constants';

/**
 * Discuss command - Consensus mode
 * Democratic discussion where all agents contribute equally
 */
export function createDiscussCommand(): Command {
  const cmd = new Command('discuss');

  cmd
    .description('Democratic discussion mode (consensus)')
    .argument('<task...>', 'Task to discuss')
    .option('-p, --project <path>', 'Project context (file or directory)')
    .option('-c, --config <path>', 'Custom config file')
    .option('-w, --with <personas>', 'Comma-separated list of personas (e.g., security,performance)')
    .option('--personas <personas>', 'Alias for --with')
    .option('-r, --rounds <n>', 'Number of discussion rounds', '3')
    .option('--min-rounds <n>', 'Minimum rounds before consensus can end discussion', '0')
    .option('--stream', 'Stream agent responses', true)
    .option('--no-stream', 'Disable streaming')
    .option('--dynamic', 'Use dynamic speaker selection (LLM picks who speaks next)')
    .option('--selector-model <model>', 'Model for speaker selection', DEFAULT_SELECTOR_MODEL)
    .action(async (taskArgs: string[], options: any) => {
      const task = taskArgs.join(' ');

      console.log(chalk.blue('\n🗣️  Starting democratic discussion...\n'));

      // Resolve configuration
      const config = ConfigCascade.resolve(options);

      // Use personas if specified (check both --with and --personas due to reserved word issues)
      const personaSpec = options.personas || options['with'];
      if (personaSpec) {
        console.log(chalk.cyan(`Using personas: ${personaSpec}\n`));
        const personas = PersonaSystem.getPersonas(personaSpec);
        const personaAgents = PersonaSystem.personasToAgents(personas);

        // Convert to config format (model + prompt instead of systemPrompt)
        config.agents = {};
        for (const [name, agent] of Object.entries(personaAgents) as [string, any][]) {
          config.agents[name] = {
            model: agent.model,
            prompt: agent.systemPrompt
          };
        }
      }

      // Set rounds from options
      config.max_rounds = parseInt(options.rounds);
      config.min_rounds = parseInt(options.minRounds || '0');

      // Load project context if specified
      let projectContext = null;
      if (options.project) {
        console.log(chalk.cyan(`Loading project context: ${options.project}...\n`));
        projectContext = new ProjectContext(options.project);
      }

      // Log configuration
      const dynamicMode = options.dynamic ? ' (dynamic speaker selection)' : '';
      console.log(chalk.blue(`Agents: ${Object.keys(config.agents).join(', ')}${dynamicMode}\n`));

      if (options.dynamic) {
        console.log(chalk.cyan(`Speaker selector: ${options.selectorModel}\n`));
      }

      // Create judge
      const judge = {
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.',
        model: config.judge.model
      };

      // Run conversation with optional dynamic speaker selection
      const conversationManager = new ConversationManager(
        config,
        null,  // memoryManager
        options.stream,
        undefined,  // eventBus
        options.dynamic || false,
        options.selectorModel || DEFAULT_SELECTOR_MODEL
      );
      const result = await conversationManager.startConversation(task, judge, projectContext);

      // Output results
      const filePaths = await OutputHandler.saveResults(result);
      OutputHandler.printSummary(result, filePaths);

      console.log(chalk.green('\n✓ Discussion complete!\n'));
    });

  return cmd;
}
