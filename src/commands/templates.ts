import { Command } from 'commander';
import chalk from 'chalk';
import { TemplateManager } from '../core/TemplateManager';

/**
 * Templates command - List available templates
 */
export function createTemplatesCommand(): Command {
  const cmd = new Command('templates');

  cmd
    .description('List available templates')
    .option('-v, --verbose', 'Show detailed information')
    .action((options: any) => {
      const templateManager = new TemplateManager();
      const templates = templateManager.listTemplates();

      console.log(chalk.blue('\n📋 Available Templates:\n'));

      templates.forEach(template => {
        console.log(chalk.cyan(`  ${template.name.padEnd(25)}`), chalk.white(`[${template.mode}]`));
        console.log(chalk.gray(`    ${template.description}`));

        if (options.verbose) {
          console.log(chalk.gray(`    Agents: ${Object.keys(template.agents).join(', ')}`));
        }

        console.log();
      });

      console.log(chalk.yellow('Usage:'));
      console.log(chalk.white('  llm-conclave template <name> "Your task"'));
      console.log(chalk.white('  llm-conclave template      ') + chalk.gray('(interactive selection)\n'));
    });

  return cmd;
}
