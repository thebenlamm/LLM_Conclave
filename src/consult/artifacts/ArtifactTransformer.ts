/**
 * Artifact Transformer
 *
 * Converts between TypeScript (camelCase) and JSON (snake_case) formats
 * for all consultation artifacts.
 *
 * TypeScript uses camelCase for properties (e.g., agentId, roundNumber)
 * JSON uses snake_case for fields (e.g., agent_id, round_number)
 */

import {
  IndependentArtifact,
  SynthesisArtifact,
  CrossExamArtifact,
  VerdictArtifact,
  ConsensusPoint,
  Tension,
  Challenge,
  Rebuttal,
  Dissent
} from '../../types/consult';

export class ArtifactTransformer {
  // ============================================================================
  // Independent Artifact (Round 1)
  // ============================================================================

  /**
   * Convert Independent artifact to JSON (snake_case)
   */
  public static independentToJSON(artifact: IndependentArtifact): any {
    return {
      artifact_type: artifact.artifactType,
      schema_version: artifact.schemaVersion,
      agent_id: artifact.agentId,
      round_number: artifact.roundNumber,
      position: artifact.position,
      key_points: artifact.keyPoints,
      rationale: artifact.rationale,
      confidence: artifact.confidence,
      prose_excerpt: artifact.proseExcerpt,
      created_at: artifact.createdAt
    };
  }

  /**
   * Convert JSON (snake_case) to Independent artifact
   */
  public static independentFromJSON(json: any): IndependentArtifact {
    return {
      artifactType: json.artifact_type,
      schemaVersion: json.schema_version,
      agentId: json.agent_id,
      roundNumber: json.round_number,
      position: json.position,
      keyPoints: json.key_points,
      rationale: json.rationale,
      confidence: json.confidence,
      proseExcerpt: json.prose_excerpt,
      createdAt: json.created_at
    };
  }

  // ============================================================================
  // Synthesis Artifact (Round 2)
  // ============================================================================

  /**
   * Convert Synthesis artifact to JSON (snake_case)
   */
  public static synthesisToJSON(artifact: SynthesisArtifact): any {
    return {
      artifact_type: artifact.artifactType,
      schema_version: artifact.schemaVersion,
      round_number: artifact.roundNumber,
      consensus_points: artifact.consensusPoints.map(cp => this.consensusPointToJSON(cp)),
      tensions: artifact.tensions.map(t => this.tensionToJSON(t)),
      priority_order: artifact.priorityOrder,
      created_at: artifact.createdAt
    };
  }

  /**
   * Convert JSON (snake_case) to Synthesis artifact
   */
  public static synthesisFromJSON(json: any): SynthesisArtifact {
    return {
      artifactType: json.artifact_type,
      schemaVersion: json.schema_version,
      roundNumber: json.round_number,
      consensusPoints: json.consensus_points.map((cp: any) => this.consensusPointFromJSON(cp)),
      tensions: json.tensions.map((t: any) => this.tensionFromJSON(t)),
      priorityOrder: json.priority_order,
      createdAt: json.created_at
    };
  }

  /**
   * Convert ConsensusPoint to JSON
   */
  private static consensusPointToJSON(point: ConsensusPoint): any {
    return {
      point: point.point,
      supporting_agents: point.supportingAgents,
      confidence: point.confidence
    };
  }

  /**
   * Convert JSON to ConsensusPoint
   */
  private static consensusPointFromJSON(json: any): ConsensusPoint {
    return {
      point: json.point,
      supportingAgents: json.supporting_agents,
      confidence: json.confidence
    };
  }

  /**
   * Convert Tension to JSON
   */
  private static tensionToJSON(tension: Tension): any {
    return {
      topic: tension.topic,
      viewpoints: tension.viewpoints
    };
  }

  /**
   * Convert JSON to Tension
   */
  private static tensionFromJSON(json: any): Tension {
    return {
      topic: json.topic,
      viewpoints: json.viewpoints
    };
  }

  // ============================================================================
  // CrossExam Artifact (Round 3)
  // ============================================================================

  /**
   * Convert CrossExam artifact to JSON (snake_case)
   */
  public static crossExamToJSON(artifact: CrossExamArtifact): any {
    return {
      artifact_type: artifact.artifactType,
      schema_version: artifact.schemaVersion,
      round_number: artifact.roundNumber,
      challenges: artifact.challenges.map(c => this.challengeToJSON(c)),
      rebuttals: artifact.rebuttals.map(r => this.rebuttalToJSON(r)),
      unresolved: artifact.unresolved,
      created_at: artifact.createdAt
    };
  }

