import { SynthesisArtifact, CrossExamArtifact, Challenge, Rebuttal } from '../../types/consult';
import { SynthesisSchema } from './schemas/SynthesisSchema';
import { CrossExamSchema } from './schemas/CrossExamSchema';

export interface FilterLimits {
  consensusPoints?: number;
  tensions?: number;
  challenges?: number;
  rebuttals?: number;
}

export class ArtifactFilter {
  /**
   * Filter SynthesisArtifact to top-N items
   * @param artifact Original synthesis artifact
   * @param limits Filtering limits for consensus and tensions
   * @returns Filtered artifact that passes schema validation
   */
  filterSynthesisArtifact(
    artifact: SynthesisArtifact,
    limits: { consensusPoints: number; tensions: number }
  ): SynthesisArtifact {
    // Sort and truncate consensus points
    // Sort by confidence (descending)
    const sortedConsensus = [...artifact.consensusPoints]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limits.consensusPoints);

    // Sort and truncate tensions
    // Sort by number of viewpoints (descending) - more viewpoints = higher disagreement/relevance
    const sortedTensions = [...artifact.tensions]
      .sort((a, b) => b.viewpoints.length - a.viewpoints.length)
      .slice(0, limits.tensions);

    // Create filtered artifact
    const filtered: SynthesisArtifact = {
      artifactType: artifact.artifactType,
      schemaVersion: artifact.schemaVersion,
      roundNumber: artifact.roundNumber,
      consensusPoints: sortedConsensus,
      tensions: sortedTensions,
      priorityOrder: artifact.priorityOrder, // Keep all
      createdAt: artifact.createdAt
    };

    // Validate filtered artifact
    SynthesisSchema.validate(filtered);

    return filtered;
  }

  /**
   * Filter CrossExamArtifact to top-N items
   * @param artifact Original cross-exam artifact
   * @param limits Filtering limits for challenges and rebuttals
   * @returns Filtered artifact that passes schema validation
   */
  filterCrossExamArtifact(
    artifact: CrossExamArtifact,
    limits: { challenges: number; rebuttals: number }
  ): CrossExamArtifact {
    // Sort and truncate challenges by severity
    const sortedChallenges = [...artifact.challenges]
      .sort((a, b) => this.calculateSeverityScore(b) - this.calculateSeverityScore(a))
      .slice(0, limits.challenges);

    // Sort and truncate rebuttals by substantiveness
    const sortedRebuttals = [...artifact.rebuttals]
      .sort((a, b) => this.calculateSubstantivenessScore(b) - this.calculateSubstantivenessScore(a))
      .slice(0, limits.rebuttals);

    // Create filtered artifact
    const filtered: CrossExamArtifact = {
      artifactType: artifact.artifactType,
      schemaVersion: artifact.schemaVersion,
      roundNumber: artifact.roundNumber,
      challenges: sortedChallenges,
      rebuttals: sortedRebuttals,
      unresolved: artifact.unresolved, // Keep all - critical
      createdAt: artifact.createdAt
    };

    // Validate filtered artifact
    CrossExamSchema.validate(filtered);

    return filtered;
  }

  /**
   * Calculate severity score for a challenge
   * Higher score = more severe/important
   */
  private calculateSeverityScore(challenge: Challenge): number {
    const severityKeywords = [
      'critical', 'severe', 'major', 'fatal', 'incorrect',
      'flawed', 'broken', 'wrong', 'dangerous', 'serious'
    ];

    let score = challenge.evidence.length * 2; // Evidence weight

    const lowerChallenge = challenge.challenge.toLowerCase();
    severityKeywords.forEach(keyword => {
      if (lowerChallenge.includes(keyword)) {
        score += 5;
      }
    });

    // Add length factor (longer challenges often more detailed)
    score += challenge.challenge.length / 100;

    return score;
  }

  /**
   * Calculate substantiveness score for a rebuttal
   * Higher score = more substantive/evidence-based
   */
  private calculateSubstantivenessScore(rebuttal: Rebuttal): number {
    const substantiveKeywords = [
      'because', 'evidence', 'data', 'research', 'proven',
      'demonstrates', 'shows', 'indicates', 'suggests', 'confirms'
    ];

    let score = rebuttal.rebuttal.length / 10; // Length weight

    const lowerRebuttal = rebuttal.rebuttal.toLowerCase();
    substantiveKeywords.forEach(keyword => {
      if (lowerRebuttal.includes(keyword)) {
        score += 3;
      }
    });

    return score;
  }
}