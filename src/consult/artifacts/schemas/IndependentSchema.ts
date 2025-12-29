/**
 * Independent Schema (Round 1)
 *
 * Validates artifacts from Round 1: Independent Analysis phase where
 * each agent provides their initial position independently.
 */

import { IndependentArtifact } from '../../../types/consult';

export class IndependentSchema {
  private static readonly SCHEMA_VERSION = '1.0';
  private static readonly REQUIRED_FIELDS = [
    'artifactType',
    'schemaVersion',
    'agentId',
    'roundNumber',
    'position',
    'keyPoints',
    'rationale',
    'confidence',
    'proseExcerpt',
    'createdAt'
  ];

  /**
   * Validate an Independent artifact
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
    if (typeof artifact.artifactType !== 'string' || artifact.artifactType !== 'independent') {
      throw new Error(`Invalid artifactType: expected 'independent', got '${artifact.artifactType}'`);
    }

    if (typeof artifact.schemaVersion !== 'string') {
      throw new Error('schemaVersion must be a string');
    }

    if (typeof artifact.agentId !== 'string' || artifact.agentId.length === 0) {
      throw new Error('agentId must be a non-empty string');
    }

    if (typeof artifact.roundNumber !== 'number' || artifact.roundNumber !== 1) {
      throw new Error('roundNumber must be 1 for Independent artifacts');
    }

    if (typeof artifact.position !== 'string' || artifact.position.length === 0) {
      throw new Error('position must be a non-empty string');
    }

    if (!Array.isArray(artifact.keyPoints)) {
      throw new Error('keyPoints must be an array');
    }

    if (artifact.keyPoints.length === 0) {
      throw new Error('keyPoints must contain at least one point');
    }

    if (!artifact.keyPoints.every((p: any) => typeof p === 'string')) {
      throw new Error('All keyPoints must be strings');
    }

    if (typeof artifact.rationale !== 'string' || artifact.rationale.length === 0) {
      throw new Error('rationale must be a non-empty string');
    }

    if (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }

    if (typeof artifact.proseExcerpt !== 'string') {
      throw new Error('proseExcerpt must be a string');
    }

    if (typeof artifact.createdAt !== 'string') {
      throw new Error('createdAt must be an ISO 8601 timestamp string');
    }

    // Validate timestamp format (basic check)
    if (!this.isValidISO8601(artifact.createdAt)) {
      throw new Error('createdAt must be a valid ISO 8601 timestamp');
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
   * Create a new Independent artifact with defaults
   */
  public static create(params: {
    agentId: string;
    position: string;
    keyPoints: string[];
    rationale: string;
    confidence: number;
    proseExcerpt: string;
  }): IndependentArtifact {
    const artifact: IndependentArtifact = {
      artifactType: 'independent',
      schemaVersion: this.SCHEMA_VERSION,
      agentId: params.agentId,
      roundNumber: 1,
      position: params.position,
      keyPoints: params.keyPoints,
      rationale: params.rationale,
      confidence: params.confidence,
      proseExcerpt: params.proseExcerpt,
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
