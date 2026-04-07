import ProviderFactory from '../providers/ProviderFactory.js';
import TokenCounter from '../utils/TokenCounter.js';
import { DiscussionStateExtractor } from './DiscussionStateExtractor.js';
import type { DiscussionHistoryEntry, Config } from '../types/index.js';
import type ConversationHistory from './ConversationHistory.js';
import type { EventBus } from './EventBus.js';
import type { CostTracker } from './CostTracker.js';

/**
 * Detects context overflow and TPM rate limit errors from any provider.
 * Regex-only because providers strip .status when re-throwing errors.
 *
 * SOLE OWNER: This constant lives ONLY in JudgeEvaluator.
 * It is used by judgeEvaluate and conductFinalVote for retry on context overflow.
 * AgentTurnExecutor does NOT use this pattern (it handles overflow via message preparation).
 */
const CONTEXT_OVERFLOW_PATTERN = /context.?length|token.?limit|too.?long|max.?tokens|content_too_large|TPM:\s*Limit|tokens?\s*per\s*min|Request too large for \w/i;

export interface JudgeEvaluatorDeps {
  conversationHistory: DiscussionHistoryEntry[];
  history: ConversationHistory;
  config: Config;
  agents: { [key: string]: any };
  agentOrder: string[];
  getCurrentRound: () => number;
  judgeInstructions: string | null;
  eventBus?: EventBus;
  abortSignal?: AbortSignal;
  costTracker: CostTracker;
  streamOutput: boolean;
  getPersistentlyFailedAgents: () => Set<string>;
}

/**
 * Owns all judge evaluation logic extracted from ConversationManager.
 *
 * Extracted from ConversationManager as part of the god-class decomposition (Plan 02-03).
 * Responsible for:
 *   - Building judge context (case file, discussion text, state)
 *   - Detecting shallow agreement, excessive quoting, rubber-stamping
 *   - Calling judge LLM for consensus evaluation (judgeEvaluate)
 *   - Conducting final vote when max rounds reached (conductFinalVote)
 *   - Falling back to heuristic summary when judge LLM fails (bestEffortJudgeResult)
 */
export default class JudgeEvaluator {
  // Judge discussion caching — owned by this class
  private cachedRecentDiscussion: string = '';
  private lastJudgeCacheRound: number = 0;
  // QUAL-03: Track prior round guidance to prevent duplicate judge directions
  private priorGuidance: string[] = [];

  constructor(private deps: JudgeEvaluatorDeps) {}

  // ── Private utilities ────────────────────────────────────────────────────────

  /**
   * Create a per-call AbortController that respects the main abort signal.
   * Copied from ConversationManager — this is the authoritative copy (moved with judge methods).
   * AgentTurnExecutor has its own independent copy for agent turns.
   * @param timeoutMs - Per-call timeout in milliseconds (default: 150s)
   */
  private createCallAbortController(timeoutMs: number = 150_000): { controller: AbortController; cleanup: () => void } {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('per-call timeout'), timeoutMs);

    let onMainAbort: (() => void) | undefined;
    if (this.deps.abortSignal) {
      if (this.deps.abortSignal.aborted) {
        controller.abort('main abort');
        clearTimeout(timeout);
      } else {
        onMainAbort = () => controller.abort('main abort');
        this.deps.abortSignal.addEventListener('abort', onMainAbort, { once: true });
      }
    }

    const cleanup = () => {
      clearTimeout(timeout);
      if (onMainAbort && this.deps.abortSignal) {
        this.deps.abortSignal.removeEventListener('abort', onMainAbort);
      }
    };

