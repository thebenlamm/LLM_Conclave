import { OutputFormatter } from '../OutputFormatter';
import { ConsultationResult, OutputFormat, ConsultState } from '../../../types/consult';

// Mock formatters
const mockMarkdownFormat = jest.fn();
const mockJsonFormat = jest.fn();

jest.mock('../../formatting/MarkdownFormatter', () => {
  return {
    MarkdownFormatter: jest.fn().mockImplementation(() => {
      return { format: mockMarkdownFormat };
    })
  };
});

jest.mock('../../formatting/JsonLdFormatter', () => {
  return {
    JsonLdFormatter: jest.fn().mockImplementation(() => {
      return { format: mockJsonFormat };
    })
  };
});

describe('OutputFormatter', () => {
  let formatter: OutputFormatter;
  const mockResult: ConsultationResult = {
    consultationId: 'test-id',
    timestamp: '2025-01-01T00:00:00Z',
    question: 'Test question',
    context: 'Test context',
    mode: 'explore',
    agents: [],
    state: ConsultState.Complete,
    rounds: 1,
    completedRounds: 1,
    responses: {},
    consensus: 'Consensus',
    confidence: 0.9,
    recommendation: 'Recommendation',
    reasoning: {},
    concerns: [],
    dissent: [],
    perspectives: [],
    cost: { tokens: { input: 0, output: 0, total: 0 }, usd: 0 },
    durationMs: 1000,
    promptVersions: {
      mode: 'explore',
      independentPromptVersion: '1',
      synthesisPromptVersion: '1',
      crossExamPromptVersion: '1',
      verdictPromptVersion: '1'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    formatter = new OutputFormatter();
    mockMarkdownFormat.mockReturnValue('Markdown Output');
    mockJsonFormat.mockReturnValue('{"json": "output"}');
  });

  describe('formatOutput', () => {
    it('formats as markdown when requested', () => {
      const result = formatter.formatOutput(mockResult, OutputFormat.Markdown);
      expect(result.format).toBe(OutputFormat.Markdown);
      expect(result.content).toBe('Markdown Output');
      expect(mockMarkdownFormat).toHaveBeenCalledWith(mockResult);
      expect(mockJsonFormat).not.toHaveBeenCalled();
    });

    it('formats as json when requested', () => {
      const result = formatter.formatOutput(mockResult, OutputFormat.JSON);
      expect(result.format).toBe(OutputFormat.JSON);
      expect(result.content).toBe('{"json": "output"}');
      expect(mockJsonFormat).toHaveBeenCalledWith(mockResult);
      expect(mockMarkdownFormat).not.toHaveBeenCalled();
    });

    it('formats as both when requested', () => {
      const result = formatter.formatOutput(mockResult, OutputFormat.Both);
      expect(result.format).toBe(OutputFormat.Both);
      expect(result.content).toContain('Markdown Output');
      expect(result.content).toContain('{"json": "output"}');
      expect(result.content).toContain('\n---\n');
      expect(mockMarkdownFormat).toHaveBeenCalledWith(mockResult);
      expect(mockJsonFormat).toHaveBeenCalledWith(mockResult);
    });

    it('defaults to markdown for unknown format', () => {
      const result = formatter.formatOutput(mockResult, 'unknown' as OutputFormat);
      expect(result.format).toBe(OutputFormat.Markdown);
      expect(result.content).toBe('Markdown Output');
    });
  });

  describe('formatMarkdown', () => {
    it('delegates to MarkdownFormatter', () => {
      const output = formatter.formatMarkdown(mockResult);
      expect(output).toBe('Markdown Output');
      expect(mockMarkdownFormat).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('formatJSON', () => {
    it('delegates to JsonLdFormatter', () => {
      const output = formatter.formatJSON(mockResult);
      expect(output).toBe('{"json": "output"}');
      expect(mockJsonFormat).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('formatBoth', () => {
    it('combines outputs with separator', () => {
      const output = formatter.formatBoth(mockResult);
      expect(output).toBe('Markdown Output\n\n---\n\n{"json": "output"}');
    });
  });
});
