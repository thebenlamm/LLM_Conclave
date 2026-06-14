import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConsultationResult, ConsultState, Dissent } from '../../../types/consult';
import { SessionManifest } from '../../../types/index';
import { OperatorInputs } from '../../../types/deliberationRecord';
import { DeliberationRecordBuilder } from '../DeliberationRecordBuilder';
import { DeliberationRecordFormatter } from '../DeliberationRecordFormatter';
import { renderDeliberationRecordFromSession } from '../exportDeliberationRecord';
import SessionManager from '../../../core/SessionManager';

// ============================================================================
// Fixtures
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

const discussFixture: SessionManifest = {
  id: 'session_2026-01-15T10-00-00_abcd',
  timestamp: '2026-01-15T11:00:00.000Z',
  mode: 'consensus',
  task: 'Should we adopt GraphQL for our API layer?',
  agents: [
    { name: 'TechLead', model: 'claude-opus-4-5', provider: 'anthropic', systemPrompt: 'You are a senior tech lead.' },
    { name: 'BackendEng', model: 'gemini-2.5-flash', provider: 'google', systemPrompt: 'You are a backend engineer.' },
  ],
  status: 'completed',
  currentRound: 3,
  conversationHistory: [],
  consensusReached: true,
  finalSolution: 'Adopt GraphQL for the public API layer, keep REST for internal services.',
  turn_analytics: {
    per_agent: [
      { name: 'TechLead', turns: 3, token_share_pct: 52.4 },
      { name: 'BackendEng', turns: 3, token_share_pct: 47.6 },
    ],
  },
  dissent_quality: 'captured',
  agentSubstitutions: {},
  cost: { totalCost: 0.031, totalTokens: { input: 4000, output: 1500 }, totalCalls: 6 },
  outputFiles: { transcript: '/tmp/test/transcript.txt', json: '/tmp/test/session.json' },
};

const operatorFixture: OperatorInputs = {
  operatorName: 'Jane Operator',
  panelRationale: 'Cross-provider panel for independent risk views',
  mitigations: {},
};

// ============================================================================
// Locked string constants (from plan <locked_strings>)
// ============================================================================

const LOCKED_TITLE = '# Deliberation Record';
const LOCKED_HEADERS = [
  '## 1. Decision Framed',
  '## 2. Panel Composition & Rationale',
  '## 3. Positions Summarized',
  '## 4. Dissent (Attributed)',
  '## 5. Synthesis & Recommendation',
  '## 6. Risks Surfaced & Human Mitigation',
  '## 7. Decision-Support Disclaimer',
  '## 8. Provenance',
];
const LOCKED_DISCLAIMER =
  'This Deliberation Record is decision-support documentation, not a substitute for professional judgment. The deliberation was one input into a human-owned decision process.';
const LOCKED_PLACEHOLDER = '_[operator to complete]_';

// ============================================================================
// Test A: consult (in-memory) — all 8 headers + title + disclaimer + attributed dissent
// ============================================================================

it('Test A: renders a Deliberation Record from ConsultationResult with all 8 locked headers', () => {
  const source = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
  const formatter = new DeliberationRecordFormatter();
  const output = formatter.render(source, operatorFixture);

  expect(output).toContain(LOCKED_TITLE);
  for (const header of LOCKED_HEADERS) {
    expect(output).toContain(header);
  }
  expect(output).toContain(LOCKED_DISCLAIMER);

  // Named dissent from field 4 — attributed to 'Skeptic'
  const field4Start = output.indexOf('## 4. Dissent (Attributed)');
  const field4End = output.indexOf('## 5.', field4Start);
  const field4Content = output.substring(field4Start, field4End);
  expect(field4Content).toContain('Skeptic');

  // Operator named in field 8
  expect(output).toContain('**Run by:** Jane Operator');
});

// ============================================================================
// Test B: discuss (in-memory) — all 8 headers + dissent_quality surfaced + field 6 consistency
// ============================================================================

