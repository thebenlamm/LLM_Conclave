/**
 * exportDeliberationRecordCore
 *
 * Shared core handler for Deliberation Record export (D-07).
 * Delegates to DeliberationRecordBuilder + FormatterFactory — one source built ONCE
 * (D-05), then dispatched to markdown or PDF via the centralized factory (D-08).
 *
 * Inline input guards run here — transport-independently — so BOTH the MCP path
 * and the future HTTP path are protected (D-09/D-10):
 *   - session_id allowlist regex + '..'/null-byte rejection BEFORE any FS touch
 *   - Per-field length caps (defense-in-depth; the HTTP route adds a body-size cap)
 *
 * Read-only invariant: no LLM calls, no panel re-run.
 *
 * Phase 21 — Plan 03 (D-07)
 */

import SessionManager from '../../core/SessionManager.js';
import { DeliberationRecordBuilder } from './DeliberationRecordBuilder.js';
import { FormatterFactory } from './FormatterFactory.js';
import type {
  OperatorInputs,
  BrandingInputs,
  ExportFormat,
  DeliberationExportResult,
} from '../../types/deliberationRecord.js';

// ============================================================================
// Error type
// ============================================================================

/**
 * Thrown by the core on validation failures (bad session_id format, over-length
 * fields, unsupported format, session not found, no sessions).
 * Transports map this to a 400-level response; never returns a success envelope
 * with empty content.
 */
export class ExportValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ExportValidationError';
  }
}

// ============================================================================
// Input type
// ============================================================================

export interface ExportCoreInput {
  /** Session to export. Omit → most-recent session. */
  sessionId?: string;
  /** Operator/decision-owner name stamped in Field 8 (required). */
  operatorName: string;
  /** Optional rationale for the panel composition (Field 2). */
  panelRationale?: string;
  /** 'markdown' (default) | 'pdf' */
  format?: ExportFormat;
  /** Per-request PDF branding (company name, accent color, footer). */
  branding?: BrandingInputs;
  /**
   * Operator mitigations keyed by EXACT dissent concern text (SPEC-R5).
   * Keys that match a concern are threaded into Field 6; non-matching keys
   * surface in `unmatchedMitigations`.
   */
  mitigations?: Record<string, string>;
  /** Injectable SessionManager — omit to use the default (reads from disk). */
  sessionManager?: SessionManager;
}

// ============================================================================
// Per-field length caps (D-10 — transport-independent, inline, defense-in-depth)
// ============================================================================

/**
 * Per-field byte caps. These bound any SINGLE field; they do NOT bound the
 * AGGREGATE body. The primary total-payload bound is the HTTP route's
 * express.json({ limit:'64kb' }) (Plan 04). These caps are defense-in-depth
 * that also cover the non-HTTP MCP path.
 */
const CAPS = {
  operatorName: 200,
  panelRationale: 5000,
  companyName: 200,
  accentColor: 16,
  footerText: 500,
  mitigationKey: 2000,
  mitigationValue: 5000,
  mitigationCount: 100,
} as const;

// ============================================================================
// session_id allowlist (D-09)
// ============================================================================

/**
 * Allowlist regex for session_id.
 * Real session IDs: session_<ISO-with-dashes>_<4-alnum>
 * e.g.  session_2026-01-20T00-13-38_p3n1
 *
 * Permits only letters, digits, underscores, and hyphens.
 * ':' deliberately excluded: SessionManager.generateSessionId() strips colons
 * via `.replace(/[:.]/g, '-')` — real IDs never contain ':'. Excluding it
 * reduces NTFS alternate-data-stream / Windows drive-qualifier surface on the
 * value that is later path.join-ed in SessionManager.
 *
 * Excludes '/', '\', '.', null bytes, and all other path-traversal chars
 * before any FS operation is performed.
 */
const SESSION_ID_RE = /^[A-Za-z0-9_\-]{1,200}$/;

// ============================================================================
// Core function
// ============================================================================

