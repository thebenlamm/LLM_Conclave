/**
 * exportDeliberationRecordCore.test.ts
 *
 * Phase 21-03 (TDD RED→GREEN): unit + integration tests for the shared export core.
 *
 * Covers:
 *  - markdown output byte-identical to renderDeliberationRecordFromSession (integrated)
 *  - pdf format returns Buffer with %PDF- magic bytes (integrated)
 *  - mitigation reconciliation: matched key not in unmatchedMitigations; bogus key is
 *  - session_id path-traversal guard fires BEFORE loadSession is called
 *  - field-length cap validation throws ExportValidationError
 *  - session-not-found and no-sessions errors
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionManifest } from '../../../types/index';
import { OperatorInputs, DeliberationRecordSource } from '../../../types/deliberationRecord';
import { DeliberationRecordBuilder } from '../DeliberationRecordBuilder';
import { renderDeliberationRecordFromSession } from '../exportDeliberationRecord';
import {
  exportDeliberationRecordCore,
  ExportValidationError,
} from '../exportDeliberationRecordCore';
import SessionManager from '../../../core/SessionManager';

// ============================================================================
// Fixtures
// ============================================================================

const discussFixture: SessionManifest = {
  id: 'session_2026-01-15T10-00-00_abcd',
  timestamp: '2026-01-15T11:00:00.000Z',
  mode: 'consensus',
  task: 'Should we adopt GraphQL for our API layer?',
  agents: [
    { name: 'TechLead', model: 'claude-opus-4-5', provider: 'anthropic', systemPrompt: 'You are a senior tech lead.' },
    { name: 'BackendEng', model: 'gemini-2.5-flash', provider: 'google', systemPrompt: 'You are a backend engineer.' },
  ],
  status: 'completed',
  currentRound: 3,
  conversationHistory: [],
  consensusReached: true,
  finalSolution: 'Adopt GraphQL for the public API layer, keep REST for internal services.',
  turn_analytics: {
    per_agent: [
      { name: 'TechLead', turns: 3, token_share_pct: 52.4 },
      { name: 'BackendEng', turns: 3, token_share_pct: 47.6 },
    ],
  },
  dissent_quality: 'captured',
  agentSubstitutions: {},
  cost: { totalCost: 0.031, totalTokens: { input: 4000, output: 1500 }, totalCalls: 6 },
  outputFiles: { transcript: '/tmp/test/transcript.txt', json: '/tmp/test/session.json' },
};

const operatorFixture: OperatorInputs = {
  operatorName: 'Jane Operator',
  panelRationale: 'Cross-provider panel for independent risk views',
  mitigations: {},
};

// A source with a real dissent — injected via builder spy for reconciliation tests.
const sourceWithDissent: DeliberationRecordSource = {
  decision: { question: 'Should we migrate to microservices?' },
  panel: [{ name: 'Skeptic', provider: 'openai', model: 'gpt-4o' }],
  positions: [{ agent: 'Skeptic', provider: 'openai', model: 'gpt-4o', stance: 'Too risky.' }],
  dissents: [{ agent: 'Skeptic', concern: 'Premature optimization risk is high.', severity: 'high' }],
  synthesis: 'Phased migration is recommended.',
  provenance: {
    date: '2026-01-15T10:00:00.000Z',
    operator: 'Jane Operator',
    agents: [{ name: 'Skeptic', provider: 'openai', model: 'gpt-4o' }],
  },
  sourceMode: 'consult',
};

// ============================================================================
// Helper: create a temp SessionManager with the discuss fixture stored
// ============================================================================

async function makeStoredSession(): Promise<{ sm: SessionManager; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-test-'));
  const sm = new SessionManager(tmpDir);
  await sm.saveSession({ ...discussFixture });
  return { sm, tmpDir };
}

// ============================================================================
// Task 1: markdown byte-identical to renderDeliberationRecordFromSession
// ============================================================================

it('returns markdown byte-identical to renderDeliberationRecordFromSession for a stored session', async () => {
  const { sm } = await makeStoredSession();

  const coreResult = await exportDeliberationRecordCore({
    sessionId: discussFixture.id,
    operatorName: operatorFixture.operatorName,
    panelRationale: operatorFixture.panelRationale,
    format: 'markdown',
    sessionManager: sm,
  });

  const legacyResult = await renderDeliberationRecordFromSession(
    discussFixture.id,
    { operatorName: operatorFixture.operatorName, panelRationale: operatorFixture.panelRationale, mitigations: {} },
    sm
  );

  expect(coreResult.format).toBe('markdown');
  expect(typeof coreResult.content).toBe('string');
  expect(coreResult.content as string).toBe(legacyResult);
});

// ============================================================================
// Task 2: pdf format returns Buffer with %PDF- magic bytes
// ============================================================================

it('returns a Buffer with %PDF- magic bytes when format=pdf', async () => {
  const { sm } = await makeStoredSession();

  const result = await exportDeliberationRecordCore({
    sessionId: discussFixture.id,
    operatorName: 'PDF Operator',
    format: 'pdf',
    sessionManager: sm,
  });

  expect(result.format).toBe('pdf');
  expect(Buffer.isBuffer(result.content)).toBe(true);
  expect((result.content as Buffer).slice(0, 5).toString()).toBe('%PDF-');
}, 10000);

// ============================================================================
// Task 3: mitigation reconciliation (builder spy to inject dissents)
// ============================================================================

it('valid mitigation key excluded from unmatchedMitigations; bogus key included', async () => {
  const { sm } = await makeStoredSession();

  // Spy on fromSession to return a source with one dissent.
  const spy = jest
    .spyOn(DeliberationRecordBuilder, 'fromSession')
    .mockReturnValue(sourceWithDissent);

  try {
    const validKey = 'Premature optimization risk is high.';
    const bogusKey = 'A key that matches no concern';

    const result = await exportDeliberationRecordCore({
      sessionId: discussFixture.id,
      operatorName: 'Jane Operator',
      format: 'markdown',
      mitigations: {
        [validKey]: 'We will run a PoC first.',
        [bogusKey]: 'Irrelevant text.',
      },
      sessionManager: sm,
    });

    expect(result.concernKeys).toEqual([validKey]);
    expect(result.unmatchedMitigations).toEqual([bogusKey]);

    // Mitigation text must appear in Field 6 of the rendered markdown.
    expect(result.content as string).toContain('We will run a PoC first.');
    // Bogus key's text must NOT appear as a mitigation row.
    expect(result.content as string).not.toContain('Irrelevant text.');
  } finally {
    spy.mockRestore();
  }
});

// ============================================================================
// Task 4: session_id path-traversal guard fires BEFORE loadSession
// ============================================================================

it('throws ExportValidationError for a traversal session_id without calling loadSession', async () => {
  const mockLoadSession = jest.fn();
  const mockGetMostRecent = jest.fn();
  const mockSm = {
    loadSession: mockLoadSession,
    getMostRecentSession: mockGetMostRecent,
    initialize: jest.fn(),
  } as unknown as SessionManager;

  const traversalIds = ['../etc/passwd', '..\\windows\\system32', 'valid/with/slash', 'session_\0null'];

  for (const badId of traversalIds) {
    await expect(
      exportDeliberationRecordCore({
        sessionId: badId,
        operatorName: 'Test Operator',
        sessionManager: mockSm,
      })
    ).rejects.toThrow(ExportValidationError);
  }

  // loadSession must never have been called — guard fires before any FS touch.
  expect(mockLoadSession).not.toHaveBeenCalled();
});

// ============================================================================
// Task 5: field-length cap validation
// ============================================================================

it('throws ExportValidationError when operatorName exceeds 200 characters', async () => {
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'A'.repeat(201),
      sessionId: discussFixture.id,
      sessionManager: {} as unknown as SessionManager,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('throws ExportValidationError when panelRationale exceeds 5000 characters', async () => {
  const { sm } = await makeStoredSession();
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      panelRationale: 'B'.repeat(5001),
      sessionId: discussFixture.id,
      sessionManager: sm,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('throws ExportValidationError when a mitigation value exceeds 5000 characters', async () => {
  const { sm } = await makeStoredSession();
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      mitigations: { 'risk key': 'C'.repeat(5001) },
      sessionId: discussFixture.id,
      sessionManager: sm,
    })
  ).rejects.toThrow(ExportValidationError);
});

// WR-02: non-string branding/mitigation/panel_rationale values must throw
// ExportValidationError (clean 400), not a Buffer.byteLength TypeError (500).
it('throws ExportValidationError (not TypeError) when panelRationale is a number', async () => {
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      panelRationale: 123 as any,
      sessionId: discussFixture.id,
      sessionManager: {} as unknown as SessionManager,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('throws ExportValidationError (not TypeError) when a branding field is a number', async () => {
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      branding: { companyName: 123 as any },
      sessionId: discussFixture.id,
      sessionManager: {} as unknown as SessionManager,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('throws ExportValidationError (not TypeError) when a mitigation value is a number', async () => {
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      mitigations: { 'risk key': 123 as any },
      sessionId: discussFixture.id,
      sessionManager: {} as unknown as SessionManager,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('throws ExportValidationError for an unsupported format string', async () => {
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      format: 'xml' as any,
      sessionManager: {} as unknown as SessionManager,
    })
  ).rejects.toThrow(ExportValidationError);
});

// ============================================================================
// Task 6: session-not-found and no-sessions errors
// ============================================================================

it('throws ExportValidationError when the requested session does not exist', async () => {
  const { sm } = await makeStoredSession();
  await expect(
    exportDeliberationRecordCore({
      sessionId: 'session_nonexistent_xxxx',
      operatorName: 'Test',
      sessionManager: sm,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('throws ExportValidationError (not a silent empty result) when no sessions exist', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-empty-'));
  const emptySm = new SessionManager(tmpDir);
  // Do not save any session.
  await expect(
    exportDeliberationRecordCore({
      operatorName: 'Test',
      sessionManager: emptySm,
    })
  ).rejects.toThrow(ExportValidationError);
});

// ============================================================================
// Task 7: concernKeys is [] on discuss path (no attributed dissents in manifest)
// ============================================================================

it('concernKeys is [] for a stored discuss session (no attributed dissents)', async () => {
  const { sm } = await makeStoredSession();
  const result = await exportDeliberationRecordCore({
    sessionId: discussFixture.id,
    operatorName: 'Test',
    format: 'markdown',
    mitigations: { 'some key': 'some text' },
    sessionManager: sm,
  });

  expect(result.concernKeys).toEqual([]);
  expect(result.unmatchedMitigations).toEqual(['some key']);
});

// ============================================================================
// Task 8 (WR-03 core leg): non-string sessionId throws ExportValidationError
// ============================================================================

it('throws ExportValidationError (not TypeError) when sessionId is a number', async () => {
  // Before fix: SESSION_ID_RE.test(123) coerces → passes, then
  // (123).includes('..')  throws TypeError (not ExportValidationError → wrong 500 path).
  // After fix: typeof guard fires first → ExportValidationError.
  const mockSm = {
    loadSession: jest.fn(),
    getMostRecentSession: jest.fn(),
    initialize: jest.fn(),
  } as unknown as SessionManager;

  const err = await exportDeliberationRecordCore({
    sessionId: 123 as unknown as string,
    operatorName: 'Test Operator',
    sessionManager: mockSm,
  }).catch((e: Error) => e);

  expect(err).toBeInstanceOf(ExportValidationError);
  expect((err as ExportValidationError).name).toBe('ExportValidationError');
  // loadSession must NOT be called — type guard fires before FS touch
  expect((mockSm as any).loadSession).not.toHaveBeenCalled();
});

// ============================================================================
// Task 9 (IN-01): ':' removed from SESSION_ID_RE allowlist
// ============================================================================

it('throws ExportValidationError for a session_id containing a colon', async () => {
  // Before fix: SESSION_ID_RE = /^[A-Za-z0-9_:\-]{1,200}$/ — colon passes.
  // After fix: colon is removed from the character class.
  const mockSm = {
    loadSession: jest.fn(),
    getMostRecentSession: jest.fn(),
    initialize: jest.fn(),
  } as unknown as SessionManager;

  await expect(
    exportDeliberationRecordCore({
      sessionId: 'session_a:b',
      operatorName: 'Test Operator',
      sessionManager: mockSm,
    })
  ).rejects.toThrow(ExportValidationError);

  expect((mockSm as any).loadSession).not.toHaveBeenCalled();
});

it('accepts a real-shaped session_id (no colons, only letters/digits/underscores/hyphens)', async () => {
  // "session_2026-01-20T00-13-38_p3n1" must still pass the regex after ':' removal.
  const { sm } = await makeStoredSession();

  // The fixture ID is session_2026-01-15T10-00-00_abcd — dashes only, valid.
  await expect(
    exportDeliberationRecordCore({
      sessionId: discussFixture.id,
      operatorName: 'Test Operator',
      format: 'markdown',
      sessionManager: sm,
    })
  ).resolves.toBeDefined();
});

// ============================================================================
// Task 10 (IN-02): per-field caps enforced via Buffer.byteLength (not .length)
// ============================================================================

it('rejects multibyte operatorName that exceeds byte cap even if character count is under cap', async () => {
  // Each '€' is 3 bytes in UTF-8. 68 × '€' = 204 bytes > CAPS.operatorName (200).
  // String.length = 68 (under 200) → would pass with .length. Buffer.byteLength
  // = 204 → must be rejected after the fix.
  const multibyteStr = '€'.repeat(68); // 68 euro signs = 204 bytes

  await expect(
    exportDeliberationRecordCore({
      operatorName: multibyteStr,
      sessionManager: {} as unknown as SessionManager,
    })
  ).rejects.toThrow(ExportValidationError);
});

it('accepts an ASCII operatorName at exactly the byte cap (200 bytes = 200 ASCII chars)', async () => {
  // 200 ASCII 'A' = 200 bytes = exactly at CAPS.operatorName; must pass.
  // (uses an empty SessionManager that will fail at "session not found" — which
  // is an ExportValidationError for a different reason, not the cap check)
  const { sm } = await makeStoredSession();

  const result = await exportDeliberationRecordCore({
    operatorName: 'A'.repeat(200),
    format: 'markdown',
    sessionManager: sm,
  });
  // We reach the render step (no byte-cap rejection), so result is defined.
  expect(result).toBeDefined();
});
