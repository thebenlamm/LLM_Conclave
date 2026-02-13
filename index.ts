#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigCascade } from './src/cli/ConfigCascade';
import { PersonaSystem } from './src/cli/PersonaSystem';
import { ModeDetector } from './src/cli/ModeDetector';

// Import command handlers
import { createDiscussCommand } from './src/commands/discuss';
import { createReviewCommand } from './src/commands/review';
import { createIterateCommand } from './src/commands/iterate';
import { createConsultCommand } from './src/commands/consult';
import { createTemplateCommand, executeTemplate } from './src/commands/template';
import { createInitCommand } from './src/commands/init';
import { createTemplatesCommand } from './src/commands/templates';
import { createSessionsCommand } from './src/commands/sessions';
import { createContinueCommand } from './src/commands/continue';
import { createServerCommand } from './src/commands/server';
import { createConfigCommand } from './src/commands/config';
import { createPersonasCommand } from './src/commands/personas';
import { createConsultStatsCommand } from './src/commands/consult-stats';

const program = new Command();

// Banner
console.log(chalk.cyan(`
╔════════════════════════════════════════════════════════════════════════════════╗
║                              LLM CONCLAVE                                      ║
║                    Multi-Agent LLM Collaboration Tool                          ║
╚════════════════════════════════════════════════════════════════════════════════╝
`));

// Main program configuration
program
  .name('llm-conclave')
  .description('Multi-agent LLM collaboration tool')
  .version('2.0.0');

// Default action (smart mode when no subcommand specified)
program
  .argument('[task...]','Task for agents to solve')
  .option('-p, --project <path>', 'Project context (file or directory)')
  .option('-c, --config <path>', 'Custom config file')
  .option('--with <personas>', 'Comma-separated list of personas to use (e.g., security,performance)')
  .option('--quick', 'Quick mode (fewer rounds, faster)')
  .option('--deep', 'Deep mode (more rounds, thorough)')
  .option('--thorough', 'Thorough mode (maximum rounds)')
  .option('--stream', 'Stream agent responses (default: true)', true)
  .option('--no-stream', 'Disable streaming')
  .option('-t, --template <name>', 'Run with a predefined template')
  .hook('preAction', async (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (opts.template) {
      // Execute template instead of subcommand
      // Combine arguments from the command that was about to run
      const args = actionCommand.args; 
      const task = args.join(' ');
      
      // Pass options from root command (opts) merged with actionCommand opts?
      // Usually root opts are available.
      await executeTemplate(opts.template, task, opts);
      process.exit(0);
    }
  })
  .action(async (taskArgs: string[], options: any) => {
    const task = taskArgs.join(' ');

    // If no task and no command, show interactive mode
    if (!task) {
      const InteractiveSession = (await import('./src/interactive/InteractiveSession')).default;
      const config = ConfigCascade.resolve(options);
      const projectId = config.project_id || null;
      const session = new InteractiveSession(config, projectId);
      await session.start();
      return;
    }

    // Smart mode: Auto-detect which mode to use
    await smartMode(task, options);
  });

/**
 * Smart mode: Auto-detects the best mode based on task and context
 */
async function smartMode(task: string, options: any) {
  const inquirer = (await import('inquirer')).default;
  const ora = (await import('ora')).default;

  // Detect mode
  const detection = ModeDetector.analyze(task, options);

  // Show detection result
  console.log(chalk.blue(`
🔍 Task Analysis:`));
  console.log(`   Mode: ${chalk.bold(detection.mode)}`);
  console.log(`   Confidence: ${Math.round(detection.confidence * 100)}%`);
  console.log(`   Reason: ${detection.reason}\n`);

  // If confidence is low, ask user to confirm
  let finalMode = detection.mode;
  if (detection.confidence < 0.8) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Confirm mode or choose different:',
        choices: [
          { name: `${detection.mode} (suggested)`, value: detection.mode },
          { name: 'consensus - Democratic discussion', value: 'consensus' },
          { name: 'orchestrated - Structured review', value: 'orchestrated' },
          { name: 'iterative - Chunk-based collaboration', value: 'iterative' }
        ],
        default: detection.mode
      }
    ]);
    finalMode = answer.mode;
  }

  // Show zero-config message if applicable
  if (ConfigCascade.shouldUseZeroConfig()) {
    console.log(chalk.yellow(ConfigCascade.getZeroConfigMessage()));
  }

  // Route to appropriate handler based on detected mode
  switch (finalMode) {
    case 'consensus':
      await runConsensusMode(task, options);
      break;
    case 'orchestrated':
      await runOrchestratedMode(task, options);
      break;
    case 'iterative':
      await runIterativeMode(task, options);
      break;
  }
}

/**
 * Run consensus mode (discuss command)
 */
