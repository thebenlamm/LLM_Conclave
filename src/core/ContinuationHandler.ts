import {
  SessionManifest,
  SessionMessage,
  ContinuationOptions,
  ResumableSession,
} from '../types';

/**
 * Handles continuation and resume logic for sessions
 */
export default class ContinuationHandler {
  /**
   * Validate that a session can be resumed
   */
  validateResumable(session: SessionManifest): ResumableSession {
    const warnings: string[] = [];
    let isValid = true;

    // Check if session is completed (for continuation)
    if (session.status === 'error') {
      warnings.push('Session ended with an error. Continuation may be unstable.');
    }

    // Check if conversation history exists
    if (!session.conversationHistory || session.conversationHistory.length === 0) {
      warnings.push('No conversation history found.');
      isValid = false;
    }

    // Check if we have agents configured
    if (!session.agents || session.agents.length === 0) {
      warnings.push('No agents configured in session.');
      isValid = false;
    }

    return {
      session,
      isValid,
      warnings,
    };
  }

  /**
   * Generate continuation prompt that includes previous context
   */
  generateContinuationPrompt(
    originalTask: string,
    previousSolution: string | undefined,
    followUpTask: string
  ): string {
    let prompt = `This is a continuation of a previous discussion.\n\n`;
    prompt += `ORIGINAL TASK:\n${originalTask}\n\n`;

    if (previousSolution) {
      prompt += `PREVIOUS CONCLUSION:\n${previousSolution}\n\n`;
    }

    prompt += `NEW FOLLOW-UP QUESTION/TASK:\n${followUpTask}\n\n`;
    prompt += `Please address the follow-up while considering your previous discussion. `;
    prompt += `Reference specific points from the earlier conversation if relevant.`;

    return prompt;
  }

  /**
   * Merge continuation context into conversation history
   */
  mergeContinuationContext(
    existingHistory: SessionMessage[],
    followUpTask: string,
    originalTask: string,
    previousSolution?: string
  ): SessionMessage[] {
    const continuationPrompt = this.generateContinuationPrompt(
      originalTask,
      previousSolution,
      followUpTask
    );

    // Create a system message marking the continuation point
    const continuationMarker: SessionMessage = {
      role: 'system',
      content: '[CONTINUATION FROM PREVIOUS SESSION]',
      timestamp: new Date().toISOString(),
      roundNumber: existingHistory.length,
      isContinuation: true,
    };

    // Create the new user message with continuation context
    const userMessage: SessionMessage = {
      role: 'user',
      content: continuationPrompt,
      timestamp: new Date().toISOString(),
      roundNumber: existingHistory.length + 1,
      isContinuation: true,
      continuationContext: followUpTask,
    };

    // Return merged history
    return [...existingHistory, continuationMarker, userMessage];
  }

  /**
   * Prepare session for continuation - optionally compress history to fit token limits
   */
  prepareForContinuation(
    session: SessionManifest,
    followUpTask: string,
    options?: ContinuationOptions
  ): {
    mergedHistory: SessionMessage[];
    newTask: string;
    shouldResetDiscussion: boolean;
  } {
    const shouldResetDiscussion = options?.resetDiscussion || false;
    const includeFullHistory = options?.includeFullHistory !== false; // Default true

    let mergedHistory: SessionMessage[];

    if (shouldResetDiscussion) {
      // Start fresh but provide summary context
      const summaryMessage: SessionMessage = {
        role: 'system',
        content: `Previous session context:\nTask: ${session.task}\nOutcome: ${session.finalSolution || 'Discussion completed'}`,
        timestamp: new Date().toISOString(),
        roundNumber: 0,
        isContinuation: true,
      };
      mergedHistory = [summaryMessage];
    } else if (includeFullHistory) {
      // Include full conversation history
      mergedHistory = this.mergeContinuationContext(
        session.conversationHistory,
        followUpTask,
        session.task,
        session.finalSolution
      );
    } else {
      // Include only summary + continuation
      mergedHistory = this.compressHistory(
        session.conversationHistory,
        followUpTask,
        session.task,
        session.finalSolution
      );
    }

    // Generate new task that includes follow-up
    const newTask = this.generateContinuationPrompt(
      session.task,
      session.finalSolution,
      followUpTask
    );

    return {
      mergedHistory,
      newTask,
      shouldResetDiscussion,
    };
  }

  /**
   * Compress history by keeping only key messages
   * (For future optimization when token limits are exceeded)
   */
  private compressHistory(
    history: SessionMessage[],
    followUpTask: string,
    originalTask: string,
    previousSolution?: string
  ): SessionMessage[] {
    // For now, just keep first message, last few messages, and add continuation
    const compressed: SessionMessage[] = [];

    // Keep initial task
    if (history.length > 0) {
      compressed.push(history[0]);
    }

    // Add summary marker
    const summaryMarker: SessionMessage = {
      role: 'system',
      content: `[${history.length - 2} messages summarized]\n\nKey outcome: ${previousSolution || 'Discussion completed'}`,
      timestamp: new Date().toISOString(),
      roundNumber: 1,
    };
    compressed.push(summaryMarker);

    // Keep last 3 messages
    const recentMessages = history.slice(-3);
    compressed.push(...recentMessages);

    // Add continuation context
    return this.mergeContinuationContext(
      compressed,
      followUpTask,
      originalTask,
      previousSolution
    );
  }

  /**
   * Extract summary from session for quick reference
   */
  extractSessionSummary(session: SessionManifest): string {
    let summary = `Session ${session.id}\n`;
    summary += `Mode: ${session.mode}\n`;
    summary += `Task: ${session.task}\n`;
    summary += `Rounds: ${session.currentRound}\n`;
    summary += `Status: ${session.status}\n`;

    if (session.consensusReached !== undefined) {
      summary += `Consensus: ${session.consensusReached ? 'Yes' : 'No'}\n`;
    }

    if (session.finalSolution) {
      const solutionPreview = session.finalSolution.length > 200
        ? session.finalSolution.substring(0, 200) + '...'
        : session.finalSolution;
      summary += `\nOutcome:\n${solutionPreview}\n`;
    }

    summary += `\nAgents: ${session.agents.map(a => a.name).join(', ')}`;

    return summary;
  }

  /**
   * Convert session agents back to runtime agent format
   * (This is a helper for reconstituting agents)
   */
  extractAgentConfigs(session: SessionManifest): Array<{
    name: string;
    model: string;
    systemPrompt: string;
  }> {
    return session.agents.map(agent => ({
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
    }));
  }

  /**
   * Check if models from session are still available
   * (For future enhancement - model version checking)
   */
  checkModelAvailability(session: SessionManifest): {
    available: boolean;
    missingModels: string[];
  } {
    // TODO: Implement actual model checking
    // For now, assume all models are available
    return {
      available: true,
      missingModels: [],
    };
  }
}
