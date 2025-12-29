import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator';
import ProjectContext from '../utils/ProjectContext';
import ConsultLogger from '../utils/ConsultLogger';
import { ConsultConsoleLogger } from '../cli/ConsultConsoleLogger';
import { ArtifactTransformer } from '../consult/artifacts/ArtifactTransformer';
import { ConsultationResult } from '../types';

/**
 * Consult command - Fast multi-model consultation
 * Get quick consensus from Security Expert, Architect, and Pragmatist
 */
export function createConsultCommand(): Command {
  const cmd = new Command('consult');

  cmd
    .description('Fast multi-model consultation for decision-making')
    .argument('<question...>', 'Question to consult on')
    .option('-c, --context <files>', 'Comma-separated file paths for context')
    .option('-p, --project <path>', 'Project root for auto-context analysis')
    .option('-f, --format <type>', 'Output format: markdown, json, or both', 'markdown')
    .option('-q, --quick', 'Single round consultation (faster)', false)
    .option('-v, --verbose', 'Show full agent conversation', false)
    .action(async (questionArgs: string[], options: any) => {
      const question = questionArgs.join(' ');

      // Initialize real-time console logger
      const consoleLogger = new ConsultConsoleLogger();
      consoleLogger.start();

      try {
        // Load context
        const context = await loadContext(options);

        // Initialize orchestrator
        const orchestrator = new ConsultOrchestrator({
          maxRounds: options.quick ? 1 : 2,
          verbose: options.verbose
        });

        // Execute consultation
        // Orchestrator emits events which consoleLogger handles
        const result = await orchestrator.consult(question, context);

        // Transform result for persistence (camelCase -> snake_case)
        const jsonResult = ArtifactTransformer.consultationResultToJSON(result);

        // Persist consultation for analytics
        const logger = new ConsultLogger();
        const logPaths = await logger.log(jsonResult);
        console.log(chalk.gray(`Logs saved to ${logPaths.jsonPath}`));

        // Format and display output
        displayOutput(jsonResult, options.format);

      } catch (error: any) {
        console.error(chalk.red(`\n❌ Consultation failed: ${error.message}\n`));
        if (options.verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Load context from various sources
 */
async function loadContext(options: any): Promise<string> {
  let context = '';

  // Explicit file context
  if (options.context) {
    const files = options.context.split(',').map((f: string) => f.trim());

    for (const file of files) {
      if (!fs.existsSync(file)) {
        throw new Error(`Context file not found: ${file}`);
      }

      const content = fs.readFileSync(file, 'utf-8');
      const fileName = path.basename(file);
      context += `\n\n### File: ${fileName}\n\n${content}`;
    }
  }

  // Project context
  if (options.project) {
    if (!fs.existsSync(options.project)) {
      throw new Error(`Project directory not found: ${options.project}`);
    }

    const projectContext = new ProjectContext(options.project);
    await projectContext.load();
    const formattedContext = projectContext.formatContext();
    context += `\n\n### Project Context\n\n${formattedContext}`;
  }

  return context;
}

/**
 * Display output in requested format
 */
function displayOutput(result: ConsultationResult, format: string): void {
  if (format === 'json' || format === 'both') {
    console.log('\n' + chalk.bold('JSON Output:') + '\n');
    console.log(JSON.stringify(result, null, 2));
  }

  if (format === 'markdown' || format === 'both') {
    if (format === 'both') {
      console.log('\n' + '='.repeat(80) + '\n');
    }
    console.log(formatMarkdown(result));
  }
}

/**
 * Format consultation result as Markdown
 */
function formatMarkdown(result: ConsultationResult): string {
  const output: string[] = [];

  // Header
  output.push(chalk.bold.blue('# Consultation Summary'));
  output.push('');
  output.push(chalk.gray(`**Question:** ${result.question}`));
  output.push(chalk.gray(`**Date:** ${new Date(result.timestamp).toLocaleString()}`));
  output.push(chalk.gray(`**Confidence:** ${(result.confidence * 100).toFixed(0)}%`));
  output.push('');

  // Consensus
  output.push(chalk.bold.green('## Consensus'));
  output.push('');
  output.push(chalk.white(result.consensus));
  output.push('');

  // Recommendation
  output.push(chalk.bold.yellow('## Recommendation'));
  output.push('');
  output.push(chalk.white(result.recommendation));
  output.push('');

  // Agent Perspectives
  output.push(chalk.bold.cyan('## Agent Perspectives'));
  output.push('');

  for (const perspective of result.perspectives) {
    output.push(chalk.bold(`### ${perspective.agent} (${perspective.model})`));
    output.push('');
    output.push(chalk.white(perspective.opinion));
    output.push('');
  }

  // Concerns
  if (result.concerns.length > 0) {
    output.push(chalk.bold.red('## Concerns Raised'));
    output.push('');
    for (const concern of result.concerns) {
      output.push(chalk.white(`- ${concern}`));
    }
    output.push('');
  }

  // Dissent
  if (result.dissent.length > 0) {
    output.push(chalk.bold.magenta('## Dissenting Views'));
    output.push('');
    for (const dissent of result.dissent) {
      output.push(chalk.white(`- ${dissent}`));
    }
    output.push('');
  }

  // Footer
  output.push('---');
  output.push('');
  output.push(chalk.gray(
    `**Cost:** $${result.cost.usd.toFixed(4)} | ` +
    `**Duration:** ${(result.duration_ms / 1000).toFixed(1)}s | ` +
    `**Tokens:** ${result.cost.tokens.total.toLocaleString()}`
  ));

  return output.join('\n');
}
