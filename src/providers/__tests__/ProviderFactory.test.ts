import ProviderFactory from '../ProviderFactory';
import OpenAIProvider from '../OpenAIProvider';
import ClaudeProvider from '../ClaudeProvider';
import GrokProvider from '../GrokProvider';
import GeminiProvider from '../GeminiProvider';
import MistralProvider from '../MistralProvider';

// Mock all provider constructors to avoid needing actual API keys
jest.mock('../OpenAIProvider', () => {
  return jest.fn().mockImplementation((model: string) => ({
    modelName: model,
    type: 'openai'
  }));
});

jest.mock('../ClaudeProvider', () => {
  return jest.fn().mockImplementation((model: string) => ({
    modelName: model,
    type: 'claude'
  }));
});

jest.mock('../GrokProvider', () => {
  return jest.fn().mockImplementation((model: string) => ({
    modelName: model,
    type: 'grok'
  }));
});

jest.mock('../GeminiProvider', () => {
  return jest.fn().mockImplementation((model: string) => ({
    modelName: model,
    type: 'gemini'
  }));
});

jest.mock('../MistralProvider', () => {
  return jest.fn().mockImplementation((model: string) => ({
    modelName: model,
    type: 'mistral'
  }));
});

describe('ProviderFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI model detection', () => {
    it('should create OpenAIProvider for gpt-4o', () => {
      const provider = ProviderFactory.createProvider('gpt-4o');
      expect(OpenAIProvider).toHaveBeenCalledWith('gpt-4o');
      expect(provider.type).toBe('openai');
    });

    it('should create OpenAIProvider for gpt-4-turbo', () => {
      const provider = ProviderFactory.createProvider('gpt-4-turbo');
      expect(OpenAIProvider).toHaveBeenCalledWith('gpt-4-turbo');
      expect(provider.type).toBe('openai');
    });

    it('should create OpenAIProvider for gpt-3.5-turbo', () => {
      const provider = ProviderFactory.createProvider('gpt-3.5-turbo');
      expect(OpenAIProvider).toHaveBeenCalledWith('gpt-3.5-turbo');
      expect(provider.type).toBe('openai');
    });

    it('should be case insensitive for GPT models', () => {
      const provider = ProviderFactory.createProvider('GPT-4O');
      expect(OpenAIProvider).toHaveBeenCalledWith('GPT-4O');
      expect(provider.type).toBe('openai');
    });
  });

  describe('Claude model detection', () => {
    it('should create ClaudeProvider for full model name', () => {
      const provider = ProviderFactory.createProvider('claude-3-5-sonnet-20241022');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-3-5-sonnet-20241022', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should expand "sonnet" shorthand to full model name', () => {
      const provider = ProviderFactory.createProvider('sonnet');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-sonnet-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should expand "sonnet-4.5" shorthand to full model name', () => {
      const provider = ProviderFactory.createProvider('sonnet-4.5');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-sonnet-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should expand "opus" shorthand to full model name', () => {
      const provider = ProviderFactory.createProvider('opus');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-opus-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should expand "opus-4.5" shorthand to full model name', () => {
      const provider = ProviderFactory.createProvider('opus-4.5');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-opus-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should expand "haiku" shorthand to full model name', () => {
      const provider = ProviderFactory.createProvider('haiku');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-haiku-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should expand "haiku-4.5" shorthand to full model name', () => {
      const provider = ProviderFactory.createProvider('haiku-4.5');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-haiku-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should be case insensitive for Claude models', () => {
      const provider = ProviderFactory.createProvider('SONNET');
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-sonnet-4-5', undefined, undefined);
      expect(provider.type).toBe('claude');
    });

    it('should pass contextEditing option to ClaudeProvider', () => {
      ProviderFactory.createProvider('claude-sonnet-4-5', { contextEditing: true });
      expect(ClaudeProvider).toHaveBeenCalledWith('claude-sonnet-4-5', undefined, { contextEditing: true });
    });
  });

  describe('Grok model detection', () => {
    it('should create GrokProvider for grok-beta', () => {
      const provider = ProviderFactory.createProvider('grok-beta');
      expect(GrokProvider).toHaveBeenCalledWith('grok-beta');
      expect(provider.type).toBe('grok');
    });

    it('should create GrokProvider for grok-3', () => {
      const provider = ProviderFactory.createProvider('grok-3');
      expect(GrokProvider).toHaveBeenCalledWith('grok-3');
      expect(provider.type).toBe('grok');
    });

    it('should be case insensitive for Grok models', () => {
      const provider = ProviderFactory.createProvider('GROK-3');
      expect(GrokProvider).toHaveBeenCalledWith('GROK-3');
      expect(provider.type).toBe('grok');
    });
  });

  describe('Gemini model detection', () => {
    it('should create GeminiProvider for full model name', () => {
      const provider = ProviderFactory.createProvider('gemini-2.5-pro');
      expect(GeminiProvider).toHaveBeenCalledWith('gemini-2.5-pro');
      expect(provider.type).toBe('gemini');
    });

    it('should expand "gemini" shorthand to gemini-2.5-pro', () => {
      const provider = ProviderFactory.createProvider('gemini');
      expect(GeminiProvider).toHaveBeenCalledWith('gemini-2.5-pro');
      expect(provider.type).toBe('gemini');
    });

    it('should expand "gemini-pro" shorthand to gemini-2.5-pro', () => {
      const provider = ProviderFactory.createProvider('gemini-pro');
      expect(GeminiProvider).toHaveBeenCalledWith('gemini-2.5-pro');
      expect(provider.type).toBe('gemini');
    });

    it('should expand "gemini-flash" shorthand to gemini-2.0-flash', () => {
      const provider = ProviderFactory.createProvider('gemini-flash');
      expect(GeminiProvider).toHaveBeenCalledWith('gemini-2.0-flash');
      expect(provider.type).toBe('gemini');
    });

    it('should preserve explicit gemini-2.0-flash', () => {
      const provider = ProviderFactory.createProvider('gemini-2.0-flash');
      expect(GeminiProvider).toHaveBeenCalledWith('gemini-2.0-flash');
      expect(provider.type).toBe('gemini');
    });

    it('should be case insensitive for Gemini models', () => {
      const provider = ProviderFactory.createProvider('GEMINI-PRO');
      expect(GeminiProvider).toHaveBeenCalledWith('gemini-2.5-pro');
      expect(provider.type).toBe('gemini');
    });
  });

  describe('Mistral model detection', () => {
    it('should create MistralProvider for mistral-large-latest', () => {
      const provider = ProviderFactory.createProvider('mistral-large-latest');
      expect(MistralProvider).toHaveBeenCalledWith('mistral-large-latest');
      expect(provider.type).toBe('mistral');
    });

    it('should create MistralProvider for mistral-small-latest', () => {
      const provider = ProviderFactory.createProvider('mistral-small-latest');
      expect(MistralProvider).toHaveBeenCalledWith('mistral-small-latest');
      expect(provider.type).toBe('mistral');
    });

    it('should create MistralProvider for codestral-latest', () => {
      const provider = ProviderFactory.createProvider('codestral-latest');
      expect(MistralProvider).toHaveBeenCalledWith('codestral-latest');
      expect(provider.type).toBe('mistral');
    });

    it('should be case insensitive for Mistral models', () => {
      const provider = ProviderFactory.createProvider('MISTRAL-LARGE-LATEST');
      expect(MistralProvider).toHaveBeenCalledWith('MISTRAL-LARGE-LATEST');
      expect(provider.type).toBe('mistral');
    });
  });

  describe('Unknown model handling', () => {
    it('should throw error for unknown model', () => {
      expect(() => ProviderFactory.createProvider('unknown-model')).toThrow(
        /Unknown model: unknown-model/
      );
    });

    it('should include supported models in error message', () => {
      expect(() => ProviderFactory.createProvider('unknown')).toThrow(
        /Supported models:/
      );
    });
  });

  describe('getSupportedModels', () => {
    it('should return list of supported model patterns', () => {
      const models = ProviderFactory.getSupportedModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include OpenAI models', () => {
      const models = ProviderFactory.getSupportedModels();
      expect(models.some(m => m.includes('OpenAI'))).toBe(true);
    });

    it('should include Anthropic models', () => {
      const models = ProviderFactory.getSupportedModels();
      expect(models.some(m => m.includes('Anthropic'))).toBe(true);
    });

    it('should include Google models', () => {
      const models = ProviderFactory.getSupportedModels();
      expect(models.some(m => m.includes('Google'))).toBe(true);
    });

    it('should include Mistral models', () => {
      const models = ProviderFactory.getSupportedModels();
      expect(models.some(m => m.includes('Mistral'))).toBe(true);
    });
  });
});
