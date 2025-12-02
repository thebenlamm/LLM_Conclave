import { Message, ProviderResponse, ChatOptions } from '../types';
import { CostTracker } from '../core/CostTracker';

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
   * Send a message to the LLM and get a response.
   * This method handles the timing and cost tracking for the call.
   * @param messages - Array of message objects
   * @param systemPrompt - Optional system prompt to guide the LLM
   * @param options - Optional parameters like tools
   * @returns The LLM's response with text and optional tool calls
   */
  async chat(messages: Message[], systemPrompt?: string | null, options?: ChatOptions): Promise<ProviderResponse> {
    const startTime = Date.now();
    let success = false;
    let response: ProviderResponse;

    try {
      response = await this.performChat(messages, systemPrompt, options);
      success = true;
      return response;
    } catch (error) {
      // Re-throw the error after logging
      throw error;
    } finally {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // @ts-ignore
      const inputTokens = response?.usage?.input_tokens || 0;
      // @ts-ignore
      const outputTokens = response?.usage?.output_tokens || 0;

      CostTracker.getInstance().logCall({
        provider: this.getProviderName(),
        model: this.getModelName(),
        inputTokens,
        outputTokens,
        latency,
        success,
      });
    }
  }

  /**
   * The method that concrete providers must implement to make the actual API call.
   * @param messages - Array of message objects
   * @param systemPrompt - Optional system prompt to guide the LLM
   * @param options - Optional parameters like tools
   * @returns The LLM's response
   */
  protected abstract performChat(messages: Message[], systemPrompt?: string | null, options?: ChatOptions): Promise<ProviderResponse>;


  /**
   * Get the provider name
   */
  abstract getProviderName(): string;

  /**
   * Get the model name
   */
  getModelName(): string {
    return this.modelName;
  }
}
