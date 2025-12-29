import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator';
import ProjectContext from '../utils/ProjectContext';
import ConsultLogger from '../utils/ConsultLogger';
import { ConsultConsoleLogger } from '../cli/ConsultConsoleLogger';
import { ArtifactTransformer } from '../consult/artifacts/ArtifactTransformer';
import { ConsultationResult, OutputFormat } from '../types/consult';
import { FormatterFactory } from '../consult/formatting/FormatterFactory';

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
      if (!question.trim()) {
        throw new Error('Question is required. Usage: llm-conclave consult "your question"');
      }

      // Initialize real-time console logger
      const consoleLogger = new ConsultConsoleLogger();
      consoleLogger.start();

      try {
        // Load context
        const context = await loadContext(options);

        // Initialize orchestrator
        const orchestrator = new ConsultOrchestrator({
          maxRounds: options.quick ? 1 : 4,
          verbose: options.verbose
        });

        // Execute consultation
        // Orchestrator emits events which consoleLogger handles
        const result = await orchestrator.consult(question, context);

        // Persist consultation for analytics (handles transformation to snake_case internally)
        const logger = new ConsultLogger();
        const logPaths = await logger.log(result);
        console.log(chalk.gray(`Logs saved to ${logPaths.jsonPath}`));

        // Format and display output
        const output = FormatterFactory.format(result, options.format as OutputFormat);
        console.log('\n' + output + '\n');

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
