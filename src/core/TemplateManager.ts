import * as path from 'path';
import * as fs from 'fs';

export interface RunbookPreset {
  name: string;
  description: string;
  mode: 'consensus' | 'orchestrated' | 'iterative';
  taskTemplate: string; // e.g., "Refactor {{path}} with safety checklist"
  chunkSize?: number;
  agents: any; // Dictionary of agents
  judge: any;
  systemPromptTemplate?: string;
  recommendedModels?: Record<string, string>;
  outputFormat?: 'markdown' | 'diff' | 'json';
}

export class TemplateManager {
  private templates: Map<string, RunbookPreset> = new Map();

  constructor() {
    this.loadBuiltInTemplates();
  }

  private loadBuiltInTemplates() {
    // 1. Architecture Design Template
    this.templates.set('architecture-design', {
      name: 'architecture-design',
      description: 'Design high-level system architecture with tradeoffs discussion',
      mode: 'orchestrated', // Consensus might be better, but orchestrated allows a primary architect to lead
      taskTemplate: 'Design a system architecture for the given requirements.',
      agents: {
        'Architect': {
          model: 'claude-3-5-sonnet-latest',
          prompt: 'You are a Systems Architect. Design scalable, robust, and maintainable systems. Focus on components, data flow, and technologies.'
        },
        'DevOps': {
          model: 'gpt-4o',
          prompt: 'You are a DevOps engineer. Critique designs based on deployability, observability, scalability, and operational costs.'
        },
        'ProductOwner': {
          model: 'gemini-2.5-pro',
          prompt: 'You are a Product Owner. Ensure the technical design meets user needs, is feasible within timeline, and delivers business value.'
        }
      },
      judge: {
        model: 'claude-3-5-sonnet-latest',
        prompt: 'You are the CTO. Evaluate the proposed architecture and the team\'s feedback. Synthesize a final recommendation and help the team make a specific decision.'
      }
    });

    // 2. Documentation Review
    this.templates.set('doc-review', {
      name: 'doc-review',
      description: 'Review and improve documentation for clarity and completeness',
      mode: 'iterative',
      taskTemplate: 'Review the documentation for clarity, accuracy, and completeness. Suggest specific improvements.',
      chunkSize: 10,
      agents: {
        'TechWriter': {
          model: 'gpt-4o',
          prompt: 'You are a technical writer. Focus on clarity, grammar, tone, and structure. Ensure the documentation is accessible to the target audience.'
        },
        'Developer': {
          model: 'claude-3-5-sonnet-latest',
          prompt: 'You are a developer using this documentation. Verify that the examples are correct and the technical details are accurate.'
        }
      },
      judge: {
        model: 'gpt-4o',
        prompt: 'Merge the feedback into a final improved version of the documentation.'
      }
    });
    
     // 3. Bug Investigation
    this.templates.set('bug-investigation', {
      name: 'bug-investigation',
      description: 'Analyze code to find the root cause of a reported bug',
      mode: 'consensus',
      taskTemplate: 'Investigate the reported bug. Analyze the code to find the root cause and propose a fix.',
      agents: {
        'Detective': {
          model: 'gpt-4o',
          prompt: 'You are a code detective. Trace execution paths, look for edge cases, and identify logical errors.'
        },
        'Skeptic': {
          model: 'claude-3-5-sonnet-latest',
          prompt: 'You are a skeptic. Challenge assumptions made by the detective. Ask "what if" questions.'
        }
      },
      judge: {
        model: 'gpt-4o',
        prompt: 'Summarize the findings and determine the most likely root cause and recommended fix.'
      }
    });
  }

  public listTemplates(): RunbookPreset[] {
    return Array.from(this.templates.values());
  }

  public getTemplate(name: string): RunbookPreset | undefined {
    return this.templates.get(name);
  }

  public convertToConfig(template: RunbookPreset): any {
    return {
      // project_id: `template-${template.name}-${Date.now()}`, // Removed to avoid auto-loading non-existent memory
      agents: template.agents,
      judge: template.judge,
      max_rounds: 5, // Default
      turn_management: 'round_robin', // Default
      template_mode: template.mode, // Custom field to pass mode to CLI
      template_chunk_size: template.chunkSize
    };
  }
}
