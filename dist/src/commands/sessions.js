"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionsCommand = createSessionsCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const SessionManager_1 = __importDefault(require("../core/SessionManager"));
/**
 * Sessions command - List conversation sessions
 */
function createSessionsCommand() {
    const cmd = new commander_1.Command('sessions');
    cmd
        .description('List conversation sessions')
        .option('-m, --mode <mode>', 'Filter by mode (consensus, orchestrated, iterative)')
        .option('-l, --limit <n>', 'Limit number of results', '10')
        .option('-v, --verbose', 'Show detailed information')
        .action(async (options) => {
        const sessionManager = new SessionManager_1.default();
        const sessions = await sessionManager.listSessions({
            mode: options.mode,
            limit: parseInt(options.limit)
        });
        if (sessions.length === 0) {
            console.log(chalk_1.default.yellow('\nNo sessions found.\n'));
            return;
        }
        console.log(chalk_1.default.blue(`\n💬 Recent Sessions (${sessions.length}):\n`));
        sessions.forEach((session, index) => {
            const timestamp = new Date(session.timestamp).toLocaleString();
            console.log(chalk_1.default.cyan(`  ${(index + 1).toString().padStart(2)}.`), chalk_1.default.bold(session.id));
            console.log(chalk_1.default.gray(`      Mode: ${session.mode} | ${timestamp}`));
            console.log(chalk_1.default.gray(`      Task: ${session.task.substring(0, 60)}${session.task.length > 60 ? '...' : ''}`));
            if (options.verbose && session.agents) {
                console.log(chalk_1.default.gray(`      Agents: ${session.agents.join(', ')}`));
            }
            console.log();
        });
        console.log(chalk_1.default.yellow('Usage:'));
        console.log(chalk_1.default.white('  llm-conclave continue <session-id> "Follow-up question"'));
        console.log(chalk_1.default.white('  llm-conclave continue              ') + chalk_1.default.gray('(continue most recent)\n'));
    });
    return cmd;
}
