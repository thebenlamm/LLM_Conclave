/**
 * exportRecordRoute.test.ts
 *
 * Phase 21-04: Route integration tests for POST /api/export_record.
 *
 * TDD RED→GREEN:
 *  - RED:  registerExportRoute is not yet exported from server.ts → import fails
 *  - GREEN: route is implemented and all cases pass
 *
 * Test harness: real Express + real Node http server on port 0 (no supertest).
 * The shared core (exportDeliberationRecordCore) is mocked to isolate HTTP-layer
 * behaviour (auth, body-size cap, envelope, error mapping).
 *
 * Coverage:
 *  1. Unset CONCLAVE_API_KEY  → 503 (fail-closed)
 *  2. Set key, missing Bearer → 401
 *  3. Set key, wrong Bearer   → 401
 *  4. Missing operator_name   → 400
 *  5. Valid request, format omitted → 200 + markdown envelope
 *  6. format='pdf'            → 200, base64 content starts with %PDF-
 *  7. '../' session_id        → 400 (ExportValidationError mapped)
 *  8. Oversized body (>64kb, all field caps satisfied) → 400 "body too large"
 *     (regression guard: proves the route-scoped 64kb parser is live, not dead)
 *  9. Mitigation reconciliation: matched key renders, bogus key → unmatched_mitigations
 */

// ── Mock the shared core BEFORE imports ────────────────────────────────────────
// Keep ExportValidationError real so we can throw it from the mock.
jest.mock('../../consult/formatting/exportDeliberationRecordCore.js', () => ({
  ...jest.requireActual('../../consult/formatting/exportDeliberationRecordCore.js'),
  exportDeliberationRecordCore: jest.fn(),
}));

// Mock MCP SDK to prevent side effects on server.ts import
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => ({ setRequestHandler: jest.fn(), connect: jest.fn() })),
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));
jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: jest.fn(),
}));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
}));

import * as http from 'http';
import express from 'express';
import {
  exportDeliberationRecordCore,
  ExportValidationError,
} from '../../consult/formatting/exportDeliberationRecordCore';
import { registerExportRoute } from '../server';

const mockCore = exportDeliberationRecordCore as jest.MockedFunction<
  typeof exportDeliberationRecordCore
>;

// ── HTTP helper ─────────────────────────────────────────────────────────────────

interface RequestOptions {
  body?: Record<string, unknown>;
  authHeader?: string;
  /** If provided, send this raw string as body (bypasses JSON.stringify). */
  rawBody?: string;
}

