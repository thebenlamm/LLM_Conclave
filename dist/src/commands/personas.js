"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPersonasCommand = createPersonasCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const PersonaSystem_1 = require("../cli/PersonaSystem");
/**
 * Personas command - List available personas
 */
function createPersonasCommand() {
    const cmd = new commander_1.Command('personas');
    cmd
        .description('List available expert personas')
        .option('-v, --verbose', 'Show detailed information')
        .action((options) => {
        const personas = PersonaSystem_1.PersonaSystem.listPersonas();
        console.log(chalk_1.default.blue('\n👥 Available Expert Personas:\n'));
        personas.forEach(persona => {
            console.log(chalk_1.default.cyan(`  ${persona.name.padEnd(30)}`), chalk_1.default.gray(`[${persona.provider}]`));
            console.log(chalk_1.default.white(`    ${persona.description}`));
            if (options.verbose) {
                console.log(chalk_1.default.gray(`    Model: ${persona.model}`));
                console.log(chalk_1.default.gray(`    Best for: ${persona.preferredFor.join(', ')}`));
            }
            console.log();
        });
        console.log(chalk_1.default.yellow('Usage:'));
        console.log(chalk_1.default.white('  llm-conclave --with security,performance "Review this code"'));
        console.log(chalk_1.default.white('  llm-conclave discuss --with architecture,creative "Design new feature"\n'));
    });
    return cmd;
}
