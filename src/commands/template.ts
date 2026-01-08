import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TemplateManager } from '../core/TemplateManager';
import { TemplateLoader, LoadedTemplate } from '../templates/TemplateLoader';
import { TemplateExecutor } from '../templates/TemplateExecutor';
import { ConfigCascade } from '../cli/ConfigCascade';
import { Template } from '../templates/types';

interface ExecutableTemplate extends Template {
  source: 'global' | 'project' | 'preset';
  filePath?: string;
}

function loadMergedTemplates(loader: TemplateLoader, manager: TemplateManager): Map<string, ExecutableTemplate> {
  const allTemplates = new Map<string, ExecutableTemplate>();

  // Load presets
  const presets = manager.listTemplates();
  for (const preset of presets) {
    allTemplates.set(preset.name, {
      ...preset,
      task: preset.taskTemplate, 
      source: 'preset'
    } as unknown as ExecutableTemplate);
  }

  // Load user templates (override presets)
  try {
    const userTemplates = loader.loadAllTemplates();
    for (const tmpl of userTemplates) {
      allTemplates.set(tmpl.name, tmpl as ExecutableTemplate);
    }
  } catch (error: any) {
    console.error(chalk.red(`Warning: Failed to load some user templates: ${error.message}`));
  }
  return allTemplates;
}

function listAvailableTemplates(loader: TemplateLoader, manager: TemplateManager) {
  const allTemplates = loadMergedTemplates(loader, manager);
  Array.from(allTemplates.values()).forEach(t => {
      console.log(`  ${chalk.cyan(t.name.padEnd(20))} - ${t.description} [${t.mode}] (${t.source})`);
  });
}

export async function executeTemplate(name: string | undefined, task: string | undefined, options: any) {
  const templateLoader = new TemplateLoader();
  const templateManager = new TemplateManager();
  
  let template: LoadedTemplate | ExecutableTemplate | null = null;

  if (name) {
      try {
          // Try loading specific template to catch specific validation errors
          try {
             template = templateLoader.loadTemplate(name);
          } catch (error: any) {
             if (error.message.includes('not found')) {
                 // Try preset
                 const preset = templateManager.getTemplate(name);
                 if (preset) {
                     template = { ...preset, task: preset.taskTemplate, source: 'preset' } as any;
                 } else {
                     throw error; // Re-throw "not found"
                 }
             } else {
                 throw error; // Validation error
             }
          }
      } catch (error: any) {
          if (error.message.includes('not found')) {
             console.error(chalk.red(`\n❌ Template '${name}' not found.`));
             console.log(chalk.yellow('\nAvailable templates:'));
             listAvailableTemplates(templateLoader, templateManager);
             
             // Optional: Suggest closest match could go here
             process.exit(1);
          } else {
             // Validation error
             // TemplateLoader error message already includes "Error loading template... File: ... \n reason"
             // We can just print it.
             console.error(chalk.red(`\n❌ Template validation failed:`));
             console.error(chalk.red(error.message));
             process.exit(1);
          }
      }
  } else {
      // Interactive selection
      const allTemplates = loadMergedTemplates(templateLoader, templateManager);
      
      if (allTemplates.size === 0) {
          console.error(chalk.red('No templates found.'));
          process.exit(1);
      }

      const choices = Array.from(allTemplates.values()).map(t => ({
          name: `${t.name.padEnd(20)} - ${t.description} [${t.mode}] (${t.source})`,
          value: t.name
      }));

      const answer = await inquirer.prompt([{ 
          type: 'list',
          name: 'template',
          message: 'Select a template:',
          choices: choices
      }]);
      template = allTemplates.get(answer.template)!;
  }

  // 4. Get Task
  let finalTask = task;
  if (!finalTask && !template.task && template.mode !== 'consult') { 
    const answer = await inquirer.prompt([{ 
      type: 'input',
      name: 'task',
      message: 'What task should the agents work on?',
      validate: (input: string) => input.length > 0 || 'Task cannot be empty'
    }]);
    finalTask = answer.task;
  }
  finalTask = finalTask || '';

  console.log(chalk.blue(`\n📋 Running template: ${chalk.bold(template!.name)}`));
  console.log(chalk.cyan(`   Mode: ${template!.mode}`));
  if (template!.source !== 'preset') {
     console.log(chalk.gray(`   Source: ${template!.filePath}`));
  }
  console.log();

  // 5. Execute
  const executor = new TemplateExecutor();
  try {
    await executor.execute(template as LoadedTemplate, finalTask, {
      project: options.project,
      stream: options.stream,
      verbose: options.verbose,
      yes: options.yes
    });
  } catch (error: any) {
    if (error.message.includes('validation')) {
       console.error(chalk.red(`❌ Template validation error:`));
       console.error(chalk.red(error.message));
    } else {
       console.error(chalk.red(`❌ Execution failed: ${error.message}`));
       if (options.verbose) console.error(error);
    }
    process.exit(1);
  }
}

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
    .option('--stream', 'Stream output', true)
    .option('--no-stream', 'Disable streaming')
    .option('-v, --verbose', 'Verbose output')
    .option('--yes', 'Automatically answer yes to prompts (for consult mode)')
    .action(async (name: string | undefined, taskArgs: string[], options: any) => {
      await executeTemplate(name, taskArgs.join(' '), options);
    });

  return cmd;
}