/**
 * Persona System - Built-in expert roles for easy configuration
 *
 * Users can specify personas instead of manually configuring agents:
 * llm-conclave --with security,performance "Review this code"
 *
 * Custom personas can be defined in ~/.llm-conclave/config.json:
 * {
 *   "custom_personas": {
 *     "healthCoach": {
 *       "name": "Health Coach",
 *       "description": "Behavior change and habit formation expert",
 *       "model": "claude-sonnet-4-5",
 *       "provider": "anthropic",
 *       "systemPrompt": "You are a certified health coach..."
 *     }
 *   },
 *   "persona_sets": {
 *     "health": ["healthCoach", "psychologist", "nutritionist"],
 *     "startup": ["architect", "pragmatic", "creative"]
 *   }
 * }
 *
 * Usage:
 * - Custom persona: --with healthCoach,psychologist
 * - Persona set: --with @health (expands to healthCoach,psychologist,nutritionist)
 * - Mixed: --with @health,security (combines set + built-in)
 */

import * as fs from 'fs';
import { ConfigPaths } from '../utils/ConfigPaths';

export interface Persona {
  name: string;
  description: string;
  model: string;
  provider: string;
  systemPrompt: string;
  preferredFor: string[];
}

export interface CustomPersonaConfig {
  name: string;
  description?: string;
  model: string;
  provider?: string;
  systemPrompt: string;
  prompt?: string;  // Alias for systemPrompt (matches .llm-conclave.json agent format)
  preferredFor?: string[];
}

/**
 * Standard instruction appended to all persona prompts requiring substantive participation.
 * Encourages adversarial thinking and prevents shallow agreement.
 */
const PARTICIPATION_REQUIREMENT = `

IMPORTANT PARTICIPATION RULES:
1. You MUST respond in every round with SUBSTANTIVE content.
2. AVOID shallow agreement like "I agree with X" or "Well said" - this adds no value.
3. Instead, when you agree with the general direction, IMPROVE it by:
   - Adding edge cases that weren't considered
   - Identifying potential failure modes
   - Suggesting specific implementation details
   - Noting trade-offs that weren't mentioned
4. Play devil's advocate when appropriate - challenge assumptions even if you agree overall.
5. If you truly have nothing new to add, state WHAT was already covered AND WHY it's complete.

Your unique perspective is why you're here. Don't waste it on empty agreement.`;

/**
 * Alias map for common persona name variations.
 * Users can use either the alias or the canonical name.
 */
const PERSONA_ALIASES: Record<string, string> = {
  // Common shorthand
  'architect': 'architecture',
  'arch': 'architecture',
  'sec': 'security',
  'perf': 'performance',
  'dev': 'devops',
  'ops': 'devops',
  'a11y': 'accessibility',
  'docs': 'documentation',
  'doc': 'documentation',
  // Alternative names
  'innovation': 'creative',
  'innovator': 'creative',
  'critic': 'skeptic',
  'devil': 'skeptic',
  'devils-advocate': 'skeptic',
  'practical': 'pragmatic',
  'engineer': 'pragmatic',
  'tester': 'qa',
  'testing': 'qa',
  'quality': 'qa',
};

