import IterativeCollaborativeOrchestrator from '../IterativeCollaborativeOrchestrator';
import ToolRegistry from '../../tools/ToolRegistry';
import { Agent } from '../../types';

// Mock fs to avoid filesystem writes during tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(''),
  appendFileSync: jest.fn(),
}));

// Mock ProviderFactory for fallback tests
jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: {
    createProvider: jest.fn().mockImplementation((model: string) => ({
      chat: jest.fn().mockResolvedValue({ text: `Fallback response from ${model}` }),
      getProviderName: jest.fn().mockReturnValue('MockProvider'),
    })),
  },
}));

function createMockAgent(name: string, model: string = 'gpt-4o'): Agent {
  return {
    name,
    model,
    provider: {
      chat: jest.fn().mockResolvedValue({ text: `Response from ${name}` }),
      getProviderName: jest.fn().mockReturnValue('OpenAI'),
    } as any,
    systemPrompt: `You are ${name}`,
  };
}

function createOrchestrator(options: any = {}) {
  const agents = options.agents || [
    createMockAgent('Agent1', 'gpt-4o'),
    createMockAgent('Agent2', 'claude-sonnet-4-5'),
  ];
  const judge = options.judge || createMockAgent('Judge', 'gpt-4o');

  return new IterativeCollaborativeOrchestrator(
    agents,
    judge,
    new ToolRegistry(),
    {
      chunkSize: 3,
      maxRoundsPerChunk: 2,
      outputDir: '/tmp/test-iterative',
      ...options,
    }
  );
}

