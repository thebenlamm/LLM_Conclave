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
import { CostEstimator } from '../consult/cost/CostEstimator';
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
  SynthesisArtifact,
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
  private costEstimator: CostEstimator;

  constructor(options: ConsultOrchestratorOptions = {}) {
    this.maxRounds = options.maxRounds || 4; // Default to 4 rounds per Epic 1
    this.verbose = options.verbose || false;
    this.eventBus = EventBus.getInstance();
    this.costEstimator = new CostEstimator();
    
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

    if (this.verbose) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`CONSULTATION: ${question}`);
      console.log(`${'='.repeat(80)}\n`);
    }

    // --- State: Estimating ---
    const estimate = this.costEstimator.estimateCost(question, this.agents, this.maxRounds);
    this.eventBus.emitEvent('consultation:cost_estimated' as any, {
      consultation_id: this.consultationId,
      estimated_cost: estimate.estimatedCostUsd,
      input_tokens: estimate.inputTokens,
      expected_output_tokens: estimate.outputTokens
    });

    // --- State: AwaitingConsent ---
    this.stateMachine.transition(ConsultState.AwaitingConsent);
    this.eventBus.emitEvent('consultation:user_consent' as any, {
      consultation_id: this.consultationId,
      approved: true
    }); // Auto-approve for Epic 1 MVP

    // --- State: Independent (Round 1) ---
    this.stateMachine.transition(ConsultState.Independent);
    if (this.verbose) console.log(`\n--- Round 1: Independent Analysis ---\n`);
    
    const round1Artifacts = await this.executeRound1Independent(question, context);
    
    // Track failed agents
    const successfulArtifacts = (round1Artifacts.filter(a => !!a) as IndependentArtifact[]);
    if (successfulArtifacts.length === 0) {
      this.stateMachine.transition(ConsultState.Aborted, 'All agents failed in Round 1');
      throw new Error('All agents failed. Unable to provide consultation.');
    }
    
    this.eventBus.emitEvent('round:completed' as any, {
      consultation_id: this.consultationId,
      round_number: 1,
      artifact_type: 'independent'
    });

    // --- State: Synthesis (Round 2) ---
    this.stateMachine.transition(ConsultState.Synthesis);
    if (this.verbose) console.log(`\n--- Round 2: Synthesis ---\n`);
    
    const synthesisArtifact = await this.executeRound2Synthesis(question, successfulArtifacts);
    
    // --- State: CrossExam (Round 3) ---
    // this.stateMachine.transition(ConsultState.CrossExam);
    
    // TODO: Implement Round 3 & 4 in subsequent stories.
    // For this story verification (Story 1.4), we stop after Round 2.
    // Synthesis -> Complete is a valid transition (early termination path).
    this.stateMachine.transition(ConsultState.Complete);

    const durationMs = Date.now() - startTime;
    
    const result: ConsultationResult = {
      consultationId: this.consultationId,
      timestamp: new Date().toISOString(),
      question,
      context,
      mode: 'converge',
      agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })),
      state: ConsultState.Complete,
      rounds: this.maxRounds,
      completedRounds: 2,
      responses: {
        round1: successfulArtifacts,
        round2: synthesisArtifact || undefined
      },
      consensus: 'Pending Round 2 implementation',
      confidence: 0,
      recommendation: 'Pending Round 4 implementation',
      reasoning: {},
      concerns: [],
      dissent: [],
      perspectives: [],
      cost: { tokens: { input: estimate.inputTokens, output: estimate.outputTokens, total: estimate.totalTokens }, usd: estimate.estimatedCostUsd }, // Using estimate as actual for now
      durationMs,
      promptVersions: {
        mode: 'converge',
        independentPromptVersion: '1.0',
        synthesisPromptVersion: '1.0',
        crossExamPromptVersion: '1.0',
        verdictPromptVersion: '1.0'
      }
    };

    this.eventBus.emitEvent('consultation:completed' as any, {
      consultation_id: this.consultationId,
      result
    });

    return result;
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
    return results;
  }

  /**
   * Execute Round 2: Synthesis
   * - Uses GPT-4o as Judge to synthesize independent perspectives
   */
  private async executeRound2Synthesis(
    question: string,
    artifacts: IndependentArtifact[]
  ): Promise<SynthesisArtifact | null> {
    const startTime = Date.now();
    const judgeAgent = {
      name: 'Judge (Synthesis)',
      model: 'gpt-4o',
      provider: ProviderFactory.createProvider('gpt-4o'),
      systemPrompt: this.getSynthesisPrompt(artifacts)
    };

    this.eventBus.emitEvent('agent:thinking' as any, {
      consultation_id: this.consultationId,
      agent_name: judgeAgent.name,
      round: 2
    });

    if (this.verbose) console.log(`⚡ Judge (GPT-4o) synthesizing consensus...`);

    try {
      const messages: Message[] = [
        {
          role: 'user',
          content: `Question: ${question}\n\nAnalyze the expert perspectives and synthesize consensus.`
        }
      ];

      const response = await judgeAgent.provider.chat(messages, judgeAgent.systemPrompt);
      const duration = Date.now() - startTime;

      if (this.verbose) console.log(`✓ Synthesis complete in ${(duration / 1000).toFixed(1)}s`);

      const artifact = ArtifactExtractor.extractSynthesisArtifact(response.text || '');
      
      this.eventBus.emitEvent('consultation:round_artifact' as any, {
        consultation_id: this.consultationId,
        round_number: 2,
        artifact_type: 'synthesis',
        artifact
      });

      this.eventBus.emitEvent('round:completed' as any, {
        consultation_id: this.consultationId,
        round_number: 2,
        artifact_type: 'synthesis'
      });

      return artifact;
    } catch (error: any) {
      if (this.verbose) console.warn(`⚠️ Synthesis failed: ${error.message}`);
      // In a real scenario, we might want to fail the consultation or degrade gracefully
      this.stateMachine.transition(ConsultState.Aborted, `Synthesis failed: ${error.message}`);
      throw error;
    }
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

      if (this.verbose) console.log(`⚡ ${agent.name} (${agent.model}) thinking...`);

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
      if (this.verbose) console.log(`✓ ${agent.name} responded in ${(duration / 1000).toFixed(1)}s`);

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
      if (this.verbose) console.warn(`⚠️  Agent ${agent.name} failed: ${error.message}`);
      
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
   * Synthesis Prompt for Judge
   */
  private getSynthesisPrompt(artifacts: IndependentArtifact[]): string {
    const perspectives = artifacts.map(a => `
### Agent: ${a.agentId}
**Position:** ${a.position}
**Key Points:**
${a.keyPoints.map(kp => `- ${kp}`).join('\n')}
**Rationale:** ${a.rationale}
**Confidence:** ${a.confidence}
`).join('\n---\n');

    return `You are the Consensus Judge in a rigorous multi-model consultation.

Your goal is to synthesize the perspectives of 3 experts into a coherent analysis of consensus and disagreement.
You are NOT providing the final answer yet. You are mapping the debate terrain.

### Expert Perspectives:
${perspectives}

### Instructions:
1. Identify **Consensus Points**: What do the experts agree on? (Explicit or implicit agreement)
2. Identify **Tensions**: Where do they disagree? (Conflicting recommendations, trade-offs, or emphasis)
3. Rank the **Priority Order** of topics that need resolution.

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "consensus_points": [
    {
      "point": "Statement of agreement",
      "supporting_agents": ["Agent Name 1", "Agent Name 2"],
      "confidence": 0.0-1.0 (how strong is this consensus?)
    }
  ],
  "tensions": [
    {
      "topic": "Topic of disagreement (e.g., Auth Method)",
      "viewpoints": [
        { "agent": "Agent Name 1", "viewpoint": "Summary of their view" },
        { "agent": "Agent Name 2", "viewpoint": "Summary of their view" }
      ]
    }
  ],
  "priority_order": ["Topic 1", "Topic 2", "Topic 3"]
}`;
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