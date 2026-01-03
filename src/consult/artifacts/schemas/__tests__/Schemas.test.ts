/**
 * Unit Tests for Artifact Schemas
 */

import { IndependentSchema } from '../IndependentSchema';
import { SynthesisSchema } from '../SynthesisSchema';
import { CrossExamSchema } from '../CrossExamSchema';
import { VerdictSchema } from '../VerdictSchema';

describe('IndependentSchema (Round 1)', () => {
  const validArtifact = {
    artifactType: 'independent',
    schemaVersion: '1.0',
    agentId: 'security_expert',
    roundNumber: 1,
    position: 'Use OAuth 2.0 with JWT tokens',
    keyPoints: ['Industry standard', 'Secure token handling', 'Scalable'],
    rationale: 'OAuth 2.0 provides proven security with JWT for stateless auth',
    confidence: 0.85,
    proseExcerpt: 'I recommend OAuth 2.0 because...',
    createdAt: new Date().toISOString()
  };

  it('should validate a correct artifact', () => {
    expect(() => IndependentSchema.validate(validArtifact)).not.toThrow();
  });

  it('should throw error when missing required field', () => {
    const { position, ...incomplete } = validArtifact;
    expect(() => IndependentSchema.validate(incomplete)).toThrow('Missing required field: position');
  });

  it('should throw error when missing schema_version', () => {
    const { schemaVersion, ...incomplete } = validArtifact;
    expect(() => IndependentSchema.validate(incomplete)).toThrow('Missing required field: schemaVersion');
  });

  it('should throw error for invalid artifactType', () => {
    const invalid = { ...validArtifact, artifactType: 'synthesis' };
    expect(() => IndependentSchema.validate(invalid)).toThrow("Invalid artifactType: expected 'independent'");
  });

  it('should throw error for invalid roundNumber', () => {
    const invalid = { ...validArtifact, roundNumber: 2 };
    expect(() => IndependentSchema.validate(invalid)).toThrow('roundNumber must be 1 for Independent artifacts');
  });

  it('should throw error for empty keyPoints array', () => {
    const invalid = { ...validArtifact, keyPoints: [] };
    expect(() => IndependentSchema.validate(invalid)).toThrow('keyPoints must contain at least one point');
  });

  it('should throw error for confidence out of range', () => {
    const invalid1 = { ...validArtifact, confidence: 1.5 };
    expect(() => IndependentSchema.validate(invalid1)).toThrow('confidence must be a number between 0 and 1');

    const invalid2 = { ...validArtifact, confidence: -0.1 };
    expect(() => IndependentSchema.validate(invalid2)).toThrow('confidence must be a number between 0 and 1');
  });

  it('should create artifact with factory method', () => {
    const artifact = IndependentSchema.create({
      agentId: 'test_agent',
      position: 'Test position',
      keyPoints: ['Point 1', 'Point 2'],
      rationale: 'Test rationale',
      confidence: 0.9,
      proseExcerpt: 'Test excerpt'
    });

    expect(artifact.artifactType).toBe('independent');
    expect(artifact.schemaVersion).toBe('1.0');
    expect(artifact.roundNumber).toBe(1);
  });
});

describe('SynthesisSchema (Round 2)', () => {
  const validArtifact = {
    artifactType: 'synthesis',
    schemaVersion: '1.0',
    roundNumber: 2,
    consensusPoints: [
      {
        point: 'OAuth is industry standard',
        supportingAgents: ['security_expert', 'architect'],
        confidence: 0.9
      }
    ],
    tensions: [
      {
        topic: 'Implementation complexity',
        viewpoints: [
          { agent: 'security_expert', viewpoint: 'Security worth the complexity' },
          { agent: 'pragmatist', viewpoint: 'Too complex for MVP' }
        ]
      }
    ],
    priorityOrder: ['Security', 'Performance', 'Simplicity'],
    createdAt: new Date().toISOString()
  };

  it('should validate a correct artifact', () => {
    expect(() => SynthesisSchema.validate(validArtifact)).not.toThrow();
  });

  it('should throw error for invalid artifactType', () => {
    const invalid = { ...validArtifact, artifactType: 'independent' };
    expect(() => SynthesisSchema.validate(invalid)).toThrow("Invalid artifactType: expected 'synthesis'");
  });

  it('should throw error for invalid roundNumber', () => {
    const invalid = { ...validArtifact, roundNumber: 1 };
    expect(() => SynthesisSchema.validate(invalid)).toThrow('roundNumber must be 2 for Synthesis artifacts');
  });

  it('should filter out tension with less than 2 viewpoints (lenient validation)', () => {
    const artifactWithInvalidTension = {
      ...validArtifact,
      tensions: [
        {
          topic: 'Test',
          viewpoints: [{ agent: 'agent1', viewpoint: 'view1' }]
        }
      ]
    };
    // Lenient validation: invalid tensions are filtered out, not rejected
    expect(() => SynthesisSchema.validate(artifactWithInvalidTension)).not.toThrow();
    // The invalid tension should be filtered out
    expect(artifactWithInvalidTension.tensions).toHaveLength(0);
  });

  it('should throw error for invalid consensus point confidence', () => {
    const invalid = {
      ...validArtifact,
      consensusPoints: [
        {
          point: 'Test',
          supportingAgents: ['agent1'],
          confidence: 1.5
        }
      ]
    };
    expect(() => SynthesisSchema.validate(invalid)).toThrow('ConsensusPoint.confidence must be a number between 0 and 1');
  });

  it('should create artifact with factory method', () => {
    const artifact = SynthesisSchema.create({
      consensusPoints: validArtifact.consensusPoints,
      tensions: validArtifact.tensions,
      priorityOrder: validArtifact.priorityOrder
    });

    expect(artifact.artifactType).toBe('synthesis');
    expect(artifact.roundNumber).toBe(2);
  });
});

