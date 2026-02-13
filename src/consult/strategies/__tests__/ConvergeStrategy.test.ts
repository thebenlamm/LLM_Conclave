/**
 * Tests for ConvergeStrategy implementation
 *
 * ConvergeStrategy uses adversarial "No, Because..." framing:
 * - Independent: Take a strong position
 * - Synthesis: Find disagreements and conflicts
 * - CrossExam: Challenge weak arguments
 * - Verdict: Provide ONE definitive recommendation
 * - shouldTerminateEarly: Returns true when confidence >= threshold
 */

import { ConvergeStrategy } from '../ConvergeStrategy';
import { ModeStrategy, AgentInfo, ArtifactCollection } from '../ModeStrategy';
import { IndependentArtifact, SynthesisArtifact, CrossExamArtifact } from '../../../types/consult';

describe('ConvergeStrategy', () => {
  let strategy: ConvergeStrategy;

  beforeEach(() => {
    strategy = new ConvergeStrategy();
  });

  describe('Interface Compliance', () => {
    it('should implement ModeStrategy interface', () => {
      const modeStrategy: ModeStrategy = strategy;
      expect(modeStrategy).toBeDefined();
    });

    it('should have name set to "converge"', () => {
      expect(strategy.name).toBe('converge');
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
    it('should include adversarial/strong position framing', () => {
      const prompt = strategy.getIndependentPrompt('What tech stack?', 'Building a web app');

      expect(prompt).toContain('strong position');
      expect(prompt).toContain('best');
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

    it('should include converge-specific synthesis framing', () => {
      const prompt = strategy.getSynthesisPrompt(mockArtifacts);

      expect(prompt).toContain('disagreements');
      expect(prompt).toContain('conflict');
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

    it('should include converge-specific cross-exam framing', () => {
      const prompt = strategy.getCrossExamPrompt(mockAgent, mockSynthesis);

      expect(prompt).toContain('Challenge');
      expect(prompt).toContain('wrong');
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

    it('should include converge-specific verdict framing', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      expect(prompt).toContain('ONE');
      expect(prompt).toContain('definitive');
      expect(prompt).toContain('recommendation');
    });

    it('should enforce single recommendation in schema', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      // Converge mode should have singular "recommendation" not array
      expect(prompt).toContain('"recommendation"');
      expect(prompt).toContain('confidence');
    });

    it('should include JSON schema for verdict artifact', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('evidence');
      expect(prompt).toContain('dissent');
    });

    it('should include _analysis scratchpad field in verdict prompt', () => {
      const prompt = strategy.getVerdictPrompt(mockCollection);

      expect(prompt).toContain('_analysis');
      expect(prompt).toContain('Fill the "_analysis" field FIRST');
    });
  });

  describe('shouldTerminateEarly', () => {
    it('should return true when confidence >= 0.95 and roundNumber >= 2', () => {
      expect(strategy.shouldTerminateEarly(0.95, 2)).toBe(true);
      expect(strategy.shouldTerminateEarly(0.99, 3)).toBe(true);
      expect(strategy.shouldTerminateEarly(1.0, 4)).toBe(true);
    });

    it('should return false when confidence < 0.95', () => {
      expect(strategy.shouldTerminateEarly(0.94, 2)).toBe(false);
      expect(strategy.shouldTerminateEarly(0.8, 3)).toBe(false);
      expect(strategy.shouldTerminateEarly(0.5, 4)).toBe(false);
    });

    it('should return false when roundNumber < 2', () => {
      expect(strategy.shouldTerminateEarly(0.99, 1)).toBe(false);
      expect(strategy.shouldTerminateEarly(1.0, 1)).toBe(false);
    });

    it('should use configurable threshold', () => {
      const customStrategy = new ConvergeStrategy(0.85);

      expect(customStrategy.shouldTerminateEarly(0.85, 2)).toBe(true);
      expect(customStrategy.shouldTerminateEarly(0.84, 2)).toBe(false);
    });
  });
});
