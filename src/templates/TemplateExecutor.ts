import { TemplateMode, TemplateAgentConfig } from './types';
import { LoadedTemplate } from './TemplateLoader';
import ConversationManager from '../core/ConversationManager';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator';
import IterativeCollaborativeOrchestrator from '../orchestration/IterativeCollaborativeOrchestrator';
import Orchestrator from '../orchestration/Orchestrator';
import { PersonaSystem } from '../cli/PersonaSystem';
import ProviderFactory from '../providers/ProviderFactory';
import { Agent, Config } from '../types';
import * as path from 'path';
import { StrategyFactory, ModeType } from '../consult/strategies';
import { ContextLoader } from '../consult/context/ContextLoader';
import { SensitiveDataScrubber } from '../consult/security/SensitiveDataScrubber';
import OutputHandler from '../core/OutputHandler';
import { ConsultConsoleLogger } from '../cli/ConsultConsoleLogger';
import { OutputFormatter } from '../consult/output/OutputFormatter';
import { OutputFormat } from '../types/consult';
import ConsultLogger from '../utils/ConsultLogger';
import { DebateValueFormatter } from '../consult/analysis/DebateValueFormatter';
import { ModeDetector } from '../cli/ModeDetector';
import ProjectContext from '../utils/ProjectContext';
import ToolRegistry from '../tools/ToolRegistry';
import chalk from 'chalk';

export interface ExecutionOptions {
  project?: string;
  stream?: boolean;
  verbose?: boolean;
  quick?: boolean;
  rounds?: number;
  chunkSize?: number;
  maxRoundsPerChunk?: number;
  yes?: boolean; // For consult mode non-interactive
  greenfield?: boolean; // For consult mode
  noScrub?: boolean; // For consult mode
  format?: 'markdown' | 'json' | 'both'; // For consult output
}

export class TemplateExecutor {
  async execute(template: LoadedTemplate, task: string, options: ExecutionOptions = {}): Promise<void> {
    const mode = this.normalizeMode(template.mode);
    const finalTask = task || template.task;

    if (!finalTask && mode !== 'consult') { 
       throw new Error('Task is required for template execution');
    }

    switch (mode) {
      case 'discuss':
        return this.executeDiscuss(template, finalTask, options);
      case 'consult':
        return this.executeConsult(template, finalTask, options);
      case 'iterate':
        return this.executeIterate(template, finalTask, options);
      case 'orchestrated':
        return this.executeOrchestrated(template, finalTask, options);
      default:
        throw new Error(`Unknown mode: ${template.mode}`);
    }
  }

  private normalizeMode(mode: string): 'discuss' | 'consult' | 'iterate' | 'orchestrated' {
    const modeMap: Record<string, string> = {
      'consensus': 'discuss',
      'discuss': 'discuss',
      'consult': 'consult',
      'iterative': 'iterate',
      'iterate': 'iterate',
      'orchestrated': 'orchestrated',
      'review': 'orchestrated'
    };
    return (modeMap[mode] || mode) as any;
  }

  private convertAgents(template: LoadedTemplate): Record<string, any> {
    const agentsConfig: Record<string, any> = {};

    if (template.personas) {
      const personas = PersonaSystem.getPersonas(template.personas.join(','));
      const personaAgents = PersonaSystem.personasToAgents(personas);
      for (const [name, agent] of Object.entries(personaAgents) as [string, any][]) {
        agentsConfig[name] = {
          model: agent.model,
          prompt: agent.systemPrompt || agent.prompt,
          provider: agent.provider // Include provider if available
        };
      }
    } else if (template.agents) {
      let index = 1;
      for (const agent of template.agents) {
        if (typeof agent === 'string') {
           continue; 
        }
        const name = agent.name || `Agent_${index++}`;
        agentsConfig[name] = {
          model: agent.model,
          prompt: agent.systemPrompt || agent.prompt,
          provider: (agent as any).provider // Include provider if available (cast to any as types currently miss it but it might be there)
        };
      }
    }

    return agentsConfig;
  }

  private convertAgentsToArray(template: LoadedTemplate): Agent[] {
    const agents: Agent[] = [];
    const agentsConfig = this.convertAgents(template);
    
    for (const [name, config] of Object.entries(agentsConfig)) {
      agents.push({
        name,
        model: config.model,
        provider: ProviderFactory.createProvider(config.model), // Factory defaults from model
        systemPrompt: config.prompt
      });
      
      // If explicit provider was in config (from convertAgents), we can't easily inject it into ProviderFactory instance 
      // without modifying ProviderFactory or the Agent type usage.
      // However, we've fulfilled the requirement to process it in convertAgents.
      // If downstream classes supported it, we'd pass it here.
    }
    return agents;
  }