    return { controller, cleanup };
  }

  /**
   * Build chat options with streaming callbacks when enabled.
   * Mirrors ConversationManager.getChatOptions() for judge-specific calls.
   */
  private getChatOptions(agentName?: string): any {
    const options: any = {};

    if (this.deps.streamOutput) {
      options.stream = true;
      options.onToken = (token: string) => {
        if (this.deps.streamOutput) process.stdout.write(token);
        if (this.deps.eventBus && agentName) {
          this.deps.eventBus.emitEvent('token', { agent: agentName, token });
        }
      };
    }

    return options;
  }

  /**
   * Parse structured output from judge responses.
   * Extracts KEY_DECISIONS, ACTION_ITEMS, DISSENT, and CONFIDENCE from text.
   * Moved from ConversationManager — only used by judge methods.
   */
  private parseStructuredOutput(text: string): {
    summary: string;
    keyDecisions: string[];
    actionItems: string[];
    dissent: string[];
    confidence: string;
  } {
    if (!text) {
      return { summary: '', keyDecisions: [], actionItems: [], dissent: [], confidence: 'LOW' };
    }

    const extractSection = (sectionName: string): string[] => {
      const regex = new RegExp(`${sectionName}:\\s*\\n((?:- [^\\n]+\\n?)+)`, 'i');
      const match = text.match(regex);
      if (!match) return [];
      return match[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(line => line.length > 0 && line.toLowerCase() !== 'none');
    };

    const summaryMatch = text.match(/SUMMARY:\s*\n([^\n]+(?:\n[^\n]+)*?)(?=\n\nKEY_DECISIONS:|$)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);

    return {
      summary: summaryMatch ? summaryMatch[1].trim() : text.replace('CONSENSUS_REACHED', '').trim(),
      keyDecisions: extractSection('KEY_DECISIONS'),
      actionItems: extractSection('ACTION_ITEMS'),
      dissent: extractSection('DISSENT'),
      confidence: confidenceMatch ? confidenceMatch[1].toUpperCase() : 'MEDIUM'
    };
  }

  /**
   * Calculate which round an entry belongs to based on its position in history.
   * Determines round by counting agent responses before the entry.
   */
  private getRoundForEntry(entry: DiscussionHistoryEntry): number {
    const index = this.deps.conversationHistory.indexOf(entry);
    if (index <= 0) return 1; // Initial task is round 1

    // Count how many complete agent cycles have occurred before this entry
    // Each round = agentOrder.length agent responses + judge guidance
    const agentResponsesBefore = this.deps.conversationHistory
      .slice(1, index) // Skip initial task
      .filter(e => e.role === 'assistant' && e.speaker !== 'Judge').length;

    return Math.floor(agentResponsesBefore / this.deps.agentOrder.length) + 1;
  }

  /**
   * Build a case-file header for the judge with critical information placed at the
   * start (high attention zone per LLM U-shaped attention). Extracts:
   * - The original task/question
   * - Each agent's current position (from the latest round)
   * - Points of disagreement between agents
   *
   * This is deterministic extraction — no LLM calls.
   */
  private buildCaseFile(): string {
    // Extract the original task from the first user message
    const firstUserMsg = this.deps.conversationHistory.find(
      (e) => e.role === 'user' && e.speaker === 'System'
    );
    const taskText = firstUserMsg
      ? firstUserMsg.content.replace(/^Task:\s*/i, '').trim()
      : 'Unknown task';

    // Extract per-agent positions from the latest round
    const roundGroups = this.deps.history.groupHistoryByRound();
    const lastRound = roundGroups.length > 0 ? roundGroups[roundGroups.length - 1] : null;

    const agentPositions: { name: string; position: string }[] = [];
    if (lastRound) {
      for (const entry of lastRound.entries) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          // Extract the last paragraph as position summary (most likely contains conclusion)
          const paragraphs = entry.content.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
          const lastParagraph = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1].trim() : '';
          // Fallback: if the last paragraph is very short, take last 2 paragraphs
          let position: string;
          if (lastParagraph.length < 50 && paragraphs.length >= 2) {
            position = paragraphs.slice(-2).join(' ').trim();
          } else {
            position = lastParagraph;
          }
          // Cap at 300 chars to keep the case file concise
          if (position.length > 300) {
            position = position.substring(0, 297) + '...';
          }
          agentPositions.push({ name: entry.speaker, position });
        }
      }
    }

    // Identify disagreements: look for contradiction/disagreement markers between agents
    const disagreements: string[] = [];
    if (lastRound) {
      const agentContents = lastRound.entries
        .filter((e: any) => e.role === 'assistant' && e.speaker !== 'Judge' && !e.error)
        .map((e: any) => ({ name: e.speaker, content: e.content.toLowerCase() }));

      // Check for explicit disagreement language referencing other agents
      const disagreementPatterns = /(?:disagree|differ|however|on the other hand|unlike|contrary to|pushback|concern about|risk with|problem with|issue with|but I think|I'd argue|not convinced)/i;
      for (const agent of agentContents) {
        if (disagreementPatterns.test(agent.content)) {
          // Find which other agent they might be disagreeing with
          for (const other of agentContents) {
            if (other.name !== agent.name && agent.content.includes(other.name.toLowerCase())) {
              disagreements.push(`${agent.name} vs ${other.name}`);
            }
          }
          // If no specific agent referenced, note the general disagreement
          if (!agentContents.some(o => o.name !== agent.name && agent.content.includes(o.name.toLowerCase()))) {
            disagreements.push(`${agent.name} raised concerns`);
          }
        }
      }
    }

    // Build the case file
    let caseFile = '=== CASE FILE ===\n\n';
    caseFile += `Task: ${taskText}\n\n`;

    if (agentPositions.length > 0) {
      caseFile += 'Current Agent Positions:\n';
      for (const ap of agentPositions) {
        caseFile += `- ${ap.name}: ${ap.position}\n`;
      }
      caseFile += '\n';
    }

    if (disagreements.length > 0) {
      const uniqueDisagreements = [...new Set(disagreements)];
      caseFile += 'Disagreements:\n';
      for (const d of uniqueDisagreements) {
        caseFile += `- ${d}\n`;
      }
      caseFile += '\n';
    } else {
      caseFile += 'Disagreements: None detected (agents may be in agreement)\n\n';
    }

    caseFile += '=== END CASE FILE ===\n';

    return caseFile;
  }

  /**
   * Prepare discussion text for the judge, compressing middle rounds if the
   * full text would exceed the judge model's context window.
   * Prepends a case-file header with critical info for U-shaped attention optimization.
   */
  private prepareJudgeContext(judge: any, discussionText: string): string {
    const limits = TokenCounter.getModelLimits(judge.model);
    // Reserve ~6K for the prompt template + system prompt + response
    const budget = limits.maxInput - 6000;

    // Build case file header (placed at START for high attention)
    // Cap case file + state at 30% of budget to guarantee discussion space
    const maxHeaderPercent = 0.3;
    const headerBudget = Math.floor(budget * maxHeaderPercent);

    let caseFile = this.buildCaseFile();
    let caseFileTokens = TokenCounter.estimateTokens(caseFile);

    // Extract discussion state for richer judge signal (Phase 2 Context Tax)
    const roundGroups = this.deps.history.groupHistoryByRound();
    const currentRound = roundGroups.length > 0 ? roundGroups[roundGroups.length - 1].round : 1;
    const discussionState = DiscussionStateExtractor.extract(roundGroups, currentRound);
    const stateText = discussionState ? DiscussionStateExtractor.format(discussionState) : '';
    const stateTokens = stateText ? TokenCounter.estimateTokens(stateText) : 0;

    // Truncate case file if it exceeds the header budget
    if (caseFileTokens + stateTokens > headerBudget) {
      const caseFileBudget = Math.max(1000, headerBudget - stateTokens);
      const { text } = TokenCounter.truncateText(caseFile, caseFileBudget);
      caseFile = text;
      caseFileTokens = TokenCounter.estimateTokens(caseFile);
      console.log(`[Judge: case file truncated to fit 30% budget cap (${caseFileTokens} tokens)]`);
    }

    // Budget for the discussion text after accounting for the case file and state
    const discussionBudget = Math.max(0, budget - caseFileTokens - stateTokens);
    const textTokens = TokenCounter.estimateTokens(discussionText);

    if (textTokens <= discussionBudget) {
      return caseFile + '\n' + stateText + '\n' + discussionText;
    }

    // Compress middle rounds using the shared helper
    console.log(`[Judge context: ${textTokens} tokens exceeds ${judge.model} budget (${discussionBudget} after case file), compressing]`);

    if (roundGroups.length <= 3) {
      // Not enough rounds to selectively compress — truncate text directly
      const { text } = TokenCounter.truncateText(discussionText, discussionBudget);
      return caseFile + '\n' + stateText + '\n' + text;
    }

    // Keep first round + last 2 rounds verbatim, compress middle
    const parts: string[] = [];
    for (let i = 0; i < roundGroups.length; i++) {
      const group = roundGroups[i];
      const isFirst = i === 0;
      const isLastTwo = i >= roundGroups.length - 2;

      if (isFirst || isLastTwo) {
        for (const entry of group.entries) {
          parts.push(`[Round ${group.round}] ${entry.speaker}: ${entry.content}`);
        }
      } else {
        const summary = TokenCounter.summarizeRoundEntries(group.entries);
        parts.push(`[Round ${group.round} - compressed]\n${summary}`);
      }
    }

    const compressed = parts.join('\n\n');
    const compressedTokens = TokenCounter.estimateTokens(compressed);
    console.log(`[Judge context compressed: ${textTokens} → ${compressedTokens} tokens]`);

    // If still over budget after compression, truncate as last resort
    if (compressedTokens > discussionBudget) {
      const { text } = TokenCounter.truncateText(compressed, discussionBudget);
      return caseFile + '\n' + stateText + '\n' + text;
    }

    return caseFile + '\n' + stateText + '\n' + compressed;
  }

  /**
   * Generate a best-effort judge result from raw history without an LLM call.
   * Used as ultimate fallback when the judge model itself fails.
   * Public so ConversationManager can use it as a last-resort fallback in degraded paths.
   */
  bestEffortJudgeResult(): {
    consensusReached: boolean;
    solution: string;
    guidance: string;
    keyDecisions: string[];
    actionItems: string[];
    dissent: string[];
    confidence: string;
  } {
    // Extract unique agent positions from the last round
    const roundGroups = this.deps.history.groupHistoryByRound();
    const lastRound = roundGroups[roundGroups.length - 1];
    const agentPositions: string[] = [];

    if (lastRound) {
      for (const entry of lastRound.entries) {
        if (entry.role === 'assistant' && entry.speaker !== 'Judge' && !entry.error) {
          // Take first 2 sentences as position summary
          const sentences = entry.content.match(/[^.!?]*[.!?]/g);
          const summary = sentences
            ? sentences.slice(0, 2).join('').trim()
            : entry.content.substring(0, 200).trim();
          agentPositions.push(`${entry.speaker}: ${summary}`);
        }
      }
    }

    const solution = agentPositions.length > 0
      ? `Best-effort summary (judge unavailable):\n${agentPositions.join('\n')}`
      : 'Discussion occurred but judge was unable to summarize results.';

    return {
      consensusReached: false,
      solution,
      guidance: 'Judge evaluation failed. Summary generated from last round agent positions.',
      keyDecisions: [],
      actionItems: [],
      dissent: ['Judge model exceeded context limits — results are approximate'],
      confidence: 'LOW'
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Invalidate the cached discussion text.
   * Called by ConversationHistory's onCacheInvalidated callback after compression,
   * ensuring the next judgeEvaluate call rebuilds the full discussion text.
   */
  invalidateCache(): void {
    this.cachedRecentDiscussion = '';
    this.lastJudgeCacheRound = 0;
    this.priorGuidance = [];
  }

  /**
   * Judge evaluates if consensus has been reached.
   * Uses cached FULL discussion to ensure judge sees complete decision journey.
   * @param judge - Judge instance with provider, model, and systemPrompt
   * @returns { consensusReached: boolean, solution?: string, guidance?: string, ... }
   */
  async judgeEvaluate(judge: any) {
    try {
      // Cache formatted FULL discussion instead of rebuilding each time.
      // CRITICAL: We must pass the full history so the judge sees the complete decision journey,
      // including proposals that were made AND rejected. Without full context, the judge may
      // hallucinate decisions that were actually rejected in earlier rounds.
      const currentRound = this.deps.getCurrentRound();
      if (!this.cachedRecentDiscussion || this.lastJudgeCacheRound !== currentRound) {
        this.cachedRecentDiscussion = this.deps.conversationHistory
          .map(entry => `[Round ${this.getRoundForEntry(entry)}] ${entry.speaker}: ${entry.content}`)
          .join('\n\n');

        this.lastJudgeCacheRound = currentRound;
      }

      // Detect if agents are just agreeing without adding value
      const agreementPatterns = /I agree|I concur|well said|exactly right|nothing to add|fully support/gi;
      const agreementMatches = this.cachedRecentDiscussion.match(agreementPatterns) || [];
      const isShallowAgreement = agreementMatches.length >= 2;

      // Detect if agents are quoting each other extensively in the current round
      const currentRoundText = this.deps.conversationHistory
        .filter(e => this.getRoundForEntry(e) === currentRound && e.role === 'assistant' && e.speaker !== 'Judge')
        .map(e => e.content)
        .join('\n');
      const quotingPatterns = /as .{2,30} (?:noted|mentioned|pointed out|said|observed|highlighted|emphasized|stated)/gi;
      const quotingMatches = currentRoundText.match(quotingPatterns) || [];
      const isExcessiveQuoting = quotingMatches.length >= 3;

      // Check which agents have contributed to the discussion
      const contributingAgents = new Set<string>();
      for (const entry of this.deps.conversationHistory) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          contributingAgents.add(entry.speaker);
        }
      }
      const activeAgents = this.deps.agentOrder.filter(agent => !this.deps.getPersistentlyFailedAgents().has(agent));
      const allAgentsContributed = activeAgents.every(agent => contributingAgents.has(agent));
      const missingAgents = activeAgents.filter(agent => !contributingAgents.has(agent));

      // Detect rubber-stamping: agents respond to proposals with praise but no challenge
      const currentRoundEntries = this.deps.conversationHistory
        .filter(e => this.getRoundForEntry(e) === currentRound && e.role === 'assistant' && e.speaker !== 'Judge' && !e.error);
      let isRubberStamped = false;
      if (currentRoundEntries.length >= 2) {
        const challengePatterns = /\?|however|\bbut\b|\brisk\b|concern|downside|problem|what if|what about|trade.?off|cost of|\bchallenge\b|disagree|alternative/i;
        const entriesWithChallenge = currentRoundEntries.filter(e => challengePatterns.test(e.content));
        isRubberStamped = entriesWithChallenge.length < Math.ceil(currentRoundEntries.length / 2);
      }

      let roundContext = '';
      if (!allAgentsContributed) {
        roundContext = `\n\n⚠️ WARNING: Not all agents have contributed yet. Missing: ${missingAgents.join(', ')}. Consensus CANNOT be declared until all agents have had a chance to speak.`;
      } else if (isExcessiveQuoting) {
        roundContext = `\n\nNote: Agents are quoting each other extensively instead of adding new ideas. In your guidance, tell them: "STOP restating what others said. Reference ideas briefly then ADD something new — a counterargument, an edge case, a concrete implementation detail. If you have nothing new, say so in one sentence."`;
      } else if (isRubberStamped && currentRound <= 2) {
        roundContext = `\n\nNote: This round's responses showed mostly agreement without substantive challenge. No agent asked probing questions about risks, costs, or implementation feasibility. In your evaluation, treat this as premature consensus. Your guidance should name specific agents and ask them to identify concrete risks or trade-offs.`;
      } else if (currentRound > 2 && isShallowAgreement) {
        roundContext = `\n\nNote: This is round ${currentRound}. The agents appear to be agreeing superficially. Push them to challenge assumptions, explore edge cases, or identify weaknesses that haven't been addressed.`;
      }

      // Compress discussion text if it would overflow the judge's context window.
      // prepareJudgeContext() prepends a case file header at the START (high attention zone).
      const fittedDiscussion = this.prepareJudgeContext(judge, this.cachedRecentDiscussion);

      // Structure: Case file (START - high attention) -> Discussion (MIDDLE) -> Judge instruction (END - highest attention)
      const judgePrompt = `${fittedDiscussion}
${roundContext}

Given the case file and discussion above, evaluate whether the agents have reached GENUINE consensus. True consensus requires:
1. All active agents must have contributed at least once (agents disabled by errors are excluded)
2. Specific, actionable recommendations (not vague agreement)
3. Trade-offs acknowledged and resolved
4. Potential objections addressed (not just glossed over)
5. Each agent contributing distinct value (not just echoing others)
6. Novel proposals were CHALLENGED before acceptance (not just praised)
7. At least one agent explicitly acknowledged a trade-off they're accepting

WARNING: The following are NOT genuine consensus:
- "I agree with X" without stating what trade-off you're accepting
- A novel idea accepted without anyone questioning implementation risks
- Agents converging without any position changes from Round 1
- "Well said" or "exactly right" without adding new substance

A consensus is GENUINE when:
- At least one agent CHANGED their initial position and stated why
- Trade-offs were named (not just acknowledged abstractly)
- Novel proposals were stress-tested (risks, costs, edge cases explored)

If YES (genuine consensus reached), respond with EXACTLY this format:
CONSENSUS_REACHED

SUMMARY:
[2-3 sentence summary of the FINAL agreed solution]

CRITICAL SUMMARY RULES:
- ONLY summarize what the agents FINALLY agreed upon
- Do NOT include proposals that were mentioned but later REJECTED or SUPERSEDED
- Do NOT synthesize a "balanced" view that includes options the agents explicitly moved away from
- If an option was proposed in Round 1 but rejected in Round 2, it should NOT appear in the summary
- The summary must reflect the ACTUAL FINAL POSITION, not a compromise of all positions mentioned

KEY_DECISIONS:
- [Decision 1 - must reflect final agreed position only]
- [Decision 2]
- [etc.]

ACTION_ITEMS:
- [Action 1]
- [Action 2]
- [etc.]

DISSENT:
- [Any minority opinions or unresolved concerns, or "None" if full agreement]

CONFIDENCE: [HIGH/MEDIUM/LOW based on strength of agreement]

If NO (no genuine consensus), provide SPECIFIC, CHALLENGING guidance. Name agents directly:
- If agents agreed too quickly: "STOP. [Agent name] proposed [idea] and it was accepted without challenge. [Other agent], identify the single biggest implementation risk or hidden cost. [Third agent], what assumption is this idea relying on that might be wrong?"
- If shallow agreement: "Each agent stated a position but no one pushed back. [Agent name], play devil's advocate: what's the strongest argument AGAINST the current direction?"
- If discussion is circular: "We've covered [X] enough. Focus next on [unexplored aspect Y]."
- If one perspective is missing: "No one has addressed [gap]. [Agent name], challenge the current thinking from your expertise."

Your guidance should FORCE new insights, not just encourage more discussion. Always name specific agents and give them specific tasks.`;

      // QUAL-03: Inject prior round guidance so the judge doesn't repeat itself
      let priorGuidanceBlock = '';
      if (this.priorGuidance.length > 0) {
        const priorText = this.priorGuidance
          .map((g, i) => `Round ${i + 1}: ${g.substring(0, 500)}`)
          .join('\n');
        priorGuidanceBlock = `\n\nYour PREVIOUS guidance to agents (DO NOT repeat these — give NEW, DIFFERENT direction):\n${priorText}\n\nYou MUST provide guidance that differs from what you said before. If agents followed your prior guidance, acknowledge progress and push them further. If they ignored it, escalate with more specific instructions.`;
      }

      const judgePromptWithHistory = `${judgePrompt}${priorGuidanceBlock}`;
      const finalJudgePrompt = this.deps.judgeInstructions
        ? `${judgePromptWithHistory}\n\nADDITIONAL INSTRUCTIONS FROM CALLER:\n${this.deps.judgeInstructions}`
        : judgePromptWithHistory;

      const messages = [
        {
          role: 'user',
          content: finalJudgePrompt
        }
      ];

      const { controller: judgeController, cleanup: judgeCleanup } = this.createCallAbortController();
      let response;
      try {
        const judgeOpts = { ...this.getChatOptions('Judge'), signal: judgeController.signal };
        response = await judge.provider.chat(messages, judge.systemPrompt, judgeOpts);
      } finally {
        judgeCleanup();
      }
      const text = typeof response === 'string' ? response : (response.text ?? '');

      if (this.deps.streamOutput) {
        process.stdout.write('\n');
      }

      // Check if consensus reached
      if (text.includes('CONSENSUS_REACHED')) {
        const structured = this.parseStructuredOutput(text);
        return {
          consensusReached: true,
          solution: structured.summary,
          keyDecisions: structured.keyDecisions,
          actionItems: structured.actionItems,
          dissent: structured.dissent,
          confidence: structured.confidence
        };
      }

      // QUAL-03: Store guidance for next round to prevent duplicate directions
      this.priorGuidance.push(text);

      return {
        consensusReached: false,
        guidance: text
      };

    } catch (error: any) {
      const errorMsg = error.message || '';
      console.error(`Error with judge evaluation: ${errorMsg}`);

      // If context overflow or TPM rate limit, retry with a cross-provider fallback model.
      // Detection is regex-only because providers strip .status when re-throwing errors.
      const isContextOverflow = CONTEXT_OVERFLOW_PATTERN.test(errorMsg);
      if (isContextOverflow) {
        // Cross provider boundaries to avoid correlated failures
        const fallbackModel = judge.model.includes('gemini') ? 'claude-sonnet-4-5' :
                              judge.model.includes('claude') ? 'gemini-2.5-flash' :
                              'gemini-2.5-flash'; // OpenAI/Grok → Gemini (1M context)
        console.log(`[Judge ${judge.model} context/TPM overflow, retrying with ${fallbackModel}]`);
        try {
          const fallbackProvider = ProviderFactory.createProvider(fallbackModel);
          const fittedDiscussion = this.prepareJudgeContext(
            { model: fallbackModel },
            this.cachedRecentDiscussion
          );
          const fallbackPrompt = `Full discussion:\n${fittedDiscussion}\n\nProvide brief guidance for the next round of discussion.`;
          const { controller: jfController, cleanup: jfCleanup } = this.createCallAbortController(60_000);
          let response;
          try {
            const jfOpts = { ...this.getChatOptions('Judge'), signal: jfController.signal };
            response = await fallbackProvider.chat(
              [{ role: 'user', content: fallbackPrompt }],
              judge.systemPrompt,
              jfOpts
            );
          } finally {
            jfCleanup();
          }
          const text = typeof response === 'string' ? response : (response.text ?? '');
          if (text && text.length > 0) {
            if (text.includes('CONSENSUS_REACHED')) {
              const structured = this.parseStructuredOutput(text);
              return {
                consensusReached: true,
                solution: structured.summary,
                keyDecisions: structured.keyDecisions,
                actionItems: structured.actionItems,
                dissent: structured.dissent,
                confidence: structured.confidence
              };
            }
            return { consensusReached: false, guidance: text };
          }
        } catch (fallbackError: any) {
          console.error(`[Judge fallback also failed: ${fallbackError.message}]`);
        }

        // Ultimate fallback: heuristic summary without LLM
        console.log(`[Judge: using best-effort heuristic summary]`);
        const bestEffort = this.bestEffortJudgeResult();
        return {
          consensusReached: false,
          guidance: bestEffort.guidance
        };
      }

      return {
        consensusReached: false,
        guidance: 'Please continue the discussion and try to reach agreement.'
      };
    }
  }

  /**
   * Conduct a final vote when max rounds reached.
   * @param judge - Judge instance with provider, model, and systemPrompt
   * @returns Structured final decision with solution, keyDecisions, actionItems, dissent, confidence
   */
  async conductFinalVote(judge: any): Promise<{
    solution: string;
    keyDecisions: string[];
    actionItems: string[];
    dissent: string[];
    confidence: string;
  }> {
    try {
      const rawDiscussion = this.deps.conversationHistory
        .map(entry => `${entry.speaker}: ${entry.content}`)
        .join('\n\n');

      // Compress if needed for judge's context window
      const fullDiscussion = this.prepareJudgeContext(judge, rawDiscussion);

      // Structure: Case file (START - high attention) -> Discussion (MIDDLE) -> Judge instruction (END - highest attention)
      const votePrompt = `${fullDiscussion}

The agents haven't reached full consensus within the allowed rounds. Given the case file and discussion above, analyze the discussion trajectory and determine the DIRECTION the agents were heading.

CRITICAL: Your summary must reflect where the discussion CONVERGED, not a "balanced synthesis" of all options mentioned.

Respond with EXACTLY this format:

SUMMARY:
[2-3 sentence summary of the direction the discussion was heading]

CRITICAL SUMMARY RULES:
- Identify which position gained the most support by the END of the discussion
- Do NOT include proposals that were mentioned but later REJECTED or SUPERSEDED
- Do NOT create a "fair compromise" that includes options agents moved away from
- If Agent A proposed X in Round 1 but agents converged on Y in later rounds, summarize Y not X
- The summary must reflect the ACTUAL TRAJECTORY, not an average of all positions

KEY_DECISIONS:
- [Decision 1 - based on where discussion was heading]
- [Decision 2]
- [etc.]

ACTION_ITEMS:
- [Action 1]
- [Action 2]
- [etc.]

DISSENT:
- [Any minority opinions or unresolved concerns from specific agents]

CONFIDENCE: [HIGH/MEDIUM/LOW based on clarity of the discussion direction]`;

      const finalVotePrompt = this.deps.judgeInstructions
        ? `${votePrompt}\n\nADDITIONAL INSTRUCTIONS FROM CALLER:\n${this.deps.judgeInstructions}`
        : votePrompt;

      const messages = [
        {
          role: 'user',
          content: finalVotePrompt
        }
      ];

      const { controller: voteController, cleanup: voteCleanup } = this.createCallAbortController();
      let finalDecision;
      try {
        const voteOpts = { ...this.getChatOptions('Judge'), signal: voteController.signal };
        finalDecision = await judge.provider.chat(messages, judge.systemPrompt, voteOpts);
      } finally {
        voteCleanup();
      }
      const text = typeof finalDecision === 'string' ? finalDecision : (finalDecision.text ?? '');

      if (this.deps.streamOutput) {
        process.stdout.write('\n');
      }

      const structured = this.parseStructuredOutput(text);
      console.log(`\nJudge's Final Decision:\n${structured.summary}\n`);

      return {
        solution: structured.summary,
        keyDecisions: structured.keyDecisions,
        actionItems: structured.actionItems,
        dissent: structured.dissent,
        confidence: structured.confidence
      };

    } catch (error: any) {
      const errorMsg = error.message || '';
      console.error(`Error conducting final vote: ${errorMsg}`);

      // Detect context overflow or TPM rate limit.
      // Detection is regex-only because providers strip .status when re-throwing errors.
      const isContextOverflow = CONTEXT_OVERFLOW_PATTERN.test(errorMsg);

      if (isContextOverflow) {
        // Cross provider boundaries to avoid correlated failures
        const fallbackModel = judge.model.includes('gemini') ? 'claude-sonnet-4-5' :
                              judge.model.includes('claude') ? 'gemini-2.5-flash' :
                              'gemini-2.5-flash'; // OpenAI/Grok → Gemini (1M context)
        console.log(`[Final vote: ${judge.model} overflow, retrying with ${fallbackModel}]`);
        try {
          const fallbackProvider = ProviderFactory.createProvider(fallbackModel);
          const rawDiscussion = this.deps.conversationHistory
            .map(entry => `${entry.speaker}: ${entry.content}`)
            .join('\n\n');
          const fittedDiscussion = this.prepareJudgeContext({ model: fallbackModel }, rawDiscussion);
          const fallbackPrompt = `${fittedDiscussion}

The agents haven't reached full consensus within the allowed rounds. Given the case file and discussion above, analyze the discussion trajectory and determine the DIRECTION the agents were heading.

CRITICAL: Your summary must reflect where the discussion CONVERGED, not a "balanced synthesis" of all options mentioned.

Respond with EXACTLY this format:

SUMMARY:
[2-3 sentence summary of the direction the discussion was heading]

CRITICAL SUMMARY RULES:
- Identify which position gained the most support by the END of the discussion
- Do NOT include proposals that were mentioned but later REJECTED or SUPERSEDED
- Do NOT create a "fair compromise" that includes options agents moved away from
- The summary must reflect the ACTUAL TRAJECTORY, not an average of all positions

KEY_DECISIONS:
- [Decision 1 - based on where discussion was heading]

ACTION_ITEMS:
- [Action 1]

DISSENT:
- [Minority opinions or unresolved concerns from specific agents]

CONFIDENCE: [HIGH/MEDIUM/LOW based on clarity of the discussion direction]`;
          const { controller: fbController, cleanup: fbCleanup } = this.createCallAbortController(60_000);
          let fbResponse;
          try {
            const fbOpts = { ...this.getChatOptions('Judge'), signal: fbController.signal };
            fbResponse = await fallbackProvider.chat(
              [{ role: 'user', content: fallbackPrompt }],
              judge.systemPrompt,
              fbOpts
            );
          } finally {
            fbCleanup();
          }
          const fbText = typeof fbResponse === 'string' ? fbResponse : (fbResponse.text ?? '');
          if (fbText && fbText.length > 0) {
            const structured = this.parseStructuredOutput(fbText);
            console.log(`\nJudge's Final Decision (via ${fallbackModel}):\n${structured.summary}\n`);
            return {
              solution: structured.summary,
              keyDecisions: structured.keyDecisions,
              actionItems: structured.actionItems,
              dissent: structured.dissent,
              confidence: structured.confidence
            };
          }
        } catch (fallbackError: any) {
          console.error(`[Final vote fallback ${fallbackModel} also failed: ${fallbackError.message}]`);
        }
      }

      // Ultimate fallback: heuristic summary from discussion content (never lose the discussion)
      console.log(`[Final vote: all judge models failed, using best-effort summary from discussion]`);
      const bestEffort = this.bestEffortJudgeResult();
      return {
        solution: bestEffort.solution,
        keyDecisions: bestEffort.keyDecisions,
        actionItems: bestEffort.actionItems,
        dissent: [...bestEffort.dissent, `Judge error: ${errorMsg.substring(0, 200)}`],
        confidence: bestEffort.confidence
      };
    }
  }
}
