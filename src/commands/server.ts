import { Command } from 'commander';
import chalk from 'chalk';
import { Server } from '../server/Server';

/**
 * Server command - Start Web UI
 */
export function createServerCommand(): Command {
  const cmd = new Command('server');

  cmd
    .description('Start Web UI server')
    .option('-p, --port <n>', 'Port number', '3000')
    .option('--host <address>', 'Host address', 'localhost')
    .action((options: any) => {
      const port = parseInt(options.port);

      console.log(chalk.blue('\n🌐 Starting Web UI Server...\n'));
      console.log(chalk.cyan(`   Host: ${options.host}`));
      console.log(chalk.cyan(`   Port: ${port}\n`));

      new Server(port);

      console.log(chalk.green(`✓ Server running at http://${options.host}:${port}\n`));
      console.log(chalk.yellow('Press Ctrl+C to stop\n'));
    });

  return cmd;
}