async function runConsensusMode(task: string, options: any) {
  const ConversationManager = (await import('./src/core/ConversationManager')).default;
  const OutputHandler = (await import('./src/core/OutputHandler')).default;
  const ProviderFactory = (await import('./src/providers/ProviderFactory')).default;
  const ProjectContext = (await import('./src/utils/ProjectContext')).default;

  const config = ConfigCascade.resolve(options);

  // Use personas if specified
  if (options.with) {
    const personas = PersonaSystem.getPersonas(options.with);
    config.agents = PersonaSystem.personasToAgents(personas);
  }

  // Load project context if specified
  let context = null;
  if (options.project) {
    const projectContext = new ProjectContext(options.project);
    context = await projectContext.formatContext();
  }

  // Create judge
  const judge = {
    provider: ProviderFactory.createProvider(config.judge.model),
    systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge evaluating agent responses.'
  };

  // Run conversation
  const conversationManager = new ConversationManager(config, null, options.stream);
  const result = await conversationManager.startConversation(task, judge, context ? { formatContext: async () => context } : null);

  // Output results
  const filePaths = await OutputHandler.saveResults(result);
  OutputHandler.printSummary(result, filePaths);
  console.log(chalk.green('\n✓ Conversation complete!\n'));
}

/**
 * Run orchestrated mode (review command)
 */
async function runOrchestratedMode(task: string, options: any) {
  const Orchestrator = (await import('./src/orchestration/Orchestrator')).default;
  const config = ConfigCascade.resolve(options);

  // Use personas if specified
  if (options.with) {
    const personas = PersonaSystem.getPersonas(options.with);
    config.agents = PersonaSystem.personasToAgents(personas);
  }

  console.log(chalk.blue('Starting orchestrated review mode...\n'));

  // Initialize and run orchestrator
  const orchestrator = new Orchestrator(config);
  await orchestrator.executeTask(task, options.project || null);

  console.log(chalk.green('\n✓ Review complete!\n'));
}

/**
 * Run iterative mode (iterate command)
 */
async function runIterativeMode(task: string, options: any) {
  const IterativeCollaborativeOrchestrator = (await import('./src/orchestration/IterativeCollaborativeOrchestrator')).default;
  const config = ConfigCascade.resolve(options);

  // Use personas if specified
  if (options.with) {
    const personas = PersonaSystem.getPersonas(options.with);
    config.agents = PersonaSystem.personasToAgents(personas);
  }

  // Determine chunk size and rounds
  const chunkSize = options.chunkSize ||
    (options.project ? ModeDetector.suggestChunkSize(options.project) : 3);

  const maxRounds = ModeDetector.suggestRounds(task,
    options.quick ? 'quick' : options.deep ? 'deep' : options.thorough ? 'thorough' : undefined
  );

  console.log(chalk.blue(`Starting iterative mode (${chunkSize} items per chunk, ${maxRounds} rounds)...
`));

  // Convert agents config to Agent[] format
  const ProviderFactory = (await import('./src/providers/ProviderFactory')).default;
  const agents: any[] = Object.keys(config.agents).map((name: string) => {
    const agentConfig = config.agents[name];
    return {
      name,
      model: agentConfig.model,
      provider: ProviderFactory.createProvider(agentConfig.model),
      systemPrompt: agentConfig.prompt || agentConfig.systemPrompt || ''
    };
  });

  // Create judge
  const judge: any = {
    name: 'Judge',
    model: config.judge.model,
    provider: ProviderFactory.createProvider(config.judge.model),
    systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge coordinating the agents.'
  };

  // Initialize tool registry with artifact offloading
  const ToolRegistry = (await import('./src/tools/ToolRegistry')).default;
  const { ArtifactStore } = await import('./src/core/ArtifactStore');
  const artifactStore = new ArtifactStore(`iterate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  await artifactStore.init();
  const toolRegistry = new ToolRegistry(undefined, { artifactStore });

  try {
    // Initialize and run orchestrator
    const orchestrator = new IterativeCollaborativeOrchestrator(
      agents,
      judge,
      toolRegistry,
      { chunkSize, maxRoundsPerChunk: maxRounds, startChunk: options.startChunk || 1 }
    );

    await orchestrator.run(task, options.project || null);

    console.log(chalk.green('\n✓ Iterative collaboration complete!\n'));
  } finally {
    await artifactStore.cleanup();
  }
}

// Add subcommands
program.addCommand(createDiscussCommand());
program.addCommand(createReviewCommand());
program.addCommand(createIterateCommand());
program.addCommand(createConsultCommand());
program.addCommand(createConsultStatsCommand());
program.addCommand(createTemplateCommand());
program.addCommand(createInitCommand());
program.addCommand(createTemplatesCommand());
program.addCommand(createPersonasCommand());
program.addCommand(createSessionsCommand());
program.addCommand(createContinueCommand());
program.addCommand(createServerCommand());
program.addCommand(createConfigCommand());

// Parse arguments
program.parse(process.argv);