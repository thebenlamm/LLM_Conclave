/**
 * Cross-Examination Schema (Round 3)
 *
 * Validates artifacts from Round 3: Cross-Examination phase where
 * agents challenge each other's positions and provide rebuttals.
 */

import { CrossExamArtifact, Challenge, Rebuttal } from '../../../types/consult';

export class CrossExamSchema {
  private static readonly SCHEMA_VERSION = '1.0';
  private static readonly REQUIRED_FIELDS = [
    'artifactType',
    'schemaVersion',
    'roundNumber',
    'challenges',
    'rebuttals',
    'unresolved',
    'createdAt'
  ];

  /**
   * Validate a CrossExam artifact
   * @throws Error if validation fails
   */
  public static validate(artifact: any): void {
    // Check all required fields are present
    for (const field of this.REQUIRED_FIELDS) {
      if (!(field in artifact)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate field types
    if (typeof artifact.artifactType !== 'string' || artifact.artifactType !== 'cross_exam') {
      throw new Error(`Invalid artifactType: expected 'cross_exam', got '${artifact.artifactType}'`);
    }

    if (typeof artifact.schemaVersion !== 'string') {
      throw new Error('schemaVersion must be a string');
    }

    if (typeof artifact.roundNumber !== 'number' || artifact.roundNumber !== 3) {
      throw new Error('roundNumber must be 3 for CrossExam artifacts');
    }

    // Validate challenges
    if (!Array.isArray(artifact.challenges)) {
      throw new Error('challenges must be an array');
    }

    for (const challenge of artifact.challenges) {
      this.validateChallenge(challenge);
    }

    // Validate rebuttals
    if (!Array.isArray(artifact.rebuttals)) {
      throw new Error('rebuttals must be an array');
    }

    for (const rebuttal of artifact.rebuttals) {
      this.validateRebuttal(rebuttal);
    }

    // Validate unresolved
    if (!Array.isArray(artifact.unresolved)) {
      throw new Error('unresolved must be an array');
    }

    if (!artifact.unresolved.every((item: any) => typeof item === 'string')) {
      throw new Error('All unresolved items must be strings');
    }

    // Validate createdAt
    if (typeof artifact.createdAt !== 'string') {
      throw new Error('createdAt must be an ISO 8601 timestamp string');
    }

    if (!this.isValidISO8601(artifact.createdAt)) {
      throw new Error('createdAt must be a valid ISO 8601 timestamp');
    }
  }

  /**
   * Validate a Challenge
   */
  private static validateChallenge(challenge: any): void {
    if (typeof challenge.challenger !== 'string' || challenge.challenger.length === 0) {
      throw new Error('Challenge.challenger must be a non-empty string');
    }

    if (typeof challenge.targetAgent !== 'string' || challenge.targetAgent.length === 0) {
      throw new Error('Challenge.targetAgent must be a non-empty string');
    }

    if (typeof challenge.challenge !== 'string' || challenge.challenge.length === 0) {
      throw new Error('Challenge.challenge must be a non-empty string');
    }

    if (!Array.isArray(challenge.evidence)) {
      throw new Error('Challenge.evidence must be an array');
    }

    if (!challenge.evidence.every((e: any) => typeof e === 'string')) {
      throw new Error('All challenge.evidence items must be strings');
    }
  }

  /**
   * Validate a Rebuttal
   */
  private static validateRebuttal(rebuttal: any): void {
    if (typeof rebuttal.agent !== 'string' || rebuttal.agent.length === 0) {
      throw new Error('Rebuttal.agent must be a non-empty string');
    }

    if (typeof rebuttal.rebuttal !== 'string' || rebuttal.rebuttal.length === 0) {
      throw new Error('Rebuttal.rebuttal must be a non-empty string');
    }
  }

  /**
   * Check if a timestamp is valid ISO 8601 format
   */
  private static isValidISO8601(timestamp: string): boolean {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && timestamp.includes('T');
  }

  /**
   * Create a new CrossExam artifact with defaults
   */
  public static create(params: {
    challenges: Challenge[];
    rebuttals: Rebuttal[];
    unresolved: string[];
  }): CrossExamArtifact {
    const artifact: CrossExamArtifact = {
      artifactType: 'cross_exam',
      schemaVersion: this.SCHEMA_VERSION,
      roundNumber: 3,
      challenges: params.challenges,
      rebuttals: params.rebuttals,
      unresolved: params.unresolved,
      createdAt: new Date().toISOString()
    };

    // Validate before returning
    this.validate(artifact);

    return artifact;
  }

  /**
   * Get the schema version
   */
  public static getVersion(): string {
    return this.SCHEMA_VERSION;
  }
}
