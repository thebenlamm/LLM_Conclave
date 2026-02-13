import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ConfigLoader from '../core/ConfigLoader';
import { ConfigPaths } from '../utils/ConfigPaths';

/**
 * Configuration cascading system following 12-Factor App principles
 * Priority (highest to lowest):
 * 1. CLI flags
 * 2. Environment variables (CONCLAVE_*)
 * 3. Project config (.llm-conclave.json)
 * 4. Global config (~/.llm-conclave/config.json)
 * 5. Smart defaults (built-in)
 */
export class ConfigCascade {
  /**
   * Resolve configuration from all sources
   */
  static resolve(cliFlags: Record<string, any>, envVars: NodeJS.ProcessEnv = process.env): any {
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
  private static getDefaults(): any {
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
        provider: 'openai',
        prompt: 'You are a wise and impartial judge who synthesizes diverse perspectives to reach well-reasoned conclusions. You evaluate arguments fairly, identify common ground, and guide discussions toward consensus.'
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
      },
      // Consult mode defaults (Epic 2, Story 1)
      consult: {
        alwaysAllowUnder: 0.50 // Auto-approve consultations under $0.50
      }
    };
  }

  /**
   * Load global configuration from user's home directory
   */
  private static loadGlobalConfig(): any {
    const globalConfigPath = ConfigPaths.globalConfig;

    if (!fs.existsSync(globalConfigPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Could not load global config from ${globalConfigPath}`);
      return {};
    }
  }

  /**
   * Load project configuration from .llm-conclave.json or inline JSON
   */
  private static loadProjectConfig(customPath?: string): any {
    // Support inline JSON (starts with '{')
    if (customPath && customPath.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(customPath);
        return ConfigLoader.validate(parsed);
      } catch (error: any) {
        throw new Error(`Failed to parse inline JSON config: ${error.message}`);
      }
    }

    // Otherwise treat as file path
    try {
      return ConfigLoader.load(customPath);
    } catch (error: any) {
      // If a custom path was explicitly provided but failed, warn the user
      if (customPath) {
        console.error(`\n❌ Failed to load config from "${customPath}": ${error.message}`);
        console.error(`   Falling back to default agents (Primary, Validator, Reviewer).`);
        console.error(`   Check your config file format. Required agent fields: "model" and "prompt" (or "systemPrompt")\n`);
      }
      // No project config is OK - we have defaults
      return {};
    }
  }

  /**
   * Valid top-level configuration keys that can be set via environment variables
   */
  private static readonly VALID_ENV_KEYS = new Set([
    'mode',
    'stream',
    'rounds',
    'judge',
    'providers',
    'agents',
    'output',
    'verbose',
    'quiet',
    'project',
    'context',
    'format',
    'quick',
    'confidence',
    'auto_approve'
  ]);

  /**
   * Valid nested configuration keys (parent_child format)
   */
  private static readonly VALID_NESTED_KEYS = new Set([
    'judge_model',
    'judge_provider',
    'judge_prompt',
    'output_format',
    'output_dir',
    'providers_openai',
    'providers_anthropic',
    'providers_google',
    'providers_xai',
    'providers_mistral',
    'anthropic_context_editing'
  ]);

  /**
   * Parse environment variables with CONCLAVE_ prefix
   */
  private static parseEnvVars(envVars: NodeJS.ProcessEnv): any {
    const config: any = {};

    for (const [key, value] of Object.entries(envVars)) {
      if (!value || !key.startsWith('CONCLAVE_')) continue;

      const configKey = key.replace('CONCLAVE_', '').toLowerCase();

      // Validate the key before processing
      const topLevelKey = configKey.split('_')[0];
      if (!this.VALID_ENV_KEYS.has(topLevelKey) && !this.VALID_NESTED_KEYS.has(configKey)) {
        // Skip invalid keys with a warning (only in non-production)
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Warning: Unknown environment variable ${key} ignored`);
        }
        continue;
      }

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
      } else {
        config[configKey] = this.parseValue(value);
      }
    }

    return config;
  }

  /**
   * Parse string value to appropriate type
   */
  private static parseValue(value: string): any {
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    if (!isNaN(Number(value)) && value !== '') {
      return Number(value);
    }

    // JSON
    if ((value.startsWith('{') && value.endsWith('}')) ||
        (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return value;
  }

  /**
   * Remove Commander.js internal properties from CLI flags
   */
  private static sanitizeCLIFlags(flags: Record<string, any>): any {
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
  static shouldUseZeroConfig(): boolean {
    const projectConfigExists = fs.existsSync('.llm-conclave.json');
    const globalConfigPath = ConfigPaths.globalConfig;
    const globalConfigExists = fs.existsSync(globalConfigPath);

    return !projectConfigExists && !globalConfigExists;
  }

  /**
   * Get zero-config message
   */
  static getZeroConfigMessage(): string {
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
