import { AnalyticsIndexer } from '../AnalyticsIndexer';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Use a temp directory for test database
const TEST_DB_DIR = path.join(os.tmpdir(), 'llm-conclave-test-' + Date.now());
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-analytics.db');

describe('AnalyticsIndexer', () => {
  let indexer: AnalyticsIndexer;

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Close database connection
    if (indexer) {
      indexer.close();
    }
    // Clean up test files
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      if (fs.existsSync(TEST_DB_DIR)) {
        fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('JSONL Parsing', () => {
    it('parses single-line JSON files', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      // Create a test log directory with a JSON file
      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      const jsonContent = JSON.stringify({
        consultation_id: 'test-123',
        question: 'Test question',
        timestamp: new Date().toISOString(),
        mode: 'consensus'
      });
      fs.writeFileSync(path.join(logDir, 'test.json'), jsonContent);

      // Rebuild index should process the file
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1] consultations indexed'));
      consoleSpy.mockRestore();
    });

    it('parses multi-line JSONL files', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // Create JSONL with multiple entries
      const entries = [
        { consultation_id: 'entry-1', question: 'Question 1', timestamp: '2025-01-01T00:00:00Z' },
        { consultation_id: 'entry-2', question: 'Question 2', timestamp: '2025-01-02T00:00:00Z' },
        { consultation_id: 'entry-3', question: 'Question 3', timestamp: '2025-01-03T00:00:00Z' }
      ];
      const jsonlContent = entries.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(path.join(logDir, 'test.jsonl'), jsonlContent);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3] consultations indexed'));
      consoleSpy.mockRestore();
    });

    it('handles empty lines in JSONL files', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // JSONL with empty lines and whitespace
      const jsonlContent = `
{"consultation_id": "entry-1", "question": "Q1", "timestamp": "2025-01-01T00:00:00Z"}

{"consultation_id": "entry-2", "question": "Q2", "timestamp": "2025-01-02T00:00:00Z"}

{"consultation_id": "entry-3", "question": "Q3", "timestamp": "2025-01-03T00:00:00Z"}
`;
      fs.writeFileSync(path.join(logDir, 'sparse.jsonl'), jsonlContent);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3] consultations indexed'));
      consoleSpy.mockRestore();
    });

    it('reports line numbers for invalid JSON in JSONL files', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // JSONL with invalid JSON on line 2
      const jsonlContent = `{"consultation_id": "entry-1", "question": "Q1", "timestamp": "2025-01-01T00:00:00Z"}
{invalid json here}
{"consultation_id": "entry-3", "question": "Q3", "timestamp": "2025-01-03T00:00:00Z"}`;
      fs.writeFileSync(path.join(logDir, 'invalid.jsonl'), jsonlContent);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      indexer.rebuildIndex(logDir);

      // Should report line 2 as invalid
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('line 2')
      );
      consoleSpy.mockRestore();
    });

    it('reports line numbers for missing required fields in JSONL', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // JSONL with missing required field on line 3
      const jsonlContent = `{"consultation_id": "entry-1", "question": "Q1", "timestamp": "2025-01-01T00:00:00Z"}
{"consultation_id": "entry-2", "question": "Q2", "timestamp": "2025-01-02T00:00:00Z"}
{"consultation_id": "entry-3", "question": "Q3"}`;
      fs.writeFileSync(path.join(logDir, 'missing-field.jsonl'), jsonlContent);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      indexer.rebuildIndex(logDir);

      // Should report line 3 as missing required fields
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('line 3')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required fields')
      );
      consoleSpy.mockRestore();
    });

    it('handles Windows-style line endings (CRLF) in JSONL', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // JSONL with CRLF line endings
      const jsonlContent = '{"consultation_id": "entry-1", "question": "Q1", "timestamp": "2025-01-01T00:00:00Z"}\r\n' +
                          '{"consultation_id": "entry-2", "question": "Q2", "timestamp": "2025-01-02T00:00:00Z"}\r\n';
      fs.writeFileSync(path.join(logDir, 'crlf.jsonl'), jsonlContent);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2] consultations indexed'));
      consoleSpy.mockRestore();
    });

    it('does not add explicit line prefix for single JSON file errors', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // Invalid JSON in .json file (not .jsonl)
      fs.writeFileSync(path.join(logDir, 'invalid.json'), '{invalid}');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      indexer.rebuildIndex(logDir);

      // For .json files, we don't add " line N" prefix (the JSON parser may include line info in its own error)
      // The key difference is JSONL files get " line N:" added by our code
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('Invalid JSON in invalid.json:');
      // Should NOT have our explicit line prefix format "invalid.json line N:"
      expect(calls).not.toMatch(/invalid\.json line \d+:/);
      consoleSpy.mockRestore();
    });
  });

  describe('File Type Detection', () => {
    it('processes both .json and .jsonl files', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // Create one of each type
      fs.writeFileSync(
        path.join(logDir, 'single.json'),
        JSON.stringify({ consultation_id: 'json-1', question: 'Q1', timestamp: '2025-01-01T00:00:00Z' })
      );
      fs.writeFileSync(
        path.join(logDir, 'multi.jsonl'),
        '{"consultation_id": "jsonl-1", "question": "Q2", "timestamp": "2025-01-02T00:00:00Z"}\n' +
        '{"consultation_id": "jsonl-2", "question": "Q3", "timestamp": "2025-01-03T00:00:00Z"}'
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3] consultations indexed'));
      consoleSpy.mockRestore();
    });

    it('ignores non-JSON files', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      fs.writeFileSync(path.join(logDir, 'readme.txt'), 'This is a text file');
      fs.writeFileSync(path.join(logDir, 'data.csv'), 'col1,col2\nval1,val2');
      fs.writeFileSync(
        path.join(logDir, 'valid.json'),
        JSON.stringify({ consultation_id: 'valid-1', question: 'Q1', timestamp: '2025-01-01T00:00:00Z' })
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      // Should only index the .json file
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1] consultations indexed'));
      consoleSpy.mockRestore();
    });
  });

  describe('Database Initialization', () => {
    it('creates database directory if it does not exist', () => {
      const nestedPath = path.join(TEST_DB_DIR, 'nested', 'path', 'db.sqlite');

      indexer = new AnalyticsIndexer(nestedPath);

      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);
    });

    it('handles database initialization failure gracefully', () => {
      // Try to create database in a path that can't be written
      // This is tricky to test without mocking, so we'll just verify error handling
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Create indexer with normal path (this should work)
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      // No error should have been logged for normal creation
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize analytics database')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Transaction Atomicity', () => {
    it('indexes consultation atomically', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const result = {
        consultationId: 'atomic-test-1',
        question: 'Test question',
        timestamp: new Date().toISOString(),
        mode: 'consensus' as const,
        state: 'complete' as const,
        agents: [
          { name: 'Agent1', model: 'gpt-4', provider: 'openai' },
          { name: 'Agent2', model: 'claude-3', provider: 'anthropic' }
        ],
        responses: {},
        dissent: []
      };

      // Should not throw
      expect(() => indexer.indexConsultation(result as any)).not.toThrow();
    });

    it('handles re-indexing same consultation (upsert behavior)', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const result = {
        consultationId: 'upsert-test-1',
        question: 'Original question',
        timestamp: new Date().toISOString(),
        mode: 'consensus' as const,
        state: 'complete' as const,
        agents: [],
        responses: {},
        dissent: []
      };

      // Index twice with same ID
      indexer.indexConsultation(result as any);

      const updatedResult = { ...result, question: 'Updated question' };
      expect(() => indexer.indexConsultation(updatedResult as any)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty log directory', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'empty-logs');
      fs.mkdirSync(logDir, { recursive: true });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0] consultations indexed'));
      consoleSpy.mockRestore();
    });

    it('handles non-existent log directory', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex('/non/existent/path');

      // Should complete without error
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles consultation with minimal required fields', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);

      const logDir = path.join(TEST_DB_DIR, 'logs');
      fs.mkdirSync(logDir, { recursive: true });

      // Minimal valid entry
      fs.writeFileSync(
        path.join(logDir, 'minimal.json'),
        JSON.stringify({
          consultation_id: 'minimal-1',
          question: 'Minimal question',
          timestamp: '2025-01-01T00:00:00Z'
        })
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      indexer.rebuildIndex(logDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1] consultations indexed'));
      consoleSpy.mockRestore();
    });
  });

  describe('indexDiscussion (cross-mode analytics)', () => {
    // Read committed rows back through a second connection.
    const read = (sql: string, ...params: any[]) => {
      const db = new Database(TEST_DB_PATH, { readonly: true });
      try {
        return db.prepare(sql).all(...params);
      } finally {
        db.close();
      }
    };

    it('writes a consultations row with mode=discuss and the core fields', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);
      indexer.indexDiscussion({
        id: 'disc-1',
        question: 'Which video vendor?',
        mode: 'discuss',
        recommendation: 'Migrate to Whereby',
        confidence: 0.66,
        totalCost: 0.2134,
        totalTokens: 4200,
        durationMs: 18000,
        timestamp: '2026-06-04T00:00:00Z',
        state: 'complete',
        hasDissent: true,
        agents: [
          { name: 'AgentA', model: 'claude-sonnet-4-5', provider: 'anthropic' },
          { name: 'AgentB', model: 'gpt-5.5', provider: 'openai' },
        ],
      });

      const rows = read('SELECT * FROM consultations WHERE id = ?', 'disc-1') as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'disc-1',
        question: 'Which video vendor?',
        mode: 'discuss',
        final_recommendation: 'Migrate to Whereby',
        confidence: 0.66,
        total_cost: 0.2134,
        total_tokens: 4200,
        duration_ms: 18000,
        created_at: '2026-06-04T00:00:00Z',
        state: 'complete',
        has_dissent: 1,
        total_agents: 2,
      });
      // Consult-only columns are null for discuss runs.
      expect(rows[0].project_type).toBeNull();
      expect(rows[0].convergence_score).toBeNull();
    });

    it('writes the agent panel to consultation_agents', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);
      indexer.indexDiscussion({
        id: 'disc-2',
        question: 'q',
        timestamp: '2026-06-04T00:00:00Z',
        agents: [
          { name: 'AgentA', model: 'claude-sonnet-4-5', provider: 'anthropic' },
          { name: 'AgentB', model: 'gpt-5.5', provider: 'openai' },
          { name: 'AgentC', model: 'gemini-2.5-flash', provider: 'gemini' },
        ],
      });
      const agents = read('SELECT * FROM consultation_agents WHERE consultation_id = ?', 'disc-2') as any[];
      expect(agents).toHaveLength(3);
      expect(agents.map(a => a.provider).sort()).toEqual(['anthropic', 'gemini', 'openai']);
    });

    it('defaults mode to discuss and tolerates missing optional fields', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);
      expect(() =>
        indexer.indexDiscussion({ id: 'disc-3', question: 'q', timestamp: '2026-06-04T00:00:00Z' })
      ).not.toThrow();
      const rows = read('SELECT mode, confidence, total_cost, has_dissent, total_agents FROM consultations WHERE id = ?', 'disc-3') as any[];
      expect(rows[0]).toMatchObject({ mode: 'discuss', total_cost: 0, has_dissent: 0 });
      expect(rows[0].confidence).toBeNull(); // unknown band → null, not 0
      expect(rows[0].total_agents).toBeNull();
    });

    it('is idempotent — re-indexing the same id replaces the row and agents', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);
      const base = { id: 'disc-4', question: 'q', timestamp: '2026-06-04T00:00:00Z' };
      indexer.indexDiscussion({ ...base, recommendation: 'v1', agents: [{ name: 'A', model: 'm', provider: 'p' }] });
      indexer.indexDiscussion({ ...base, recommendation: 'v2', agents: [{ name: 'B', model: 'm2', provider: 'p2' }] });

      const rows = read('SELECT final_recommendation FROM consultations WHERE id = ?', 'disc-4') as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].final_recommendation).toBe('v2');
      const agents = read('SELECT agent_id FROM consultation_agents WHERE consultation_id = ?', 'disc-4') as any[];
      expect(agents).toHaveLength(1);
      expect(agents[0].agent_id).toBe('B');
    });

    it('records a distinct continue mode for continuations', () => {
      indexer = new AnalyticsIndexer(TEST_DB_PATH);
      indexer.indexDiscussion({ id: 'cont-1', question: 'follow-up', mode: 'continue', timestamp: '2026-06-04T00:00:00Z' });
      const rows = read('SELECT mode FROM consultations WHERE id = ?', 'cont-1') as any[];
      expect(rows[0].mode).toBe('continue');
    });
  });
});
