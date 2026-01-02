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
exports.createConsultCommand = createConsultCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ConsultOrchestrator_1 = __importDefault(require("../orchestration/ConsultOrchestrator"));
const ProjectContext_1 = __importDefault(require("../utils/ProjectContext"));
const ConsultLogger_1 = __importDefault(require("../utils/ConsultLogger"));
const ConsultConsoleLogger_1 = require("../cli/ConsultConsoleLogger");
const FormatterFactory_1 = require("../consult/formatting/FormatterFactory");
const strategies_1 = require("../consult/strategies");
/**
 * Consult command - Fast multi-model consultation
 * Get quick consensus from Security Expert, Architect, and Pragmatist
 */
function createConsultCommand() {
    const cmd = new commander_1.Command('consult');
    cmd
        .description('Fast multi-model consultation for decision-making')
        .argument('<question...>', 'Question to consult on')
        .option('-c, --context <files>', 'Comma-separated file paths for context')
        .option('-p, --project <path>', 'Project root for auto-context analysis')
        .option('-f, --format <type>', 'Output format: markdown, json, or both', 'markdown')
        .option('-m, --mode <mode>', 'Reasoning mode: explore (divergent) or converge (decisive)', 'converge')
        .option('-q, --quick', 'Single round consultation (faster)', false)
        .option('-v, --verbose', 'Show full agent conversation', false)
        .action(async (questionArgs, options) => {
        const question = questionArgs.join(' ');
        if (!question.trim()) {
            throw new Error('Question is required. Usage: llm-conclave consult "your question"');
        }
        // Validate mode option
        const mode = options.mode;
        if (!strategies_1.StrategyFactory.isValidMode(mode)) {
            const availableModes = strategies_1.StrategyFactory.getAvailableModes().join(', ');
            throw new Error(`Invalid mode: "${mode}". Available modes: ${availableModes}`);
        }
        const modeType = mode;
        // Initialize real-time console logger
        const consoleLogger = new ConsultConsoleLogger_1.ConsultConsoleLogger();
        consoleLogger.start();
        try {
            // Load context
            const context = await loadContext(options);
            // Get strategy for the selected mode
            const strategy = strategies_1.StrategyFactory.create(modeType);
            // Display mode selection
            if (options.verbose) {
                console.log(chalk_1.default.cyan(`🎯 Mode: ${modeType} (${modeType === 'explore' ? 'divergent brainstorming' : 'decisive consensus'})`));
            }
            // Initialize orchestrator with strategy
            const orchestrator = new ConsultOrchestrator_1.default({
                maxRounds: options.quick ? 1 : 4,
                verbose: options.verbose,
                strategy
            });
            // Execute consultation
            // Orchestrator emits events which consoleLogger handles
            const result = await orchestrator.consult(question, context);
            // Persist consultation for analytics (handles transformation to snake_case internally)
            const logger = new ConsultLogger_1.default();
            const logPaths = await logger.log(result);
            console.log(chalk_1.default.gray(`Logs saved to ${logPaths.jsonPath}`));
            // Format and display output
            const output = FormatterFactory_1.FormatterFactory.format(result, options.format);
            console.log('\n' + output + '\n');
        }
        catch (error) {
            if (error?.message === 'Consultation cancelled by user') {
                process.exit(0);
            }
            console.error(chalk_1.default.red(`\n❌ Consultation failed: ${error.message}\n`));
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    });
    return cmd;
}
/**
 * Load context from various sources
 */
async function loadContext(options) {
    let context = '';
    // Explicit file context
    if (options.context) {
        const files = options.context.split(',').map((f) => f.trim());
        for (const file of files) {
            if (!fs.existsSync(file)) {
                throw new Error(`Context file not found: ${file}`);
            }
            const content = fs.readFileSync(file, 'utf-8');
            const fileName = path.basename(file);
            context += `\n\n### File: ${fileName}\n\n${content}`;
        }
    }
    // Project context
    if (options.project) {
        if (!fs.existsSync(options.project)) {
            throw new Error(`Project directory not found: ${options.project}`);
        }
        const projectContext = new ProjectContext_1.default(options.project);
        await projectContext.load();
        const formattedContext = projectContext.formatContext();
        context += `\n\n### Project Context\n\n${formattedContext}`;
    }
    return context;
}
