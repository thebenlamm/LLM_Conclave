/**
 * ConsultOrchestrator - Fast multi-model consultation system
 *
 * Implements a streamlined consultation flow:
 * 1. Round 1: All agents respond in parallel (Independent)
 * 2. Round 2: Synthesis (Consensus Building)
 * 3. Round 3: Cross-Examination
 * 4. Round 4: Verdict
 */

import ProviderFactory from '../providers/ProviderFactory';
import { EventBus } from '../core/EventBus';
import { ConsultStateMachine } from './ConsultStateMachine';
import { ArtifactExtractor } from '../consult/artifacts/ArtifactExtractor';
import {
  Agent,
  Message,
  ConsultOrchestratorOptions
} from '../types';
import {
  ConsultationResult,
  CostSummary,
  TokenUsage,
  ConsultState,
  IndependentArtifact,
  AgentResponse,
  PromptVersions
} from '../types/consult';

export default class ConsultOrchestrator {
  private agents: Agent[];
  private maxRounds: number;
  private verbose: boolean;
  private stateMachine: ConsultStateMachine;
  private eventBus: EventBus;
  private consultationId: string;

  constructor(options: ConsultOrchestratorOptions = {}) {
    this.maxRounds = options.maxRounds || 4; // Default to 4 rounds per Epic 1
    this.verbose = options.verbose || false;
    this.eventBus = EventBus.getInstance();
    
    // Generate ID first so state machine can use it
    this.consultationId = this.generateId('consult');
    this.stateMachine = new ConsultStateMachine(this.consultationId);

    // Initialize 3 fixed agents with diverse models
    this.agents = this.initializeAgents();
  }

  /**
   * Initialize the 3 consultation agents
   */
  private initializeAgents(): Agent[] {
    return [
      {
        name: 'Security Expert',
        model: 'claude-sonnet-4-5',
        provider: ProviderFactory.createProvider('claude-sonnet-4-5'),
        systemPrompt: this.getSecurityExpertPrompt()
      },
      {
        name: 'Architect',
        model: 'gpt-4o',
        provider: ProviderFactory.createProvider('gpt-4o'),
        systemPrompt: this.getArchitectPrompt()
      },
      {
        name: 'Pragmatist',
        model: 'gemini-2.5-pro',
        provider: ProviderFactory.createProvider('gemini-2.5-pro'),
        systemPrompt: this.getPragmatistPrompt()
      }
    ];
  }

