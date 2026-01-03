import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalyticsIndexer } from '../AnalyticsIndexer';
import { StatsQuery } from '../StatsQuery';
import { ConsultationResult, ConsultState } from '../../../types/consult';

const createResult = (overrides: Partial<ConsultationResult>): ConsultationResult => ({
  consultationId: 'consult-1',
  timestamp: '2026-01-01T00:00:00.000Z',
  question: 'Test question',
  context: '',
  mode: 'converge',
  agents: [],
  state: ConsultState.Complete,
  rounds: 4,
  completedRounds: 4,
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
    mode: 'converge',
    independentPromptVersion: 'v1',
    synthesisPromptVersion: 'v1',
    crossExamPromptVersion: 'v1',
    verdictPromptVersion: 'v1'
  },
  ...overrides
});

describe('Project context analytics', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consult-analytics-'));
  const dbPath = path.join(tempDir, 'consult-analytics.db');

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('indexes and queries project context metrics', () => {
    const indexer = new AnalyticsIndexer(dbPath);

    const brownfieldResult = createResult({
      consultationId: 'consult-brownfield',
      projectContext: {
        projectType: 'brownfield',
        frameworkDetected: 'Next.js',
        frameworkVersion: '14',
        architecturePattern: 'app_router',
        techStack: {
          stateManagement: 'Zustand',
          styling: 'Tailwind',
          testing: ['Vitest'],
          api: 'tRPC',
          database: 'PostgreSQL',
          orm: 'Prisma',
          cicd: 'GitHub Actions'
        },
        indicatorsFound: ['package.json', 'README.md'],
        documentationUsed: ['README.md'],
        biasApplied: true
      }
    });

    const greenfieldResult = createResult({
      consultationId: 'consult-greenfield',
      projectContext: {
        projectType: 'greenfield',
        frameworkDetected: null,
        frameworkVersion: null,
        architecturePattern: null,
        techStack: {
          stateManagement: null,
          styling: null,
          testing: [],
          api: null,
          database: null,
          orm: null,
          cicd: null
        },
        indicatorsFound: [],
        documentationUsed: [],
        biasApplied: false
      }
    });

    indexer.indexConsultation(brownfieldResult);
    indexer.indexConsultation(greenfieldResult);
    indexer.close();

    const query = new StatsQuery(dbPath);
    const metrics = query.computeMetrics('all-time');
    query.close();

    expect(metrics.projectInsights.projectTypeCounts).toEqual({
      brownfield: 1,
      greenfield: 1,
      unknown: 0
    });
    expect(metrics.projectInsights.frameworkUsage).toEqual({
      'Next.js': 1
    });
  });
});
