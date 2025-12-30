import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Round3FilterLimits {
  consensus_points: number;
  tensions: number;
}

export interface Round4FilterLimits {
  consensus_points: number;
  tensions: number;
  challenges: number;
  rebuttals: number;
}

export interface FilterConfiguration {
  round3: Round3FilterLimits;
  round4: Round4FilterLimits;
}

export class FilterConfig {
  private static readonly DEFAULT_CONFIG: FilterConfiguration = {
    round3: {
      consensus_points: 3,
      tensions: 2
    },
    round4: {
      consensus_points: 3,
      tensions: 2,
      challenges: 5,
      rebuttals: 5
    }
  };

  private config: FilterConfiguration;

  constructor() {
    this.config = this.loadConfig();
  }

  getRound3Limits(): Round3FilterLimits {
    return this.config.round3;
  }

  getRound4Limits(): Round4FilterLimits {
    return this.config.round4;
  }

  private loadConfig(): FilterConfiguration {
    try {
      const configPath = path.join(os.homedir(), '.llm-conclave', 'config.json');

      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const configFile = JSON.parse(fileContent);

        if (configFile.filtering) {
          const round3 = {
            ...FilterConfig.DEFAULT_CONFIG.round3,
            ...(configFile.filtering.round3 || {})
          };
          const round4 = {
            ...FilterConfig.DEFAULT_CONFIG.round4,
            ...(configFile.filtering.round4 || {})
          };

          // Validate limits (Story 2.6, Fix #7)
          this.validateLimits(round3);
          this.validateLimits(round4);

          return {
            round3,
            round4
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load filter config, using defaults:', error);
    }

    return FilterConfig.DEFAULT_CONFIG;
  }

  /**
   * Validate that filter limits are positive integers
   */
  private validateLimits(limits: any): void {
    for (const [key, value] of Object.entries(limits)) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid filter limit: ${key} must be a positive integer, got ${value}`);
      }
    }
  }
}