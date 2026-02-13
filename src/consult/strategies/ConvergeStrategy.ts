/**
 * ConvergeStrategy - Adversarial "No, Because..." reasoning mode
 *
 * Designed for decision-making and reaching definitive conclusions:
 * - Independent: Take a strong position, what's the best answer?
 * - Synthesis: Find disagreements, where do perspectives conflict?
 * - CrossExam: Challenge weak arguments, what's wrong with this position?
 * - Verdict: Provide ONE definitive recommendation with confidence score
 * - shouldTerminateEarly: Returns true when confidence >= threshold (configurable)
 */

import {
  ModeStrategy,
  StrategyPromptVersions,
  AgentInfo,
  ArtifactCollection,
  COMMON_JSON_INSTRUCTION
} from './ModeStrategy';
import {
  IndependentArtifact,
  SynthesisArtifact
} from '../../types/consult';

export class ConvergeStrategy implements ModeStrategy {
  readonly name: 'explore' | 'converge' = 'converge';

  readonly promptVersions: StrategyPromptVersions = {
    independent: 'v1.0',
    synthesis: 'v1.0',
    crossExam: 'v1.0',
    verdict: 'v1.0'
  };

  /** Configurable confidence threshold for early termination */
  private readonly confidenceThreshold: number;

  constructor(confidenceThreshold: number = 0.95) {
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Generate Round 1 prompt with strong position framing
   * Encourages definitive stances and clear recommendations
   */
  getIndependentPrompt(question: string, context: string): string {
    const contextSection = context ? `\n### Context:\n${context}\n` : '';

    return `You are participating in a rigorous multi-model consultation.
Your goal is to take a strong position and defend it with evidence.

### Question:
${question}
${contextSection}
### Instructions:
Take a strong position. What's the best answer to this question?
Be decisive. Avoid hedging or listing multiple options.
Support your position with clear reasoning and evidence.

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "position": "Your definitive answer (1-2 sentences)",
  "key_points": ["Key argument 1", "Key argument 2", "Key argument 3"],
  "rationale": "Detailed defense of your position (2-3 paragraphs)",
  "confidence": 0.0-1.0 (how certain you are this is the right answer),
  "prose_excerpt": "A quote-worthy summary of your stance"
}`;
  }

  /**
   * Generate Round 2 prompt emphasizing disagreements and conflicts
   */
  getSynthesisPrompt(round1Artifacts: IndependentArtifact[]): string {
    const perspectives = round1Artifacts.map(a => `
### Agent: ${a.agentId}
**Position:** ${a.position}
**Key Points:**
${a.keyPoints.map(kp => `- ${kp}`).join('\n')}
**Rationale:** ${a.rationale}
**Confidence:** ${a.confidence}
`).join('\n---\n');

    return `You are the Consensus Judge in a rigorous multi-model consultation.

Your goal is to synthesize perspectives, focusing on areas of conflict and disagreement.
Find disagreements. Where do perspectives conflict? What are the key tensions?

### Expert Perspectives:
${perspectives}

### Instructions:
1. **Identify Strong Consensus**: What do experts clearly agree on?
2. **Find Disagreements**: Where do positions conflict? What's at stake?
3. **Assess Strength**: Which arguments are weakest? Strongest?
4. **Rank Priorities**: What matters most for making a decision?

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "consensus_points": [
    {
      "point": "Statement of agreement",
      "supporting_agents": ["Agent Name 1", "Agent Name 2"],
      "confidence": 0.0-1.0 (how strong is this consensus?)
    }
  ],
  "tensions": [
    {
      "topic": "Area of disagreement or conflict",
      "viewpoints": [
        { "agent": "Agent Name 1", "viewpoint": "Summary of their view" },
        { "agent": "Agent Name 2", "viewpoint": "Summary of their view" }
      ]
    }
  ],
  "priority_order": ["Most important topic", "Second topic", "Third topic"]
}`;
  }

  /**
   * Generate Round 3 prompt emphasizing challenging weak arguments
   */
  getCrossExamPrompt(agent: AgentInfo, synthesis: SynthesisArtifact): string {
    const consensusText = synthesis.consensusPoints
      .map(cp => `- ${cp.point} (Confidence: ${cp.confidence})`)
      .join('\n');

    const tensionsText = synthesis.tensions
      .map(t => `- ${t.topic}: ${t.viewpoints.map(v => `${v.agent}: ${v.viewpoint}`).join(' vs ')}`)
      .join('\n');

    return `You are ${agent.name} in a rigorous multi-model consultation.

Your role: Challenge weak arguments. Find flaws. Defend your position.

### Current Consensus (Round 2):
${consensusText || 'No consensus points identified yet.'}

### Identified Tensions:
${tensionsText || 'No significant tensions identified.'}

### Instructions:
1. **Challenge Weak Arguments**: What's wrong with the opposing positions?
2. **Defend Your Position**: If your view was challenged, rebut it.
3. **Expose Flaws**: What are others missing or getting wrong?
4. **Strengthen Your Case**: Add evidence that supports your stance.

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "critique": "Your critique of the current consensus or opposing views",
  "challenges": [
    {
      "target_agent": "Agent Name (or 'Consensus')",
      "challenge_point": "Specific argument you are challenging",
      "evidence": "Why they are wrong (based on your expertise)"
    }
  ],
  "defense": "Defense of your position against identified tensions (if applicable)",
  "revised_position": "Your position after considering others' views (may be strengthened or refined)"
}`;
  }

  /**
   * Generate Round 3 Synthesis prompt for Judge
   */
  getCrossExamSynthesisPrompt(agentResponses: any[], synthesis: SynthesisArtifact): string {
    // Format agent responses for the judge
    const responsesText = agentResponses.map(r => {
      let content = r.content;
      try {
        const json = JSON.parse(r.content);
        content = `
**Critique:** ${json.critique}
**Challenges:** ${JSON.stringify(json.challenges)}
**Defense:** ${json.defense}
**Revised Position:** ${json.revised_position}
`;
      } catch (e) {
        // Fallback for malformed JSON
      }
      return `### Agent: ${r.agentName}\n${content}`;
    }).join('\n---\n');

    return `You are the Debate Judge.
Review the challenges and defenses from the Cross-Examination round.

### Previous Consensus:
${JSON.stringify(synthesis.consensusPoints)}

### Agent Cross-Examination Responses:
${responsesText}

### Instructions:
1. Extract **Challenges**: Who successfully challenged whom?
2. Extract **Rebuttals**: Who defended their position well?
3. Identify **Unresolved Tensions**: What disagreements remain significant?

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "challenges": [
    {
      "challenger": "Agent Name",
      "target_agent": "Agent Name",
      "challenge": "The core challenge point",
      "evidence": ["Evidence 1", "Evidence 2"]
    }
  ],
  "rebuttals": [
    {
      "agent": "Agent Name",
      "rebuttal": "The defense provided"
    }
  ],
  "unresolved": ["Tension 1", "Tension 2"]
}`;
  }

  /**
   * Generate Round 4 prompt enforcing ONE definitive recommendation
   */
  getVerdictPrompt(allArtifacts: ArtifactCollection): string {
    const r1Summary = allArtifacts.round1
      .map(a => `- ${a.agentId}: ${a.position} (Confidence: ${a.confidence})`)
      .join('\n');

    const r2Summary = allArtifacts.round2
      ? allArtifacts.round2.consensusPoints
          .map(cp => `- ${cp.point}`)
          .join('\n')
      : 'No synthesis available.';

    let r3Summary = 'No cross-examination conducted.';
    if (allArtifacts.round3) {
      const challenges = allArtifacts.round3.challenges
        .map(c => `- ${c.challenger} → ${c.targetAgent}: ${c.challenge}`)
        .join('\n');
      const rebuttals = allArtifacts.round3.rebuttals
        .map(r => `- ${r.agent}: ${r.rebuttal}`)
        .join('\n');
      const unresolved = allArtifacts.round3.unresolved.join(', ');

      r3Summary = `
**Challenges:**
${challenges || 'None'}

**Rebuttals:**
${rebuttals || 'None'}

**Unresolved Issues:**
${unresolved || 'None'}`;
    }

    return `You are the Final Judge in a high-stakes multi-model consultation.

Your goal: Issue ONE definitive recommendation. Be decisive.
Do NOT present multiple options. Pick the best answer.

### The Debate Record:

**Positions (Round 1):**
${r1Summary}

**Consensus (Round 2):**
${r2Summary}

**Cross-Examination (Round 3):**
${r3Summary}

### Instructions:
1. **Weigh the Evidence**: Prioritize points that survived cross-examination.
2. **Make a Decision**: Provide ONE clear, actionable recommendation.
3. **Assess Confidence**:
   - High (>0.9): Strong consensus, no unresolved issues.
   - Medium (0.7-0.9): General agreement but some minor dissent.
   - Low (<0.7): Major unresolved tensions or significant dissent.
4. **Document Dissent**: Explicitly list who disagrees and why.

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "_analysis": "Step-by-step reasoning about the evidence before committing to verdict. Weigh each agent's arguments, note which survived cross-examination, and explain your reasoning process.",
  "recommendation": "The final authoritative answer (single, definitive recommendation)",
  "confidence": 0.0-1.0,
  "evidence": ["Key supporting point 1", "Key supporting point 2 (survived challenge)"],
  "dissent": [
    {
      "agent": "Agent Name",
      "concern": "Why they disagree",
      "severity": "high/medium/low"
    }
  ]
}

Fill the "_analysis" field FIRST with your detailed reasoning. Then provide your recommendation based on that analysis.`;
  }

  /**
   * Converge mode can terminate early when high confidence is reached
   *
   * @param confidence - Current consensus confidence (0.0-1.0)
   * @param roundNumber - Current round number (1-4)
   * @returns true if confidence >= threshold AND at least 2 rounds completed
   */
  shouldTerminateEarly(confidence: number, roundNumber: number): boolean {
    // Need at least 2 rounds (Independent + Synthesis) before early termination
    if (roundNumber < 2) {
      return false;
    }

    return confidence >= this.confidenceThreshold;
  }
}
