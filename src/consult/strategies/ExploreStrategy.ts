/**
 * ExploreStrategy - Divergent "Yes, And..." reasoning mode
 *
 * Designed for brainstorming and idea generation:
 * - Independent: Generate diverse perspectives and possibilities
 * - Synthesis: Find common themes AND preserve unique insights
 * - CrossExam: Build on ideas, expand the solution space
 * - Verdict: Present a menu of valid options with trade-offs
 * - shouldTerminateEarly: Always false (exploration needs all rounds)
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

export class ExploreStrategy implements ModeStrategy {
  readonly name: 'explore' | 'converge' = 'explore';

  readonly promptVersions: StrategyPromptVersions = {
    independent: 'v1.0',
    synthesis: 'v1.0',
    crossExam: 'v1.0',
    verdict: 'v1.0'
  };

  /**
   * Generate Round 1 prompt with divergent framing
   * Encourages breadth, creativity, and diverse perspectives
   */
  getIndependentPrompt(question: string, context: string): string {
    const contextSection = context ? `\n### Context:\n${context}\n` : '';

    return `You are participating in a collaborative exploration session.
Your goal is to generate diverse perspectives and explore possibilities.

### Question:
${question}
${contextSection}
### Instructions:
Think expansively. What are all the different angles, approaches, or solutions?
Consider unconventional ideas alongside practical ones.
Generate diverse perspectives. What possibilities do you see?

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "position": "Your unique perspective or approach (1-2 sentences)",
  "key_points": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "rationale": "Explanation of your perspective and why it's valuable (2-3 paragraphs)",
  "confidence": 0.0-1.0 (how strongly you believe in this approach),
  "prose_excerpt": "A compelling summary of your perspective"
}`;
  }

  /**
   * Generate Round 2 prompt emphasizing theme discovery AND preserving uniqueness
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

    return `You are the Synthesis Facilitator in a collaborative exploration.

Your goal is to map the landscape of ideas while preserving what makes each unique.
Find common themes AND preserve unique insights. Both are valuable.

### Expert Perspectives:
${perspectives}

### Instructions:
1. **Identify Common Themes**: What patterns emerge across perspectives?
2. **Preserve Unique Insights**: What novel ideas should NOT be lost in synthesis?
3. **Map Complementary Approaches**: How might different ideas work together?
4. **Note Tensions**: Where do approaches differ in interesting ways?

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "consensus_points": [
    {
      "point": "Theme or pattern across perspectives",
      "supporting_agents": ["Agent Name 1", "Agent Name 2"],
      "confidence": 0.0-1.0
    }
  ],
  "tensions": [
    {
      "topic": "Area where approaches differ",
      "viewpoints": [
        { "agent": "Agent Name", "viewpoint": "Their unique approach" }
      ]
    }
  ],
  "priority_order": ["Theme 1", "Theme 2", "Theme 3"]
}`;
  }

  /**
   * Generate Round 3 prompt emphasizing building on ideas
   */
  getCrossExamPrompt(agent: AgentInfo, synthesis: SynthesisArtifact): string {
    const consensusText = synthesis.consensusPoints
      .map(cp => `- ${cp.point} (Confidence: ${cp.confidence})`)
      .join('\n');

    const tensionsText = synthesis.tensions
      .map(t => `- ${t.topic}: ${t.viewpoints.map(v => `${v.agent}: ${v.viewpoint}`).join(' | ')}`)
      .join('\n');

    return `You are ${agent.name} in a collaborative exploration session.

Your role: Build on the emerging synthesis. Add value, don't just critique.

### Current Themes (Round 2):
${consensusText || 'No consensus points identified yet.'}

### Areas of Difference:
${tensionsText || 'No significant tensions identified.'}

### Instructions:
1. **Build on Ideas**: What else should we consider? How can you extend these themes?
2. **Bridge Differences**: Can you find ways to combine different approaches?
3. **Add New Angles**: What perspectives haven't been fully explored?
4. **Strengthen the Whole**: How can the overall exploration be more valuable?

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "extensions": ["New angle or insight to add"],
  "bridges": ["Way to combine different approaches"],
  "gaps": ["Unexplored areas worth considering"],
  "refined_position": "Your evolved perspective after seeing others' ideas"
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
        // Explore mode specific fields
        content = `
**Extensions:** ${JSON.stringify(json.extensions)}
**Bridges:** ${JSON.stringify(json.bridges)}
**Gaps:** ${JSON.stringify(json.gaps)}
**Refined Position:** ${json.refined_position}
`;
      } catch (e) {
        // Fallback for malformed JSON
      }
      return `### Agent: ${r.agentName}\n${content}`;
    }).join('\n---\n');

    return `You are the Exploration Facilitator.
Review the extensions and bridges from the Collaborative Exploration round.

### Previous Themes:
${JSON.stringify(synthesis.consensusPoints)}

### Agent Extensions:
${responsesText}

### Instructions:
1. **Identify Synergies**: How do the new extensions fit with previous themes?
2. **Map Unresolved Areas**: what gaps still remain?
3. **Synthesize Bridges**: How were differences reconciled?

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "challenges": [
    {
      "challenger": "Agent Name",
      "target_agent": "Consensus",
      "challenge": "Extension or new angle provided",
      "evidence": ["Evidence 1"]
    }
  ],
  "rebuttals": [
    {
      "agent": "Agent Name",
      "rebuttal": "Bridge or reconciliation provided"
    }
  ],
  "unresolved": ["Remaining gap 1", "Remaining gap 2"]
}`;
  }

  /**
   * Generate Round 4 prompt emphasizing menu of options with trade-offs
   */
  getVerdictPrompt(allArtifacts: ArtifactCollection): string {
    const r1Summary = allArtifacts.round1
      .map(a => `- ${a.agentId}: ${a.position}`)
      .join('\n');

    const r2Summary = allArtifacts.round2
      ? allArtifacts.round2.consensusPoints
          .map(cp => `- ${cp.point}`)
          .join('\n')
      : 'No synthesis available.';

    const r3Summary = allArtifacts.round3
      ? `Challenges: ${allArtifacts.round3.challenges.length}, Unresolved: ${allArtifacts.round3.unresolved.join(', ')}`
      : 'No cross-examination conducted.';

    return `You are the Final Facilitator in a collaborative exploration.

Your goal: Present a menu of valid options with clear trade-offs.
Do NOT pick a single winner. Preserve optionality for the user.

### Exploration Summary:

**Perspectives (Round 1):**
${r1Summary}

**Themes Identified (Round 2):**
${r2Summary}

**Extensions (Round 3):**
${r3Summary}

### Instructions:
1. **List Options**: Present 2-4 distinct valid approaches
2. **Explain Trade-offs**: What are the pros/cons of each?
3. **Identify Synergies**: Can any options be combined?
4. **Provide Context**: When might each option be best?

${COMMON_JSON_INSTRUCTION}
Use the following schema:

{
  "_analysis": "Step-by-step reasoning about the exploration results. Review each perspective, identify which options emerged strongest, and explain how you arrived at the final menu of recommendations.",
  "recommendations": [
    {
      "option": "Option name or description",
      "description": "What this approach entails",
      "pros": ["Advantage 1", "Advantage 2"],
      "cons": ["Disadvantage 1", "Disadvantage 2"],
      "best_when": "Scenario where this option shines"
    }
  ],
  "synergies": ["Ways options can be combined"],
  "confidence": 0.0-1.0 (confidence in the quality of this menu),
  "summary": "Brief summary of the exploration results"
}

Fill the "_analysis" field FIRST with your detailed reasoning. Then provide your recommendations based on that analysis.`;
  }

  /**
   * Exploration mode never terminates early
   * All rounds are valuable for building the full picture
   */
  shouldTerminateEarly(_confidence: number, _roundNumber: number): boolean {
    return false;
  }
}
