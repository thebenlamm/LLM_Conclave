"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateManager = void 0;
class TemplateManager {
    constructor() {
        this.templates = new Map();
        this.loadBuiltInTemplates();
    }
    loadBuiltInTemplates() {
        // 1. Code Review Template
        this.templates.set('code-review', {
            name: 'code-review',
            description: 'Comprehensive code review with security and performance focus',
            mode: 'iterative',
            taskTemplate: 'Review the following code for bugs, security vulnerabilities, and performance issues.',
            chunkSize: 5, // Review in chunks
            agents: {
                'SecurityExpert': {
                    model: 'claude-3-5-sonnet-latest',
                    prompt: 'You are a security expert. Focus on identifying vulnerabilities (OWASP Top 10, etc.), sensitive data exposure, and authentication flaws.'
                },
                'PerformanceEngineer': {
                    model: 'claude-3-5-sonnet-latest',
                    prompt: 'You are a performance engineer. Look for N+1 queries, memory leaks, inefficient algorithms, and unoptimized loops.'
                },
                'SeniorDev': {
                    model: 'gpt-4o',
                    prompt: 'You are a senior developer. Focus on code style, maintainability, architectural patterns, and best practices.'
                }
            },
            judge: {
                model: 'gpt-4o',
                prompt: 'You are the lead maintainer. Synthesize the feedback from the experts into a cohesive review. Group comments by file and priority.'
            }
        });
        // 2. Architecture Design Template
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
        // 3. Documentation Review
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
        // 4. Bug Investigation
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
    listTemplates() {
        return Array.from(this.templates.values());
    }
    getTemplate(name) {
        return this.templates.get(name);
    }
    convertToConfig(template) {
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
exports.TemplateManager = TemplateManager;
