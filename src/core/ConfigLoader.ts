import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Loads and validates configuration for the LLM Conclave
 */
export default class ConfigLoader {
  /**
   * Load configuration from a JSON file
   * @param {string} configPath - Path to the config file (default: .llm-conclave.json in current directory)
   * @returns {Object} - Validated configuration object
   */
  static load(configPath: string | null = null): any {
    const defaultPath = path.join(process.cwd(), '.llm-conclave.json');

    // Resolve configPath relative to current working directory if it's relative
    let filePath: string;
    if (configPath) {
      // Expand tilde to home directory (Node's path.isAbsolute doesn't handle ~)
      let resolved = configPath;
      if (resolved.startsWith('~/') || resolved === '~') {
        resolved = path.join(os.homedir(), resolved.slice(1));
      }
      filePath = path.isAbsolute(resolved)
        ? resolved
        : path.resolve(process.cwd(), resolved);
    } else {
      filePath = defaultPath;
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    let config;
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      config = JSON.parse(fileContent);
    } catch (error: any) {
      throw new Error(`Failed to parse configuration file: ${error.message}`);
    }

    return this.validate(config);
  }

  /**
   * Validate the configuration object
   * @param {Object} config - Configuration to validate
   * @returns {Object} - Validated configuration with defaults applied
   */
  static validate(config: any): any {
    const errors: string[] = [];

    // Validate turn_management (normalize variants like 'round_robin', 'round-robin')
    if (!config.turn_management) {
      config.turn_management = 'roundrobin'; // Default
    } else {
      config.turn_management = String(config.turn_management).toLowerCase().replace(/[-_\s]/g, '');
      if (!['roundrobin'].includes(config.turn_management)) {
        errors.push(`Invalid turn_management: ${config.turn_management}. Supported: roundrobin`);
      }
    }

    // Validate judge configuration
    if (!config.judge) {
      config.judge = {
        model: 'gpt-4o',
        prompt: 'You are the judge and coordinator of a multi-agent discussion. Your role is to evaluate whether the agents have reached a sufficient consensus on the task at hand. After each round, analyze the agents\' responses and determine if they have converged on a solution. If consensus is reached, state "CONSENSUS_REACHED" and summarize the agreed-upon solution. If not, provide guidance to help the agents move toward agreement.'
      };
    } else {
      if (!config.judge.model) {
        config.judge.model = 'gpt-4o'; // Default
      }
      // Normalize systemPrompt to prompt for judge (same as agents)
      if (!config.judge.prompt && config.judge.systemPrompt) {
        config.judge.prompt = config.judge.systemPrompt;
      }
      if (!config.judge.prompt) {
        config.judge.prompt = 'You are the judge and coordinator of a multi-agent discussion. Your role is to evaluate whether the agents have reached a sufficient consensus on the task at hand. After each round, analyze the agents\' responses and determine if they have converged on a solution. If consensus is reached, state "CONSENSUS_REACHED" and summarize the agreed-upon solution. If not, provide guidance to help the agents move toward agreement.';
      }
    }

    // Validate agents
    if (!config.agents || typeof config.agents !== 'object') {
      errors.push('Configuration must include an "agents" object');
    } else {
      const agentNames = Object.keys(config.agents);
      if (agentNames.length === 0) {
        errors.push('At least one agent must be defined');
      }

      for (const [name, agent] of Object.entries(config.agents) as [string, any][]) {
        if (!agent.model) {
          errors.push(`Agent "${name}" is missing required "model" field`);
        }
        // Accept both 'prompt' and 'systemPrompt' field names (normalize to 'prompt')
        if (!agent.prompt && !agent.systemPrompt) {
          errors.push(`Agent "${name}" is missing required "prompt" (or "systemPrompt") field`);
        } else if (agent.prompt && agent.systemPrompt && agent.prompt !== agent.systemPrompt) {
          // Warn if both fields are present with different values
          console.warn(`⚠️  Agent "${name}" has both "prompt" and "systemPrompt" with different values. Using "prompt".`);
        } else if (!agent.prompt && agent.systemPrompt) {
          // Normalize systemPrompt to prompt for internal use
          agent.prompt = agent.systemPrompt;
        }
      }
    }

    // Validate max_rounds (optional)
    if (config.max_rounds !== undefined) {
      if (typeof config.max_rounds !== 'number' || config.max_rounds < 1) {
        errors.push('max_rounds must be a positive number');
      }
    } else {
      config.max_rounds = 20; // Default
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    return config;
  }

  /**
   * Create an example configuration file
   * @param {string} outputPath - Where to write the example config
   */
  static createExample(outputPath = '.llm-conclave.json'): string {
    const exampleConfig = {
      turn_management: 'roundrobin',
      max_rounds: 20,
      judge: {
        model: 'gpt-4o',
        prompt: 'You are the judge and coordinator of this discussion. Evaluate whether consensus has been reached. If yes, respond with "CONSENSUS_REACHED" followed by the solution. If not, guide the discussion toward resolution.'
      },
      agents: {
        'Architect': {
          model: 'gpt-4o',
          prompt: 'You are a senior software architect. Approach problems from a systems design perspective, considering scalability, maintainability, and best practices.'
        },
        'Critic': {
          model: 'claude-sonnet-4-5',
          prompt: 'You are a critical thinker and devil\'s advocate. Challenge assumptions, identify potential issues, and push for robust solutions.'
        },
        'Pragmatist': {
          model: 'grok-3',
          prompt: 'You are a pragmatic engineer focused on practical, implementable solutions. Balance idealism with real-world constraints.'
        }
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(exampleConfig, null, 2));
    return outputPath;
  }
}
