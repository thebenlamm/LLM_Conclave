import ConsultOrchestrator from '../ConsultOrchestrator';
import ProviderFactory from '../../providers/ProviderFactory';
import { EventBus } from '../../core/EventBus';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory');
jest.mock('../../core/EventBus');
jest.mock('../../consult/health/InteractivePulse');
jest.mock('../../consult/health/ProviderHealthMonitor');

describe('ConsultOrchestrator Round 2: Synthesis', () => {
  let orchestrator: ConsultOrchestrator;
  let mockProvider: any;
  let mockEventBus: any;

  const agentResponse1 = {
    text: JSON.stringify({
      position: "Position 1",
      key_points: ["Key Point 1"],
      rationale: "Rationale 1",
      confidence: 0.9,
      prose_excerpt: "Excerpt 1"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const agentResponse2 = {
    text: JSON.stringify({
      position: "Position 2",
      key_points: ["Key Point 2"],
      rationale: "Rationale 2",
      confidence: 0.8,
      prose_excerpt: "Excerpt 2"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const agentResponse3 = {
    text: JSON.stringify({
      position: "Position 3",
      key_points: ["Key Point 3"],
      rationale: "Rationale 3",
      confidence: 0.7,
      prose_excerpt: "Excerpt 3"
    }),
    usage: { input_tokens: 10, output_tokens: 10 }
  };

  const judgeResponse = {
    text: JSON.stringify({
      consensus_points: [
        { point: "Consensus 1", supporting_agents: ["Agent 1", "Agent 2"], confidence: 0.9 }
      ],
      tensions: [
        { topic: "Topic 1", viewpoints: [{ agent: "Agent 1", viewpoint: "View 1" }, { agent: "Agent 3", viewpoint: "View 3" }] }
      ],
      priority_order: ["Topic 1"]
    }),
    usage: { input_tokens: 50, output_tokens: 50 }
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

  it('should execute Round 2 Synthesis after Round 1', async () => {
    // Mock sequence of responses
    mockProvider.chat
      .mockResolvedValueOnce(agentResponse1)
      .mockResolvedValueOnce(agentResponse2)
      .mockResolvedValueOnce(agentResponse3)
      .mockResolvedValueOnce(judgeResponse)
      // Mock Round 3 responses to allow completion (Agent 1, 2, 3, Judge)
      .mockResolvedValueOnce({ text: JSON.stringify({ critique: "", challenges: [], defense: "" }), usage: {} })
      .mockResolvedValueOnce({ text: JSON.stringify({ critique: "", challenges: [], defense: "" }), usage: {} })
      .mockResolvedValueOnce({ text: JSON.stringify({ critique: "", challenges: [], defense: "" }), usage: {} })
      .mockResolvedValueOnce({ text: JSON.stringify({ challenges: [], rebuttals: [], unresolved: [] }), usage: {} })
      .mockResolvedValueOnce({ text: JSON.stringify({ recommendation: "R", confidence: 0.9, evidence: ["test evidence"], dissent: [] }), usage: {} });

    const question = "Test Question";
    const result = await orchestrator.consult(question);

    // Verify 9 calls (3 Agents R1 + 1 Judge R2 + 3 Agents R3 + 1 Judge R3 + 1 Judge R4)
    expect(mockProvider.chat).toHaveBeenCalledTimes(9);

    // Verify Round 2 Artifact
    expect(result.responses.round2).toBeDefined();
    expect(result.responses.round2!.artifactType).toBe('synthesis');
    expect(result.responses.round2!.consensusPoints).toHaveLength(1);
    expect(result.responses.round2!.consensusPoints[0].point).toBe("Consensus 1");
    expect(result.responses.round2!.tensions).toHaveLength(1);
    expect(result.responses.round2!.priorityOrder).toEqual(["Topic 1"]);

    // Verify Events
    // Check for Round 2 completion event
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:round_artifact', expect.objectContaining({
      round_number: 2,
      artifact_type: 'synthesis'
    }));

    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('round:completed', expect.objectContaining({
      round_number: 2,
      artifact_type: 'synthesis'
    }));

    // Verify Judge thinking event
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith('agent:thinking', expect.objectContaining({
      agent_name: 'Judge (Synthesis)',
      round: 2
    }));
  });

  it('should handle Judge failure in Round 2', async () => {
    // Mock sequence: Agents success, Judge fails
    mockProvider.chat
      .mockResolvedValueOnce(agentResponse1)
      .mockResolvedValueOnce(agentResponse2)
      .mockResolvedValueOnce(agentResponse3)
      .mockRejectedValueOnce(new Error("Judge Failed"));

    await expect(orchestrator.consult("Test Question")).rejects.toThrow("Judge Failed");

    // Should have emitted abort event or similar (via state machine transition usually)
    // The implementation throws the error up.
  });
});
