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
