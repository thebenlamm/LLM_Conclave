import { ProviderResponse } from '../types';

/**
 * Helper function to create a ProviderResponse with usage stats
 */
export function makeResponse(
  text: string,
  inputTokens = 100,
  outputTokens = 200
): ProviderResponse {
  return {
    text,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    }
  };
}

/**
 * Round 1: Independent Analysis
 * Agent provides initial position on the task
 */
export function r1IndependentAnalysis(
  position: string = 'Use microservices architecture',
  keyPoints: string[] = ['Scalability', 'Team autonomy', 'Technology flexibility'],
  confidence: number = 0.85
): ProviderResponse {
  const response = {
    position,
    key_points: keyPoints,
    rationale: 'Based on the system requirements and team structure, this approach provides the best balance.',
    confidence,
    prose_excerpt: `I recommend ${position.toLowerCase()} because it addresses the core challenges effectively.`
  };

  return makeResponse(JSON.stringify(response), 150, 250);
}

/**
 * Round 2: Synthesis (Judge)
 * Judge synthesizes agent positions into consensus points and tensions
 */
export function r2SynthesisResponse(
  consensusPoints: Array<{ point: string; supporting_agents: string[]; confidence: number }> = [
    { point: 'Need for scalability', supporting_agents: ['Agent1', 'Agent2'], confidence: 0.9 }
  ],
  tensions: Array<{ topic: string; viewpoints: string[] }> = [
    { topic: 'Deployment complexity', viewpoints: ['Simple monolith', 'Microservices overhead'] }
  ]
): ProviderResponse {
  const response = {
    consensus_points: consensusPoints,
    tensions,
    priority_order: ['scalability', 'maintainability', 'deployment_complexity']
  };

  return makeResponse(JSON.stringify(response), 200, 300);
}

/**
 * Round 3: Cross-Examination (Agent)
 * Agent critiques other positions and defends their own
 */
export function r3CrossExamination(
  critique: string = 'The monolith approach underestimates future scaling needs',
  challenges: string[] = ['How will you handle 10x traffic?', 'What about team coordination at scale?'],
  revisedPosition?: string
): ProviderResponse {
  const response = {
    critique,
    challenges,
    defense: 'My original position accounts for both immediate and long-term needs',
    revised_position: revisedPosition || 'Maintain original position with emphasis on phased adoption'
  };

  return makeResponse(JSON.stringify(response), 180, 280);
}

/**
 * Round 3: Judge Synthesis
 * Judge synthesizes challenges and rebuttals
 */
export function r3JudgeSynthesis(
  challenges: Array<{ from: string; to: string; challenge: string }> = [
    { from: 'Agent1', to: 'Agent2', challenge: 'How will you scale?' }
  ],
  rebuttals: Array<{ agent: string; rebuttal: string }> = [
    { agent: 'Agent2', rebuttal: 'Vertical scaling is sufficient for our use case' }
  ],
  unresolved: string[] = []
): ProviderResponse {
  const response = {
    challenges,
    rebuttals,
    unresolved
  };

  return makeResponse(JSON.stringify(response), 220, 320);
}

/**
 * Round 4: Final Verdict
 * Judge provides final recommendation with structured output
 */
export function r4VerdictResponse(
  recommendation: string = 'Adopt microservices with staged rollout',
  confidence: number = 0.88,
  keyDecisions: string[] = ['Start with monolith', 'Extract services as needed', 'Invest in observability'],
  actionItems: string[] = ['Define service boundaries', 'Set up monitoring', 'Create migration plan']
): ProviderResponse {
  const response = {
    recommendation,
    confidence,
    _analysis: 'After weighing all perspectives, the hybrid approach balances immediate needs with long-term scalability.',
    key_decisions: keyDecisions,
    action_items: actionItems,
    dissenting_opinions: ['Agent X preferred full microservices from day 1'],
    implementation_priority: 'HIGH'
  };

  return makeResponse(JSON.stringify(response), 250, 400);
}

/**
 * Consensus Mode: Judge determines consensus reached
 */
export function consensusJudgeResponse(
  solution: string = 'Use PostgreSQL with read replicas',
  keyDecisions: string[] = ['PostgreSQL for ACID guarantees', 'Read replicas for scaling'],
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
): ProviderResponse {
  const response = {
    consensusReached: true,
    solution,
    guidance: 'All agents agree on the core approach with minor implementation variations.',
    keyDecisions,
    actionItems: ['Set up primary database', 'Configure replication', 'Test failover'],
    dissent: [],
    confidence
  };

  return makeResponse(JSON.stringify(response), 200, 350);
}

/**
 * Consensus Mode: No consensus reached, needs more discussion
 */
export function noConsensusJudgeResponse(
  guidance: string = 'Need more discussion on deployment strategy and testing approach'
): ProviderResponse {
  const response = {
    consensusReached: false,
    guidance
  };

  return makeResponse(JSON.stringify(response), 150, 100);
}

/**
 * Agent Discussion Response (Consensus Mode)
 * Simple text response during discussion rounds
 */
export function agentDiscussionResponse(
  content: string = 'I agree with the proposed approach, but suggest adding comprehensive error handling.'
): ProviderResponse {
  return makeResponse(content, 120, 180);
}

/**
 * Final Vote Response (Consensus Mode)
 * Judge provides final structured output after max rounds
 */
export function finalVoteResponse(
  solution: string = 'Hybrid approach with phased migration',
  keyDecisions: string[] = ['Start with current system', 'Migrate in stages'],
  dissent: string[] = ['Agent Y preferred immediate full migration']
): ProviderResponse {
  const response = {
    solution,
    keyDecisions,
    actionItems: ['Create migration roadmap', 'Establish success metrics', 'Plan rollback strategy'],
    dissent,
    confidence: 'MEDIUM'
  };

  return makeResponse(JSON.stringify(response), 180, 320);
}

/**
 * Tool Call Response
 * Agent making a tool call (e.g., reading a file)
 */
export function toolCallResponse(
  toolName: string = 'read_file',
  toolInput: Record<string, any> = { path: 'src/main.ts' }
): ProviderResponse {
  return {
    text: '',
    usage: { input_tokens: 100, output_tokens: 50 },
    tool_calls: [
      {
        id: 'call_123',
        name: toolName,
        input: toolInput
      }
    ]
  };
}

/**
 * Response after tool execution
 * Agent continues after receiving tool results
 */
export function postToolResponse(
  text: string = 'Based on the file contents, I recommend using async/await patterns.'
): ProviderResponse {
  return makeResponse(text, 150, 200);
}