it('Test B: renders a Deliberation Record from SessionManifest with dissent_quality surfaced', () => {
  const source = DeliberationRecordBuilder.fromSession(discussFixture, operatorFixture);
  const formatter = new DeliberationRecordFormatter();
  const output = formatter.render(source, operatorFixture);

  expect(output).toContain(LOCKED_TITLE);
  for (const header of LOCKED_HEADERS) {
    expect(output).toContain(header);
  }
  expect(output).toContain(LOCKED_DISCLAIMER);

  // dissent_quality 'captured' must surface under field 4
  const field4Start = output.indexOf('## 4. Dissent (Attributed)');
  const field4End = output.indexOf('## 5.', field4Start);
  const field4Content = output.substring(field4Start, field4End);
  expect(field4Content).toContain('captured');

  // N1 consistency: field 6 MUST say 'not persisted', MUST NOT say 'none surfaced'
  const field6Start = output.indexOf('## 6. Risks Surfaced & Human Mitigation');
  const field6End = output.indexOf('## 7.', field6Start);
  const field6Content = output.substring(field6Start, field6End);
  expect(field6Content).toContain('not persisted');
  expect(field6Content).not.toContain('none surfaced');
});

// ============================================================================
// Test C: framing gate — no 'overridden' and no '%-sure/confident' in either record
// ============================================================================

it('Test C: framing gate — rendered records never contain forbidden phrasing', () => {
  const consultSource = DeliberationRecordBuilder.fromConsultation(consultFixture, operatorFixture);
  const discussSource = DeliberationRecordBuilder.fromSession(discussFixture, operatorFixture);
  const formatter = new DeliberationRecordFormatter();

  const consultOutput = formatter.render(consultSource, operatorFixture);
  const discussOutput = formatter.render(discussSource, operatorFixture);

  expect(consultOutput).not.toMatch(/overridden/i);
  expect(consultOutput).not.toMatch(/\d+%\s*(sure|confident)/i);

  expect(discussOutput).not.toMatch(/overridden/i);
  expect(discussOutput).not.toMatch(/\d+%\s*(sure|confident)/i);
});

// ============================================================================
// Test D: field 6 pairing — placeholder and supplied mitigation
// ============================================================================

it('Test D: field 6 renders placeholder without mitigation, supplied text with mitigation', () => {
  // Fixture with one dissent, no mitigation supplied
  const noMitigationOperator: OperatorInputs = {
    operatorName: 'Jane Operator',
    mitigations: {},
  };
  const source = DeliberationRecordBuilder.fromConsultation(consultFixture, noMitigationOperator);
  const formatter = new DeliberationRecordFormatter();

  const outputNoMit = formatter.render(source, noMitigationOperator);
  const field6Start = outputNoMit.indexOf('## 6. Risks Surfaced & Human Mitigation');
  const field6End = outputNoMit.indexOf('## 7.', field6Start);
  expect(outputNoMit.substring(field6Start, field6End)).toContain(LOCKED_PLACEHOLDER);

  // With a supplied mitigation
  const mitigationKey = consultFixture.dissent[0].concern;
  const withMitigationOperator: OperatorInputs = {
    operatorName: 'Jane Operator',
    mitigations: { [mitigationKey]: 'We will run a PoC first to validate complexity.' },
  };
  const sourceWithMit = DeliberationRecordBuilder.fromConsultation(consultFixture, withMitigationOperator);
  const outputWithMit = formatter.render(sourceWithMit, withMitigationOperator);
  const field6WithStart = outputWithMit.indexOf('## 6. Risks Surfaced & Human Mitigation');
  const field6WithEnd = outputWithMit.indexOf('## 7.', field6WithStart);
  expect(outputWithMit.substring(field6WithStart, field6WithEnd)).toContain(
    'We will run a PoC first to validate complexity.'
  );
  expect(outputWithMit.substring(field6WithStart, field6WithEnd)).not.toContain(LOCKED_PLACEHOLDER);
});

// ============================================================================
// Test E: stored session — no panel re-run, all 8 headers from saved session
// ============================================================================

it('Test E: renderDeliberationRecordFromSession loads stored session and returns all 8 headers', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delib-'));
  const sm = new SessionManager(tmpDir);

  // Build a minimal valid discuss session and save it
  const sessionToSave: SessionManifest = {
    ...discussFixture,
    id: 'delib-test-session-001',
  };
  await sm.saveSession(sessionToSave);

  const output = await renderDeliberationRecordFromSession(
    'delib-test-session-001',
    operatorFixture,
    sm
  );

  expect(output).toContain(LOCKED_TITLE);
  for (const header of LOCKED_HEADERS) {
    expect(output).toContain(header);
  }
  expect(output).toContain(LOCKED_DISCLAIMER);
});
