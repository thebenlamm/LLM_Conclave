"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContinueCommand = createContinueCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
const SessionManager_1 = __importDefault(require("../core/SessionManager"));
const ContinuationHandler_1 = __importDefault(require("../core/ContinuationHandler"));
/**
 * Continue command - Resume a conversation session
 */
function createContinueCommand() {
    const cmd = new commander_1.Command('continue');
    cmd
        .description('Resume a conversation session')
        .argument('[session-id]', 'Session ID to resume (omit for most recent)')
        .argument('[task...]', 'Follow-up question or task')
        .action(async (sessionId, taskArgs, options) => {
        const sessionManager = new SessionManager_1.default();
        // If no session ID, use most recent
        if (!sessionId) {
            const sessions = await sessionManager.listSessions({ limit: 1 });
            if (sessions.length === 0) {
                console.error(chalk_1.default.red('\n❌ No sessions found to continue.\n'));
                process.exit(1);
            }
            sessionId = sessions[0].id;
            console.log(chalk_1.default.cyan(`\nContinuing most recent session: ${sessionId}\n`));
        }
        // Load session
        const session = await sessionManager.loadSession(sessionId);
        if (!session) {
            console.error(chalk_1.default.red(`\n❌ Session '${sessionId}' not found.\n`));
            process.exit(1);
        }
        // Display session info
        console.log(chalk_1.default.blue('📜 Session Summary:\n'));
        console.log(chalk_1.default.cyan(`   Mode: ${session.mode}`));
        console.log(chalk_1.default.cyan(`   Original Task: ${session.task}`));
        console.log(chalk_1.default.cyan(`   Date: ${new Date(session.timestamp).toLocaleString()}\n`));
        // Prompt for task if not provided
        let task = taskArgs.join(' ');
        if (!task) {
            const answer = await inquirer_1.default.prompt([{
                    type: 'input',
                    name: 'task',
                    message: 'What would you like to follow up with?',
                    validate: (input) => input.length > 0 || 'Task cannot be empty'
                }]);
            task = answer.task;
        }
        console.log(chalk_1.default.blue(`\n🔄 Continuing session with: "${task}"\n`));
        // Validate resumable
        const continuationHandler = new ContinuationHandler_1.default();
        const validation = continuationHandler.validateResumable(session);
        if (!validation.isValid) {
            console.error(chalk_1.default.red(`\n❌ Cannot resume session:\n`));
            validation.warnings.forEach(w => console.error(chalk_1.default.red(`  - ${w}`)));
            console.error();
            process.exit(1);
        }
        if (validation.warnings.length > 0) {
            console.log(chalk_1.default.yellow('⚠️  Warnings:'));
            validation.warnings.forEach(w => console.log(chalk_1.default.yellow(`  - ${w}`)));
            console.log();
        }
        // Prepare continuation
        const prepared = continuationHandler.prepareForContinuation(session, task);
        // For now, show message that full continuation logic is complex
        // TODO: Implement full continuation logic (see old index.ts line 812-960)
        console.log(chalk_1.default.yellow('\n⚠️  Full continuation execution coming soon.'));
        console.log(chalk_1.default.cyan('   For now, use: llm-conclave --continue "question"\n'));
        console.log(chalk_1.default.gray('   (Using the old CLI interface for continue/resume)\n'));
    });
    return cmd;
}
