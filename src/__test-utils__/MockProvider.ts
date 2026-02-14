import LLMProvider from '../providers/LLMProvider';
import { Message, ProviderResponse, ChatOptions } from '../types';

interface MockProviderConfig {
  responseSequence?: (ProviderResponse | Error)[];
  failOnCallIndex?: number[];
  latencyMs?: number;
  healthCheckResult?: boolean;
}

interface CallRecord {
  messages: Message[];
  systemPrompt?: string;
  options?: ChatOptions;
}

/**
 * MockProvider - Configurable mock LLM provider for testing
 *
 * Features:
 * - Returns responses from a pre-configured sequence
 * - Tracks all calls with full argument history
 * - Simulates failures at specific call indices
 * - Simulates network latency
 * - Configurable health check results
 */
export class MockProvider extends LLMProvider {
  private responseSequence: (ProviderResponse | Error)[];
  private callIndex: number = 0;
  private callHistory: CallRecord[] = [];
  private failOnCallIndex: Set<number>;
  private latencyMs: number;
  private healthCheckResult: boolean;

  constructor(config: MockProviderConfig = {}) {
    super('mock-model');
    this.responseSequence = config.responseSequence || [];
    this.failOnCallIndex = new Set(config.failOnCallIndex || []);
    this.latencyMs = config.latencyMs || 0;
    this.healthCheckResult = config.healthCheckResult ?? true;
  }

  protected async performChat(
    messages: Message[],
    systemPrompt?: string | null,
    options?: ChatOptions
  ): Promise<ProviderResponse> {
    return this.chat(messages, systemPrompt || undefined, options);
  }

  async chat(
    messages: Message[],
    systemPrompt?: string,
    options?: ChatOptions
  ): Promise<ProviderResponse> {
    // Record this call
    this.callHistory.push({ messages, systemPrompt, options });

    // Check if we should fail on this call
    if (this.failOnCallIndex.has(this.callIndex)) {
      this.callIndex++;
      throw new Error(`Mock provider configured to fail on call ${this.callIndex - 1}`);
    }

    // Simulate latency if configured
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }

    // Get the next response from the sequence
    let response: ProviderResponse | Error;

    if (this.callIndex < this.responseSequence.length) {
      response = this.responseSequence[this.callIndex];
    } else {
      // Return default response when sequence is exhausted
      response = {
        text: 'Default mock response',
        usage: { input_tokens: 10, output_tokens: 10 }
      };
    }

    this.callIndex++;

    // If response is an Error, throw it
    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  getProviderName(): string {
    return 'MockProvider';
  }

  async healthCheck(): Promise<boolean> {
    return this.healthCheckResult;
  }

  // Test utility methods

  /**
   * Get the number of times chat() was called
   */
  getCallCount(): number {
    return this.callHistory.length;
  }

  /**
   * Get the full history of all chat() calls
   */
  getCallHistory(): CallRecord[] {
    return [...this.callHistory];
  }

  /**
   * Get the arguments from a specific call (0-indexed)
   */
  getCall(index: number): CallRecord | undefined {
    return this.callHistory[index];
  }

  /**
   * Get the most recent call
   */
  getLastCall(): CallRecord | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Reset the provider state (call history and index)
   */
  reset(): void {
    this.callHistory = [];
    this.callIndex = 0;
  }

  /**
   * Add more responses to the sequence
   */
  addResponses(...responses: (ProviderResponse | Error)[]): void {
    this.responseSequence.push(...responses);
  }
}
