"use strict";
/**
 * ConfigWriter - Writes validated configuration and initializes project
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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const MemoryManager_1 = __importDefault(require("../memory/MemoryManager"));
const PromptBuilder_1 = __importDefault(require("./PromptBuilder"));
/**
 * ConfigWriter - Writes validated configuration and initializes project
 */
class ConfigWriter {
    /**
     * Write config file and initialize project
     * @param {string} projectName - Project identifier
     * @param {Array} agents - Array of agent configurations
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} { configPath, projectMemoryPath }
     */
    static async writeConfig(projectName, agents, options = {}) {
        const configPath = path.join(process.cwd(), '.llm-conclave.json');
        // Check if config already exists
        try {
            await fs.access(configPath);
            if (!options.overwrite) {
                throw new Error('.llm-conclave.json already exists. Use --overwrite to replace it.');
            }
        }
        catch (error) {
            // File doesn't exist, which is what we want
            if (error.code !== 'ENOENT' && error.message.includes('already exists')) {
                throw error;
            }
        }
        // Build config object
        const config = this.buildConfigObject(projectName, agents, options);
        // Write config file
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
        // Initialize project memory
        let projectMemoryPath = null;
        try {
            const memoryManager = new MemoryManager_1.default();
            await memoryManager.createProject(projectName, {
                overview: options.description || '',
                projectPath: process.cwd()
            });
            projectMemoryPath = memoryManager.getProjectMemoryPath(projectName);
        }
        catch (error) {
            // If project already exists, that's okay
            if (!error.message.includes('already exists')) {
                console.warn(`Warning: Could not initialize project memory: ${error.message}`);
            }
        }
        return {
            configPath,
            projectMemoryPath
        };
    }
    /**
     * Build the configuration object
     */
    static buildConfigObject(projectName, agents, options = {}) {
        // Transform agents array to config format
        const agentsConfig = {};
        agents.forEach(agent => {
            agentsConfig[agent.name] = {
                model: agent.model,
                prompt: agent.prompt
            };
        });
        // Build full config
        const config = {
            project_id: projectName,
            created: new Date().toISOString(),
            created_by: 'interactive_init',
            turn_management: 'roundrobin',
            max_rounds: options.maxRounds || 10,
            judge: {
                model: options.judgeModel || 'gpt-4o',
                prompt: options.judgePrompt || 'You are a neutral judge facilitating multi-agent discussions. Evaluate whether agents have reached consensus. When consensus is reached, respond with \'CONSENSUS_REACHED\' followed by a summary. Otherwise, provide brief guidance to help the agents converge.'
            },
            agents: agentsConfig
        };
        return config;
    }
    /**
     * Print setup summary
     */
    static printSummary(projectName, agents, files) {
        const createdFiles = [
            '.llm-conclave.json'
        ];
        if (files.projectMemoryPath) {
            createdFiles.push(`.conclave/projects/${projectName}.json`);
        }
        PromptBuilder_1.default.setupSummary(projectName, agents.length, createdFiles);
    }
    /**
     * Create a fallback template config (when no API keys)
     */
    static async createTemplate() {
        const configPath = path.join(process.cwd(), '.llm-conclave.json');
        // Check if exists
        try {
            await fs.access(configPath);
            console.log('⚠️  .llm-conclave.json already exists\n');
            return configPath;
        }
        catch (error) {
            // Doesn't exist, create it
        }
        const template = {
            project_id: 'my-project',
            turn_management: 'roundrobin',
            max_rounds: 10,
            judge: {
                model: 'gpt-4o',
                prompt: 'You are a neutral judge facilitating multi-agent discussions. Evaluate whether agents have reached consensus. When consensus is reached, respond with \'CONSENSUS_REACHED\' followed by a summary. Otherwise, provide brief guidance.'
            },
            agents: {
                Agent1: {
                    model: 'claude-sonnet-4-5',
                    prompt: 'You are Agent1, a helpful AI assistant. Collaborate with other agents to solve tasks.'
                },
                Agent2: {
                    model: 'gpt-4o',
                    prompt: 'You are Agent2, a helpful AI assistant. Collaborate with other agents to solve tasks.'
                },
                Agent3: {
                    model: 'gpt-4o',
                    prompt: 'You are Agent3, a helpful AI assistant. Collaborate with other agents to solve tasks.'
                }
            }
        };
        await fs.writeFile(configPath, JSON.stringify(template, null, 2), 'utf8');
        console.log('✓ Created template configuration: .llm-conclave.json');
        console.log('\nEdit this file to customize your agents.');
        console.log('Then run: llm-conclave --init-project my-project\n');
        return configPath;
    }
}
exports.default = ConfigWriter;
