/**
 * MemoryManager - Manages project memory persistence and retrieval
 *
 * Handles:
 * - Loading/saving project memory to disk
 * - Creating new projects
 * - Updating memory during conversations
 * - Querying relevant memory for tasks
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import ProjectMemory from './ProjectMemory';

export default class MemoryManager {
  projectId: string | null;
  projectMemory: ProjectMemory | null;
  memoryDir: string;

  constructor(projectId: string | null = null) {
    this.projectId = projectId;
    this.projectMemory = null;
    this.memoryDir = path.join(process.cwd(), '.conclave', 'projects');
  }

  /**
   * Initialize memory directory structure
   */
  async ensureMemoryDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create memory directory: ${error.message}`);
      }
    }
  }

  /**
   * Get the file path for a project's memory
   */
  getProjectMemoryPath(projectId: string): string {
    return path.join(this.memoryDir, `${projectId}.json`);
  }

  /**
   * Create a new project
   */
  async createProject(projectId: string, initialContext: any = {}): Promise<ProjectMemory> {
    await this.ensureMemoryDirectory();

    const memoryPath = this.getProjectMemoryPath(projectId);

    // Check if project already exists
    try {
      await fs.access(memoryPath);
      throw new Error(`Project "${projectId}" already exists`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create new project memory
    this.projectMemory = new ProjectMemory(projectId, initialContext.projectPath);

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
  async loadProject(projectId: string): Promise<ProjectMemory> {
    await this.ensureMemoryDirectory();

    const memoryPath = this.getProjectMemoryPath(projectId);

    try {
      const data = await fs.readFile(memoryPath, 'utf8');
      const parsed = JSON.parse(data);
      this.projectMemory = ProjectMemory.fromJSON(parsed);
      this.projectId = projectId;
      return this.projectMemory;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Project "${projectId}" not found. Use --init to create it.`);
      }
      throw new Error(`Failed to load project memory: ${error.message}`);
    }
  }

  /**
   * Save current project memory to disk
   */
  async saveMemory(): Promise<void> {
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
  async listProjects(): Promise<string[]> {
    await this.ensureMemoryDirectory();

    try {
      const files = await fs.readdir(this.memoryDir);
      const projects = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

      return projects;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get project info without loading full memory
   */
  async getProjectInfo(projectId: string): Promise<any> {
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
    } catch (error) {
      return null;
    }
  }

  /**
   * Update project context
   */
  async updateContext(contextUpdates: any): Promise<void> {
    if (!this.projectMemory) {
      throw new Error('No project loaded');
    }

    this.projectMemory.updateContext(contextUpdates);
    await this.saveMemory();
  }

  /**
   * Record a decision
   */
  async recordDecision(decision: any): Promise<string> {
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
  async updateAgentMemory(agentRole: string, knowledge: any): Promise<void> {
    if (!this.projectMemory) {
      throw new Error('No project loaded');
    }

    this.projectMemory.updateAgentMemory(agentRole, knowledge);
    await this.saveMemory();
  }

  /**
   * Record a conversation
   */
  async recordConversation(conversationRef: any): Promise<string> {
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
  getRelevantMemory(task: string, agentRole: string | null = null): string {
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
  getDecisions(filter: any = {}): any[] {
    if (!this.projectMemory) {
      return [];
    }

    return this.projectMemory.getDecisions(filter);
  }

  /**
   * Get related conversations
   */
  getRelatedConversations(topic: string, limit: number = 5): any[] {
    if (!this.projectMemory) {
      return [];
    }

    return this.projectMemory.getRelatedConversations(topic, limit);
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<boolean> {
    const memoryPath = this.getProjectMemoryPath(projectId);

    try {
      await fs.unlink(memoryPath);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Project "${projectId}" not found`);
      }
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  /**
   * Export project memory
   */
  async exportProject(projectId: string, outputPath: string): Promise<void> {
    const memory = await this.loadProject(projectId);
    const data = JSON.stringify(memory.toJSON(), null, 2);
    await fs.writeFile(outputPath, data, 'utf8');
  }

  /**
   * Extract topic keywords from task
   * Simple implementation - can be enhanced with NLP
   */
  _extractTopicFromTask(task: string): string {
    // Remove common words and extract key terms
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'we', 'need', 'want', 'should', 'can', 'will'];
    const words = task.toLowerCase().split(/\s+/);
    const keywords = words.filter(w => w.length > 3 && !commonWords.includes(w));

    // Return first significant keyword or empty string
    return keywords.length > 0 ? keywords[0] : '';
  }
}
