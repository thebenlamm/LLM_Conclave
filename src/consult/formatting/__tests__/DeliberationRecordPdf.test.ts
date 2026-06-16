/**
 * DeliberationRecordPdf.test.ts
 *
 * Phase 21-02 (Task 3 / TDD RED→GREEN): pdf-parse assertions on the generated PDF.
 * Tests: valid PDF buffer, all 8 heading texts, disclaimer, operator name,
 * PDF metadata (Title/Author/CreationDate), branding, and mitigation parity.
 */

import { ConsultationResult, ConsultState } from '../../../types/consult';
import { OperatorInputs, BrandingInputs } from '../../../types/deliberationRecord';
import { DeliberationRecordBuilder } from '../DeliberationRecordBuilder';
import { DeliberationRecordPdfFormatter } from '../DeliberationRecordPdfFormatter';
import { HEADING_TEXT, DISCLAIMER } from '../deliberationRecordConstants';
import pdf from 'pdf-parse';

// ============================================================================
// Fixtures (mirrored from DeliberationRecord.test.ts L16-51 + L79-83)
// ============================================================================

const consultFixture: ConsultationResult = {
  consultationId: 'test-consult-001',
  timestamp: '2026-01-15T10:00:00.000Z',
  question: 'Should we migrate to microservices?',
  context: 'Monolith with 5-year tech debt, scaling issues.',
  mode: 'converge',
  agents: [
    { name: 'Analyst', model: 'claude-opus-4-5', provider: 'anthropic' },
    { name: 'Skeptic', model: 'gpt-4o', provider: 'openai' },
  ],
  state: ConsultState.Complete,
  rounds: 4,
  completedRounds: 4,
  responses: {},
  consensus: 'Phased migration is recommended.',
  confidence: 0.78,
  recommendation: 'Begin with extract-service pattern on the most isolated domain.',
  reasoning: {},
  concerns: ['Operational complexity increases', 'Distributed tracing needed'],
  dissent: [
    { agent: 'Skeptic', concern: 'Premature optimization risk is high.', severity: 'high' },
  ],
  perspectives: [
    { agent: 'Analyst', model: 'claude-opus-4-5', opinion: 'Microservices enable independent scaling.' },
    { agent: 'Skeptic', model: 'gpt-4o', opinion: 'Monolith is simpler to operate at current scale.' },
  ],
  cost: { tokens: { input: 5000, output: 2000, total: 7000 }, usd: 0.042 },
  durationMs: 32000,
  promptVersions: {
    mode: 'converge',
    independentPromptVersion: '1.0',
    synthesisPromptVersion: '1.0',
    crossExamPromptVersion: '1.0',
    verdictPromptVersion: '1.0',
  },
};

const operatorFixture: OperatorInputs = {
  operatorName: 'Jane Operator',
  panelRationale: 'Cross-provider panel for independent risk views',
  mitigations: {},
};

// ============================================================================
// Tests
// ============================================================================

describe('DeliberationRecordPdfFormatter', () => {
  // Test 1: valid PDF buffer
  it('produces a Buffer with %PDF- magic header', async () => {
    const source = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
    const formatter = new DeliberationRecordPdfFormatter();
    const buf = await formatter.render(source, operatorFixture);

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  // Test 2: all 8 HEADING_TEXT strings + DISCLAIMER + operator name in extracted text
  it('extracted text contains all 8 field headings, the disclaimer, and the operator name', async () => {
    const source = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
    const formatter = new DeliberationRecordPdfFormatter();
    const buf = await formatter.render(source, operatorFixture);
    const parsed = await pdf(buf);

    for (const text of Object.values(HEADING_TEXT)) {
      expect(parsed.text).toContain(text);
    }
    expect(parsed.text).toContain(DISCLAIMER);
    expect(parsed.text).toContain(operatorFixture.operatorName);
  });

  // Test 3: PDF metadata — non-empty Title, Author === operator name, CreationDate present
  it('PDF info has non-empty Title, Author equal to operator name, and a CreationDate', async () => {
    const source = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
    const formatter = new DeliberationRecordPdfFormatter();
    const buf = await formatter.render(source, operatorFixture);
    const parsed = await pdf(buf);

    expect(parsed.info.Title).toBeTruthy();
    expect(parsed.info.Author).toBe(operatorFixture.operatorName);
    // pdfkit auto-adds CreationDate; pdf-parse exposes it in info dict or metadata
    const hasCreationDate =
      parsed.info.CreationDate != null ||
      (parsed.metadata != null && JSON.stringify(parsed.metadata).toLowerCase().includes('creat'));
    expect(hasCreationDate).toBe(true);
  });

  // Test 4: branding companyName renders in PDF; undefined branding still produces valid PDF
  it('branding companyName renders in text; omitting branding still yields a valid PDF', async () => {
    const source = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
    const formatter = new DeliberationRecordPdfFormatter();

    const branding: BrandingInputs = { companyName: 'Acme Health' };
    const buf2 = await formatter.render(source, operatorFixture, branding);
    const parsed2 = await pdf(buf2);
    expect(parsed2.text).toContain('Acme Health');

    // No branding — neutral default, must not throw and must produce a valid PDF
    const bufNoBrand = await formatter.render(source, operatorFixture, undefined);
    expect(bufNoBrand.slice(0, 5).toString()).toBe('%PDF-');
  });

  // Test 5: mitigation parity smoke
  it('supplied mitigation renders; missing mitigation shows placeholder marker', async () => {
    const source = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
    const formatter = new DeliberationRecordPdfFormatter();

    // With mitigation keyed to the exact concern string
    const operatorWithMit: OperatorInputs = {
      ...operatorFixture,
      mitigations: { 'Premature optimization risk is high.': 'Staged rollout with metrics gate.' },
    };
    const bufWithMit = await formatter.render(source, operatorWithMit);
    const parsedWithMit = await pdf(bufWithMit);
    expect(parsedWithMit.text).toContain('Staged rollout with metrics gate.');

    // Without mitigation — placeholder must surface
    const bufNoMit = await formatter.render(source, operatorFixture);
    const parsedNoMit = await pdf(bufNoMit);
    expect(parsedNoMit.text).toContain('operator to complete');
  });
});
