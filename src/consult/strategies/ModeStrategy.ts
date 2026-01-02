/**
 * ModeStrategy Interface
 *
 * Defines the contract for consultation mode strategies (Explore vs Converge).
 * Implements the Strategy Pattern for pluggable reasoning modes.
 *
 * @see Architectural Decision #3: Mode Switching - Behavior Strategy Pattern
 */

import {
  IndependentArtifact,
  SynthesisArtifact,
  CrossExamArtifact
} from '../../types/consult';

/**
 * Prompt version tracking for each strategy
 * Used for logging and reproducibility
 */
export interface StrategyPromptVersions {
  independent: string;
  synthesis: string;
  crossExam: string;
  verdict: string;
}

/**
 * Agent information passed to strategy methods
 */
export interface AgentInfo {
  name: string;
  model: string;
}

/**
 * Collection of all round artifacts for verdict generation
 */
export interface ArtifactCollection {
  round1: IndependentArtifact[];
  round2?: SynthesisArtifact;
  round3?: CrossExamArtifact;
}

/**
 * ModeStrategy Interface
 *
 * Implementations determine how prompts are framed and when to terminate early.
 * - ExploreStrategy: Divergent "Yes, And..." framing for brainstorming
 * - ConvergeStrategy: Adversarial "No, Because..." framing for decision-making
 */
export interface ModeStrategy {
  /**
   * Strategy name identifier
   */
  readonly name: 'explore' | 'converge';

  /**
   * Prompt versions for logging and reproducibility
   */
  readonly promptVersions: StrategyPromptVersions;

  /**
   * Generate Round 1 (Independent Analysis) prompt
   *
   * @param question - The user's question
   * @param context - Optional context (files, project info)
   * @returns Formatted prompt string
   */
  getIndependentPrompt(question: string, context: string): string;

  /**
   * Generate Round 2 (Synthesis) prompt
   *
   * @param round1Artifacts - Array of independent analysis artifacts from Round 1
   * @returns Formatted prompt string for Judge synthesis
   */
  getSynthesisPrompt(round1Artifacts: IndependentArtifact[]): string;

  /**
   * Generate Round 3 (Cross-Examination) prompt
   *
   * @param agent - Agent info (name, model) for the cross-examiner
   * @param synthesis - Synthesis artifact from Round 2
   * @returns Formatted prompt string for agent cross-examination
   */
  getCrossExamPrompt(agent: AgentInfo, synthesis: SynthesisArtifact): string;

  /**
   * Generate Round 3 (Cross-Examination Synthesis) prompt for Judge
   *
   * @param agentResponses - Array of agent responses from cross-exam
   * @param synthesis - Previous synthesis artifact
   * @returns Formatted prompt string for Judge synthesis
   */
  getCrossExamSynthesisPrompt(agentResponses: any[], synthesis: SynthesisArtifact): string;

  /**
   * Generate Round 4 (Verdict) prompt
   *
   * @param allArtifacts - Collection of all round artifacts
   * @returns Formatted prompt string for final verdict
   */
  getVerdictPrompt(allArtifacts: ArtifactCollection): string;

  /**
   * Determine if consultation should terminate early
   *
   * @param confidence - Current consensus confidence (0.0-1.0)
   * @param roundNumber - Current round number (1-4)
   * @returns true if consultation should terminate, false to continue
   */
  shouldTerminateEarly(confidence: number, roundNumber: number): boolean;
}

/**
 * Common JSON instruction for structured artifact extraction
 * Shared across both strategies
 */
export const COMMON_JSON_INSTRUCTION = `
IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.`;
