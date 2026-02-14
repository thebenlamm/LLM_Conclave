import MistralProvider from '../MistralProvider';
import * as MistralProviderModule from '../MistralProvider';

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((config: any) => {
      (MistralProviderModule as any).__lastConfig = config;
      return { chat: { completions: { create: jest.fn() } } };
    }),
  };
});

describe('MistralProvider Contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete (MistralProviderModule as any).__lastConfig;
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
});
