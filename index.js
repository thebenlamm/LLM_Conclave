#!/usr/bin/env node

require('dotenv').config({ override: true });
const fs = require('fs');
const readline = require('readline');
const ConfigLoader = require('./src/core/ConfigLoader');
const ConversationManager = require('./src/core/ConversationManager');
const OutputHandler = require('./src/core/OutputHandler');
const ProviderFactory = require('./src/providers/ProviderFactory');
const ProjectContext = require('./src/utils/ProjectContext');

/**
 * Main CLI entry point for LLM Conclave
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
║                              LLM CONCLAVE                                      ║
║                    Multi-Agent LLM Collaboration Tool                          ║
╚════════════════════════════════════════════════════════════════════════════════╝
`);

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Handle special commands
    if (args.includes('--help') || args.includes('-h')) {
      printHelp();
      process.exit(0);
    }

    if (args.includes('--init')) {
      const configPath = ConfigLoader.createExample();
      console.log(`✓ Created example configuration file: ${configPath}`);
      console.log(`  Edit this file to customize your agents and judge.`);
      console.log(`  Then run: node index.js "your task here"\n`);
      process.exit(0);
    }

    // Load configuration
    let config;
    const configIndex = args.indexOf('--config');
    const configPath = configIndex !== -1 ? args[configIndex + 1] : null;

    try {
      config = ConfigLoader.load(configPath);
    } catch (error) {
      console.error(`\n❌ Configuration Error: ${error.message}\n`);
      console.log(`Run 'node index.js --init' to create an example configuration file.\n`);
      process.exit(1);
    }

    // Check for project context
    let projectContext = null;
    const projectIndex = args.indexOf('--project');
    const projectPath = projectIndex !== -1 ? args[projectIndex + 1] : null;

    if (projectPath) {
      console.log(`\nLoading project context from: ${projectPath}`);
      projectContext = new ProjectContext(projectPath);
      const loadResult = await projectContext.load();

      if (!loadResult.success) {
        console.error(`\n❌ Project Context Error: ${loadResult.error}\n`);
        process.exit(1);
      }

      console.log(`✓ ${projectContext.getSummary()}\n`);
    }

    // Get task from arguments or prompt user
    let task = null;

    // Check if task is provided as argument
    const configValue = configIndex !== -1 ? args[configIndex + 1] : null;
    const projectValue = projectIndex !== -1 ? args[projectIndex + 1] : null;
    const nonFlagArgs = args.filter(arg =>
      !arg.startsWith('--') &&
      arg !== configValue &&
      arg !== projectValue
    );
    if (nonFlagArgs.length > 0) {
      task = nonFlagArgs.join(' ');
    }

    // Check if task is a file path
    if (task && fs.existsSync(task)) {
      console.log(`Reading task from file: ${task}`);
      task = fs.readFileSync(task, 'utf8').trim();
    }

    // If no task provided, prompt for it
    if (!task) {
      task = await promptForTask();
    }

    if (!task || task.trim() === '') {
      console.error('❌ No task provided. Exiting.\n');
      process.exit(1);
    }

    console.log(`\nTask: ${task}\n`);
    console.log(`Agents: ${Object.keys(config.agents).join(', ')}`);
    console.log(`Judge Model: ${config.judge.model}`);
    console.log(`Max Rounds: ${config.max_rounds}`);
    console.log(`Turn Management: ${config.turn_management}\n`);

    // Initialize judge
    const judge = {
      provider: ProviderFactory.createProvider(config.judge.model),
      systemPrompt: config.judge.prompt
    };

    // Create conversation manager
    const conversationManager = new ConversationManager(config);

    // Start the conversation
    console.log(`Starting conversation...\n`);
    const result = await conversationManager.startConversation(task, judge, projectContext);

    // Save results
    const filePaths = OutputHandler.saveResults(result);

    // Print summary
    OutputHandler.printSummary(result, filePaths);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Prompt user for task input
 */
async function promptForTask() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the task for the agents to solve: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
Usage: node index.js [options] [task]

Options:
  --help, -h          Show this help message
  --init              Create an example configuration file (.llm-conclave.json)
  --config <path>     Specify a custom configuration file path
  --project <path>    Include project/directory context for analysis

Task Input:
  You can provide the task in three ways:
  1. As a command-line argument: node index.js "Design a social media app"
  2. As a file path: node index.js task.txt
  3. Interactively: node index.js (you'll be prompted)

Project Context:
  Use --project to point the conclave at a codebase or document directory.
  The tool will read files and include them in the conversation context.
  Smart filtering excludes node_modules, .git, binaries, and large files.

Configuration:
  The tool looks for .llm-conclave.json in the current directory.
  Use --init to create an example configuration file.

Examples:
  node index.js --init
  node index.js "Create a task management app"
  node index.js task.txt
  node index.js --config custom-config.json "Design an API"
  node index.js --project ./my-app "Review this code for bugs"
  node index.js --project ../docs "Review my technical writing"

Environment Variables:
  OPENAI_API_KEY      - OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY   - Anthropic API key (for Claude models)
  XAI_API_KEY         - xAI API key (for Grok models)

  Create a .env file in the project root with these variables.
`);
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { main };
