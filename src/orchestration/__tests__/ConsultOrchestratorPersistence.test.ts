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
import { PartialResultManager } from '../../consult/persistence/PartialResultManager';
import { ConsultState } from '../../types/consult';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { rimraf } from 'rimraf';

describe('ConsultOrchestrator Persistence Integration', () => {
  let orchestrator: ConsultOrchestrator;
  
  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new ConsultOrchestrator({ verbose: false });
  });

  it('should instantiate PartialResultManager', () => {
    // Verify that partialResultManager is initialized
    expect((orchestrator as any).partialResultManager).toBeDefined();
  });
});
