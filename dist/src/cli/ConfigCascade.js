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
exports.ConfigCascade = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const ConfigLoader_1 = __importDefault(require("../core/ConfigLoader"));
/**
 * Configuration cascading system following 12-Factor App principles
 * Priority (highest to lowest):
 * 1. CLI flags
 * 2. Environment variables (CONCLAVE_*)
 * 3. Project config (.llm-conclave.json)
 * 4. Global config (~/.config/llm-conclave/config.json)
 * 5. Smart defaults (built-in)
 */
class ConfigCascade {
    /**
     * Resolve configuration from all sources
     */
    static resolve(cliFlags, envVars = process.env) {
        const defaults = this.getDefaults();
        const global = this.loadGlobalConfig();
        const project = this.loadProjectConfig(cliFlags.config);
        const env = this.parseEnvVars(envVars);
        // Merge configurations (later sources override earlier ones)
        return {
            ...defaults,
            ...global,
            ...project,
            ...env,
            ...this.sanitizeCLIFlags(cliFlags)
        };
    }
    /**
     * Get smart defaults that work out of the box
     */
    static getDefaults() {
        return {
            mode: 'consensus', // Default mode
            stream: true, // Stream responses by default
            providers: {
                openai: { enabled: true },
                anthropic: { enabled: true },
                google: { enabled: true },
                xai: { enabled: true },
                mistral: { enabled: true }
            },
            judge: {
                model: 'gpt-4o',
                provider: 'openai'
            },
            // Built-in default agents (zero-config)
            agents: {
                'Primary': {
                    model: 'claude-sonnet-4-5',
                    provider: 'anthropic',
                    systemPrompt: 'You are a helpful AI assistant focused on solving problems accurately and efficiently.'
                },
                'Validator': {
                    model: 'gpt-4o',
                    provider: 'openai',
                    systemPrompt: 'You validate solutions and provide constructive feedback to improve quality.'
                },
                'Reviewer': {
                    model: 'gemini-2.5-pro',
                    provider: 'google',
                    systemPrompt: 'You review work from multiple perspectives and identify potential issues.'
                }
            }
        };
    }
    /**
     * Load global configuration from user's home directory
     */
    static loadGlobalConfig() {
        const globalConfigPath = path.join(os.homedir(), '.config', 'llm-conclave', 'config.json');
        if (!fs.existsSync(globalConfigPath)) {
            return {};
        }
        try {
            const content = fs.readFileSync(globalConfigPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            console.warn(`Warning: Could not load global config from ${globalConfigPath}`);
            return {};
        }
    }
    /**
     * Load project configuration from .llm-conclave.json
     */
    static loadProjectConfig(customPath) {
        try {
            return ConfigLoader_1.default.load(customPath);
        }
        catch (error) {
            // No project config is OK - we have defaults
            return {};
        }
    }
    /**
     * Parse environment variables with CONCLAVE_ prefix
     */
    static parseEnvVars(envVars) {
        const config = {};
        for (const [key, value] of Object.entries(envVars)) {
            if (!value || !key.startsWith('CONCLAVE_'))
                continue;
            const configKey = key.replace('CONCLAVE_', '').toLowerCase();
            // Handle nested keys (e.g., CONCLAVE_JUDGE_MODEL -> judge.model)
            if (configKey.includes('_')) {
                const parts = configKey.split('_');
                let current = config;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = this.parseValue(value);
            }
            else {
                config[configKey] = this.parseValue(value);
            }
        }
        return config;
    }
    /**
     * Parse string value to appropriate type
     */
    static parseValue(value) {
        // Boolean
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        // Number
        if (!isNaN(Number(value)) && value !== '') {
            return Number(value);
        }
        // JSON
        if ((value.startsWith('{') && value.endsWith('}')) ||
            (value.startsWith('[') && value.endsWith(']'))) {
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        return value;
    }
    /**
     * Remove Commander.js internal properties from CLI flags
     */
    static sanitizeCLIFlags(flags) {
        const sanitized = { ...flags };
        // Remove Commander.js internals
        delete sanitized._;
        delete sanitized.args;
        delete sanitized.rawArgs;
        delete sanitized.commands;
        delete sanitized.options;
        return sanitized;
    }
    /**
     * Check if zero-config mode should be used
     */
    static shouldUseZeroConfig() {
        const projectConfigExists = fs.existsSync('.llm-conclave.json');
        const globalConfigPath = path.join(os.homedir(), '.config', 'llm-conclave', 'config.json');
        const globalConfigExists = fs.existsSync(globalConfigPath);
        return !projectConfigExists && !globalConfigExists;
    }
    /**
     * Get zero-config message
     */
    static getZeroConfigMessage() {
        return `
ℹ️  No configuration found. Using smart defaults...
   • Mode: Consensus (3 expert agents)
   • Agents: Claude Sonnet 4.5, GPT-4o, Gemini Pro
   • Judge: GPT-4o

   💡 Want to customize? Run: llm-conclave init
      Or continue with defaults - they work great!
`;
    }
}
exports.ConfigCascade = ConfigCascade;
