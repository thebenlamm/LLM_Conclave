/**
 * ProjectMemory - Data model for project memory structure
 *
 * Stores:
 * - Core project context (overview, goals, constraints)
 * - Decision history with consensus tracking
 * - Agent-specific knowledge domains
 * - Conversation references
 */

/**
 * ProjectMemory - Data model for project memory structure
 *
 * Stores:
 * - Core project context (overview, goals, constraints)
 * - Decision history with consensus tracking
 * - Agent-specific knowledge domains
 * - Conversation references
 */

export default class ProjectMemory {
  projectId: string;
  projectPath: string | null;
  created: string;
  lastModified: string;
  coreContext: {
    overview: string;
    goals: string[];
    constraints: string[];
    targetAudience: string;
    customFields: Record<string, any>;
  };
  decisions: any[];
  agentMemory: Record<string, any>;
  conversationReferences: any[];
  metadata: {
    totalConversations: number;
    totalDecisions: number;
    agentParticipation: Record<string, number>;
  };

  constructor(projectId: string, projectPath: string | null = null) {
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.created = new Date().toISOString();
    this.lastModified = new Date().toISOString();

    this.coreContext = {
      overview: '',
      goals: [],
      constraints: [],
      targetAudience: '',
      customFields: {}
    };

    this.decisions = [];
    this.agentMemory = {};
    this.conversationReferences = [];
    this.metadata = {
      totalConversations: 0,
      totalDecisions: 0,
      agentParticipation: {}
    };
  }

  /**
   * Add a decision to the project memory
   */
  addDecision(decision: any): string {
    const decisionRecord = {
      id: this._generateId('decision'),
      timestamp: new Date().toISOString(),
      topic: decision.topic,
      description: decision.description || '',
      participants: decision.participants || [],
      validators: decision.validators || [],
      consensusReached: decision.consensusReached || false,
      outcome: decision.outcome || '',
      conversationId: decision.conversationId || null,
      tags: decision.tags || []
    };

    this.decisions.push(decisionRecord);
    this.metadata.totalDecisions++;
    this.lastModified = new Date().toISOString();

    return decisionRecord.id;
  }

  /**
   * Update agent-specific memory
   */
  updateAgentMemory(agentRole: string, knowledge: any) {
    if (!this.agentMemory[agentRole]) {
      this.agentMemory[agentRole] = {
        pastDecisions: [],
        domainKnowledge: {},
        preferences: {},
        constraints: []
      };
    }

    // Merge new knowledge with existing
    Object.assign(this.agentMemory[agentRole], knowledge);
    this.lastModified = new Date().toISOString();
  }

  /**
   * Add a conversation reference
   */
  addConversationReference(conversationRef: any): string {
    const reference = {
      id: this._generateId('conversation'),
      timestamp: new Date().toISOString(),
      task: conversationRef.task,
      outputPath: conversationRef.outputPath,
      agents: conversationRef.agents || [],
      consensusReached: conversationRef.consensusReached || false,
      rounds: conversationRef.rounds || 0,
      tags: conversationRef.tags || []
    };

    this.conversationReferences.push(reference);
    this.metadata.totalConversations++;

    // Track agent participation
    (conversationRef.agents || []).forEach((agent: string) => {
      this.metadata.agentParticipation[agent] =
        (this.metadata.agentParticipation[agent] || 0) + 1;
    });

    this.lastModified = new Date().toISOString();
    return reference.id;
  }

  /**
   * Update core project context
   */
  updateContext(contextUpdates: any) {
    Object.assign(this.coreContext, contextUpdates);
    this.lastModified = new Date().toISOString();
  }

  /**
   * Get decisions by topic or tags
   */
  getDecisions(filter: any = {}): any[] {
    let results = this.decisions;

    if (filter.topic) {
      results = results.filter(d =>
        d.topic.toLowerCase().includes(filter.topic.toLowerCase())
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(d =>
        filter.tags.some((tag: string) => d.tags.includes(tag))
      );
    }

    if (filter.participant) {
      results = results.filter(d =>
        d.participants.includes(filter.participant)
      );
    }

    return results;
  }

  /**
   * Get conversations related to a topic
   */
  getRelatedConversations(topic: string, limit: number = 5): any[] {
    return this.conversationReferences
      .filter(conv =>
        conv.task.toLowerCase().includes(topic.toLowerCase()) ||
        conv.tags.some((tag: string) => tag.toLowerCase().includes(topic.toLowerCase()))
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Format memory context for LLM consumption
   */
  formatContextForLLM(options: any = {}): string {
    const { includeAgentMemory = true, agentRole = null, relevantTopic = null } = options;

    let output = '## Project Memory\n\n';

    // Core context
    if (this.coreContext.overview) {
      output += `**Project Overview:** ${this.coreContext.overview}\n\n`;
    }

    if (this.coreContext.goals.length > 0) {
      output += `**Goals:**\n${this.coreContext.goals.map(g => `- ${g}`).join('\n')}\n\n`;
    }

    if (this.coreContext.constraints.length > 0) {
      output += `**Constraints:**\n${this.coreContext.constraints.map(c => `- ${c}`).join('\n')}\n\n`;
    }

    // Recent decisions
    const recentDecisions = relevantTopic
      ? this.getDecisions({ topic: relevantTopic }).slice(-3)
      : this.decisions.slice(-5);

    if (recentDecisions.length > 0) {
      output += `**Previous Decisions:**\n`;
      recentDecisions.forEach(d => {
        output += `- **${d.topic}** (${new Date(d.timestamp).toLocaleDateString()}): ${d.outcome}\n`;
      });
      output += '\n';
    }

    // Agent-specific memory
    if (includeAgentMemory && agentRole && this.agentMemory[agentRole]) {
      const agentData = this.agentMemory[agentRole];
      output += `**Your Past Contributions (${agentRole}):**\n`;

      if (agentData.domainKnowledge && Object.keys(agentData.domainKnowledge).length > 0) {
        output += `Domain Knowledge:\n`;
        Object.entries(agentData.domainKnowledge).forEach(([key, value]) => {
          output += `- ${key}: ${value}\n`;
        });
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Export to JSON
   */
  toJSON(): any {
    return {
      projectId: this.projectId,
      projectPath: this.projectPath,
      created: this.created,
      lastModified: this.lastModified,
      coreContext: this.coreContext,
      decisions: this.decisions,
      agentMemory: this.agentMemory,
      conversationReferences: this.conversationReferences,
      metadata: this.metadata
    };
  }

  /**
   * Load from JSON
   */
  static fromJSON(data: any): ProjectMemory {
    const memory = new ProjectMemory(data.projectId, data.projectPath);
    memory.created = data.created;
    memory.lastModified = data.lastModified;
    memory.coreContext = data.coreContext;
    memory.decisions = data.decisions || [];
    memory.agentMemory = data.agentMemory || {};
    memory.conversationReferences = data.conversationReferences || [];
    memory.metadata = data.metadata || {
      totalConversations: 0,
      totalDecisions: 0,
      agentParticipation: {}
    };
    return memory;
  }

  /**
   * Generate unique IDs
   */
  _generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
