/**
 * exportDeliberationRecord
 *
 * Entry function for producing a Deliberation Record from an existing stored
 * Conclave session. Read-only: loads the session via SessionManager.loadSession
 * and delegates to the builder + formatter. No panel re-run, no LLM calls.
 *
 * Phase 12 — Plan 01 (DELIB-05)
 */

import SessionManager from '../../core/SessionManager.js';
import { DeliberationRecordBuilder } from './DeliberationRecordBuilder.js';
import { DeliberationRecordFormatter } from './DeliberationRecordFormatter.js';
import type { OperatorInputs } from '../../types/deliberationRecord.js';

/**
 * Load a stored session by ID and render it as a Deliberation Record.
 *
 * @param sessionId        The stored session identifier.
 * @param operator         Operator-supplied inputs (name, rationale, mitigations).
 * @param sessionManager   Optional injected SessionManager — useful for tests
 *                         that write to a temp dir. Defaults to `new SessionManager()`.
 * @returns                The rendered Deliberation Record markdown, or a
 *                         "not found" message when the session does not exist.
 */
export async function renderDeliberationRecordFromSession(
  sessionId: string,
  operator: OperatorInputs,
  sessionManager?: SessionManager
): Promise<string> {
  const sm = sessionManager ?? new SessionManager();
  const manifest = await sm.loadSession(sessionId);

  if (!manifest) {
    return `Session '${sessionId}' not found. Run \`llm_conclave_sessions\` to list available sessions.`;
  }

  const source = DeliberationRecordBuilder.fromSession(manifest, operator);
  return new DeliberationRecordFormatter().render(source, operator);
}
