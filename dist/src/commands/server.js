"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServerCommand = createServerCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const Server_1 = require("../server/Server");
/**
 * Server command - Start Web UI
 */
function createServerCommand() {
    const cmd = new commander_1.Command('server');
    cmd
        .description('Start Web UI server')
        .option('-p, --port <n>', 'Port number', '3000')
        .option('--host <address>', 'Host address', 'localhost')
        .action((options) => {
        const port = parseInt(options.port);
        console.log(chalk_1.default.blue('\n🌐 Starting Web UI Server...\n'));
        console.log(chalk_1.default.cyan(`   Host: ${options.host}`));
        console.log(chalk_1.default.cyan(`   Port: ${port}\n`));
        new Server_1.Server(port);
        console.log(chalk_1.default.green(`✓ Server running at http://${options.host}:${port}\n`));
        console.log(chalk_1.default.yellow('Press Ctrl+C to stop\n'));
    });
    return cmd;
}
