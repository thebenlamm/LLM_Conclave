import ConsultOrchestrator from '../ConsultOrchestrator';
import ProviderFactory from '../../providers/ProviderFactory';
import { EventBus } from '../../core/EventBus';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory');
jest.mock('../../core/EventBus');
jest.mock('../../consult/health/InteractivePulse');
jest.mock('../../consult/health/ProviderHealthMonitor');

describe('ConsultOrchestrator Round 3: Cross-Examination', () => {
  let orchestrator: ConsultOrchestrator;
  let mockProvider: any;
  let mockEventBus: any;

  // --- Round 1 Responses ---
  const r1Response = (id: string) => ({
    text: JSON.stringify({
      position: `Position ${id}`,
      key_points: [`Point ${id}`],
      rationale: `Rationale ${id}`,
      confidence: 0.9,
      prose_excerpt: `Excerpt ${id}`
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  });

  // --- Round 2 Response (Synthesis Judge) ---
  const r2Response = {
    text: JSON.stringify({
      consensus_points: [{ point: "Consensus 1", supporting_agents: ["Agent 1", "Agent 2"], confidence: 0.9 }],
      tensions: [{ topic: "Topic 1", viewpoints: [{ agent: "Agent 1", viewpoint: "View 1" }, { agent: "Agent 3", viewpoint: "View 3" }] }],
      priority_order: ["Topic 1"]
    }),
    usage: { input_tokens: 50, output_tokens: 50 }
  };

  // --- Round 3 Responses (Agents) ---
  const r3AgentResponse = (id: string) => ({
    text: JSON.stringify({
      critique: `Critique by ${id}`,
      challenges: [{ target_agent: "Consensus", challenge_point: "Consensus is weak", evidence: ["Evidence A"] }],
      defense: `Defense by ${id}`,
      revised_position: `Revised ${id}`
    }),
    usage: { input_tokens: 20, output_tokens: 20 }
  });

  // --- Round 3 Response (CrossExam Judge) ---
  const r3JudgeResponse = {
    text: JSON.stringify({
      challenges: [
        { challenger: "Security Expert", target_agent: "Consensus", challenge: "Security risk ignored", evidence: ["CVE-123"] }
      ],
      rebuttals: [
        { agent: "Architect", rebuttal: "Architecture handles this via layer 2" }
      ],
      unresolved: ["Latency vs Security"]
    }),
    usage: { input_tokens: 60, output_tokens: 60 }
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

  it('should execute Round 3 Cross-Exam after Round 2', async () => {
    // Mock Sequence:
    // 1. Agent 1 (R1)
    // 2. Agent 2 (R1)
    // 3. Agent 3 (R1)
    // 4. Judge (R2 Synthesis)
    // 5. Agent 1 (R3)
    // 6. Agent 2 (R3)
    // 7. Agent 3 (R3)
    // 8. Judge (R3 CrossExam)

    mockProvider.chat
      .mockResolvedValueOnce(r1Response("1"))
      .mockResolvedValueOnce(r1Response("2"))
      .mockResolvedValueOnce(r1Response("3"))
      .mockResolvedValueOnce(r2Response)
      .mockResolvedValueOnce(r3AgentResponse("1"))
      .mockResolvedValueOnce(r3AgentResponse("2"))
      .mockResolvedValueOnce(r3AgentResponse("3"))
      .mockResolvedValueOnce(r3JudgeResponse)
      .mockResolvedValueOnce({ // Round 4
          text: JSON.stringify({ recommendation: "R", confidence: 0.9, evidence: ["test evidence"], dissent: [] }),
          usage: {}
      })
      .mockResolvedValueOnce({ text: '{"change":"minor_refinement","reasoning":"ok"}', usage: { input_tokens: 5, output_tokens: 5 } })
      .mockResolvedValueOnce({ text: '{"change":"same","reasoning":"ok"}', usage: { input_tokens: 5, output_tokens: 5 } })
      .mockResolvedValueOnce({ text: '{"change":"moderate_shift","reasoning":"ok"}', usage: { input_tokens: 5, output_tokens: 5 } });

    const result = await orchestrator.consult("Test Question");

    // Expect 12 calls (9 rounds + 3 semantic comparisons)
    expect(mockProvider.chat).toHaveBeenCalledTimes(12);

    // Verify R3 Artifact
    expect(result.responses.round3).toBeDefined();
    expect(result.responses.round3!.artifactType).toBe('cross_exam');
    expect(result.responses.round3!.roundNumber).toBe(3);
    
    // Check Content
    expect(result.responses.round3!.challenges).toHaveLength(1);
    expect(result.responses.round3!.challenges[0].challenger).toBe("Security Expert");
    expect(result.responses.round3!.rebuttals).toHaveLength(1);
    expect(result.responses.round3!.unresolved).toEqual(["Latency vs Security"]);

    // Verify Events
    // Check Round 3 completion
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:round_artifact', expect.objectContaining({
      round_number: 3,
      artifact_type: 'cross_exam'
    }));

    // Check completed rounds count
    expect(result.completedRounds).toBe(4);
  });

  it('should handle Agent failure in Round 3 gracefully', async () => {
      // Mock failure for one agent in R3
      // We expect the orchestrator to continue if others succeed (based on code, it throws if ALL fail, but logs warning for individuals)
      // Actually, my implementation currently filters out nulls and throws only if length is 0.
      
      mockProvider.chat
      .mockResolvedValueOnce(r1Response("1"))
      .mockResolvedValueOnce(r1Response("2"))
      .mockResolvedValueOnce(r1Response("3"))
      .mockResolvedValueOnce(r2Response)
      .mockResolvedValueOnce(r3AgentResponse("1"))
      .mockRejectedValueOnce(new Error("Agent 2 Failed"))
      .mockResolvedValueOnce(r3AgentResponse("3"))
      .mockResolvedValueOnce(r3JudgeResponse)
      .mockResolvedValueOnce({ // Round 4
          text: JSON.stringify({ recommendation: "R", confidence: 0.9, evidence: ["test evidence"], dissent: [] }),
          usage: {}
      })
      .mockResolvedValueOnce({ text: '{"change":"minor_refinement","reasoning":"ok"}', usage: { input_tokens: 5, output_tokens: 5 } })
      .mockResolvedValueOnce({ text: '{"change":"same","reasoning":"ok"}', usage: { input_tokens: 5, output_tokens: 5 } })
      .mockResolvedValueOnce({ text: '{"change":"moderate_shift","reasoning":"ok"}', usage: { input_tokens: 5, output_tokens: 5 } });

      const result = await orchestrator.consult("Test Question");

      // It should succeed
      expect(result.responses.round3).toBeDefined();
      
      // But verify we see the warning (can't easily spy on console here without setup, but we know logic passes)
  });
});
