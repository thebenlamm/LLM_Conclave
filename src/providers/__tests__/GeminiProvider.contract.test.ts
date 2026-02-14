import GeminiProvider from '../GeminiProvider';
import {
  simpleUserMessage,
  simpleAssistantMessage,
  systemMessage,
  assistantWithToolCalls,
  assistantWithToolCallsNoText,
  assistantWithMultipleToolCalls,
  toolResult,
  toolResultJson,
  multipleToolResults,
  fullToolSequence,
  multiToolSequence,
  anthropicToolDef,
  openaiToolDef,
  multipleToolDefs,
} from './fixtures';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({})),
}));

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('gemini-2.0-flash', 'fake-key');
  });

  describe('convertMessagesToGeminiFormat', () => {
    it('converts user message', () => {
      const result = provider.convertMessagesToGeminiFormat([simpleUserMessage]);
      expect(result).toEqual([{ role: 'user', parts: [{ text: simpleUserMessage.content }] }]);
    });

    it('converts assistant to role:model', () => {
      const result = provider.convertMessagesToGeminiFormat([simpleAssistantMessage]);
      expect(result).toEqual([{ role: 'model', parts: [{ text: simpleAssistantMessage.content }] }]);
    });

    it('converts system message with prefix', () => {
      const result = provider.convertMessagesToGeminiFormat([systemMessage]);
      expect(result).toEqual([{ role: 'user', parts: [{ text: `[System instruction]: ${systemMessage.content}` }] }]);
    });

    it('preserves text when assistant has tool_calls and non-empty content', () => {
      const result = provider.convertMessagesToGeminiFormat([assistantWithToolCalls]);
      const tc = (assistantWithToolCalls as any).tool_calls[0];

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('model');
      expect(result[0].parts).toHaveLength(2);
      expect(result[0].parts[0]).toEqual({ text: assistantWithToolCalls.content });
      expect(result[0].parts[1]).toEqual({ functionCall: { name: tc.name, args: tc.input } });
    });

    it('omits text part when assistant has tool_calls and empty content', () => {
      const result = provider.convertMessagesToGeminiFormat([assistantWithToolCallsNoText]);
      const tc = (assistantWithToolCallsNoText as any).tool_calls[0];

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({ functionCall: { name: tc.name, args: tc.input } });
    });

    it('groups tool_result with actual function name', () => {
      const result = provider.convertMessagesToGeminiFormat(fullToolSequence);

      expect(result).toHaveLength(4);
      // Function response
      expect(result[2].role).toBe('function');
      expect(result[2].parts[0].functionResponse.name).toBe('read_file');
      expect(result[2].parts[0].functionResponse.response).toEqual({ result: toolResult.content });
    });

    it('groups multiple consecutive tool_results into single Content (regression 5fc64e3)', () => {
      const result = provider.convertMessagesToGeminiFormat(multiToolSequence);

      expect(result).toHaveLength(4);
      // Model with 2 functionCalls
      expect(result[1].role).toBe('model');
      expect(result[1].parts.filter((p: any) => p.functionCall)).toHaveLength(2);
      // Single function Content with 2 parts
      expect(result[2].role).toBe('function');
      expect(result[2].parts).toHaveLength(2);
      expect(result[2].parts[0].functionResponse.name).toBe('read_file');
      expect(result[2].parts[1].functionResponse.name).toBe('read_file');
    });

    it('maps tool_use_id to function name (not ID)', () => {
      const result = provider.convertMessagesToGeminiFormat(fullToolSequence);
      const fnResponse = result.find((c: any) => c.role === 'function');

      expect(fnResponse.parts[0].functionResponse.name).toBe('read_file');
      expect(fnResponse.parts[0].functionResponse.name).not.toBe('call_001');
    });

    it('flushes trailing pending function responses', () => {
      // Sequence ending with tool_result
      const result = provider.convertMessagesToGeminiFormat([
        simpleUserMessage,
        assistantWithToolCalls,
        toolResult,
      ]);

      expect(result).toHaveLength(3);
      expect(result[2].role).toBe('function');
      expect(result[2].parts[0].functionResponse.name).toBe('read_file');
    });

    it('parses JSON tool content; wraps non-JSON in result object', () => {
      // JSON content
      const jsonResult = provider.convertMessagesToGeminiFormat([
        simpleUserMessage, assistantWithToolCalls, toolResultJson,
      ]);
      const jsonResp = jsonResult.find((c: any) => c.role === 'function');
      expect(jsonResp.parts[0].functionResponse.response).toEqual({ key: 'value' });

      // Plain text content
      const textResult = provider.convertMessagesToGeminiFormat([
        simpleUserMessage, assistantWithToolCalls, toolResult,
      ]);
      const textResp = textResult.find((c: any) => c.role === 'function');
      expect(textResp.parts[0].functionResponse.response).toEqual({ result: toolResult.content });
    });
  });

  describe('convertToolsToGeminiFormat', () => {
    it('converts Anthropic format tool', () => {
      const result = provider.convertToolsToGeminiFormat([anthropicToolDef]);
      expect(result).toEqual([{
        name: anthropicToolDef.name,
        description: anthropicToolDef.description,
        parametersJsonSchema: anthropicToolDef.input_schema,
      }]);
    });

    it('converts OpenAI format tool', () => {
      const result = provider.convertToolsToGeminiFormat([openaiToolDef]);
      expect(result).toEqual([{
        name: openaiToolDef.function.name,
        description: openaiToolDef.function.description,
        parametersJsonSchema: openaiToolDef.function.parameters,
      }]);
    });

    it('converts multiple tools', () => {
      const result = provider.convertToolsToGeminiFormat(multipleToolDefs);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe(multipleToolDefs[0].name);
      expect(result[1].name).toBe(multipleToolDefs[1].name);
    });
  });
});
