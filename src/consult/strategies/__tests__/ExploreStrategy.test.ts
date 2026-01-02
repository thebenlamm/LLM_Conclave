/**
 * Tests for ExploreStrategy implementation
 *
 * ExploreStrategy uses divergent "Yes, And..." framing:
 * - Independent: Generate diverse perspectives
 * - Synthesis: Find themes AND preserve unique insights
 * - CrossExam: Build on ideas
 * - Verdict: Present menu of options with trade-offs
 * - shouldTerminateEarly: Always returns false (exploration needs all rounds)
 */

import { ExploreStrategy } from '../ExploreStrategy';
import { ModeStrategy, AgentInfo, ArtifactCollection } from '../ModeStrategy';
import { IndependentArtifact, SynthesisArtifact, CrossExamArtifact } from '../../../types/consult';

describe('ExploreStrategy', () => {
  let strategy: ExploreStrategy;

  beforeEach(() => {
    strategy = new ExploreStrategy();
  });

  describe('Interface Compliance', () => {
    it('should implement ModeStrategy interface', () => {
      const modeStrategy: ModeStrategy = strategy;
      expect(modeStrategy).toBeDefined();
    });

    it('should have name set to "explore"', () => {
      expect(strategy.name).toBe('explore');
    });

    it('should have promptVersions defined', () => {
      expect(strategy.promptVersions).toBeDefined();
      expect(strategy.promptVersions.independent).toMatch(/^v\d+\.\d+$/);
      expect(strategy.promptVersions.synthesis).toMatch(/^v\d+\.\d+$/);
      expect(strategy.promptVersions.crossExam).toMatch(/^v\d+\.\d+$/);
      expect(strategy.promptVersions.verdict).toMatch(/^v\d+\.\d+$/);
    });
  });

  describe('getIndependentPrompt', () => {
    it('should include divergent framing keywords', () => {
      const prompt = strategy.getIndependentPrompt('What tech stack?', 'Building a web app');

      expect(prompt).toContain('diverse');
      expect(prompt).toContain('possibilities');
    });

    it('should include the question', () => {
      const prompt = strategy.getIndependentPrompt('What tech stack?', '');

      expect(prompt).toContain('What tech stack?');
    });

    it('should include context when provided', () => {
      const prompt = strategy.getIndependentPrompt('What tech stack?', 'Building a web app');

      expect(prompt).toContain('Building a web app');
    });

    it('should include JSON schema for artifact extraction', () => {
      const prompt = strategy.getIndependentPrompt('Test', '');

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('position');
      expect(prompt).toContain('key_points');
    });
  });

  describe('getSynthesisPrompt', () => {
    const mockArtifacts: IndependentArtifact[] = [
      {
        artifactType: 'independent',
        schemaVersion: '1.0',
        agentId: 'Agent1',
        roundNumber: 1,
        position: 'Use React',
        keyPoints: ['Component model', 'Large ecosystem'],
        rationale: 'React is mature',
        confidence: 0.8,
        proseExcerpt: 'React offers...',
        createdAt: new Date().toISOString()
      },
      {
        artifactType: 'independent',
        schemaVersion: '1.0',
        agentId: 'Agent2',
        roundNumber: 1,
        position: 'Use Vue',
        keyPoints: ['Simpler learning curve', 'Better DX'],
        rationale: 'Vue is approachable',
        confidence: 0.75,
        proseExcerpt: 'Vue provides...',
        createdAt: new Date().toISOString()
      }
    ];

    it('should include explore-specific synthesis framing', () => {
      const prompt = strategy.getSynthesisPrompt(mockArtifacts);

      expect(prompt).toContain('common themes');
      expect(prompt).toContain('unique insights');
    });

    it('should include all agent perspectives', () => {
      const prompt = strategy.getSynthesisPrompt(mockArtifacts);

      expect(prompt).toContain('Agent1');
      expect(prompt).toContain('Agent2');
      expect(prompt).toContain('Use React');
      expect(prompt).toContain('Use Vue');
    });

    it('should include JSON schema for synthesis artifact', () => {
      const prompt = strategy.getSynthesisPrompt(mockArtifacts);

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('consensus_points');
      expect(prompt).toContain('tensions');
    });
  });

  describe('getCrossExamPrompt', () => {
    const mockAgent: AgentInfo = { name: 'Security Expert', model: 'claude-sonnet-4-5' };
    const mockSynthesis: SynthesisArtifact = {
      artifactType: 'synthesis',
      schemaVersion: '1.0',
      roundNumber: 2,
      consensusPoints: [
        { point: 'Use TypeScript', supportingAgents: ['Agent1', 'Agent2'], confidence: 0.9 }
      ],
      tensions: [
        { topic: 'Framework choice', viewpoints: [{ agent: 'Agent1', viewpoint: 'React' }] }
      ],
      priorityOrder: ['Security', 'Performance'],
      createdAt: new Date().toISOString()
    };

    it('should include explore-specific cross-exam framing', () => {
      const prompt = strategy.getCrossExamPrompt(mockAgent, mockSynthesis);

      expect(prompt).toContain('Build on');
      expect(prompt).toContain('consider');
    });

    it('should include agent information', () => {
      const prompt = strategy.getCrossExamPrompt(mockAgent, mockSynthesis);

      expect(prompt).toContain('Security Expert');
    });

    it('should include synthesis context', () => {
      const prompt = strategy.getCrossExamPrompt(mockAgent, mockSynthesis);

      expect(prompt).toContain('Use TypeScript');
    });
  });

  describe('getVerdictPrompt', () => {
    const mockCollection: ArtifactCollection = {
      round1: [
        {
          artifactType: 'independent',
          schemaVersion: '1.0',
          agentId: 'Agent1',
          roundNumber: 1,
          position: 'Option A',
          keyPoints: ['Pro 1'],
          rationale: 'Reason A',
          confidence: 0.8,
          proseExcerpt: 'A is...',
          createdAt: new Date().toISOString()
        }
      ],
      round2: {
        artifactType: 'synthesis',
        schemaVersion: '1.0',
        roundNumber: 2,
        consensusPoints: [],
        tensions: [],
        priorityOrder: [],
        createdAt: new Date().toISOString()
      }
    };

    it('should include explore-specific verdict framing', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      expect(prompt).toContain('menu');
      expect(prompt).toContain('options');
      expect(prompt).toContain('trade-offs');
    });

    it('should allow multiple recommendations in schema', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      // Explore mode should indicate multiple recommendations are acceptable
      expect(prompt).toContain('recommendations');
    });

    it('should include JSON schema for verdict artifact', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('confidence');
    });
  });

  describe('shouldTerminateEarly', () => {
    it('should always return false (exploration needs all rounds)', () => {
      // High confidence, late round - still should not terminate
      expect(strategy.shouldTerminateEarly(0.99, 4)).toBe(false);
      expect(strategy.shouldTerminateEarly(1.0, 3)).toBe(false);
      expect(strategy.shouldTerminateEarly(0.5, 2)).toBe(false);
    });

    it('should return false regardless of confidence level', () => {
      expect(strategy.shouldTerminateEarly(0.0, 1)).toBe(false);
      expect(strategy.shouldTerminateEarly(0.95, 2)).toBe(false);
      expect(strategy.shouldTerminateEarly(0.85, 3)).toBe(false);
    });
  });
});
