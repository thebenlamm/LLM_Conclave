const OpenAI = require('openai');
const LLMProvider = require('./LLMProvider');

/**
 * Grok (xAI) provider implementation
 * Uses OpenAI-compatible API
 * Supports models like grok-beta, grok-vision-beta
 */
class GrokProvider extends LLMProvider {
  constructor(modelName, apiKey) {
    super(modelName);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1'
    });
  }

  async chat(messages, systemPrompt = null) {
    try {
      const messageArray = [...messages];

      // Add system prompt if provided
      if (systemPrompt) {
        messageArray.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: messageArray,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  getProviderName() {
    return 'Grok';
  }
}

module.exports = GrokProvider;
