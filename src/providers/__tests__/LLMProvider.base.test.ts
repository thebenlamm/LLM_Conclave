import LLMProvider from '../LLMProvider';
import { CostTracker } from '../../core/CostTracker';
import { Message, ProviderResponse, ChatOptions } from '../../types';

// Mock CostTracker to avoid side effects
const mockLogCall = jest.fn();
jest.mock('../../core/CostTracker', () => ({
  CostTracker: {
    getInstance: () => ({
      logCall: mockLogCall,
    }),
  },
}));

class TestProvider extends LLMProvider {
  public performChatFn: jest.Mock;

  constructor() {
    super('test-model');
    this.performChatFn = jest.fn();
  }

  protected async performChat(
    messages: Message[],
    systemPrompt?: string | null,
    options?: ChatOptions
  ): Promise<ProviderResponse> {
    return this.performChatFn(messages, systemPrompt, options);
  }

  getProviderName(): string {
    return 'Test';
  }
}

describe('LLMProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
    // Mock sleep to make retries instant in tests
    jest.spyOn(provider as any, 'sleep').mockResolvedValue(undefined);
    mockLogCall.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('chat', () => {
    it('successful call returns response directly', async () => {
      const mockResponse: ProviderResponse = { text: 'Success' };
      provider.performChatFn.mockResolvedValue(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result).toEqual(mockResponse);
      expect(provider.performChatFn).toHaveBeenCalledTimes(1);
    });

    it('retries on network error (fetch failed)', async () => {
      const mockResponse: ProviderResponse = { text: 'Success after retry' };
      provider.performChatFn
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result).toEqual(mockResponse);
      expect(provider.performChatFn).toHaveBeenCalledTimes(3);
    });

    it('retries on rate limit (429)', async () => {
      const mockResponse: ProviderResponse = { text: 'Success after rate limit' };
      provider.performChatFn
        .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
        .mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result).toEqual(mockResponse);
      expect(provider.performChatFn).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 (service unavailable)', async () => {
      const mockResponse: ProviderResponse = { text: 'Success after 503' };
      provider.performChatFn
        .mockRejectedValueOnce(new Error('503 service unavailable'))
        .mockResolvedValueOnce(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result).toEqual(mockResponse);
      expect(provider.performChatFn).toHaveBeenCalledTimes(2);
    });

    it('uses exponential backoff timing', async () => {
      const sleepSpy = jest.spyOn(provider as any, 'sleep');
      sleepSpy.mockResolvedValue(undefined);

      const mockResponse: ProviderResponse = { text: 'Success' };
      provider.performChatFn
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(mockResponse);

      await provider.chat([{ role: 'user', content: 'Test' }]);

      // First retry: 1000ms, second retry: 2000ms
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
    });

    it('does not retry on auth error (Invalid API key)', async () => {
      provider.performChatFn.mockRejectedValue(new Error('Invalid API key'));

      await expect(provider.chat([{ role: 'user', content: 'Test' }])).rejects.toThrow(
        'Invalid API key'
      );

      expect(provider.performChatFn).toHaveBeenCalledTimes(1);
    });

    it('does not retry on validation error (Invalid request)', async () => {
      provider.performChatFn.mockRejectedValue(new Error('Invalid request'));

      await expect(provider.chat([{ role: 'user', content: 'Test' }])).rejects.toThrow(
        'Invalid request'
      );

      expect(provider.performChatFn).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted (3 attempts)', async () => {
      const error = new Error('fetch failed');
      provider.performChatFn.mockRejectedValue(error);

      await expect(provider.chat([{ role: 'user', content: 'Test' }])).rejects.toThrow(
        'fetch failed'
      );

      expect(provider.performChatFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('healthCheck', () => {
    it('returns true on success', async () => {
      provider.performChatFn.mockResolvedValue({ text: 'OK' });

      const result = await provider.healthCheck();

      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      provider.performChatFn.mockRejectedValue(new Error('Service down'));

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('CostTracker.logCall invocation count (COST-01)', () => {
    it('successful chat() call invokes logCall exactly once with success: true', async () => {
      const mockResponse: ProviderResponse = {
        text: 'Hello',
        usage: { input_tokens: 10, output_tokens: 5 },
      };
      provider.performChatFn.mockResolvedValue(mockResponse);

      await provider.chat([{ role: 'user', content: 'Hi' }]);

      expect(mockLogCall).toHaveBeenCalledTimes(1);
      expect(mockLogCall).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('failed non-retryable chat() call invokes logCall exactly once with success: false', async () => {
      provider.performChatFn.mockRejectedValue(new Error('Invalid API key'));

      await expect(provider.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow();

      expect(mockLogCall).toHaveBeenCalledTimes(1);
      expect(mockLogCall).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('fail-then-succeed chat() (1 retry) invokes logCall twice: once failure, once success', async () => {
      const mockResponse: ProviderResponse = {
        text: 'Retry worked',
        usage: { input_tokens: 10, output_tokens: 5 },
      };
      provider.performChatFn
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(mockResponse);

      await provider.chat([{ role: 'user', content: 'Hi' }]);

      expect(mockLogCall).toHaveBeenCalledTimes(2);
      expect(mockLogCall).toHaveBeenNthCalledWith(1, expect.objectContaining({ success: false }));
      expect(mockLogCall).toHaveBeenNthCalledWith(2, expect.objectContaining({ success: true }));
    });
  });
});
