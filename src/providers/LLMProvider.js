/**
 * Base class for all LLM providers
 * Defines the interface that all LLM implementations must follow
 */
class LLMProvider {
  constructor(modelName) {
    if (this.constructor === LLMProvider) {
      throw new Error("LLMProvider is an abstract class and cannot be instantiated directly");
    }
    this.modelName = modelName;
  }

  /**
   * Send a message to the LLM and get a response
   * @param {Array} messages - Array of message objects with {role, content}
   * @param {string} systemPrompt - Optional system prompt to guide the LLM
   * @returns {Promise<string>} - The LLM's response
   */
  async chat(messages, systemPrompt = null) {
    throw new Error("chat() must be implemented by subclass");
  }

  /**
   * Get the provider name
   * @returns {string}
   */
  getProviderName() {
    throw new Error("getProviderName() must be implemented by subclass");
  }

  /**
   * Get the model name
   * @returns {string}
   */
  getModelName() {
    return this.modelName;
  }
}

module.exports = LLMProvider;
