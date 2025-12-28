"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTemplatesCommand = createTemplatesCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const TemplateManager_1 = require("../core/TemplateManager");
/**
 * Templates command - List available templates
 */
function createTemplatesCommand() {
    const cmd = new commander_1.Command('templates');
    cmd
        .description('List available templates')
        .option('-v, --verbose', 'Show detailed information')
        .action((options) => {
        const templateManager = new TemplateManager_1.TemplateManager();
        const templates = templateManager.listTemplates();
        console.log(chalk_1.default.blue('\n📋 Available Templates:\n'));
        templates.forEach(template => {
            console.log(chalk_1.default.cyan(`  ${template.name.padEnd(25)}`), chalk_1.default.white(`[${template.mode}]`));
            console.log(chalk_1.default.gray(`    ${template.description}`));
            if (options.verbose) {
                console.log(chalk_1.default.gray(`    Agents: ${Object.keys(template.agents).join(', ')}`));
            }
            console.log();
        });
        console.log(chalk_1.default.yellow('Usage:'));
        console.log(chalk_1.default.white('  llm-conclave template <name> "Your task"'));
        console.log(chalk_1.default.white('  llm-conclave template      ') + chalk_1.default.gray('(interactive selection)\n'));
    });
    return cmd;
}
