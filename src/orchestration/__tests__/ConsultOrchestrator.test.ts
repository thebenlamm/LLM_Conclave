import ConsultOrchestrator from '../ConsultOrchestrator';
import ProviderFactory from '../../providers/ProviderFactory';
import { EventBus } from '../../core/EventBus';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory');
jest.mock('../../core/EventBus');

describe('ConsultOrchestrator Story 1.2', () => {
  let orchestrator: ConsultOrchestrator;
  let mockProvider: any;
  let mockEventBus: any;

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
      chat: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          position: "Test Position",
          key_points: ["Point 1", "Point 2"],
          rationale: "Test Rationale",
          confidence: 0.9,
          prose_excerpt: "Test Prose"
        }),
        usage: { input_tokens: 10, output_tokens: 10 }
      })
    };

    (ProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

    orchestrator = new ConsultOrchestrator();
  });

  it('should execute Round 1 Independent Analysis in parallel', async () => {
    const question = "Test Question";
    const result = await orchestrator.consult(question);

    // Verify 3 agents were initialized and called
    expect(ProviderFactory.createProvider).toHaveBeenCalledTimes(3);
    
    // Check if chat was called 3 times (once per agent)
    // Note: It might be called more if Synthesis is also triggered, but for Round 1 it's 3.
    // Our mock logic for ConsultOrchestrator.ts currently has a minimal Synthesis placeholder 
    // which doesn't call an LLM yet (we commented it out/placeholder). 
    // Wait, the synthesis code I wrote:
    // "const synthesis = await this.synthesizeConsensus..." was commented out? 
    // No, I kept the method calls but I didn't verify the synthesis part fully.
    
    // Actually, looking at my code for ConsultOrchestrator.ts:
    // I removed the synthesis call logic inside `consult` and just did:
    // this.stateMachine.transition(ConsultState.Synthesis);
    // this.stateMachine.transition(ConsultState.Complete);
    // So `chat` should be called exactly 3 times for Round 1.
    
    expect(mockProvider.chat).toHaveBeenCalledTimes(3);

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
    // Make one provider fail
    mockProvider.chat
      .mockResolvedValueOnce({ // Agent 1 success
        text: JSON.stringify({
          position: "Pos 1", key_points: ["k1"], rationale: "r1", confidence: 1.0, prose_excerpt: "p1"
        }),
        usage: {}
      })
      .mockRejectedValueOnce(new Error("API Error")) // Agent 2 fail
      .mockResolvedValueOnce({ // Agent 3 success
        text: JSON.stringify({
          position: "Pos 3", key_points: ["k3"], rationale: "r3", confidence: 1.0, prose_excerpt: "p3"
        }),
        usage: {}
      });

    const result = await orchestrator.consult("Test Question");

    // Should still return results for successful agents
    // The current implementation filters out nulls: 
    // const successfulArtifacts = round1Artifacts.filter(a => !!a);
    expect(result.responses.round1).toHaveLength(2);
    
    // Verify Warning log (console.warn) - hard to test without spying on console, 
    // but we can check the result integrity.
  });

  it('should abort if all agents fail', async () => {
    mockProvider.chat.mockRejectedValue(new Error("All fail"));

    await expect(orchestrator.consult("Test Question")).rejects.toThrow("All agents failed");
  });
});
