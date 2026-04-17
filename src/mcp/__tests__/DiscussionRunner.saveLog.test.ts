/**
 * Tests for saveDiscussionLog path resolution (AUDIT-04).
 *
 * Verifies that saveDiscussionLog writes under getConclaveHome()/discuss-logs
 * rather than the legacy process.env.HOME + '.llm-conclave/discuss-logs'.
 * No other DiscussionRunner concerns are exercised here.
 */

import * as path from 'path';
import * as os from 'os';

// fs needs to be mocked BEFORE importing saveDiscussionLog so the
// writeFileSync spy captures the path the real implementation passes.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

import * as fs from 'fs';
import { saveDiscussionLog } from '../DiscussionRunner';

const minimalResult = {
  task: 'test task',
  conversationHistory: [],
  solution: 'ok',
  consensusReached: true,
  rounds: 1,
  maxRounds: 1,
  failedAgents: [],
  agentSubstitutions: {},
};

describe('saveDiscussionLog path resolution (AUDIT-04)', () => {
  const ORIGINAL_ENV = process.env.LLM_CONCLAVE_HOME;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_CONCLAVE_HOME;
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.LLM_CONCLAVE_HOME;
    } else {
      process.env.LLM_CONCLAVE_HOME = ORIGINAL_ENV;
    }
  });

  it('writes discuss log under getConclaveHome()/discuss-logs when env is unset (Jest env → tmpdir)', () => {
    const filePath = saveDiscussionLog(minimalResult);
    const expectedDir = path.join(os.tmpdir(), 'llm-conclave-test-logs', 'discuss-logs');
    expect(filePath.startsWith(expectedDir + path.sep)).toBe(true);
    // The file written via writeFileSync must point inside the resolved dir.
    const writeCalls = (fs.writeFileSync as jest.Mock).mock.calls;
    expect(writeCalls.length).toBe(1);
    const writtenPath = writeCalls[0][0] as string;
    expect(writtenPath.startsWith(expectedDir + path.sep)).toBe(true);
    expect(writtenPath.endsWith('.md')).toBe(true);
  });

  it('writes discuss log under LLM_CONCLAVE_HOME/discuss-logs when env is set', () => {
    process.env.LLM_CONCLAVE_HOME = '/tmp/sandbox-conclave-test';
    const filePath = saveDiscussionLog(minimalResult);
    expect(filePath.startsWith('/tmp/sandbox-conclave-test/discuss-logs/')).toBe(true);
    const writeCalls = (fs.writeFileSync as jest.Mock).mock.calls;
    expect(writeCalls.length).toBe(1);
    const writtenPath = writeCalls[0][0] as string;
    expect(writtenPath.startsWith('/tmp/sandbox-conclave-test/discuss-logs/')).toBe(true);
  });

  it('never routes through process.env.HOME concatenation (no legacy path)', () => {
    process.env.LLM_CONCLAVE_HOME = '/tmp/sandbox-conclave-audit04';
    // Save HOME and pick a value that would make the legacy path different.
    const ORIGINAL_HOME = process.env.HOME;
    process.env.HOME = '/should/not/be/used';
    try {
      const filePath = saveDiscussionLog(minimalResult);
      // Must NOT fall back to $HOME/.llm-conclave/discuss-logs.
      expect(filePath.includes('/should/not/be/used')).toBe(false);
      expect(filePath.startsWith('/tmp/sandbox-conclave-audit04/discuss-logs/')).toBe(true);
    } finally {
      if (ORIGINAL_HOME === undefined) delete process.env.HOME;
      else process.env.HOME = ORIGINAL_HOME;
    }
  });
});