export class PersonaSystem {
  private static personas: Record<string, Persona> = {
    security: {
      name: 'Security Expert',
      description: 'Security-focused analysis and vulnerability detection',
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      systemPrompt: `You are a cybersecurity expert specializing in secure code review and vulnerability detection.

Your responsibilities:
- Identify security vulnerabilities (OWASP Top 10, CVE patterns)
- Analyze authentication, authorization, and access control
- Review input validation, sanitization, and encoding
- Check for injection flaws (SQL, XSS, command injection)
- Evaluate cryptographic implementations
- Assess data protection and privacy concerns
- Review dependencies for known vulnerabilities

Provide specific, actionable recommendations with code examples when possible.`,
      preferredFor: ['security', 'auth', 'vulnerability', 'exploit', 'penetration']
    },

    performance: {
      name: 'Performance Engineer',
      description: 'Performance optimization and efficiency analysis',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: `You are a performance engineering expert focused on optimization and efficiency.

Your responsibilities:
- Identify performance bottlenecks (CPU, memory, I/O)
- Analyze time and space complexity
- Review database queries and indexing strategies
- Evaluate caching opportunities
- Assess scalability and load handling
- Review concurrency and parallelization
- Identify memory leaks and resource management issues

Provide measurable optimization recommendations with expected impact.`,
      preferredFor: ['performance', 'optimization', 'speed', 'slow', 'bottleneck', 'scale']
    },

    architecture: {
      name: 'Systems Architect',
      description: 'Software architecture and system design expert',
      model: 'claude-opus-4-5',
      provider: 'anthropic',
      systemPrompt: `You are a senior software architect with expertise in system design and architecture patterns.

Your responsibilities:
- Evaluate architectural patterns and design decisions
- Assess modularity, coupling, and cohesion
- Review API design and interface contracts
- Analyze scalability and maintainability
- Evaluate technology choices and trade-offs
- Review system boundaries and service interactions
- Assess data flow and state management

Provide strategic recommendations aligned with software engineering principles.`,
      preferredFor: ['architecture', 'design', 'structure', 'pattern', 'refactor', 'organize']
    },

    creative: {
      name: 'Creative Innovator',
      description: 'Innovation-focused with novel approaches',
      model: 'gemini-2.5-pro',
      provider: 'google',
      systemPrompt: `You are a creative problem solver who thinks outside conventional boundaries.

Your responsibilities:
- Propose novel and unconventional solutions
- Challenge assumptions and existing patterns
- Suggest innovative approaches and technologies
- Explore alternative perspectives
- Identify opportunities for improvement
- Think holistically about user experience
- Connect ideas from different domains

Balance creativity with practicality and feasibility.`,
      preferredFor: ['innovation', 'creative', 'novel', 'alternative', 'brainstorm', 'idea']
    },

    skeptic: {
      name: 'Critical Analyst',
      description: 'Devil\'s advocate who challenges assumptions',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: `You are a critical thinker who challenges assumptions and identifies potential issues.

Your responsibilities:
- Question proposed solutions and approaches
- Identify edge cases and failure modes
- Challenge overly optimistic assumptions
- Point out potential risks and downsides
- Evaluate feasibility and practicality
- Identify hidden costs and trade-offs
- Ensure thorough consideration of consequences

Be constructively critical while proposing alternatives.`,
      preferredFor: ['review', 'critique', 'challenge', 'validate', 'verify']
    },

    pragmatic: {
      name: 'Pragmatic Engineer',
      description: 'Practical, shipping-focused engineer',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: `You are a pragmatic engineer focused on shipping working solutions efficiently.

Your responsibilities:
- Evaluate practical implementation approaches
- Balance perfectionism with delivery timelines
- Identify minimal viable solutions
- Assess technical debt trade-offs
- Focus on maintainability and simplicity
- Prioritize high-impact changes
- Consider operational and maintenance burden

Provide actionable, realistic recommendations that can be implemented quickly.`,
      preferredFor: ['practical', 'shipping', 'mvp', 'simple', 'quick', 'efficient']
    },

    testing: {
      name: 'Quality Assurance Expert',
      description: 'Testing and quality assurance specialist',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: `You are a QA engineer specializing in testing strategies and quality assurance.

Your responsibilities:
- Design comprehensive test strategies
- Identify test cases and edge cases
- Review test coverage and quality
- Evaluate testing approaches (unit, integration, e2e)
- Assess testability and maintainability
- Review mocking and fixture strategies
- Identify flaky tests and test smells

Provide specific testing recommendations with example test cases.`,
      preferredFor: ['testing', 'test', 'qa', 'quality', 'coverage', 'bug']
    },

    devops: {
      name: 'DevOps Engineer',
      description: 'Infrastructure and deployment expert',
      model: 'gemini-2.5-pro',
      provider: 'google',
      systemPrompt: `You are a DevOps engineer focused on infrastructure, deployment, and operational excellence.

Your responsibilities:
- Review CI/CD pipeline configurations
- Evaluate deployment strategies
- Assess infrastructure as code
- Review monitoring and observability
- Evaluate containerization and orchestration
- Assess security in deployment pipelines
- Review backup and disaster recovery

Provide operational recommendations with infrastructure best practices.`,
      preferredFor: ['devops', 'deployment', 'infrastructure', 'ci', 'cd', 'docker', 'kubernetes']
    },

    accessibility: {
      name: 'Accessibility Expert',
      description: 'Web accessibility and inclusive design specialist',
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      systemPrompt: `You are an accessibility expert focused on inclusive design and WCAG compliance.

Your responsibilities:
- Review accessibility compliance (WCAG 2.1 AA/AAA)
- Evaluate semantic HTML and ARIA usage
- Assess keyboard navigation and focus management
- Review screen reader compatibility
- Evaluate color contrast and visual design
- Assess form accessibility and error handling
- Review multimedia accessibility (captions, transcripts)

Provide specific recommendations for inclusive design.`,
      preferredFor: ['accessibility', 'a11y', 'wcag', 'inclusive', 'disability', 'screen reader']
    },

    documentation: {
      name: 'Documentation Specialist',
      description: 'Technical writing and documentation expert',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: `You are a technical writer specializing in clear, comprehensive documentation.

Your responsibilities:
- Review documentation clarity and completeness
- Evaluate API documentation and examples
- Assess code comments and inline documentation
- Review README files and getting started guides
- Evaluate architecture documentation
- Assess documentation maintainability
- Review tutorial and guide effectiveness

Provide recommendations for improving documentation quality and coverage.`,
      preferredFor: ['documentation', 'docs', 'readme', 'comments', 'guide', 'tutorial']
    }
  };

