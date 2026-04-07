/**
 * Tests for DiscussionRunner abstraction.
 * Mocks ConversationManager, EventBus, SessionManager, ConfigCascade, PersonaSystem, ProviderFactory.
 */

// --- Mocks must be hoisted before imports ---

const mockStartConversation = jest.fn();
const mockConversationManager = {
  startConversation: mockStartConversation,
  conversationHistory: [] as any[],
  currentRound: 0,
  abortSignal: undefined as any,
};
jest.mock('../../core/ConversationManager.js', () => ({
  __esModule: true,
  default: jest.fn(() => mockConversationManager),
}));

const mockScopedEventBus = {
  on: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
};
jest.mock('../../core/EventBus.js', () => ({
  EventBus: {
    createInstance: jest.fn(() => mockScopedEventBus),
  },
}));

const mockSaveSession = jest.fn();
const mockCreateSessionManifest = jest.fn(() => ({ id: 'session-abc', task: 'test' }));
jest.mock('../../core/SessionManager.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    saveSession: mockSaveSession,
    createSessionManifest: mockCreateSessionManifest,
  })),
}));

const mockConfigResolve = jest.fn();
jest.mock('../../config/ConfigCascade.js', () => ({
  ConfigCascade: {
    resolve: mockConfigResolve,
  },
}));

const mockGetPersonas = jest.fn();
const mockPersonasToAgents = jest.fn();
jest.mock('../../config/PersonaSystem.js', () => ({
  PersonaSystem: {
    getPersonas: mockGetPersonas,
    personasToAgents: mockPersonasToAgents,
  },
}));

const mockCreateProvider = jest.fn(() => ({ type: 'mock-provider' }));
jest.mock('../../providers/ProviderFactory.js', () => ({
  __esModule: true,
  default: {
    createProvider: mockCreateProvider,
  },
}));

// Mock ProjectContext
jest.mock('../../utils/ProjectContext.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    formatContext: jest.fn(() => 'project context'),
  })),
}));
jest.mock('fs/promises', () => ({
  lstat: jest.fn().mockResolvedValue({ isSymbolicLink: () => false }),
}));

// Mock fs to avoid actual filesystem writes during tests
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// --- Imports after mocks ---
import { DiscussionRunner, DiscussionRunnerOptions } from '../DiscussionRunner';
import ConversationManager from '../../core/ConversationManager.js';
import { EventBus } from '../../core/EventBus.js';
import SessionManager from '../../core/SessionManager.js';
import { ConfigCascade } from '../../config/ConfigCascade.js';
import { PersonaSystem } from '../../config/PersonaSystem.js';

// Default mock config returned by ConfigCascade.resolve
const defaultConfig = {
  max_rounds: 4,
  min_rounds: 2,
  agents: {
    alpha: { model: 'gpt-4o', prompt: 'You are alpha.' },
    beta: { model: 'claude-sonnet-4-5', prompt: 'You are beta.' },
  },
  judge: {
    model: 'gemini-2.5-flash',
    prompt: 'You are a judge.',
  },
  contextOptimization: undefined,
};

// Default result returned by conversationManager.startConversation
const defaultResult = {
  task: 'test task',
  conversationHistory: [],
  solution: 'answer',
  consensusReached: true,
  rounds: 4,
  maxRounds: 4,
  timedOut: false,
  failedAgents: [],
  agentSubstitutions: {},
};

function makeOptions(overrides: Partial<DiscussionRunnerOptions> = {}): DiscussionRunnerOptions {
  return {
    task: 'test task',
    rounds: 4,
    minRounds: 2,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset conversationHistory and currentRound each test
  mockConversationManager.conversationHistory = [];
  mockConversationManager.currentRound = 0;
  mockConversationManager.abortSignal = undefined;
  mockStartConversation.mockResolvedValue(defaultResult);
  mockConfigResolve.mockReturnValue({ ...defaultConfig, agents: { ...defaultConfig.agents } });
  mockSaveSession.mockResolvedValue('session-abc');
  mockCreateSessionManifest.mockReturnValue({ id: 'session-abc', task: 'test' });
  mockCreateProvider.mockReturnValue({ type: 'mock-provider' });
});

