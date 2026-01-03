import { CostGate } from '../CostGate';
import { CostEstimate } from '../CostEstimator';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigPaths } from '../../../utils/ConfigPaths';

// Mock inquirer
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

import inquirer from 'inquirer';
const mockPrompt = inquirer.prompt as jest.MockedFunction<typeof inquirer.prompt>;

describe('CostGate', () => {
  let costGate: CostGate;
  let mockEstimate: CostEstimate;
  let configPath: string;

  beforeEach(() => {
    costGate = new CostGate();
    mockEstimate = {
      inputTokens: 1234,
      outputTokens: 8000,
      totalTokens: 9234,
      estimatedCostUsd: 0.45
    };
    configPath = ConfigPaths.globalConfig;

    // Clear mocks
    mockPrompt.mockClear();
  });

  afterEach(() => {
    // Clean up test config if it exists
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        // Only delete if it's a test config (has specific test values)
        if (config.consult?.alwaysAllowUnder === 1.00 || config.consult?.alwaysAllowUnder === 0.50) {
          fs.unlinkSync(configPath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('shouldPromptUser', () => {
    it('should return true when cost exceeds threshold', () => {
      const config = {
        consult: { alwaysAllowUnder: 0.30 }
      };
      const result = costGate.shouldPromptUser(mockEstimate, config);
      expect(result).toBe(true);
    });

    it('should return false when cost is under threshold', () => {
      const config = {
        consult: { alwaysAllowUnder: 0.50 }
      };
      const result = costGate.shouldPromptUser(mockEstimate, config);
      expect(result).toBe(false);
    });

    it('should use default threshold of 0.50 when not configured', () => {
      const config = {};
      const lowEstimate = { ...mockEstimate, estimatedCostUsd: 0.30 };
      const highEstimate = { ...mockEstimate, estimatedCostUsd: 0.70 };

      expect(costGate.shouldPromptUser(lowEstimate, config)).toBe(false);
      expect(costGate.shouldPromptUser(highEstimate, config)).toBe(true);
    });

    it('should handle edge case when cost equals threshold', () => {
      const config = {
        consult: { alwaysAllowUnder: 0.45 }
      };
      const result = costGate.shouldPromptUser(mockEstimate, config);
      // Cost equals threshold, should NOT prompt (<=)
      expect(result).toBe(false);
    });
  });

  describe('getUserConsent', () => {
    it('should return approved when user selects Yes', async () => {
      mockPrompt.mockResolvedValueOnce({ consent: 'approved' });

      const result = await costGate.getUserConsent(mockEstimate, 3, 4);

      expect(result).toBe('approved');
      expect(mockPrompt).toHaveBeenCalledTimes(1);
      expect(mockPrompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'list',
          name: 'consent',
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'approved' }),
            expect.objectContaining({ value: 'denied' }),
            expect.objectContaining({ value: 'always' })
          ])
        })
      ]);
    });

    it('should return denied when user selects No', async () => {
      mockPrompt.mockResolvedValueOnce({ consent: 'denied' });

      const result = await costGate.getUserConsent(mockEstimate, 3, 4);

      expect(result).toBe('denied');
      expect(mockPrompt).toHaveBeenCalledTimes(1);
    });

    it('should prompt for threshold and save when user selects Always', async () => {
      mockPrompt
        .mockResolvedValueOnce({ consent: 'always' })
        .mockResolvedValueOnce({ threshold: '1.00' });

      const saveThresholdSpy = jest.spyOn(costGate, 'saveAutoApproveThreshold');

      const result = await costGate.getUserConsent(mockEstimate, 3, 4);

      expect(result).toBe('approved'); // Always returns approved after setting threshold
      expect(mockPrompt).toHaveBeenCalledTimes(2);
      expect(saveThresholdSpy).toHaveBeenCalledWith(1.00);

      saveThresholdSpy.mockRestore();
    });

    it('should validate threshold input is a positive number', async () => {
      mockPrompt
        .mockResolvedValueOnce({ consent: 'always' })
        .mockResolvedValueOnce({ threshold: '0.50' });

      await costGate.getUserConsent(mockEstimate, 3, 4);

      // Check that validation function exists
      const promptCall = mockPrompt.mock.calls[1][0] as any;
      const validateFn = promptCall[0].validate;

      expect(validateFn).toBeDefined();
      expect(validateFn('0.50')).toBe(true);
      expect(validateFn('-1')).toBe('Please enter a valid positive number');
      expect(validateFn('abc')).toBe('Please enter a valid positive number');
    });
  });

  describe('saveAutoApproveThreshold', () => {
    it('should create config file if it does not exist', async () => {
      // Ensure config doesn't exist
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      await costGate.saveAutoApproveThreshold(1.00);

      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.consult.alwaysAllowUnder).toBe(1.00);
    });

    it('should merge with existing config', async () => {
      // Create existing config
      const existingConfig = {
        someOtherSetting: 'value',
        consult: {
          someOtherConsultSetting: 'test'
        }
      };
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

      await costGate.saveAutoApproveThreshold(0.75);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.someOtherSetting).toBe('value');
      expect(config.consult.someOtherConsultSetting).toBe('test');
      expect(config.consult.alwaysAllowUnder).toBe(0.75);
    });

    it('should create consult section if it does not exist', async () => {
      // Create config without consult section
      const existingConfig = {
        someOtherSetting: 'value'
      };
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

      await costGate.saveAutoApproveThreshold(0.50);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.consult).toBeDefined();
      expect(config.consult.alwaysAllowUnder).toBe(0.50);
    });

    it('should handle corrupted config gracefully', async () => {
      // Write invalid JSON
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, '{ invalid json }');

      // Should not throw
      await expect(costGate.saveAutoApproveThreshold(0.50)).resolves.not.toThrow();

      // Should create valid config
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.consult.alwaysAllowUnder).toBe(0.50);
    });
  });

  describe('displayAutoApproved', () => {
    it('should display formatted auto-approval message', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      costGate.displayAutoApproved(0.30);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('$0.3000')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('auto-approved')
      );

      consoleSpy.mockRestore();
    });
  });
});