describe('IterativeCollaborativeOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseLineNumbersFromDescription', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should parse single line "Line 5"', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Line 5');
      expect(result).toEqual([5]);
    });

    it('should parse range "Lines 5-7"', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Lines 5-7');
      expect(result).toEqual([5, 6, 7]);
    });

    it('should parse range with en-dash "Lines 10–15"', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Lines 10–15');
      expect(result).toEqual([10, 11, 12, 13, 14, 15]);
    });

    it('should parse range with "to" "Lines 1 to 3"', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Lines 1 to 3');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return null for non-matching descriptions', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Introduction section');
      expect(result).toBeNull();
    });

    it('should handle case insensitivity', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('line 42');
      expect(result).toEqual([42]);
    });
  });

  describe('enrichChunksWithLineContent', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;
    const projectContext = '# Project Context\n\nFile: test.txt\n\n```\nLine one content\nLine two content\nLine three content\nLine four content\nLine five content\nLine six content\n```';

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should enrich single line chunks', () => {
      const chunks = [
        { description: 'Line 1', details: 'Fix errors' },
        { description: 'Line 3', details: 'Fix errors' },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);

      expect(enriched[0].lineContent).toBe('Line one content');
      expect(enriched[0].lineNumbers).toEqual([1]);
      expect(enriched[1].lineContent).toBe('Line three content');
      expect(enriched[1].lineNumbers).toEqual([3]);
    });

    it('should enrich range chunks "Lines 1-3"', () => {
      const chunks = [
        { description: 'Lines 1-3', details: 'Fix errors' },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);

      expect(enriched[0].lineContent).toBe('Line one content\nLine two content\nLine three content');
      expect(enriched[0].lineNumbers).toEqual([1, 2, 3]);
    });

    it('should use startLine/endLine when present', () => {
      const chunks = [
        { description: 'First section', details: 'Fix errors', startLine: 2, endLine: 4 },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);

      expect(enriched[0].lineContent).toBe('Line two content\nLine three content\nLine four content');
      expect(enriched[0].lineNumbers).toEqual([2, 3, 4]);
    });

    it('should not overwrite existing lineContent', () => {
      const chunks = [
        { description: 'Line 1', details: 'Fix', lineContent: 'already set' },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);
      expect(enriched[0].lineContent).toBe('already set');
    });

    it('should return chunks unchanged without projectContext', () => {
      const chunks = [{ description: 'Line 1', details: 'Fix' }];
      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, undefined);
      expect(enriched[0].lineContent).toBeUndefined();
    });

    it('should handle chunks with no matching description gracefully', () => {
      const chunks = [
        { description: 'Introduction section', details: 'Review' },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);
      expect(enriched[0].lineContent).toBeUndefined();
    });
  });

  describe('getFallbackModel', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should fall back Claude → gpt-4o-mini', () => {
      expect((orchestrator as any).getFallbackModel('claude-sonnet-4-5')).toBe('gpt-4o-mini');
      expect((orchestrator as any).getFallbackModel('claude-opus-4')).toBe('gpt-4o-mini');
    });

    it('should fall back Gemini → gpt-4o-mini', () => {
      expect((orchestrator as any).getFallbackModel('gemini-2.5-pro')).toBe('gpt-4o-mini');
    });

    it('should fall back GPT → claude-sonnet-4-5', () => {
      expect((orchestrator as any).getFallbackModel('gpt-4o')).toBe('claude-sonnet-4-5');
      expect((orchestrator as any).getFallbackModel('gpt-4o-mini')).toBe('claude-sonnet-4-5');
    });

    it('should fall back Grok → claude-sonnet-4-5', () => {
      expect((orchestrator as any).getFallbackModel('grok-beta')).toBe('claude-sonnet-4-5');
    });

    it('should fall back reasoning models → claude-sonnet-4-5', () => {
      expect((orchestrator as any).getFallbackModel('o1-preview')).toBe('claude-sonnet-4-5');
      expect((orchestrator as any).getFallbackModel('o3-mini')).toBe('claude-sonnet-4-5');
    });
  });

  describe('circuit breaker', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should disable agent after 2 consecutive failures', () => {
      (orchestrator as any).recordFailure('Agent1', 'rate limit');
      expect(orchestrator.disabledAgents.has('Agent1')).toBe(false);

      (orchestrator as any).recordFailure('Agent1', 'rate limit again');
      expect(orchestrator.disabledAgents.has('Agent1')).toBe(true);
    });

    it('should reset failure count on success', () => {
      (orchestrator as any).recordFailure('Agent1', 'rate limit');
      expect(orchestrator.consecutiveFailures.get('Agent1')).toBe(1);

      (orchestrator as any).recordSuccess('Agent1');
      expect(orchestrator.consecutiveFailures.get('Agent1')).toBe(0);
    });

    it('should not disable agent after success between failures', () => {
      (orchestrator as any).recordFailure('Agent1', 'rate limit');
      (orchestrator as any).recordSuccess('Agent1');
      (orchestrator as any).recordFailure('Agent1', 'rate limit');
      expect(orchestrator.disabledAgents.has('Agent1')).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should detect 429 rate limit errors', () => {
      expect((orchestrator as any).isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
      expect((orchestrator as any).isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
    });

    it('should detect server errors', () => {
      expect((orchestrator as any).isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
      expect((orchestrator as any).isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
    });

    it('should not detect client errors as retryable', () => {
      expect((orchestrator as any).isRetryableError(new Error('400 Bad Request'))).toBe(false);
      expect((orchestrator as any).isRetryableError(new Error('Invalid API key'))).toBe(false);
    });
  });

  describe('chatWithFallback', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should return primary response when successful', async () => {
      const mockProvider = {
        chat: jest.fn().mockResolvedValue({ text: 'Primary response' }),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      const result = await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
      );

      expect(result.text).toBe('Primary response');
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    });

    it('should fall back on retryable error', async () => {
      const mockProvider = {
        chat: jest.fn().mockRejectedValue(new Error('429 Too Many Requests')),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      const result = await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
      );

      // Should get fallback response
      expect(result.text).toContain('Fallback response');
    });

    it('should not fall back on non-retryable error', async () => {
      const mockProvider = {
        chat: jest.fn().mockRejectedValue(new Error('Invalid API key')),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      await expect(
        (orchestrator as any).chatWithFallback(
          mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
        )
      ).rejects.toThrow('Invalid API key');
    });

    it('should not use same fallback twice for same caller within a chunk', async () => {
      const mockProvider = {
        chat: jest.fn().mockRejectedValue(new Error('429 rate limit')),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      // First call — fallback succeeds
      await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
      );

      // Second call — same fallback already used, should throw
      await expect(
        (orchestrator as any).chatWithFallback(
          mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
        )
      ).rejects.toThrow('429 rate limit');
    });

    it('should allow fallback again after usedFallbacks is cleared (new chunk)', async () => {
      const mockProvider = {
        chat: jest.fn().mockRejectedValue(new Error('429 rate limit')),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      // First call — fallback used
      await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
      );

      // Simulate new chunk boundary — clear used fallbacks
      orchestrator.usedFallbacks.clear();

      // Should succeed again with fallback
      const result = await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', [], 'system', {}, 'TestAgent'
      );
      expect(result.text).toContain('Fallback response');
    });

    it('should rebuild tool schemas AND convert messages for fallback provider', async () => {
      const ProviderFactory = require('../../providers/ProviderFactory').default;

      // Track what the fallback provider receives
      const fallbackChatMock = jest.fn().mockResolvedValue({ text: 'Fallback response' });

      // Make fallback provider report as Claude (Anthropic format)
      ProviderFactory.createProvider.mockImplementation((model: string) => ({
        chat: fallbackChatMock,
        getProviderName: jest.fn().mockReturnValue('Claude'),
      }));

      // Primary provider is OpenAI-family and fails
      const mockProvider = {
        chat: jest.fn().mockRejectedValue(new Error('429 rate limit')),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      // Raw messages in Anthropic format (tool_result with tool_use_id)
      const rawMessages = [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc_1', name: 'read_file', input: { path: 'f.txt' } }] },
        { role: 'tool_result', tool_use_id: 'tc_1', content: 'file contents' },
      ];

      const chatOptions = { tools: [{ name: 'read_file' }] };

      const result = await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', rawMessages, 'system', chatOptions, 'ToolAgent'
      );

      expect(result.text).toBe('Fallback response');

      // Verify fallback provider received Anthropic-format messages (not OpenAI-converted)
      const receivedMessages = fallbackChatMock.mock.calls[0][0];
      // tool_result should stay as tool_result (Anthropic format), NOT converted to role:'tool'
      const toolResultMsg = receivedMessages.find((m: any) => m.role === 'tool_result');
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.tool_use_id).toBe('tc_1');

      // Tools should be Anthropic format (from getAnthropicTools), not OpenAI format
      const receivedOptions = fallbackChatMock.mock.calls[0][2];
      expect(receivedOptions.tools).toBeDefined();

      // Original chatOptions should not be mutated
      expect(chatOptions.tools[0].name).toBe('read_file');
    });

    it('should convert messages to OpenAI format when primary is OpenAI', async () => {
      // Primary is OpenAI — chatWithFallback should convert messages before sending
      const primaryChatMock = jest.fn().mockResolvedValue({ text: 'Primary response' });
      const mockProvider = {
        chat: primaryChatMock,
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      };

      const rawMessages = [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc_1', name: 'read_file', input: { path: 'f.txt' } }] },
        { role: 'tool_result', tool_use_id: 'tc_1', content: 'file contents' },
      ];

      await (orchestrator as any).chatWithFallback(
        mockProvider, 'gpt-4o', rawMessages, 'system', {}, 'Agent'
      );

      // Verify messages were converted to OpenAI format
      const receivedMessages = primaryChatMock.mock.calls[0][0];
      const toolMsg = receivedMessages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg.tool_call_id).toBe('tc_1');
    });
  });

  // === Adversarial review cases ===

  describe('parseLineNumbersFromDescription (adversarial)', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should return null for reversed range "Lines 10-2"', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Lines 10-2');
      expect(result).toBeNull();
    });

    it('should return null for zero start "Lines 0-5"', () => {
      const result = (orchestrator as any).parseLineNumbersFromDescription('Lines 0-5');
      expect(result).toBeNull();
    });

    it('should not match "to" as part of character class', () => {
      // With the old [-–to]+ regex, "Lines 5total" could match "5t" as separator
      // The new (?:-|–|to) regex should not match this
      const result = (orchestrator as any).parseLineNumbersFromDescription('Lines 5total garbage');
      // Should match as single "Line 5" not a range
      expect(result).toEqual([5]);
    });
  });

  describe('enrichChunksWithLineContent (adversarial)', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;
    const projectContext = '# Project Context\n\nFile: test.txt\n\n```\nLine one\nLine two\nLine three\n```';

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should handle reversed startLine/endLine gracefully', () => {
      const chunks = [
        { description: 'Bad range', details: 'Fix', startLine: 5, endLine: 2 },
      ];

      // Should not crash with RangeError — invalid bounds are skipped
      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);
      expect(enriched[0].lineContent).toBeUndefined();
    });

    it('should handle startLine=0 gracefully', () => {
      const chunks = [
        { description: 'Zero start', details: 'Fix', startLine: 0, endLine: 3 },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);
      expect(enriched[0].lineContent).toBeUndefined();
    });

    it('should handle NaN startLine gracefully', () => {
      const chunks = [
        { description: 'NaN', details: 'Fix', startLine: 'abc', endLine: 3 },
      ];

      const enriched = (orchestrator as any).enrichChunksWithLineContent(chunks, projectContext);
      // NaN startLine should be treated as no startLine
      expect(enriched[0].lineContent).toBeUndefined();
    });
  });

  describe('circuit breaker recovery', () => {
    let orchestrator: IterativeCollaborativeOrchestrator;

    beforeEach(() => {
      orchestrator = createOrchestrator();
    });

    it('should re-enable disabled agents after resetCircuitBreakers()', () => {
      (orchestrator as any).recordFailure('Agent1', 'error');
      (orchestrator as any).recordFailure('Agent1', 'error again');
      expect(orchestrator.disabledAgents.has('Agent1')).toBe(true);

      (orchestrator as any).resetCircuitBreakers();

      expect(orchestrator.disabledAgents.has('Agent1')).toBe(false);
      expect(orchestrator.consecutiveFailures.get('Agent1')).toBeUndefined();
    });

    it('should clear all failure counts on reset', () => {
      (orchestrator as any).recordFailure('Agent1', 'error');
      (orchestrator as any).recordFailure('Agent2', 'error');

      (orchestrator as any).resetCircuitBreakers();

      expect(orchestrator.consecutiveFailures.size).toBe(0);
    });
  });

  describe('planChunks post-processing validation', () => {
    it('should strip invalid LLM bounds (reversed, NaN, negative)', () => {
      // Simulate what planChunks post-processing does with untyped LLM JSON
      const chunks: any[] = [
        { description: 'Lines 1-3', startLine: 1, endLine: 3 },       // valid
        { description: 'Lines 5-2', startLine: 5, endLine: 2 },       // reversed
        { description: 'Bad', startLine: 'abc', endLine: 3 },         // NaN
        { description: 'Neg', startLine: -1, endLine: 3 },            // negative
      ];

      // Replicate the validation logic from planChunks
      for (const chunk of chunks) {
        if (chunk.startLine != null) chunk.startLine = parseInt(chunk.startLine, 10);
        if (chunk.endLine != null) chunk.endLine = parseInt(chunk.endLine, 10);

        if (isNaN(chunk.startLine) || isNaN(chunk.endLine) ||
            chunk.startLine < 1 || chunk.endLine < 1 ||
            chunk.endLine < chunk.startLine) {
          delete chunk.startLine;
          delete chunk.endLine;
        }
      }

      expect(chunks[0].startLine).toBe(1);  // valid - kept
      expect(chunks[0].endLine).toBe(3);
      expect(chunks[1].startLine).toBeUndefined();  // reversed - stripped
      expect(chunks[2].startLine).toBeUndefined();  // NaN - stripped
      expect(chunks[3].startLine).toBeUndefined();  // negative - stripped
    });
  });
});
