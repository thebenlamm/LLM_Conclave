import { ArtifactFilter } from '../ArtifactFilter';
import { SynthesisArtifact, CrossExamArtifact } from '../../../types/consult';
import { SynthesisSchema } from '../schemas/SynthesisSchema';
import { CrossExamSchema } from '../schemas/CrossExamSchema';

describe('ArtifactFilter', () => {
  let filter: ArtifactFilter;

  beforeEach(() => {
    filter = new ArtifactFilter();
  });

  describe('filterSynthesisArtifact', () => {
    const mockSynthesis: SynthesisArtifact = {
      artifactType: 'synthesis',
      schemaVersion: '1.0',
      roundNumber: 2,
      createdAt: new Date().toISOString(),
      priorityOrder: ['agent1', 'agent2'],
      consensusPoints: [
        { point: 'Point 1', supportingAgents: ['a1'], confidence: 0.9 },
        { point: 'Point 2', supportingAgents: ['a1'], confidence: 0.5 },
        { point: 'Point 3', supportingAgents: ['a1'], confidence: 0.8 },
        { point: 'Point 4', supportingAgents: ['a1'], confidence: 0.7 },
        { point: 'Point 5', supportingAgents: ['a1'], confidence: 0.6 }
      ],
      tensions: [
        { topic: 'Topic 1', viewpoints: [{ agent: 'a1', viewpoint: 'v1' }, { agent: 'a2', viewpoint: 'v2' }] }, // 2 viewpoints
        { topic: 'Topic 2', viewpoints: [{ agent: 'a1', viewpoint: 'v1' }, { agent: 'a2', viewpoint: 'v2' }, { agent: 'a3', viewpoint: 'v3' }] }, // 3 viewpoints
        { topic: 'Topic 3', viewpoints: [{ agent: 'a1', viewpoint: 'v1' }, { agent: 'a2', viewpoint: 'v2' }, { agent: 'a3', viewpoint: 'v3' }, { agent: 'a4', viewpoint: 'v4' }] } // 4 viewpoints
      ]
    };

    it('should filter consensus points by confidence and respect limits', () => {
      const limits = { consensusPoints: 3, tensions: 2 };
      const filtered = filter.filterSynthesisArtifact(mockSynthesis, limits);

      expect(filtered.consensusPoints).toHaveLength(3);
      // Expected order: 0.9, 0.8, 0.7
      expect(filtered.consensusPoints[0].confidence).toBe(0.9);
      expect(filtered.consensusPoints[1].confidence).toBe(0.8);
      expect(filtered.consensusPoints[2].confidence).toBe(0.7);
    });

    it('should filter tensions by viewpoint count and respect limits', () => {
      const limits = { consensusPoints: 3, tensions: 2 };
      const filtered = filter.filterSynthesisArtifact(mockSynthesis, limits);

      expect(filtered.tensions).toHaveLength(2);
      // Expected order: Topic 3 (4 vps), Topic 2 (3 vps)
      expect(filtered.tensions[0].topic).toBe('Topic 3');
      expect(filtered.tensions[1].topic).toBe('Topic 2');
    });

    it('should return valid SynthesisSchema artifact', () => {
      const limits = { consensusPoints: 1, tensions: 1 };
      const filtered = filter.filterSynthesisArtifact(mockSynthesis, limits);
      
      expect(() => SynthesisSchema.validate(filtered)).not.toThrow();
    });

    it('should preserve required fields', () => {
      const limits = { consensusPoints: 1, tensions: 1 };
      const filtered = filter.filterSynthesisArtifact(mockSynthesis, limits);

      expect(filtered.artifactType).toBe('synthesis');
      expect(filtered.schemaVersion).toBe('1.0');
      expect(filtered.roundNumber).toBe(2);
      expect(filtered.priorityOrder).toEqual(mockSynthesis.priorityOrder);
      expect(filtered.createdAt).toBe(mockSynthesis.createdAt);
    });

    it('should handle limits larger than array size', () => {
      const limits = { consensusPoints: 10, tensions: 10 };
      const filtered = filter.filterSynthesisArtifact(mockSynthesis, limits);

      expect(filtered.consensusPoints).toHaveLength(5);
      expect(filtered.tensions).toHaveLength(3);
    });
    
    it('should not mutate original artifact', () => {
      const limits = { consensusPoints: 1, tensions: 1 };
      const _ = filter.filterSynthesisArtifact(mockSynthesis, limits);
      
      expect(mockSynthesis.consensusPoints).toHaveLength(5);
      expect(mockSynthesis.tensions).toHaveLength(3);
    });
  });

  describe('filterCrossExamArtifact', () => {
    const mockCrossExam: CrossExamArtifact = {
      artifactType: 'cross_exam',
      schemaVersion: '1.0',
      roundNumber: 3,
      createdAt: new Date().toISOString(),
      unresolved: ['u1', 'u2'],
      challenges: [
        { challenger: 'a1', targetAgent: 'a2', challenge: 'This is a critical flaw.', evidence: ['e1'] },
        { challenger: 'a1', targetAgent: 'a2', challenge: 'Minor issue.', evidence: ['e1'] },
        { challenger: 'a1', targetAgent: 'a2', challenge: 'Severe and fatal error.', evidence: ['e1', 'e2'] },
        { challenger: 'a1', targetAgent: 'a2', challenge: 'Just a comment.', evidence: ['e1'] }
      ],
      rebuttals: [
        { agent: 'a1', rebuttal: 'Short.' },
        { agent: 'a1', rebuttal: 'This is a very long and substantive rebuttal because it includes evidence and demonstrates deep understanding.' },
        { agent: 'a1', rebuttal: 'Medium length rebuttal.' }
      ]
    };

    it('should filter challenges by severity and respect limits', () => {
      const limits = { challenges: 2, rebuttals: 2 };
      const filtered = filter.filterCrossExamArtifact(mockCrossExam, limits);

      expect(filtered.challenges).toHaveLength(2);
      // 'Severe and fatal error' should be first (keywords + evidence)
      expect(filtered.challenges[0].challenge).toContain('Severe');
      // 'critical flaw' should be second
      expect(filtered.challenges[1].challenge).toContain('critical');
    });

    it('should filter rebuttals by substantiveness and respect limits', () => {
      const limits = { challenges: 2, rebuttals: 2 };
      const filtered = filter.filterCrossExamArtifact(mockCrossExam, limits);

      expect(filtered.rebuttals).toHaveLength(2);
      // Longest/most keyword heavy first
      expect(filtered.rebuttals[0].rebuttal).toContain('very long');
    });

    it('should return valid CrossExamSchema artifact', () => {
      const limits = { challenges: 1, rebuttals: 1 };
      const filtered = filter.filterCrossExamArtifact(mockCrossExam, limits);
      
      expect(() => CrossExamSchema.validate(filtered)).not.toThrow();
    });

    it('should preserve required fields', () => {
      const limits = { challenges: 1, rebuttals: 1 };
      const filtered = filter.filterCrossExamArtifact(mockCrossExam, limits);

      expect(filtered.artifactType).toBe('cross_exam');
      expect(filtered.schemaVersion).toBe('1.0');
      expect(filtered.roundNumber).toBe(3);
      expect(filtered.unresolved).toEqual(mockCrossExam.unresolved);
      expect(filtered.createdAt).toBe(mockCrossExam.createdAt);
    });
  });
});
