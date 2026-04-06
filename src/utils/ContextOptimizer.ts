/**
 * ContextOptimizer - Separates reasoning from positions in agent outputs.
 *
 * When contextOptimization is enabled, agents are instructed to produce
 * <reasoning> and <position> sections. Other agents see only the position;
 * the judge sees everything. Extraction uses a cascading fallback strategy
 * so worst-case behavior matches the existing last-paragraph heuristic.
 */
export class ContextOptimizer {
  // ── Extraction ─────────────────────────────────────────────────────────

  /**
   * Extract <position> section from agent output.
   * Cascading strategy:
   *   1. XML tags: <position>...</position>
   *   2. Markdown heading: ## Position
   *   3. Bold statement: **My position: ...**
   *   4. Fallback: last-paragraph heuristic (matches DiscussionStateExtractor)
   */
  static extractPosition(content: string): string | null {
    if (!content || content.trim().length === 0) return null;

    // 1. XML tags
    const xmlMatch = content.match(/<position>([\s\S]*?)<\/position>/i);
    if (xmlMatch && xmlMatch[1].trim().length > 0) {
      return xmlMatch[1].trim();
    }

    // 2. Markdown heading: ## Position\n...
    const mdMatch = content.match(/##\s*Position\s*\n([\s\S]*?)(?=\n##|\n<|$)/i);
    if (mdMatch && mdMatch[1].trim().length > 0) {
      return mdMatch[1].trim();
    }

    // 3. Bold position statement: **My position: ...**
    const boldMatch = content.match(/\*\*My position:\s*([\s\S]*?)\*\*/i);
    if (boldMatch && boldMatch[1].trim().length > 0) {
      return boldMatch[1].trim();
    }

    // 4. Fallback: last-paragraph heuristic (replicates DiscussionStateExtractor.extractPosition)
    return this.lastParagraphFallback(content);
  }

  /**
   * Extract <reasoning> section from agent output.
   */
  static extractReasoning(content: string): string | null {
    if (!content || content.trim().length === 0) return null;

    const xmlMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/i);
    if (xmlMatch && xmlMatch[1].trim().length > 0) {
      return xmlMatch[1].trim();
    }

    const mdMatch = content.match(/##\s*Reasoning\s*\n([\s\S]*?)(?=\n##|\n<|$)/i);
    if (mdMatch && mdMatch[1].trim().length > 0) {
      return mdMatch[1].trim();
    }

    return null;
  }

  /**
   * Check if content has explicit structured output format.
   */
  static hasStructuredOutput(content: string): boolean {
    if (!content) return false;
    return /<position>[\s\S]*?<\/position>/i.test(content) ||
           /##\s*Position\s*\n/i.test(content);
  }

  // ── Compression ────────────────────────────────────────────────────────

  /**
   * Build compressed view of a history entry for agent consumption.
   * Uses pre-extracted positionSummary if available, otherwise extracts at call time.
   * Falls back to 2-sentence heuristic when no structured output exists.
   */
  static compressEntryForAgent(entry: {
    speaker: string;
    content: string;
    positionSummary?: string;
    hasStructuredOutput?: boolean;
  }): string {
    // Use pre-extracted position if available
    if (entry.positionSummary) {
      return entry.positionSummary;
    }

    // Try runtime extraction (covers retry/fallback paths where pre-extraction may be missing,
    // and handles all format variants including bold **My position:** without requiring
    // hasStructuredOutput — any successfully extracted position is better than the 2-sentence fallback)
    const position = this.extractPosition(entry.content);
    if (position) {
      return position;
    }

    // Fallback: 2-sentence heuristic (matches TokenCounter.summarizeRoundEntries behavior)
    return this.twoSentenceFallback(entry.content);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Last-paragraph heuristic matching DiscussionStateExtractor.extractPosition().
   * Takes last paragraph, extends to last 2 if too short, caps at 300 chars.
   */
  private static lastParagraphFallback(content: string): string {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) return content.substring(0, 200).trim();

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
   * Extract first 2 sentences, matching TokenCounter.summarizeRoundEntries behavior.
   */
  private static twoSentenceFallback(content: string): string {
    const sentences = content.match(/[^.!?]*[.!?]/g);
    if (sentences) {
      return sentences.slice(0, 2).join('').trim();
    }
    return content.substring(0, 200).trim();
  }
}
