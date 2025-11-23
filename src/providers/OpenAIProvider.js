const OpenAI = require('openai');
const LLMProvider = require('./LLMProvider');

/**
 * OpenAI provider implementation
 * Supports models like gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.
 */
class OpenAIProvider extends LLMProvider {
  constructor(modelName, apiKey) {
    super(modelName);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
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
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  getProviderName() {
    return 'OpenAI';
  }
}

module.exports = OpenAIProvider;
