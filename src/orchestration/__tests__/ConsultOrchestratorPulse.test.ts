import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import ConsultOrchestrator from '../ConsultOrchestrator';
import { InteractivePulse } from '../../consult/health/InteractivePulse';
import { ConsultState } from '../../types/consult';

// Mock dependencies
jest.mock('../../consult/health/InteractivePulse');
jest.mock('../../providers/ProviderFactory');
jest.mock('../../core/EventBus', () => ({
  EventBus: {
    getInstance: () => ({
      emitEvent: jest.fn(),
      on: jest.fn(),
      subscribe: jest.fn()
    })
  }
}));

describe('ConsultOrchestrator Pulse Integration', () => {
  let orchestrator: ConsultOrchestrator;
  let mockPulse: jest.Mocked<InteractivePulse>;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Setup mock pulse implementation
    mockPulse = new InteractivePulse() as jest.Mocked<InteractivePulse>;
    
    // We need to inject the mock into the orchestrator or mock the constructor
    // Since InteractivePulse is instantiated inside ConsultOrchestrator constructor,
    // we rely on jest.mock to replace the class.
    
    orchestrator = new ConsultOrchestrator({ verbose: false });
  });

  it('should initialize InteractivePulse', () => {
    expect(InteractivePulse).toHaveBeenCalled();
  });
});