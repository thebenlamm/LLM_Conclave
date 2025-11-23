const Anthropic = require('@anthropic-ai/sdk');
const LLMProvider = require('./LLMProvider');

/**
 * Claude (Anthropic) provider implementation
 * Supports models like claude-3-5-sonnet-20241022, claude-3-opus, etc.
 */
class ClaudeProvider extends LLMProvider {
  constructor(modelName, apiKey) {
    super(modelName);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  async chat(messages, systemPrompt = null) {
    try {
      // Claude API expects messages without system role in the messages array
      // System prompt is passed separately
      const messageArray = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));

      const params = {
        model: this.modelName,
        max_tokens: 4096,
        messages: messageArray,
        temperature: 0.7,
      };

      // Add system prompt if provided
      if (systemPrompt) {
        params.system = systemPrompt;
      }

      const response = await this.client.messages.create(params);

      return response.content[0].text;
    } catch (error) {
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  getProviderName() {
    return 'Claude';
  }
}

module.exports = ClaudeProvider;
