/**
 * Synthesis Schema (Round 2)
 *
 * Validates artifacts from Round 2: Synthesis phase where the judge
 * identifies consensus points and tensions from Round 1 responses.
 */

import { SynthesisArtifact, ConsensusPoint, Tension } from '../../../types/consult';

export class SynthesisSchema {
  private static readonly SCHEMA_VERSION = '1.0';
  private static readonly REQUIRED_FIELDS = [
    'artifactType',
    'schemaVersion',
    'roundNumber',
    'consensusPoints',
    'tensions',
    'priorityOrder',
    'createdAt'
  ];

  /**
   * Validate a Synthesis artifact
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
    if (typeof artifact.artifactType !== 'string' || artifact.artifactType !== 'synthesis') {
      throw new Error(`Invalid artifactType: expected 'synthesis', got '${artifact.artifactType}'`);
    }

    if (typeof artifact.schemaVersion !== 'string') {
      throw new Error('schemaVersion must be a string');
    }

    if (typeof artifact.roundNumber !== 'number' || artifact.roundNumber !== 2) {
      throw new Error('roundNumber must be 2 for Synthesis artifacts');
    }

    // Validate consensusPoints
    if (!Array.isArray(artifact.consensusPoints)) {
      throw new Error('consensusPoints must be an array');
    }

    for (const point of artifact.consensusPoints) {
      this.validateConsensusPoint(point);
    }

    // Validate tensions
    if (!Array.isArray(artifact.tensions)) {
      throw new Error('tensions must be an array');
    }

    for (const tension of artifact.tensions) {
      this.validateTension(tension);
    }

    // Validate priorityOrder
    if (!Array.isArray(artifact.priorityOrder)) {
      throw new Error('priorityOrder must be an array');
    }

    if (!artifact.priorityOrder.every((item: any) => typeof item === 'string')) {
      throw new Error('All priorityOrder items must be strings');
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
   * Validate a ConsensusPoint
   */
  private static validateConsensusPoint(point: any): void {
    if (typeof point.point !== 'string' || point.point.length === 0) {
      throw new Error('ConsensusPoint.point must be a non-empty string');
    }

    if (!Array.isArray(point.supportingAgents)) {
      throw new Error('ConsensusPoint.supportingAgents must be an array');
    }

    if (!point.supportingAgents.every((a: any) => typeof a === 'string')) {
      throw new Error('All supportingAgents must be strings');
    }

    if (typeof point.confidence !== 'number' || point.confidence < 0 || point.confidence > 1) {
      throw new Error('ConsensusPoint.confidence must be a number between 0 and 1');
    }
  }

  /**
   * Validate a Tension
   */
  private static validateTension(tension: any): void {
    if (typeof tension.topic !== 'string' || tension.topic.length === 0) {
      throw new Error('Tension.topic must be a non-empty string');
    }

    if (!Array.isArray(tension.viewpoints)) {
      throw new Error('Tension.viewpoints must be an array');
    }

    if (tension.viewpoints.length < 2) {
      throw new Error('Tension must have at least 2 viewpoints');
    }

    for (const viewpoint of tension.viewpoints) {
      if (typeof viewpoint.agent !== 'string' || viewpoint.agent.length === 0) {
        throw new Error('Viewpoint.agent must be a non-empty string');
      }
      if (typeof viewpoint.viewpoint !== 'string' || viewpoint.viewpoint.length === 0) {
        throw new Error('Viewpoint.viewpoint must be a non-empty string');
      }
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
   * Create a new Synthesis artifact with defaults
   */
  public static create(params: {
    consensusPoints: ConsensusPoint[];
    tensions: Tension[];
    priorityOrder: string[];
  }): SynthesisArtifact {
    const artifact: SynthesisArtifact = {
      artifactType: 'synthesis',
      schemaVersion: this.SCHEMA_VERSION,
      roundNumber: 2,
      consensusPoints: params.consensusPoints,
      tensions: params.tensions,
      priorityOrder: params.priorityOrder,
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
