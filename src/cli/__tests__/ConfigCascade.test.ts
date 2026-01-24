import { ConfigCascade } from '../ConfigCascade';
import * as path from 'path';
import * as os from 'os';

// Mock fs module entirely
const mockExistsSync = jest.fn().mockReturnValue(false);
const mockReadFileSync = jest.fn().mockReturnValue('{}');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue('{}')
}));

// Get the mocked fs module
const fs = require('fs') as { existsSync: jest.Mock; readFileSync: jest.Mock };

// Mock dependencies
jest.mock('../../core/ConfigLoader', () => ({
  load: jest.fn().mockReturnValue({}),
  validate: jest.fn().mockImplementation((config) => config)
}));

jest.mock('../../utils/ConfigPaths', () => ({
  ConfigPaths: {
    globalConfig: '/mock/global/config.json'
  }
}));

describe('ConfigCascade', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('resolve', () => {
    it('should return defaults when no config provided', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {});

      expect(config.mode).toBe('consensus');
      expect(config.stream).toBe(true);
      expect(config.judge).toBeDefined();
      expect(config.judge.model).toBe('gpt-4o');
    });

    it('should include default agents', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {});

      expect(config.agents).toBeDefined();
      expect(config.agents.Primary).toBeDefined();
      expect(config.agents.Primary.model).toBe('claude-sonnet-4-5');
      expect(config.agents.Validator).toBeDefined();
      expect(config.agents.Reviewer).toBeDefined();
    });

    it('should include default providers', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {});

      expect(config.providers.openai.enabled).toBe(true);
      expect(config.providers.anthropic.enabled).toBe(true);
      expect(config.providers.google.enabled).toBe(true);
    });

    it('should include consult mode defaults', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {});

      expect(config.consult).toBeDefined();
      expect(config.consult.alwaysAllowUnder).toBe(0.50);
    });
  });

  describe('CLI flags override', () => {
    it('should override defaults with CLI flags', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({
        mode: 'orchestrated',
        stream: false
      }, {});

      expect(config.mode).toBe('orchestrated');
      expect(config.stream).toBe(false);
    });

    it('should remove Commander.js internal properties', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({
        mode: 'consensus',
        _: ['extra'],
        args: ['raw'],
        rawArgs: ['--mode', 'consensus'],
        commands: [],
        options: []
      }, {});

      expect(config._).toBeUndefined();
      expect(config.args).toBeUndefined();
      expect(config.rawArgs).toBeUndefined();
      expect(config.commands).toBeUndefined();
      expect(config.options).toBeUndefined();
    });
  });

  describe('Environment variable parsing', () => {
    it('should parse CONCLAVE_ prefixed environment variables', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        CONCLAVE_MODE: 'orchestrated',
        CONCLAVE_STREAM: 'false'
      });

      expect(config.mode).toBe('orchestrated');
      expect(config.stream).toBe(false);
    });

    it('should parse boolean values correctly', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        CONCLAVE_STREAM: 'true',
        CONCLAVE_VERBOSE: 'false'
      });

      expect(config.stream).toBe(true);
      expect(config.verbose).toBe(false);
    });

    it('should parse numeric values correctly', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        CONCLAVE_ROUNDS: '5'
      });

      expect(config.rounds).toBe(5);
    });

    it('should parse nested keys (e.g., CONCLAVE_JUDGE_MODEL)', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        CONCLAVE_JUDGE_MODEL: 'gpt-4-turbo'
      });

      expect(config.judge.model).toBe('gpt-4-turbo');
    });

    it('should ignore non-CONCLAVE_ prefixed variables', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        OTHER_VAR: 'ignored',
        HOME: '/home/user'
      });

      expect(config.OTHER_VAR).toBeUndefined();
      expect(config.HOME).toBeUndefined();
    });

    it('should parse JSON values', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        CONCLAVE_FORMAT: '{"type":"json"}'
      });

      expect(config.format).toEqual({ type: 'json' });
    });
  });

  describe('Priority order', () => {
    it('should prioritize CLI flags over environment variables', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve(
        { mode: 'orchestrated' },
        { CONCLAVE_MODE: 'consensus' }
      );

      expect(config.mode).toBe('orchestrated');
    });

    it('should prioritize environment variables over defaults', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = ConfigCascade.resolve({}, {
        CONCLAVE_MODE: 'iterative'
      });

      expect(config.mode).toBe('iterative');
    });
  });

  describe('shouldUseZeroConfig', () => {
    it('should return true when no config files exist', () => {
      fs.existsSync.mockReturnValue(false);

      expect(ConfigCascade.shouldUseZeroConfig()).toBe(true);
    });

    it('should return false when project config exists', () => {
      fs.existsSync.mockImplementation((filePath: string) => {
        return filePath === '.llm-conclave.json';
      });

      expect(ConfigCascade.shouldUseZeroConfig()).toBe(false);
    });
  });

  describe('getZeroConfigMessage', () => {
    it('should return informative message', () => {
      const message = ConfigCascade.getZeroConfigMessage();

      expect(message).toContain('No configuration found');
      expect(message).toContain('smart defaults');
      expect(message).toContain('Claude Sonnet');
      expect(message).toContain('GPT-4o');
      expect(message).toContain('llm-conclave init');
    });
  });

  describe('Inline JSON config', () => {
    it('should parse inline JSON config string and include agents in resolved config', () => {
      fs.existsSync.mockReturnValue(false);

      const inlineConfig = JSON.stringify({
        agents: {
          TestAgent: { model: 'gpt-4o', prompt: 'Test prompt' }
        }
      });

      const config = ConfigCascade.resolve({ config: inlineConfig }, {});

      // The inline config should be parsed and merged into the final config
      expect(config.agents).toBeDefined();
      expect(config.agents.TestAgent).toBeDefined();
      expect(config.agents.TestAgent.model).toBe('gpt-4o');
    });
  });
});
