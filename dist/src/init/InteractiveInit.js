"use strict";
/**
 * InteractiveInit - Main orchestrator for interactive project setup
 */
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
const readline = __importStar(require("readline"));
const APIKeyDetector_1 = __importDefault(require("./APIKeyDetector"));
const AgentGenerator_1 = __importDefault(require("./AgentGenerator"));
const PromptBuilder_1 = __importDefault(require("./PromptBuilder"));
const ConfigWriter_1 = __importDefault(require("./ConfigWriter"));
const ProjectScanner_1 = __importDefault(require("./ProjectScanner"));
/**
 * InteractiveInit - Main orchestrator for interactive project setup
 */
class InteractiveInit {
    constructor(options = {}) {
        this.options = options;
        this.rl = null;
        this.lastDescription = null;
        this.lastScanContext = null;
    }
    /**
     * Main entry point for interactive init
     */
    async run() {
        try {
            // Print header
            PromptBuilder_1.default.header('LLM Conclave Interactive Setup');
            // Check for API keys
            if (!APIKeyDetector_1.default.printAvailability()) {
                PromptBuilder_1.default.info('\nCreating template configuration instead...\n');
                await ConfigWriter_1.default.createTemplate();
                return;
            }
            // Get best provider for setup
            const provider = APIKeyDetector_1.default.getBestProvider();
            if (!provider) {
                throw new Error('No provider available');
            }
            PromptBuilder_1.default.info(`Using ${provider.provider} for setup\n`);
            // Create readline interface
            this.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            // Step 1: Get project name
            const projectName = await this.promptProjectName();
            // Step 2: Get project description
            const description = await this.promptProjectDescription();
            this.lastDescription = description;
            this.lastScanContext = null;
            // Step 2.3: Ask about operational mode preference
            const operationalMode = await this.promptOperationalMode();
            // Step 2.5: Optional project scanning
            let scanContext = null;
            if (!this.options.noScan && !this.options.scan) {
                // Ask user if they want to scan
                if (this.rl && await ProjectScanner_1.default.shouldScan(this.rl)) {
                    scanContext = await this.scanProject();
                }
            }
            else if (this.options.scan) {
                // Force scan
                scanContext = await this.scanProject();
            }
            this.lastScanContext = scanContext;
            // Step 3: Generate agents
            PromptBuilder_1.default.thinking(`[Generating agents with ${provider.provider}...]`);
            const generator = new AgentGenerator_1.default(provider.provider, provider.model);
            const { agents, reasoning } = await generator.generateAgents(description, scanContext, operationalMode);
            // Step 4: Present agents to user
            const finalAgents = await this.presentAgentProposal(agents, reasoning, generator);
            // Step 5: Finalize setup
            await this.finalizeSetup(projectName, finalAgents, description);
            if (this.rl)
                this.rl.close();
        }
        catch (error) {
            if (this.rl) {
                this.rl.close();
            }
            if (error.message === 'USER_CANCELLED') {
                console.log('\n⚠️  Setup cancelled');
                console.log('No files created.\n');
                return;
            }
            throw error;
        }
    }
    /**
     * Prompt for project name
     */
    async promptProjectName() {
        // If provided in options, use that
        if (this.options.projectName) {
            PromptBuilder_1.default.info(`Project name: ${this.options.projectName}\n`);
            return this.options.projectName;
        }
        return new Promise((resolve) => {
            if (!this.rl)
                return resolve('my-project');
            this.rl.question('Project name: ', (answer) => {
                const name = answer.trim() || 'my-project';
                resolve(name);
            });
        });
    }
    /**
     * Scan project directory
     */
    async scanProject() {
        try {
            PromptBuilder_1.default.thinking('[Scanning project directory...]');
            const scanner = new ProjectScanner_1.default();
            const timeout = this.options.scanTimeout ? this.options.scanTimeout * 1000 : 30000;
            const results = await scanner.scan(timeout);
            console.log(`✓ ${results.summary.split('\n')[0]}`); // First line of summary
            console.log(`  ${scanner.getBriefSummary()}\n`);
            return scanner.formatForLLM();
        }
        catch (error) {
            console.warn(`⚠️  Scan failed: ${error.message}`);
            console.log('Continuing without scan results...\n');
            return null;
        }
    }
    /**
     * Prompt for project description
     */
    async promptProjectDescription() {
        PromptBuilder_1.default.question('Tell me about your project and the decisions you\'ll be making:');
        PromptBuilder_1.default.info('(Enter your description, then press Enter twice to finish)\n');
        return new Promise((resolve) => {
            if (!this.rl)
                return resolve('');
            let description = '';
            let emptyLineCount = 0;
            const onLine = (line) => {
                if (line.trim() === '') {
                    emptyLineCount++;
                    if (emptyLineCount >= 1) {
                        // User pressed Enter on empty line - done
                        if (this.rl)
                            this.rl.off('line', onLine);
                        resolve(description.trim());
                    }
                }
                else {
                    emptyLineCount = 0;
                    description += line + '\n';
                }
            };
            this.rl.on('line', onLine);
        });
    }
    /**
     * Prompt for operational mode preference
     */
    async promptOperationalMode() {
        console.log('\nWhich operational mode do you plan to use?\n');
        console.log('  1. Consensus (default) - All agents discuss entire task at once (fastest for most tasks)');
        console.log('  2. Iterative - Process task in chunks with multi-turn discussions (best for large files)');
        console.log('  3. Not sure - Generate flexible configuration\n');
        return new Promise((resolve) => {
            if (!this.rl)
                return resolve('consensus');
            this.rl.question('Your choice (1/2/3): ', (answer) => {
                const choice = answer.trim();
                if (choice === '2') {
                    resolve('iterative');
                }
                else if (choice === '3') {
                    resolve('flexible');
                }
                else {
                    resolve('consensus');
                }
            });
        });
    }
    /**
     * Present agent proposal and get user feedback
     */
    async presentAgentProposal(agents, reasoning, generator) {
        let currentAgents = agents;
        let done = false;
        while (!done) {
            console.log('\n' + '═'.repeat(80));
            console.log(`I recommend ${currentAgents.length} specialized agents for your project:`);
            console.log('═'.repeat(80) + '\n');
            console.log(PromptBuilder_1.default.formatAgentList(currentAgents));
            if (reasoning) {
                console.log(`\n${reasoning}\n`);
            }
            // Show menu
            const choice = await this.showMenu({
                'a': 'Accept and create config',
                'p': 'View full agent prompts',
                'r': 'Regenerate different agents',
                't': 'Create template config instead',
                'c': 'Cancel setup'
            });
            switch (choice.toLowerCase()) {
                case 'a':
                    done = true;
                    break;
                case 'p':
                    await this.showFullPrompts(currentAgents);
                    break;
                case 'r':
                    PromptBuilder_1.default.thinking('\n[Regenerating agents...]');
                    if (this.lastDescription) {
                        const result = await generator.generateAgents(this.lastDescription, this.lastScanContext);
                        currentAgents = result.agents;
                        reasoning = result.reasoning;
                    }
                    break;
                case 't':
                    await ConfigWriter_1.default.createTemplate();
                    throw new Error('USER_CANCELLED');
                case 'c':
                    throw new Error('USER_CANCELLED');
                default:
                    PromptBuilder_1.default.warning('Invalid choice. Please try again.');
            }
        }
        return currentAgents;
    }
    /**
     * Show menu and get user choice
     */
    async showMenu(options) {
        PromptBuilder_1.default.menu(options);
        return new Promise((resolve) => {
            if (!this.rl)
                return resolve('');
            this.rl.question('Your choice: ', (answer) => {
                resolve(answer.trim());
            });
        });
    }
    /**
     * Show full prompts for all agents
     */
    async showFullPrompts(agents) {
        console.log('\n' + '═'.repeat(80));
        console.log('Agent Prompts');
        console.log('═'.repeat(80) + '\n');
        agents.forEach((agent, index) => {
            console.log(`${index + 1}. ${agent.name} (${agent.model})`);
            console.log('─'.repeat(80));
            console.log(agent.prompt);
            console.log('\n');
        });
        console.log('Press Enter to continue...');
        return new Promise((resolve) => {
            if (!this.rl)
                return resolve();
            this.rl.once('line', () => resolve());
        });
    }
    /**
     * Finalize setup - write config and initialize project
     */
    async finalizeSetup(projectName, agents, description) {
        PromptBuilder_1.default.info('\nFinalizing setup...\n');
        try {
            const files = await ConfigWriter_1.default.writeConfig(projectName, agents, {
                description: description,
                overwrite: this.options.overwrite
            });
            ConfigWriter_1.default.printSummary(projectName, agents, files);
        }
        catch (error) {
            PromptBuilder_1.default.error(`\nSetup failed: ${error.message}\n`);
            throw error;
        }
    }
}
exports.default = InteractiveInit;
