/**
 * Synthesis Schema (Round 2)
 *
 * Validates artifacts from Round 2: Synthesis phase where
 * the Judge agent synthesizes consensus and tensions from independent positions.
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

    // Validate Consensus Points
    if (!Array.isArray(artifact.consensusPoints)) {
      throw new Error('consensusPoints must be an array');
    }
    artifact.consensusPoints.forEach((cp: any, index: number) => {
      this.validateConsensusPoint(cp, index);
    });

    // Validate Tensions
    if (!Array.isArray(artifact.tensions)) {
      throw new Error('tensions must be an array');
    }
    artifact.tensions.forEach((t: any, index: number) => {
      this.validateTension(t, index);
    });

    // Validate Priority Order
    if (!Array.isArray(artifact.priorityOrder)) {
      throw new Error('priorityOrder must be an array');
    }
    if (!artifact.priorityOrder.every((p: any) => typeof p === 'string')) {
      throw new Error('All priorityOrder items must be strings');
    }

    if (typeof artifact.createdAt !== 'string') {
      throw new Error('createdAt must be an ISO 8601 timestamp string');
    }

    // Validate timestamp format (basic check)
    if (!this.isValidISO8601(artifact.createdAt)) {
      throw new Error('createdAt must be a valid ISO 8601 timestamp');
    }
  }

  private static validateConsensusPoint(cp: any, index: number): void {
    if (typeof cp.point !== 'string' || cp.point.length === 0) {
      throw new Error(`Consensus point at index ${index} missing valid 'point' string`);
    }
    if (!Array.isArray(cp.supportingAgents) || !cp.supportingAgents.every((s: any) => typeof s === 'string')) {
      throw new Error(`Consensus point at index ${index} must have 'supportingAgents' string array`);
    }
    if (typeof cp.confidence !== 'number' || cp.confidence < 0 || cp.confidence > 1) {
      throw new Error('ConsensusPoint.confidence must be a number between 0 and 1');
    }
  }

  private static validateTension(t: any, index: number): void {
    if (typeof t.topic !== 'string' || t.topic.length === 0) {
      throw new Error(`Tension at index ${index} missing valid 'topic' string`);
    }
    if (!Array.isArray(t.viewpoints)) {
      throw new Error(`Tension at index ${index} must have 'viewpoints' array`);
    }
    if (t.viewpoints.length < 2) {
      throw new Error('Tension must have at least 2 viewpoints');
    }
    t.viewpoints.forEach((vp: any, vpIndex: number) => {
      if (typeof vp.agent !== 'string' || typeof vp.viewpoint !== 'string') {
        throw new Error(`Tension at index ${index}, viewpoint ${vpIndex} invalid: must have 'agent' and 'viewpoint' strings`);
      }
    });
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
