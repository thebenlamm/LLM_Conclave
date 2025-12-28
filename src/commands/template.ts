import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TemplateManager } from '../core/TemplateManager';
import { ConfigCascade } from '../cli/ConfigCascade';

/**
 * Template command - Run with predefined templates
 */
export function createTemplateCommand(): Command {
  const cmd = new Command('template');

  cmd
    .description('Run with a predefined template')
    .argument('[name]', 'Template name (omit to choose interactively)')
    .argument('[task...]', 'Task to execute')
    .option('-p, --project <path>', 'Project context')
    .action(async (name: string | undefined, taskArgs: string[], options: any) => {
      const templateManager = new TemplateManager();

      // Interactive template selection if not provided
      let templateName = name;
      if (!templateName) {
        const templates = templateManager.listTemplates();
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'template',
          message: 'Select a template:',
          choices: templates.map(t => ({
            name: `${t.name.padEnd(20)} - ${t.description} [${t.mode}]`,
            value: t.name
          }))
        }]);
        templateName = answer.template;
      }

      const template = templateName ? templateManager.getTemplate(templateName) : null;
      if (!template || !templateName) {
        console.error(chalk.red(`\n❌ Template '${templateName}' not found.`));
        console.log(chalk.yellow('\nAvailable templates:'));
        templateManager.listTemplates().forEach(t => {
          console.log(`  ${chalk.cyan(t.name.padEnd(20))} - ${t.description}`);
        });
        process.exit(1);
      }

      // Prompt for task if not provided
      let task = taskArgs.join(' ');
      if (!task) {
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'task',
          message: 'What task should the agents work on?',
          validate: (input: string) => input.length > 0 || 'Task cannot be empty'
        }]);
        task = answer.task;
      }

      console.log(chalk.blue(`\n📋 Running template: ${chalk.bold(template.name)}`));
      console.log(chalk.cyan(`   Mode: ${template.mode}`));
      console.log(chalk.cyan(`   Agents: ${Object.keys(template.agents).join(', ')}\n`));

      // Convert template to config and run
      const config = templateManager.convertToConfig(template);
      const fullConfig = ConfigCascade.resolve({ ...options, ...config });

      // Route to appropriate mode
      const runMode = await import(`../commands/${template.mode === 'consensus' ? 'discuss' : template.mode}`);
      // Execute the mode (this is a simplified version - in reality we'd need to refactor mode execution)
      console.log(chalk.yellow('Note: Full template execution coming soon. For now, use discuss/review/iterate commands.'));
    });

  return cmd;
}
