/**
 * AUDIT-06 (Phase 20) — Detect terms the judge invented in synthesis that
 * appear in ZERO agent turns.
 *
 * Algorithm (matches the 15-test contract pinned by Plan 20-02):
 *   1. Strip markdown syntax from the synthesis. Heading LINES (e.g. `## Key
 *      Decisions`) are removed entirely — they are section scaffolding, not
 *      prose. Bullets, bold, italics, and inline code are unwrapped so the
 *      underlying prose tokens are visible to the extractor.
 *   2. Split the stripped synthesis into sentence-like units (by newline and
 *      by sentence-terminator punctuation). Within each unit, tokenize on
 *      whitespace and strip surrounding punctuation from each token.
 *   3. Skip the sentence-initial token if it is Title-Case but NOT ALL-CAPS
 *      — this filters common English scaffolding words ("Use", "Deploy",
 *      "Adopt", "Coordinate", "The", "And", "But", "Decision", "Key") that
 *      happen to be capitalized because they begin a sentence/bullet, but
 *      are not proper-noun coinage. ALL-CAPS tokens (e.g. NATO) are kept
 *      even at sentence-initial position because they are genuine acronyms.
 *   4. Extract phrase candidates as runs of adjacent Title-Case / ALL-CAPS
 *      tokens. A candidate is valid if it is either (a) a multi-token run
 *      (>= 2 adjacent proper-noun-shaped tokens) OR (b) a single ALL-CAPS
 *      token of >= 2 chars. A single non-ALL-CAPS Title-Case token on its
 *      own is NOT a candidate. Runs longer than maxPhraseLength (default 3)
 *      truncate to the first maxPhraseLength tokens; the trailing tokens of
 *      a truncated run are dropped entirely (they belong to the same
 *      proper-noun phrase and should not spawn a second candidate).
 *   5. For each candidate, case-insensitive substring match against the
 *      concatenated agent-turn corpus. If absent, it is "coined."
 *   6. Deduplicate coined phrases, preserving order of first appearance
 *      (case-insensitive dedup key; original casing of first occurrence
 *      preserved in output).
 *
 * Cost: O(N + M * L) where N is tokens in synthesis, M is unique candidate
 *   phrases, L is total length of agent-turn haystack. String.includes on a
 *   ~100k-char haystack is ~1ms in V8; agent-turn corpora in practice are
 *   well under that.
 *
 * Caller contract: the caller is responsible for filtering agentTurns to
 *   exclude Judge/System turns before calling this function. Judge-self-
 *   grounding is not valid grounding (that is the entire point of AUDIT-06).
 */

export interface AgentTurnLike {
  speaker: string;
  content: string;
}

export interface JudgeCoinageOptions {
  /** Minimum token length for a phrase candidate. Default 1. */
  minPhraseLength?: number;
  /** Maximum token length for a phrase candidate. Default 3. */
  maxPhraseLength?: number;
}

/**
 * English stopwords that commonly begin sentences in Title-Case form but are
 * not proper-noun candidates. Single-token Title-Case words are filtered via
 * the sentence-initial rule regardless, so this list is belt-and-suspenders
 * for Title-Case-then-Title-Case sequences like "The Benthic Protocol" where
 * "The" would otherwise glue onto the run.
 */
const STOPWORDS = new Set([
  'the', 'and', 'but', 'a', 'an', 'this', 'that', 'it', 'he', 'she',
  'we', 'they', 'i', 'you', 'is', 'are', 'was', 'were', 'be', 'been',
  'or', 'if', 'so', 'as', 'at', 'by', 'in', 'of', 'on', 'to',
]);

/**
 * Strip markdown syntax so token extraction sees plain prose. Heading LINES
 * are removed entirely (they are section scaffolding, not content); inline
 * emphasis wrappers are unwrapped so the inner words survive.
 */
