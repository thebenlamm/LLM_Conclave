import { EarlyTerminationManager } from '../EarlyTerminationManager';
import { SynthesisArtifact } from '../../../types/consult';

describe('EarlyTerminationManager', () => {
  let promptFn: jest.Mock;
  let manager: EarlyTerminationManager;

  beforeEach(() => {
    promptFn = jest.fn();
    manager = new EarlyTerminationManager(promptFn);
  });

  describe('calculateSynthesisConfidence', () => {
    it('returns average of consensus point confidences', () => {
      const synthesis: SynthesisArtifact = {
        artifactType: 'synthesis',
        schemaVersion: '1.0',
        roundNumber: 2,
        consensusPoints: [
          { point: 'A', supportingAgents: [], confidence: 0.9 },
          { point: 'B', supportingAgents: [], confidence: 0.8 }
        ],
        tensions: [],
        priorityOrder: [],
        createdAt: new Date().toISOString()
      };
      expect(manager.calculateSynthesisConfidence(synthesis)).toBeCloseTo(0.85);
    });

    it('returns 0 for empty consensus points', () => {
      const synthesis: SynthesisArtifact = {
        artifactType: 'synthesis',
        schemaVersion: '1.0',
        roundNumber: 2,
        consensusPoints: [],
        tensions: [],
        priorityOrder: [],
        createdAt: new Date().toISOString()
      };
      expect(manager.calculateSynthesisConfidence(synthesis)).toBe(0);
    });
  });

  describe('shouldCheckEarlyTermination', () => {
    it('returns true for converge mode after round 2', () => {
      expect(manager.shouldCheckEarlyTermination('converge', 2)).toBe(true);
    });

    it('returns false for explore mode', () => {
      expect(manager.shouldCheckEarlyTermination('explore', 2)).toBe(false);
    });

    it('returns false for other rounds', () => {
      expect(manager.shouldCheckEarlyTermination('converge', 1)).toBe(false);
      expect(manager.shouldCheckEarlyTermination('converge', 3)).toBe(false);
    });
  });

  describe('meetsEarlyTerminationCriteria', () => {
    it('returns true if confidence >= threshold', () => {
      expect(manager.meetsEarlyTerminationCriteria(0.9, 0.9)).toBe(true);
      expect(manager.meetsEarlyTerminationCriteria(0.95, 0.9)).toBe(true);
    });

    it('returns false if confidence < threshold', () => {
      expect(manager.meetsEarlyTerminationCriteria(0.89, 0.9)).toBe(false);
    });
  });

  describe('promptUserForEarlyTermination', () => {
    it('calls promptFn with formatted message', async () => {
      promptFn.mockResolvedValue(true);
      const result = await manager.promptUserForEarlyTermination(0.925);
      
      expect(promptFn).toHaveBeenCalledWith(expect.stringContaining('confidence: 93%'));
      expect(promptFn).toHaveBeenCalledWith(expect.stringContaining('Terminate early and skip Rounds 3-4?'));
      expect(result).toBe(true);
    });
  });
});
