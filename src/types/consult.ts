/**
 * Type definitions for Consult Mode (4-Round Multi-Model Consultation)
 *
 * This module defines the TypeScript interfaces for the consultation engine.
 * Note: JSON output uses snake_case, TypeScript uses camelCase.
 * Use ArtifactTransformer for conversion between formats.
 */

// ============================================================================
// State Machine Types
// ============================================================================

export enum ConsultState {
  Idle = 'idle',
  Estimating = 'estimating',
  AwaitingConsent = 'awaiting_consent',
  Independent = 'independent',
  Synthesis = 'synthesis',
  CrossExam = 'cross_exam',
  Verdict = 'verdict',
  Complete = 'complete',
  Aborted = 'aborted'
}

// ============================================================================
// Core Artifact Types (TypeScript - camelCase)
// ============================================================================

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface AgentResponse {
  agentId: string;
  agentName: string;
  model: string;
  provider: string;
  content: string;
  tokens: TokenUsage;
  durationMs: number;
  timestamp: string;
  error?: string;
  provider_error?: string; // NEW: For failed agents
}

export interface ProviderSubstitution {
  agent_id: string;
  original_provider: string;
  substitute_provider: string;
  reason: 'timeout' | 'failure' | 'health_check';
  timestamp: Date;
}

export interface AgentPerspective {
  agent: string;
  model: string;
  opinion: string;
}

// ============================================================================
// Round 1: Independent Analysis Artifact (TypeScript - camelCase)
// ============================================================================

export interface IndependentArtifact {
  artifactType: 'independent';
  schemaVersion: string;
  agentId: string;
  roundNumber: number;
  position: string;
  keyPoints: string[];
  rationale: string;
  confidence: number;
  proseExcerpt: string;
  createdAt: string;
}

// ============================================================================
// Round 2: Synthesis Artifact (TypeScript - camelCase)
// ============================================================================

export interface ConsensusPoint {
  point: string;
  supportingAgents: string[];
  confidence: number;
}

export interface Tension {
  topic: string;
  viewpoints: {
    agent: string;
    viewpoint: string;
  }[];
}

export interface SynthesisArtifact {
  artifactType: 'synthesis';
  schemaVersion: string;
  roundNumber: number;
  consensusPoints: ConsensusPoint[];
  tensions: Tension[];
  priorityOrder: string[];
  createdAt: string;
}

// ============================================================================
// Round 3: Cross-Examination Artifact (TypeScript - camelCase)
// ============================================================================

export interface Challenge {
  challenger: string;
  targetAgent: string;
  challenge: string;
  evidence: string[];
}

export interface Rebuttal {
  agent: string;
  rebuttal: string;
}

export interface CrossExamArtifact {
  artifactType: 'cross_exam';
  schemaVersion: string;
  roundNumber: number;
  challenges: Challenge[];
  rebuttals: Rebuttal[];
  unresolved: string[];
  createdAt: string;
}

// ============================================================================
// Round 4: Verdict Artifact (TypeScript - camelCase)
// ============================================================================

export interface Dissent {
  agent: string;
  concern: string;
  severity: 'high' | 'medium' | 'low';
}

export interface VerdictArtifact {
  artifactType: 'verdict';
  schemaVersion: string;
  roundNumber: number;
  recommendation: string;
  confidence: number;
  evidence: string[];
  dissent: Dissent[];
  createdAt: string;
}

// ============================================================================
// Consultation Result (TypeScript - camelCase)
// ============================================================================

export interface ConsultationResult {
  consultationId: string;
  timestamp: string;
  question: string;
  context: string;
  mode: 'explore' | 'converge';

  // Agents
  agents: {
    name: string;
    model: string;
    provider: string;
  }[];
  agentResponses?: AgentResponse[];

  // State and Rounds
  state: ConsultState;
  rounds: number;
  completedRounds: number;

  // Round Artifacts
  responses: {
    round1?: IndependentArtifact[];
    round2?: SynthesisArtifact;
    round3?: CrossExamArtifact;
    round4?: VerdictArtifact;
  };

  // Final Results
  consensus: string;
  confidence: number;
  recommendation: string;
  reasoning: Record<string, string>;
  concerns: string[];
  dissent: Dissent[];
  perspectives: AgentPerspective[];

  // Substitutions (Epic 2, Story 3)
  substitutions?: ProviderSubstitution[];

  // Metadata
  cost: CostSummary;
  durationMs: number;
  promptVersions: PromptVersions;

  // Early termination
  earlyTermination?: boolean;
  earlyTerminationReason?: string;

  // Abort reason
  abortReason?: string;

