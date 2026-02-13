/**
 * DiscussionStateExtractor - Deterministic extraction of discussion state
 *
 * Tracks agent positions, open questions, and resolved points across rounds
 * to give the judge richer signal for verdict quality. No LLM calls.
 *
 * Phase 2 Context Tax: Judge Discussion State (2.2)
 */

export interface DiscussionState {
  round: number;
  agentPositions: { agent: string; position: string; changed: boolean }[];
  openQuestions: string[];
  resolvedPoints: string[];
}

interface RoundGroup {
  round: number;
  entries: any[];
}

export class DiscussionStateExtractor {
  /**
   * Extract discussion state from round groups up to the current round.
   *
   * @param roundGroups - Array of { round, entries } from groupHistoryByRound()
   * @param currentRound - The current round number being prepared for
   * @returns Formatted discussion state or null if insufficient data
   */
  static extract(roundGroups: RoundGroup[], currentRound: number): DiscussionState | null {
    if (roundGroups.length === 0) {
      return null;
    }

    const agentPositions = this.extractPositions(roundGroups);
    const openQuestions = this.extractOpenQuestions(roundGroups);
    const resolvedPoints = this.detectResolvedPoints(roundGroups);

    return {
      round: currentRound,
      agentPositions,
      openQuestions,
      resolvedPoints
    };
  }

  /**
   * Extract per-agent positions from all rounds and detect changes.
   * Uses last-paragraph heuristic consistent with buildCaseFile().
   */
  private static extractPositions(
    roundGroups: RoundGroup[]
  ): { agent: string; position: string; changed: boolean }[] {
    const positionsByAgent = new Map<string, string[]>();

    for (const group of roundGroups) {
      for (const entry of group.entries) {
        if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
          const position = this.extractPosition(entry.content);
          if (!positionsByAgent.has(entry.speaker)) {
            positionsByAgent.set(entry.speaker, []);
          }
          positionsByAgent.get(entry.speaker)!.push(position);
        }
      }
    }

    const result: { agent: string; position: string; changed: boolean }[] = [];
    for (const [agent, positions] of positionsByAgent) {
      const latestPosition = positions[positions.length - 1];
      const changed = positions.length > 1 && !this.positionsOverlap(positions[0], latestPosition);
      result.push({ agent, position: latestPosition, changed });
    }

    return result;
  }

  /**
   * Extract position summary from content using last-paragraph heuristic.
   */
  private static extractPosition(content: string): string {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) return '';

    let position = paragraphs[paragraphs.length - 1].trim();
    if (position.length < 50 && paragraphs.length >= 2) {
      position = paragraphs.slice(-2).join(' ').trim();
    }
    if (position.length > 300) {
      position = position.substring(0, 297) + '...';
    }
    return position;
  }

  /**
   * Check if two positions have significant word overlap (>40%).
   * Used to detect whether an agent changed their position.
   */
  private static positionsOverlap(a: string, b: string): boolean {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (wordsA.size === 0 || wordsB.size === 0) return true; // Can't determine

    let overlap = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++;
    }

    return overlap / Math.min(wordsA.size, wordsB.size) > 0.4;
  }

  /**
   * Extract open questions from the most recent round.
   * Matches sentences ending with "?" from agent entries.
   */
  private static extractOpenQuestions(roundGroups: RoundGroup[]): string[] {
    if (roundGroups.length === 0) return [];

    const lastRound = roundGroups[roundGroups.length - 1];
    const questions: string[] = [];

    for (const entry of lastRound.entries) {
      if (entry.role === 'assistant' && entry.speaker && entry.speaker !== 'Judge' && !entry.error) {
        const matches = entry.content.match(/[^.!?\n]*\?/g);
        if (matches) {
          for (const q of matches) {
            const trimmed = q.trim();
            // Filter out very short questions (likely rhetorical) and duplicates
            if (trimmed.length > 15 && !questions.some(existing => existing === trimmed)) {
              questions.push(trimmed);
            }
          }
        }
      }
    }

    // Limit to 5 most relevant (longest = most specific)
    return questions
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);
  }

  /**
   * Detect resolved points: questions from round N-1 no longer present in round N.
   */
  private static detectResolvedPoints(roundGroups: RoundGroup[]): string[] {
    if (roundGroups.length < 2) return [];

    const prevRound = roundGroups[roundGroups.length - 2];
    const currRound = roundGroups[roundGroups.length - 1];

    const prevQuestions = this.extractQuestionsFromRound(prevRound);
    const currContent = currRound.entries
      .filter((e: any) => e.role === 'assistant' && !e.error)
      .map((e: any) => e.content.toLowerCase())
      .join(' ');

    const resolved: string[] = [];
    for (const q of prevQuestions) {
      // Check if the core of the question (3+ word phrases) appears in current round
      const coreWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const keyPhrase = coreWords.slice(0, 4).join(' ');
      if (keyPhrase && !currContent.includes(keyPhrase)) {
        resolved.push(q);
      }
    }

    return resolved.slice(0, 3);
  }

  /**
   * Extract questions from a specific round's entries.
   */
  private static extractQuestionsFromRound(round: RoundGroup): string[] {
    const questions: string[] = [];
    for (const entry of round.entries) {
      if (entry.role === 'assistant' && entry.speaker !== 'Judge' && !entry.error) {
        const matches = entry.content.match(/[^.!?\n]*\?/g);
        if (matches) {
          for (const q of matches) {
            const trimmed = q.trim();
            if (trimmed.length > 15) {
              questions.push(trimmed);
            }
          }
        }
      }
    }
    return questions;
  }

  /**
   * Format discussion state for insertion into judge context.
   */
  static format(state: DiscussionState): string {
    let output = `=== DISCUSSION STATE (Round ${state.round}) ===\n\n`;

    if (state.agentPositions.length > 0) {
      output += 'Agent Positions:\n';
      for (const ap of state.agentPositions) {
        const changeTag = ap.changed ? ' [CHANGED]' : ' [STABLE]';
        output += `- ${ap.agent}: "${ap.position}"${changeTag}\n`;
      }
      output += '\n';
    }

    if (state.openQuestions.length > 0) {
      output += 'Open Questions:\n';
      for (const q of state.openQuestions) {
        output += `- "${q}"\n`;
      }
      output += '\n';
    }

    if (state.resolvedPoints.length > 0) {
      output += 'Resolved:\n';
      for (const r of state.resolvedPoints) {
        output += `- ${r}\n`;
      }
      output += '\n';
    }

    output += '=== END DISCUSSION STATE ===\n';
    return output;
  }
}
