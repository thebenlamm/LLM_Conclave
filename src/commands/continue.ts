import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import SessionManager from '../core/SessionManager';
import ContinuationHandler from '../core/ContinuationHandler';

/**
 * Continue command - Resume a conversation session
 */
export function createContinueCommand(): Command {
  const cmd = new Command('continue');

  cmd
    .description('Resume a conversation session')
    .argument('[session-id]', 'Session ID to resume (omit for most recent)')
    .argument('[task...]', 'Follow-up question or task')
    .action(async (sessionId: string | undefined, taskArgs: string[], options: any) => {
      const sessionManager = new SessionManager();

      // If no session ID, use most recent
      if (!sessionId) {
        const sessions = await sessionManager.listSessions({ limit: 1 });
        if (sessions.length === 0) {
          console.error(chalk.red('\n❌ No sessions found to continue.\n'));
          process.exit(1);
        }
        sessionId = sessions[0].id;
        console.log(chalk.cyan(`\nContinuing most recent session: ${sessionId}\n`));
      }

      // Load session
      const session = await sessionManager.loadSession(sessionId);
      if (!session) {
        console.error(chalk.red(`\n❌ Session '${sessionId}' not found.\n`));
        process.exit(1);
      }

      // Display session info
      console.log(chalk.blue('📜 Session Summary:\n'));
      console.log(chalk.cyan(`   Mode: ${session.mode}`));
      console.log(chalk.cyan(`   Original Task: ${session.task}`));
      console.log(chalk.cyan(`   Date: ${new Date(session.timestamp).toLocaleString()}\n`));

      // Prompt for task if not provided
      let task = taskArgs.join(' ');
      if (!task) {
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'task',
          message: 'What would you like to follow up with?',
          validate: (input: string) => input.length > 0 || 'Task cannot be empty'
        }]);
        task = answer.task;
      }

      console.log(chalk.blue(`\n🔄 Continuing session with: "${task}"\n`));

      // Validate resumable
      const continuationHandler = new ContinuationHandler();
      const validation = continuationHandler.validateResumable(session);
      if (!validation.isValid) {
        console.error(chalk.red(`\n❌ Cannot resume session:\n`));
        validation.warnings.forEach(w => console.error(chalk.red(`  - ${w}`)));
        console.error();
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        console.log(chalk.yellow('⚠️  Warnings:'));
        validation.warnings.forEach(w => console.log(chalk.yellow(`  - ${w}`)));
        console.log();
      }

      // Prepare continuation
      const prepared = continuationHandler.prepareForContinuation(session, task);

      // For now, show message that full continuation logic is complex
      // TODO: Implement full continuation logic (see old index.ts line 812-960)
      console.log(chalk.yellow('\n⚠️  Full continuation execution coming soon.'));
      console.log(chalk.cyan('   For now, use: llm-conclave --continue "question"\n'));
      console.log(chalk.gray('   (Using the old CLI interface for continue/resume)\n'));
    });

  return cmd;
}
