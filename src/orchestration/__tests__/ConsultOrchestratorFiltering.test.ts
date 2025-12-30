import ConsultOrchestrator from '../ConsultOrchestrator';
import { ArtifactFilter } from '../../consult/artifacts/ArtifactFilter';
import { FilterConfig } from '../../consult/artifacts/FilterConfig';
import { CostEstimator } from '../../consult/cost/CostEstimator';
import { ProviderHealthMonitor } from '../../consult/health/ProviderHealthMonitor';
import { EventBus } from '../../core/EventBus';

// Mock dependencies that do network calls or complex setup
jest.mock('../../providers/ProviderFactory', () => ({
  createProvider: jest.fn().mockReturnValue({
    chat: jest.fn().mockResolvedValue({
      text: '{}', // Valid JSON text
      usage: { input: 10, output: 10, total: 20 }
    })
  })
}));

jest.mock('../../consult/health/ProviderHealthMonitor');
jest.mock('../../consult/health/HedgedRequestManager', () => {
    return {
        HedgedRequestManager: jest.fn().mockImplementation(() => ({
            executeAgentWithHedging: jest.fn().mockResolvedValue({
                content: '{}',
                tokens: { input: 10, output: 10, total: 20 },
                durationMs: 100,
                model: 'test-model',
                provider: 'test-provider'
            })
        }))
    };
});
jest.mock('../../consult/health/InteractivePulse');
// Mock ConsultationFileLogger
jest.mock('../../consult/logging/ConsultationFileLogger', () => {
  return {
    ConsultationFileLogger: jest.fn().mockImplementation(() => ({
      logConsultation: jest.fn().mockResolvedValue({ jsonPath: 'mock-path.jsonl' })
    }))
  };
});

// Mock ArtifactExtractor to return valid artifacts
jest.mock('../../consult/artifacts/ArtifactExtractor', () => ({
  ArtifactExtractor: {
    extractIndependentArtifact: jest.fn().mockImplementation((_text, agentId) => ({
      artifactType: 'independent',
      schemaVersion: '1.0',
      agentId: agentId || 'test-agent',
      keyPoints: [],
      position: 'pos',
      rationale: 'rat',
      confidence: 1.0,
      createdAt: new Date().toISOString()
    })),
    extractSynthesisArtifact: jest.fn().mockReturnValue({
      artifactType: 'synthesis',
      schemaVersion: '1.0',
      roundNumber: 2,
      consensusPoints: [{ point: 'c1', supportingAgents: ['a1'], confidence: 1.0 }],
      tensions: [{ topic: 't1', viewpoints: [{ agent: 'a1', viewpoint: 'v1' }, { agent: 'a2', viewpoint: 'v2' }] }],
      priorityOrder: [],
      createdAt: new Date().toISOString()
    }),
    extractCrossExamArtifact: jest.fn().mockReturnValue({
      artifactType: 'cross_exam',
      schemaVersion: '1.0',
      roundNumber: 3,
      challenges: [{ challenger: 'c1', targetAgent: 't1', challenge: 'chal', evidence: ['ev'] }],
      rebuttals: [{ agent: 'a1', rebuttal: 'reb' }],
      unresolved: [],
      createdAt: new Date().toISOString()
    }),
    extractVerdictArtifact: jest.fn().mockReturnValue({
      artifactType: 'verdict',
      schemaVersion: '1.0',
      roundNumber: 4,
      recommendation: 'rec',
      confidence: 1.0,
      evidence: [],
      dissent: [],
      createdAt: new Date().toISOString()
    })
  }
}));

describe('ConsultOrchestrator Filtering Integration', () => {
  let orchestrator: ConsultOrchestrator;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should apply filtering in Round 3 and 4 when verbose is false', async () => {
    // Spy on ArtifactFilter methods
    const filterSynthesisSpy = jest.spyOn(ArtifactFilter.prototype, 'filterSynthesisArtifact');
    const filterCrossExamSpy = jest.spyOn(ArtifactFilter.prototype, 'filterCrossExamArtifact');
    
    orchestrator = new ConsultOrchestrator({ verbose: false, maxRounds: 4 });
    
    // We mock consult to run through rounds
    // Since we mocked ProviderFactory and ArtifactExtractor, it should flow through
    await orchestrator.consult('test question');
    
    // Round 3 should call filterSynthesisArtifact (once for agents prompt gen setup)
    expect(filterSynthesisSpy).toHaveBeenCalled();
    
    // Round 4 should call filterSynthesisArtifact AND filterCrossExamArtifact
    // So filterSynthesisArtifact called at least twice (R3 + R4)
    expect(filterSynthesisSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(filterCrossExamSpy).toHaveBeenCalled();
  });

  it('should NOT apply filtering when verbose is true', async () => {
    const filterSynthesisSpy = jest.spyOn(ArtifactFilter.prototype, 'filterSynthesisArtifact');
    const filterCrossExamSpy = jest.spyOn(ArtifactFilter.prototype, 'filterCrossExamArtifact');

    orchestrator = new ConsultOrchestrator({ verbose: true, maxRounds: 4 });

    await orchestrator.consult('test question');

    expect(filterSynthesisSpy).not.toHaveBeenCalled();
    expect(filterCrossExamSpy).not.toHaveBeenCalled();
  });

  it('should display verbose mode message when verbose is true', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    orchestrator = new ConsultOrchestrator({ verbose: true, maxRounds: 4 });
    await orchestrator.consult('test question');

    // Story 2.6, Fix #5: Verify AC #5 message is displayed
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('🔍 Verbose mode: using full debate artifacts (higher token cost)')
    );

    consoleLogSpy.mockRestore();
  });

  it('should include token_efficiency_stats in result', async () => {
    orchestrator = new ConsultOrchestrator({ verbose: false, maxRounds: 4 });
    const result = await orchestrator.consult('test question');

    expect(result.token_efficiency_stats).toBeDefined();
    expect(result.token_efficiency_stats?.filtering_method).toBe('structured_artifact_array_truncation');
    expect(result.token_efficiency_stats?.filtered_rounds).toContain(3);
    expect(result.token_efficiency_stats?.filtered_rounds).toContain(4);

    // Story 2.6, Fix #4: Verify actual savings math
    const stats = result.token_efficiency_stats!;
    expect(stats.tokens_saved_via_filtering).toBeGreaterThanOrEqual(0);
    expect(stats.tokens_used).toBeGreaterThan(0);
    expect(stats.efficiency_percentage).toBeGreaterThanOrEqual(0);
    expect(stats.efficiency_percentage).toBeLessThanOrEqual(100);

    // Efficiency formula validation: (saved / (used + saved)) * 100
    const expectedEfficiency = (stats.tokens_saved_via_filtering / (stats.tokens_used + stats.tokens_saved_via_filtering)) * 100;
    expect(stats.efficiency_percentage).toBeCloseTo(expectedEfficiency, 1);
  });
});
