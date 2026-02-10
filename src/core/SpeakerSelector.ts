import ProviderFactory from '../providers/ProviderFactory';
import LLMProvider from '../providers/LLMProvider';
import { EventBus } from './EventBus';
import { DEFAULT_SELECTOR_MODEL } from '../constants';

/**
 * Selection result from the speaker selector
 */
export interface SpeakerSelectionResult {
  nextSpeaker: string;
  reason: string;
  handoffRequested: boolean;  // True if previous speaker explicitly requested this agent
  shouldContinue: boolean;    // False if selector thinks round should end
  confidence: number;         // 0-1 confidence in selection
}

/**
 * Agent info for selection context
 */
export interface AgentInfo {
  name: string;
  model: string;
  expertise: string;  // Extracted from system prompt or provided
}

/**
 * Dynamic speaker selection using LLM-based analysis.
 *
 * Inspired by AutoGen's SelectorGroupChat pattern, this selector:
 * 1. Analyzes the current conversation state
 * 2. Identifies which agent would add the most value next
 * 3. Respects explicit "handoff" requests from agents
 * 4. Can signal when a round should end (all perspectives gathered)
 */
export class SpeakerSelector {
  private static readonly RECENT_MESSAGES_COUNT = 3;
  private static readonly MAX_CONTENT_PREVIEW = 300;
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;

  private selectorModel: string;
  private provider: LLMProvider;
  private agentInfos: AgentInfo[];
  private turnHistory: string[];  // Track who has spoken this round
  private eventBus?: EventBus;
  private lastHandoffRequester: string | null = null;
  private handoffChainDepth: number = 0;
  private recentHandoffPair: [string, string] | null = null;
  private consecutiveFailures: number = 0;
  private circuitBreakerOpen: boolean = false;

  /**
   * Creates an instance of SpeakerSelector.
   * @param {AgentInfo[]} agentInfos - List of agents participating in the conversation.
   * @param {string} [selectorModel=DEFAULT_SELECTOR_MODEL] - The LLM model to use for selection (default: gpt-4o-mini).
   * @param {EventBus} [eventBus] - Optional event bus for emitting selection events.
   */
  constructor(
    agentInfos: AgentInfo[],
    selectorModel: string = DEFAULT_SELECTOR_MODEL,
    eventBus?: EventBus
  ) {
    this.agentInfos = agentInfos;
    this.selectorModel = selectorModel;
    this.provider = ProviderFactory.createProvider(selectorModel);
    this.turnHistory = [];
    this.eventBus = eventBus;
  }

  /**
   * Reset turn history at the start of each round
   */
  startNewRound(): void {
    this.turnHistory = [];
    this.lastHandoffRequester = null;
    this.handoffChainDepth = 0;
    this.recentHandoffPair = null;
    // Reset circuit breaker to give model a chance in new round
    this.circuitBreakerOpen = false;
    this.consecutiveFailures = 0;
  }

  /**
   * Record that an agent has spoken
   */
  recordTurn(agentName: string): void {
    this.turnHistory.push(agentName);
  }

  /**
   * Get agents who haven't spoken this round
   */
  getAgentsWhoHaventSpoken(): string[] {
    return this.agentInfos
      .map(a => a.name)
      .filter(name => !this.turnHistory.includes(name));
  }

