"use strict";
/**
 * MemoryManager - Manages project memory persistence and retrieval
 *
 * Handles:
 * - Loading/saving project memory to disk
 * - Creating new projects
 * - Updating memory during conversations
 * - Querying relevant memory for tasks
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const ProjectMemory_1 = __importDefault(require("./ProjectMemory"));
class MemoryManager {
    constructor(projectId = null) {
        this.projectId = projectId;
        this.projectMemory = null;
        this.memoryDir = path.join(process.cwd(), '.conclave', 'projects');
    }
    /**
     * Initialize memory directory structure
     */
    async ensureMemoryDirectory() {
        try {
            await fs.mkdir(this.memoryDir, { recursive: true });
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw new Error(`Failed to create memory directory: ${error.message}`);
            }
        }
    }
    /**
     * Get the file path for a project's memory
     */
    getProjectMemoryPath(projectId) {
        return path.join(this.memoryDir, `${projectId}.json`);
    }
    /**
     * Create a new project
     */
    async createProject(projectId, initialContext = {}) {
        await this.ensureMemoryDirectory();
        const memoryPath = this.getProjectMemoryPath(projectId);
        // Check if project already exists
        try {
            await fs.access(memoryPath);
            throw new Error(`Project "${projectId}" already exists`);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        // Create new project memory
        this.projectMemory = new ProjectMemory_1.default(projectId, initialContext.projectPath);
        // Set initial context if provided
        if (initialContext.overview || initialContext.goals || initialContext.constraints) {
            this.projectMemory.updateContext(initialContext);
        }
        // Save to disk
        await this.saveMemory();
        return this.projectMemory;
    }
    /**
     * Load an existing project
     */
    async loadProject(projectId) {
        await this.ensureMemoryDirectory();
        const memoryPath = this.getProjectMemoryPath(projectId);
        try {
            const data = await fs.readFile(memoryPath, 'utf8');
            const parsed = JSON.parse(data);
            this.projectMemory = ProjectMemory_1.default.fromJSON(parsed);
            this.projectId = projectId;
            return this.projectMemory;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Project "${projectId}" not found. Use --init to create it.`);
            }
            throw new Error(`Failed to load project memory: ${error.message}`);
        }
    }
    /**
     * Save current project memory to disk
     */
    async saveMemory() {
        if (!this.projectMemory) {
            throw new Error('No project memory to save');
        }
        await this.ensureMemoryDirectory();
        const memoryPath = this.getProjectMemoryPath(this.projectMemory.projectId);
        const data = JSON.stringify(this.projectMemory.toJSON(), null, 2);
        await fs.writeFile(memoryPath, data, 'utf8');
    }
    /**
     * List all projects
     */
    async listProjects() {
        await this.ensureMemoryDirectory();
        try {
            const files = await fs.readdir(this.memoryDir);
            const projects = files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
            return projects;
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Get project info without loading full memory
     */
    async getProjectInfo(projectId) {
        const memoryPath = this.getProjectMemoryPath(projectId);
        try {
            const data = await fs.readFile(memoryPath, 'utf8');
            const parsed = JSON.parse(data);
            return {
                projectId: parsed.projectId,
                created: parsed.created,
                lastModified: parsed.lastModified,
                totalDecisions: parsed.metadata.totalDecisions,
                totalConversations: parsed.metadata.totalConversations,
                overview: parsed.coreContext.overview
            };
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Update project context
     */
    async updateContext(contextUpdates) {
        if (!this.projectMemory) {
            throw new Error('No project loaded');
        }
        this.projectMemory.updateContext(contextUpdates);
        await this.saveMemory();
    }
    /**
     * Record a decision
     */
    async recordDecision(decision) {
        if (!this.projectMemory) {
            throw new Error('No project loaded');
        }
        const decisionId = this.projectMemory.addDecision(decision);
        await this.saveMemory();
        return decisionId;
    }
    /**
     * Update agent memory
     */
    async updateAgentMemory(agentRole, knowledge) {
        if (!this.projectMemory) {
            throw new Error('No project loaded');
        }
        this.projectMemory.updateAgentMemory(agentRole, knowledge);
        await this.saveMemory();
    }
    /**
     * Record a conversation
     */
    async recordConversation(conversationRef) {
        if (!this.projectMemory) {
            throw new Error('No project loaded');
        }
        const conversationId = this.projectMemory.addConversationReference(conversationRef);
        await this.saveMemory();
        return conversationId;
    }
    /**
     * Get relevant memory for a task
     * Returns formatted context string for LLM
     */
    getRelevantMemory(task, agentRole = null) {
        if (!this.projectMemory) {
            return '';
        }
        // Extract potential topic from task
        const relevantTopic = this._extractTopicFromTask(task);
        return this.projectMemory.formatContextForLLM({
            includeAgentMemory: true,
            agentRole: agentRole,
            relevantTopic: relevantTopic
        });
    }
    /**
     * Get decisions related to a topic
     */
    getDecisions(filter = {}) {
        if (!this.projectMemory) {
            return [];
        }
        return this.projectMemory.getDecisions(filter);
    }
    /**
     * Get related conversations
     */
    getRelatedConversations(topic, limit = 5) {
        if (!this.projectMemory) {
            return [];
        }
        return this.projectMemory.getRelatedConversations(topic, limit);
    }
    /**
     * Delete a project
     */
    async deleteProject(projectId) {
        const memoryPath = this.getProjectMemoryPath(projectId);
        try {
            await fs.unlink(memoryPath);
            return true;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Project "${projectId}" not found`);
            }
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    }
    /**
     * Export project memory
     */
    async exportProject(projectId, outputPath) {
        const memory = await this.loadProject(projectId);
        const data = JSON.stringify(memory.toJSON(), null, 2);
        await fs.writeFile(outputPath, data, 'utf8');
    }
    /**
     * Extract topic keywords from task
     * Simple implementation - can be enhanced with NLP
     */
    _extractTopicFromTask(task) {
        // Remove common words and extract key terms
        const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'we', 'need', 'want', 'should', 'can', 'will'];
        const words = task.toLowerCase().split(/\s+/);
        const keywords = words.filter(w => w.length > 3 && !commonWords.includes(w));
        // Return first significant keyword or empty string
        return keywords.length > 0 ? keywords[0] : '';
    }
}
exports.default = MemoryManager;
