/**
 * Shared chat options helper for orchestrators
 *
 * This utility creates ChatOptions with streaming and event bus integration.
 * Used by both Orchestrator and IterativeCollaborativeOrchestrator to avoid duplication.
 */

import { EventBus } from '../core/EventBus';
import { ChatOptions } from '../types';

export interface ChatOptionsContext {
  streamOutput: boolean;
  eventBus: EventBus | null | undefined;
}

/**
 * Creates ChatOptions for LLM provider calls with streaming and event support.
 *
 * @param context - The context containing streamOutput flag and optional eventBus
 * @param disableStream - If true, returns empty options to disable streaming
 * @param agentName - Optional agent name for event emission
 * @returns ChatOptions configured for streaming if enabled
 */
export function createChatOptions(
  context: ChatOptionsContext,
  disableStream: boolean = false,
  agentName?: string
): ChatOptions {
  if (disableStream || (!context.streamOutput && !context.eventBus)) {
    return {};
  }

  return {
    stream: true,
    onToken: (token: string) => {
      if (context.streamOutput && !disableStream) {
        process.stdout.write(token);
      }
      if (context.eventBus && agentName) {
        context.eventBus.emitEvent('token', { agent: agentName, token });
      }
    }
  };
}
