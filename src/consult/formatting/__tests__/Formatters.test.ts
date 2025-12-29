import { ConsultationResult, ConsultState, OutputFormat } from '../../../types/consult';
import { MarkdownFormatter } from '../MarkdownFormatter';
import { JsonLdFormatter } from '../JsonLdFormatter';
import { FormatterFactory } from '../FormatterFactory';

describe('Formatters', () => {
  const mockResult: ConsultationResult = {
    consultationId: 'test-123',
    timestamp: '2025-12-29T10:00:00.000Z',
    question: 'Test question?',
    context: '',
    mode: 'converge',
    agents: [{ name: 'Agent 1', model: 'model-1', provider: 'provider-1' }],
    state: ConsultState.Complete,
    rounds: 4,
    completedRounds: 4,
    responses: {},
    consensus: 'Test consensus',
    confidence: 0.85,
    recommendation: 'Test recommendation',
    reasoning: {},
    concerns: ['Concern 1'],
    dissent: [{ agent: 'Agent 1', concern: 'Dissent 1', severity: 'low' }],
    perspectives: [{ agent: 'Agent 1', model: 'model-1', opinion: 'Opinion 1' }],
    cost: {
      tokens: { input: 100, output: 200, total: 300 },
      usd: 0.005
    },
    durationMs: 5000,
    promptVersions: {
      mode: 'converge',
      independentPromptVersion: '1.0',
      synthesisPromptVersion: '1.0',
      crossExamPromptVersion: '1.0',
      verdictPromptVersion: '1.0'
    }
  };

  describe('MarkdownFormatter', () => {
    it('should format a result as Markdown', () => {
      const formatter = new MarkdownFormatter();
      const output = formatter.format(mockResult);
      
      expect(output).toContain('# Consultation Summary');
      expect(output).toContain('**Question:** Test question?');
      expect(output).toContain('**Confidence:** 85%');
      expect(output).toContain('## Consensus');
      expect(output).toContain('Test recommendation');
      expect(output).toContain('### Agent 1 (model-1)');
      expect(output).toContain('Opinion 1');
      expect(output).toContain('Concern 1');
      expect(output).toContain('Dissent 1');
      expect(output).toContain('**Cost:** $0.0050');
      expect(output).toContain('**Duration:** 5.0s');
    });
  });

  describe('JsonLdFormatter', () => {
    it('should format a result as JSON with snake_case', () => {
      const formatter = new JsonLdFormatter();
      const output = formatter.format(mockResult);
      const parsed = JSON.parse(output);
      
      expect(parsed.consultation_id).toBe('test-123');
      expect(parsed.duration_ms).toBe(5000);
      expect(parsed.confidence).toBe(0.85);
      expect(parsed.cost.tokens.total).toBe(300);
      expect(parsed.prompt_versions.independent_prompt_version).toBe('1.0');
    });
  });

  describe('FormatterFactory', () => {
    it('should return appropriate formatter', () => {
      expect(FormatterFactory.getFormatter(OutputFormat.Markdown)).toBeInstanceOf(MarkdownFormatter);
      expect(FormatterFactory.getFormatter(OutputFormat.JSON)).toBeInstanceOf(JsonLdFormatter);
    });

    it('should handle "Both" format', () => {
      const output = FormatterFactory.format(mockResult, OutputFormat.Both);
      expect(output).toContain('# Consultation Summary');
      expect(output).toContain('"consultation_id": "test-123"');
      expect(output).toContain('---');
    });
  });
});
