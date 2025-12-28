import { Command } from 'commander';
import chalk from 'chalk';
import InteractiveInit from '../init/InteractiveInit';
import ConfigWriter from '../init/ConfigWriter';

/**
 * Init command - Interactive setup wizard
 */
export function createInitCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Interactive setup wizard')
    .argument('[project-name]', 'Project name')
    .option('--scan', 'Force project scanning')
    .option('--no-scan', 'Skip project scanning')
    .option('--scan-timeout <ms>', 'Scan timeout in milliseconds')
    .option('--overwrite', 'Overwrite existing config')
    .option('--template-only', 'Create template config (legacy)')
    .action(async (projectName: string | undefined, options: any) => {
      console.log(chalk.blue('\n⚙️  LLM Conclave Setup\n'));

      if (options.templateOnly) {
        // Legacy template-only mode
        await ConfigWriter.createTemplate();
      } else {
        // Interactive init
        const init = new InteractiveInit({
          projectName,
          overwrite: options.overwrite,
          scan: options.scan,
          noScan: options.noScan,
          scanTimeout: options.scanTimeout ? parseInt(options.scanTimeout) : null
        });

        await init.run();
      }

      console.log(chalk.green('\n✓ Setup complete!\n'));
    });

  return cmd;
}
