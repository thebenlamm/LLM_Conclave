import * as path from 'path';
import * as os from 'os';

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
