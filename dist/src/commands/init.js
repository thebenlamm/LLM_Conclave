"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitCommand = createInitCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const InteractiveInit_1 = __importDefault(require("../init/InteractiveInit"));
const ConfigWriter_1 = __importDefault(require("../init/ConfigWriter"));
/**
 * Init command - Interactive setup wizard
 */
function createInitCommand() {
    const cmd = new commander_1.Command('init');
    cmd
        .description('Interactive setup wizard')
        .argument('[project-name]', 'Project name')
        .option('--scan', 'Force project scanning')
        .option('--no-scan', 'Skip project scanning')
        .option('--scan-timeout <ms>', 'Scan timeout in milliseconds')
        .option('--overwrite', 'Overwrite existing config')
        .option('--template-only', 'Create template config (legacy)')
        .action(async (projectName, options) => {
        console.log(chalk_1.default.blue('\n⚙️  LLM Conclave Setup\n'));
        if (options.templateOnly) {
            // Legacy template-only mode
            await ConfigWriter_1.default.createTemplate();
        }
        else {
            // Interactive init
            const init = new InteractiveInit_1.default({
                projectName,
                overwrite: options.overwrite,
                scan: options.scan,
                noScan: options.noScan,
                scanTimeout: options.scanTimeout ? parseInt(options.scanTimeout) : null
            });
            await init.run();
        }
        console.log(chalk_1.default.green('\n✓ Setup complete!\n'));
    });
    return cmd;
}
