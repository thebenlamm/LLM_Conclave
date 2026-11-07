/**
 * Persona boundary enforcement (Phase 15.1).
 *
 * Pure helper that scans agent-produced content for a LEADING role-prefix
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
export const LEADING_ROLE_PREFIX = /^\s*\*\*([A-Za-z][A-Za-z][A-Za-z '\-]*?):(?:\*\*|\s)/;

/**
 * Matches `Judge's Assessment:` or `Judge’s Final Ruling:`. Limited to two words
 * so prose such as `Judge's ruling was clear: ...` is not flagged. Accepted false
 * positive: a two-word opener like `Judge's ruling: we continue`.
 */
const JUDGE_POSSESSIVE_LABEL = /^\s*(?:#{1,6}\s+)?(?:\*\*)?Judge['’]s(?:\s+[A-Za-z]+){1,2}(?:\*\*)?\s*:/i;

/** A leading markdown heading line, skipped when looking for a label below it. */
const LEADING_HEADING_LINE = /^\s*#{1,6}\s[^\n]*\n+/;

/** Stops the scan of leading headings and own labels on pathological input. */
const MAX_LEADING_SKIPS = 20;

/**
 * A configured name used as a leading label, in any shape seen in stored
 * sessions: `Name:`, `# Name:`, `**Name**:` or `**Name:`.
 */
function namedLabel(name: string): RegExp {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*(?:#{1,6}\\s+)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:`, 'i');
}

interface LabelAt {
  /** null when the label is the speaker's own. */
  offender: string | null;
  length: number;
}

/**
 * Checks for a role label at the very start of `text`. Matches only configured
 * names and the Judge, so ordinary labels like `Summary:` are never flagged.
 *
 * Accepted false positives: a turn addressing a panelist (`Name: good point`),
 * and a section label matching a panelist named with a common word
 * (`Primary: recommended approach`).
 */
function labelAt(text: string, selfName: string, allAgentNames: string[]): LabelAt | null {
  const self = (selfName || '').trim();
  const selfLower = self.toLowerCase();

  if (self) {
    const own = text.match(namedLabel(self));
    if (own) return { offender: null, length: own[0].length };
  }

  // Configured names first, so a panelist named `Judge's Advocate` is reported
  // by name rather than as the Judge.
  for (const name of allAgentNames) {
    if (!name || name.trim().toLowerCase() === selfLower) continue;
    const other = text.match(namedLabel(name));
    if (other) return { offender: name, length: other[0].length };
  }

  const speakerIsJudge = selfLower === 'judge';
  if (!speakerIsJudge) {
    const judge = text.match(JUDGE_POSSESSIVE_LABEL) ?? text.match(namedLabel('Judge'));
    if (judge) return { offender: 'Judge', length: judge[0].length };
  }

  // Original Phase 15.1 bold form, which also covers `**Judge Notes:` style labels.
  const bold = text.match(LEADING_ROLE_PREFIX);
  if (!bold) return null;
  const captured = (bold[1] ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!captured || captured === selfLower) return null;
  // `Judge's ...` labels are handled by JUDGE_POSSESSIVE_LABEL, which limits
  // their length; matching them here would flag prose like `Judge's ruling was clear:`.
  if (captured === 'judge' || captured.startsWith('judge ')) {
    return speakerIsJudge ? null : { offender: 'Judge', length: bold[0].length };
  }
  const configured = allAgentNames.find(n => n && n.trim().toLowerCase() === captured);
  return configured ? { offender: configured, length: bold[0].length } : null;
}

/**
 * Finds another panelist's label at the opening of `content`, looking past any
 * leading headings and the speaker's own label.
 */
function locateLabel(
  content: string,
  selfName: string,
  allAgentNames: string[]
): { offender: string; start: number; length: number } | null {
  let pos = 0;
  for (let skips = 0; skips <= MAX_LEADING_SKIPS; skips++) {
    const rest = content.slice(pos);
    const hit = labelAt(rest, selfName, allAgentNames);
    if (hit?.offender) return { offender: hit.offender, start: pos, length: hit.length };
    if (hit) {
      pos += hit.length;
      continue;
    }
    const heading = rest.match(LEADING_HEADING_LINE);
    if (!heading) return null;
    pos += heading[0].length;
  }
  return null;
}

export function detectImpersonation(
  content: string,
  selfName: string,
  allAgentNames: string[]
): ImpersonationResult {
  if (!content || typeof content !== 'string') {
    return { offender: null };
  }
  return { offender: locateLabel(content, selfName, allAgentNames)?.offender ?? null };
}

/**
 * Removes another panelist's leading label, keeping the rest of the turn.
 * A heading label keeps its heading marker, and the closing `**` of a
 * `**Name: body**` span is removed with its opener.
 */
export function stripImpersonationLabel(
  content: string,
  selfName: string,
  allAgentNames: string[]
): string {
  if (!content || typeof content !== 'string') return content;
  const loc = locateLabel(content, selfName, allAgentNames);
  if (!loc) return content;

  const label = content.slice(loc.start, loc.start + loc.length);
  const after = content.slice(loc.start + loc.length);
  // Drop the label's line ending, keeping indentation of the next line (code blocks).
  let rest = after.replace(/^[ \t]+/, '').replace(/^(?:\r?\n)+/, '');

  // The label opened a bold span (`**Name: body**`). Drop its closer only if it
  // falls in the same paragraph, where markdown would have closed the span.
  if (/^\s*(?:#{1,6}\s+)?\*\*/.test(label) && (label.match(/\*\*/g) ?? []).length % 2 === 1) {
    const paragraphEnd = rest.search(/\r?\n[ \t]*\r?\n/);
    const closer = rest.indexOf('**');
    if (closer !== -1 && (paragraphEnd === -1 || closer < paragraphEnd)) {
      rest = rest.slice(0, closer) + rest.slice(closer + 2);
      // `**Name:** body`: the closer sat right after the label.
      if (closer === 0) rest = rest.replace(/^[ \t]+/, '');
    }
  }

  // Keep a heading only when its text was on the label's own line.
  const heading = label.match(/^\s*(#{1,6}\s+)/);
  if (heading && /^[ \t]*[^\s]/.test(after)) {
    rest = heading[1] + rest;
  }

  const prefix = content.slice(0, loc.start);
  const joiner = prefix && !/\s$/.test(prefix) && rest ? ' ' : '';
  return (prefix + joiner + rest).trimEnd();
}
