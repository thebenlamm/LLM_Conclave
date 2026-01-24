// Mock dependencies BEFORE imports
jest.mock('../../providers/ProviderFactory', () => {
  const mockProvider = {
    chat: jest.fn().mockResolvedValue({ text: '{}', usage: {} })
  };
  return {
    __esModule: true,
    default: {
      createProvider: jest.fn().mockReturnValue(mockProvider)
    }
  };
});
jest.mock('../../consult/health/ProviderHealthMonitor');
jest.mock('../../core/EventBus', () => ({
  EventBus: {
    getInstance: jest.fn().mockReturnValue({
      on: jest.fn(),
      emitEvent: jest.fn()
    })
  }
}));
jest.mock('../../consult/cost/CostEstimator');
jest.mock('../../consult/artifacts/ArtifactFilter');
jest.mock('../../consult/cost/CostGate');
jest.mock('../../consult/logging/ConsultationFileLogger');
jest.mock('../../consult/health/HedgedRequestManager');
jest.mock('../../consult/health/InteractivePulse');
jest.mock('../../consult/persistence/PartialResultManager');
jest.mock('../../consult/termination/EarlyTerminationManager');
jest.mock('../../consult/analysis/DebateValueAnalyzer');

import ConsultOrchestrator from '../ConsultOrchestrator';
import { ConsultOrchestratorOptions } from '../../types/consult';
import { EarlyTerminationManager } from '../../consult/termination/EarlyTerminationManager';
import { CostEstimator } from '../../consult/cost/CostEstimator';

describe('ConsultOrchestrator Early Termination Integration', () => {
  let orchestrator: ConsultOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup CostEstimator mock
    (CostEstimator as unknown as jest.Mock).mockImplementation(() => ({
      estimateCost: jest.fn().mockReturnValue({
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
        estimatedCostUsd: 0.10
      }),
      calculateEarlyTerminationSavings: jest.fn().mockReturnValue(0.05),
      calculateEfficiencyPercentage: jest.fn().mockReturnValue(10)
    }));
  });

  it('should accept confidenceThreshold in options', () => {
    const options: ConsultOrchestratorOptions = {
        confidenceThreshold: 0.85
    };
    orchestrator = new ConsultOrchestrator(options);
    
    expect((orchestrator as any).confidenceThreshold).toBe(0.85);
  });

  it('should use default confidenceThreshold of 0.90 if not provided', () => {
    const orchestrator = new ConsultOrchestrator({});
    expect((orchestrator as any).confidenceThreshold).toBe(0.90);
  });

  it('should initialize EarlyTerminationManager', async () => {
    const orchestrator = new ConsultOrchestrator({});
    expect(EarlyTerminationManager).toHaveBeenCalled();
  });
});