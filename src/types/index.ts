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
}

export interface ChatOptions {
  tools?: ToolDefinition[] | OpenAITool[];
  stream?: boolean;
  onToken?: (token: string) => void;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
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
  provider: any; // LLMProvider instance
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
