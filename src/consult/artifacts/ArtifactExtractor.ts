/**
 * Artifact Extractor
 *
 * Extracts structured artifacts from LLM responses.
 * Handles parsing of JSON blocks embedded in Markdown.
 */

import { IndependentArtifact, SynthesisArtifact, CrossExamArtifact, VerdictArtifact } from '../../types/consult';
import { IndependentSchema } from './schemas/IndependentSchema';
import { SynthesisSchema } from './schemas/SynthesisSchema';
import { CrossExamSchema } from './schemas/CrossExamSchema';
import { VerdictSchema } from './schemas/VerdictSchema';

export class ArtifactExtractor {
  private static ensureRecord(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Parsed artifact must be a JSON object');
    }
    return value as Record<string, any>;
  }

  private static ensureArray(value: unknown, fieldName: string): any[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error(`Field '${fieldName}' must be an array`);
    }
    return value;
  }

  private static ensureStringArray(value: unknown, fieldName: string): string[] {
    const arr = this.ensureArray(value, fieldName);
    if (!arr.every(item => typeof item === 'string')) {
      throw new Error(`Field '${fieldName}' must be an array of strings`);
    }
    return arr as string[];
  }

  /**
   * Extract an IndependentArtifact (Round 1) from an LLM response
   * @param responseText The raw text response from the LLM
   * @param agentId The ID of the agent that produced the response
   * @returns The validated IndependentArtifact
   * @throws Error if extraction or validation fails
   */
  public static extractIndependentArtifact(responseText: string, agentId: string): IndependentArtifact {
    const json = this.ensureRecord(this.extractJSON(responseText));
    
    // Map JSON fields (snake_case from prompt) to TypeScript (camelCase)
    // The prompt requests snake_case, but our internal types are camelCase.
    // We handle the mapping here.
    
    // Note: If the LLM follows the prompt exactly, it returns snake_case.
    // We need to be robust to both.
    
    const position = json.position || json.position_statement;
    const keyPoints = this.ensureStringArray(json.key_points ?? json.keyPoints, 'key_points');
    const rationale = json.rationale;
    const confidence = json.confidence;
    const proseExcerpt = json.prose_excerpt || json.proseExcerpt || ''; // Optional in some prompts, but required by schema

    if (!position || !keyPoints || !rationale || confidence === undefined) {
       throw new Error(`Response missing required fields. Got keys: ${Object.keys(json).join(', ')}`);
    }

    return IndependentSchema.create({
      agentId,
      position,
      keyPoints,
      rationale,
      confidence,
      proseExcerpt
    });
  }

  /**
   * Extract a SynthesisArtifact (Round 2) from an LLM response
   * @param responseText The raw text response from the LLM
   * @returns The validated SynthesisArtifact
   * @throws Error if extraction or validation fails
   */
  public static extractSynthesisArtifact(responseText: string): SynthesisArtifact {
    const json = this.ensureRecord(this.extractJSON(responseText));

    // Map snake_case to camelCase
    const consensusPointsRaw = this.ensureArray(json.consensus_points ?? json.consensusPoints, 'consensus_points');
    const consensusPoints = consensusPointsRaw.map((cp: any) => ({
      point: cp.point,
      supportingAgents: this.ensureStringArray(cp.supporting_agents ?? cp.supportingAgents, 'supporting_agents'),
      confidence: cp.confidence
    }));

    const tensionsRaw = this.ensureArray(json.tensions, 'tensions');
    const tensions = tensionsRaw.map((t: any) => ({
      topic: t.topic,
      viewpoints: this.ensureArray(t.viewpoints, 'viewpoints').map((vp: any) => ({
        agent: vp.agent,
        viewpoint: vp.viewpoint
      }))
    }));

    const priorityOrder = this.ensureStringArray(json.priority_order ?? json.priorityOrder, 'priority_order');

    return SynthesisSchema.create({
      consensusPoints,
      tensions,
      priorityOrder
    });
  }

  /**
   * Extract a CrossExamArtifact (Round 3) from an LLM response
   * @param responseText The raw text response from the LLM
   * @returns The validated CrossExamArtifact
   * @throws Error if extraction or validation fails
   */
  public static extractCrossExamArtifact(responseText: string): CrossExamArtifact {
    const json = this.ensureRecord(this.extractJSON(responseText));

    // Map snake_case to camelCase
    const challengesRaw = this.ensureArray(json.challenges, 'challenges');
    const challenges = challengesRaw.map((c: any) => ({
      challenger: c.challenger,
      targetAgent: c.target_agent || c.targetAgent,
      challenge: c.challenge,
      evidence: this.ensureStringArray(c.evidence ?? [], 'evidence')
    }));

    const rebuttalsRaw = this.ensureArray(json.rebuttals, 'rebuttals');
    const rebuttals = rebuttalsRaw.map((r: any) => ({
      agent: r.agent,
      rebuttal: r.rebuttal
    }));

    const unresolved = this.ensureStringArray(json.unresolved, 'unresolved');

    return CrossExamSchema.create({
      challenges,
      rebuttals,
      unresolved
    });
  }

  /**
   * Extract a VerdictArtifact (Round 4) from an LLM response
   * @param responseText The raw text response from the LLM
   * @returns The validated VerdictArtifact
   * @throws Error if extraction or validation fails
   */
  public static extractVerdictArtifact(responseText: string): VerdictArtifact {
    return this.extractVerdictArtifactWithMode(responseText, 'converge');
  }

  public static extractVerdictArtifactWithMode(
    responseText: string,
    mode: 'explore' | 'converge' = 'converge'
  ): VerdictArtifact {
    const json = this.ensureRecord(this.extractJSON(responseText));

    const dissentRaw = this.ensureArray(json.dissent, 'dissent');
    const dissent = dissentRaw.map((d: any) => ({
      agent: d.agent,
      concern: d.concern,
      severity: d.severity
    }));

    const evidence = this.ensureStringArray(json.evidence ?? [], 'evidence');
    const recommendations = this.ensureArray(json.recommendations, 'recommendations');

    const recommendation =
      typeof json.recommendation === 'string' && json.recommendation.length > 0
        ? json.recommendation
        : typeof json.summary === 'string' && json.summary.length > 0
          ? json.summary
          : recommendations[0]?.option || 'See recommendations';

    const artifact: VerdictArtifact = {
      artifactType: 'verdict',
      schemaVersion: VerdictSchema.getVersion(),
      roundNumber: 4,
      recommendation,
      confidence: json.confidence,
      evidence,
      dissent,
      createdAt: new Date().toISOString(),
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      synergies: this.ensureStringArray(json.synergies ?? [], 'synergies'),
      summary: typeof json.summary === 'string' ? json.summary : undefined,
      _analysis: typeof json._analysis === 'string' ? json._analysis : undefined
    };

    VerdictSchema.validate(artifact, mode);

    return artifact;
  }

  /**
   * Extract JSON object from a string that might contain Markdown
   */
  private static extractJSON(text: string): any {
    if (!text) return {};

    // Try to find JSON block wrapped in ```json ... ```
    const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    
    let jsonText = text;
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1];
    } else {
      // If no code block, try to find the first '{' and last '}'
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = text.substring(firstBrace, lastBrace + 1);
      }
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Failed to parse JSON artifact: ${(error as Error).message}`);
    }
  }
}
