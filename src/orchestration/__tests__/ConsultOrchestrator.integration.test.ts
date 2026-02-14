import ConsultOrchestrator from '../ConsultOrchestrator';
import ProviderFactory from '../../providers/ProviderFactory';

// Mock all external dependencies
jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: {
    createProvider: jest.fn(),
  },
}));

const mockEventBusInstance = {
  on: jest.fn(),
  off: jest.fn(),
  emitEvent: jest.fn(),
  removeAllListeners: jest.fn(),
};
jest.mock('../../core/EventBus', () => ({
  EventBus: {
    getInstance: jest.fn(() => mockEventBusInstance),
    createInstance: jest.fn(() => mockEventBusInstance),
  },
}));

jest.mock('../../consult/health/InteractivePulse', () => ({
  InteractivePulse: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    onPulse: jest.fn(),
    startTimer: jest.fn(),
    cancelTimer: jest.fn(),
    getRunningAgents: jest.fn().mockReturnValue([]),
    promptUserToContinue: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../../consult/health/ProviderHealthMonitor', () => ({
  ProviderHealthMonitor: jest.fn().mockImplementation(() => ({
    getProviderHealth: jest.fn().mockReturnValue({ healthy: true }),
    isHealthy: jest.fn().mockReturnValue(true),
    hasHealthyProviders: jest.fn().mockReturnValue(true),
    hasCompletedFirstCheck: jest.fn().mockReturnValue(false),
    getAllHealthStatus: jest.fn().mockReturnValue({}),
    registerProvider: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
  })),
}));

jest.mock('../../consult/context/BrownfieldDetector', () => ({
  BrownfieldDetector: jest.fn().mockImplementation(() => ({
    detect: jest.fn().mockResolvedValue(null),
    detectBrownfield: jest.fn().mockResolvedValue(null),
  })),
}));

// Mock HedgedRequestManager to bypass hedging complexity
jest.mock('../../consult/health/HedgedRequestManager', () => ({
  HedgedRequestManager: jest.fn().mockImplementation(() => ({
    executeAgentWithHedging: jest.fn().mockImplementation(
      async (agent: any, messages: any[], _healthMonitor: any, systemPrompt?: string) => {
        // Call the agent's provider directly
        const response = await agent.providerInstance.chat(messages, systemPrompt);
        return {
          agentId: agent.name,
          agentName: agent.name,
          model: agent.model,
          provider: agent.provider,
          content: response.text || '',
          tokens: response.usage || { input: 100, output: 200, total: 300 },
          durationMs: 50,
          timestamp: new Date().toISOString(),
        };
      }
    ),
  })),
}));

// Suppress console output during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  (console.log as any).mockRestore();
  (console.error as any).mockRestore();
  (console.warn as any).mockRestore();
});

// Helper to create mock providers with sequenced responses
function createMockProvider(responses: Array<{ text: string; usage?: any }>) {
  let callIndex = 0;
  return {
    chat: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      return Promise.resolve({
        text: response.text,
        usage: response.usage || { input_tokens: 100, output_tokens: 200 },
      });
    }),
    getProviderName: jest.fn().mockReturnValue('MockProvider'),
    healthCheck: jest.fn().mockResolvedValue(true),
  };
}

// Standard response templates
const ROUND1_AGENT_RESPONSE = JSON.stringify({
  position: 'Test position',
  key_points: ['Point 1'],
  rationale: 'Test rationale',
  confidence: 0.85,
  prose_excerpt: 'Analysis text',
});

const ROUND2_JUDGE_SYNTHESIS = JSON.stringify({
  consensus_points: [
    { point: 'Agreement', supporting_agents: ['Security Expert', 'Architect'], confidence: 0.9 },
  ],
  tensions: [
    { topic: 'Scale', viewpoints: [{ agent: 'Security Expert', viewpoint: 'V1' }, { agent: 'Architect', viewpoint: 'V2' }] },
  ],
  priority_order: ['Scale'],
});

const ROUND3_AGENT_RESPONSE = JSON.stringify({
  critique: 'Fair point',
  challenges: ['Edge case'],
  defense: 'Still valid because...',
  revised_position: 'Updated position',
});

const ROUND3_JUDGE_SYNTHESIS = JSON.stringify({
  challenges: [],
  rebuttals: [],
  unresolved: [],
});

const ROUND4_VERDICT = JSON.stringify({
  _analysis: 'Thorough analysis...',
  recommendation: 'Use approach X',
  confidence: 0.92,
  evidence: ['Evidence point 1', 'Evidence point 2'],
  dissent: [
    { agent: 'Pragmatist', concern: 'Minor concern about scale', severity: 'low' },
  ],
  key_decisions: ['Decision 1'],
  action_items: ['Action 1'],
  implementation_priority: 'HIGH',
});

