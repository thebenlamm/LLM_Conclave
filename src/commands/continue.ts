import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import SessionManager from '../core/SessionManager';
import ContinuationHandler from '../core/ContinuationHandler';
import ConversationManager from '../core/ConversationManager';
import ProviderFactory from '../providers/ProviderFactory';

/**
 * Continue command - Resume a conversation session
 */
export function createContinueCommand(): Command {
  const cmd = new Command('continue');

  cmd
    .description('Resume a conversation session with a follow-up question')
    .argument('[session-id]', 'Session ID to resume (omit for most recent)')
    .argument('[task...]', 'Follow-up question or task')
    .option('--reset', 'Start fresh with only a summary of previous session')
    .option('--no-stream', 'Disable streaming output')
    .action(async (sessionId: string | undefined, taskArgs: string[], options: any) => {
      const sessionManager = new SessionManager();
      const continuationHandler = new ContinuationHandler();

      // If no session ID, use most recent
      if (!sessionId) {
        const sessions = await sessionManager.listSessions({ limit: 1 });
        if (sessions.length === 0) {
          console.error(chalk.red('\n❌ No sessions found to continue.\n'));
          console.log(chalk.cyan('   Run a discussion first: llm-conclave discuss "your task"\n'));
          process.exit(1);
        }
        sessionId = sessions[0].id;
        console.log(chalk.cyan(`\n🔄 Continuing most recent session: ${sessionId}\n`));
      }

      // Load session
      const session = await sessionManager.loadSession(sessionId);
      if (!session) {
        console.error(chalk.red(`\n❌ Session '${sessionId}' not found.\n`));
        console.log(chalk.cyan('   Use: llm-conclave sessions  to list available sessions\n'));
        process.exit(1);
      }

      // Display session info
      console.log(chalk.blue('📜 Previous Session:\n'));
      console.log(chalk.gray(`   ID: ${session.id}`));
      console.log(chalk.gray(`   Mode: ${session.mode}`));
      console.log(chalk.gray(`   Task: ${session.task.substring(0, 100)}${session.task.length > 100 ? '...' : ''}`));
      console.log(chalk.gray(`   Date: ${new Date(session.timestamp).toLocaleString()}`));
      console.log(chalk.gray(`   Agents: ${session.agents.map(a => a.name).join(', ')}`));
      if (session.finalSolution) {
        const solutionPreview = session.finalSolution.substring(0, 150);
        console.log(chalk.gray(`   Outcome: ${solutionPreview}${session.finalSolution.length > 150 ? '...' : ''}`));
      }
      console.log();

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

      // Validate resumable
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

      console.log(chalk.blue(`\n🔄 Continuing with: "${task}"\n`));

      // Prepare continuation context
      const prepared = continuationHandler.prepareForContinuation(session, task, {
        resetDiscussion: options.reset || false,
        includeFullHistory: !options.reset,
      });

      // Rebuild config from session
      const config: any = {
        max_rounds: session.maxRounds || 4,
        min_rounds: 0,
        agents: {},
        judge: {
          model: session.judge?.model || 'gpt-4o',
          prompt: session.judge?.systemPrompt || 'You are a judge evaluating agent responses.',
        },
      };

      // Reconstruct agents from session
      for (const agent of session.agents) {
        config.agents[agent.name] = {
          model: agent.model,
          prompt: agent.systemPrompt,
        };
      }

      // Create judge
      const judge = {
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt,
      };

      // Run continuation conversation
      const streamOutput = options.stream !== false;
      const conversationManager = new ConversationManager(config, null, streamOutput);

      // Inject previous history before starting
      for (const msg of prepared.mergedHistory) {
        conversationManager.conversationHistory.push({
          role: msg.role,
          content: msg.content,
          speaker: msg.speaker || (msg.role === 'user' ? 'System' : 'Assistant'),
        });
      }

      // Start continuation with the new task
      const result = await conversationManager.startConversation(prepared.newTask, judge, null);

      // Save as new session with parent reference
      const agents = Object.entries(config.agents).map(([name, agentConfig]: [string, any]) => ({
        name,
        model: agentConfig.model,
        systemPrompt: agentConfig.prompt || '',
        provider: ProviderFactory.createProvider(agentConfig.model),
      }));
      const newSession = sessionManager.createSessionManifest(
        'consensus',
        task,
        agents,
        result.conversationHistory,
        result,
        judge
      );
      // Link to parent session
      (newSession as any).parentSessionId = session.id;
      const newSessionId = await sessionManager.saveSession(newSession);

      // Display result
      console.log(chalk.green(`\n${'='.repeat(80)}`));
      console.log(chalk.green('CONTINUATION COMPLETE'));
      console.log(chalk.green(`${'='.repeat(80)}\n`));

      if (result.solution) {
        console.log(chalk.cyan('Solution:\n'));
        console.log(result.solution);
      }

      console.log(chalk.gray(`\n📦 New session saved: ${newSessionId}`));
      console.log(chalk.gray(`   Continue again with: llm-conclave continue ${newSessionId} "your question"\n`));
    });

  return cmd;
}