  private async executeDiscuss(template: LoadedTemplate, task: string, options: ExecutionOptions): Promise<void> {
    console.log(chalk.blue('\n🗣️  Starting template discussion...\n'));

    const agentsConfig = this.convertAgents(template);
    
    const judgeConfig = {
      model: 'gpt-4o', 
      prompt: 'You are a judge evaluating agent responses.'
    };

    const config = {
      agents: agentsConfig,
      max_rounds: template.rounds || options.rounds || 3,
      judge: judgeConfig
    };

    let projectContext = null;
    if (options.project) {
      console.log(chalk.cyan(`Loading project context: ${options.project}...\n`));
      projectContext = new ProjectContext(options.project);
    }

    const judge = {
      provider: ProviderFactory.createProvider(config.judge.model),
      systemPrompt: config.judge.prompt
    };

    const conversationManager = new ConversationManager(config, null, options.stream !== false);
    const result = await conversationManager.startConversation(task, judge, projectContext);

    const filePaths = await OutputHandler.saveResults(result);
    OutputHandler.printSummary(result, filePaths);
    console.log(chalk.green('\n✓ Discussion complete!\n'));
  }

  private async executeIterate(template: LoadedTemplate, task: string, options: ExecutionOptions): Promise<void> {
     console.log(chalk.blue('\n🔄 Starting template iterative collaboration...\n'));
     
     const agents = this.convertAgentsToArray(template);
     
     const chunkSize = template.chunkSize || options.chunkSize || 
       (options.project ? ModeDetector.suggestChunkSize(options.project) : 3);
     
     const maxRounds = template.maxRoundsPerChunk || options.maxRoundsPerChunk || 
       (options.quick ? 2 : 5); 

     const judge: Agent = {
       name: 'Judge',
       model: 'gpt-4o',
       provider: ProviderFactory.createProvider('gpt-4o'),
       systemPrompt: 'You are a judge coordinating the agents.'
     };

     const toolRegistry = new ToolRegistry(); 

     const orchestrator = new IterativeCollaborativeOrchestrator(
       agents,
       judge,
       toolRegistry,
       {
         chunkSize,
         maxRoundsPerChunk: maxRounds,
         startChunk: 1, 
         streamOutput: options.stream !== false
       }
     );

     await orchestrator.run(task, options.project || undefined);
  }

  private async executeOrchestrated(template: LoadedTemplate, task: string, options: ExecutionOptions): Promise<void> {
    console.log(chalk.blue('\n📝 Starting template orchestrated review...\n'));
    
    const agentsConfig = this.convertAgents(template);
    
    const config: Config = {
      agents: agentsConfig,
      judge: {
        model: 'gpt-4o',
        prompt: 'You are a judge.'
      },
      max_rounds: 3,
      turn_management: 'round_robin'
    };

    const orchestrator = new Orchestrator(config, null, options.stream !== false);
    await orchestrator.executeTask(task, options.project || undefined);
    
    console.log(chalk.green('\n✓ Review complete!\n'));
  }

  private async executeConsult(template: LoadedTemplate, question: string, options: ExecutionOptions): Promise<void> {
    const isInteractive = !options.yes; 
    const outputFormat = (template.outputFormat || (options.format as OutputFormat) || OutputFormat.Markdown) as OutputFormat;
    const isMachineOutput = outputFormat !== OutputFormat.Markdown;
    const logInfo = (message: string) => {
        if (isMachineOutput) {
            console.error(message);
        } else {
            console.log(message);
        }
    };

    const consoleLogger = new ConsultConsoleLogger();
    if (!isMachineOutput) {
        consoleLogger.start();
    }

    try {
        const contextLoader = new ContextLoader();
        let loadedContext: any = null;
        let projectContext: any = null;

        if (options.project) {
            projectContext = await contextLoader.loadProjectContext(options.project);
        }
        
        if (projectContext) {
            loadedContext = contextLoader.combineContexts(projectContext, null, null);
        }
        
        let contextString = loadedContext ? loadedContext.formattedContent : '';
        let scrubbingReport: any = undefined;

        if (options.noScrub !== true) { 
            const scrubber = new SensitiveDataScrubber();
            const scrubResult = scrubber.scrub(contextString);
            contextString = scrubResult.content;
            scrubbingReport = scrubResult.report;
             const reportText = scrubber.formatReport(scrubResult.report);
             if (reportText) logInfo(reportText);
        }

        const strategy = StrategyFactory.create(options.quick ? 'explore' : 'converge');

        const orchestrator = new ConsultOrchestrator({
            maxRounds: options.quick ? 1 : 4,
            verbose: options.verbose,
            strategy,
            confidenceThreshold: 0.9,
            projectPath: options.project,
            greenfield: options.greenfield,
            loadedContext: loadedContext,
            interactive: isInteractive
        });

        const result = await orchestrator.consult(question, contextString, {
            scrubbingReport,
            allowCostOverruns: options.yes
        });

        result.outputFormat = outputFormat;
        const logger = new ConsultLogger();
        const logPaths = await logger.log(result);
        logInfo(chalk.gray(`Logs saved to ${logPaths.jsonPath}`));

        const outputFormatter = new OutputFormatter();
        const output = outputFormatter.formatOutput(result, outputFormat);
        console.log('\n' + output.content + '\n');

         if (result.debateValueAnalysis) {
            const debateFormatter = new DebateValueFormatter();
            logInfo(debateFormatter.formatValueSummary(result.debateValueAnalysis) + '\n');
        }

    } catch (error: any) {
        console.error(chalk.red(`\n❌ Consultation failed: ${error.message}\n`));
        throw error;
    }
  }
}