  // Cache for custom personas loaded from global config
  private static customPersonasCache: Record<string, Persona> | null = null;
  private static personaSetsCache: Record<string, string[]> | null = null;

  /**
   * Load custom personas from global config (~/.llm-conclave/config.json)
   */
  private static loadCustomPersonas(): Record<string, Persona> {
    if (this.customPersonasCache !== null) {
      return this.customPersonasCache;
    }

    this.customPersonasCache = {};
    const globalConfigPath = ConfigPaths.globalConfig;

    if (!fs.existsSync(globalConfigPath)) {
      return this.customPersonasCache;
    }

    try {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      const globalConfig = JSON.parse(content);

      if (globalConfig.custom_personas) {
        for (const [key, config] of Object.entries(globalConfig.custom_personas) as [string, CustomPersonaConfig][]) {
          // Infer provider from model name if not specified
          const provider = config.provider || this.inferProvider(config.model);

          this.customPersonasCache[key.toLowerCase()] = {
            name: config.name || key,
            description: config.description || `Custom persona: ${key}`,
            model: config.model,
            provider: provider,
            systemPrompt: config.systemPrompt || config.prompt || '',
            preferredFor: config.preferredFor || []
          };
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not load custom personas from ${globalConfigPath}`);
    }

    return this.customPersonasCache;
  }

  /**
   * Load persona sets from global config
   */
  private static loadPersonaSets(): Record<string, string[]> {
    if (this.personaSetsCache !== null) {
      return this.personaSetsCache;
    }

    const globalConfigPath = ConfigPaths.globalConfig;

    if (!fs.existsSync(globalConfigPath)) {
      this.personaSetsCache = {};
      return this.personaSetsCache;
    }

    this.personaSetsCache = {};

    try {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      const globalConfig = JSON.parse(content);

      if (globalConfig.persona_sets) {
        this.personaSetsCache = globalConfig.persona_sets;
      }
    } catch (error) {
      console.warn(`Warning: Could not load persona sets from ${globalConfigPath}`);
    }

    return this.personaSetsCache || {};
  }

  /**
   * Infer provider from model name
   */
  private static inferProvider(model: string): string {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('claude') || modelLower.includes('sonnet') || modelLower.includes('opus') || modelLower.includes('haiku')) {
      return 'anthropic';
    }
    if (modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('o3')) {
      return 'openai';
    }
    if (modelLower.includes('gemini')) {
      return 'google';
    }
    if (modelLower.includes('grok')) {
      return 'xai';
    }
    if (modelLower.includes('mistral') || modelLower.includes('mixtral')) {
      return 'mistral';
    }
    return 'openai'; // Default fallback
  }

  /**
   * Expand persona set reference (e.g., "@health" -> ["healthCoach", "psychologist", ...])
   */
  private static expandPersonaSet(setName: string): string[] {
    const sets = this.loadPersonaSets();
    const cleanName = setName.startsWith('@') ? setName.slice(1) : setName;
    return sets[cleanName] || [];
  }

  /**
   * Get all available personas (built-in + custom)
   */
  private static getAllPersonas(): Record<string, Persona> {
    const customPersonas = this.loadCustomPersonas();
    return { ...this.personas, ...customPersonas };
  }

  /**
   * Clear caches (useful for testing or when config changes)
   */
  static clearCache(): void {
    this.customPersonasCache = null;
    this.personaSetsCache = null;
  }

  /**
   * Resolve a persona name through aliases.
   * Returns the canonical name if an alias exists, otherwise returns the original.
   */
  static resolveAlias(name: string): string {
    const lower = name.toLowerCase();
    return PERSONA_ALIASES[lower] || lower;
  }

  /**
   * Get a persona by name (checks aliases, then built-in, then custom)
   */
  static getPersona(name: string): Persona | undefined {
    const allPersonas = this.getAllPersonas();
    const resolved = this.resolveAlias(name);
    return allPersonas[resolved];
  }

  /**
   * List all available personas (built-in + custom)
   */
  static listPersonas(): Persona[] {
    const allPersonas = this.getAllPersonas();
    return Object.values(allPersonas);
  }

  /**
   * List persona sets from global config
   */
  static listPersonaSets(): Record<string, string[]> {
    return this.loadPersonaSets();
  }

  /**
   * Get personas by names (comma-separated string or array)
   * Supports:
   * - Built-in personas: "security,architect"
   * - Custom personas: "healthCoach,psychologist"
   * - Persona sets: "@health" (expands to personas in the set)
   * - Mixed: "@health,security" (combines set + individual)
   */
  static getPersonas(names: string | string[]): Persona[] {
    const nameList = typeof names === 'string'
      ? names.split(',').map(n => n.trim())
      : names;

    const allPersonas = this.getAllPersonas();
    const personas: Persona[] = [];
    const seen = new Set<string>(); // Avoid duplicates

    for (const name of nameList) {
      // Handle persona set references (e.g., "@health")
      if (name.startsWith('@')) {
        const setPersonas = this.expandPersonaSet(name);
        if (setPersonas.length === 0) {
          console.warn(`⚠️  Unknown persona set: ${name}. Check ~/.llm-conclave/config.json for available sets.`);
          continue;
        }
        // Recursively get personas from the set
        for (const setPersonaName of setPersonas) {
          const resolved = this.resolveAlias(setPersonaName);
          const persona = allPersonas[resolved];
          if (persona && !seen.has(persona.name)) {
            personas.push(persona);
            seen.add(persona.name);
          }
        }
      } else {
        // Regular persona lookup (with alias resolution)
        const resolved = this.resolveAlias(name);
        const persona = allPersonas[resolved];
        if (persona && !seen.has(persona.name)) {
          personas.push(persona);
          seen.add(persona.name);
        } else if (!persona) {
          console.warn(`⚠️  Unknown persona: ${name}. Use 'llm-conclave personas' to see available options.`);
        }
      }
    }

    return personas;
  }

  /**
   * Suggest personas based on task keywords
   */
  static suggestPersonas(task: string): Persona[] {
    const taskLower = task.toLowerCase();
    const suggestions: Persona[] = [];

    for (const persona of Object.values(this.personas)) {
      for (const keyword of persona.preferredFor) {
        if (taskLower.includes(keyword)) {
          suggestions.push(persona);
          break;
        }
      }
    }

    return suggestions;
  }

  /**
   * Convert personas to agent configuration
   * Appends participation requirement to ensure all personas respond in every round
   */
  static personasToAgents(personas: Persona[]): Record<string, any> {
    const agents: Record<string, any> = {};

    for (const persona of personas) {
      agents[persona.name] = {
        model: persona.model,
        provider: persona.provider,
        systemPrompt: persona.systemPrompt + PARTICIPATION_REQUIREMENT
      };
    }

    return agents;
  }

  /**
   * Get default persona set for a given mode/task
   */
  static getDefaultPersonas(mode: string, task?: string): Persona[] {
    // If task provided, try to suggest based on keywords
    if (task) {
      const suggestions = this.suggestPersonas(task);
      if (suggestions.length > 0) {
        return suggestions.slice(0, 3); // Top 3 suggestions
      }
    }

    // Default sets for each mode
    switch (mode) {
      case 'review':
      case 'orchestrated':
        return [
          this.personas.security,
          this.personas.performance,
          this.personas.architecture
        ];

      case 'iterate':
      case 'iterative':
        return [
          this.personas.pragmatic,
          this.personas.skeptic
        ];

      case 'discuss':
      case 'consensus':
      default:
        return [
          this.personas.architecture,
          this.personas.pragmatic,
          this.personas.skeptic
        ];
    }
  }
}
