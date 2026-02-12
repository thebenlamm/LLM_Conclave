import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigCascade } from '../cli/ConfigCascade';
import { PersonaSystem } from '../cli/PersonaSystem';
import { ModeDetector } from '../cli/ModeDetector';
import IterativeCollaborativeOrchestrator from '../orchestration/IterativeCollaborativeOrchestrator';
import ToolRegistry from '../tools/ToolRegistry';
import ProviderFactory from '../providers/ProviderFactory';
import { Agent } from '../types';

/**
 * Iterate command - Iterative collaborative mode
 * Chunk-based multi-turn discussions
 */
export function createIterateCommand(): Command {
  const cmd = new Command('iterate');

  cmd
    .description('Iterative collaborative mode (chunk-based)')
    .argument('<task...>', 'Task to iterate on')
    .option('-p, --project <path>', 'Project context (file or directory)')
    .option('-c, --config <path>', 'Custom config file')
    .option('--with <personas>', 'Comma-separated list of personas (e.g., security,performance)')
    .option('--chunk-size <n>', 'Items per chunk (auto-detected if omitted)')
    .option('--rounds <n>', 'Rounds per chunk (auto-detected if omitted)')
    .option('--start-chunk <n>', 'Resume from chunk number', '1')
    .option('--quick', 'Quick mode (2 rounds per chunk)')
    .option('--deep', 'Deep mode (7 rounds per chunk)')
    .option('--thorough', 'Thorough mode (10 rounds per chunk)')
    .option('--stream', 'Stream agent responses', true)
    .option('--no-stream', 'Disable streaming')
    .action(async (taskArgs: string[], options: any) => {
      const task = taskArgs.join(' ');

      console.log(chalk.blue('\n🔄 Starting iterative collaboration...\n'));

      // Resolve configuration
      const config = ConfigCascade.resolve(options);

      // Use personas if specified
      if (options.with) {
        console.log(chalk.cyan(`Using personas: ${options.with}\n`));
        const personas = PersonaSystem.getPersonas(options.with);
        config.agents = PersonaSystem.personasToAgents(personas);
      }

      // Determine chunk size (auto-detect if not specified)
      const chunkSize = options.chunkSize ?
        parseInt(options.chunkSize) :
        (options.project ? ModeDetector.suggestChunkSize(options.project) : 3);

      // Determine rounds per chunk
      const maxRounds = options.rounds ?
        parseInt(options.rounds) :
        ModeDetector.suggestRounds(task,
          options.quick ? 'quick' :
          options.deep ? 'deep' :
          options.thorough ? 'thorough' :
          undefined
        );

      console.log(chalk.blue(`Agents: ${Object.keys(config.agents).join(', ')}\n`));
      console.log(chalk.cyan(`Chunk size: ${chunkSize}`));
      console.log(chalk.cyan(`Rounds per chunk: ${maxRounds}\n`));

      // Convert agents config to Agent[] format
      const agents: Agent[] = Object.keys(config.agents).map((name: string) => {
        const agentConfig = config.agents[name];
        return {
          name,
          model: agentConfig.model,
          provider: ProviderFactory.createProvider(agentConfig.model),
          systemPrompt: agentConfig.prompt || agentConfig.systemPrompt || ''
        };
      });

      // Create judge
      const judge: Agent = {
        name: 'Judge',
        model: config.judge.model,
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt || config.judge.systemPrompt || 'You are a judge coordinating the agents.'
      };

      // Initialize tool registry
      const toolRegistry = new ToolRegistry();

      // Initialize and run orchestrator
      const orchestrator = new IterativeCollaborativeOrchestrator(
        agents,
        judge,
        toolRegistry,
        {
          chunkSize,
          maxRoundsPerChunk: maxRounds,
          startChunk: parseInt(options.startChunk)
        }
      );

      await orchestrator.run(task, options.project || null);

      console.log(chalk.green('\n✓ Iterative collaboration complete!\n'));
    });

  return cmd;
}