  /**
   * Convert JSON (snake_case) to CrossExam artifact
   */
  public static crossExamFromJSON(json: any): CrossExamArtifact {
    return {
      artifactType: json.artifact_type,
      schemaVersion: json.schema_version,
      roundNumber: json.round_number,
      challenges: json.challenges.map((c: any) => this.challengeFromJSON(c)),
      rebuttals: json.rebuttals.map((r: any) => this.rebuttalFromJSON(r)),
      unresolved: json.unresolved,
      createdAt: json.created_at
    };
  }

  /**
   * Convert Challenge to JSON
   */
  private static challengeToJSON(challenge: Challenge): any {
    return {
      challenger: challenge.challenger,
      target_agent: challenge.targetAgent,
      challenge: challenge.challenge,
      evidence: challenge.evidence
    };
  }

  /**
   * Convert JSON to Challenge
   */
  private static challengeFromJSON(json: any): Challenge {
    return {
      challenger: json.challenger,
      targetAgent: json.target_agent,
      challenge: json.challenge,
      evidence: json.evidence
    };
  }

  /**
   * Convert Rebuttal to JSON
   */
  private static rebuttalToJSON(rebuttal: Rebuttal): any {
    return {
      agent: rebuttal.agent,
      rebuttal: rebuttal.rebuttal
    };
  }

  /**
   * Convert JSON to Rebuttal
   */
  private static rebuttalFromJSON(json: any): Rebuttal {
    return {
      agent: json.agent,
      rebuttal: json.rebuttal
    };
  }

  // ============================================================================
  // Verdict Artifact (Round 4)
  // ============================================================================

  /**
   * Convert Verdict artifact to JSON (snake_case)
   */
  public static verdictToJSON(artifact: VerdictArtifact): any {
    return {
      artifact_type: artifact.artifactType,
      schema_version: artifact.schemaVersion,
      round_number: artifact.roundNumber,
      recommendation: artifact.recommendation,
      confidence: artifact.confidence,
      evidence: artifact.evidence,
      dissent: artifact.dissent.map(d => this.dissentToJSON(d)),
      created_at: artifact.createdAt
    };
  }

  /**
   * Convert JSON (snake_case) to Verdict artifact
   */
  public static verdictFromJSON(json: any): VerdictArtifact {
    return {
      artifactType: json.artifact_type,
      schemaVersion: json.schema_version,
      roundNumber: json.round_number,
      recommendation: json.recommendation,
      confidence: json.confidence,
      evidence: json.evidence,
      dissent: json.dissent.map((d: any) => this.dissentFromJSON(d)),
      createdAt: json.created_at
    };
  }

  /**
   * Convert Dissent to JSON
   */
  private static dissentToJSON(dissent: Dissent): any {
    return {
      agent: dissent.agent,
      concern: dissent.concern,
      severity: dissent.severity
    };
  }

  /**
   * Convert JSON to Dissent
   */
  private static dissentFromJSON(json: any): Dissent {
    return {
      agent: json.agent,
      concern: json.concern,
      severity: json.severity
    };
  }

  // ============================================================================
  // Consultation Result Transformer
  // ============================================================================

