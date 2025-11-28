#!/usr/bin/env node

require('dotenv').config({ override: true });
const fs = require('fs');
const readline = require('readline');
const ConfigLoader = require('./src/core/ConfigLoader');
const ConversationManager = require('./src/core/ConversationManager');
const OutputHandler = require('./src/core/OutputHandler');
const ProviderFactory = require('./src/providers/ProviderFactory');
const ProjectContext = require('./src/utils/ProjectContext');
const MemoryManager = require('./src/memory/MemoryManager');
const Orchestrator = require('./src/orchestration/Orchestrator');

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

    // Handle project memory commands
    if (args.includes('--init-project')) {
      await handleInitProject(args);
      process.exit(0);
    }

    if (args.includes('--list-projects')) {
      await handleListProjects();
      process.exit(0);
    }

    if (args.includes('--project-info')) {
      await handleProjectInfo(args);
      process.exit(0);
    }

    if (args.includes('--delete-project')) {
      await handleDeleteProject(args);
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

    // Check for project memory
    let memoryManager = null;
    const projectIdIndex = args.indexOf('--project-id');
    const projectId = projectIdIndex !== -1 ? args[projectIdIndex + 1] : null;

    if (projectId) {
      console.log(`\nLoading project memory: ${projectId}`);
      memoryManager = new MemoryManager();
      try {
        await memoryManager.loadProject(projectId);
        console.log(`✓ Project memory loaded`);
        console.log(`  Total conversations: ${memoryManager.projectMemory.metadata.totalConversations}`);
        console.log(`  Total decisions: ${memoryManager.projectMemory.metadata.totalDecisions}\n`);
      } catch (error) {
        console.error(`\n❌ ${error.message}\n`);
        process.exit(1);
      }
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

    // Check if orchestrated mode is enabled
    const orchestrated = args.includes('--orchestrated');

    let result;

    if (orchestrated) {
      // Use orchestrated mode
      console.log(`Mode: Orchestrated (Primary/Secondary/Validation flow)\n`);

      const orchestrator = new Orchestrator(config, memoryManager);
      result = await orchestrator.executeTask(task, projectContext);

      // Save orchestrated results
      const filePaths = saveOrchestratedResults(result);
      printOrchestratedSummary(result, filePaths);

    } else {
      // Use standard consensus mode
      console.log(`Judge Model: ${config.judge.model}`);
      console.log(`Max Rounds: ${config.max_rounds}`);
      console.log(`Turn Management: ${config.turn_management}\n`);

      // Initialize judge
      const judge = {
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt
      };

      // Create conversation manager with optional memory manager
      const conversationManager = new ConversationManager(config, memoryManager);

      // Start the conversation
      console.log(`Starting conversation...\n`);
      result = await conversationManager.startConversation(task, judge, projectContext);

      // Save results
      const filePaths = OutputHandler.saveResults(result);

      // Print summary
      OutputHandler.printSummary(result, filePaths);
    }

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
  --project <path>    Include file or directory context for analysis
  --orchestrated      Use orchestrated mode (primary/secondary/validation flow)

Project Memory Options:
  --init-project <id>       Create a new project with persistent memory
  --project-id <id>         Use an existing project (loads its memory)
  --list-projects           List all projects
  --project-info <id>       Show information about a project
  --delete-project <id>     Delete a project

Modes:
  Standard Mode (default):
    - All agents discuss together in rounds
    - Judge evaluates consensus
    - Best for open-ended collaboration

  Orchestrated Mode (--orchestrated):
    - Primary agent responds first (based on task classification)
    - Secondary agents provide structured critiques
    - Primary agent revises based on feedback
    - Validator agents review final output
    - Best for domain-specific advisory workflows

Task Input:
  You can provide the task in three ways:
  1. As a command-line argument: node index.js "Design a social media app"
  2. As a file path: node index.js task.txt
  3. Interactively: node index.js (you'll be prompted)

Project Context:
  Use --project to point the conclave at a file or directory.
  - Single file: Reads and includes that file's content
  - Directory: Reads all files with smart filtering (excludes node_modules, .git, binaries, large files)

Configuration:
  The tool looks for .llm-conclave.json in the current directory.
  Use --init to create an example configuration file.

Examples:
  node index.js --init
  node index.js "Create a task management app"
  node index.js task.txt
  node index.js --config custom-config.json "Design an API"
  node index.js --project ./my-app "Review this code for bugs"

  # Project Memory Examples
  node index.js --init-project my-company
  node index.js --project-id my-company "We need to name our first product"
  node index.js --list-projects
  node index.js --project-info my-company

  # Orchestrated Mode Examples
  node index.js --orchestrated "Name our skincare product line"
  node index.js --orchestrated --project-id my-company "Plan our launch strategy"
  node index.js --orchestrated --config advisors.json "Create marketing campaign"

Environment Variables:
  OPENAI_API_KEY      - OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY   - Anthropic API key (for Claude models)
  XAI_API_KEY         - xAI API key (for Grok models)

  Create a .env file in the project root with these variables.
`);
}

/**
 * Handle --init-project command
 */
async function handleInitProject(args) {
  const index = args.indexOf('--init-project');
  const projectId = args[index + 1];

  if (!projectId) {
    console.error('❌ Please provide a project ID: --init-project <id>\n');
    process.exit(1);
  }

  const memoryManager = new MemoryManager();

  try {
    await memoryManager.createProject(projectId, {});
    console.log(`✓ Created project: ${projectId}`);
    console.log(`  Memory stored in: .conclave/projects/${projectId}.json`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: node index.js --project-id ${projectId} "your task"`);
    console.log(`  2. The project will remember all decisions and context\n`);
  } catch (error) {
    console.error(`❌ ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Handle --list-projects command
 */
async function handleListProjects() {
  const memoryManager = new MemoryManager();

  try {
    const projects = await memoryManager.listProjects();

    if (projects.length === 0) {
      console.log('No projects found. Create one with: --init-project <id>\n');
      return;
    }

    console.log(`Found ${projects.length} project(s):\n`);

    for (const projectId of projects) {
      const info = await memoryManager.getProjectInfo(projectId);
      console.log(`  ${projectId}`);
      if (info) {
        console.log(`    Created: ${new Date(info.created).toLocaleDateString()}`);
        console.log(`    Last Modified: ${new Date(info.lastModified).toLocaleDateString()}`);
        console.log(`    Conversations: ${info.totalConversations}, Decisions: ${info.totalDecisions}`);
        if (info.overview) {
          console.log(`    Overview: ${info.overview}`);
        }
      }
      console.log();
    }
  } catch (error) {
    console.error(`❌ ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Handle --project-info command
 */
async function handleProjectInfo(args) {
  const index = args.indexOf('--project-info');
  const projectId = args[index + 1];

  if (!projectId) {
    console.error('❌ Please provide a project ID: --project-info <id>\n');
    process.exit(1);
  }

  const memoryManager = new MemoryManager();

  try {
    await memoryManager.loadProject(projectId);
    const memory = memoryManager.projectMemory;

    console.log(`\nProject: ${projectId}`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(`Created: ${new Date(memory.created).toLocaleString()}`);
    console.log(`Last Modified: ${new Date(memory.lastModified).toLocaleString()}\n`);

    if (memory.coreContext.overview) {
      console.log(`Overview: ${memory.coreContext.overview}\n`);
    }

    if (memory.coreContext.goals.length > 0) {
      console.log(`Goals:`);
      memory.coreContext.goals.forEach(g => console.log(`  - ${g}`));
      console.log();
    }

    console.log(`Statistics:`);
    console.log(`  Total Conversations: ${memory.metadata.totalConversations}`);
    console.log(`  Total Decisions: ${memory.metadata.totalDecisions}`);

    if (Object.keys(memory.metadata.agentParticipation).length > 0) {
      console.log(`\nAgent Participation:`);
      Object.entries(memory.metadata.agentParticipation).forEach(([agent, count]) => {
        console.log(`  ${agent}: ${count} conversations`);
      });
    }

    if (memory.decisions.length > 0) {
      console.log(`\nRecent Decisions (last 5):`);
      memory.decisions.slice(-5).forEach(d => {
        console.log(`  - ${d.topic} (${new Date(d.timestamp).toLocaleDateString()})`);
        if (d.outcome) {
          console.log(`    ${d.outcome.substring(0, 100)}${d.outcome.length > 100 ? '...' : ''}`);
        }
      });
    }
    console.log();

  } catch (error) {
    console.error(`❌ ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Handle --delete-project command
 */
async function handleDeleteProject(args) {
  const index = args.indexOf('--delete-project');
  const projectId = args[index + 1];

  if (!projectId) {
    console.error('❌ Please provide a project ID: --delete-project <id>\n');
    process.exit(1);
  }

  const memoryManager = new MemoryManager();

  try {
    await memoryManager.deleteProject(projectId);
    console.log(`✓ Deleted project: ${projectId}\n`);
  } catch (error) {
    console.error(`❌ ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Save orchestrated conversation results
 */
function saveOrchestratedResults(result) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const outputDir = `outputs/conclave-${timestamp}`;

  // Create output directory
  if (!fs.existsSync('outputs')) {
    fs.mkdirSync('outputs');
  }
  fs.mkdirSync(outputDir);

  const transcriptPath = `${outputDir}/conclave-${timestamp}-orchestrated-transcript.md`;
  const finalPath = `${outputDir}/conclave-${timestamp}-final-output.md`;
  const jsonPath = `${outputDir}/conclave-${timestamp}-full.json`;

  // Generate transcript
  let transcript = `# LLM Conclave Orchestrated Conversation\n\n`;
  transcript += `**Task:** ${result.task}\n\n`;
  transcript += `**Mode:** Orchestrated\n\n`;
  transcript += `**Primary Agent:** ${result.classification.primaryAgent}\n`;
  transcript += `**Task Type:** ${result.classification.taskType}\n`;
  transcript += `**Confidence:** ${(result.classification.confidence * 100).toFixed(0)}%\n\n`;
  transcript += `---\n\n`;

  transcript += `## Phase 1: Primary Response\n\n`;
  transcript += `**Agent:** ${result.classification.primaryAgent}\n\n`;
  transcript += `${result.primaryResponse}\n\n`;
  transcript += `---\n\n`;

  transcript += `## Phase 2: Critiques\n\n`;
  result.critiques.forEach(critique => {
    transcript += `### ${critique.agent}\n\n`;
    transcript += `${critique.content}\n\n`;
  });
  transcript += `---\n\n`;

  transcript += `## Phase 3: Revised Response\n\n`;
  transcript += `**Agent:** ${result.classification.primaryAgent}\n\n`;
  transcript += `${result.revisedResponse}\n\n`;

  if (result.validations && result.validations.length > 0) {
    transcript += `---\n\n`;
    transcript += `## Phase 4: Validation\n\n`;
    result.validations.forEach(validation => {
      transcript += `### ${validation.validator}\n\n`;
      transcript += `**Status:** ${validation.status}\n\n`;
      transcript += `${validation.content}\n\n`;
    });
  }

  // Write files
  fs.writeFileSync(transcriptPath, transcript);

  let finalOutput = `# Final Output\n\n`;
  finalOutput += `**Task:** ${result.task}\n\n`;
  finalOutput += `---\n\n`;
  finalOutput += `${result.finalOutput}\n`;

  if (result.validations && result.validations.length > 0) {
    finalOutput += `\n---\n\n## Validation Summary\n\n`;
    result.validations.forEach(v => {
      finalOutput += `- **${v.validator}:** ${v.status}\n`;
    });
  }

  fs.writeFileSync(finalPath, finalOutput);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  return {
    transcript: transcriptPath,
    final: finalPath,
    json: jsonPath
  };
}

/**
 * Print orchestrated conversation summary
 */
function printOrchestratedSummary(result, filePaths) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ORCHESTRATED CONVERSATION COMPLETE`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Task: ${result.task}`);
  console.log(`Primary Agent: ${result.classification.primaryAgent}`);
  console.log(`Task Type: ${result.classification.taskType}\n`);

  if (result.validations && result.validations.length > 0) {
    console.log(`Validation Results:`);
    result.validations.forEach(v => {
      const icon = v.status === 'PASS' ? '✓' : v.status === 'FAIL' ? '✗' : '⚠';
      console.log(`  ${icon} ${v.validator}: ${v.status}`);
    });
    console.log();
  }

  console.log(`Files saved:`);
  console.log(`  - Full transcript: ${filePaths.transcript}`);
  console.log(`  - Final output: ${filePaths.final}`);
  console.log(`  - JSON data: ${filePaths.json}\n`);

  console.log(`Final Output:`);
  console.log(`${'-'.repeat(80)}`);
  const preview = result.finalOutput.substring(0, 500);
  console.log(preview);
  if (result.finalOutput.length > 500) {
    console.log(`\n... (see ${filePaths.final} for full output)`);
  }
  console.log(`${'-'.repeat(80)}\n`);
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { main };