describe('CrossExamSchema (Round 3)', () => {
  const validArtifact = {
    artifactType: 'cross_exam',
    schemaVersion: '1.0',
    roundNumber: 3,
    challenges: [
      {
        challenger: 'pragmatist',
        targetAgent: 'security_expert',
        challenge: 'OAuth adds unnecessary complexity for MVP',
        evidence: ['Longer dev time', 'More dependencies']
      }
    ],
    rebuttals: [
      {
        agent: 'security_expert',
        rebuttal: 'Security cannot be compromised even in MVP'
      }
    ],
    unresolved: ['Time-to-market vs security trade-off'],
    createdAt: new Date().toISOString()
  };

  it('should validate a correct artifact', () => {
    expect(() => CrossExamSchema.validate(validArtifact)).not.toThrow();
  });

  it('should throw error for invalid artifactType', () => {
    const invalid = { ...validArtifact, artifactType: 'verdict' };
    expect(() => CrossExamSchema.validate(invalid)).toThrow("Invalid artifactType: expected 'cross_exam'");
  });

  it('should throw error for invalid roundNumber', () => {
    const invalid = { ...validArtifact, roundNumber: 4 };
    expect(() => CrossExamSchema.validate(invalid)).toThrow('roundNumber must be 3 for CrossExam artifacts');
  });

  it('should throw error for challenge without target agent', () => {
    const invalid = {
      ...validArtifact,
      challenges: [
        {
          challenger: 'agent1',
          targetAgent: '',
          challenge: 'test',
          evidence: []
        }
      ]
    };
    expect(() => CrossExamSchema.validate(invalid)).toThrow("Challenge at index 0 missing valid 'targetAgent' string");
  });

  it('should allow empty unresolved array', () => {
    const valid = { ...validArtifact, unresolved: [] };
    expect(() => CrossExamSchema.validate(valid)).not.toThrow();
  });

  it('should create artifact with factory method', () => {
    const artifact = CrossExamSchema.create({
      challenges: validArtifact.challenges,
      rebuttals: validArtifact.rebuttals,
      unresolved: validArtifact.unresolved
    });

    expect(artifact.artifactType).toBe('cross_exam');
    expect(artifact.roundNumber).toBe(3);
  });
});

describe('VerdictSchema (Round 4)', () => {
  const validArtifact = {
    artifactType: 'verdict',
    schemaVersion: '1.0',
    roundNumber: 4,
    recommendation: 'Implement OAuth 2.0 with phased approach',
    confidence: 0.88,
    evidence: [
      'Industry standard security',
      'Scalable architecture',
      'Team has OAuth experience'
    ],
    dissent: [
      {
        agent: 'pragmatist',
        concern: 'May delay MVP launch',
        severity: 'medium' as const
      }
    ],
    createdAt: new Date().toISOString()
  };

  it('should validate a correct artifact', () => {
    expect(() => VerdictSchema.validate(validArtifact)).not.toThrow();
  });

  it('should throw error for invalid artifactType', () => {
    const invalid = { ...validArtifact, artifactType: 'synthesis' };
    expect(() => VerdictSchema.validate(invalid)).toThrow("Invalid artifactType: expected 'verdict'");
  });

  it('should throw error for invalid roundNumber', () => {
    const invalid = { ...validArtifact, roundNumber: 3 };
    expect(() => VerdictSchema.validate(invalid)).toThrow('roundNumber must be 4 for Verdict artifacts');
  });

  it('should throw error for empty evidence array', () => {
    const invalid = { ...validArtifact, evidence: [] };
    expect(() => VerdictSchema.validate(invalid)).toThrow('evidence must contain at least one item');
  });

  it('should throw error for invalid dissent severity', () => {
    const invalid = {
      ...validArtifact,
      dissent: [
        {
          agent: 'agent1',
          concern: 'test',
          severity: 'critical'
        }
      ]
    };
    expect(() => VerdictSchema.validate(invalid)).toThrow("Dissent at index 0 has invalid severity: 'critical'. Must be high, medium, or low.");
  });

  it('should allow all valid severity levels', () => {
    const highSeverity = {
      ...validArtifact,
      dissent: [{ agent: 'agent1', concern: 'test', severity: 'high' as const }]
    };
    expect(() => VerdictSchema.validate(highSeverity)).not.toThrow();

    const mediumSeverity = {
      ...validArtifact,
      dissent: [{ agent: 'agent1', concern: 'test', severity: 'medium' as const }]
    };
    expect(() => VerdictSchema.validate(mediumSeverity)).not.toThrow();

    const lowSeverity = {
      ...validArtifact,
      dissent: [{ agent: 'agent1', concern: 'test', severity: 'low' as const }]
    };
    expect(() => VerdictSchema.validate(lowSeverity)).not.toThrow();
  });

  it('should allow empty dissent array', () => {
    const valid = { ...validArtifact, dissent: [] };
    expect(() => VerdictSchema.validate(valid)).not.toThrow();
  });

  it('should create artifact with factory method', () => {
    const artifact = VerdictSchema.create({
      recommendation: validArtifact.recommendation,
      confidence: validArtifact.confidence,
      evidence: validArtifact.evidence,
      dissent: validArtifact.dissent
    });

    expect(artifact.artifactType).toBe('verdict');
    expect(artifact.roundNumber).toBe(4);
  });
});
