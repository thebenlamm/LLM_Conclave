import { EventBus } from '../core/EventBus';
import ConfigLoader from '../core/ConfigLoader';
import { TemplateManager } from '../core/TemplateManager';
import ProjectContext from '../utils/ProjectContext';
import MemoryManager from '../memory/MemoryManager';
import ProviderFactory from '../providers/ProviderFactory';
import ConversationManager from '../core/ConversationManager';
import Orchestrator from '../orchestration/Orchestrator';
import IterativeCollaborativeOrchestrator from '../orchestration/IterativeCollaborativeOrchestrator';
import ToolRegistry from '../tools/ToolRegistry';
import { Agent } from '../types';

export interface StartTaskOptions {
  task: string;
  template?: string;
  projectPath?: string;
  projectId?: string;
  mode?: 'consensus' | 'orchestrated' | 'iterative';
  chunkSize?: number;
  maxRoundsPerChunk?: number;
}

export class SessionManager {
  private eventBus: EventBus;

  constructor() {
    this.eventBus = EventBus.getInstance();
  }

  async startTask(options: StartTaskOptions) {
    try {
      this.eventBus.emitEvent('status', { message: 'Initializing session...' });

      // 1. Load Configuration
      let config: any;
      let mode = options.mode || 'consensus';
      let chunkSize = options.chunkSize || 3;

      if (options.template) {
        const templateManager = new TemplateManager();
        const template = templateManager.getTemplate(options.template);
        if (!template) throw new Error(`Template ${options.template} not found`);
        
        config = templateManager.convertToConfig(template);
        mode = options.mode || template.mode; // User override or template default
        chunkSize = options.chunkSize || template.chunkSize || 3;
      } else {
        config = ConfigLoader.load();
      }

      // 2. Load Project Memory (if ID provided)
      let memoryManager: MemoryManager | null = null;
      const projectId = options.projectId || config.project_id;
      
      if (projectId) {
        memoryManager = new MemoryManager();
        await memoryManager.loadProject(projectId);
        this.eventBus.emitEvent('status', { message: `Loaded project memory: ${projectId}` });
      }

      // 3. Load Project Context (if path provided)
      let projectContext: ProjectContext | null = null;
      if (options.projectPath) {
        projectContext = new ProjectContext(options.projectPath);
        const loadResult = await projectContext.load();
        if (!loadResult.success) {
           this.eventBus.emitEvent('error', { message: `Failed to load project context: ${loadResult.error}` });
           throw new Error(loadResult.error);
        }
        this.eventBus.emitEvent('status', { message: `Loaded project context from ${options.projectPath}` });
      }

      // 4. Initialize Agents & Orchestrator based on Mode
      this.eventBus.emitEvent('run:start', { task: options.task, mode });

      if (mode === 'iterative') {
        await this.runIterative(options.task, config, memoryManager, projectContext, chunkSize, options.maxRoundsPerChunk);
      } else if (mode === 'orchestrated') {
        await this.runOrchestrated(options.task, config, memoryManager, projectContext);
      } else {
        await this.runConsensus(options.task, config, memoryManager, projectContext);
      }

    } catch (error: any) {
      this.eventBus.emitEvent('error', { message: error.message });
      console.error('Session Error:', error);
    }
  }

  private async runIterative(task: string, config: any, memoryManager: any, projectContext: any, chunkSize: number, maxRoundsPerChunk?: number) {
      const agents: Agent[] = Object.entries(config.agents).map(([name, agentConfig]: [string, any]) => ({
        name,
        model: agentConfig.model,
        provider: ProviderFactory.createProvider(agentConfig.model),
        systemPrompt: agentConfig.prompt
      }));

      const judge: Agent = {
        name: 'Judge',
        model: config.judge.model,
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt
      };

      const toolRegistry = new ToolRegistry();

      const orchestrator = new IterativeCollaborativeOrchestrator(
        agents,
        judge,
        toolRegistry,
        {
          chunkSize,
          maxRoundsPerChunk: maxRoundsPerChunk || 5,
          startChunk: 1,
          streamOutput: true,
          eventBus: this.eventBus
        }
      );

      const contextString = projectContext ? projectContext.formatContext() : undefined;
      await orchestrator.run(task, contextString);
  }

  private async runOrchestrated(task: string, config: any, memoryManager: any, projectContext: any) {
      const orchestrator = new Orchestrator(config, memoryManager, true, this.eventBus);
      await orchestrator.executeTask(task, projectContext);
  }

  private async runConsensus(task: string, config: any, memoryManager: any, projectContext: any) {
      const judge = {
        provider: ProviderFactory.createProvider(config.judge.model),
        systemPrompt: config.judge.prompt,
        model: config.judge.model
      };

      const conversationManager = new ConversationManager(config, memoryManager, true, this.eventBus);
      await conversationManager.startConversation(task, judge, projectContext);
  }
}
