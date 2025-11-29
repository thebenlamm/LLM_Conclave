/**
 * ConfigWriter - Writes validated configuration and initializes project
 */

const fs = require('fs').promises;
const path = require('path');
const MemoryManager = require('../memory/MemoryManager');
const PromptBuilder = require('./PromptBuilder');

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
    } catch (error) {
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
      const memoryManager = new MemoryManager();
      await memoryManager.createProject(projectName, {
        overview: options.description || '',
        projectPath: process.cwd()
      });

      projectMemoryPath = memoryManager.getProjectMemoryPath(projectName);
    } catch (error) {
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

    PromptBuilder.setupSummary(projectName, agents.length, createdFiles);
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
    } catch (error) {
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

module.exports = ConfigWriter;
