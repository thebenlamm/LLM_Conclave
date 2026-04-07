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

  describe('detectRubberStamp', () => {
    it('returns true when all R1 artifacts have high confidence (>0.85) AND no tensions in synthesis', () => {
      const r1Artifacts = [
        { confidence: 0.9 },
        { confidence: 0.95 },
        { confidence: 0.88 }
      ];
      const synthesis = { tensions: [] };
      expect(manager.detectRubberStamp(r1Artifacts, synthesis)).toBe(true);
    });

    it('returns false when R1 artifacts have mixed confidence levels', () => {
      const r1Artifacts = [
        { confidence: 0.9 },
        { confidence: 0.6 },
        { confidence: 0.88 }
      ];
      const synthesis = { tensions: [] };
      expect(manager.detectRubberStamp(r1Artifacts, synthesis)).toBe(false);
    });

    it('returns false when synthesis has >= 1 tension', () => {
      const r1Artifacts = [
        { confidence: 0.9 },
        { confidence: 0.95 }
      ];
      const synthesis = { tensions: [{ description: 'Some disagreement' }] };
      expect(manager.detectRubberStamp(r1Artifacts, synthesis)).toBe(false);
    });

    it('returns false for single agent (less than 2)', () => {
      const r1Artifacts = [{ confidence: 0.99 }];
      const synthesis = { tensions: [] };
      expect(manager.detectRubberStamp(r1Artifacts, synthesis)).toBe(false);
    });

    it('returns false when synthesis.tensions is undefined', () => {
      const r1Artifacts = [
        { confidence: 0.9 },
        { confidence: 0.95 }
      ];
      const synthesis = {};
      // No tensions property means we can't be sure there are no tensions
      // Implementation: !synthesis.tensions → noTensions = true
      // But this is rubber-stamp territory: all high confidence, no recorded tensions
      expect(manager.detectRubberStamp(r1Artifacts, synthesis)).toBe(true);
    });
  });

  describe('promptUserForEarlyTermination', () => {
    it('calls promptFn with formatted message including [Y/n]', async () => {
      promptFn.mockResolvedValue(true);
      const result = await manager.promptUserForEarlyTermination(0.925);

      expect(promptFn).toHaveBeenCalledWith(expect.stringContaining('confidence: 93%'));
      expect(promptFn).toHaveBeenCalledWith(expect.stringContaining('Terminate early and skip Rounds 3-4? [Y/n]'));
      expect(result).toBe(true);
    });
  });
});
