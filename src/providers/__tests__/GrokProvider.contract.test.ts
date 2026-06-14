import GrokProvider from '../GrokProvider';
import * as GrokProviderModule from '../GrokProvider';
import { CostTracker } from '../../core/CostTracker';
import { Message } from '../../types';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((config: any) => {
      (GrokProviderModule as any).__lastConfig = config;
      return { chat: { completions: { create: mockCreate } } };
    }),
  };
});

/** Build an async-iterable the provider's `for await` loop can consume. */
function asyncStream(chunks: any[]): any {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

describe('GrokProvider Contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete (GrokProviderModule as any).__lastConfig;
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('sets xAI base URL', () => {
      process.env.XAI_API_KEY = 'test-key';
      new GrokProvider('grok-beta');

      const config = (GrokProviderModule as any).__lastConfig;
      expect(config).toBeDefined();
      expect(config.baseURL).toBe('https://api.x.ai/v1');
    });

    it('uses XAI_API_KEY environment variable', () => {
      const testKey = 'test-xai-key-12345';
      process.env.XAI_API_KEY = testKey;
      new GrokProvider('grok-beta');

      const config = (GrokProviderModule as any).__lastConfig;
      expect(config).toBeDefined();
      expect(config.apiKey).toBe(testKey);
    });
  });

  describe('getProviderName', () => {
    it('returns Grok', () => {
      process.env.XAI_API_KEY = 'test-key';
      const provider = new GrokProvider('grok-beta');
      expect(provider.getProviderName()).toBe('Grok');
    });
  });

  describe('streaming reports usage (cost regression)', () => {
    it('requests include_usage and captures token usage from the final chunk', async () => {
      process.env.XAI_API_KEY = 'test-key';
      mockCreate.mockResolvedValue(
        asyncStream([
          { choices: [{ delta: { content: 'Hi ' } }] },
          { choices: [{ delta: { content: 'there' } }] },
          { choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 8 } },
        ])
      );
      const costTracker = new CostTracker();
      const provider = new GrokProvider('grok-4.3', undefined, costTracker);

      const res = await provider.chat([{ role: 'user', content: 'hi' } as Message], null, { stream: true });

      expect(res.text).toBe('Hi there');
      expect(mockCreate.mock.calls[0][0].stream_options).toEqual({ include_usage: true });
      const summary = costTracker.getSummary();
      expect(summary.totalTokens).toEqual({ input: 12, output: 8 });
      expect(summary.totalCost).toBeGreaterThan(0);
    });
  });
});
