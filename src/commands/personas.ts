import { Command } from 'commander';
import chalk from 'chalk';
import { PersonaSystem } from '../cli/PersonaSystem';

/**
 * Personas command - List available personas
 */
export function createPersonasCommand(): Command {
  const cmd = new Command('personas');

  cmd
    .description('List available expert personas')
    .option('-v, --verbose', 'Show detailed information')
    .action((options: any) => {
      const personas = PersonaSystem.listPersonas();

      console.log(chalk.blue('\n👥 Available Expert Personas:\n'));

      personas.forEach(persona => {
        console.log(chalk.cyan(`  ${persona.name.padEnd(30)}`), chalk.gray(`[${persona.provider}]`));
        console.log(chalk.white(`    ${persona.description}`));

        if (options.verbose) {
          console.log(chalk.gray(`    Model: ${persona.model}`));
          console.log(chalk.gray(`    Best for: ${persona.preferredFor.join(', ')}`));
        }

        console.log();
      });

      console.log(chalk.yellow('Usage:'));
      console.log(chalk.white('  llm-conclave --with security,performance "Review this code"'));
      console.log(chalk.white('  llm-conclave discuss --with architecture,creative "Design new feature"\n'));
    });

  return cmd;
}
