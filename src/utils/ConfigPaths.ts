import * as path from 'path';
import * as os from 'os';

/**
 * Shared configuration paths for LLM Conclave
 */
export const ConfigPaths = {
  /**
   * Global configuration file path (~/.llm-conclave/config.json)
   */
  globalConfig: path.join(os.homedir(), '.llm-conclave', 'config.json'),

  /**
   * Project configuration file name (.llm-conclave.json)
   */
  projectConfigName: '.llm-conclave.json'
};
