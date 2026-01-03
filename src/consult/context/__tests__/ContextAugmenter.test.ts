import { ContextAugmenter } from '../ContextAugmenter';
import { BrownfieldAnalysis } from '../BrownfieldDetector';

const createAnalysis = (projectType: 'brownfield' | 'greenfield'): BrownfieldAnalysis => ({
  projectType,
  indicatorsFound: [],
  indicatorCount: projectType === 'brownfield' ? 3 : 0,
  techStack: {
    framework: 'Next.js',
    frameworkVersion: '14',
    architecturePattern: 'app_router',
    stateManagement: 'Zustand',
    styling: 'Tailwind',
    testing: ['Vitest'],
    api: 'tRPC',
    database: 'PostgreSQL',
    orm: 'Prisma',
    cicd: 'GitHub Actions'
  },
  documentation: { files: [], totalFound: 0 },
  biasApplied: projectType === 'brownfield'
});

describe('ContextAugmenter', () => {
  it('appends greenfield guidance without context block', () => {
    const augmenter = new ContextAugmenter();
    const analysis = createAnalysis('greenfield');
    const result = augmenter.augmentPrompt('Base prompt', analysis);

    expect(result).toContain('Base prompt');
    expect(result).toContain('greenfield project');
    expect(result).not.toContain('IMPORTANT: This is a brownfield project');
  });

  it('prepends brownfield context and guidelines', () => {
    const augmenter = new ContextAugmenter();
    const analysis = createAnalysis('brownfield');
    const result = augmenter.augmentPrompt('Base prompt', analysis);

    expect(result).toContain('IMPORTANT: This is a brownfield project');
    expect(result).toContain('Project Context:');
    expect(result).toContain('Framework: Next.js 14 (app_router)');
    expect(result).toContain('When recommending solutions for this brownfield project:');
    expect(result).toContain('Base prompt');
  });
});
