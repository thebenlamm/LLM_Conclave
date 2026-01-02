/**
 * Tests for ModeStrategy interface and types
 */

import { ModeStrategy, ArtifactCollection, AgentInfo } from '../ModeStrategy';
import { IndependentArtifact, SynthesisArtifact } from '../../../types/consult';

describe('ModeStrategy Interface', () => {
  // Mock implementation for testing interface compliance
  const mockStrategy: ModeStrategy = {
    name: 'converge',
    promptVersions: {
      independent: 'v1.0',
      synthesis: 'v1.0',
      crossExam: 'v1.0',
      verdict: 'v1.0'
    },
    getIndependentPrompt: (question: string, context: string) => `Question: ${question}\nContext: ${context}`,
    getSynthesisPrompt: (round1Artifacts: IndependentArtifact[]) => `Synthesize ${round1Artifacts.length} artifacts`,
    getCrossExamPrompt: (agent: AgentInfo, synthesis: SynthesisArtifact) => `Agent ${agent.name} cross-exam`,
    getVerdictPrompt: (allArtifacts: ArtifactCollection) => `Verdict with ${allArtifacts.round1.length} R1 artifacts`,
    shouldTerminateEarly: (confidence: number, roundNumber: number) => confidence >= 0.95 && roundNumber >= 2
  };

  describe('Interface Compliance', () => {
    it('should have required name property with valid mode type', () => {
      expect(mockStrategy.name).toBeDefined();
      expect(['explore', 'converge']).toContain(mockStrategy.name);
    });

    it('should have required promptVersions property', () => {
      expect(mockStrategy.promptVersions).toBeDefined();
      expect(mockStrategy.promptVersions.independent).toBeDefined();
      expect(mockStrategy.promptVersions.synthesis).toBeDefined();
      expect(mockStrategy.promptVersions.crossExam).toBeDefined();
      expect(mockStrategy.promptVersions.verdict).toBeDefined();
    });

    it('should have getIndependentPrompt method', () => {
      expect(typeof mockStrategy.getIndependentPrompt).toBe('function');
      const result = mockStrategy.getIndependentPrompt('test question', 'test context');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have getSynthesisPrompt method', () => {
      expect(typeof mockStrategy.getSynthesisPrompt).toBe('function');
      const mockArtifacts: IndependentArtifact[] = [{
        artifactType: 'independent',
        schemaVersion: '1.0',
        agentId: 'test-agent',
        roundNumber: 1,
        position: 'Test position',
        keyPoints: ['point1', 'point2'],
        rationale: 'Test rationale',
        confidence: 0.8,
        proseExcerpt: 'Test excerpt',
        createdAt: new Date().toISOString()
      }];
      const result = mockStrategy.getSynthesisPrompt(mockArtifacts);
      expect(typeof result).toBe('string');
    });

    it('should have getCrossExamPrompt method', () => {
      expect(typeof mockStrategy.getCrossExamPrompt).toBe('function');
      const mockAgent: AgentInfo = { name: 'Test Agent', model: 'gpt-4o' };
      const mockSynthesis: SynthesisArtifact = {
        artifactType: 'synthesis',
        schemaVersion: '1.0',
        roundNumber: 2,
        consensusPoints: [],
        tensions: [],
        priorityOrder: [],
        createdAt: new Date().toISOString()
      };
      const result = mockStrategy.getCrossExamPrompt(mockAgent, mockSynthesis);
      expect(typeof result).toBe('string');
    });

    it('should have getVerdictPrompt method', () => {
      expect(typeof mockStrategy.getVerdictPrompt).toBe('function');
      const mockCollection: ArtifactCollection = {
        round1: []
      };
      const result = mockStrategy.getVerdictPrompt(mockCollection);
      expect(typeof result).toBe('string');
    });

    it('should have shouldTerminateEarly method', () => {
      expect(typeof mockStrategy.shouldTerminateEarly).toBe('function');
      const result = mockStrategy.shouldTerminateEarly(0.9, 3);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('ArtifactCollection Type', () => {
    it('should accept round1 as required field', () => {
      const collection: ArtifactCollection = {
        round1: []
      };
      expect(collection.round1).toBeDefined();
    });

    it('should accept optional round2 field', () => {
      const collection: ArtifactCollection = {
        round1: [],
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
      expect(collection.round2).toBeDefined();
    });

    it('should accept optional round3 field', () => {
      const collection: ArtifactCollection = {
        round1: [],
        round3: {
          artifactType: 'cross_exam',
          schemaVersion: '1.0',
          roundNumber: 3,
          challenges: [],
          rebuttals: [],
          unresolved: [],
          createdAt: new Date().toISOString()
        }
      };
      expect(collection.round3).toBeDefined();
    });
  });

  describe('AgentInfo Type', () => {
    it('should have required name and model fields', () => {
      const agent: AgentInfo = {
        name: 'Security Expert',
        model: 'claude-sonnet-4-5'
      };
      expect(agent.name).toBe('Security Expert');
      expect(agent.model).toBe('claude-sonnet-4-5');
    });
  });
});
