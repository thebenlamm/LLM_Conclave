/**
 * Unit Tests for ArtifactTransformer
 */

import { ArtifactTransformer } from '../ArtifactTransformer';
import {
  IndependentArtifact,
  SynthesisArtifact,
  CrossExamArtifact,
  VerdictArtifact
} from '../../../types/consult';

describe('ArtifactTransformer', () => {
  describe('IndependentArtifact Transformation', () => {
    const typescriptArtifact: IndependentArtifact = {
      artifactType: 'independent',
      schemaVersion: '1.0',
      agentId: 'security_expert',
      roundNumber: 1,
      position: 'Use OAuth 2.0',
      keyPoints: ['Secure', 'Scalable'],
      rationale: 'Industry standard',
      confidence: 0.85,
      proseExcerpt: 'I recommend...',
      createdAt: '2025-12-28T10:00:00.000Z'
    };

    const jsonArtifact = {
      artifact_type: 'independent',
      schema_version: '1.0',
      agent_id: 'security_expert',
      round_number: 1,
      position: 'Use OAuth 2.0',
      key_points: ['Secure', 'Scalable'],
      rationale: 'Industry standard',
      confidence: 0.85,
      prose_excerpt: 'I recommend...',
      created_at: '2025-12-28T10:00:00.000Z'
    };

    it('should convert TypeScript (camelCase) to JSON (snake_case)', () => {
      const result = ArtifactTransformer.independentToJSON(typescriptArtifact);
      expect(result).toEqual(jsonArtifact);
    });

    it('should convert JSON (snake_case) to TypeScript (camelCase)', () => {
      const result = ArtifactTransformer.independentFromJSON(jsonArtifact);
      expect(result).toEqual(typescriptArtifact);
    });

    it('should be reversible (TS → JSON → TS)', () => {
      const json = ArtifactTransformer.independentToJSON(typescriptArtifact);
      const restored = ArtifactTransformer.independentFromJSON(json);
      expect(restored).toEqual(typescriptArtifact);
    });

    it('should be reversible (JSON → TS → JSON)', () => {
      const ts = ArtifactTransformer.independentFromJSON(jsonArtifact);
      const restored = ArtifactTransformer.independentToJSON(ts);
      expect(restored).toEqual(jsonArtifact);
    });
  });

  describe('SynthesisArtifact Transformation', () => {
    const typescriptArtifact: SynthesisArtifact = {
      artifactType: 'synthesis',
      schemaVersion: '1.0',
      roundNumber: 2,
      consensusPoints: [
        {
          point: 'OAuth is secure',
          supportingAgents: ['security', 'architect'],
          confidence: 0.9
        }
      ],
      tensions: [
        {
          topic: 'Complexity',
          viewpoints: [
            { agent: 'security', viewpoint: 'Worth it' },
            { agent: 'pragmatist', viewpoint: 'Too complex' }
          ]
        }
      ],
      priorityOrder: ['Security', 'Speed'],
      createdAt: '2025-12-28T10:00:00.000Z'
    };

    const jsonArtifact = {
      artifact_type: 'synthesis',
      schema_version: '1.0',
      round_number: 2,
      consensus_points: [
        {
          point: 'OAuth is secure',
          supporting_agents: ['security', 'architect'],
          confidence: 0.9
        }
      ],
      tensions: [
        {
          topic: 'Complexity',
          viewpoints: [
            { agent: 'security', viewpoint: 'Worth it' },
            { agent: 'pragmatist', viewpoint: 'Too complex' }
          ]
        }
      ],
      priority_order: ['Security', 'Speed'],
      created_at: '2025-12-28T10:00:00.000Z'
    };

    it('should convert TypeScript to JSON', () => {
      const result = ArtifactTransformer.synthesisToJSON(typescriptArtifact);
      expect(result).toEqual(jsonArtifact);
    });

    it('should convert JSON to TypeScript', () => {
      const result = ArtifactTransformer.synthesisFromJSON(jsonArtifact);
      expect(result).toEqual(typescriptArtifact);
    });

    it('should be reversible', () => {
      const json = ArtifactTransformer.synthesisToJSON(typescriptArtifact);
      const restored = ArtifactTransformer.synthesisFromJSON(json);
      expect(restored).toEqual(typescriptArtifact);
    });
  });

  describe('CrossExamArtifact Transformation', () => {
    const typescriptArtifact: CrossExamArtifact = {
      artifactType: 'cross_exam',
      schemaVersion: '1.0',
      roundNumber: 3,
      challenges: [
        {
          challenger: 'pragmatist',
          targetAgent: 'security',
          challenge: 'Too complex',
          evidence: ['Dev time', 'Dependencies']
        }
      ],
      rebuttals: [
        {
          agent: 'security',
          rebuttal: 'Security is critical'
        }
      ],
      unresolved: ['Time vs Security'],
      createdAt: '2025-12-28T10:00:00.000Z'
    };

    const jsonArtifact = {
      artifact_type: 'cross_exam',
      schema_version: '1.0',
      round_number: 3,
      challenges: [
        {
          challenger: 'pragmatist',
          target_agent: 'security',
          challenge: 'Too complex',
          evidence: ['Dev time', 'Dependencies']
        }
      ],
      rebuttals: [
        {
          agent: 'security',
          rebuttal: 'Security is critical'
        }
      ],
      unresolved: ['Time vs Security'],
      created_at: '2025-12-28T10:00:00.000Z'
    };

    it('should convert TypeScript to JSON', () => {
      const result = ArtifactTransformer.crossExamToJSON(typescriptArtifact);
      expect(result).toEqual(jsonArtifact);
    });

    it('should convert JSON to TypeScript', () => {
      const result = ArtifactTransformer.crossExamFromJSON(jsonArtifact);
      expect(result).toEqual(typescriptArtifact);
    });

    it('should be reversible', () => {
      const json = ArtifactTransformer.crossExamToJSON(typescriptArtifact);
      const restored = ArtifactTransformer.crossExamFromJSON(json);
      expect(restored).toEqual(typescriptArtifact);
    });
  });

  describe('VerdictArtifact Transformation', () => {
    const typescriptArtifact: VerdictArtifact = {
      artifactType: 'verdict',
      schemaVersion: '1.0',
      roundNumber: 4,
      recommendation: 'Use OAuth 2.0 with phased rollout',
      confidence: 0.88,
      evidence: ['Industry standard', 'Team experience'],
      dissent: [
        {
          agent: 'pragmatist',
          concern: 'Timeline impact',
          severity: 'medium'
        }
      ],
      createdAt: '2025-12-28T10:00:00.000Z'
    };

    const jsonArtifact = {
      artifact_type: 'verdict',
      schema_version: '1.0',
      round_number: 4,
      recommendation: 'Use OAuth 2.0 with phased rollout',
      confidence: 0.88,
      evidence: ['Industry standard', 'Team experience'],
      dissent: [
        {
          agent: 'pragmatist',
          concern: 'Timeline impact',
          severity: 'medium'
        }
      ],
      created_at: '2025-12-28T10:00:00.000Z'
    };

    it('should convert TypeScript to JSON', () => {
      const result = ArtifactTransformer.verdictToJSON(typescriptArtifact);
      expect(result).toEqual(jsonArtifact);
    });

    it('should convert JSON to TypeScript', () => {
      const result = ArtifactTransformer.verdictFromJSON(jsonArtifact);
      expect(result).toEqual(typescriptArtifact);
    });

    it('should be reversible', () => {
      const json = ArtifactTransformer.verdictToJSON(typescriptArtifact);
      const restored = ArtifactTransformer.verdictFromJSON(json);
      expect(restored).toEqual(typescriptArtifact);
    });
  });

  describe('Generic Transformation', () => {
    it('should detect and transform Independent artifact', () => {
      const artifact: IndependentArtifact = {
        artifactType: 'independent',
        schemaVersion: '1.0',
        agentId: 'test',
        roundNumber: 1,
        position: 'Test',
        keyPoints: ['A', 'B'],
        rationale: 'Test',
        confidence: 0.8,
        proseExcerpt: 'Test',
        createdAt: '2025-12-28T10:00:00.000Z'
      };

      const json = ArtifactTransformer.toJSON(artifact);
      expect(json.artifact_type).toBe('independent');
      expect(json.agent_id).toBe('test');
    });

    it('should detect and transform from JSON', () => {
      const json = {
        artifact_type: 'synthesis',
        schema_version: '1.0',
        round_number: 2,
        consensus_points: [],
        tensions: [],
        priority_order: [],
        created_at: '2025-12-28T10:00:00.000Z'
      };

      const artifact = ArtifactTransformer.fromJSON(json);
      expect((artifact as SynthesisArtifact).artifactType).toBe('synthesis');
      expect((artifact as SynthesisArtifact).roundNumber).toBe(2);
    });

    it('should throw error for unknown artifact type in toJSON', () => {
      const invalid = {
        artifactType: 'unknown',
        schemaVersion: '1.0'
      } as any;

      expect(() => ArtifactTransformer.toJSON(invalid)).toThrow('Unknown artifact type: unknown');
    });

    it('should throw error for unknown artifact type in fromJSON', () => {
      const invalid = {
        artifact_type: 'unknown',
        schema_version: '1.0'
      };

      expect(() => ArtifactTransformer.fromJSON(invalid)).toThrow('Unknown artifact type: unknown');
    });
  });

  describe('Helper Functions', () => {
    it('should convert camelCase to snake_case', () => {
      expect(ArtifactTransformer.camelToSnake('agentId')).toBe('agent_id');
      expect(ArtifactTransformer.camelToSnake('roundNumber')).toBe('round_number');
      expect(ArtifactTransformer.camelToSnake('createdAt')).toBe('created_at');
      expect(ArtifactTransformer.camelToSnake('artifactType')).toBe('artifact_type');
    });

    it('should convert snake_case to camelCase', () => {
      expect(ArtifactTransformer.snakeToCamel('agent_id')).toBe('agentId');
      expect(ArtifactTransformer.snakeToCamel('round_number')).toBe('roundNumber');
      expect(ArtifactTransformer.snakeToCamel('created_at')).toBe('createdAt');
      expect(ArtifactTransformer.snakeToCamel('artifact_type')).toBe('artifactType');
    });

    it('should handle strings without underscores', () => {
      expect(ArtifactTransformer.snakeToCamel('test')).toBe('test');
      expect(ArtifactTransformer.camelToSnake('test')).toBe('test');
    });
  });
});
