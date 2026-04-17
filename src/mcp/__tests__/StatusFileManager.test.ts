/**
 * Tests for StatusFileManager — atomic write/read/delete of active-discussion.json
 */
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { StatusFileManager, ActiveDiscussionStatus } from '../StatusFileManager.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sfm-test-'));
}

const sampleStatus: ActiveDiscussionStatus = {
  active: true,
  task: 'Should AI be regulated?',
  startTime: '2026-04-07T05:00:00.000Z',
  elapsedMs: 5000,
  agents: ['Claude', 'GPT-4', 'Gemini'],
  currentRound: 1,
  maxRounds: 4,
  currentAgent: null,
  updatedAt: '2026-04-07T05:00:05.000Z',
};

describe('StatusFileManager', () => {
  let tmpDir: string;
  let manager: StatusFileManager;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    manager = new StatusFileManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeStatus', () => {
    it('creates active-discussion.json with correct JSON', () => {
      manager.writeStatus(sampleStatus);
      const filePath = path.join(tmpDir, 'active-discussion.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(parsed.active).toBe(true);
      expect(parsed.task).toBe('Should AI be regulated?');
      expect(parsed.agents).toEqual(['Claude', 'GPT-4', 'Gemini']);
      expect(parsed.currentRound).toBe(1);
      expect(parsed.maxRounds).toBe(4);
      expect(parsed.currentAgent).toBeNull();
    });

    it('overwrites an existing status file', () => {
      manager.writeStatus(sampleStatus);
      const updated = { ...sampleStatus, currentRound: 2, elapsedMs: 30000 };
      manager.writeStatus(updated);
      const filePath = path.join(tmpDir, 'active-discussion.json');
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(parsed.currentRound).toBe(2);
      expect(parsed.elapsedMs).toBe(30000);
    });

    it('does not throw even if baseDir is unwritable (per D-09)', () => {
      const badManager = new StatusFileManager('/nonexistent/path/that/does/not/exist');
      expect(() => badManager.writeStatus(sampleStatus)).not.toThrow();
    });

    it('writes atomically via temp file + rename (no partial reads)', () => {
      // Write large-ish content; temp+rename ensures file is always complete JSON
      manager.writeStatus(sampleStatus);
      const filePath = path.join(tmpDir, 'active-discussion.json');
      const tmpPath = filePath + '.tmp';
      // tmp file should NOT exist after successful write (cleaned up by rename)
      expect(fs.existsSync(tmpPath)).toBe(false);
      // Main file should be valid JSON
      expect(() => JSON.parse(fs.readFileSync(filePath, 'utf-8'))).not.toThrow();
    });
  });

  describe('readStatus', () => {
    it('returns parsed status when file exists and is valid', () => {
      manager.writeStatus(sampleStatus);
      const result = manager.readStatus();
      expect(result).not.toBeNull();
      expect(result!.task).toBe('Should AI be regulated?');
      expect(result!.active).toBe(true);
      expect(result!.agents).toHaveLength(3);
    });

    it('returns null when file does not exist', () => {
      const result = manager.readStatus();
      expect(result).toBeNull();
    });

    it('returns null when file contains invalid JSON', () => {
      const filePath = path.join(tmpDir, 'active-discussion.json');
      fs.writeFileSync(filePath, 'this is not json {{{{', 'utf-8');
      const result = manager.readStatus();
      expect(result).toBeNull();
    });

    it('returns null for an empty file', () => {
      const filePath = path.join(tmpDir, 'active-discussion.json');
      fs.writeFileSync(filePath, '', 'utf-8');
      const result = manager.readStatus();
      expect(result).toBeNull();
    });

    it('does not throw on any error condition', () => {
      // Point at a directory instead of a file
      const dirPath = path.join(tmpDir, 'active-discussion.json');
      fs.mkdirSync(dirPath);
      expect(() => manager.readStatus()).not.toThrow();
    });
  });

  describe('filePath resolution honors getConclaveHome() (AUDIT-04)', () => {
    const ORIGINAL_ENV = process.env.LLM_CONCLAVE_HOME;

    beforeEach(() => {
      delete process.env.LLM_CONCLAVE_HOME;
    });

    afterAll(() => {
      if (ORIGINAL_ENV === undefined) {
        delete process.env.LLM_CONCLAVE_HOME;
      } else {
        process.env.LLM_CONCLAVE_HOME = ORIGINAL_ENV;
      }
    });

    it('defaults to getConclaveHome()/active-discussion.json when baseDir is omitted', () => {
      const mgr = new StatusFileManager();
      const filePath = (mgr as any).filePath;
      // Jest env → resolver returns os.tmpdir()/llm-conclave-test-logs
      const expected = path.join(os.tmpdir(), 'llm-conclave-test-logs', 'active-discussion.json');
      expect(filePath).toBe(expected);
    });

    it('env var LLM_CONCLAVE_HOME redirects filePath without code change', () => {
      process.env.LLM_CONCLAVE_HOME = '/custom/sandbox';
      const mgr = new StatusFileManager();
      const filePath = (mgr as any).filePath;
      expect(filePath).toBe('/custom/sandbox/active-discussion.json');
    });

    it('explicit baseDir override still wins over env var (test-injection contract preserved)', () => {
      process.env.LLM_CONCLAVE_HOME = '/should/be/ignored';
      const mgr = new StatusFileManager('/explicit');
      const filePath = (mgr as any).filePath;
      expect(filePath).toBe('/explicit/active-discussion.json');
    });
  });

  describe('deleteStatus', () => {
    it('removes the active-discussion.json file', () => {
      manager.writeStatus(sampleStatus);
      const filePath = path.join(tmpDir, 'active-discussion.json');
      expect(fs.existsSync(filePath)).toBe(true);
      manager.deleteStatus();
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('does not throw when file does not exist (ENOENT is ignored)', () => {
      expect(() => manager.deleteStatus()).not.toThrow();
    });

    it('does not throw when called twice in a row', () => {
      manager.writeStatus(sampleStatus);
      manager.deleteStatus();
      expect(() => manager.deleteStatus()).not.toThrow();
    });
  });
});
