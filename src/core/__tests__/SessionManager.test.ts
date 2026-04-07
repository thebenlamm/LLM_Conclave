import SessionManager from '../SessionManager.js';

// Mock fs modules to avoid actual filesystem operations
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

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
});
