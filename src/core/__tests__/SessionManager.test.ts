import SessionManager from '../SessionManager.js';

// Mock fs modules to avoid actual filesystem operations
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{"sessions":[],"totalSessions":0}'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

// Access mocked modules after jest.mock declarations
import * as fsMock from 'fs/promises';
const writeFileMock = fsMock.writeFile as jest.Mock;
const readFileMock = fsMock.readFile as jest.Mock;

describe('SessionManager', () => {
  describe('createSessionManifest cost data (COST-01)', () => {
    let manager: SessionManager;

    const sampleAgents = [
      {
        name: 'Agent1',
        model: 'gpt-4o',
        systemPrompt: '',
        provider: { constructor: { name: 'OpenAIProvider' } },
      },
    ];

    const baseResult = {
      rounds: 3,
      maxRounds: 4,
      solution: 'test solution',
      conversationHistory: [],
      consensusReached: false,
    };

    beforeEach(() => {
      manager = new SessionManager('/tmp/test-sessions');
    });

    it('stores CostTracker data in session manifest when result.cost is present', () => {
      const result = {
        ...baseResult,
        cost: {
          totalCost: 0.042,
          totalTokens: { input: 5000, output: 2000 },
          totalCalls: 8,
        },
      };

      const session = manager.createSessionManifest(
        'consensus',
        'test task',
        sampleAgents,
        [],
        result,
        undefined,
        undefined
      );

      expect(session.cost.totalCost).toBe(0.042);
      expect(session.cost.totalTokens.input).toBe(5000);
      expect(session.cost.totalTokens.output).toBe(2000);
      expect(session.cost.totalCalls).toBe(8);
    });

    it('falls back to zero cost when result.cost is undefined', () => {
      const result = {
        ...baseResult,
        // No cost property
      };

      const session = manager.createSessionManifest(
        'consensus',
        'test task',
        sampleAgents,
        [],
        result,
        undefined,
        undefined
      );

      expect(session.cost.totalCost).toBe(0);
      expect(session.cost.totalTokens.input).toBe(0);
      expect(session.cost.totalTokens.output).toBe(0);
      expect(session.cost.totalCalls).toBe(0);
    });
  });

  describe('consensusReached in session listing (DATA-05)', () => {
    let manager: SessionManager;

    const sampleAgents = [
      {
        name: 'Agent1',
        model: 'gpt-4o',
        systemPrompt: '',
        provider: { constructor: { name: 'OpenAIProvider' } },
      },
    ];

    beforeEach(() => {
      manager = new SessionManager('/tmp/test-sessions');
      writeFileMock.mockClear();
      readFileMock.mockResolvedValue('{"sessions":[],"totalSessions":0}');
    });

    it('saves consensusReached: true to session summary in index manifest (DATA-05)', async () => {
      const result = {
        rounds: 2,
        maxRounds: 4,
        solution: 'test solution',
        conversationHistory: [],
        consensusReached: true,
      };

      const session = manager.createSessionManifest(
        'consensus', 'test task', sampleAgents, [], result, undefined, undefined
      );

      await manager.saveSession(session);

      // Find the LAST manifest.json write call (updateIndexManifest writes after initialize())
      const writeFileCalls: any[][] = writeFileMock.mock.calls;
      const manifestWrites = writeFileCalls.filter(
        (call) => typeof call[1] === 'string' && call[1].includes('"sessions"')
      );
      expect(manifestWrites.length).toBeGreaterThan(0);
      // The last write is from updateIndexManifest (has actual sessions data)
      const manifestWrite = manifestWrites[manifestWrites.length - 1];
      const written = JSON.parse(manifestWrite[1] as string);
      expect(written.sessions[0].consensusReached).toBe(true);
    });

    it('saves consensusReached: false to session summary in index manifest (DATA-05)', async () => {
      const result = {
        rounds: 2,
        maxRounds: 4,
        solution: 'test solution',
        conversationHistory: [],
        consensusReached: false,
      };

      const session = manager.createSessionManifest(
        'consensus', 'test task', sampleAgents, [], result, undefined, undefined
      );

      await manager.saveSession(session);

      const writeFileCalls: any[][] = writeFileMock.mock.calls;
      const manifestWrites = writeFileCalls.filter(
        (call) => typeof call[1] === 'string' && call[1].includes('"sessions"')
      );
      expect(manifestWrites.length).toBeGreaterThan(0);
      // The last write is from updateIndexManifest (has actual sessions data)
      const manifestWrite = manifestWrites[manifestWrites.length - 1];
      const written = JSON.parse(manifestWrite[1] as string);
      expect(written.sessions[0].consensusReached).toBe(false);
    });
  });
});
