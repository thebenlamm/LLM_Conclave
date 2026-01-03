import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator';
import ConsultLogger from '../utils/ConsultLogger';
import { ConsultConsoleLogger } from '../cli/ConsultConsoleLogger';
import { ArtifactTransformer } from '../consult/artifacts/ArtifactTransformer';
import { ConsultationResult, OutputFormat } from '../types/consult';
import { FormatterFactory } from '../consult/formatting/FormatterFactory';
import { StrategyFactory, ModeType } from '../consult/strategies';
import { DebateValueFormatter } from '../consult/analysis/DebateValueFormatter';
import { ContextLoader, LoadedContext } from '../consult/context/ContextLoader';
import { SensitiveDataScrubber } from '../consult/security/SensitiveDataScrubber';

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
    .option('-m, --mode <mode>', 'Reasoning mode: explore (divergent) or converge (decisive)', 'converge')
    .option('--confidence-threshold <threshold>', 'Confidence threshold for early termination (0.0-1.0)', parseFloat, 0.90)
    .option('-q, --quick', 'Single round consultation (faster)', false)
    .option('-v, --verbose', 'Show full agent conversation', false)
    .option('--greenfield', 'Ignore brownfield detection and use greenfield mode', false)
    .option('--no-scrub', 'Disable sensitive data scrubbing (use with caution)', false)
    .action(async (questionArgs: string[], options: any) => {
      const question = questionArgs.join(' ');
      if (!question.trim()) {
        throw new Error('Question is required. Usage: llm-conclave consult "your question"');
      }

      // Validate mode option
      const mode = options.mode as string;
      if (!StrategyFactory.isValidMode(mode)) {
        const availableModes = StrategyFactory.getAvailableModes().join(', ');
        throw new Error(`Invalid mode: "${mode}". Available modes: ${availableModes}`);
      }
      const modeType = mode as ModeType;

      // Validate threshold
      const threshold = options.confidenceThreshold;
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        throw new Error('Error: --confidence-threshold must be between 0.0 and 1.0');
      }

      // Initialize real-time console logger
      const consoleLogger = new ConsultConsoleLogger();
      consoleLogger.start();

      try {
        // Load context using ContextLoader
        const contextLoader = new ContextLoader();
        let loadedContext: LoadedContext | null = null;
        
        let fileContext: LoadedContext | null = null;
        if (options.context) {
          const filePaths = options.context.split(',').map((f: string) => f.trim());
          fileContext = await contextLoader.loadFileContext(filePaths);
        }

        let projectContext: LoadedContext | null = null;
        if (options.project) {
          projectContext = await contextLoader.loadProjectContext(options.project);
        }

        if (fileContext || projectContext) {
          loadedContext = contextLoader.combineContexts(projectContext, fileContext);
          
          const proceed = await contextLoader.checkSizeWarning(loadedContext);
          if (!proceed) {
             throw new Error('Consultation cancelled by user');
          }
        }

        let contextString = loadedContext ? loadedContext.formattedContent : '';
        let scrubbingReport: any = undefined;

        // Apply sensitive data scrubbing (unless disabled)
        // options.scrub is true by default because of the way commander handles --no-scrub
        if (options.scrub !== false) {
          const scrubber = new SensitiveDataScrubber();
          const scrubResult = scrubber.scrub(contextString);
          contextString = scrubResult.content;
          scrubbingReport = scrubResult.report;

          // Display report to user if matches found
          const reportText = scrubber.formatReport(scrubResult.report);
          if (reportText) {
            console.log(reportText);
          }
        } else {
          console.log(chalk.red('⚠️ WARNING: Sensitive data scrubbing disabled.'));
          console.log(chalk.red('Ensure your context contains no secrets!'));
        }

        if (options.greenfield) {
          console.log(chalk.yellow('🔧 Ignoring existing patterns (--greenfield mode)'));
        }

        // Get strategy for the selected mode
        const strategy = StrategyFactory.create(modeType);

        // Display mode selection
        if (options.verbose) {
          console.log(chalk.cyan(`🎯 Mode: ${modeType} (${modeType === 'explore' ? 'divergent brainstorming' : 'decisive consensus'})`));
        }

        // Initialize orchestrator with strategy
        const orchestrator = new ConsultOrchestrator({
          maxRounds: options.quick ? 1 : 4,
          verbose: options.verbose,
          strategy,
          confidenceThreshold: threshold,
          projectPath: options.project,
          greenfield: options.greenfield,
          loadedContext: loadedContext ?? undefined
        });

        // Execute consultation
        // Orchestrator emits events which consoleLogger handles
        const result = await orchestrator.consult(question, contextString, {
          scrubbingReport
        });

        // Persist consultation for analytics (handles transformation to snake_case internally)
        const logger = new ConsultLogger();
        const logPaths = await logger.log(result);
        console.log(chalk.gray(`Logs saved to ${logPaths.jsonPath}`));

        // Format and display output
        const output = FormatterFactory.format(result, options.format as OutputFormat);
        console.log('\n' + output + '\n');

        if (result.debateValueAnalysis) {
          const debateFormatter = new DebateValueFormatter();
          console.log(debateFormatter.formatValueSummary(result.debateValueAnalysis) + '\n');
        }

      } catch (error: any) {
        if (error?.message === 'Consultation cancelled by user') {
          process.exit(0);
        }

        console.error(chalk.red(`
❌ Consultation failed: ${error.message}
`));
        if (options.verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });

  return cmd;
}