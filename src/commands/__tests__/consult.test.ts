import { createConsultCommand } from '../consult';
import ConsultOrchestrator from '../../orchestration/ConsultOrchestrator';
import { EventBus } from '../../core/EventBus';
import { ConsultConsoleLogger } from '../../cli/ConsultConsoleLogger';
import { ArtifactTransformer } from '../../consult/artifacts/ArtifactTransformer';
import ConsultLogger from '../../utils/ConsultLogger';
import { ContextLoader } from '../../consult/context/ContextLoader';
import { SensitiveDataScrubber } from '../../consult/security/SensitiveDataScrubber';
import { Command } from 'commander';
import { ConsultationResult } from '../../types/consult';
import * as os from 'os';

// Mock dependencies
jest.mock('../../orchestration/ConsultOrchestrator');
jest.mock('../../core/EventBus');
jest.mock('../../utils/ConsultLogger');
jest.mock('../../utils/ProjectContext');
jest.mock('../../cli/ConsultConsoleLogger');
jest.mock('../../consult/artifacts/ArtifactTransformer');
jest.mock('../../consult/context/ContextLoader');
jest.mock('../../consult/security/SensitiveDataScrubber');

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

    // Setup Mock ContextLoader
    const mockContextLoaderInstance = {
      loadFileContext: jest.fn().mockResolvedValue({
        sources: [],
        formattedContent: '',
        totalTokens: 0,
        fileCount: 0,
        projectIncluded: false
      }),
      loadProjectContext: jest.fn().mockResolvedValue({
        sources: [],
        formattedContent: '',
        totalTokens: 0,
        fileCount: 0,
        projectIncluded: true
      }),
      combineContexts: jest.fn().mockReturnValue({
        sources: [],
        formattedContent: '',
        totalTokens: 0,
        fileCount: 0,
        projectIncluded: false
      }),
      checkSizeWarning: jest.fn().mockResolvedValue(true)
    };
    (ContextLoader as jest.Mock).mockImplementation(() => mockContextLoaderInstance);

    // Setup Mock SensitiveDataScrubber
    const mockScrubberInstance = {
      scrub: jest.fn().mockReturnValue({
        content: '',
        report: {
          sensitiveDataScrubbed: false,
          patternsMatched: 0,
          typesDetected: [],
          detailsByType: {}
        }
      }),
      formatReport: jest.fn().mockReturnValue('')
    };
    (SensitiveDataScrubber as jest.Mock).mockImplementation(() => mockScrubberInstance);
  });

  it('should instantiate ConsultOrchestrator and call consult', async () => {
    const cmd = createConsultCommand();
    
    // We need to suppress console.log for clean test output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Parse/Run command
    await cmd.parseAsync(['node', 'test', 'consult', 'test question']);

    expect(ConsultOrchestrator).toHaveBeenCalled();
    expect(mockOrchestratorInstance.consult).toHaveBeenCalledWith(
      expect.stringContaining('test question'),
      expect.any(String),
      { scrubbingReport: undefined }
    );
    
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

  it('should pass project options and greenfield flag to orchestrator', async () => {
    const cmd = createConsultCommand();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync([
      'node',
      'test',
      'consult',
      'test question',
      '--project',
      os.tmpdir(),
      '--greenfield'
    ]);

    expect(ConsultOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: os.tmpdir(),
        greenfield: true
      })
    );

    consoleSpy.mockRestore();
  });
});