  // Pulse tracking (Epic 2, Story 4)
  pulseTriggered?: boolean;
  userCancelledAfterPulse?: boolean;
  pulseTimestamp?: string;

  // Cost tracking (Epic 2, Story 1)
  estimatedCost?: number;
  actualCost?: number;
  costExceeded?: boolean;

  // Partial results (Epic 2, Story 5)
  status?: 'complete' | 'partial' | 'aborted'; // Explicit status for file format
  completedRoundNames?: string[]; // ["Round1", "Round2"]
  incompleteRoundNames?: string[]; // ["Round3"]
  partialAgents?: AgentResponse[]; // In-progress agents
  cancellationReason?: string;
  signature?: string; // Cryptographic signature
}

export interface PartialConsultationResult extends ConsultationResult {
  status: 'partial';
  cancellationReason?: string;
}

export interface CostSummary {
  tokens: TokenUsage;
  usd: number;
  breakdown?: {
    [provider: string]: {
      tokens: TokenUsage;
      usd: number;
    };
  };
}

export interface PromptVersions {
  mode: 'explore' | 'converge';
  independentPromptVersion: string;
  synthesisPromptVersion: string;
  crossExamPromptVersion: string;
  verdictPromptVersion: string;
}

// ============================================================================
// Metrics Types (TypeScript - camelCase)
// ============================================================================

export interface ConsultMetrics {
  // Usage metrics
  totalConsultations: number;
  dateRange: {
    start: string;
    end: string;
    totalDays: number;
  };
  activeDays: number;
  avgPerDay: number;
  byState: {
    completed: number;
    aborted: number;
  };

  // Performance metrics
  performance: {
    p50: number;
    p95: number;
    p99: number;
    avgDuration: number;
    fastest: { id: string; durationMs: number };
    slowest: { id: string; durationMs: number };
  };

  // Cost metrics
  cost: {
    total: number;
    avgPerConsultation: number;
    totalTokens: number;
    byProvider: {
      [provider: string]: {
        cost: number;
        tokens: number;
      };
    };
    mostExpensive: { id: string; cost: number };
    cheapest: { id: string; cost: number };
  };

  // Quality metrics
  quality: {
    avgConfidence: number;
    highConfidence: number; // count >= 0.85
    lowConfidence: number; // count < 0.70
    withDissent: number;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ConsultConfig {
  alwaysAllowUnder?: number; // USD threshold for auto-approval
  confidenceThreshold?: number; // For early termination
  defaultMode?: 'explore' | 'converge';
}

// ============================================================================
// State Transition Types
// ============================================================================

export interface StateTransition {
  from: ConsultState;
  to: ConsultState;
  timestamp: string;
  reason?: string;
}

// ============================================================================
// Provider Health Types
// ============================================================================

export interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastChecked: string;
  latencyMs: number;
  errorRate: number;
  consecutiveFailures: number;
}

// ============================================================================
// Event Payload Types (TypeScript - camelCase)
// ============================================================================

export interface ConsultationStartedPayload {
  consultationId: string;
  question: string;
  agents: { name: string; model: string; provider: string }[];
  mode: 'explore' | 'converge';
}

export interface ConsultationCostEstimatedPayload {
  consultationId: string;
  estimatedCost: number;
  inputTokens: number;
  expectedOutputTokens: number;
}

export interface ConsultationUserConsentPayload {
  consultationId: string;
  approved: boolean;
  reason?: string;
}

export interface ConsultationRoundArtifactPayload {
  consultationId: string;
  roundNumber: number;
  artifactType: 'independent' | 'synthesis' | 'cross_exam' | 'verdict';
  artifact: IndependentArtifact | SynthesisArtifact | CrossExamArtifact | VerdictArtifact;
}

export interface ConsultationProviderSubstitutedPayload {
  consultationId: string;
  agentId: string;
  originalProvider: string;
  substituteProvider: string;
  reason: 'timeout' | 'failure' | 'health_check';
}

export interface ConsultationCompletedPayload {
  consultationId: string;
  result: ConsultationResult;
}

export interface HealthCheckStartedPayload {
  providers: string[];
}

export interface HealthStatusUpdatedPayload {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
}

export interface CostGateTriggeredPayload {
  consultationId: string;
  estimatedCost: number;
  threshold: number;
  requiresConsent: boolean;
}

// ============================================================================
// Output Formatting Types
// ============================================================================

export enum OutputFormat {
  Markdown = 'markdown',
  JSON = 'json',
  Both = 'both'
}

export interface IOutputFormatter {
  format(result: ConsultationResult): string;
}
