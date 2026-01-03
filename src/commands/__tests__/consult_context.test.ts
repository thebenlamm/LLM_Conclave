import { createConsultCommand } from '../consult';
import ConsultOrchestrator from '../../orchestration/ConsultOrchestrator';
import { ContextLoader } from '../../consult/context/ContextLoader';
import { ConsultConsoleLogger } from '../../cli/ConsultConsoleLogger';
import ConsultLogger from '../../utils/ConsultLogger';
import { Command } from 'commander';

// Mock dependencies
jest.mock('../../orchestration/ConsultOrchestrator');
jest.mock('../../consult/context/ContextLoader');
jest.mock('../../cli/ConsultConsoleLogger');
jest.mock('../../utils/ConsultLogger');
jest.mock('../../utils/ProjectContext');

describe('consult command - context loading', () => {
  let mockOrchestratorInstance: any;
  let mockContextLoaderInstance: any;
  
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Orchestrator
    mockOrchestratorInstance = {
      consult: jest.fn().mockResolvedValue({
        state: 'complete',
        consensus: 'Result',
        cost: { usd: 0, tokens: { total: 0 } }
      })
    };
    (ConsultOrchestrator as jest.Mock).mockImplementation(() => mockOrchestratorInstance);

    // Mock ContextLoader
    mockContextLoaderInstance = {
      loadFileContext: jest.fn().mockResolvedValue({
        formattedContent: '### File: test.ts\ncontent',
        sources: [],
        totalTokens: 100
      }),
      loadProjectContext: jest.fn().mockResolvedValue({
        formattedContent: '### Project Context\ncontent',
        sources: [],
        totalTokens: 200
      }),
      combineContexts: jest.fn().mockReturnValue({
        formattedContent: 'Combined Content',
        sources: [],
        totalTokens: 300
      }),
      checkSizeWarning: jest.fn().mockResolvedValue(true)
    };
    (ContextLoader as jest.Mock).mockImplementation(() => mockContextLoaderInstance);

    // Mock Loggers
    (ConsultConsoleLogger as jest.Mock).mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn()
    }));
    (ConsultLogger as jest.Mock).mockImplementation(() => ({
      log: jest.fn().mockResolvedValue({})
    }));
  });

  it('uses ContextLoader when --context is provided', async () => {
    const cmd = createConsultCommand();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', 'question', '--context', 'file1.ts,file2.ts']);

    expect(ContextLoader).toHaveBeenCalled();
    expect(mockContextLoaderInstance.loadFileContext).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
    expect(mockContextLoaderInstance.checkSizeWarning).toHaveBeenCalled();
    // Verify orchestrator gets the combined/loaded context string
    expect(mockOrchestratorInstance.consult).toHaveBeenCalledWith(
      expect.any(String),
      'Combined Content',
      expect.objectContaining({
        allowCostOverruns: false,
        scrubbingReport: expect.any(Object)
      })
    );

    consoleSpy.mockRestore();
  });

  it('uses ContextLoader when --project is provided', async () => {
    const cmd = createConsultCommand();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', 'question', '--project', './proj']);

    expect(ContextLoader).toHaveBeenCalled();
    expect(mockContextLoaderInstance.loadProjectContext).toHaveBeenCalledWith('./proj');
    
    consoleSpy.mockRestore();
  });

  it('combines contexts when both are provided', async () => {
    const cmd = createConsultCommand();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', 'question', '--context', 'f.ts', '--project', './p']);

    expect(mockContextLoaderInstance.combineContexts).toHaveBeenCalled();
    expect(mockOrchestratorInstance.consult).toHaveBeenCalledWith(
      expect.any(String),
      'Combined Content',
      expect.objectContaining({
        allowCostOverruns: false,
        scrubbingReport: expect.any(Object)
      })
    );

    consoleSpy.mockRestore();
  });
});
