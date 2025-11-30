/**
 * Base class for all LLM providers
 * Defines the interface that all LLM implementations must follow
 */
export default abstract class LLMProvider {
  modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  /**
   * Send a message to the LLM and get a response
   * @param {Array} messages - Array of message objects with {role, content}
   * @param {string} systemPrompt - Optional system prompt to guide the LLM
   * @param {Object} options - Optional parameters like tools
   * @returns {Promise<any>} - The LLM's response (string or object with tool calls)
   */
  abstract chat(messages: any[], systemPrompt?: string | null, options?: any): Promise<any>;

  /**
   * Get the provider name
   * @returns {string}
   */
  abstract getProviderName(): string;

  /**
   * Get the model name
   * @returns {string}
   */
  getModelName(): string {
    return this.modelName;
  }
}