  /**
   * Execute a consultation
   * @param question - The question to consult on
   * @param context - Optional context (files, project info, etc.)
   * @returns Consultation result with consensus, confidence, and costs
   */
  async consult(question: string, context: string = ''): Promise<ConsultationResult> {
    const startTime = Date.now();
    
    // Start consultation lifecycle
    this.stateMachine.transition(ConsultState.Estimating);
    
    // Emit started event
    this.eventBus.emitEvent('consultation:started' as any, {
      consultation_id: this.consultationId,
      question,
      agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })), // Provider logic handled in factory
      mode: 'converge' // Default for now
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`CONSULTATION: ${question}`);
    console.log(`${'='.repeat(80)}\n`);

    // --- State: Estimating ---
    // (Story 1.3 will implement actual estimation. For now, we simulate success)
    
    // --- State: AwaitingConsent ---
    this.stateMachine.transition(ConsultState.AwaitingConsent);
    this.eventBus.emitEvent('consultation:user_consent' as any, {
      consultation_id: this.consultationId,
      approved: true
    }); // Auto-approve for Epic 1 MVP

    // --- State: Independent (Round 1) ---
    this.stateMachine.transition(ConsultState.Independent);
    console.log(`\n--- Round 1: Independent Analysis ---\n`);
    
    const round1Artifacts = await this.executeRound1Independent(question, context);
    
    // Track failed agents
    const successfulArtifacts = round1Artifacts.filter(a => !!a);
    if (successfulArtifacts.length === 0) {
      this.stateMachine.transition(ConsultState.Aborted, 'All agents failed in Round 1');
      throw new Error('All agents failed. Unable to provide consultation.');
    }

    // --- State: Synthesis (Round 2) ---
    this.stateMachine.transition(ConsultState.Synthesis);
    console.log(`\n--- Round 2: Synthesis ---\n`);
    
    // Placeholder for Story 1.4 implementation
    // For now, we'll create a dummy synthesis to satisfy the return type or just finish
    // Since Story 1.2 focuses on Round 1, we will stop full implementation here
    // but ensuring the flow is correct.
    
    // TODO: Implement Round 2, 3, 4 fully in subsequent stories.
    
    // For this story verification, we'll complete the flow minimally.
    this.stateMachine.transition(ConsultState.Complete);

    const durationMs = Date.now() - startTime;
    
    // Minimal result for Story 1.2 verification
    return {
      consultationId: this.consultationId,
      timestamp: new Date().toISOString(),
      question,
      context,
      mode: 'converge',
      agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })),
      state: ConsultState.Complete,
      rounds: this.maxRounds,
      completedRounds: 1,
      responses: {
        round1: successfulArtifacts as IndependentArtifact[]
      },
      consensus: 'Pending Round 2 implementation',
      confidence: 0,
      recommendation: 'Pending Round 4 implementation',
      reasoning: {},
      concerns: [],
      dissent: [],
      perspectives: [],
      cost: { tokens: { input: 0, output: 0, total: 0 }, usd: 0 },
      durationMs,
      promptVersions: {
        mode: 'converge',
        independentPromptVersion: '1.0',
        synthesisPromptVersion: '1.0',
        crossExamPromptVersion: '1.0',
        verdictPromptVersion: '1.0'
      }
    };
  }

  /**
   * Execute Round 1: Independent Analysis
   * - Parallel execution
   * - Structured artifact extraction
   */
  private async executeRound1Independent(
    question: string,
    context: string
  ): Promise<(IndependentArtifact | null)[]> {
    const promises = this.agents.map(agent =>
      this.executeAgentIndependent(agent, question, context)
    );

    const results = await Promise.all(promises);
    
    // Emit completion event for the round? 
    // The story says: "System emits agent:completed event with duration and tokens" (handled in executeAgentIndependent)
    
    return results;
  }

  /**
   * Execute a single agent for Independent Round
   */
  private async executeAgentIndependent(
    agent: Agent,
    question: string,
    context: string
  ): Promise<IndependentArtifact | null> {
    const startTime = Date.now();

    try {
      this.eventBus.emitEvent('agent:thinking' as any, {
        consultation_id: this.consultationId,
        agent_name: agent.name,
        round: 1
      });

      console.log(`⚡ ${agent.name} (${agent.model}) thinking...`);

      const messages: Message[] = [
        {
          role: 'user',
          content: context ? `Context:\n${context}\n\nQuestion: ${question}` : `Question: ${question}`
        }
      ];

      const response = await agent.provider.chat(
        messages,
        agent.systemPrompt
      );

      const duration = Date.now() - startTime;
      console.log(`✓ ${agent.name} responded in ${(duration / 1000).toFixed(1)}s`);

      // Extract Artifact
      const artifact = ArtifactExtractor.extractIndependentArtifact(
        response.text || '',
        agent.name // Using name as ID for now, ideally strictly ID
      );

      this.eventBus.emitEvent('agent:completed' as any, {
        consultation_id: this.consultationId,
        agent_name: agent.name,
        duration_ms: duration,
        tokens: response.usage
      });

      return artifact;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.warn(`⚠️  Agent ${agent.name} failed: ${error.message}`);
      
      // Story: Failed agent response includes error field (handled in logging/warning)
      // We return null here and filter later, but ideally we should preserve the error state in the result
      return null;
    }
  }

  /**
   * Generate a unique consultation ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Common JSON instruction for all agents
   */
  private getJsonInstruction(): string {
    return `
IMPORTANT: You must provide your response in valid JSON format ONLY. 
Do not include any introductory or concluding text. 
Use the following schema:

{
  "position": "One sentence summary of your position",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "rationale": "Detailed explanation of your reasoning (2-3 paragraphs)",
  "confidence": 0.0-1.0 (number indicating your certainty),
  "prose_excerpt": "A short, quote-worthy summary of your stance"
}
`;
  }

  /**
   * Get Security Expert system prompt
   */
  private getSecurityExpertPrompt(): string {
    return `You are a Security Expert specializing in threat modeling and vulnerability analysis.

Your role in consultations:
- Identify security risks and vulnerabilities
- Evaluate authentication, authorization, and data protection approaches
- Consider attack vectors and mitigation strategies
- Assess compliance and privacy implications

${this.getJsonInstruction()}`;
  }

  /**
   * Get Architect system prompt
   */
  private getArchitectPrompt(): string {
    return `You are a Software Architect specializing in system design and scalability.

Your role in consultations:
- Evaluate architectural patterns and trade-offs
- Consider scalability, maintainability, and extensibility
- Assess technical debt implications
- Recommend best practices and design patterns

${this.getJsonInstruction()}`;
  }

  /**
   * Get Pragmatist system prompt
   */
  private getPragmatistPrompt(): string {
    return `You are a Pragmatic Engineer focused on shipping and practical implementation.

Your role in consultations:
- Assess implementation complexity and time-to-ship
- Consider team capabilities and existing codebase constraints
- Balance ideal solutions with practical realities
- Identify simpler alternatives that deliver 80% of value with 20% effort

${this.getJsonInstruction()}`;
  }
}