/**
 * Export a stored Conclave session as a compliance-grade Deliberation Record.
 *
 * Guards run in this order (all BEFORE any FS touch):
 *   1. format validation
 *   2. field-length caps on operator/branding/mitigations
 *   3. session_id allowlist + '..'/null-byte check (when sessionId is provided)
 *
 * Then:
 *   4. Resolve session (explicit id or most-recent fallback)
 *   5. Build record source ONCE (D-05)
 *   6. Reconcile concern_keys / unmatched_mitigations (SPEC-R6)
 *   7. Render via centralized dispatch (D-08)
 *   8. Return structured result
 */
export async function exportDeliberationRecordCore(
  input: ExportCoreInput
): Promise<DeliberationExportResult> {
  // ── Step 1: Validate format ────────────────────────────────────────────────
  const format: ExportFormat = input.format ?? 'markdown';
  if (input.format !== undefined && input.format !== 'markdown' && input.format !== 'pdf') {
    throw new ExportValidationError(
      `Unsupported format '${String(input.format)}'. Must be 'markdown' or 'pdf'.`
    );
  }

  // ── Step 2: Validate field lengths ────────────────────────────────────────
  // WR-02: typeof guard before .trim() so a non-string truthy value (e.g. 42)
  // throws a clean ExportValidationError instead of a raw TypeError for any
  // non-HTTP caller that bypasses the HTTP route's own string guard.
  if (typeof input.operatorName !== 'string') {
    throw new ExportValidationError('operatorName must be a string');
  }
  if (!input.operatorName || !input.operatorName.trim()) {
    throw new ExportValidationError('operatorName is required and must not be empty');
  }
  if (Buffer.byteLength(input.operatorName) > CAPS.operatorName) {
    throw new ExportValidationError(
      `operatorName exceeds ${CAPS.operatorName} bytes (got ${Buffer.byteLength(input.operatorName)})`
    );
  }
  // WR-02: typeof guard before Buffer.byteLength so a non-string value throws
  // ExportValidationError (clean 400) instead of a TypeError → 500.
  if (input.panelRationale !== undefined) {
    if (typeof input.panelRationale !== 'string') {
      throw new ExportValidationError('panelRationale must be a string');
    }
    if (Buffer.byteLength(input.panelRationale) > CAPS.panelRationale) {
      throw new ExportValidationError(
        `panelRationale exceeds ${CAPS.panelRationale} bytes (got ${Buffer.byteLength(input.panelRationale)})`
      );
    }
  }
  if (input.branding !== undefined) {
    // WR-02: guard object-ness before destructuring so `null`, arrays, or
    // primitives throw a clean ExportValidationError instead of a TypeError
    // (`const { companyName } = null` throws) for non-HTTP callers.
    if (
      typeof input.branding !== 'object' ||
      input.branding === null ||
      Array.isArray(input.branding)
    ) {
      throw new ExportValidationError('branding must be an object');
    }
    const { companyName, accentColor, footerText } = input.branding;
    if (companyName !== undefined) {
      if (typeof companyName !== 'string') {
        throw new ExportValidationError('branding.companyName must be a string');
      }
      if (Buffer.byteLength(companyName) > CAPS.companyName) {
        throw new ExportValidationError(
          `branding.companyName exceeds ${CAPS.companyName} bytes`
        );
      }
    }
    if (accentColor !== undefined) {
      if (typeof accentColor !== 'string') {
        throw new ExportValidationError('branding.accentColor must be a string');
      }
      if (Buffer.byteLength(accentColor) > CAPS.accentColor) {
        throw new ExportValidationError(
          `branding.accentColor exceeds ${CAPS.accentColor} bytes`
        );
      }
    }
    if (footerText !== undefined) {
      if (typeof footerText !== 'string') {
        throw new ExportValidationError('branding.footerText must be a string');
      }
      if (Buffer.byteLength(footerText) > CAPS.footerText) {
        throw new ExportValidationError(
          `branding.footerText exceeds ${CAPS.footerText} bytes`
        );
      }
    }
  }
  if (input.mitigations !== undefined) {
    // WR-02: guard object-ness before Object.keys so a string (which yields
    // index "keys") or other non-object throws a clean ExportValidationError
    // instead of silently producing bogus mitigation keys for non-HTTP callers.
    if (
      typeof input.mitigations !== 'object' ||
      input.mitigations === null ||
      Array.isArray(input.mitigations)
    ) {
      throw new ExportValidationError('mitigations must be an object');
    }
    const mitKeys = Object.keys(input.mitigations);
    if (mitKeys.length > CAPS.mitigationCount) {
      throw new ExportValidationError(
        `mitigations exceeds ${CAPS.mitigationCount} entries (got ${mitKeys.length})`
      );
    }
    for (const k of mitKeys) {
      if (Buffer.byteLength(k) > CAPS.mitigationKey) {
        throw new ExportValidationError(
          `mitigation key exceeds ${CAPS.mitigationKey} bytes`
        );
      }
      const v = input.mitigations[k];
      if (typeof v !== 'string') {
        throw new ExportValidationError(
          `mitigation value for key '${k.slice(0, 40)}' must be a string`
        );
      }
      if (Buffer.byteLength(v) > CAPS.mitigationValue) {
        throw new ExportValidationError(
          `mitigation value for key '${k.slice(0, 40)}...' exceeds ${CAPS.mitigationValue} bytes`
        );
      }
    }
  }

  // ── Step 3: session_id guard — BEFORE any FS touch (D-09) ─────────────────
  // WR-03 (core leg): typeof guard fires before the regex to ensure non-string
  // values throw ExportValidationError instead of coercing and later causing
  // a TypeError in .includes(), which would fall through to the 500 branch.
  if (input.sessionId !== undefined) {
    if (typeof input.sessionId !== 'string') {
      throw new ExportValidationError('session_id must be a string');
    }
    const ok =
      SESSION_ID_RE.test(input.sessionId) &&
      !input.sessionId.includes('..') &&
      !input.sessionId.includes('\0');
    if (!ok) {
      throw new ExportValidationError(
        `Invalid session_id format: '${input.sessionId}'. ` +
          "Session IDs may only contain letters, digits, underscores, and hyphens."
      );
    }
  }

  // ── Step 4: Resolve session ────────────────────────────────────────────────
  const sm = input.sessionManager ?? new SessionManager();

  let manifest;
  if (!input.sessionId) {
    // Most-recent fallback — user-controlled FS lookup is skipped here.
    const recent = await sm.getMostRecentSession();
    if (!recent) {
      throw new ExportValidationError(
        'No sessions found. Run a discussion first using llm_conclave_discuss.'
      );
    }
    manifest = recent;
  } else {
    manifest = await sm.loadSession(input.sessionId);
    if (!manifest) {
      throw new ExportValidationError(
        `Session '${input.sessionId}' not found. ` +
          'Run `llm_conclave_sessions` to list available sessions.'
      );
    }
  }

  // ── Step 5: Build source ONCE (D-05) ──────────────────────────────────────
  const operator: OperatorInputs = {
    operatorName: input.operatorName,
    panelRationale: input.panelRationale,
    mitigations: input.mitigations ?? {},
  };
  const source = DeliberationRecordBuilder.fromSession(manifest, operator);

  // ── Step 6: Reconciliation (SPEC-R6) ──────────────────────────────────────
  const concernKeys = source.dissents.map((d) => d.concern);
  const submitted = Object.keys(input.mitigations ?? {});
  const unmatchedMitigations = submitted.filter((k) => !concernKeys.includes(k));

  // ── Step 7: Render via centralized dispatch (D-08) ────────────────────────
  const content = await FormatterFactory.renderDeliberationRecord(
    source,
    operator,
    format,
    input.branding
  );

  // ── Step 8: Return structured result ──────────────────────────────────────
  return { format, content, concernKeys, unmatchedMitigations };
}
