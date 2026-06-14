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
   * Generate continuation prompt that includes previous context.
   *
   * `includeOriginalTask` controls whether the full ORIGINAL TASK block is
   * re-embedded. When the prior transcript is replayed as `priorHistory` (the
   * default continuation path), the original task is already present as the
   * first history entry — re-embedding it here makes every continuation pay for
   * the same task tokens twice, which compounds on long multi-session threads.
   * Pass `false` whenever priorHistory carries the task; pass `true` only when
   * there is no replayed history to lean on (the reset path, where priorHistory
   * is empty). Defaults to `true` so existing callers are byte-for-byte
   * unchanged. The PREVIOUS CONCLUSION is always kept — the judge's synthesis is
   * not guaranteed to appear as a turn in the replayed transcript.
   */
  generateContinuationPrompt(
    originalTask: string,
    previousSolution: string | undefined,
    followUpTask: string,
    includeOriginalTask: boolean = true
  ): string {
    let prompt = `This is a continuation of a previous discussion.\n\n`;
    if (includeOriginalTask) {
      prompt += `ORIGINAL TASK:\n${originalTask}\n\n`;
    }

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

    // Filter out orphan judge guidance from the parent session (INTEG-03)
    const filteredHistory = existingHistory.filter(
      msg => !(msg.role === 'user' && msg.speaker === 'Judge')
    );

    // Phase 18 (AUDIT-03): derive the resume round from the maximum stamped
    // roundNumber in the prior history. Falls back to filteredHistory.length
    // only when NO entry is stamped (legacy sessions). The filtered history may
    // omit Judge entries (INTEG-03), so array length is an especially poor
    // fallback — but it preserves the pre-Phase-18 behaviour for ancient
    // session.json files that lack roundNumber stamps entirely.
    const maxStampedRound = filteredHistory.reduce(
      (acc, msg) => (typeof msg.roundNumber === 'number' && msg.roundNumber > acc ? msg.roundNumber : acc),
      0
    );
    const resumeRound = maxStampedRound > 0 ? maxStampedRound : filteredHistory.length;

    // Create a system message marking the continuation point
    const continuationMarker: SessionMessage = {
      role: 'system',
      content: '[CONTINUATION FROM PREVIOUS SESSION]',
      speaker: 'System',
      timestamp: new Date().toISOString(),
      roundNumber: resumeRound, // Phase 18 (AUDIT-03): marker closes the parent's final round
      isContinuation: true,
    };

    // Create the new user message with continuation context
    const userMessage: SessionMessage = {
      role: 'user',
      content: continuationPrompt,
      speaker: 'System',
      timestamp: new Date().toISOString(),
      roundNumber: resumeRound + 1, // Phase 18 (AUDIT-03): new follow-up task opens the next round
      isContinuation: true,
      continuationContext: followUpTask,
    };

    // Return merged history
    return [...filteredHistory, continuationMarker, userMessage];
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
        // Phase 18 (AUDIT-03): reset continuations inherit the parent's final round
        // so the resumed ConversationManager.currentRound + message stamps agree.
        roundNumber: session.currentRound ?? 0,
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

    // Generate new task that includes follow-up. Only the reset path embeds the
    // ORIGINAL TASK: its priorHistory is empty, so newTask is the sole carrier of
    // prior context. The full-history and compress paths replay the original task
    // as the first priorHistory entry, so re-embedding it here would double-bill
    // the same tokens on every continuation (the reported balloon).
    const newTask = this.generateContinuationPrompt(
      session.task,
      session.finalSolution,
      followUpTask,
      shouldResetDiscussion
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
    // Filter out orphan judge guidance before compressing (INTEG-03)
    const filteredHistory = history.filter(
      msg => !(msg.role === 'user' && msg.speaker === 'Judge')
    );

    // Keep first message, last few messages, and add continuation
    const compressed: SessionMessage[] = [];

    // Keep initial task
    if (filteredHistory.length > 0) {
      compressed.push(filteredHistory[0]);
    }

    // Add summary marker
    const summaryMarker: SessionMessage = {
      role: 'system',
      content: `[${filteredHistory.length - 2} messages summarized]\n\nKey outcome: ${previousSolution || 'Discussion completed'}`,
      speaker: 'System',
      timestamp: new Date().toISOString(),
      roundNumber: 1,
    };
    compressed.push(summaryMarker);

    // Keep last 3 messages
    const recentMessages = filteredHistory.slice(-3);
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