  /**
   * Check if an agent's response contains a handoff request
   * Looks for patterns like "I'd like to hear from Security Expert" or "@Architect"
   * 
   * Supported patterns:
   * - @AgentName
   * - "I'd like to hear from AgentName"
   * - "What does AgentName think?"
   * - "AgentName should weigh in"
   * - "Over to AgentName"
   * 
   * @param {string} response - The agent's response text.
   * @returns {string | null} - The name of the requested agent, or null if no handoff found.
   */
  detectHandoff(response: string): string | null {
    const agentNames = this.agentInfos.map(a => a.name);

    // Identify quoted ranges to ignore
    const quoteRanges: [number, number][] = [];
    // Match double quotes: "..."
    let quoteMatch;
    const doubleQuoteRegex = /"[^"]*"/g;
    while ((quoteMatch = doubleQuoteRegex.exec(response)) !== null) {
      quoteRanges.push([quoteMatch.index, quoteMatch.index + quoteMatch[0].length]);
    }
    // Match single quotes: '...' (careful with apostrophes)
    // We assume a quoted string starts with a non-word char before the quote, or is at start of line
    const singleQuoteRegex = /(?:^|[^a-zA-Z0-9])'([^']*)'/g;
    while ((quoteMatch = singleQuoteRegex.exec(response)) !== null) {
      // Adjust index to start at the quote, not the preceding char
      const start = quoteMatch.index + quoteMatch[0].indexOf("'");
      quoteRanges.push([start, start + quoteMatch[0].length]);
    }

    const isInsideQuote = (index: number) => {
      return quoteRanges.some(([start, end]) => index >= start && index < end);
    };

    // Check for explicit @mentions
    // Updated regex to support numbers and hyphens
    const mentionRegex = /@([A-Za-z0-9_-]+)/g;
    let match: RegExpExecArray | null;
    
    while ((match = mentionRegex.exec(response)) !== null) {
      if (match.index !== undefined) {
        // Skip if negated or quoted
        if (this.isNegatedHandoff(response, match.index) || isInsideQuote(match.index)) {
          continue;
        }

        const mentionedName = match[1];
        const matched = this.matchAgentName(mentionedName, agentNames);
        if (matched) return matched;
      }
    }

    // Check for "hear from X" or "what does X think" patterns
    const handoffPatterns = [
      /I(?:'d| would) (?:like|love) to hear (?:from |what )([A-Za-z0-9_-]+)/ig,
      /what does ([A-Za-z0-9_-]+) think/ig,
      /([A-Za-z0-9_-]+) should (?:weigh in|respond|comment)/ig,
      /pass(?:ing)? (?:this )?to ([A-Za-z0-9_-]+)/ig,
      /over to (?:you,? )?([A-Za-z0-9_-]+)/ig,
    ];

    for (const pattern of handoffPatterns) {
      // Reset lastIndex for global regexes used in loop
      pattern.lastIndex = 0;
      
      while ((match = pattern.exec(response)) !== null) {
        if (match.index !== undefined) {
          // Skip if negated or quoted
          if (this.isNegatedHandoff(response, match.index) || isInsideQuote(match.index)) {
            continue;
          }

          const mentionedName = match[1];
          const matched = this.matchAgentName(mentionedName, agentNames);
          if (matched) return matched;
        }
      }
    }

    return null;
  }

  /**
   * Check if a match is preceded by negation markers
   */
  private isNegatedHandoff(response: string, matchIndex: number): boolean {
    // Look at up to 25 chars before the match to catch immediate context
    // but avoid reaching back into previous clauses (e.g. "I don't like X, but pass to Y")
    const startIndex = Math.max(0, matchIndex - 25);
    const precedingContext = response.substring(startIndex, matchIndex);

    // Check for negation words
    const negationPattern = /\b(don'?t|shouldn'?t|not|never|avoid|disagree(?: with)?)\b/i;
    return negationPattern.test(precedingContext);
  }

  /**
   * Match a mentioned name against available agent names with priority.
   *
   * Only exact and word-boundary matches are allowed to prevent false positives
   * like "security logs" triggering a handoff to "Security" agent.
   */
  private matchAgentName(mentioned: string, agentNames: string[]): string | null {
    const normalizedMentioned = mentioned.toLowerCase().replace(/_/g, '-');

    // 1. Exact match (case-insensitive, normalizing underscores/hyphens)
    const exactMatch = agentNames.find(name =>
      name.toLowerCase().replace(/_/g, '-') === normalizedMentioned
    );
    if (exactMatch) return exactMatch;

    // 2. Word boundary match
    // Checks if the mentioned name exists as a distinct word part of an agent name
    // e.g. "security" matching "security-expert" but NOT "security" in "security-policy"
    // The agent name must START with or END with the mentioned term as a word boundary
    const wordBoundaryMatch = agentNames.find(name => {
      const normalizedName = name.toLowerCase().replace(/_/g, '-');
      // Must match at word boundary AND be a prefix/suffix of the agent name
      // This prevents "security" from matching random text containing "security"
      const startsWithPattern = new RegExp(`^${normalizedMentioned}(?:[-_]|$)`, 'i');
      const endsWithPattern = new RegExp(`(?:^|[-_])${normalizedMentioned}$`, 'i');
      return startsWithPattern.test(normalizedName) || endsWithPattern.test(normalizedName);
    });
    if (wordBoundaryMatch) return wordBoundaryMatch;

    // NOTE: Loose matching (includes) was removed to prevent false positives
    // like "I will check the security logs" triggering a handoff to "Security" agent.
    // If explicit handoff is needed, use @AgentName syntax or exact agent name.

    return null;
  }

  /**
   * Select the next speaker using LLM analysis
   * 
   * @param {any[]} conversationHistory - History of the conversation so far.
   * @param {string | null} lastSpeaker - Name of the agent who spoke last.
   * @param {string | null} lastResponse - Content of the last message.
   * @param {number} currentRound - Current round number.
   * @param {string} task - The main task or question being discussed.
   * @param {Set<string>} excludeAgents - Optional set of agents to exclude from selection (e.g. failed agents).
   * @returns {Promise<SpeakerSelectionResult>} - Result containing the next speaker, reason, and control flags.
   */
  async selectNextSpeaker(
    conversationHistory: any[],
    lastSpeaker: string | null,
    lastResponse: string | null,
    currentRound: number,
    task: string,
    excludeAgents: Set<string> = new Set()
  ): Promise<SpeakerSelectionResult> {
    const allAgents = this.agentInfos
      .map(a => a.name)
      .filter(name => !excludeAgents.has(name));

    if (allAgents.length === 0) {
      return {
        nextSpeaker: '',
        reason: 'No available agents (all excluded)',
        handoffRequested: false,
        shouldContinue: false,
        confidence: 0.0
      };
    }

    // Circuit Breaker Check
    if (this.circuitBreakerOpen) {
      // Revert to simple round-robin: pick agent who has spoken least
      const turnCounts = new Map<string, number>();
      for (const agent of allAgents) {
        turnCounts.set(agent, this.turnHistory.filter(t => t === agent).length);
      }
      
      const sortedCandidates = [...turnCounts.entries()]
        .filter(([name]) => name !== lastSpeaker)
        .sort((a, b) => a[1] - b[1]);

      // If the only remaining agent is the lastSpeaker, end the round
      if (sortedCandidates.length === 0) {
        return {
          nextSpeaker: '',
          reason: 'Circuit breaker: only remaining agent already spoke last; ending round',
          handoffRequested: false,
          shouldContinue: false,
          confidence: 0.5
        };
      }

      const nextSpeaker = sortedCandidates[0][0];

      return {
        nextSpeaker: nextSpeaker,
        reason: 'Circuit breaker: round-robin fallback',
        handoffRequested: false,
        shouldContinue: true,
        confidence: 0.5
      };
    }

    // Check for explicit handoff first
    if (lastResponse) {
      const handoffTarget = this.detectHandoff(lastResponse);
      if (handoffTarget) {
        // Validation: Handoff Security Check
        const isPingPong = 
            this.recentHandoffPair && 
            this.recentHandoffPair[0] === handoffTarget && 
            this.recentHandoffPair[1] === lastSpeaker;

        if (this.handoffChainDepth > 2) {
          console.log(`[SpeakerSelector] Handoff to ${handoffTarget} ignored: Max handoff chain depth reached.`);
        } else if (isPingPong) {
          console.log(`[SpeakerSelector] Handoff to ${handoffTarget} ignored: Ping-pong loop detected (${lastSpeaker} <-> ${handoffTarget}).`);
        } else if (lastSpeaker && this.lastHandoffRequester === lastSpeaker) {
          // Keep old check as secondary safeguard
          console.warn(`[SpeakerSelector] Ignored consecutive handoff request from ${lastSpeaker}`);
        } else {
          // Validate target exists
          const targetExists = allAgents.some(a => 
            a.toLowerCase() === handoffTarget.toLowerCase()
          );

          if (targetExists) {
            // Check max consecutive turns (prevent infinite loops)
            const consecutive = this.getConsecutiveTurns(handoffTarget);
            if (consecutive < 2) {
              if (this.eventBus) {
                this.eventBus.emitEvent('speaker:handoff', {
                  from: lastSpeaker,
                  to: handoffTarget
                });
              }
              
              // Record this successful handoff
              if (lastSpeaker) {
                this.lastHandoffRequester = lastSpeaker;
                this.handoffChainDepth++;
                this.recentHandoffPair = [lastSpeaker, handoffTarget];
              }

              // Reset failures on successful handoff (since system is working)
              this.consecutiveFailures = 0;

              return {
                nextSpeaker: handoffTarget,
                reason: `Explicit handoff from ${lastSpeaker}`,
                handoffRequested: true,
                shouldContinue: true,
                confidence: 1.0
              };
            } else {
              console.log(`[SpeakerSelector] Handoff to ${handoffTarget} ignored: Max consecutive turns (${consecutive}) reached.`);
            }
          }
        }
      }
    }

    // Reset handoff tracking if we are using LLM selection
    this.handoffChainDepth = 0;
    this.recentHandoffPair = null;

    // Determine valid candidates
    // Rule 1: Last speaker cannot be immediately re-selected UNLESS explicit handoff (handled above)
    // Rule 2: Everyone else is a candidate
    let candidates = allAgents;
    if (lastSpeaker && allAgents.length > 1) {
      candidates = allAgents.filter(name => name !== lastSpeaker);
    }

    // Optimization: If only 1 valid candidate remains (binary choice resolved), pick them automatically
    // This saves an LLM call when the choice is deterministic (e.g. 2-person debate)
    if (candidates.length === 1) {
      // If the only candidate just spoke, end the round to avoid repetitive loop
      if (candidates[0] === lastSpeaker) {
        return {
          nextSpeaker: '',
          reason: 'Only remaining agent already spoke last; ending round to avoid repetition',
          handoffRequested: false,
          shouldContinue: false,
          confidence: 0.9
        };
      }
      return {
        nextSpeaker: candidates[0],
        reason: 'Only valid alternative candidate',
        handoffRequested: false,
        shouldContinue: true,
        confidence: 1.0
      };
    }

    // Use LLM to select the most relevant next speaker or decide to end round
    const selectionResult = await this.llmSelect(
      conversationHistory,
      candidates,
      lastSpeaker,
      lastResponse,
      currentRound,
      task
    );

    if (this.eventBus) {
      this.eventBus.emitEvent('speaker:selected', {
        speaker: selectionResult.nextSpeaker,
        reason: selectionResult.reason,
        confidence: selectionResult.confidence,
        round: currentRound
      });
    }

    return selectionResult;
  }

  /**
   * Count how many times an agent has spoken consecutively at the end of history
   */
  private getConsecutiveTurns(agentName: string): number {
    let count = 0;
    for (let i = this.turnHistory.length - 1; i >= 0; i--) {
      if (this.turnHistory[i] === agentName) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Register a failure and check circuit breaker
   */
  private registerFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= SpeakerSelector.MAX_CONSECUTIVE_FAILURES) {
      this.circuitBreakerOpen = true;
      console.warn(`[SpeakerSelector] Circuit breaker triggered after ${this.consecutiveFailures} consecutive failures. Reverting to round-robin.`);
      if (this.eventBus) {
        this.eventBus.emitEvent('error', { 
          message: 'Speaker selector circuit breaker triggered',
          context: 'circuit_breaker' 
        });
      }
    }
  }

  /**
   * Use LLM to intelligently select next speaker
   */
  private async llmSelect(
    conversationHistory: any[],
    availableAgents: string[],
    lastSpeaker: string | null,
    lastResponse: string | null,
    currentRound: number,
    task: string
  ): Promise<SpeakerSelectionResult> {
    // Build agent descriptions
    const agentDescriptions = this.agentInfos
      .filter(a => availableAgents.includes(a.name))
      .map(a => `- ${a.name} (${a.model}): ${a.expertise}`)
      .join('\n');

    // Get recent conversation context (last 3 messages)
    const recentContext = conversationHistory
      .slice(-SpeakerSelector.RECENT_MESSAGES_COUNT)
      .filter(entry => entry.content) // Skip entries with null/undefined content
      .map(entry => `${entry.speaker || 'Unknown'}: ${(entry.content || '').substring(0, SpeakerSelector.MAX_CONTENT_PREVIEW)}...`)
      .join('\n\n');

    const prompt = `Select the next speaker for a multi-agent debate.

TASK: ${task}

AVAILABLE AGENTS:
${agentDescriptions}

${lastSpeaker && lastResponse ? `LAST SPEAKER: ${lastSpeaker}
EXCERPT: ${lastResponse.substring(0, SpeakerSelector.MAX_CONTENT_PREVIEW)}...` : 'START OF ROUND'}

Analyze the conversation state.
1. Should the discussion continue in this round, or has it reached a natural conclusion/pause point?
2. If continuing, who should speak next to add the most value? (Must be one of AVAILABLE AGENTS)

Output ONLY valid JSON:
{\"shouldContinue\": true, \"nextSpeaker\":\"<agent name>\", \"reason\":\"<reason>\", \"confidence\":0.8}
OR
{\"shouldContinue\": false, \"nextSpeaker\": null, \"reason\":\"<reason>\", \"confidence\":0.8}
`;

    try {
      const messages = [{ role: 'user', content: prompt }] as any[];
      const response = await this.provider.chat(messages,
        'Output valid JSON only. No markdown, no explanation, no code blocks. Just the JSON object.',
        {}
      );

      let text = (typeof response === 'string' ? response : response.text) || '';

      // Clean up common LLM response artifacts
      text = text.trim();
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      text = text.replace(/^["']|["']$/g, '');

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          // Check if round should end
          if (parsed.shouldContinue === false) {
            this.consecutiveFailures = 0; // Success
            return {
              nextSpeaker: '',
              reason: parsed.reason || 'Round concluded by selector',
              handoffRequested: false,
              shouldContinue: false,
              confidence: parsed.confidence || 1.0
            };
          }

          // Validate the selected agent exists (case-insensitive match)
          let matchedAgent = availableAgents.find(a => a === parsed.nextSpeaker);
          if (!matchedAgent) {
            // Try case-insensitive match
            matchedAgent = availableAgents.find(
              a => a.toLowerCase() === parsed.nextSpeaker?.toLowerCase()
            );
          }

          if (matchedAgent) {
            this.consecutiveFailures = 0; // Success
            return {
              nextSpeaker: matchedAgent,
              reason: parsed.reason || 'Selected by moderator',
              handoffRequested: false,
              shouldContinue: true,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7
            };
          }
        } catch {
          // JSON parse failed, will use fallback
        }
      }

      // Fallback: end round to prevent "zombie round" token waste
      // When selector fails repeatedly, it's better to end the round than continue randomly
      console.warn('Speaker selector failed to parse response, ending round');
      this.registerFailure();

      if (this.eventBus) {
        this.eventBus.emitEvent('error', {
          message: 'Speaker selector failed to parse response, ending round as fallback',
          context: 'speaker_selector'
        });
      }

      return {
        nextSpeaker: '',
        reason: 'Fallback: ending round (parse error)',
        handoffRequested: false,
        shouldContinue: false,
        confidence: 0.0
      };

    } catch (error: any) {
      console.error(`Speaker selection error: ${error.message}`);
      this.registerFailure();

      if (this.eventBus) {
        this.eventBus.emitEvent('error', {
          message: `Speaker selection error: ${error.message}`,
          context: 'speaker_selector'
        });
      }

      // Fallback: end round to prevent "zombie round" token waste
      return {
        nextSpeaker: '',
        reason: 'Fallback: ending round (API error)',
        handoffRequested: false,
        shouldContinue: false,
        confidence: 0.0
      };
    }
  }

  /**
   * Extract expertise description from an agent's system prompt
   */
  static extractExpertise(systemPrompt: string, agentName: string): string {
    // Try to find a concise description in the prompt
    const patterns = [
      /You are (?:a |an )?([^.]+)/i,
      /expert in ([^.]+)/i,
      /speciali[zs]e in ([^.]+)/i,
      /focus on ([^.]+)/i,
    ];

    for (const pattern of patterns) {
      const match = systemPrompt.match(pattern);
      if (match) {
        return match[1].substring(0, 100);
      }
    }

    // Fallback: use first sentence or agent name
    const firstSentence = systemPrompt.split('.')[0];
    return firstSentence.substring(0, 100) || agentName;
  }
}