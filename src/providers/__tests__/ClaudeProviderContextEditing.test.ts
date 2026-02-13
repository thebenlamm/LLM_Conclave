import ClaudeProvider from '../ClaudeProvider';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'test response' }],
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      }
    }))
  };
});

describe('ClaudeProvider Context Editing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled by default', async () => {
    delete process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING;
    const provider = new ClaudeProvider('claude-sonnet-4-5');
    const mockCreate = (provider.client.messages.create as jest.Mock);

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    const [params, apiOptions] = mockCreate.mock.calls[0];
    expect(params.context_management).toBeUndefined();
    expect(apiOptions.betas).toBeUndefined();
  });

  it('includes beta header and context_management when enabled via constructor option', async () => {
    const provider = new ClaudeProvider('claude-sonnet-4-5', undefined, { contextEditing: true });
    const mockCreate = (provider.client.messages.create as jest.Mock);

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    const [params, apiOptions] = mockCreate.mock.calls[0];
    expect(apiOptions.betas).toEqual(['context-management-2025-06-27']);
    expect(params.context_management).toBeDefined();
    expect(params.context_management.edits).toHaveLength(1);
    expect(params.context_management.edits[0].type).toBe('clear_tool_uses_20250919');
    expect(params.context_management.edits[0].trigger.value).toBe(50000);
    expect(params.context_management.edits[0].keep.value).toBe(3);
    expect(params.context_management.edits[0].clear_at_least.value).toBe(10000);
  });

  it('includes context_management when enabled via env var', async () => {
    process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING = '1';
    const provider = new ClaudeProvider('claude-sonnet-4-5');
    const mockCreate = (provider.client.messages.create as jest.Mock);

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    const [params, apiOptions] = mockCreate.mock.calls[0];
    expect(apiOptions.betas).toEqual(['context-management-2025-06-27']);
    expect(params.context_management).toBeDefined();
  });

  it('constructor option overrides env var when explicitly false', async () => {
    process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING = '1';
    const provider = new ClaudeProvider('claude-sonnet-4-5', undefined, { contextEditing: false });
    const mockCreate = (provider.client.messages.create as jest.Mock);

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    const [params, apiOptions] = mockCreate.mock.calls[0];
    expect(params.context_management).toBeUndefined();
    expect(apiOptions.betas).toBeUndefined();
  });
});
