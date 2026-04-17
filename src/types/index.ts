/**
 * Type definitions for LLM Conclave
 */

// ============================================================================
// Message Types
// ============================================================================

export interface BaseMessage {
  role: string;
  content: string;
}

export interface UserMessage extends BaseMessage {
  role: 'user';
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  tool_calls?: ToolCall[];
}

export interface SystemMessage extends BaseMessage {
  role: 'system';
}

export interface ToolResultMessage {
  role: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type Message = UserMessage | AssistantMessage | SystemMessage | ToolResultMessage;

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}

export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  summary?: string;
}

export interface ToolExecution {
  agent: string;
  tool: string;
  input: Record<string, any>;
  success: boolean;
  summary: string;
}

// ============================================================================
// Provider Types
// ============================================================================

export interface ProviderResponse {
  text: string | null;
  tool_calls?: ToolCall[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ChatOptions {
  tools?: ToolDefinition[] | OpenAITool[];
  stream?: boolean;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

/**
 * Known JSON Schema type values
 */
export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

/**
 * JSON Schema property definition for OpenAI function parameters
 */
export interface JSONSchemaProperty {
  /** JSON Schema type - prefer using JSONSchemaType values */
  type: JSONSchemaType | string;
  description?: string;
  enum?: (string | number | boolean | null)[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * JSON Schema object for OpenAI function parameters
 */
export interface JSONSchemaParameters {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchemaParameters;
  };
}

/**
 * Interface for LLM provider instances.
 * This interface captures the public contract that all LLM providers must satisfy.
 * Used to avoid circular dependencies with the abstract LLMProvider class.
 */
export interface LLMProviderInterface {
  modelName: string;
  chat(messages: Message[], systemPrompt?: string | null, options?: ChatOptions): Promise<ProviderResponse>;
  getProviderName(): string;
  getModelName(): string;
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentConfig {
  model: string;
  prompt: string;
}

export interface Agent {
  name: string;
  provider: LLMProviderInterface;
  systemPrompt: string;
  model: string;
}

export interface AgentRole {
  type: 'decision_maker' | 'validator';
  domains: string[];
  speaksFirstFor: string[];
  critiquesAs: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ContextOptimizationConfig {
  enabled: boolean;
}

export interface Config {
  project_id?: string;
  turn_management: string;
  max_rounds: number;
  min_rounds?: number;
  /**
   * Phase 15.2 — Maximum turns a single agent may take per round in dynamic mode.
   * Default: 1. When all eligible agents hit this cap, runDynamicRound early-returns.
   * Additive only; MCP tool schema unchanged for callers omitting it.
   */
  maxTurnsPerAgentPerRound?: number;
  judge: {
    model: string;
    prompt: string;
  };
  agents: Record<string, AgentConfig>;
  created?: string;
  created_by?: string;
  contextOptimization?: ContextOptimizationConfig;
}

export interface DiscussionHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  speaker: string;
  model?: string;
  error?: true;
  errorDetails?: string;
  compressed?: true;
  positionSummary?: string;
  /** ISO 8601 timestamp indicating when this entry was added to the history */
  timestamp?: string;
  /**
   * Phase 18 (AUDIT-03): canonical round number stamped at push time.
   * Optional because legacy in-memory entries (pre-Phase-18 tests, fixtures)
   * may not set it. Production push sites in ConversationManager and
   * AgentTurnExecutor always set it after this phase.
   */
  roundNumber?: number;
}

// ============================================================================
// Orchestration Types
// ============================================================================

export interface TaskClassification {
  primaryAgent: string;
  taskType: string;
  confidence: number;
  reasoning: string;
  allScores?: Record<string, { score: number; matchedKeywords: string[] }>;
}

export interface Critique {
  agent: string;
  content: string;
}

export interface ValidationResult {
  validator: string;
  status: 'PASS' | 'FAIL' | 'NEEDS_REVISION';
  content: string;
}

/**
 * Phase 13 — Plan 04: single source of truth for confidence in discuss-mode runs.
 * `finalConfidence` is the reconciled output of machinery signals + judge self-report
 * (see src/core/ConfidenceReconciler.ts). All output formatters MUST read this field
 * instead of computing confidence independently — that disagreement was the Trollix
 * incident (header ABORTED / table LOW / body HIGH simultaneously).
 */
export type FinalConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DiscussionResult {
  task: string;
  rounds: number;
  maxRounds: number;
  minRounds: number;
  consensusReached: boolean;
  solution: string | null;
  keyDecisions: string[];
  actionItems: string[];
  dissent: string[];
  /** @deprecated — use `finalConfidence` (reconciled). Retained for session-file compatibility. */
  confidence: string;
  /** Reconciled confidence — single source of truth for all output formatters. */
  finalConfidence: FinalConfidence;
  /** Human-readable explanation of how finalConfidence was derived. */
  confidenceReasoning: string;
  conversationHistory: DiscussionHistoryEntry[];
  failedAgents: string[];
  failedAgentDetails: Record<string, { error: string; model: string }>;
  agentSubstitutions: Record<string, { original: string; fallback: string; reason: string }>;
  agents_config: Record<string, { model: string }>;
  turn_analytics: {
    per_agent: Array<{ name: string; turns: number; token_share_pct: number }>;
  };
  dissent_quality: 'captured' | 'missing' | 'not_applicable' | 'insufficient_data';
  cost: {
    totalCost: number;
    totalTokens: { input: number; output: number };
    totalCalls: number;
  };
  degraded?: boolean;
  degradedReason?: string;
  timedOut?: boolean;
}

export interface OrchestrationResult {
  task: string;
  classification: TaskClassification;
  primaryResponse: string;
  critiques: Critique[];
  revisedResponse: string;
  validations: ValidationResult[] | null;
  output: string;
  finalOutput: string;
  conversationHistory: ConversationHistoryEntry[];
  toolExecutions: ToolExecution[];
}

export interface ConversationHistoryEntry {
  phase: string;
  agent: string;
  content: string;
  role: string;
  status?: string;
}


export interface OrchestratorOptions {
  quiet?: boolean;
  onStatus?: (step: number, total: number, message: string) => void;
}

// ============================================================================
// Memory Types
// ============================================================================

export interface ProjectMetadata {
  projectId: string;
  createdAt: string;
  lastModified: string;
  totalConversations: number;
  totalDecisions: number;
}

export interface ConversationRecord {
  id: string;
  timestamp: string;
  topic: string;
  participants: string[];
  outcome: string;
  consensusReached: boolean;
}

export interface DecisionRecord {
  id: string;
  timestamp: string;
  topic: string;
  description: string;
  outcome: string;
  participants: string[];
  validators: string[];
  consensusReached: boolean;
}

// ============================================================================
// Project Scan Types
// ============================================================================

export interface ProjectScanResult {
  projectType: string | null;
  framework: string | null;
  structure: string[];
  keyFiles: KeyFile[];
  domains: string[];
  summary: string;
}

export interface KeyFile {
  name: string;
  content: string;
  isAIDoc: boolean;
}

// ============================================================================
// Session & Resume Types
// ============================================================================

export interface SessionManifest {
  // Identity
  id: string;
  timestamp: string;

  // Configuration
  mode: 'consensus' | 'orchestrated' | 'iterative';
  task: string;
  agents: SessionAgentConfig[];
  judge?: SessionAgentConfig;

  // State
  status: 'in_progress' | 'completed' | 'interrupted' | 'error';
  currentRound: number;
  maxRounds?: number;
  minRounds?: number;

  // Content
  conversationHistory: SessionMessage[];
  projectContext?: string;

  // Mode-specific state
  iterativeState?: IterativeSessionState;
  orchestratedState?: OrchestratedSessionState;

  // Results
  consensusReached?: boolean;
  finalSolution?: string;
  turn_analytics?: {
    per_agent: Array<{ name: string; turns: number; token_share_pct: number }>;
  };
  dissent_quality?: 'captured' | 'missing' | 'not_applicable' | 'insufficient_data';

  // Phase 12-02: agent model substitutions (e.g., GPT-4o → claude-sonnet-4-5
  // after a 429). Always present (empty object when no substitutions occurred)
  // so downstream consumers don't need to disambiguate undefined/null/empty.
  agentSubstitutions: Record<string, { original: string; fallback: string; reason: string }>;

  // Metadata
  cost: SessionCostInfo;

  // Lineage (for branching/continuation)
  parentSessionId?: string;
  branchPoint?: number;

  // File paths
  outputFiles: SessionOutputFiles;

  /**
   * AUDIT-04: Absolute path to the resolved LLM Conclave data root at the
   * time this manifest was saved. Matches `getConclaveHome()` output —
   * reflects the `LLM_CONCLAVE_HOME` env var or `conclaveHome` config key
   * if either was set, otherwise the default `~/.llm-conclave`.
   * Optional for backward compatibility with pre-Phase-19 session.json files.
   */
  conclaveHome?: string;
}

export interface SessionAgentConfig {
  name: string;
  model: string;
  provider: string;
  systemPrompt: string;
}

export interface SessionMessage {
  role: 'system' | 'user' | 'assistant' | 'judge' | 'tool_result';
  content: string;
  speaker?: string;
  model?: string;
  timestamp: string;
  roundNumber: number;

  // Tool usage
  tool_calls?: ToolCall[];

  // Metadata
  tokens?: { input: number; output: number };
  cost?: number;
  latency?: number;

  // Resume context
  isContinuation?: boolean;
  continuationContext?: string;
  error?: boolean;
}

export interface IterativeSessionState {
  currentChunk: number;
  totalChunks: number;
  agentNotes: Record<string, string>;
  sharedOutput: string;
}

export interface OrchestratedSessionState {
  toolExecutions: ToolExecution[];
  fileStates: Record<string, FileSnapshot>;
}

export interface FileSnapshot {
  path: string;
  contentHash: string;
  timestamp: string;
}

export interface SessionCostInfo {
  totalCost: number;
  totalTokens: { input: number; output: number };
  totalCalls: number;
  averageLatency?: number;
}

export interface SessionOutputFiles {
  transcript: string;
  consensus?: string;
  json: string;
  agentNotes?: string[];
  sharedOutput?: string;
}

export interface SessionSummary {
  id: string;
  timestamp: string;
  mode: string;
  task: string;
  status: string;
  roundCount: number;
  agentCount: number;
  cost: number;
  parentSessionId?: string;
  consensusReached?: boolean;
}

export interface SessionIndexManifest {
  sessions: SessionSummary[];
  lastCleanup?: string;
  totalSessions: number;
}

export interface ContinuationOptions {
  resetDiscussion?: boolean;
  forceConsensus?: boolean;
  includeFullHistory?: boolean;
  models?: string[];
}

export interface ResumableSession {
  session: SessionManifest;
  isValid: boolean;
  warnings: string[];
}

export interface SessionListFilters {
  mode?: string;
  status?: string;
  since?: Date;
  limit?: number;
}

// ============================================================================
// Phase 13.1 — Run Integrity
// ============================================================================

export interface SummarizerFallbackInfo {
  original: string;
  substitute: string;
  reason: string;
}

export interface RunIntegrityCompression {
  active: boolean;
  activatedAtRound: number | null;
  tailSize: number;
  summaryRegenerations: number;
  summarizerFallback: SummarizerFallbackInfo | null;
}

export type ParticipationStatus =
  | 'spoken'
  | 'absent-capped'
  | 'absent-silent'
  | 'absent-failed';

export interface ParticipationEntry {
  agent: string;
  turns: number;
  status: ParticipationStatus;
  rounds?: number[];
  ratioAtExclusion?: number;
  reason?: string;
}

export interface RunIntegrity {
  compression: RunIntegrityCompression;
  participation: ParticipationEntry[];
}

// Event payloads — see .planning/phases/13.1.../13.1-CONTEXT.md D-11..D-14
export interface HistoryCompressedPayload {
  round: number;
  messagesCompressed: number;
  tailSize: number;
  summaryLengthTokens: number;
  cumulativeRegenerations: number;
}

export interface HistoryCompressionFailedPayload {
  round: number;
  error: string;
  fallbackAction: 'serve-uncompressed' | 'truncate-hard';
}

export interface AgentAbsentPayload {
  agentName: string;
  status: 'capped' | 'silent' | 'failed';
  rounds: number[];
  reason: string;
}

export interface SummarizerFallbackPayload {
  round: number;
  originalModel: string;
  substituteModel: string;
  reason: string;
}

export * from './consult';