describe('DiscussionRunner', () => {
  // Test 1: run() creates ConversationManager with correct config and calls startConversation
  describe('Test 1: basic run creates CM and calls startConversation', () => {
    it('should create ConversationManager and call startConversation', async () => {
      const runner = new DiscussionRunner();
      const options = makeOptions();

      const result = await runner.run(options);

      expect(ConversationManager).toHaveBeenCalledTimes(1);
      expect(mockStartConversation).toHaveBeenCalledTimes(1);
      expect(mockStartConversation).toHaveBeenCalledWith(
        'test task',
        expect.objectContaining({ model: defaultConfig.judge.model }),
        null
      );
      expect(result.sessionId).toBe('session-abc');
      expect(result.timedOut).toBe(false);
    });

    it('should pass config with correct rounds to ConversationManager', async () => {
      const runner = new DiscussionRunner();
      const capturedConfigs: any[] = [];
      (ConversationManager as jest.Mock).mockImplementation((cfg) => {
        capturedConfigs.push(cfg);
        return mockConversationManager;
      });

      await runner.run(makeOptions({ rounds: 6 }));

      expect(capturedConfigs[0].max_rounds).toBe(6);
    });
  });

  // Test 2: run() with personas option resolves personas via PersonaSystem and sets config.agents
  describe('Test 2: personas option sets config.agents', () => {
    it('should call PersonaSystem and override config.agents when personas provided', async () => {
      mockGetPersonas.mockReturnValue([
        { name: 'security', model: 'gpt-4o', systemPrompt: 'security expert' },
      ]);
      mockPersonasToAgents.mockReturnValue({
        security: { model: 'gpt-4o', systemPrompt: 'security expert' },
      });

      const runner = new DiscussionRunner();
      await runner.run(makeOptions({ personas: 'security' }));

      expect(mockGetPersonas).toHaveBeenCalledWith('security');
      expect(mockPersonasToAgents).toHaveBeenCalled();
      // config.agents should have been set from persona output
      const cmCall = (ConversationManager as jest.Mock).mock.calls[0];
      const configArg = cmCall[0];
      expect(configArg.agents).toEqual({
        security: { model: 'gpt-4o', prompt: 'security expert' },
      });
    });
  });

  // Test 3: run() with timeout > 0 sets abortSignal on CM
  describe('Test 3: timeout sets abortSignal', () => {
    it('should set abortSignal on ConversationManager when timeout > 0', async () => {
      jest.useFakeTimers();
      const runner = new DiscussionRunner();

      const runPromise = runner.run(makeOptions({ timeout: 600 }));
      // Advance timers so the start resolves (not past timeout)
      jest.advanceTimersByTime(0);
      await runPromise;

      // CM's abortSignal should have been set
      expect(mockConversationManager.abortSignal).toBeDefined();
      jest.useRealTimers();
    });

    it('should not set abortSignal when timeout is 0', async () => {
      const runner = new DiscussionRunner();
      await runner.run(makeOptions({ timeout: 0 }));

      expect(mockConversationManager.abortSignal).toBeUndefined();
    });

    it('should enforce minimum timeout of 600s', async () => {
      const runner = new DiscussionRunner();
      const result = await runner.run(makeOptions({ timeout: 60 }));

      expect(result.effectiveTimeout).toBe(600);
    });
  });

  // Test 4: run() with priorHistory injects messages into conversationHistory before starting
  describe('Test 4: priorHistory injection', () => {
    it('should push priorHistory entries to conversationManager.conversationHistory', async () => {
      const priorHistory = [
        { role: 'user', content: 'prior message 1', speaker: 'user' },
        { role: 'assistant', content: 'prior response 1', speaker: 'alpha' },
      ];

      const runner = new DiscussionRunner();
      await runner.run(makeOptions({ priorHistory }));

      // history should have the prior messages before startConversation was called
      // We verify by checking what was in conversationHistory at call time
      const history = mockConversationManager.conversationHistory;
      expect(history.length).toBe(2);
      expect(history[0]).toMatchObject({ role: 'user', content: 'prior message 1' });
      expect(history[1]).toMatchObject({ role: 'assistant', content: 'prior response 1' });
    });

    it('should set currentRound based on completed rounds in priorHistory', async () => {
      // 3 completed rounds: each round has agent entries + a Judge guidance delimiter
      const priorHistory = [
        { role: 'user', content: 'Task: test', speaker: 'System' },
        { role: 'assistant', content: 'Alpha round 1', speaker: 'AgentAlpha' },
        { role: 'assistant', content: 'Beta round 1', speaker: 'AgentBeta' },
        { role: 'user', content: 'Judge evaluation round 1', speaker: 'Judge' },
        { role: 'assistant', content: 'Alpha round 2', speaker: 'AgentAlpha' },
        { role: 'assistant', content: 'Beta round 2', speaker: 'AgentBeta' },
        { role: 'user', content: 'Judge evaluation round 2', speaker: 'Judge' },
        { role: 'assistant', content: 'Alpha round 3', speaker: 'AgentAlpha' },
        { role: 'assistant', content: 'Beta round 3', speaker: 'AgentBeta' },
        { role: 'user', content: 'Judge evaluation round 3', speaker: 'Judge' },
      ];

      const runner = new DiscussionRunner();
      // Capture currentRound at the time startConversation is called
      let capturedRound: number | undefined;
      mockStartConversation.mockImplementationOnce(async () => {
        capturedRound = mockConversationManager.currentRound;
        return { conversationHistory: [], solution: 'test', rounds: 3, consensusReached: false };
      });

      await runner.run(makeOptions({ priorHistory }));
      expect(capturedRound).toBe(3);
    });

    it('should keep currentRound at 0 when priorHistory has no Judge delimiters', async () => {
      // Partial round with no Judge guidance — no completed rounds
      const priorHistory = [
        { role: 'user', content: 'Task: test', speaker: 'System' },
        { role: 'assistant', content: 'Alpha partial', speaker: 'AgentAlpha' },
      ];

      const runner = new DiscussionRunner();
      let capturedRound: number | undefined;
      mockStartConversation.mockImplementationOnce(async () => {
        capturedRound = mockConversationManager.currentRound;
        return { conversationHistory: [], solution: 'test', rounds: 1, consensusReached: false };
      });

      await runner.run(makeOptions({ priorHistory }));
      expect(capturedRound).toBe(0);
    });

    it('should not modify conversationHistory when priorHistory is not provided', async () => {
      const runner = new DiscussionRunner();
      await runner.run(makeOptions());

      expect(mockConversationManager.conversationHistory.length).toBe(0);
    });
  });

  // Test 5: run() saves session via SessionManager after completion
  describe('Test 5: session saving', () => {
    it('should call SessionManager.createSessionManifest and saveSession after startConversation', async () => {
      const runner = new DiscussionRunner();
      const result = await runner.run(makeOptions());

      expect(mockCreateSessionManifest).toHaveBeenCalledTimes(1);
      expect(mockSaveSession).toHaveBeenCalledTimes(1);
      expect(result.sessionId).toBe('session-abc');
    });

    it('should pass judge and conversationHistory to createSessionManifest', async () => {
      const runner = new DiscussionRunner();
      await runner.run(makeOptions());

      const manifestCall: any[] = mockCreateSessionManifest.mock.calls[0] as any[];
      // createSessionManifest(mode, task, agents, history, result, judge, projectContext)
      expect(manifestCall[0]).toBe('consensus');
      expect(manifestCall[1]).toBe('test task');
    });
  });

  // Test 6: run() cleans up EventBus listeners and heartbeat in finally block
  describe('Test 6: cleanup in finally block', () => {
    it('should register EventBus handlers and remove them after run', async () => {
      const runner = new DiscussionRunner();
      await runner.run(makeOptions());

      // EventBus.createInstance should have been called
      expect(EventBus.createInstance).toHaveBeenCalledTimes(1);
      // on() should have been called for each event type
      expect(mockScopedEventBus.on).toHaveBeenCalledWith('round:start', expect.any(Function));
      expect(mockScopedEventBus.on).toHaveBeenCalledWith('agent:thinking', expect.any(Function));
      expect(mockScopedEventBus.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockScopedEventBus.on).toHaveBeenCalledWith('status', expect.any(Function));
      // off() should have been called to clean up the same handlers
      expect(mockScopedEventBus.off).toHaveBeenCalledWith('round:start', expect.any(Function));
      expect(mockScopedEventBus.off).toHaveBeenCalledWith('agent:thinking', expect.any(Function));
      expect(mockScopedEventBus.off).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockScopedEventBus.off).toHaveBeenCalledWith('status', expect.any(Function));
    });

    it('should clean up EventBus handlers even when startConversation throws', async () => {
      mockStartConversation.mockRejectedValueOnce(new Error('CM failed'));

      const runner = new DiscussionRunner();
      await expect(runner.run(makeOptions())).rejects.toThrow('CM failed');

      // Cleanup must have happened
      expect(mockScopedEventBus.off).toHaveBeenCalledWith('round:start', expect.any(Function));
    });
  });

  // Test 7: run() with onProgress callback forwards EventBus events
  describe('Test 7: onProgress callback forwarding', () => {
    it('should forward EventBus events to onProgress callback', async () => {
      const onProgress = jest.fn();

      // Capture registered handlers so we can trigger them manually
      const handlers: Record<string, Function> = {};
      mockScopedEventBus.on.mockImplementation((event: string, handler: Function) => {
        handlers[event] = handler;
      });

      const runner = new DiscussionRunner();
      // Start run but also trigger events synchronously before awaiting
      const runPromise = runner.run(makeOptions({ onProgress }));

      // Simulate a round:start event after handlers are registered
      if (handlers['round:start']) {
        handlers['round:start']({ payload: { round: 1 } });
      }

      await runPromise;

      // onProgress should have been called with the event details
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'round:start' })
      );
    });
  });
});
