"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const EventBus_1 = require("../core/EventBus");
const ConfigLoader_1 = __importDefault(require("../core/ConfigLoader"));
const TemplateManager_1 = require("../core/TemplateManager");
const ProjectContext_1 = __importDefault(require("../utils/ProjectContext"));
const MemoryManager_1 = __importDefault(require("../memory/MemoryManager"));
const ProviderFactory_1 = __importDefault(require("../providers/ProviderFactory"));
const ConversationManager_1 = __importDefault(require("../core/ConversationManager"));
const Orchestrator_1 = __importDefault(require("../orchestration/Orchestrator"));
const IterativeCollaborativeOrchestrator_1 = __importDefault(require("../orchestration/IterativeCollaborativeOrchestrator"));
const ToolRegistry_1 = __importDefault(require("../tools/ToolRegistry"));
class SessionManager {
    constructor() {
        this.eventBus = EventBus_1.EventBus.getInstance();
    }
    async startTask(options) {
        try {
            this.eventBus.emitEvent('status', { message: 'Initializing session...' });
            // 1. Load Configuration
            let config;
            let mode = options.mode || 'consensus';
            let chunkSize = options.chunkSize || 3;
            if (options.template) {
                const templateManager = new TemplateManager_1.TemplateManager();
                const template = templateManager.getTemplate(options.template);
                if (!template)
                    throw new Error(`Template ${options.template} not found`);
                config = templateManager.convertToConfig(template);
                mode = options.mode || template.mode; // User override or template default
                chunkSize = options.chunkSize || template.chunkSize || 3;
            }
            else {
                config = ConfigLoader_1.default.load();
            }
            // 2. Load Project Memory (if ID provided)
            let memoryManager = null;
            const projectId = options.projectId || config.project_id;
            if (projectId) {
                memoryManager = new MemoryManager_1.default();
                await memoryManager.loadProject(projectId);
                this.eventBus.emitEvent('status', { message: `Loaded project memory: ${projectId}` });
            }
            // 3. Load Project Context (if path provided)
            let projectContext = null;
            if (options.projectPath) {
                projectContext = new ProjectContext_1.default(options.projectPath);
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
            }
            else if (mode === 'orchestrated') {
                await this.runOrchestrated(options.task, config, memoryManager, projectContext);
            }
            else {
                await this.runConsensus(options.task, config, memoryManager, projectContext);
            }
        }
        catch (error) {
            this.eventBus.emitEvent('error', { message: error.message });
            console.error('Session Error:', error);
        }
    }
    async runIterative(task, config, memoryManager, projectContext, chunkSize, maxRoundsPerChunk) {
        const agents = Object.entries(config.agents).map(([name, agentConfig]) => ({
            name,
            model: agentConfig.model,
            provider: ProviderFactory_1.default.createProvider(agentConfig.model),
            systemPrompt: agentConfig.prompt
        }));
        const judge = {
            name: 'Judge',
            model: config.judge.model,
            provider: ProviderFactory_1.default.createProvider(config.judge.model),
            systemPrompt: config.judge.prompt
        };
        const toolRegistry = new ToolRegistry_1.default();
        const orchestrator = new IterativeCollaborativeOrchestrator_1.default(agents, judge, toolRegistry, {
            chunkSize,
            maxRoundsPerChunk: maxRoundsPerChunk || 5,
            startChunk: 1,
            streamOutput: true,
            eventBus: this.eventBus
        });
        const contextString = projectContext ? projectContext.formatContext() : undefined;
        await orchestrator.run(task, contextString);
    }
    async runOrchestrated(task, config, memoryManager, projectContext) {
        const orchestrator = new Orchestrator_1.default(config, memoryManager, true, this.eventBus);
        await orchestrator.executeTask(task, projectContext);
    }
    async runConsensus(task, config, memoryManager, projectContext) {
        const judge = {
            provider: ProviderFactory_1.default.createProvider(config.judge.model),
            systemPrompt: config.judge.prompt,
            model: config.judge.model
        };
        const conversationManager = new ConversationManager_1.default(config, memoryManager, true, this.eventBus);
        await conversationManager.startConversation(task, judge, projectContext);
    }
}
exports.SessionManager = SessionManager;
