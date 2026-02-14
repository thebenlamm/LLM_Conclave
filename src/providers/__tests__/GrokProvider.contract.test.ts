import GrokProvider from '../GrokProvider';
import * as GrokProviderModule from '../GrokProvider';

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((config: any) => {
      (GrokProviderModule as any).__lastConfig = config;
      return { chat: { completions: { create: jest.fn() } } };
    }),
  };
});

describe('GrokProvider Contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete (GrokProviderModule as any).__lastConfig;
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
});
