/**
 * Verdict Schema (Round 4)
 *
 * Validates artifacts from Round 4: Verdict phase where
 * the Judge agent produces the final recommendation and confidence score.
 *
 * Mode-Aware Validation (Epic 4, Story 1):
 * - Converge mode: Enforces single recommendation (string)
 * - Explore mode: Allows multiple recommendations (array)
 */

import { VerdictArtifact, Dissent } from '../../../types/consult';

export type VerdictValidationMode = 'explore' | 'converge';

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
  // Explore mode uses 'recommendations' (array) instead of 'recommendation' (string)
  private static readonly EXPLORE_REQUIRED_FIELDS = [
    'artifactType',
    'schemaVersion',
    'roundNumber',
    'recommendations',
    'confidence',
    'createdAt'
  ];

  /**
   * Validate a Verdict artifact
   * @param artifact - The artifact to validate
   * @param mode - Validation mode: 'converge' (default) or 'explore'
   * @throws Error if validation fails
   */
  public static validate(artifact: any, mode: VerdictValidationMode = 'converge'): void {
    // Choose required fields based on mode
    const requiredFields = mode === 'explore' ? this.EXPLORE_REQUIRED_FIELDS : this.REQUIRED_FIELDS;

    // Check all required fields are present
    for (const field of requiredFields) {
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

    if (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }

    // Mode-specific validation (Epic 4, Story 1)
    if (mode === 'explore') {
      // Explore mode: multiple recommendations allowed
      if (!Array.isArray(artifact.recommendations)) {
        throw new Error('recommendations must be an array in explore mode');
      }
      if (artifact.recommendations.length === 0) {
        throw new Error('recommendations must contain at least one item in explore mode');
      }
      artifact.recommendations.forEach((rec: any, index: number) => {
        this.validateExploreRecommendation(rec, index);
      });
    } else {
      // Converge mode: single recommendation required
      if (typeof artifact.recommendation !== 'string' || artifact.recommendation.length === 0) {
        throw new Error('recommendation must be a non-empty string in converge mode');
      }

      // Validate Evidence (required for converge mode)
      if (!Array.isArray(artifact.evidence)) {
        throw new Error('evidence must be an array');
      }
      if (artifact.evidence.length === 0) {
        throw new Error('evidence must contain at least one item');
      }
      if (!artifact.evidence.every((e: any) => typeof e === 'string')) {
        throw new Error('All evidence items must be strings');
      }

      // Validate Dissent (required for converge mode)
      if (!Array.isArray(artifact.dissent)) {
        throw new Error('dissent must be an array');
      }
      artifact.dissent.forEach((d: any, index: number) => {
        this.validateDissent(d, index);
      });
    }

    // Validate optional _analysis field (Two-Step Output Pattern)
    if ('_analysis' in artifact && artifact._analysis !== undefined) {
      if (typeof artifact._analysis !== 'string') {
        throw new Error('_analysis must be a string if provided');
      }
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
   * Validate an explore mode recommendation object
   */
  private static validateExploreRecommendation(rec: any, index: number): void {
    if (typeof rec !== 'object' || rec === null) {
      throw new Error(`Recommendation at index ${index} must be an object`);
    }
    if (typeof rec.option !== 'string' || rec.option.length === 0) {
      throw new Error(`Recommendation at index ${index} missing valid 'option' string`);
    }
    if (typeof rec.description !== 'string' || rec.description.length === 0) {
      throw new Error(`Recommendation at index ${index} missing valid 'description' string`);
    }
    // pros and cons are optional but should be arrays if present
    if (rec.pros !== undefined && !Array.isArray(rec.pros)) {
      throw new Error(`Recommendation at index ${index}: 'pros' must be an array`);
    }
    if (rec.cons !== undefined && !Array.isArray(rec.cons)) {
      throw new Error(`Recommendation at index ${index}: 'cons' must be an array`);
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
    _analysis?: string;
  }): VerdictArtifact {
    const artifact: VerdictArtifact = {
      artifactType: 'verdict',
      schemaVersion: this.SCHEMA_VERSION,
      roundNumber: 4,
      recommendation: params.recommendation,
      confidence: params.confidence,
      evidence: params.evidence,
      dissent: params.dissent,
      createdAt: new Date().toISOString(),
      ...(params._analysis !== undefined && { _analysis: params._analysis })
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