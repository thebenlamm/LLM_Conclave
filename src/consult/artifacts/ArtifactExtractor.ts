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
  /**
   * Extract an IndependentArtifact (Round 1) from an LLM response
   * @param responseText The raw text response from the LLM
   * @param agentId The ID of the agent that produced the response
   * @returns The validated IndependentArtifact
   * @throws Error if extraction or validation fails
   */
  public static extractIndependentArtifact(responseText: string, agentId: string): IndependentArtifact {
    const json = this.extractJSON(responseText);
    
    // Map JSON fields (snake_case from prompt) to TypeScript (camelCase)
    // The prompt requests snake_case, but our internal types are camelCase.
    // We handle the mapping here.
    
    // Note: If the LLM follows the prompt exactly, it returns snake_case.
    // We need to be robust to both.
    
    const position = json.position || json.position_statement;
    const keyPoints = json.key_points || json.keyPoints;
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
    const json = this.extractJSON(responseText);

    // Map snake_case to camelCase
    const consensusPoints = (json.consensus_points || json.consensusPoints || []).map((cp: any) => ({
      point: cp.point,
      supportingAgents: cp.supporting_agents || cp.supportingAgents,
      confidence: cp.confidence
    }));

    const tensions = (json.tensions || []).map((t: any) => ({
      topic: t.topic,
      viewpoints: (t.viewpoints || []).map((vp: any) => ({
        agent: vp.agent,
        viewpoint: vp.viewpoint
      }))
    }));

    const priorityOrder = json.priority_order || json.priorityOrder || [];

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
    const json = this.extractJSON(responseText);

    // Map snake_case to camelCase
    const challenges = (json.challenges || []).map((c: any) => ({
      challenger: c.challenger,
      targetAgent: c.target_agent || c.targetAgent,
      challenge: c.challenge,
      evidence: c.evidence || []
    }));

    const rebuttals = (json.rebuttals || []).map((r: any) => ({
      agent: r.agent,
      rebuttal: r.rebuttal
    }));

    const unresolved = json.unresolved || [];

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
    const json = this.extractJSON(responseText);

    const dissent = (json.dissent || []).map((d: any) => ({
      agent: d.agent,
      concern: d.concern,
      severity: d.severity
    }));

    return VerdictSchema.create({
      recommendation: json.recommendation,
      confidence: json.confidence,
      evidence: json.evidence || [],
      dissent
    });
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
