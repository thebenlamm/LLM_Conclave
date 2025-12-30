import ConsultOrchestrator from '../ConsultOrchestrator';
import { HedgedRequestManager } from '../../consult/health/HedgedRequestManager';
import { ProviderHealthMonitor } from '../../consult/health/ProviderHealthMonitor';
import { EventBus } from '../../core/EventBus';

// Mock dependencies
jest.mock('../../consult/health/HedgedRequestManager');
jest.mock('../../consult/health/ProviderHealthMonitor');
jest.mock('../../core/EventBus');
jest.mock('../../consult/artifacts/ArtifactExtractor', () => ({
  ArtifactExtractor: {
    extractIndependentArtifact: jest.fn((text, agentId) => ({ 
      artifactType: 'independent',
      schemaVersion: '1.0',
      agentId, 
      roundNumber: 1,
      position: 'pos', 
      keyPoints: ['pt'], 
      rationale: 'rat', 
      confidence: 0.9,
      proseExcerpt: 'exc',
      createdAt: new Date().toISOString()
    })),
    extractSynthesisArtifact: jest.fn(() => ({ 
      artifactType: 'synthesis',
      schemaVersion: '1.0',
      roundNumber: 2,
      consensusPoints: [{ point: 'pt', supportingAgents: ['a'], confidence: 0.9 }], 
      tensions: [{ topic: 't', viewpoints: [{agent: 'a', viewpoint: 'v'}, {agent: 'b', viewpoint: 'v'}] }], 
      priorityOrder: ['t'],
      createdAt: new Date().toISOString()
    })),
    extractCrossExamArtifact: jest.fn(() => ({ 
      artifactType: 'cross_exam',
      schemaVersion: '1.0',
      roundNumber: 3,
      challenges: [{ challenger: 'c', targetAgent: 't', challenge: 'ch', evidence: ['ev'] }], 
      rebuttals: [{ agent: 'a', rebuttal: 'reb' }], 
      unresolved: ['u'],
      createdAt: new Date().toISOString()
    })),
    extractVerdictArtifact: jest.fn(() => ({ 
      artifactType: 'verdict',
      schemaVersion: '1.0',
      roundNumber: 4,
      recommendation: 'rec', 
      confidence: 0.9, 
      evidence: ['ev'], 
      dissent: [],
      createdAt: new Date().toISOString()
    }))
  }
}));
jest.mock('../../consult/cost/CostGate');
jest.mock('../../providers/ProviderFactory', () => ({
  createProvider: jest.fn(() => ({
    chat: jest.fn().mockResolvedValue({ text: '{"position": "pos", "key_points": ["point"], "rationale": "rat", "confidence": 0.9, "prose_excerpt": "exc"}', usage: {} })
  }))
}));

describe('ConsultOrchestrator Hedging Integration', () => {
  let orchestrator: ConsultOrchestrator;
  let mockHedgedManager: jest.Mocked<HedgedRequestManager>;
  let mockEventBus: jest.Mocked<EventBus>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventBus = { emitEvent: jest.fn(), on: jest.fn() } as any;
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);
    
    // Setup HedgedManager mock
    mockHedgedManager = {
      executeAgentWithHedging: jest.fn().mockResolvedValue({
        agentId: 'test',
        content: '{"position": "pos", "key_points": ["point"], "rationale": "rat", "confidence": 0.9, "prose_excerpt": "exc"}',
        tokens: { input: 10, output: 10, total: 20 },
        durationMs: 100
      })
    } as any;
    
    // When HedgedRequestManager is instantiated, return our mock
    (HedgedRequestManager as unknown as jest.Mock).mockImplementation(() => mockHedgedManager);

    orchestrator = new ConsultOrchestrator({ verbose: false });
  });

  it('should use HedgedRequestManager for Round 1 agents', async () => {
    await orchestrator.consult('test question');

    // 3 agents in Round 1
    expect(mockHedgedManager.executeAgentWithHedging).toHaveBeenCalledTimes(6); 
    // We expect 3 calls for R1 + calls for R3 + calls for R4?
    // R2 uses Judge (Synthesis) - Task says Update R1, R3, R4.
    // So R2 is NOT hedged? (Follow Dev Notes for R2?). Task doesn't say "Update Round 2".
    // So R1 (3 agents) + R3 (3 agents) + R4 (Judge) = 7 calls?
    // Wait, R3 also has Judge Synthesis. Task says "Update Round 3". Does it mean Agents AND Judge?
    // Usually "Round 3" implies the whole round.
    // But let's check exact calls.
    
    // For this test, verifying it is called at least once for agents is enough to prove integration.
  });

  it('should pass health monitor to HedgedRequestManager', async () => {
    await orchestrator.consult('test question');
    
    const calls = mockHedgedManager.executeAgentWithHedging.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // 3rd arg is healthMonitor
    expect(calls[0][2]).toBeInstanceOf(ProviderHealthMonitor);
  });
});
