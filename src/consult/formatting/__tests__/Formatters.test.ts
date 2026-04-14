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

    it('should render Realized Panel with "(all models as configured)" when no substitutions', () => {
      const formatter = new MarkdownFormatter();
      const output = formatter.format(mockResult);

      expect(output).toContain('## Realized Panel');
      expect(output).toContain('- Agent 1: model-1');
      expect(output).toContain('_(all models as configured)_');
      // Panel must come BEFORE other sections
      expect(output.indexOf('## Realized Panel')).toBeLessThan(output.indexOf('## Consensus'));
    });

    it('should render Realized Panel with substitution markers when agents were substituted', () => {
      const resultWithSub: ConsultationResult = {
        ...mockResult,
        agents: [
          { name: 'Agent 1', model: 'gpt-4o', provider: 'openai' },
          { name: 'Agent 2', model: 'claude-sonnet-4-5', provider: 'anthropic' },
        ],
        agentSubstitutions: {
          'Agent 1': { original: 'gpt-4o', fallback: 'claude-sonnet-4-5', reason: 'TPM limit exceeded' },
        },
      };
      const formatter = new MarkdownFormatter();
      const output = formatter.format(resultWithSub);

      expect(output).toContain('## Realized Panel');
      expect(output).toContain('- Agent 1: claude-sonnet-4-5 [substituted from gpt-4o — TPM limit exceeded]');
      expect(output).toContain('- Agent 2: claude-sonnet-4-5');
      expect(output).not.toContain('_(all models as configured)_');
    });

    it('should render degraded-status banner when result.status is completed_degraded', () => {
      const degradedResult = { ...mockResult, status: 'completed_degraded' as const };
      const formatter = new MarkdownFormatter();
      const output = formatter.format(degradedResult);

      expect(output).toContain('**Degraded Results**');
      expect(output).toContain('fallback model');
    });

    it('should NOT render degraded-status banner when status is undefined', () => {
      const formatter = new MarkdownFormatter();
      const output = formatter.format(mockResult); // status is undefined

      expect(output).not.toContain('Degraded Results');
    });

    describe('Phase 13.1-06 Run Integrity', () => {
      it('renders "not triggered" when result has no runIntegrity (nominal)', () => {
        const formatter = new MarkdownFormatter();
        const output = formatter.format(mockResult);

        expect(output).toContain('## Run Integrity');
        expect(output).toContain('- History compression: not triggered');
        // D-18 order: Run Integrity comes after Realized Panel, before Consensus
        expect(output.indexOf('## Realized Panel')).toBeLessThan(output.indexOf('## Run Integrity'));
        expect(output.indexOf('## Run Integrity')).toBeLessThan(output.indexOf('## Consensus'));
      });

      it('renders single-line compression-active format (no fallback)', () => {
        const resultWithCompression = {
          ...mockResult,
          runIntegrity: {
            compression: {
              active: true,
              activatedAtRound: 3,
              tailSize: 6,
              summaryRegenerations: 2,
              summarizerFallback: null,
            },
            participation: [],
          },
        } as any;
        const formatter = new MarkdownFormatter();
        const output = formatter.format(resultWithCompression);

        expect(output).toContain('## Run Integrity');
        expect(output).toContain('active from round 3');
        expect(output).toContain('tail=6');
        expect(output).toContain('2 summary updates');
        expect(output).not.toContain('not triggered');
      });

      it('renders summarizer substitution inline on the same History compression line (single-line D-03)', () => {
        const resultWithFallback = {
          ...mockResult,
          runIntegrity: {
            compression: {
              active: true,
              activatedAtRound: 4,
              tailSize: 8,
              summaryRegenerations: 1,
              summarizerFallback: {
                original: 'gpt-4o',
                substitute: 'claude-sonnet-4-5',
                reason: 'rate limited',
              },
            },
            participation: [],
          },
        } as any;
        const formatter = new MarkdownFormatter();
        const output = formatter.format(resultWithFallback);

        // Find the History compression line and assert substitution lives inline on it
        const compressionLine = output
          .split('\n')
          .find(l => l.includes('History compression:'));
        expect(compressionLine).toBeDefined();
        expect(compressionLine!).toContain('substituted from gpt-4o');
        expect(compressionLine!).toContain('claude-sonnet-4-5');
        // No standalone second line
        expect(output).not.toContain('Summarizer fallback:');
      });

      it('does NOT render ### Participation in consult mode (D-17)', () => {
        const resultWithParticipation = {
          ...mockResult,
          runIntegrity: {
            compression: { active: false, activatedAtRound: null, tailSize: 0, summaryRegenerations: 0, summarizerFallback: null },
            participation: [
              { agent: 'Agent 1', turns: 3, status: 'spoken' },
              { agent: 'Agent 2', turns: 0, status: 'absent-silent' },
            ],
          },
        } as any;
        const formatter = new MarkdownFormatter();
        const output = formatter.format(resultWithParticipation);

        expect(output).toContain('## Run Integrity');
        expect(output).not.toContain('### Participation');
        expect(output).not.toContain('absent-silent');
      });
    });

    it('should display full agent reasoning when available', () => {
      const resultWithFullReasoning = {
        ...mockResult,
        perspectives: [{
          agent: 'Security Expert',
          model: 'claude-sonnet-4-5',
          opinion: 'Use OAuth 2.0 with JWT tokens.',
          keyPoints: ['Industry standard', 'Secure token handling', 'Scalable'],
          rationale: 'OAuth 2.0 is the industry standard for authentication. It provides proven security with JWT for stateless auth.',
          confidence: 0.95
        }]
      };

      const formatter = new MarkdownFormatter();
      const output = formatter.format(resultWithFullReasoning);

      // Should show confidence in header
      expect(output).toContain('### Security Expert (claude-sonnet-4-5) - 95% confident');
      // Should show position
      expect(output).toContain('**Position:** Use OAuth 2.0 with JWT tokens.');
      // Should show key points
      expect(output).toContain('**Key Points:**');
      expect(output).toContain('- Industry standard');
      expect(output).toContain('- Secure token handling');
      expect(output).toContain('- Scalable');
      // Should show full reasoning
      expect(output).toContain('**Reasoning:**');
      expect(output).toContain('OAuth 2.0 is the industry standard for authentication');
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

    it('should include realized_panel array reflecting actual vs configured models', () => {
      const resultWithSub: ConsultationResult = {
        ...mockResult,
        agents: [
          { name: 'Agent 1', model: 'gpt-4o', provider: 'openai' },
          { name: 'Agent 2', model: 'claude-sonnet-4-5', provider: 'anthropic' },
        ],
        agentSubstitutions: {
          'Agent 1': { original: 'gpt-4o', fallback: 'claude-sonnet-4-5', reason: 'TPM limit exceeded' },
        },
      };
      const formatter = new JsonLdFormatter();
      const parsed = JSON.parse(formatter.format(resultWithSub));

      expect(parsed.realized_panel).toHaveLength(2);
      expect(parsed.realized_panel[0]).toEqual({
        agent: 'Agent 1',
        actual_model: 'claude-sonnet-4-5',
        configured_model: 'gpt-4o',
        substituted: true,
        substitution_reason: 'TPM limit exceeded',
      });
      expect(parsed.realized_panel[1]).toMatchObject({
        agent: 'Agent 2',
        actual_model: 'claude-sonnet-4-5',
        configured_model: 'claude-sonnet-4-5',
        substituted: false,
      });
      expect(parsed.agent_substitutions).toEqual({
        'Agent 1': { original: 'gpt-4o', fallback: 'claude-sonnet-4-5', reason: 'TPM limit exceeded' },
      });
    });

    it('should convert perspective fields to snake_case', () => {
      const resultWithFullPerspectives = {
        ...mockResult,
        perspectives: [{
          agent: 'Security Expert',
          model: 'claude-sonnet-4-5',
          opinion: 'Use OAuth 2.0',
          keyPoints: ['Point 1', 'Point 2'],
          rationale: 'Full reasoning here',
          confidence: 0.95
        }]
      };

      const formatter = new JsonLdFormatter();
      const output = formatter.format(resultWithFullPerspectives);
      const parsed = JSON.parse(output);

      // Verify snake_case conversion
      expect(parsed.perspectives[0].key_points).toEqual(['Point 1', 'Point 2']);
      expect(parsed.perspectives[0].rationale).toBe('Full reasoning here');
      expect(parsed.perspectives[0].confidence).toBe(0.95);
      // Verify camelCase is NOT present
      expect(parsed.perspectives[0].keyPoints).toBeUndefined();
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
