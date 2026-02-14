import OpenAIProvider from '../OpenAIProvider';
import {
  simpleUserMessage,
  simpleAssistantMessage,
  assistantWithToolCalls,
  toolResult,
  toolResultNonString,
  fullToolSequence,
} from './fixtures';

describe('OpenAIProvider', () => {
  describe('convertMessagesToOpenAIFormat', () => {
    it('passes through simple user and assistant messages', () => {
      const result = OpenAIProvider.convertMessagesToOpenAIFormat([simpleUserMessage, simpleAssistantMessage]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: simpleUserMessage.content });
      expect(result[1]).toEqual({ role: 'assistant', content: simpleAssistantMessage.content });
    });

    it('converts tool_result to role:tool with tool_call_id', () => {
      const result = OpenAIProvider.convertMessagesToOpenAIFormat([toolResult]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: (toolResult as any).tool_use_id,
        content: toolResult.content,
      });
    });

    it('handles tool_result content as string', () => {
      const result = OpenAIProvider.convertMessagesToOpenAIFormat([toolResultNonString]);

      expect(result[0].role).toBe('tool');
      expect(typeof result[0].content).toBe('string');
    });

    it('converts assistant with tool_calls to OpenAI function call format', () => {
      const result = OpenAIProvider.convertMessagesToOpenAIFormat([assistantWithToolCalls]);
      const tc = (assistantWithToolCalls as any).tool_calls[0];

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      expect(result[0].content).toBe(assistantWithToolCalls.content);
      expect(result[0].tool_calls).toHaveLength(1);
      expect(result[0].tool_calls[0]).toEqual({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      });
    });

    it('ensures tool call arguments are JSON strings', () => {
      const result = OpenAIProvider.convertMessagesToOpenAIFormat([assistantWithToolCalls]);

      const args = result[0].tool_calls[0].function.arguments;
      expect(typeof args).toBe('string');
      // Verify it's parseable back
      const parsed = JSON.parse(args);
      expect(parsed).toEqual((assistantWithToolCalls as any).tool_calls[0].input);
    });

    it('handles full round-trip sequence', () => {
      const result = OpenAIProvider.convertMessagesToOpenAIFormat(fullToolSequence);

      expect(result).toHaveLength(4);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
      expect(result[1].tool_calls).toBeDefined();
      expect(result[2].role).toBe('tool');
      expect(result[2].tool_call_id).toBeDefined();
      expect(result[3].role).toBe('assistant');
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON', () => {
      expect(OpenAIProvider.safeJsonParse('{"key":"value"}')).toEqual({ key: 'value' });
    });

    it('returns default fallback for invalid JSON', () => {
      expect(OpenAIProvider.safeJsonParse('not json')).toEqual({});
    });

    it('returns custom fallback on failure', () => {
      const fallback = { error: true };
      expect(OpenAIProvider.safeJsonParse('bad', fallback)).toEqual(fallback);
    });
  });
});
