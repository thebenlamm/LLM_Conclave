import { createConsultCommand } from '../consult';
import ConsultOrchestrator from '../../orchestration/ConsultOrchestrator';
import { EventBus } from '../../core/EventBus';
import { ConsultConsoleLogger } from '../../cli/ConsultConsoleLogger';
import { ArtifactTransformer } from '../../consult/artifacts/ArtifactTransformer';
import ConsultLogger from '../../utils/ConsultLogger';
import { Command } from 'commander';
import { ConsultationResult } from '../../types/consult';

// Mock dependencies
jest.mock('../../orchestration/ConsultOrchestrator');
jest.mock('../../core/EventBus');
jest.mock('../../utils/ConsultLogger');
jest.mock('../../utils/ProjectContext');
jest.mock('../../cli/ConsultConsoleLogger');
jest.mock('../../consult/artifacts/ArtifactTransformer');

describe('consult command', () => {
  let mockOrchestratorInstance: any;
  let mockEventBus: any;
  let mockConsoleLoggerInstance: any;
  let mockConsultLoggerInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Mock EventBus
    mockEventBus = {
      emitEvent: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      getInstance: jest.fn().mockReturnThis()
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup Mock Orchestrator
    mockOrchestratorInstance = {
      consult: jest.fn().mockResolvedValue({
        consultationId: 'test-id',
        question: 'test question',
        state: 'complete',
        cost: { usd: 0.1, tokens: { total: 100 } },
        durationMs: 1000,
        consensus: 'Test Consensus',
        recommendation: 'Test Recommendation',
        perspectives: [],
        concerns: [],
        dissent: []
      })
    };
    (ConsultOrchestrator as jest.Mock).mockImplementation(() => mockOrchestratorInstance);

    // Setup Mock Console Logger
    mockConsoleLoggerInstance = {
      start: jest.fn(),
      stop: jest.fn()
    };
    (ConsultConsoleLogger as jest.Mock).mockImplementation(() => mockConsoleLoggerInstance);

    // Setup Mock ConsultLogger
    mockConsultLoggerInstance = {
      log: jest.fn().mockResolvedValue({
        jsonPath: '/tmp/test.json',
        markdownPath: '/tmp/test.md',
        indexPath: '/tmp/index.json'
      })
    };
    (ConsultLogger as jest.Mock).mockImplementation(() => mockConsultLoggerInstance);

    // Setup Mock ArtifactTransformer
    (ArtifactTransformer.consultationResultToJSON as jest.Mock).mockReturnValue({
      consultation_id: 'test-id',
      // ... minimal fields for logger
      question: 'test question',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      consensus: 'Test Consensus',
      recommendation: 'Test Recommendation',
      perspectives: [],
      concerns: [],
      dissent: [],
      cost: { usd: 0.1, tokens: { total: 100 } },
      duration_ms: 1000
    });
  });

  it('should instantiate ConsultOrchestrator and call consult', async () => {
    const cmd = createConsultCommand();
    
    // We need to suppress console.log for clean test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Parse/Run command
    await cmd.parseAsync(['node', 'test', 'consult', 'test question']);

    expect(ConsultOrchestrator).toHaveBeenCalled();
    expect(mockOrchestratorInstance.consult).toHaveBeenCalledWith(expect.stringContaining('test question'), expect.any(String));
    
    consoleSpy.mockRestore();
  });

  it('should start ConsultConsoleLogger for real-time events', async () => {
    const cmd = createConsultCommand();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', 'test question']);

    expect(ConsultConsoleLogger).toHaveBeenCalled();
    expect(mockConsoleLoggerInstance.start).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
  
  it('should call ConsultLogger with the result', async () => {
    const cmd = createConsultCommand();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', 'test question']);

    expect(mockConsultLoggerInstance.log).toHaveBeenCalledWith(expect.any(Object));
    
    consoleSpy.mockRestore();
  });
});
