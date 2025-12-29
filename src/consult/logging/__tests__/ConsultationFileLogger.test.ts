import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConsultationFileLogger } from '../ConsultationFileLogger';
import { ConsultationResult, ConsultState } from '../../../types/consult';

describe('ConsultationFileLogger', () => {
  let logger: ConsultationFileLogger;
  let testLogDir: string;

  beforeEach(() => {
    // Use temp directory for tests
    testLogDir = path.join(os.tmpdir(), `consult-test-${Date.now()}`);
    logger = new ConsultationFileLogger(testLogDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  const createMockResult = (): ConsultationResult => ({
    consultationId: 'test-123',
    timestamp: '2025-12-29T00:00:00.000Z',
    question: 'Test question',
    context: '',
    mode: 'converge',
    agents: [
      { name: 'Agent1', model: 'gpt-4o', provider: 'openai' },
      { name: 'Agent2', model: 'claude-sonnet-4-5', provider: 'anthropic' }
    ],
    state: ConsultState.Complete,
    rounds: 4,
    completedRounds: 4,
    responses: {
      round1: [{
        artifactType: 'independent',
        schemaVersion: '1.0',
        roundNumber: 1,
        agentId: 'agent1',
        position: 'Test position',
        keyPoints: ['point 1'],
        rationale: 'Test rationale',
        confidence: 0.9,
        proseExcerpt: 'Test prose',
        createdAt: '2025-12-29T00:00:00.000Z'
      }],
      round2: {
        artifactType: 'synthesis',
        schemaVersion: '1.0',
        roundNumber: 2,
        consensusPoints: [{
          point: 'Consensus',
          supportingAgents: ['agent1'],
          confidence: 0.9
        }],
        tensions: [],
        priorityOrder: [],
        createdAt: '2025-12-29T00:00:00.000Z'
      },
      round3: {
        artifactType: 'cross_exam',
        schemaVersion: '1.0',
        roundNumber: 3,
        challenges: [],
        rebuttals: [],
        unresolved: [],
        createdAt: '2025-12-29T00:00:00.000Z'
      },
      round4: {
        artifactType: 'verdict',
        schemaVersion: '1.0',
        roundNumber: 4,
        recommendation: 'Test recommendation',
        confidence: 0.9,
        evidence: ['evidence1'],
        dissent: [],
        createdAt: '2025-12-29T00:00:00.000Z'
      }
    },
    consensus: 'Test consensus',
    confidence: 0.9,
    recommendation: 'Test recommendation',
    reasoning: {},
    concerns: [],
    dissent: [],
    perspectives: [],
    cost: {
      tokens: { input: 100, output: 200, total: 300 },
      usd: 0.05
    },
    durationMs: 1000,
    promptVersions: {
      mode: 'converge',
      independentPromptVersion: '1.0',
      synthesisPromptVersion: '1.0',
      crossExamPromptVersion: '1.0',
      verdictPromptVersion: '1.0'
    }
  });

  it('should create log directory if it doesn\'t exist', async () => {
    expect(fs.existsSync(testLogDir)).toBe(false);

    const result = createMockResult();
    await logger.logConsultation(result);

    expect(fs.existsSync(testLogDir)).toBe(true);
  });

  it('should write JSON log file', async () => {
    const result = createMockResult();
    await logger.logConsultation(result);

    const jsonPath = path.join(testLogDir, `consult-${result.consultationId}.json`);
    expect(fs.existsSync(jsonPath)).toBe(true);

    const content = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed.consultation_id).toBe('test-123');
    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.question).toBe('Test question');
  });

  it('should write Markdown log file', async () => {
    const result = createMockResult();
    await logger.logConsultation(result);

    const mdPath = path.join(testLogDir, `consult-${result.consultationId}.md`);
    expect(fs.existsSync(mdPath)).toBe(true);

    const content = fs.readFileSync(mdPath, 'utf8');
    expect(content).toContain('# Consultation Summary');
    expect(content).toContain('Test question');
  });

  it('should handle write errors gracefully', async () => {
    // Create logger with invalid directory (no permissions simulation is hard)
    const invalidLogger = new ConsultationFileLogger('/root/no-permission');
    const result = createMockResult();

    // Should not throw
    await expect(invalidLogger.logConsultation(result)).resolves.toBeUndefined();
  });

  it('should return log directory path', () => {
    expect(logger.getLogDirectory()).toBe(testLogDir);
  });
});
