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

export interface Config {
  project_id?: string;
  turn_management: string;
  max_rounds: number;
  judge: {
    model: string;
    prompt: string;
  };
  agents: Record<string, AgentConfig>;
  created?: string;
  created_by?: string;
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
// Init Types
// ============================================================================

export interface InteractiveInitOptions {
  projectName?: string;
  overwrite?: boolean;
  scan?: boolean;
  noScan?: boolean;
  scanTimeout?: number;
}

export interface GeneratedAgent {
  name: string;
  model: string;
  prompt: string;
  type: 'decision_maker' | 'validator';
  role: string;
  domains: string[];
}

export interface AgentGenerationResult {
  agents: GeneratedAgent[];
  reasoning: string;
}

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
// API Key Detection
// ============================================================================

export interface ProviderAvailability {
  provider: string;
  model: string;
  available: boolean;
  priority: number;
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

  // Content
  conversationHistory: SessionMessage[];
  projectContext?: string;

  // Mode-specific state
  iterativeState?: IterativeSessionState;
  orchestratedState?: OrchestratedSessionState;

  // Results
  consensusReached?: boolean;
  finalSolution?: string;

  // Metadata
  cost: SessionCostInfo;

  // Lineage (for branching/continuation)
  parentSessionId?: string;
  branchPoint?: number;

  // File paths
  outputFiles: SessionOutputFiles;
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

export * from './consult';
