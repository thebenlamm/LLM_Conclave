import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigCascade } from '../cli/ConfigCascade';
import { PersonaSystem } from '../cli/PersonaSystem';
import ConversationManager from '../core/ConversationManager';
import OutputHandler from '../core/OutputHandler';
import ProviderFactory from '../providers/ProviderFactory';
import ProjectContext from '../utils/ProjectContext';

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
    .option('--with <personas>', 'Comma-separated list of personas (e.g., security,performance)')
    .option('-r, --rounds <n>', 'Number of discussion rounds', '3')
    .option('--stream', 'Stream agent responses', true)
    .option('--no-stream', 'Disable streaming')
    .action(async (taskArgs: string[], options: any) => {
      const task = taskArgs.join(' ');

      console.log(chalk.blue('\n🗣️  Starting democratic discussion...\n'));

      // Resolve configuration
      const config = ConfigCascade.resolve(options);

      // Use personas if specified
      if (options.with) {
        console.log(chalk.cyan(`Using personas: ${options.with}\n`));
        const personas = PersonaSystem.getPersonas(options.with);
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

      // Set max_rounds from options
      config.max_rounds = parseInt(options.rounds);

      // Load project context if specified
      let projectContext = null;
      if (options.project) {
        console.log(chalk.cyan(`Loading project context: ${options.project}...\n`));
        projectContext = new ProjectContext(options.project);
      }

      console.log(chalk.blue(`Agents: ${Object.keys(config.agents).join(', ')}\n`));

      // Create judge
      const judge = {
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.'
      };

      // Run conversation
      const conversationManager = new ConversationManager(config, null, options.stream);
      const result = await conversationManager.startConversation(task, judge, projectContext);

      // Output results
      const filePaths = await OutputHandler.saveResults(result);
      OutputHandler.printSummary(result, filePaths);

      console.log(chalk.green('\n✓ Discussion complete!\n'));
    });

  return cmd;
}