function stripMarkdown(text: string): string {
  return text
    // Drop entire heading lines (e.g. "## Decision", "# Action Items")
    .replace(/^\s*#+\s+.*$/gm, '')
    // Drop bullet markers at start of line; keep the content after
    .replace(/^\s*[-*+]\s+/gm, '')
    // Unwrap bold/italic/underscore emphasis
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Unwrap inline code
    .replace(/`([^`]+)`/g, '$1');
}

function trimPunct(token: string): string {
  return token
    .replace(/^[.,;:!?()[\]{}"'`]+/g, '')
    .replace(/[.,;:!?()[\]{}"'`]+$/g, '');
}

function isTitleCase(token: string): boolean {
  if (token.length < 2) return false;
  const first = token.charAt(0);
  if (!/[A-Z]/.test(first)) return false;
  // Title case = first uppercase, at least one lowercase somewhere after
  const rest = token.slice(1);
  return /[a-z]/.test(rest);
}

function isAllCaps(token: string): boolean {
  if (token.length < 2) return false;
  if (token !== token.toUpperCase()) return false;
  return /[A-Z]/.test(token);
}

/** A token is a "proper-noun-shaped" candidate if it is Title-Case or ALL-CAPS and not a stopword. */
function isProperCandidate(token: string): boolean {
  if (!token) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  return isTitleCase(token) || isAllCaps(token);
}

/**
 * Split stripped text into sentence-like units. We split on newlines AND on
 * sentence-terminator punctuation (`. `, `! `, `? `) so headings/bullets on
 * their own lines don't glue onto surrounding prose, and so sentences within
 * a paragraph each get their own sentence-initial filter.
 */
function splitIntoSentences(text: string): string[] {
  // Split on newlines first
  const lines = text.split(/\n+/);
  const sentences: string[] = [];
  for (const line of lines) {
    // Then split each line on sentence terminators, retaining no punctuation
    // (trimPunct per token handles the rest).
    const parts = line.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) sentences.push(trimmed);
    }
  }
  return sentences;
}

export function detectJudgeCoinage(
  synthesisText: string,
  agentTurns: AgentTurnLike[],
  options?: JudgeCoinageOptions
): string[] {
  if (!synthesisText) return [];
  const minLen = options?.minPhraseLength ?? 1;
  const maxLen = options?.maxPhraseLength ?? 3;

  const stripped = stripMarkdown(synthesisText);
  const sentences = splitIntoSentences(stripped);

  // Build a single lowercase haystack from agent turns for case-insensitive
  // substring grounding checks.
  const haystack = agentTurns
    .map(t => (t && t.content ? t.content : ''))
    .join('\n')
    .toLowerCase();

  const coined: string[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const rawTokens = sentence.split(/\s+/).map(trimPunct).filter(t => t.length > 0);
    if (rawTokens.length === 0) continue;

    // Sentence-initial filter: if the first token is Title-Case but NOT
    // ALL-CAPS, it is almost certainly an English scaffolding word capitalized
    // because it begins the sentence ("Use", "Deploy", "Adopt", "The", "Key").
    // ALL-CAPS tokens (NATO) bypass this filter because they are acronyms even
    // when sentence-initial.
    let startIndex = 0;
    if (rawTokens.length > 0) {
      const first = rawTokens[0];
      if (isTitleCase(first) && !isAllCaps(first)) {
        startIndex = 1;
      }
    }

    // Greedy extraction: walk left-to-right, grow the phrase while subsequent
    // tokens remain proper-noun candidates. Cap at maxLen. When a run longer
    // than maxLen is encountered, truncate and advance past the ENTIRE run
    // (so trailing tokens of the same phrase don't spawn a second candidate).
    let i = startIndex;
    while (i < rawTokens.length) {
      if (!isProperCandidate(rawTokens[i])) {
        i++;
        continue;
      }
      // Find the full adjacent run of candidate tokens
      let runEnd = i + 1;
      while (runEnd < rawTokens.length && isProperCandidate(rawTokens[runEnd])) {
        runEnd++;
      }
      const runLen = runEnd - i;

      // A valid phrase is either a multi-token run OR a single ALL-CAPS token.
      // A single Title-Case (non-ALL-CAPS) token is NOT a phrase on its own.
      const phraseEnd = Math.min(i + maxLen, runEnd);
      const phraseLen = phraseEnd - i;
      const singleAndAllCaps = runLen === 1 && isAllCaps(rawTokens[i]);
      const valid = (phraseLen >= 2) || singleAndAllCaps;

      if (valid && phraseLen >= minLen) {
        const phrase = rawTokens.slice(i, phraseEnd).join(' ');
        const key = phrase.toLowerCase();
        if (!haystack.includes(key) && !seen.has(key)) {
          coined.push(phrase);
          seen.add(key);
        }
      }
      // Advance past the entire run so a truncated 5-token phrase doesn't
      // leave trailing tokens to spawn a second candidate.
      i = runEnd;
    }
  }

  return coined;
}
