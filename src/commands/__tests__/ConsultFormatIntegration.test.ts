import { createConsultCommand } from '../consult';
import ConsultOrchestrator from '../../orchestration/ConsultOrchestrator';
import { FormatterFactory } from '../../consult/formatting/FormatterFactory';
import ConsultLogger from '../../utils/ConsultLogger';

// Mock dependencies
jest.mock('../../orchestration/ConsultOrchestrator');
jest.mock('../../core/EventBus');
jest.mock('../../utils/ConsultLogger');
jest.mock('../../utils/ProjectContext');
jest.mock('../../cli/ConsultConsoleLogger');
jest.mock('../../consult/artifacts/ArtifactTransformer');
jest.mock('../../consult/formatting/FormatterFactory');

describe('consult command formatting integration', () => {
  let mockOrchestratorInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

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
        dissent: [],
        timestamp: new Date().toISOString()
      })
    };
    (ConsultOrchestrator as jest.Mock).mockImplementation(() => mockOrchestratorInstance);

    // Setup Mock ConsultLogger
    const mockConsultLoggerInstance = {
      log: jest.fn().mockResolvedValue({
        jsonPath: '/tmp/test.json',
        markdownPath: '/tmp/test.md',
        indexPath: '/tmp/index.json'
      })
    };
    (ConsultLogger as jest.Mock).mockImplementation(() => mockConsultLoggerInstance);

    // Setup Mock FormatterFactory
    (FormatterFactory.format as jest.Mock).mockReturnValue('Mock Formatted Output');
  });

  it('should call FormatterFactory with default markdown format', async () => {
    const cmd = createConsultCommand();
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', 'test question']);

    expect(FormatterFactory.format).toHaveBeenCalledWith(expect.any(Object), 'markdown');
  });

  it('should call FormatterFactory with specified json format', async () => {
    const cmd = createConsultCommand();
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', '--format', 'json', 'test question']);

    expect(FormatterFactory.format).toHaveBeenCalledWith(expect.any(Object), 'json');
  });

  it('should call FormatterFactory with specified "both" format', async () => {
    const cmd = createConsultCommand();
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await cmd.parseAsync(['node', 'test', 'consult', '--format', 'both', 'test question']);

    expect(FormatterFactory.format).toHaveBeenCalledWith(expect.any(Object), 'both');
  });
});
