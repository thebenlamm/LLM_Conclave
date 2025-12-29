import { PartialResultManager } from '../PartialResultManager';
import { ConsultState } from '../../../types/consult';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PartialResultManager', () => {
  const testLogDir = path.join(os.tmpdir(), 'llm-conclave-test-logs');
  let manager: PartialResultManager;

  beforeEach(async () => {
    // Clean up test directory
    if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });
    manager = new PartialResultManager(testLogDir);
  });

  afterEach(async () => {
    if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  it('should save partial results with correct structure on cancellation', async () => {
    const consultationId = 'test-consult-123';
    const mockConsultation: any = {
      consultationId,
      timestamp: new Date().toISOString(),
      question: 'Test Question',
      context: 'Test Context',
      mode: 'converge',
      state: ConsultState.Independent,
      agents: [{ name: 'Agent1', model: 'model1', provider: 'provider1' }],
      rounds: 4,
      completedRounds: 0,
      responses: { round1: [] },
      consensus: '',
      confidence: 0,
      recommendation: '',
      reasoning: {},
      concerns: [],
      dissent: [],
      perspectives: [],
      cost: { tokens: { input: 0, output: 0, total: 0 }, usd: 0.05 },
      durationMs: 1000,
      promptVersions: {
        mode: 'converge',
        independentPromptVersion: '1.0',
        synthesisPromptVersion: '1.0',
        crossExamPromptVersion: '1.0',
        verdictPromptVersion: '1.0'
      },
      status: 'partial',
      cancellationReason: 'user_pulse_cancel',
      completedRoundNames: [],
      incompleteRoundNames: ['Round1', 'Round2', 'Round3', 'Round4']
    };

    const filePath = await manager.savePartialResults(
      mockConsultation,
      'user_pulse_cancel'
    );

    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain('-partial.jsonl');

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // Verify JSONL (last line contains the JSON object)
    const lines = fileContent.trim().split('\n');
    const savedResult = JSON.parse(lines[lines.length - 1]);

    expect(savedResult.status).toBe('partial');
    expect(savedResult.abort_reason).toBe('user_pulse_cancel');
    expect(savedResult.consultation_id).toBe(consultationId);
    expect(savedResult.resume_token).toBeDefined();
    expect(savedResult.signature).toBeDefined();
  });

  it('should save checkpoint correctly', async () => {
    const consultationId = 'test-checkpoint-123';
    const mockConsultation: any = {
        consultationId,
        completedRounds: 1, // Number of completed rounds
        state: ConsultState.Synthesis,
        timestamp: new Date().toISOString(),
        question: 'Q',
        context: '',
        mode: 'converge',
        agents: [],
        rounds: 4,
        responses: {},
        consensus: '',
        confidence: 0,
        recommendation: '',
        reasoning: {},
        concerns: [],
        dissent: [],
        perspectives: [],
        cost: { tokens: { input: 0, output: 0, total: 0 }, usd: 0 },
        durationMs: 0,
        promptVersions: {
            mode: 'converge',
            independentPromptVersion: '1.0',
            synthesisPromptVersion: '1.0',
            crossExamPromptVersion: '1.0',
            verdictPromptVersion: '1.0'
        }
    };
    
    // We need to access private methods or verify side effects (file creation)
    // For now, we assume saveCheckpoint creates a file or stores state
    await manager.saveCheckpoint(mockConsultation);
    
    const checkpointId = `${consultationId}-round1`;
    const checkpointPath = path.join(testLogDir, `${checkpointId}.checkpoint.json`);
    
    expect(fs.existsSync(checkpointPath)).toBe(true);
  });
});
