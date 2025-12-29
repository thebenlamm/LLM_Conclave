/**
 * Verdict Schema (Round 4)
 *
 * Validates artifacts from Round 4: Verdict phase where
 * the Judge agent produces the final recommendation and confidence score.
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

    if (typeof artifact.recommendation !== 'string' || artifact.recommendation.length === 0) {
      throw new Error('recommendation must be a non-empty string');
    }

    if (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }

    // Validate Evidence
    if (!Array.isArray(artifact.evidence)) {
      throw new Error('evidence must be an array');
    }
    if (artifact.evidence.length === 0) {
      throw new Error('evidence must contain at least one item');
    }
    if (!artifact.evidence.every((e: any) => typeof e === 'string')) {
      throw new Error('All evidence items must be strings');
    }

    // Validate Dissent
    if (!Array.isArray(artifact.dissent)) {
      throw new Error('dissent must be an array');
    }
    artifact.dissent.forEach((d: any, index: number) => {
      this.validateDissent(d, index);
    });

    if (typeof artifact.createdAt !== 'string') {
      throw new Error('createdAt must be an ISO 8601 timestamp string');
    }

    // Validate timestamp format (basic check)
    if (!this.isValidISO8601(artifact.createdAt)) {
      throw new Error('createdAt must be a valid ISO 8601 timestamp');
    }
  }

  private static validateDissent(d: any, index: number): void {
    if (typeof d.agent !== 'string' || d.agent.length === 0) {
      throw new Error(`Dissent at index ${index} missing valid 'agent' string`);
    }
    if (typeof d.concern !== 'string' || d.concern.length === 0) {
      throw new Error(`Dissent at index ${index} missing valid 'concern' string`);
    }
    if (!['high', 'medium', 'low'].includes(d.severity)) {
      throw new Error(`Dissent at index ${index} has invalid severity: '${d.severity}'. Must be high, medium, or low.`);
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