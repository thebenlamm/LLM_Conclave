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
        .option('-q, --quick', 'Single round consultation (faster)', false)
        .option('-v, --verbose', 'Show full agent conversation', false)
        .action(async (questionArgs, options) => {
        const question = questionArgs.join(' ');
        console.log(chalk_1.default.blue('\n🤝 Starting multi-model consultation...\n'));
        try {
            // Load context
            const context = await loadContext(options);
            if (context) {
                console.log(chalk_1.default.cyan(`Context loaded: ${estimateTokens(context)} tokens (approx)\n`));
            }
            // Initialize orchestrator
            const orchestrator = new ConsultOrchestrator_1.default({
                maxRounds: options.quick ? 1 : 2,
                verbose: options.verbose
            });
            // Execute consultation
            const result = await orchestrator.consult(question, context);
            // Persist consultation for analytics
            const logger = new ConsultLogger_1.default();
            const logPaths = await logger.log(result);
            console.log(chalk_1.default.gray(`Logs saved to ${logPaths.jsonPath}`));
            // Format and display output
            displayOutput(result, options.format);
        }
        catch (error) {
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
        console.log(chalk_1.default.cyan(`Loading context files...\n`));
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
        console.log(chalk_1.default.cyan(`Analyzing project context: ${options.project}...\n`));
        if (!fs.existsSync(options.project)) {
            throw new Error(`Project directory not found: ${options.project}`);
        }
        const projectContext = new ProjectContext_1.default(options.project);
        await projectContext.load();
        const formattedContext = projectContext.formatContext();
        context += `\n\n### Project Context\n\n${formattedContext}`;
    }
    // Stdin context (future enhancement)
    // if (!process.stdin.isTTY) {
    //   const stdin = fs.readFileSync(0, 'utf-8');
    //   context += `\n\n### Stdin Input\n\n${stdin}`;
    // }
    return context;
}
/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.round(text.length / 4);
}
/**
 * Display output in requested format
 */
function displayOutput(result, format) {
    if (format === 'json' || format === 'both') {
        console.log('\n' + chalk_1.default.bold('JSON Output:') + '\n');
        console.log(JSON.stringify(result, null, 2));
    }
    if (format === 'markdown' || format === 'both') {
        if (format === 'both') {
            console.log('\n' + '='.repeat(80) + '\n');
        }
        console.log(formatMarkdown(result));
    }
}
/**
 * Format consultation result as Markdown
 */
function formatMarkdown(result) {
    const output = [];
    // Header
    output.push(chalk_1.default.bold.blue('# Consultation Summary'));
    output.push('');
    output.push(chalk_1.default.gray(`**Question:** ${result.question}`));
    output.push(chalk_1.default.gray(`**Date:** ${new Date(result.timestamp).toLocaleString()}`));
    output.push(chalk_1.default.gray(`**Confidence:** ${(result.confidence * 100).toFixed(0)}%`));
    output.push('');
    // Consensus
    output.push(chalk_1.default.bold.green('## Consensus'));
    output.push('');
    output.push(chalk_1.default.white(result.consensus));
    output.push('');
    // Recommendation
    output.push(chalk_1.default.bold.yellow('## Recommendation'));
    output.push('');
    output.push(chalk_1.default.white(result.recommendation));
    output.push('');
    // Agent Perspectives
    output.push(chalk_1.default.bold.cyan('## Agent Perspectives'));
    output.push('');
    for (const perspective of result.perspectives) {
        output.push(chalk_1.default.bold(`### ${perspective.agent} (${perspective.model})`));
        output.push('');
        output.push(chalk_1.default.white(perspective.opinion));
        output.push('');
    }
    // Concerns
    if (result.concerns.length > 0) {
        output.push(chalk_1.default.bold.red('## Concerns Raised'));
        output.push('');
        for (const concern of result.concerns) {
            output.push(chalk_1.default.white(`- ${concern}`));
        }
        output.push('');
    }
    // Dissent
    if (result.dissent.length > 0) {
        output.push(chalk_1.default.bold.magenta('## Dissenting Views'));
        output.push('');
        for (const dissent of result.dissent) {
            output.push(chalk_1.default.white(`- ${dissent}`));
        }
        output.push('');
    }
    // Footer
    output.push('---');
    output.push('');
    output.push(chalk_1.default.gray(`**Cost:** $${result.cost.usd.toFixed(4)} | ` +
        `**Duration:** ${(result.duration_ms / 1000).toFixed(1)}s | ` +
        `**Tokens:** ${result.cost.tokens.total.toLocaleString()}`));
    return output.join('\n');
}
