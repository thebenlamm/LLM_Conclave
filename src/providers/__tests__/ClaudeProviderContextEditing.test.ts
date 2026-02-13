import ClaudeProvider from '../ClaudeProvider';

// Mock the Anthropic SDK with both regular and beta endpoints
const mockRegularCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'test response' }],
  usage: { input_tokens: 100, output_tokens: 50 }
});
const mockBetaCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'test response' }],
  usage: { input_tokens: 100, output_tokens: 50 }
});

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockRegularCreate
      },
      beta: {
        messages: {
          create: mockBetaCreate
        }
      }
    }))
  };
});

describe('ClaudeProvider Context Editing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    mockRegularCreate.mockClear();
    mockBetaCreate.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled by default — uses regular endpoint', async () => {
    delete process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING;
    const provider = new ClaudeProvider('claude-sonnet-4-5');

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    // Should use regular endpoint, not beta
    expect(mockRegularCreate).toHaveBeenCalledTimes(1);
    expect(mockBetaCreate).not.toHaveBeenCalled();
    const [params] = mockRegularCreate.mock.calls[0];
    expect(params.context_management).toBeUndefined();
    expect(params.betas).toBeUndefined();
  });

  it('uses beta endpoint with betas and context_management when enabled via constructor option', async () => {
    const provider = new ClaudeProvider('claude-sonnet-4-5', undefined, { contextEditing: true });

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    // Should use beta endpoint
    expect(mockBetaCreate).toHaveBeenCalledTimes(1);
    expect(mockRegularCreate).not.toHaveBeenCalled();
    const [params] = mockBetaCreate.mock.calls[0];
    expect(params.betas).toEqual(['context-management-2025-06-27']);
    expect(params.context_management).toBeDefined();
    expect(params.context_management.edits).toHaveLength(1);
    expect(params.context_management.edits[0].type).toBe('clear_tool_uses_20250919');
    expect(params.context_management.edits[0].trigger.value).toBe(50000);
    expect(params.context_management.edits[0].keep.value).toBe(3);
    expect(params.context_management.edits[0].clear_at_least.value).toBe(10000);
  });

  it('uses beta endpoint when enabled via env var', async () => {
    process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING = '1';
    const provider = new ClaudeProvider('claude-sonnet-4-5');

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    expect(mockBetaCreate).toHaveBeenCalledTimes(1);
    expect(mockRegularCreate).not.toHaveBeenCalled();
    const [params] = mockBetaCreate.mock.calls[0];
    expect(params.betas).toEqual(['context-management-2025-06-27']);
    expect(params.context_management).toBeDefined();
  });

  it('constructor option overrides env var when explicitly false', async () => {
    process.env.CONCLAVE_ANTHROPIC_CONTEXT_EDITING = '1';
    const provider = new ClaudeProvider('claude-sonnet-4-5', undefined, { contextEditing: false });

    await provider.chat(
      [{ role: 'user', content: 'hello' }],
      'system prompt'
    );

    // Should use regular endpoint when explicitly disabled
    expect(mockRegularCreate).toHaveBeenCalledTimes(1);
    expect(mockBetaCreate).not.toHaveBeenCalled();
    const [params] = mockRegularCreate.mock.calls[0];
    expect(params.context_management).toBeUndefined();
    expect(params.betas).toBeUndefined();
  });
});
