/**
 * Shared test fixtures for provider contract tests.
 * Canonical message sequences in internal (Anthropic-like) format.
 */
import { Message, ToolCall, ToolDefinition } from '../../types';

// ============================================================================
// Simple Messages
// ============================================================================

export const simpleUserMessage: Message = {
  role: 'user',
  content: 'Hello, how are you?',
};

export const simpleAssistantMessage: Message = {
  role: 'assistant',
  content: 'I am doing well, thank you!',
};

export const systemMessage: Message = {
  role: 'system',
  content: 'You are a helpful assistant.',
};

export const emptyContentAssistant: Message = {
  role: 'assistant',
  content: '',
};

// ============================================================================
// Tool Call Messages
// ============================================================================

export const assistantWithToolCalls: Message = {
  role: 'assistant',
  content: 'Let me read that file for you.',
  tool_calls: [
    { id: 'call_001', name: 'read_file', input: { path: '/tmp/test.txt' } },
  ],
} as any;

export const assistantWithMultipleToolCalls: Message = {
  role: 'assistant',
  content: '',
  tool_calls: [
    { id: 'call_001', name: 'read_file', input: { path: '/tmp/a.txt' } },
    { id: 'call_002', name: 'read_file', input: { path: '/tmp/b.txt' } },
  ],
} as any;

export const assistantWithToolCallsNoText: Message = {
  role: 'assistant',
  content: '',
  tool_calls: [
    { id: 'call_003', name: 'write_file', input: { path: '/tmp/out.txt', content: 'hello' } },
  ],
} as any;

export const toolResult: Message = {
  role: 'tool_result',
  tool_use_id: 'call_001',
  content: 'File contents here',
} as any;

export const toolResultJson: Message = {
  role: 'tool_result',
  tool_use_id: 'call_001',
  content: '{"key": "value"}',
} as any;

export const toolResultNonString: Message = {
  role: 'tool_result',
  tool_use_id: 'call_001',
  content: JSON.stringify({ nested: { data: true } }),
} as any;

export const multipleToolResults: Message[] = [
  { role: 'tool_result', tool_use_id: 'call_001', content: 'Result A' } as any,
  { role: 'tool_result', tool_use_id: 'call_002', content: 'Result B' } as any,
];

// ============================================================================
// Canonical Sequences (for round-trip tests)
// ============================================================================

/** User -> Assistant with tools -> Tool results -> Assistant */
export const fullToolSequence: Message[] = [
  simpleUserMessage,
  assistantWithToolCalls,
  toolResult,
  simpleAssistantMessage,
];

/** User -> Assistant with multiple tools -> Multiple results -> Assistant */
export const multiToolSequence: Message[] = [
  simpleUserMessage,
  assistantWithMultipleToolCalls,
  ...multipleToolResults,
  simpleAssistantMessage,
];

/** System -> User -> Assistant (simple conversation) */
export const simpleConversation: Message[] = [
  systemMessage,
  simpleUserMessage,
  simpleAssistantMessage,
];

// ============================================================================
// Tool Definitions
// ============================================================================

/** Anthropic-format tool definition */
export const anthropicToolDef: ToolDefinition = {
  name: 'read_file',
  description: 'Read a file from the filesystem',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
    },
    required: ['path'],
  },
};

/** OpenAI-format tool definition */
export const openaiToolDef = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a file from the filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
  },
};

export const multipleToolDefs: ToolDefinition[] = [
  anthropicToolDef,
  {
    name: 'write_file',
    description: 'Write content to a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
];
