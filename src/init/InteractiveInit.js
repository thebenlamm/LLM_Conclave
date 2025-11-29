/**
 * InteractiveInit - Main orchestrator for interactive project setup
 */

const readline = require('readline');
const APIKeyDetector = require('./APIKeyDetector');
const AgentGenerator = require('./AgentGenerator');
const PromptBuilder = require('./PromptBuilder');
const ConfigWriter = require('./ConfigWriter');
const ProjectScanner = require('./ProjectScanner');

class InteractiveInit {
  constructor(options = {}) {
    this.options = options;
    this.rl = null;
  }

  /**
   * Main entry point for interactive init
   */
  async run() {
    try {
      // Print header
      PromptBuilder.header('LLM Conclave Interactive Setup');

      // Check for API keys
      if (!APIKeyDetector.printAvailability()) {
        PromptBuilder.info('\nCreating template configuration instead...\n');
        await ConfigWriter.createTemplate();
        return;
      }

      // Get best provider for setup
      const provider = APIKeyDetector.getBestProvider();
      PromptBuilder.info(`Using ${provider.provider} for setup\n`);

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

      // Step 2.5: Optional project scanning
      let scanContext = null;
      if (!this.options.noScan && !this.options.scan) {
        // Ask user if they want to scan
        if (await ProjectScanner.shouldScan(this.rl)) {
          scanContext = await this.scanProject();
        }
      } else if (this.options.scan) {
        // Force scan
        scanContext = await this.scanProject();
      }
      this.lastScanContext = scanContext;

      // Step 3: Generate agents
      PromptBuilder.thinking(`[Generating agents with ${provider.provider}...]`);

      const generator = new AgentGenerator(provider.provider, provider.model);
      const { agents, reasoning } = await generator.generateAgents(description, scanContext);

      // Step 4: Present agents to user
      const finalAgents = await this.presentAgentProposal(agents, reasoning, generator);

      // Step 5: Finalize setup
      await this.finalizeSetup(projectName, finalAgents, description);

      this.rl.close();

    } catch (error) {
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
      PromptBuilder.info(`Project name: ${this.options.projectName}\n`);
      return this.options.projectName;
    }

    return new Promise((resolve) => {
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
      PromptBuilder.thinking('[Scanning project directory...]');

      const scanner = new ProjectScanner();
      const timeout = this.options.scanTimeout ? this.options.scanTimeout * 1000 : 30000;
      const results = await scanner.scan(timeout);

      console.log(`✓ ${results.summary.split('\n')[0]}`); // First line of summary
      console.log(`  ${scanner.getBriefSummary()}\n`);

      return scanner.formatForLLM();

    } catch (error) {
      console.warn(`⚠️  Scan failed: ${error.message}`);
      console.log('Continuing without scan results...\n');
      return null;
    }
  }

  /**
   * Prompt for project description
   */
  async promptProjectDescription() {
    PromptBuilder.question('Tell me about your project and the decisions you\'ll be making:');
    PromptBuilder.info('(Enter your description, then press Enter twice to finish)\n');

    return new Promise((resolve) => {
      let description = '';
      let emptyLineCount = 0;

      const onLine = (line) => {
        if (line.trim() === '') {
          emptyLineCount++;
          if (emptyLineCount >= 1) {
            // User pressed Enter on empty line - done
            this.rl.off('line', onLine);
            resolve(description.trim());
          }
        } else {
          emptyLineCount = 0;
          description += line + '\n';
        }
      };

      this.rl.on('line', onLine);
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

      console.log(PromptBuilder.formatAgentList(currentAgents));

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
          PromptBuilder.thinking('\n[Regenerating agents...]');
          const result = await generator.generateAgents(this.lastDescription, this.lastScanContext);
          currentAgents = result.agents;
          reasoning = result.reasoning;
          break;

        case 't':
          await ConfigWriter.createTemplate();
          throw new Error('USER_CANCELLED');

        case 'c':
          throw new Error('USER_CANCELLED');

        default:
          PromptBuilder.warning('Invalid choice. Please try again.');
      }
    }

    return currentAgents;
  }

  /**
   * Show menu and get user choice
   */
  async showMenu(options) {
    PromptBuilder.menu(options);

    return new Promise((resolve) => {
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
      this.rl.once('line', () => resolve());
    });
  }

  /**
   * Finalize setup - write config and initialize project
   */
  async finalizeSetup(projectName, agents, description) {
    PromptBuilder.info('\nFinalizing setup...\n');

    try {
      const files = await ConfigWriter.writeConfig(projectName, agents, {
        description: description,
        overwrite: this.options.overwrite
      });

      ConfigWriter.printSummary(projectName, agents, files);

    } catch (error) {
      PromptBuilder.error(`\nSetup failed: ${error.message}\n`);
      throw error;
    }
  }
}

module.exports = InteractiveInit;
