"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTemplateCommand = createTemplateCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
const TemplateManager_1 = require("../core/TemplateManager");
const ConfigCascade_1 = require("../cli/ConfigCascade");
/**
 * Template command - Run with predefined templates
 */
function createTemplateCommand() {
    const cmd = new commander_1.Command('template');
    cmd
        .description('Run with a predefined template')
        .argument('[name]', 'Template name (omit to choose interactively)')
        .argument('[task...]', 'Task to execute')
        .option('-p, --project <path>', 'Project context')
        .action(async (name, taskArgs, options) => {
        const templateManager = new TemplateManager_1.TemplateManager();
        // Interactive template selection if not provided
        let templateName = name;
        if (!templateName) {
            const templates = templateManager.listTemplates();
            const answer = await inquirer_1.default.prompt([{
                    type: 'list',
                    name: 'template',
                    message: 'Select a template:',
                    choices: templates.map(t => ({
                        name: `${t.name.padEnd(20)} - ${t.description} [${t.mode}]`,
                        value: t.name
                    }))
                }]);
            templateName = answer.template;
        }
        const template = templateName ? templateManager.getTemplate(templateName) : null;
        if (!template || !templateName) {
            console.error(chalk_1.default.red(`\n❌ Template '${templateName}' not found.`));
            console.log(chalk_1.default.yellow('\nAvailable templates:'));
            templateManager.listTemplates().forEach(t => {
                console.log(`  ${chalk_1.default.cyan(t.name.padEnd(20))} - ${t.description}`);
            });
            process.exit(1);
        }
        // Prompt for task if not provided
        let task = taskArgs.join(' ');
        if (!task) {
            const answer = await inquirer_1.default.prompt([{
                    type: 'input',
                    name: 'task',
                    message: 'What task should the agents work on?',
                    validate: (input) => input.length > 0 || 'Task cannot be empty'
                }]);
            task = answer.task;
        }
        console.log(chalk_1.default.blue(`\n📋 Running template: ${chalk_1.default.bold(template.name)}`));
        console.log(chalk_1.default.cyan(`   Mode: ${template.mode}`));
        console.log(chalk_1.default.cyan(`   Agents: ${Object.keys(template.agents).join(', ')}\n`));
        // Convert template to config and run
        const config = templateManager.convertToConfig(template);
        const fullConfig = ConfigCascade_1.ConfigCascade.resolve({ ...options, ...config });
        // Route to appropriate mode
        const runMode = await Promise.resolve(`${`../commands/${template.mode === 'consensus' ? 'discuss' : template.mode}`}`).then(s => __importStar(require(s)));
        // Execute the mode (this is a simplified version - in reality we'd need to refactor mode execution)
        console.log(chalk_1.default.yellow('Note: Full template execution coming soon. For now, use discuss/review/iterate commands.'));
    });
    return cmd;
}
