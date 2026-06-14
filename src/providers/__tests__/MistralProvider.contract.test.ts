import MistralProvider from '../MistralProvider';
import * as MistralProviderModule from '../MistralProvider';
import { CostTracker } from '../../core/CostTracker';
import { Message } from '../../types';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((config: any) => {
      (MistralProviderModule as any).__lastConfig = config;
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

describe('MistralProvider Contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete (MistralProviderModule as any).__lastConfig;
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('sets Mistral base URL', () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      new MistralProvider('mistral-large-latest');

      const config = (MistralProviderModule as any).__lastConfig;
      expect(config).toBeDefined();
      expect(config.baseURL).toBe('https://api.mistral.ai/v1');
    });

    it('throws without MISTRAL_API_KEY', () => {
      delete process.env.MISTRAL_API_KEY;
      expect(() => new MistralProvider('mistral-large-latest')).toThrow(
        'MISTRAL_API_KEY is required'
      );
    });
  });

  describe('getProviderName', () => {
    it('returns Mistral', () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      const provider = new MistralProvider('mistral-large-latest');
      expect(provider.getProviderName()).toBe('Mistral');
    });
  });

  describe('streaming reports usage (cost regression)', () => {
    it('requests include_usage and captures token usage from the final chunk', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      mockCreate.mockResolvedValue(
        asyncStream([
          { choices: [{ delta: { content: 'Bon' } }] },
          { choices: [{ delta: { content: 'jour' } }] },
          { choices: [{ delta: {} }], usage: { prompt_tokens: 9, completion_tokens: 4 } },
        ])
      );
      const costTracker = new CostTracker();
      const provider = new MistralProvider('mistral-large-latest', undefined, costTracker);

      const res = await provider.chat([{ role: 'user', content: 'salut' } as Message], null, { stream: true });

      expect(res.text).toBe('Bonjour');
      expect(mockCreate.mock.calls[0][0].stream_options).toEqual({ include_usage: true });
      const summary = costTracker.getSummary();
      expect(summary.totalTokens).toEqual({ input: 9, output: 4 });
      expect(summary.totalCost).toBeGreaterThan(0);
    });
  });
});
