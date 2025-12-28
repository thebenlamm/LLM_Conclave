import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigCascade } from '../cli/ConfigCascade';
import { PersonaSystem } from '../cli/PersonaSystem';
import Orchestrator from '../orchestration/Orchestrator';

/**
 * Review command - Orchestrated mode
 * Structured review with primary/secondary/validation agents
 */
export function createReviewCommand(): Command {
  const cmd = new Command('review');

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
    .action(async (taskArgs: string[], options: any) => {
      const task = taskArgs.join(' ');

      console.log(chalk.blue('\n📝 Starting structured review...\n'));

      // Resolve configuration
      const config = ConfigCascade.resolve(options);

      // Use personas if specified
      if (options.with) {
        console.log(chalk.cyan(`Using personas: ${options.with}\n`));
        const personas = PersonaSystem.getPersonas(options.with);
        config.agents = PersonaSystem.personasToAgents(personas);
      }

      // Override judge if specified
      if (options.judge) {
        config.judge = {
          ...config.judge,
          model: options.judge
        };
      }

      console.log(chalk.blue(`Judge: ${config.judge.model}\n`));

      // Initialize and run orchestrator
      const orchestrator = new Orchestrator(config);
      await orchestrator.executeTask(task, options.project || null);

      console.log(chalk.green('\n✓ Review complete!\n'));
    });

  return cmd;
}