function post(
  server: http.Server,
  opts: RequestOptions = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const { port } = server.address() as { port: number };
    const bodyStr =
      opts.rawBody !== undefined
        ? opts.rawBody
        : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : '';
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    };
    if (opts.authHeader !== undefined) {
      headers['Authorization'] = opts.authHeader;
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/export_record',
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode!, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Test setup ──────────────────────────────────────────────────────────────────

describe('POST /api/export_record', () => {
  let server: http.Server;
  let savedApiKey: string | undefined;
  const TEST_KEY = 'super-secret-key-123';
  const VALID_SESSION = 'session_2026-01-15T10-00-00_abcd';
  const VALID_BODY = {
    session_id: VALID_SESSION,
    operator_name: 'Jane Operator',
  };

  beforeAll((done) => {
    const app = express();
    // Register the export route exactly as startSSE does:
    // it must be BEFORE any global express.json() so the 64kb limit is live.
    registerExportRoute(app);
    // DO NOT add a global app.use(express.json()) here — the route's own parser
    // is the only parser, making the 64kb cap the only size enforcement.
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', done);
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    savedApiKey = process.env.CONCLAVE_API_KEY;
    mockCore.mockReset();
  });

  afterEach(() => {
    if (savedApiKey === undefined) {
      delete process.env.CONCLAVE_API_KEY;
    } else {
      process.env.CONCLAVE_API_KEY = savedApiKey;
    }
  });

  // ── 1. Fail-closed auth: key unset → 503 ─────────────────────────────────────

  it('returns 503 when CONCLAVE_API_KEY is not set (fail-closed)', async () => {
    delete process.env.CONCLAVE_API_KEY;

    const { status, body } = await post(server, {
      body: VALID_BODY,
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/CONCLAVE_API_KEY/i);
  });

  // ── 2. Missing Bearer → 401 ───────────────────────────────────────────────────

  it('returns 401 when CONCLAVE_API_KEY is set but Authorization header is absent', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;

    const { status, body } = await post(server, { body: VALID_BODY });

    expect(status).toBe(401);
    expect(body.success).toBe(false);
  });

  // ── 3. Wrong Bearer → 401 ────────────────────────────────────────────────────

  it('returns 401 when CONCLAVE_API_KEY is set but Bearer token is wrong', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;

    const { status, body } = await post(server, {
      body: VALID_BODY,
      authHeader: 'Bearer wrong-token',
    });

    expect(status).toBe(401);
    expect(body.success).toBe(false);
  });

  // ── 4. Missing operator_name → 400 ───────────────────────────────────────────

  it('returns 400 when operator_name is missing', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;

    const { status, body } = await post(server, {
      body: { session_id: VALID_SESSION },
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/operator_name/i);
  });

  // ── 5. Valid request, format omitted → 200 + markdown envelope ───────────────

  it('returns 200 with full envelope for a valid markdown request', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;
    mockCore.mockResolvedValueOnce({
      format: 'markdown',
      content: '# Deliberation Record\n\n## 1. Decision Framed\n\nTest content.\n',
      concernKeys: ['Key concern about reliability'],
      unmatchedMitigations: [],
    });

    const { status, body } = await post(server, {
      body: VALID_BODY,
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.format).toBe('markdown');
    expect(typeof body.content).toBe('string');
    expect(body.concern_keys).toEqual(['Key concern about reliability']);
    expect(body.unmatched_mitigations).toEqual([]);
  });

  // ── 6. format='pdf' → base64 content starting with %PDF- ────────────────────

  it('returns 200 with base64-encoded PDF whose first bytes decode to %PDF-', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;
    const fakePdf = Buffer.from('%PDF-1.4 fake pdf content for test');
    mockCore.mockResolvedValueOnce({
      format: 'pdf',
      content: fakePdf,
      concernKeys: [],
      unmatchedMitigations: [],
    });

    const { status, body } = await post(server, {
      body: { ...VALID_BODY, format: 'pdf' },
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.format).toBe('pdf');
    // Decode the base64 content and check PDF magic bytes
    const decoded = Buffer.from(body.content, 'base64');
    expect(decoded.slice(0, 5).toString()).toBe('%PDF-');
  });

  // ── 7. session_id with '../' → 400 (ExportValidationError mapped) ────────────

  it('returns 400 for a session_id containing path-traversal characters', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;
    mockCore.mockRejectedValueOnce(
      new ExportValidationError("Invalid session_id format: '../etc/passwd'")
    );

    const { status, body } = await post(server, {
      body: { ...VALID_BODY, session_id: '../etc/passwd' },
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  // ── 8. Oversized body → 400 "body too large" ─────────────────────────────────
  //
  // REGRESSION GUARD: The route-scoped express.json({ limit:'64kb' }) must be
  // LIVE (registered before the global parser). If it is dead (registered after),
  // the body reaches the handler and the mock returns 200 — the test would fail.
  //
  // Construction: 15 mitigation entries, each value 4500 chars (< mitigationValue
  // cap of 5000), count 15 (< mitigationCount cap of 100). Each key "concern-N"
  // is < 2000 chars (mitigationKey cap). Total JSON body ≈ 67.5kb > 64kb limit.
  // Every per-field cap is satisfied — so if body-size enforcement fires, we get
  // a 400 "body too large". If it doesn't fire and all caps pass, core is called.

  it('returns 400 "body too large" for a body >64kb whose per-field values stay under their caps', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;

    // Build mitigations: 15 entries × 4500-char value = ~67.5kb total body
    // Each value < mitigationValue cap (5000), count < mitigationCount cap (100)
    const mitigations: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      const key = `concern-key-${i}`; // < 2000 chars (mitigationKey cap) ✓
      const value = 'a'.repeat(4500);  // < 5000 chars (mitigationValue cap) ✓
      mitigations[key] = value;
    }
    // count = 15 < 100 (mitigationCount cap) ✓

    const rawBody = JSON.stringify({
      operator_name: 'Jane Operator',
      session_id: VALID_SESSION,
      mitigations,
    });
    // Verify body IS >64kb
    expect(Buffer.byteLength(rawBody)).toBeGreaterThan(64 * 1024);

    const { status, body } = await post(server, {
      rawBody,
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(400);
    // Must be the body-size error, NOT a per-field-cap error from the core
    expect(body.error).toMatch(/body too large/i);
  });

  // ── 9. Mitigation reconciliation ─────────────────────────────────────────────

  it('returns matched mitigation in content and bogus key in unmatched_mitigations', async () => {
    process.env.CONCLAVE_API_KEY = TEST_KEY;
    mockCore.mockResolvedValueOnce({
      format: 'markdown',
      content:
        '## 6. Overrides and Mitigations\n\n' +
        'Premature optimization risk: We will add benchmarks before shipping.\n',
      concernKeys: ['Premature optimization risk'],
      unmatchedMitigations: ['bogus-key-not-a-concern'],
    });

    const { status, body } = await post(server, {
      body: {
        ...VALID_BODY,
        mitigations: {
          'Premature optimization risk': 'We will add benchmarks before shipping.',
          'bogus-key-not-a-concern': 'This key does not match any concern.',
        },
      },
      authHeader: `Bearer ${TEST_KEY}`,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.content).toMatch(/We will add benchmarks/);
    expect(body.concern_keys).toEqual(['Premature optimization risk']);
    expect(body.unmatched_mitigations).toEqual(['bogus-key-not-a-concern']);
  });
});
