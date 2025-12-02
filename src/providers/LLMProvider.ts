import { Message, ProviderResponse, ChatOptions } from '../types';

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
   * @param messages - Array of message objects
   * @param systemPrompt - Optional system prompt to guide the LLM
   * @param options - Optional parameters like tools
   * @returns The LLM's response with text and optional tool calls
   */
  abstract chat(messages: Message[], systemPrompt?: string | null, options?: ChatOptions): Promise<ProviderResponse>;

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
