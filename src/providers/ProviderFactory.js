const OpenAIProvider = require('./OpenAIProvider');
const ClaudeProvider = require('./ClaudeProvider');
const GrokProvider = require('./GrokProvider');

/**
 * Factory for creating LLM provider instances
 */
class ProviderFactory {
  /**
   * Create a provider instance based on the model name
   * @param {string} modelIdentifier - Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022", "grok-beta")
   * @returns {LLMProvider} - Instance of the appropriate provider
   */
  static createProvider(modelIdentifier) {
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
      if (modelLower === 'sonnet 3.5' || modelLower === 'sonnet-3.5') {
        fullModelName = 'claude-3-5-sonnet-20241022';
      } else if (modelLower === 'opus' || modelLower === 'opus-3') {
        fullModelName = 'claude-3-opus-20240229';
      } else if (modelLower === 'haiku' || modelLower === 'haiku-3') {
        fullModelName = 'claude-3-haiku-20240307';
      }
      return new ClaudeProvider(fullModelName);
    }

    // Grok models
    if (modelLower.includes('grok')) {
      return new GrokProvider(modelIdentifier);
    }

    throw new Error(`Unknown model: ${modelIdentifier}. Supported models: GPT (OpenAI), Claude (Anthropic), Grok (xAI)`);
  }

  /**
   * Get a list of supported model patterns
   * @returns {Array<string>}
   */
  static getSupportedModels() {
    return [
      'gpt-4o, gpt-4-turbo, gpt-3.5-turbo (OpenAI)',
      'claude-3-5-sonnet-20241022, sonnet-3.5, opus, haiku (Anthropic)',
      'grok-beta, grok-vision-beta (xAI)'
    ];
  }
}

module.exports = ProviderFactory;