  /**
   * Convert ConsultationResult (camelCase) to JSON (snake_case)
   */
  public static consultationResultToJSON(result: import('../../types/consult').ConsultationResult): any {
    return {
      consultation_id: result.consultationId,
      timestamp: result.timestamp,
      question: result.question,
      context: result.context,
      mode: result.mode,
      context_sources: result.contextMetadata ? {
        files: result.contextMetadata.files,
        project_path: result.contextMetadata.projectPath,
        total_tokens_estimated: result.contextMetadata.totalTokensEstimated,
        file_count: result.contextMetadata.fileCount,
        project_summary_included: result.contextMetadata.projectSummaryIncluded,
        stdin: result.contextMetadata.stdinUsed,
        stdin_tokens_estimated: result.contextMetadata.stdinTokensEstimated
      } : undefined,
      project_context: result.projectContext
        ? {
            project_type: result.projectContext.projectType,
            framework_detected: result.projectContext.frameworkDetected,
            framework_version: result.projectContext.frameworkVersion,
            architecture_pattern: result.projectContext.architecturePattern,
            tech_stack: {
              state_management: result.projectContext.techStack.stateManagement,
              styling: result.projectContext.techStack.styling,
              testing: result.projectContext.techStack.testing,
              api: result.projectContext.techStack.api,
              database: result.projectContext.techStack.database,
              orm: result.projectContext.techStack.orm,
              cicd: result.projectContext.techStack.cicd
            },
            indicators_found: result.projectContext.indicatorsFound,
            documentation_used: result.projectContext.documentationUsed,
            bias_applied: result.projectContext.biasApplied
          }
        : undefined,
      agents: result.agents,
      agent_responses: result.agentResponses
        ? result.agentResponses.map(response => ({
            agent_id: response.agentId,
            agent_name: response.agentName,
            model: response.model,
            provider: response.provider,
            content: response.content,
            tokens: {
              input: response.tokens.input,
              output: response.tokens.output,
              total: response.tokens.total
            },
            duration_ms: response.durationMs,
            timestamp: response.timestamp,
            error: response.error
          }))
        : undefined,
      state: result.state,
      rounds: result.rounds,
      completed_rounds: result.completedRounds,
      responses: {
        round1: result.responses.round1 ? result.responses.round1.map(r => this.independentToJSON(r)) : [],
        round2: result.responses.round2 ? this.synthesisToJSON(result.responses.round2) : undefined,
        round3: result.responses.round3 ? this.crossExamToJSON(result.responses.round3) : undefined,
        round4: result.responses.round4 ? this.verdictToJSON(result.responses.round4) : undefined
      },
      consensus: result.consensus,
      confidence: result.confidence,
      recommendation: result.recommendation,
      reasoning: result.reasoning,
      concerns: result.concerns,
      dissent: result.dissent.map(d => this.dissentToJSON(d)),
      perspectives: result.perspectives,
      debate_value_analysis: result.debateValueAnalysis
        ? {
            agents_changed_position: result.debateValueAnalysis.agentsChangedPosition,
            total_agents: result.debateValueAnalysis.totalAgents,
            change_rate: result.debateValueAnalysis.changeRate,
            avg_confidence_increase: result.debateValueAnalysis.avgConfidenceIncrease,
            key_influencers: result.debateValueAnalysis.keyInfluencers,
            convergence_score: result.debateValueAnalysis.convergenceScore,
            semantic_comparison_cost: result.debateValueAnalysis.semanticComparisonCost,
            agent_analyses: result.debateValueAnalysis.agentAnalyses.map(analysis => ({
              agent_id: analysis.agentId,
              agent_name: analysis.agentName,
              round1_position: analysis.round1Position,
              round1_confidence: analysis.round1Confidence,
              round4_position: analysis.round4Position,
              round4_confidence: analysis.round4Confidence,
              position_changed: analysis.positionChanged,
              change_magnitude: analysis.changeMagnitude,
              confidence_delta: analysis.confidenceDelta,
              influenced_by: analysis.influencedBy,
              semantic_reasoning: analysis.semanticReasoning
            })),
            key_insights: result.debateValueAnalysis.keyInsights
          }
        : undefined,
      cost: result.cost,
      duration_ms: result.durationMs,
      prompt_versions: {
        mode: result.promptVersions.mode,
        independent_prompt_version: result.promptVersions.independentPromptVersion,
        synthesis_prompt_version: result.promptVersions.synthesisPromptVersion,
        cross_exam_prompt_version: result.promptVersions.crossExamPromptVersion,
        verdict_prompt_version: result.promptVersions.verdictPromptVersion
      },
      early_termination: result.earlyTermination,
      early_termination_reason: result.earlyTerminationReason,
      scrubbing_report: result.scrubbingReport
        ? {
            sensitive_data_scrubbed: result.scrubbingReport.sensitiveDataScrubbed,
            patterns_matched: result.scrubbingReport.patternsMatched,
            types_detected: result.scrubbingReport.typesDetected,
            details_by_type: result.scrubbingReport.detailsByType
          }
        : undefined,
      output_format: result.outputFormat,
      abort_reason: result.abortReason
    };
  }

  // ============================================================================
  // Generic Transformer
  // ============================================================================

  /**
   * Detect artifact type and convert to JSON
   */
  public static toJSON(artifact: IndependentArtifact | SynthesisArtifact | CrossExamArtifact | VerdictArtifact): any {
    switch (artifact.artifactType) {
      case 'independent':
        return this.independentToJSON(artifact as IndependentArtifact);
      case 'synthesis':
        return this.synthesisToJSON(artifact as SynthesisArtifact);
      case 'cross_exam':
        return this.crossExamToJSON(artifact as CrossExamArtifact);
      case 'verdict':
        return this.verdictToJSON(artifact as VerdictArtifact);
      default:
        throw new Error(`Unknown artifact type: ${(artifact as any).artifactType}`);
    }
  }

  /**
   * Detect artifact type and convert from JSON
   */
  public static fromJSON(json: any): IndependentArtifact | SynthesisArtifact | CrossExamArtifact | VerdictArtifact {
    const artifactType = json.artifact_type;

    switch (artifactType) {
      case 'independent':
        return this.independentFromJSON(json);
      case 'synthesis':
        return this.synthesisFromJSON(json);
      case 'cross_exam':
        return this.crossExamFromJSON(json);
      case 'verdict':
        return this.verdictFromJSON(json);
      default:
        throw new Error(`Unknown artifact type: ${artifactType}`);
    }
  }

  // ============================================================================
  // Helper: Generic camelCase to snake_case converter
  // ============================================================================

  /**
   * Convert a camelCase key to snake_case
   */
  public static camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert a snake_case key to camelCase
   */
  public static snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
