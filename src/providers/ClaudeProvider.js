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

      // Validate response structure
      if (!response || !response.content) {
        throw new Error(`Invalid response structure: ${JSON.stringify(response)}`);
      }

      // Handle empty content array (Claude chose not to respond)
      if (response.content.length === 0) {
        return "[No response provided - model chose not to contribute]";
      }

      // Claude responses have a 'text' property in content blocks
      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || !textContent.text) {
        throw new Error(`No text content in response: ${JSON.stringify(response.content)}`);
      }

      return textContent.text;
    } catch (error) {
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  getProviderName() {
    return 'Claude';
  }
}

module.exports = ClaudeProvider;
