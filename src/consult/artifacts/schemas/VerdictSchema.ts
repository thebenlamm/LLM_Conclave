/**
 * Verdict Schema (Round 4)
 *
 * Validates artifacts from Round 4: Verdict phase where the judge
 * produces the final recommendation with confidence and dissent tracking.
 */

import { VerdictArtifact, Dissent } from '../../../types/consult';

export class VerdictSchema {
  private static readonly SCHEMA_VERSION = '1.0';
  private static readonly REQUIRED_FIELDS = [
    'artifactType',
    'schemaVersion',
    'roundNumber',
    'recommendation',
    'confidence',
    'evidence',
    'dissent',
    'createdAt'
  ];

  /**
   * Validate a Verdict artifact
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
    if (typeof artifact.artifactType !== 'string' || artifact.artifactType !== 'verdict') {
      throw new Error(`Invalid artifactType: expected 'verdict', got '${artifact.artifactType}'`);
    }

    if (typeof artifact.schemaVersion !== 'string') {
      throw new Error('schemaVersion must be a string');
    }

    if (typeof artifact.roundNumber !== 'number' || artifact.roundNumber !== 4) {
      throw new Error('roundNumber must be 4 for Verdict artifacts');
    }

    // Validate recommendation
    if (typeof artifact.recommendation !== 'string' || artifact.recommendation.length === 0) {
      throw new Error('recommendation must be a non-empty string');
    }

    // Validate confidence
    if (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }

    // Validate evidence
    if (!Array.isArray(artifact.evidence)) {
      throw new Error('evidence must be an array');
    }

    if (!artifact.evidence.every((e: any) => typeof e === 'string')) {
      throw new Error('All evidence items must be strings');
    }

    if (artifact.evidence.length === 0) {
      throw new Error('evidence must contain at least one item');
    }

    // Validate dissent
    if (!Array.isArray(artifact.dissent)) {
      throw new Error('dissent must be an array');
    }

    for (const diss of artifact.dissent) {
      this.validateDissent(diss);
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
   * Validate a Dissent
   */
  private static validateDissent(dissent: any): void {
    if (typeof dissent.agent !== 'string' || dissent.agent.length === 0) {
      throw new Error('Dissent.agent must be a non-empty string');
    }

    if (typeof dissent.concern !== 'string' || dissent.concern.length === 0) {
      throw new Error('Dissent.concern must be a non-empty string');
    }

    const validSeverities = ['high', 'medium', 'low'];
    if (typeof dissent.severity !== 'string' || !validSeverities.includes(dissent.severity)) {
      throw new Error(`Dissent.severity must be one of: ${validSeverities.join(', ')}`);
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
   * Create a new Verdict artifact with defaults
   */
  public static create(params: {
    recommendation: string;
    confidence: number;
    evidence: string[];
    dissent: Dissent[];
  }): VerdictArtifact {
    const artifact: VerdictArtifact = {
      artifactType: 'verdict',
      schemaVersion: this.SCHEMA_VERSION,
      roundNumber: 4,
      recommendation: params.recommendation,
      confidence: params.confidence,
      evidence: params.evidence,
      dissent: params.dissent,
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
