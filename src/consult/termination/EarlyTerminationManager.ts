import { SynthesisArtifact } from '../../types/consult';

export class EarlyTerminationManager {
  constructor(private readonly promptFn: (message: string) => Promise<boolean>) {}

  /**
   * Calculate the average confidence score from synthesis consensus points
   */
  calculateSynthesisConfidence(synthesis: SynthesisArtifact): number {
    if (!synthesis.consensusPoints?.length) return 0;
    const sum = synthesis.consensusPoints.reduce((acc, cp) => acc + cp.confidence, 0);
    return sum / synthesis.consensusPoints.length;
  }

  /**
   * Determine if early termination should be checked based on mode and round
   * Early termination is ONLY allowed in 'converge' mode after Round 2
   */
  shouldCheckEarlyTermination(mode: string, roundNumber: number): boolean {
    // Only check after Round 2, and only in converge mode
    return mode === 'converge' && roundNumber === 2;
  }

  /**
   * Check if the calculated confidence meets or exceeds the threshold
   */
  meetsEarlyTerminationCriteria(confidence: number, threshold: number): boolean {
    return confidence >= threshold;
  }

  /**
   * Detect rubber-stamp consensus: all agents agree at high confidence
   * without any recorded tensions or dissent. This signals the agents
   * may be echoing each other rather than genuinely converging.
   *
   * Also checks for thin-verdict agreement: agents agree at high confidence
   * but their reasoning is generic/overlapping rather than domain-specific.
   *
   * @param round1Artifacts - Array of R1 artifacts with confidence scores and optional content
   * @param synthesis - Synthesis artifact with optional tensions array
   * @returns true if consensus appears rubber-stamped (all high confidence, no tensions or thin verdict)
   */
  detectRubberStamp(
    round1Artifacts: Array<{ confidence: number; content?: string }>,
    synthesis: { tensions?: Array<unknown> }
  ): boolean {
    if (round1Artifacts.length < 2) return false;
    const allHighConfidence = round1Artifacts.every(a => a.confidence > 0.85);
    const noTensions = !synthesis.tensions || synthesis.tensions.length === 0;

    // Original check: high confidence + no tensions
    if (allHighConfidence && noTensions) return true;

    // New check: high confidence + thin verdict (generic overlapping reasoning)
    if (allHighConfidence) {
      const contents = round1Artifacts.map(a => a.content).filter((c): c is string => !!c);
      if (contents.length >= 2 && this.detectThinVerdict(contents)) return true;
    }

    return false;
  }

  /**
   * Detect thin-verdict consensus: agents agree strongly but provide
   * generic/overlapping reasoning rather than domain-specific analysis.
   * Complements detectRubberStamp (which checks confidence + tensions).
   *
   * @param agentContents - Array of agent response text content from R1
   * @param threshold - Minimum overlap ratio to flag (default 0.6)
   * @returns true if reasoning appears generic/overlapping
   */
  detectThinVerdict(agentContents: string[], threshold: number = 0.6): boolean {
    if (agentContents.length < 2) return false;

    // Extract key phrases as 3-grams of significant words (length > 3)
    const extractPhrases = (text: string): Set<string> => {
      const sentences = text.split(/[.!?\n]+/).map(s => s.trim().toLowerCase()).filter(s => s.split(/\s+/).length > 5);
      const ngrams = new Set<string>();
      for (const sentence of sentences) {
        const words = sentence.split(/\s+/).filter(w => w.length > 3);
        for (let i = 0; i <= words.length - 3; i++) {
          ngrams.add(words.slice(i, i + 3).join(' '));
        }
      }
      return ngrams;
    };

    // Compare each pair of agents for phrase overlap
    let totalPairs = 0;
    let highOverlapPairs = 0;

    for (let i = 0; i < agentContents.length; i++) {
      for (let j = i + 1; j < agentContents.length; j++) {
        totalPairs++;
        const phrasesA = extractPhrases(agentContents[i]);
        const phrasesB = extractPhrases(agentContents[j]);
        if (phrasesA.size === 0 || phrasesB.size === 0) continue;

        const smaller = phrasesA.size <= phrasesB.size ? phrasesA : phrasesB;
        const larger = phrasesA.size <= phrasesB.size ? phrasesB : phrasesA;
        let overlap = 0;
        for (const phrase of smaller) {
          if (larger.has(phrase)) overlap++;
        }
        const overlapRatio = overlap / smaller.size;
        if (overlapRatio >= threshold) highOverlapPairs++;
      }
    }

    // Flag if majority of agent pairs show high overlap
    return totalPairs > 0 && highOverlapPairs > totalPairs / 2;
  }

  /**
   * Prompt the user to confirm early termination
   */
  async promptUserForEarlyTermination(confidence: number): Promise<boolean> {
    const percentConfidence = Math.round(confidence * 100);
    return this.promptFn(
      `✨ Strong consensus reached (confidence: ${percentConfidence}%)\n` +
      `Terminate early and skip Rounds 3-4? [Y/n]`
    );
  }
}
