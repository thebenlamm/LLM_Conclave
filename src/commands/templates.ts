import { Command } from 'commander';
import chalk from 'chalk';
import { TemplateManager } from '../core/TemplateManager';
import { TemplateLoader, LoadedTemplate } from '../templates/TemplateLoader';
import { Template } from '../templates/types';

interface DisplayTemplate extends Template {
  source: 'global' | 'project' | 'preset';
}

/**
 * Templates command - List available templates
 */
export function createTemplatesCommand(): Command {
  const cmd = new Command('templates');

  cmd
    .description('List available templates')
    .option('-v, --verbose', 'Show detailed information')
    .action((options: any) => {
      // 1. Load user templates (Project + Global)
      const loader = new TemplateLoader();
      let userTemplates: LoadedTemplate[] = [];
      let userTemplatesLoadFailed = false;
      try {
        userTemplates = loader.loadAllTemplates();
      } catch (error: any) {
        userTemplatesLoadFailed = true;
        console.error(chalk.red(`Error loading templates: ${error.message}`));
      }

      // 2. Load preset templates (Built-in)
      const templateManager = new TemplateManager();
      const presetTemplates = templateManager.listTemplates();

      // 3. Merge: User templates override presets with same name
      const allTemplates = new Map<string, DisplayTemplate>();

      // Add presets first (lowest priority)
      for (const preset of presetTemplates) {
        allTemplates.set(preset.name, {
          ...preset,
          task: preset.taskTemplate, // Map taskTemplate to task
          source: 'preset'
        } as unknown as DisplayTemplate);
      }

      // Add user templates (override presets)
      for (const template of userTemplates) {
        allTemplates.set(template.name, template as DisplayTemplate);
      }

      // 4. Handle Empty State (No templates at all)
      if (allTemplates.size === 0) {
        if (userTemplatesLoadFailed) {
          console.log(chalk.red('\n📋 Unable to load user templates.\n'));
          console.log(chalk.gray('Fix the errors above and re-run `llm-conclave templates`.'));
          console.log(chalk.gray('No preset templates available.\n'));
          return;
        }

        console.log(chalk.blue('\n📋 No templates found.\n'));
        console.log('Templates can be placed in:');
        console.log(chalk.gray('  • Project: ') + '.conclave/templates/');
        console.log(chalk.gray('  • Global:  ') + '~/.llm-conclave/templates/');
        console.log('\nExample template (code-review.yaml):');
        console.log(chalk.gray(`
  name: code-review
  description: Review code for bugs and security issues
  mode: discuss
  personas:
    - security
    - architecture
  task: "Review the following code"
`));
        console.log(chalk.gray('\n   Docs: README.md#Templates\n'));
        return;
      }

      console.log(chalk.blue('\n📋 Available Templates:\n'));

      // Task 3.1: Detect when no user templates are found and show helpful message
      const trueUserTemplates = userTemplates.filter(t => t.source !== 'preset');

      if (userTemplatesLoadFailed) {
        console.log(chalk.red('⚠️  User templates failed to load.'));
        console.log(chalk.gray('   Fix the errors above, then re-run `llm-conclave templates`.\n'));
      } else if (trueUserTemplates.length === 0) {
          console.log(chalk.yellow('ℹ️  No user templates found.'));
          console.log(chalk.gray('   Add templates to: .conclave/templates/ or ~/.llm-conclave/templates/'));
          console.log(chalk.gray('\n   Example (code-review.yaml):'));
          console.log(chalk.gray(`     name: code-review
     description: Review code
     mode: discuss
     task: "Review this code"`));
          console.log(chalk.gray('\n   Docs: README.md#Templates\n'));
      }

      // Helper for source badge
      const getSourceBadge = (source: string) => {
        switch (source) {
          case 'project': return chalk.green('project');
          case 'global': return chalk.blue('global');
          case 'preset': return chalk.gray('preset');
          default: return chalk.gray(source);
        }
      };

      // Kebab-case regex
      const kebabCaseRegex = /^[a-z0-9-]+$/;

      // Group templates by source
      const grouped = {
        project: [] as DisplayTemplate[],
        global: [] as DisplayTemplate[],
        preset: [] as DisplayTemplate[]
      };

      for (const template of allTemplates.values()) {
        if (template.source in grouped) {
          grouped[template.source].push(template);
        }
      }

      // Print groups
      const printGroup = (title: string, templates: DisplayTemplate[]) => {
        if (templates.length === 0) return;
        console.log(`${title} (${templates.length}):`);
        templates.forEach(template => {
          const badge = getSourceBadge(template.source);
          let nameDisplay = chalk.cyan(`  ${template.name.padEnd(25)}`);
          
          // Task 2.1: Show template name with kebab-case validation indicator
          if (!kebabCaseRegex.test(template.name)) {
             nameDisplay += chalk.red(' ⚠️ (invalid name)');
          }

          console.log(nameDisplay, chalk.white(`[${template.mode}]`), badge);
          console.log(chalk.gray(`    ${template.description}`));

          if (options.verbose) {
             if (template.personas && template.personas.length > 0) {
                 console.log(chalk.gray(`    Personas: ${template.personas.join(', ')}`));
             }
             if (template.agents) {
                 // Handle agents being array of strings/objects or record (legacy)
                 let agentNames: string[] = [];
                 if (Array.isArray(template.agents)) {
                     agentNames = template.agents.map(a => typeof a === 'string' ? a : a.name);
                 } else if (typeof template.agents === 'object') {
                     agentNames = Object.keys(template.agents);
                 }
                 if (agentNames.length > 0) {
                    console.log(chalk.gray(`    Agents: ${agentNames.join(', ')}`));
                 }
             }
          }
          console.log();
        });
      };

      printGroup('Project Templates', grouped.project);
      printGroup('Global Templates', grouped.global);
      printGroup('Preset Templates', grouped.preset);

      console.log(chalk.yellow('Usage:'));
      console.log(chalk.white('  llm-conclave template <name> "Your task"'));
      console.log(chalk.white('  llm-conclave template      ') + chalk.gray('(interactive selection)\n'));
    });

  return cmd;
}
