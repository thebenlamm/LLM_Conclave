import OpenAIProvider from './OpenAIProvider';
import ClaudeProvider from './ClaudeProvider';
import GrokProvider from './GrokProvider';
import GeminiProvider from './GeminiProvider';
import MistralProvider from './MistralProvider';

/**
 * Factory for creating LLM provider instances
 */
export default class ProviderFactory {
  /**
   * Create a provider instance based on the model name
   * @param {string} modelIdentifier - Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022", "grok-beta")
   * @returns {any} - Instance of the appropriate provider
   */
  static createProvider(modelIdentifier: string): any {
    const modelLower = modelIdentifier.toLowerCase();

    // OpenAI models
    if (modelLower.includes('gpt')) {
      return new OpenAIProvider(modelIdentifier);
    }

    // Claude models
    if (modelLower.includes('claude') || modelLower.includes('sonnet') ||
      modelLower.includes('opus') || modelLower.includes('haiku')) {
      // Map common shorthand to full model names
      let fullModelName = modelIdentifier;
      if (modelLower === 'sonnet' || modelLower === 'sonnet-4.5') {
        fullModelName = 'claude-sonnet-4-5';
      } else if (modelLower === 'opus' || modelLower === 'opus-4.5') {
        fullModelName = 'claude-opus-4-5';
      } else if (modelLower === 'haiku' || modelLower === 'haiku-4.5') {
        fullModelName = 'claude-haiku-4-5';
      }
      return new ClaudeProvider(fullModelName);
    }

    // Grok models
    if (modelLower.includes('grok')) {
      return new GrokProvider(modelIdentifier);
    }

    // Gemini models
    if (modelLower.includes('gemini')) {
      // Map common names to Gemini 2.x models (Gemini 1.5 deprecated in new API)
      let fullModelName = modelIdentifier;
      if (modelLower === 'gemini-flash' || modelLower === 'gemini-pro') {
        // Default shorthand names to Gemini 2.0
        fullModelName = 'gemini-2.0-flash-exp';
      }
      return new GeminiProvider(fullModelName);
    }

    // Mistral models
    if (modelLower.includes('mistral') || modelLower.includes('codestral')) {
      return new MistralProvider(modelIdentifier);
    }

    throw new Error(`Unknown model: ${modelIdentifier}. Supported models: GPT (OpenAI), Claude (Anthropic), Grok (xAI), Gemini (Google), Mistral (Mistral AI)`);
  }

  /**
   * Get a list of supported model patterns
   * @returns {Array<string>}
   */
  static getSupportedModels(): string[] {
    return [
      'gpt-4o, gpt-4-turbo, gpt-3.5-turbo (OpenAI)',
      'claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5, sonnet, opus, haiku (Anthropic)',
      'grok-3, grok-vision-3 (xAI)',
      'gemini-2.0-flash-exp, gemini-2.5-flash, gemini-flash, gemini-pro (Google - Gemini 2.x)',
      'mistral-large-latest, mistral-small-latest, codestral-latest (Mistral AI)'
    ];
  }
}