describe('ConsultOrchestrator Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ConsultOrchestrator creates providers in this order:
  // 1. claude-sonnet-4-5 (Security Expert)
  // 2. gpt-4o (Architect)
  // 3. gemini-2.5-pro (Pragmatist)
  // Then for each round's judge: gpt-4o
  function setupProviders(opts?: {
    failingIndex?: number;
    emptyIndex?: number;
  }) {
    const agentProvider = createMockProvider([
      { text: ROUND1_AGENT_RESPONSE },
      { text: ROUND3_AGENT_RESPONSE },
    ]);

    const judgeProvider = createMockProvider([
      { text: ROUND2_JUDGE_SYNTHESIS },
      { text: ROUND3_JUDGE_SYNTHESIS },
      { text: ROUND4_VERDICT },
    ]);

    let callCount = 0;
    (ProviderFactory.createProvider as jest.Mock).mockImplementation(() => {
      const idx = callCount++;
      // First 3 calls are agents, subsequent are judges
      if (idx < 3) {
        if (opts?.failingIndex === idx) {
          const failProvider = createMockProvider([]);
          failProvider.chat.mockRejectedValue(new Error('Provider failure'));
          return failProvider;
        }
        if (opts?.emptyIndex === idx) {
          return createMockProvider([
            { text: '', usage: { input_tokens: 10, output_tokens: 0 } },
            { text: '', usage: { input_tokens: 10, output_tokens: 0 } },
          ]);
        }
        return agentProvider;
      }
      return judgeProvider;
    });

    return { agentProvider, judgeProvider };
  }

  describe('Full 4-round consultation end-to-end', () => {
    it('should complete all 4 rounds with proper provider interactions', async () => {
      setupProviders();

      const orchestrator = new ConsultOrchestrator({ verbose: false });
      const result = await orchestrator.consult('What is the best approach for authentication?');

      expect(ProviderFactory.createProvider).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.recommendation).toBe('Use approach X');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('Circuit breaker resilience', () => {
    it('should continue when one agent throws an error', async () => {
      setupProviders({ failingIndex: 0 });

      const orchestrator = new ConsultOrchestrator({ verbose: false });
      const result = await orchestrator.consult('Test question');

      expect(result).toBeDefined();
      expect(result.recommendation).toBe('Use approach X');
    });
  });

  describe('Empty response handling', () => {
    it('should handle empty agent response gracefully', async () => {
      setupProviders({ emptyIndex: 0 });

      const orchestrator = new ConsultOrchestrator({ verbose: false });
      const result = await orchestrator.consult('Test question');

      expect(result).toBeDefined();
    });
  });

  describe('Quick mode behavior', () => {
    it('should run fewer rounds when maxRounds is 1', async () => {
      setupProviders();

      const orchestrator = new ConsultOrchestrator({ maxRounds: 1, verbose: false });
      const result = await orchestrator.consult('Quick question');

      expect(result).toBeDefined();
    });
  });

  describe('Complete failure handling', () => {
    it('should throw when all agents fail', async () => {
      (ProviderFactory.createProvider as jest.Mock).mockImplementation(() => {
        const p = createMockProvider([]);
        p.chat.mockRejectedValue(new Error('Total failure'));
        return p;
      });

      const orchestrator = new ConsultOrchestrator({ verbose: false });

      await expect(orchestrator.consult('Test question')).rejects.toThrow();
    });
  });

  describe('Context propagation', () => {
    it('should pass context to agent provider calls', async () => {
      const { agentProvider } = setupProviders();

      const orchestrator = new ConsultOrchestrator({ verbose: false });
      const contextContent = 'Some file context here';

      await orchestrator.consult('Test question', contextContent);

      const agentChatCalls = agentProvider.chat.mock.calls;
      expect(agentChatCalls.length).toBeGreaterThan(0);

      // Check that at least one call includes the context in messages or system prompt
      const hasContext = agentChatCalls.some((call: any) => {
        const messages = call[0];
        const systemPrompt = call[1] || '';
        if (typeof systemPrompt === 'string' && systemPrompt.includes(contextContent)) return true;
        if (!Array.isArray(messages)) return false;
        return messages.some(
          (msg: any) =>
            typeof msg.content === 'string' && msg.content.includes(contextContent)
        );
      });

      expect(hasContext).toBe(true);
    });
  });

  describe('Result completeness', () => {
    it('should return well-structured ConsultationResult', async () => {
      setupProviders();

      const orchestrator = new ConsultOrchestrator({ verbose: false });
      const result = await orchestrator.consult('Test question');

      expect(result.consultationId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.question).toBe('Test question');
      expect(result.agents).toHaveLength(3);
      expect(result.state).toBeDefined();
      expect(result.rounds).toBe(4);
      expect(result.cost).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });
});
