/**
 * InteractiveSession - Claude CLI-style interactive REPL
 */

const readline = require('readline');
const Orchestrator = require('../orchestration/Orchestrator');
const StatusDisplay = require('./StatusDisplay');

class InteractiveSession {
  constructor(config, projectId = null) {
    this.config = config;
    this.projectId = projectId;
    this.orchestrator = new Orchestrator(config, projectId);
    this.display = new StatusDisplay();
    this.conversationHistory = [];
    this.rl = null;
    this.isRunning = false;
  }

  /**
   * Start the interactive session
   */
  async start() {
    this.isRunning = true;

    // Print welcome message
    this.printWelcome();

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[36mYou:\x1b[0m ',
      terminal: true
    });

    // Handle user input
    this.rl.on('line', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
        if (this.isRunning) {
          this.rl.prompt();
        }
        return;
      }

      // Process user message
      await this.processMessage(trimmed);

      if (this.isRunning) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.stop();
    });

    // Show initial prompt
    this.rl.prompt();
  }

  /**
   * Print welcome message
   */
  printWelcome() {
    console.log('\x1b[1m\x1b[36mLLM Conclave\x1b[0m - Multi-agent AI collaboration');

    if (this.projectId) {
      console.log(`\x1b[90mProject: ${this.projectId}\x1b[0m`);
    }

    const agentNames = Object.keys(this.config.agents);
    console.log(`\x1b[90mAgents: ${agentNames.join(', ')}\x1b[0m`);

    console.log('\x1b[90mType /help for commands, /exit to quit\x1b[0m');
    console.log('');
  }

  /**
   * Process a user message
   */
  async processMessage(message) {
    try {
      // Pause readline while processing
      this.rl.pause();

      // Show thinking status
      this.display.thinking('Thinking...');

      // Execute task with quiet mode
      const result = await this.orchestrator.executeTask(message, null, {
        quiet: true,
        onStatus: (step, total, message) => {
          this.display.step(step, total, message);
        }
      });

      // Clear status and show response
      this.display.clear();
      console.log(''); // Blank line
      this.display.response(result.output);
      console.log(''); // Blank line after response

      // Store in history
      this.conversationHistory.push({
        role: 'user',
        content: message
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: result.output
      });

    } catch (error) {
      this.display.error(`Error: ${error.message}`);
      console.log(''); // Blank line
    } finally {
      // Resume readline
      this.rl.resume();
    }
  }

  /**
   * Handle slash commands
   */
  async handleCommand(command) {
    const cmd = command.toLowerCase().split(' ')[0];

    switch (cmd) {
      case '/exit':
      case '/quit':
      case '/q':
        this.stop();
        break;

      case '/clear':
        console.clear();
        this.printWelcome();
        break;

      case '/history':
        this.showHistory();
        break;

      case '/reset':
        this.conversationHistory = [];
        this.display.success('Conversation history cleared');
        console.log('');
        break;

      case '/help':
        this.showHelp();
        break;

      default:
        this.display.warning(`Unknown command: ${cmd}`);
        console.log('Type /help for available commands');
        console.log('');
    }
  }

  /**
   * Show command help
   */
  showHelp() {
    console.log('');
    console.log('\x1b[1mAvailable Commands:\x1b[0m');
    console.log('  \x1b[36m/help\x1b[0m      - Show this help message');
    console.log('  \x1b[36m/exit\x1b[0m      - Exit the session');
    console.log('  \x1b[36m/clear\x1b[0m     - Clear the screen');
    console.log('  \x1b[36m/history\x1b[0m   - Show conversation history');
    console.log('  \x1b[36m/reset\x1b[0m     - Reset conversation history');
    console.log('');
  }

  /**
   * Show conversation history
   */
  showHistory() {
    console.log('');
    console.log('\x1b[1mConversation History:\x1b[0m');
    console.log('');

    if (this.conversationHistory.length === 0) {
      console.log('\x1b[90mNo history yet\x1b[0m');
      console.log('');
      return;
    }

    this.conversationHistory.forEach((msg, index) => {
      if (msg.role === 'user') {
        console.log(`\x1b[36mYou:\x1b[0m ${msg.content}`);
      } else {
        console.log(`\x1b[35mConclave:\x1b[0m ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
      }
      console.log('');
    });
  }

  /**
   * Stop the interactive session
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.rl) {
      this.rl.close();
    }

    console.log('');
    console.log('\x1b[90mGoodbye!\x1b[0m');
    process.exit(0);
  }
}

module.exports = InteractiveSession;
