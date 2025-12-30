import ConsultOrchestrator from '../ConsultOrchestrator';
import ProviderFactory from '../../providers/ProviderFactory';
import { EventBus } from '../../core/EventBus';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory');
jest.mock('../../core/EventBus');
jest.mock('../../consult/health/InteractivePulse');
jest.mock('../../consult/health/ProviderHealthMonitor');

describe('ConsultOrchestrator Round 4: Verdict', () => {
  let orchestrator: ConsultOrchestrator;
  let mockProvider: any;
  let mockEventBus: any;

  // --- Response Templates ---
  const r1Response = {
    text: JSON.stringify({
      position: "P", key_points: ["K"], rationale: "R", confidence: 0.9, prose_excerpt: "E"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r2Response = {
    text: JSON.stringify({
      consensus_points: [{ point: "C", supporting_agents: ["A1"], confidence: 0.9 }],
      tensions: [{ topic: "T", viewpoints: [{ agent: "A1", viewpoint: "V" }, { agent: "A2", viewpoint: "V" }] }],
      priority_order: ["T"]
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r3AgentResponse = {
    text: JSON.stringify({
      critique: "Cr", challenges: [], defense: "D", revised_position: "RP"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r3JudgeResponse = {
    text: JSON.stringify({
      challenges: [], rebuttals: [], unresolved: []
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const r4VerdictResponse = {
    text: JSON.stringify({
      recommendation: "Final Recommendation",
      confidence: 0.95,
      evidence: ["E1", "E2"],
      dissent: []
    }),
    usage: { input_tokens: 100, output_tokens: 100 }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventBus = {
      emitEvent: jest.fn(),
      on: jest.fn(),
      getInstance: jest.fn().mockReturnThis()
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    mockProvider = {
      chat: jest.fn()
    };
    (ProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

    orchestrator = new ConsultOrchestrator();
  });

  it('should execute Round 4 Verdict after Round 3', async () => {
    // Sequence:
    // R1 (3 agents) -> R2 (1 judge) -> R3 (3 agents) -> R3 (1 judge) -> R4 (1 judge)
    
    mockProvider.chat
      .mockResolvedValueOnce(r1Response)
      .mockResolvedValueOnce(r1Response)
      .mockResolvedValueOnce(r1Response)
      .mockResolvedValueOnce(r2Response)
      .mockResolvedValueOnce(r3AgentResponse)
      .mockResolvedValueOnce(r3AgentResponse)
      .mockResolvedValueOnce(r3AgentResponse)
      .mockResolvedValueOnce(r3JudgeResponse)
      .mockResolvedValueOnce(r4VerdictResponse); // Round 4

    const result = await orchestrator.consult("Test Question");

    // Expect 9 calls
    expect(mockProvider.chat).toHaveBeenCalledTimes(9);

    // Verify R4 Artifact
    expect(result.responses.round4).toBeDefined();
    expect(result.responses.round4!.artifactType).toBe('verdict');
    expect(result.responses.round4!.confidence).toBe(0.95);
    expect(result.responses.round4!.recommendation).toBe("Final Recommendation");
    
    // Verify Final Result Mappings
    expect(result.confidence).toBe(0.95);
    expect(result.recommendation).toBe("Final Recommendation");
    expect(result.completedRounds).toBe(4);

    // Verify Events
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:round_artifact', expect.objectContaining({
      round_number: 4,
      artifact_type: 'verdict'
    }));

    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:completed', expect.objectContaining({
      result: expect.objectContaining({
          confidence: 0.95
      })
    }));
  });

  it('should handle Verdict generation failure', async () => {
      // Mock failure at R4
      mockProvider.chat
      .mockResolvedValueOnce(r1Response)
      .mockResolvedValueOnce(r1Response)
      .mockResolvedValueOnce(r1Response)
      .mockResolvedValueOnce(r2Response)
      .mockResolvedValueOnce(r3AgentResponse)
      .mockResolvedValueOnce(r3AgentResponse)
      .mockResolvedValueOnce(r3AgentResponse)
      .mockResolvedValueOnce(r3JudgeResponse)
      .mockRejectedValueOnce(new Error("Verdict Failed"));

      await expect(orchestrator.consult("Test")).rejects.toThrow("Verdict Failed");
  });
});
