import ClaudeProvider from '../ClaudeProvider';
import {
  simpleUserMessage,
  simpleAssistantMessage,
  systemMessage,
  assistantWithToolCalls,
  assistantWithToolCallsNoText,
  assistantWithMultipleToolCalls,
  toolResult,
  fullToolSequence,
  emptyContentAssistant,
} from './fixtures';

describe('ClaudeProvider.convertMessagesToClaudeFormat', () => {
  it('converts simple user message', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([simpleUserMessage]);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: 'user',
      content: simpleUserMessage.content,
    });
    expect(result.additionalSystemMessages).toEqual([]);
  });

  it('converts simple assistant message', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([simpleAssistantMessage]);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: 'assistant',
      content: simpleAssistantMessage.content,
    });
    expect(result.additionalSystemMessages).toEqual([]);
  });

  it('extracts system messages into additionalSystemMessages', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([
      simpleUserMessage,
      systemMessage,
      simpleAssistantMessage,
    ]);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.additionalSystemMessages).toEqual([systemMessage.content]);
  });

  it('converts tool_result to user role with content block', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([toolResult]);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: (toolResult as any).tool_use_id,
        content: toolResult.content,
      }],
    });
  });

  it('converts assistant with tool_calls preserving text content', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([assistantWithToolCalls]);
    const tc = (assistantWithToolCalls as any).tool_calls[0];

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: assistantWithToolCalls.content },
        { type: 'tool_use', id: tc.id, name: tc.name, input: tc.input },
      ],
    });
  });

  it('converts assistant with tool_calls but empty content (no text block)', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([assistantWithToolCallsNoText]);
    const tc = (assistantWithToolCallsNoText as any).tool_calls[0];

    expect(result.messages).toHaveLength(1);
    // No text block since content is empty
    expect(result.messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: tc.id, name: tc.name, input: tc.input },
      ],
    });
  });

  it('converts multiple tool_calls into multiple tool_use blocks', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([assistantWithMultipleToolCalls]);
    const tcs = (assistantWithMultipleToolCalls as any).tool_calls;

    expect(result.messages).toHaveLength(1);
    const content = result.messages[0].content;
    // Empty content on this fixture means no text block
    const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use');
    expect(toolUseBlocks).toHaveLength(2);
    expect(toolUseBlocks[0].id).toBe(tcs[0].id);
    expect(toolUseBlocks[1].id).toBe(tcs[1].id);
  });

  it('converts full tool sequence round-trip', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat(fullToolSequence);

    // fullToolSequence: [user, assistant+tools, tool_result, assistant]
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(Array.isArray(result.messages[1].content)).toBe(true); // tool_use blocks
    expect(result.messages[2].role).toBe('user'); // tool_result becomes user
    expect(Array.isArray(result.messages[2].content)).toBe(true); // content block array
    expect(result.messages[2].content[0].type).toBe('tool_result');
    expect(result.messages[3].role).toBe('assistant');
  });

  it('converts empty content assistant message', () => {
    const result = ClaudeProvider.convertMessagesToClaudeFormat([emptyContentAssistant]);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: 'assistant',
      content: '',
    });
  });
});
