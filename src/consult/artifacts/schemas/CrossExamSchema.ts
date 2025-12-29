/**
 * Cross-Examination Schema (Round 3)
 *
 * Validates artifacts from Round 3: Cross-Examination phase where
 * the Judge agent synthesizes challenges and rebuttals.
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

    // Validate Challenges
    if (!Array.isArray(artifact.challenges)) {
      throw new Error('challenges must be an array');
    }
    artifact.challenges.forEach((c: any, index: number) => {
      this.validateChallenge(c, index);
    });

    // Validate Rebuttals
    if (!Array.isArray(artifact.rebuttals)) {
      throw new Error('rebuttals must be an array');
    }
    artifact.rebuttals.forEach((r: any, index: number) => {
      this.validateRebuttal(r, index);
    });

    // Validate Unresolved
    if (!Array.isArray(artifact.unresolved)) {
      throw new Error('unresolved must be an array');
    }
    if (!artifact.unresolved.every((u: any) => typeof u === 'string')) {
      throw new Error('All unresolved items must be strings');
    }

    if (typeof artifact.createdAt !== 'string') {
      throw new Error('createdAt must be an ISO 8601 timestamp string');
    }

    // Validate timestamp format (basic check)
    if (!this.isValidISO8601(artifact.createdAt)) {
      throw new Error('createdAt must be a valid ISO 8601 timestamp');
    }
  }

  private static validateChallenge(c: any, index: number): void {
    if (typeof c.challenger !== 'string' || c.challenger.length === 0) {
      throw new Error(`Challenge at index ${index} missing valid 'challenger' string`);
    }
    if (typeof c.targetAgent !== 'string' || c.targetAgent.length === 0) {
      throw new Error(`Challenge at index ${index} missing valid 'targetAgent' string`);
    }
    if (typeof c.challenge !== 'string' || c.challenge.length === 0) {
      throw new Error(`Challenge at index ${index} missing valid 'challenge' string`);
    }
    if (!Array.isArray(c.evidence) || !c.evidence.every((e: any) => typeof e === 'string')) {
      throw new Error(`Challenge at index ${index} must have 'evidence' string array`);
    }
  }

  private static validateRebuttal(r: any, index: number): void {
    if (typeof r.agent !== 'string' || r.agent.length === 0) {
      throw new Error(`Rebuttal at index ${index} missing valid 'agent' string`);
    }
    if (typeof r.rebuttal !== 'string' || r.rebuttal.length === 0) {
      throw new Error(`Rebuttal at index ${index} missing valid 'rebuttal' string`);
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