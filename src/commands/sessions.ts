import { Command } from 'commander';
import chalk from 'chalk';
import SessionManager from '../core/SessionManager';

/**
 * Sessions command - List conversation sessions
 */
export function createSessionsCommand(): Command {
  const cmd = new Command('sessions');

  cmd
    .description('List conversation sessions')
    .option('-m, --mode <mode>', 'Filter by mode (consensus, orchestrated, iterative)')
    .option('-l, --limit <n>', 'Limit number of results', '10')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options: any) => {
      const sessionManager = new SessionManager();
      const sessions = await sessionManager.listSessions({
        mode: options.mode,
        limit: parseInt(options.limit)
      });

      if (sessions.length === 0) {
        console.log(chalk.yellow('\nNo sessions found.\n'));
        return;
      }

      console.log(chalk.blue(`\n💬 Recent Sessions (${sessions.length}):\n`));

      sessions.forEach((session: any, index: number) => {
        const timestamp = new Date(session.timestamp).toLocaleString();
        console.log(chalk.cyan(`  ${(index + 1).toString().padStart(2)}.`), chalk.bold(session.id));
        console.log(chalk.gray(`      Mode: ${session.mode} | ${timestamp}`));
        console.log(chalk.gray(`      Task: ${session.task.substring(0, 60)}${session.task.length > 60 ? '...' : ''}`));

        if (options.verbose && session.agents) {
          console.log(chalk.gray(`      Agents: ${session.agents.join(', ')}`));
        }

        console.log();
      });

      console.log(chalk.yellow('Usage:'));
      console.log(chalk.white('  llm-conclave continue <session-id> "Follow-up question"'));
      console.log(chalk.white('  llm-conclave continue              ') + chalk.gray('(continue most recent)\n'));
    });

  return cmd;
}
