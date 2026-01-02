/**
 * Tests for VerdictSchema with mode-aware validation
 *
 * Epic 4, Story 1: Mode-Specific Artifact Validation
 * - Converge mode: Enforces single recommendation (string)
 * - Explore mode: Allows multiple recommendations (array)
 */

import { VerdictSchema, VerdictValidationMode } from '../VerdictSchema';

describe('VerdictSchema', () => {
  const baseTimestamp = new Date().toISOString();

  describe('Converge Mode Validation (default)', () => {
    const validConvergeArtifact = {
      artifactType: 'verdict',
      schemaVersion: '1.0',
      roundNumber: 4,
      recommendation: 'Use PostgreSQL for the database',
      confidence: 0.85,
      evidence: ['Strong ACID compliance', 'Wide ecosystem support'],
      dissent: [
        { agent: 'Pragmatist', concern: 'MongoDB might be faster for prototyping', severity: 'low' as const }
      ],
      createdAt: baseTimestamp
    };

    it('should validate a valid converge mode artifact', () => {
      expect(() => VerdictSchema.validate(validConvergeArtifact)).not.toThrow();
      expect(() => VerdictSchema.validate(validConvergeArtifact, 'converge')).not.toThrow();
    });

    it('should require single recommendation (string)', () => {
      const artifactWithArrayRecommendation = {
        ...validConvergeArtifact,
        recommendation: undefined,
        recommendations: [{ option: 'Option A', description: 'Desc A' }]
      };

      expect(() => VerdictSchema.validate(artifactWithArrayRecommendation, 'converge'))
        .toThrow('recommendation must be a non-empty string in converge mode');
    });

    it('should require evidence array', () => {
      const artifactWithoutEvidence = {
        ...validConvergeArtifact,
        evidence: undefined
      };

      expect(() => VerdictSchema.validate(artifactWithoutEvidence, 'converge'))
        .toThrow('evidence must be an array');
    });

    it('should require at least one evidence item', () => {
      const artifactWithEmptyEvidence = {
        ...validConvergeArtifact,
        evidence: []
      };

      expect(() => VerdictSchema.validate(artifactWithEmptyEvidence, 'converge'))
        .toThrow('evidence must contain at least one item');
    });

    it('should require dissent array', () => {
      const artifactWithoutDissent = {
        ...validConvergeArtifact,
        dissent: undefined
      };

      expect(() => VerdictSchema.validate(artifactWithoutDissent, 'converge'))
        .toThrow('dissent must be an array');
    });

    it('should reject empty recommendation', () => {
      const artifactWithEmptyRec = {
        ...validConvergeArtifact,
        recommendation: ''
      };

      expect(() => VerdictSchema.validate(artifactWithEmptyRec, 'converge'))
        .toThrow('recommendation must be a non-empty string in converge mode');
    });
  });

  describe('Explore Mode Validation', () => {
    const validExploreArtifact = {
      artifactType: 'verdict',
      schemaVersion: '1.0',
      roundNumber: 4,
      recommendations: [
        {
          option: 'PostgreSQL',
          description: 'Best for ACID compliance and complex queries',
          pros: ['Strong consistency', 'Wide ecosystem'],
          cons: ['More complex setup', 'Higher learning curve']
        },
        {
          option: 'MongoDB',
          description: 'Best for rapid prototyping and flexible schemas',
          pros: ['Fast development', 'Flexible schema'],
          cons: ['Eventual consistency', 'Complex transactions']
        }
      ],
      confidence: 0.8,
      createdAt: baseTimestamp
    };

    it('should validate a valid explore mode artifact', () => {
      expect(() => VerdictSchema.validate(validExploreArtifact, 'explore')).not.toThrow();
    });

    it('should require recommendations array in explore mode', () => {
      const artifactWithSingleRec = {
        ...validExploreArtifact,
        recommendations: undefined,
        recommendation: 'Use PostgreSQL'
      };

      expect(() => VerdictSchema.validate(artifactWithSingleRec, 'explore'))
        .toThrow('recommendations must be an array in explore mode');
    });

    it('should require at least one recommendation in explore mode', () => {
      const artifactWithEmptyRecs = {
        ...validExploreArtifact,
        recommendations: []
      };

      expect(() => VerdictSchema.validate(artifactWithEmptyRecs, 'explore'))
        .toThrow('recommendations must contain at least one item in explore mode');
    });

    it('should validate recommendation structure', () => {
      const artifactWithInvalidRec = {
        ...validExploreArtifact,
        recommendations: [
          { option: '', description: 'Missing option' }
        ]
      };

      expect(() => VerdictSchema.validate(artifactWithInvalidRec, 'explore'))
        .toThrow("Recommendation at index 0 missing valid 'option' string");
    });

    it('should require description in each recommendation', () => {
      const artifactWithMissingDesc = {
        ...validExploreArtifact,
        recommendations: [
          { option: 'PostgreSQL', description: '' }
        ]
      };

      expect(() => VerdictSchema.validate(artifactWithMissingDesc, 'explore'))
        .toThrow("Recommendation at index 0 missing valid 'description' string");
    });

    it('should allow recommendations without pros/cons', () => {
      const minimalRecs = {
        ...validExploreArtifact,
        recommendations: [
          { option: 'Option A', description: 'Description A' }
        ]
      };

      expect(() => VerdictSchema.validate(minimalRecs, 'explore')).not.toThrow();
    });

    it('should validate pros as array if present', () => {
      const invalidPros = {
        ...validExploreArtifact,
        recommendations: [
          { option: 'Option A', description: 'Desc A', pros: 'not an array' }
        ]
      };

      expect(() => VerdictSchema.validate(invalidPros, 'explore'))
        .toThrow("Recommendation at index 0: 'pros' must be an array");
    });

    it('should validate cons as array if present', () => {
      const invalidCons = {
        ...validExploreArtifact,
        recommendations: [
          { option: 'Option A', description: 'Desc A', cons: 'not an array' }
        ]
      };

      expect(() => VerdictSchema.validate(invalidCons, 'explore'))
        .toThrow("Recommendation at index 0: 'cons' must be an array");
    });
  });

  describe('Common Validation', () => {
    it('should validate confidence is between 0 and 1', () => {
      const artifactWithInvalidConfidence = {
        artifactType: 'verdict',
        schemaVersion: '1.0',
        roundNumber: 4,
        recommendation: 'Test',
        confidence: 1.5,
        evidence: ['test'],
        dissent: [],
        createdAt: new Date().toISOString()
      };

      expect(() => VerdictSchema.validate(artifactWithInvalidConfidence, 'converge'))
        .toThrow('confidence must be a number between 0 and 1');
    });

    it('should validate roundNumber is 4', () => {
      const artifactWithWrongRound = {
        artifactType: 'verdict',
        schemaVersion: '1.0',
        roundNumber: 3,
        recommendation: 'Test',
        confidence: 0.8,
        evidence: ['test'],
        dissent: [],
        createdAt: new Date().toISOString()
      };

      expect(() => VerdictSchema.validate(artifactWithWrongRound, 'converge'))
        .toThrow('roundNumber must be 4 for Verdict artifacts');
    });

    it('should validate createdAt is valid ISO 8601', () => {
      const artifactWithInvalidTimestamp = {
        artifactType: 'verdict',
        schemaVersion: '1.0',
        roundNumber: 4,
        recommendation: 'Test',
        confidence: 0.8,
        evidence: ['test'],
        dissent: [],
        createdAt: 'invalid-date'
      };

      expect(() => VerdictSchema.validate(artifactWithInvalidTimestamp, 'converge'))
        .toThrow('createdAt must be a valid ISO 8601 timestamp');
    });
  });
});
