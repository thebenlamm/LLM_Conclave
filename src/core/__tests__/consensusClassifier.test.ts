/**
 * Tests for classifyNonConsensus — the non-convergence verdict classifier.
 * Locks the 4-way taxonomy and the "hypothesis not verdict" honesty for the
 * ambiguous unresolved case.
 */
import { classifyNonConsensus } from '../consensusClassifier';

const SUBSTANTIVE = 'Agent B holds that build-time migrations need least-privilege creds, not superuser.';

describe('classifyNonConsensus', () => {
  it('returns null when consensus was reached (nothing to classify)', () => {
    expect(classifyNonConsensus({ consensusReached: true })).toBeNull();
  });

  describe('genuine_disagreement', () => {
    it('classifies completed runs with substantive dissent as live fault lines', () => {
      const c = classifyNonConsensus({
        consensusReached: false,
        rounds: 4,
        maxRounds: 4,
        agentCount: 3,
        dissent: [SUBSTANTIVE, 'Agent C disagrees on the rollback sequencing and timeline.'],
        dissent_quality: 'captured',
      })!;
      expect(c.category).toBe('genuine_disagreement');
      expect(c.label).toBe('Panel did not converge — 2 live fault lines');
      expect(c.faultLines).toHaveLength(2);
      expect(c.reasoning).toMatch(/verdict/i);
    });

    it('singularizes the label for one fault line', () => {
      const c = classifyNonConsensus({
        consensusReached: false,
        rounds: 4,
        maxRounds: 4,
        agentCount: 3,
        dissent: [SUBSTANTIVE],
      })!;
      expect(c.label).toBe('Panel did not converge — 1 live fault line');
    });

    it('ignores placeholder/empty dissent (not substantive)', () => {
      const c = classifyNonConsensus({
        consensusReached: false,
        rounds: 3,
        maxRounds: 3,
        agentCount: 3,
        dissent: ['none', 'N/A', '   '],
      })!;
      expect(c.category).toBe('unresolved');
      expect(c.faultLines).toHaveLength(0);
    });
  });

  describe('unresolved (possible detector strictness — hypothesis only)', () => {
    it('flags no-dissent non-consensus as a hypothesis, naming panel size, not asserted', () => {
      const c = classifyNonConsensus({
        consensusReached: false,
        rounds: 3,
        maxRounds: 3,
        agentCount: 3,
        dissent: [],
      })!;
      expect(c.category).toBe('unresolved');
      expect(c.reasoning).toMatch(/3 agents/);
      expect(c.reasoning).toMatch(/detector strictness/i);
      expect(c.reasoning).toMatch(/not asserted/i);
      // Must NOT assert detector-strictness as fact.
      expect(c.reasoning).not.toMatch(/detector withheld|too strict/i);
    });

    it('does not claim "none captured" when brief below-threshold dissent exists (no self-contradiction)', () => {
      // 'Use TLS!' is real but < 11 chars → not substantive, yet the markdown
      // renders a Dissenting Views section for it. The verdict must not assert
      // none was captured.
      const c = classifyNonConsensus({
        consensusReached: false, rounds: 3, maxRounds: 3, agentCount: 3, dissent: ['Use TLS!'],
      })!;
      expect(c.category).toBe('unresolved');
      expect(c.reasoning).toMatch(/brief, below-threshold dissent/i);
      expect(c.reasoning).not.toMatch(/no substantive disagreement was captured/i);
      expect(c.label).toMatch(/only brief dissent recorded/i);
    });

    it('notes full round exhaustion vs early stop', () => {
      const exhausted = classifyNonConsensus({
        consensusReached: false, rounds: 4, maxRounds: 4, agentCount: 2, dissent: [],
      })!;
      expect(exhausted.signals.roundsExhausted).toBe(true);
      expect(exhausted.reasoning).toMatch(/Ran all 4 rounds/);

      const early = classifyNonConsensus({
        consensusReached: false, rounds: 2, maxRounds: 4, agentCount: 2, dissent: [],
      })!;
      expect(early.signals.roundsExhausted).toBe(false);
      expect(early.reasoning).toMatch(/Stopped after 2\/4 rounds/);
    });
  });

  describe('incomplete (process failure — not a real verdict)', () => {
    it('classifies a degraded run as incomplete and surfaces the reason', () => {
      const c = classifyNonConsensus({
        consensusReached: false,
        rounds: 2,
        maxRounds: 4,
        agentCount: 3,
        dissent: [SUBSTANTIVE], // even with dissent, a degraded run is incomplete first
        degraded: true,
        degradedReason: 'only 1 of 3 agents responded',
      })!;
      expect(c.category).toBe('incomplete');
      expect(c.reasoning).toMatch(/only 1 of 3 agents responded/);
      expect(c.label).toMatch(/did not complete cleanly/i);
    });

    it('classifies a timed-out run as incomplete', () => {
      const c = classifyNonConsensus({
        consensusReached: false, rounds: 1, maxRounds: 4, agentCount: 3, timedOut: true,
      })!;
      expect(c.category).toBe('incomplete');
      expect(c.reasoning).toMatch(/aborted or timed out/i);
    });

    it('classifies DEGRADED run integrity as incomplete', () => {
      const c = classifyNonConsensus({
        consensusReached: false, rounds: 4, maxRounds: 4, agentCount: 3,
        runIntegrity: { status: 'DEGRADED' },
      })!;
      expect(c.category).toBe('incomplete');
    });
  });

  it('always exposes the raw signals used', () => {
    const c = classifyNonConsensus({
      consensusReached: false, rounds: 3, maxRounds: 4, agentCount: 2, dissent: [],
    })!;
    expect(c.signals).toMatchObject({
      rounds: 3, maxRounds: 4, roundsExhausted: false, agentCount: 2,
      dissentCaptured: false, degraded: false, timedOut: false, runIntegrityStatus: 'OK',
    });
  });
});
