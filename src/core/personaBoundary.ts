/**
 * Persona boundary enforcement (Phase 15.1).
 *
 * Pure helper that scans agent-produced content for a LEADING bold role-prefix
 * indicating the agent is impersonating a different configured advisor or the
 * Judge. This runs AFTER the existing self-prefix strip in AgentTurnExecutor
 * so echoed self-prefixes are already removed by the time this is called.
 *
 * Background:
 *   A discuss session (~/.llm-conclave/discuss-logs/discuss-2026-04-13T13-35-08-816Z.md)
 *   produced messages attributed to one persona whose body began with another
 *   persona's role-prefix, e.g. `**Tech Ethicist: My position: ...**`. The real
 *   fixtures use a single pair of `**` markers wrapping the name + body — the
 *   name is NOT wrapped in its own `**...**`.
 *
 * Contract:
 *   - Input `content` is the post-stripped assistant message text.
 *   - `selfName` is the name of the speaking agent (e.g. "Security Expert").
 *   - `allAgentNames` is the list of currently-configured agent names for this
 *     session, including `selfName` itself (order irrelevant).
 *   - Returns `{ offender: <name> }` when the content appears to speak AS
 *     another configured agent or the Judge. Otherwise `{ offender: null }`.
 *
 * False-positive guards (MUST NOT flag):
 *   - Plain prose: "Security Expert argued that X"
 *   - Mid-sentence bold: "I agree with **Security Expert** on this"
 *   - Mid-body bold phrase containing a colon: "... **latency vs: cost** ..."
 *   - Markdown headings: "## Summary"
 *   - Own name echoed (defensive — should have been stripped already)
 *   - Bold phrase without a trailing colon: "**Important point** here..."
 *   - Unknown bold name not in allAgentNames
 */

export interface ImpersonationResult {
  offender: string | null;
}

/**
 * Matches a LEADING bold role-prefix at the start of the content.
 *
 * Regex breakdown:
 *   ^\s*          — optional leading whitespace/newlines
 *   \*\*          — opening bold marker
 *   ([A-Z][A-Za-z][A-Za-z '\-]*?)  — capture: Name (PascalCase-ish, letters/space/apos/hyphen)
 *   :             — literal colon after the name
 *   (?:\*\*|\s)   — either immediate closing bold (`**Name:**`) OR whitespace
 *                   continuing into the body (`**Name: body...**`). Both shapes
 *                   appear in the real transcript.
 *
 * The lazy quantifier on the name prevents eating past the first colon, which
 * is what distinguishes this from mid-body bold phrases containing colons.
 */
const LEADING_ROLE_PREFIX = /^\s*\*\*([A-Za-z][A-Za-z][A-Za-z '\-]*?):(?:\*\*|\s)/;

export function detectImpersonation(
  content: string,
  selfName: string,
  allAgentNames: string[]
): ImpersonationResult {
  if (!content || typeof content !== 'string') {
    return { offender: null };
  }

  // Look only at the opening of the message — impersonation patterns live in
  // the first ~200 chars. Scanning further would risk flagging legitimate
  // mid-body bold phrases that happen to look role-ish.
  let head = content.slice(0, 200);

  // Strip leading whitespace and any markdown heading tokens (`## Summary\n`)
  // so a heading that precedes a body doesn't mask a downstream impersonation.
  // Headings themselves are never flagged because `##` is not `**`.
  head = head.replace(/^\s*(?:#{1,6}\s[^\n]*\n+)?/, '');

  const match = head.match(LEADING_ROLE_PREFIX);
  if (!match) {
    return { offender: null };
  }

  // Normalize captured name: trim and collapse whitespace.
  const capturedRaw = match[1] ?? '';
  const captured = capturedRaw.trim().replace(/\s+/g, ' ');
  if (!captured) {
    return { offender: null };
  }

  const capturedLower = captured.toLowerCase();
  const selfLower = (selfName || '').trim().toLowerCase();

  // Defensive: the existing self-prefix strip at AgentTurnExecutor.ts:144
  // should have already removed any echoed self-prefix before we see this
  // content. If it somehow slipped through, do not report self as offender.
  if (capturedLower === selfLower) {
    return { offender: null };
  }

  // Judge impersonation — any leading capture matching "Judge" or starting
  // with "Judge " / "Judge's " is attributed to Judge. The Judge is not in
  // allAgentNames but must still be blocked.
  if (
    capturedLower === 'judge' ||
    capturedLower.startsWith("judge's ") ||
    capturedLower.startsWith('judge ')
  ) {
    return { offender: 'Judge' };
  }

  // Match against configured agents (case-insensitive). Exclude self.
  for (const name of allAgentNames) {
    if (!name) continue;
    const nameLower = name.trim().toLowerCase();
    if (nameLower === selfLower) continue;
    if (nameLower === capturedLower) {
      return { offender: name };
    }
  }

  // Leading bold role-ish prefix, but name is not a known agent and not the
  // Judge. Do not flag — avoids false positives on unknown bold phrases.
  return { offender: null };
}
