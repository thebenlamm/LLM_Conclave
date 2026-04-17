import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Shared configuration paths for LLM Conclave
 */
export const ConfigPaths = {
  /**
   * Global configuration file path (~/.llm-conclave/config.json)
   */
  get globalConfig() {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    return isTestEnv
      ? path.join(os.tmpdir(), 'llm-conclave-test-logs', 'config.json')
      : path.join(os.homedir(), '.llm-conclave', 'config.json');
  },

  /**
   * Project configuration file name (.llm-conclave.json)
   */
  projectConfigName: '.llm-conclave.json'
};

/**
 * Resolve the effective LLM Conclave data root (AUDIT-04).
 *
 * Precedence (highest to lowest):
 *   1. `process.env.LLM_CONCLAVE_HOME` — if set and non-empty after trim,
 *      this wins over every other source. Sandboxed MCP callers (e.g.,
 *      Trollix) use this to relocate runtime artifacts without code change.
 *   2. `conclaveHome` string property in `~/.llm-conclave/config.json` —
 *      honored only when env is unset/empty and the value is a non-empty
 *      trimmed string. The config lookup always targets the real user
 *      home (`os.homedir()`), NOT `ConfigPaths.globalConfig`, because in
 *      test environments `globalConfig` redirects to tmpdir.
 *   3. Test-env fallback: `path.join(os.tmpdir(), 'llm-conclave-test-logs')`
 *      — activated when `NODE_ENV === 'test'` or `JEST_WORKER_ID` is set
 *      and no higher-precedence source supplies a path.
 *   4. Default: `path.join(os.homedir(), '.llm-conclave')` — the legacy
 *      location. Existing installations behave identically if they never
 *      set the env var or config key.
 *
 * Always returns an absolute path. Never throws: a malformed or missing
 * `config.json` silently falls through to the next precedence level. The
 * resolver is intentionally quiet (no logging) because it is called on
 * every artifact path resolution; callers can surface the resolved path
 * separately if they need audit visibility.
 *
 * Note: `ConfigPaths.globalConfig` itself MUST continue to use
 * `os.homedir()` (or tmpdir in tests) because the config file tells us
 * where the *data* goes — it cannot itself live under the user-configured
 * data root without a chicken-and-egg problem.
 *
 * @returns Absolute path to the effective LLM Conclave data root.
 */
export function getConclaveHome(): string {
  // 1. Env var precedence (highest)
  const envHome = process.env.LLM_CONCLAVE_HOME;
  if (envHome && envHome.trim().length > 0) {
    return envHome.trim();
  }

  // 2. Config-file key precedence. Always read from the real user home,
  //    not ConfigPaths.globalConfig, so production reads are not shadowed
  //    by tmpdir in test environments.
  try {
    const configPath = path.join(os.homedir(), '.llm-conclave', 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.conclaveHome === 'string' &&
      parsed.conclaveHome.trim().length > 0
    ) {
      return parsed.conclaveHome.trim();
    }
  } catch {
    // ENOENT, parse error, or any other I/O issue → silent fall-through.
    // Do NOT log: this function runs frequently and a missing config is
    // the normal case for default installations.
  }

  // 3. Test-env fallback
  const isTestEnv =
    process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  if (isTestEnv) {
    return path.join(os.tmpdir(), 'llm-conclave-test-logs');
  }

  // 4. Default
  return path.join(os.homedir(), '.llm-conclave');
}
