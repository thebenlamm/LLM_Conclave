import ConsultOrchestrator from '../ConsultOrchestrator';
import ProviderFactory from '../../providers/ProviderFactory';
import { EventBus } from '../../core/EventBus';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory');
jest.mock('../../core/EventBus');
jest.mock('../../consult/health/InteractivePulse');
jest.mock('../../consult/health/ProviderHealthMonitor');

describe('ConsultOrchestrator Story 1.2', () => {
  let orchestrator: ConsultOrchestrator;
  let mockProvider: any;
  let mockEventBus: any;

  // --- Response Templates ---
  const r1Response = {
    text: JSON.stringify({
      position: "Test Position",
      key_points: ["Point 1", "Point 2"],
      rationale: "Test Rationale",
      confidence: 0.9,
      prose_excerpt: "Test Prose"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r2Response = {
    text: JSON.stringify({
      consensus_points: [{ point: "Consensus", supporting_agents: ["A1"], confidence: 0.9 }],
      tensions: [{ topic: "Topic", viewpoints: [{ agent: "A1", viewpoint: "V1" }, { agent: "A2", viewpoint: "V2" }] }],
      priority_order: ["Topic"]
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r3AgentResponse = {
    text: JSON.stringify({
      critique: "C", challenges: [], defense: "D", revised_position: "RP"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r3JudgeResponse = {
    text: JSON.stringify({
      challenges: [], rebuttals: [], unresolved: []
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup Mock EventBus
    mockEventBus = {
      emitEvent: jest.fn(),
      getInstance: jest.fn().mockReturnThis()
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup Mock Provider
    mockProvider = {
      chat: jest.fn()
    };

    (ProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

    orchestrator = new ConsultOrchestrator();
  });

  it('should execute Round 1 Independent Analysis in parallel', async () => {
    // Setup sequence for full flow:
    // R1 (3 agents) -> R2 (1 judge) -> R3 (3 agents) -> R3 (1 judge)
    mockProvider.chat
        .mockResolvedValueOnce(r1Response)
        .mockResolvedValueOnce(r1Response)
        .mockResolvedValueOnce(r1Response)
        .mockResolvedValueOnce(r2Response)
        .mockResolvedValueOnce(r3AgentResponse)
        .mockResolvedValueOnce(r3AgentResponse)
        .mockResolvedValueOnce(r3AgentResponse)
        .mockResolvedValueOnce(r3JudgeResponse)
        .mockResolvedValueOnce({ // Round 4 Verdict
            text: JSON.stringify({
                recommendation: "Rec", confidence: 0.9, evidence: ["test evidence"], dissent: []
            }),
            usage: {}
        });

    const question = "Test Question";
    const result = await orchestrator.consult(question);

    // Verify 9 calls
    expect(mockProvider.chat).toHaveBeenCalledTimes(9);

    // Verify results structure
    expect(result.responses.round1).toHaveLength(3);
    expect(result.responses.round1![0]).toEqual(expect.objectContaining({
      artifactType: 'independent',
      roundNumber: 1,
      position: "Test Position",
      confidence: 0.9
    }));

    // Verify events
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:started', expect.any(Object));
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('agent:thinking', expect.any(Object));
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('agent:completed', expect.any(Object));
  });

  it('should handle agent failures gracefully', async () => {
    // Setup sequence:
    // R1: Agent 1 OK, Agent 2 Fail, Agent 3 OK
    // R2: Judge OK (uses 2 artifacts)
    // R3: Agent 1 OK, Agent 2 (skipped/fail), Agent 3 OK -> Actually R3 calls agents based on successful R1 artifacts.
    // If Agent 2 failed R1, R3 loop iterates over 3 agents but finds only 2 artifacts.
    // Logic: `const r1Artifact = round1Artifacts.find(...)`.
    // If R1 failed, `round1Artifacts` only has 2 items.
    // The R3 loop iterates `this.agents` (3).
    // For Agent 2, `find` returns undefined. Code returns null.
    // So R3 will make 2 calls to provider (Agent 1, Agent 3).
    // Then R3 Judge makes 1 call.
    
    // Total calls expected:
    // R1: 3 calls (1 fail)
    // R2: 1 call
    // R3: 2 calls (Agent 1, Agent 3)
    // R3 Judge: 1 call
    // Total: 7 calls.

    mockProvider.chat
      .mockResolvedValueOnce(r1Response) // A1
      .mockRejectedValueOnce(new Error("API Error")) // A2
      .mockResolvedValueOnce(r1Response) // A3
      .mockResolvedValueOnce(r2Response) // R2 Judge
      .mockResolvedValueOnce(r3AgentResponse) // R3 A1
      .mockResolvedValueOnce(r3AgentResponse) // R3 A3
      .mockResolvedValueOnce(r3JudgeResponse) // R3 Judge
      .mockResolvedValueOnce({ // R4 Judge
        text: JSON.stringify({
            recommendation: "Rec", confidence: 0.9, evidence: ["test evidence"], dissent: []
        }),
        usage: {}
      });

    const result = await orchestrator.consult("Test Question");

    // Verify results
    expect(result.responses.round1).toHaveLength(2);
    
    // R3 should also succeed
    expect(result.responses.round3).toBeDefined();
    
    // Call count
    expect(mockProvider.chat).toHaveBeenCalledTimes(8);
  });

  it('should abort if all agents fail', async () => {
    // R1: All fail
    mockProvider.chat.mockRejectedValue(new Error("All fail"));

    await expect(orchestrator.consult("Test Question")).rejects.toThrow("All agents failed");
  });
});