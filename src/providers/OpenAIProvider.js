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

  async chat(messages, systemPrompt = null, options = {}) {
    try {
      const { tools = null } = options;
      const messageArray = [...messages];

      // Add system prompt if provided
      if (systemPrompt) {
        messageArray.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      const params = {
        model: this.modelName,
        messages: messageArray,
        temperature: 0.7,
      };

      // Add tools if provided (OpenAI format)
      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      const response = await this.client.chat.completions.create(params);

      const message = response.choices[0].message;

      // Check if response contains tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        return {
          tool_calls: message.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          })),
          text: message.content || null
        };
      }

      return { text: message.content };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  getProviderName() {
    return 'OpenAI';
  }
}

module.exports = OpenAIProvider;
