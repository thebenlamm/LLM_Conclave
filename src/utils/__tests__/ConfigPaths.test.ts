/**
 * Tests for getConclaveHome() precedence resolver (AUDIT-04).
 *
 * Validates the precedence chain:
 *   1. LLM_CONCLAVE_HOME env var (trimmed, non-empty)
 *   2. conclaveHome key in ~/.llm-conclave/config.json
 *   3. Test-env tmpdir fallback
 *   4. Legacy default (os.homedir()/.llm-conclave)
 *
 * All filesystem interactions are mocked — no real writes happen under
 * the user's HOME directory. We mirror the project-wide pattern from
 * src/mcp/__tests__/server.handlers.test.ts: require('fs') inside each
 * test and rely on jest.restoreAllMocks() in beforeEach to reset spies.
 */

import * as path from 'path';
import * as os from 'os';
import { getConclaveHome } from '../ConfigPaths';

// Shapes an ENOENT error for readFileSync mock rejections.
function makeEnoent(): Error & { code: string } {
  return Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}

describe('getConclaveHome()', () => {
  const ORIGINAL_ENV = process.env.LLM_CONCLAVE_HOME;

  beforeEach(() => {
    delete process.env.LLM_CONCLAVE_HOME;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.LLM_CONCLAVE_HOME;
    } else {
      process.env.LLM_CONCLAVE_HOME = ORIGINAL_ENV;
    }
    jest.restoreAllMocks();
  });

  it('env var wins when set', () => {
    process.env.LLM_CONCLAVE_HOME = '/custom/sandbox';
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw makeEnoent(); });
    expect(getConclaveHome()).toBe('/custom/sandbox');
  });

  it('env var is trimmed before use', () => {
    process.env.LLM_CONCLAVE_HOME = '  /padded/path  ';
    expect(getConclaveHome()).toBe('/padded/path');
  });

  it('empty string env var falls through', () => {
    process.env.LLM_CONCLAVE_HOME = '';
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw makeEnoent(); });
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('whitespace-only env var falls through', () => {
    process.env.LLM_CONCLAVE_HOME = '   ';
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw makeEnoent(); });
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('config.json conclaveHome key is honored when env unset', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: '/from/config' })
    );
    expect(getConclaveHome()).toBe('/from/config');
  });

  it('config.json conclaveHome value is trimmed', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: '  /cfg/trim  ' })
    );
    expect(getConclaveHome()).toBe('/cfg/trim');
  });

  it('empty config value falls through', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: '' })
    );
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('whitespace-only config value falls through', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: '   ' })
    );
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('malformed config.json falls through without throwing', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => 'not json at all {');
    let resolved: string | undefined;
    expect(() => { resolved = getConclaveHome(); }).not.toThrow();
    expect(resolved).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('config.json that is a JSON array (not object) falls through', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify(['not', 'an', 'object'])
    );
    // Arrays are typeof 'object' but do not have a string conclaveHome;
    // property check (`typeof parsed.conclaveHome === 'string'`) must reject.
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('config.json with non-string conclaveHome falls through', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: 42 })
    );
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('test env returns tmpdir when nothing configured', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw makeEnoent(); });
    // Jest sets JEST_WORKER_ID, so this is always test env.
    expect(getConclaveHome()).toBe(path.join(os.tmpdir(), 'llm-conclave-test-logs'));
  });

  it('env wins over config when both set', () => {
    process.env.LLM_CONCLAVE_HOME = '/env/path';
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: '/cfg/path' })
    );
    expect(getConclaveHome()).toBe('/env/path');
  });

  it('returns absolute path for env branch', () => {
    process.env.LLM_CONCLAVE_HOME = '/abs/env/path';
    expect(path.isAbsolute(getConclaveHome())).toBe(true);
  });

  it('returns absolute path for config branch', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(
      () => JSON.stringify({ conclaveHome: '/abs/config/path' })
    );
    expect(path.isAbsolute(getConclaveHome())).toBe(true);
  });

  it('returns absolute path for fallback branch', () => {
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw makeEnoent(); });
    expect(path.isAbsolute(getConclaveHome())).toBe(true);
  });
});
