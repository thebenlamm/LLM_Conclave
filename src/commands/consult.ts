import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator';
import ConsultLogger from '../utils/ConsultLogger';
import { ConsultConsoleLogger } from '../cli/ConsultConsoleLogger';
import { ArtifactTransformer } from '../consult/artifacts/ArtifactTransformer';
import { ConsultationResult, OutputFormat } from '../types/consult';
import { OutputFormatter } from '../consult/output/OutputFormatter';
import { StrategyFactory, ModeType } from '../consult/strategies';
import { DebateValueFormatter } from '../consult/analysis/DebateValueFormatter';
import { ContextLoader, LoadedContext } from '../consult/context/ContextLoader';
import { StdinHandler, StdinResult } from '../consult/context/StdinHandler';
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
    .option('-y, --yes', 'Automatically approve cost and early termination (non-interactive mode)', false)
    .option('-q, --quick', 'Single round consultation (faster)', false)
    .option('-v, --verbose', 'Show full agent conversation', false)
    .option('--greenfield', 'Ignore brownfield detection and use greenfield mode', false)
    .option('--gemini-cache', 'Enable Gemini explicit caching for large contexts (50K+ tokens)', false)
    .option('--no-scrub', 'Disable sensitive data scrubbing (use with caution)')
    .action(async (questionArgs: string[], options: any) => {
      const question = questionArgs.join(' ');
      if (!question.trim()) {
        throw new Error('Question is required. Usage: llm-conclave consult "your question"');
      }

      const formatOption = String(options.format || 'markdown').toLowerCase();
      const validFormats = new Set(Object.values(OutputFormat));
      if (!validFormats.has(formatOption as OutputFormat)) {
        throw new Error('Error: --format must be one of markdown, json, or both');
      }
      const outputFormat = formatOption as OutputFormat;
      const isMachineOutput = outputFormat !== OutputFormat.Markdown;
      const logInfo = (message: string) => {
        if (isMachineOutput) {
          console.error(message);
          return;
        }
        console.log(message);
      };

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
      if (!isMachineOutput) {
        consoleLogger.start();
      }

      try {
        // Handle Stdin (Story 5.3)
        const stdinHandler = new StdinHandler();
        let stdinResult: StdinResult | null = null;
        const hasStdin = stdinHandler.detectStdin();
        if (hasStdin) {
          logInfo(chalk.cyan('Reading from stdin...'));
          stdinResult = await stdinHandler.readStdin();
          if (stdinResult.hasStdin) {
             logInfo(chalk.green(`✓ Read ${stdinResult.tokenEstimate} tokens from stdin`));
          }
        }

        const isInteractive = !hasStdin && !options.yes;

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

        if (fileContext || projectContext || (stdinResult && stdinResult.hasStdin)) {
          loadedContext = contextLoader.combineContexts(projectContext, fileContext, stdinResult);
          
          // Only check size warning if interactive or explicit override handling needed?
          // checkSizeWarning uses inquirer. 
          // If !isInteractive, we might want to skip prompt or auto-accept if --yes?
          // But checkSizeWarning is inside ContextLoader and uses inquirer directly.
          // I should ideally update checkSizeWarning signature too, but for now let's assume it handles MCP env.
          // For piped stdin (not MCP), inquirer will fail.
          
          // I'll wrap checkSizeWarning logic
          let proceed = true;
          if (isInteractive) {
             proceed = await contextLoader.checkSizeWarning(loadedContext);
          } else {
             // Non-interactive: just warn, don't prompt. 
             // If too large, maybe fail? Or just proceed?
             // ContextLoader already logs warning.
             if (loadedContext.totalTokens > 10000) { // tokenThreshold from ContextLoader
                logInfo(chalk.yellow('⚠️ Large context in non-interactive mode. Proceeding...'));
             }
          }

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
            logInfo(reportText);
          }
        } else {
          logInfo(chalk.red('⚠️ WARNING: Sensitive data scrubbing disabled.'));
          logInfo(chalk.red('Ensure your context contains no secrets!'));
        }

        if (options.greenfield) {
          logInfo(chalk.yellow('🔧 Ignoring existing patterns (--greenfield mode)'));
        }

        // Get strategy for the selected mode
        const strategy = StrategyFactory.create(modeType);

        // Display mode selection
        if (options.verbose) {
          logInfo(chalk.cyan(`🎯 Mode: ${modeType} (${modeType === 'explore' ? 'divergent brainstorming' : 'decisive consensus'})`));
        }

        // Initialize orchestrator with strategy
        const orchestrator = new ConsultOrchestrator({
          maxRounds: options.quick ? 1 : 4,
          verbose: options.verbose,
          strategy,
          confidenceThreshold: threshold,
          projectPath: options.project,
          greenfield: options.greenfield,
          loadedContext: loadedContext ?? undefined,
          interactive: isInteractive,
          geminiCaching: options.geminiCache
        });

        // Execute consultation
        // Orchestrator emits events which consoleLogger handles
        const result = await orchestrator.consult(question, contextString, {
          scrubbingReport,
          allowCostOverruns: options.yes
        });

        // Persist consultation for analytics (handles transformation to snake_case internally)
        result.outputFormat = outputFormat;
        const logger = new ConsultLogger();
        const logPaths = await logger.log(result);
        logInfo(chalk.gray(`Logs saved to ${logPaths.jsonPath}`));

        // Format and display output
        const outputFormatter = new OutputFormatter();
        const output = outputFormatter.formatOutput(result, outputFormat);
        console.log('\n' + output.content + '\n');

        if (result.debateValueAnalysis) {
          const debateFormatter = new DebateValueFormatter();
          logInfo(debateFormatter.formatValueSummary(result.debateValueAnalysis) + '\n');
        }

      } catch (error: any) {
        if (error?.message === 'Consultation cancelled by user') {
          // User cancelled - exit gracefully without error
          return;
        }

        console.error(chalk.red(`
❌ Consultation failed: ${error.message}
`));
        if (options.verbose) {
          console.error(error.stack);
        }
        // Re-throw to let Commander.js handle the exit code
        throw error;
      }
    });

  return cmd;
}
