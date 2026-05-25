import { reconcileConfidence, deriveConfidenceCause, MachinerySignals, Confidence } from '../ConfidenceReconciler';

function clean(overrides: Partial<MachinerySignals> = {}): MachinerySignals {
  return {
    aborted: false,
    allAgentsSpoke: true,
    turnBalanceOk: true,
    roundCompleteness: 1.0,
    ...overrides,
  };
}

describe('ConfidenceReconciler (Phase 13)', () => {
  // -------------------------------------------------------------------------
  // Matrix corners — machinery clean × judge values
  // -------------------------------------------------------------------------

  it('Test 1: machinery clean + judge HIGH → finalConfidence HIGH, runIntegrityStatus OK', () => {
    const result = reconcileConfidence(clean(), 'HIGH');
    expect(result.finalConfidence).toBe('HIGH');
    expect(result.confidenceReasoning.toLowerCase()).toContain('machinery clean');
    expect(result.confidenceReasoning.toLowerCase()).toContain('judge');
    expect(result.judgeConfidence).toBe('HIGH');
    expect(result.runIntegrityStatus).toBe('OK');
  });

  it('Test 2: machinery clean + judge LOW → finalConfidence LOW', () => {
    const result = reconcileConfidence(clean(), 'LOW');
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('machinery clean');
  });

  it('Test 3: machinery clean + judge MEDIUM → finalConfidence MEDIUM', () => {
    const result = reconcileConfidence(clean(), 'MEDIUM');
    expect(result.finalConfidence).toBe('MEDIUM');
  });

  it('Test 4: machinery clean + judge undefined → MEDIUM default', () => {
    const result = reconcileConfidence(clean(), undefined);
    expect(result.finalConfidence).toBe('MEDIUM');
    expect(result.confidenceReasoning.toLowerCase()).toContain('defaulting to medium');
  });

  // -------------------------------------------------------------------------
  // Machinery degraded — each rule caps judge at LOW
  // -------------------------------------------------------------------------

  it('Test 5: aborted=true + judge HIGH → LOW (judge overridden) + runIntegrityStatus DEGRADED', () => {
    const result = reconcileConfidence(clean({ aborted: true }), 'HIGH');
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('aborted');
    expect(result.runIntegrityStatus).toBe('DEGRADED');
  });

  it('Test 6: turnBalanceOk=false + judge HIGH → HIGH (process signal, not epistemic)', () => {
    const result = reconcileConfidence(clean({ turnBalanceOk: false }), 'HIGH');
    // Turn balance is a process signal — epistemic confidence is unaffected.
    expect(result.finalConfidence).toBe('HIGH');
    // Run integrity captures the process signal instead.
    expect(result.runIntegrityStatus).toBe('WARNING');
    expect(result.runIntegrityStatusReasoning.toLowerCase()).toContain('turn');
  });

  it('Test 7: allAgentsSpoke=false + judge HIGH → LOW', () => {
    const result = reconcileConfidence(clean({ allAgentsSpoke: false }), 'HIGH');
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('did not all speak');
  });

  it('Test 8: roundCompleteness=0.5 + judge HIGH → capped at MEDIUM', () => {
    const result = reconcileConfidence(clean({ roundCompleteness: 0.5 }), 'HIGH');
    expect(result.finalConfidence).toBe('MEDIUM');
    expect(result.confidenceReasoning.toLowerCase()).toContain('round completeness');
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('Test 9: all clean, roundCompleteness=1.0, judge undefined → MEDIUM', () => {
    const result = reconcileConfidence(clean(), undefined);
    expect(result.finalConfidence).toBe('MEDIUM');
  });

  it('Test 10: aborted=true with custom abortReason → reasoning includes it', () => {
    const result = reconcileConfidence(
      clean({ aborted: true, abortReason: 'TPM failure on round 2' }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning).toContain('TPM failure on round 2');
  });

  // -------------------------------------------------------------------------
  // Rule priority — aborted wins over every other flag
  // -------------------------------------------------------------------------

  it('aborted takes priority over all other flags; runIntegrityStatus DEGRADED', () => {
    const result = reconcileConfidence(
      { aborted: true, abortReason: 'timeout', allAgentsSpoke: false, turnBalanceOk: false, roundCompleteness: 0.5 },
      'HIGH'
    );
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('aborted');
    expect(result.runIntegrityStatus).toBe('DEGRADED');
  });

  it('partial completeness with LOW judge stays LOW (not promoted to MEDIUM)', () => {
    const result = reconcileConfidence(clean({ roundCompleteness: 0.5 }), 'LOW' as Confidence);
    expect(result.finalConfidence).toBe('LOW');
  });

  it('turnBalanceOk=false with clean consensus: epistemic HIGH preserved, runIntegrityStatus WARNING', () => {
    // Key regression: 5/5 consensus with turn-length imbalance should NOT show LOW epistemic confidence.
    const result = reconcileConfidence(clean({ turnBalanceOk: false }), 'HIGH');
    expect(result.finalConfidence).toBe('HIGH');
    expect(result.runIntegrityStatus).toBe('WARNING');
    expect(result.runIntegrityStatusReasoning).toContain('fairness');
  });

  it('clean run: runIntegrityStatus OK and statusReasoning present', () => {
    const result = reconcileConfidence(clean(), 'HIGH');
    expect(result.runIntegrityStatus).toBe('OK');
    expect(result.runIntegrityStatusReasoning).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Phase 13.1 — Participation-aware caps (Rule 3.5a / 3.5b)
// ---------------------------------------------------------------------------
describe('ConfidenceReconciler (Phase 13.1 — participation caps)', () => {
  it('13.1-A: all spoken → reconciler ignores participation, trusts judge', () => {
    const result = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 2, status: 'spoken' },
          { agent: 'c', turns: 4, status: 'spoken' },
        ],
      }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('HIGH');
  });

  it('13.1-B: 1 absent-silent of 3 + judge HIGH → cap MEDIUM', () => {
    const result = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 2, status: 'spoken' },
          { agent: 'c', turns: 0, status: 'absent-silent' },
        ],
      }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('MEDIUM');
    expect(result.confidenceReasoning).toContain('c');
    expect(result.confidenceReasoning).toContain('absent-silent');
  });

  it('13.1-C: 1 absent-capped of 3 + judge HIGH → cap MEDIUM', () => {
    const result = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 2, status: 'spoken' },
          { agent: 'c', turns: 0, status: 'absent-capped', ratioAtExclusion: 2.8 },
        ],
      }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('MEDIUM');
    expect(result.confidenceReasoning).toContain('absent-capped');
  });

  it('13.1-D: 2 absent-silent of 3 (all-but-one) → cap LOW regardless of judge', () => {
    const result = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 0, status: 'absent-silent' },
          { agent: 'c', turns: 0, status: 'absent-silent' },
        ],
      }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('all-but-one');
    expect(result.confidenceReasoning).toContain('b');
    expect(result.confidenceReasoning).toContain('c');
  });

  it('13.1-E: 1 absent-failed only → NOT capped by new rules (falls through to Rule 5)', () => {
    // Note: allAgentsSpoke=true here to isolate new-rule behavior from Rule 3.
    const result = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 2, status: 'spoken' },
          { agent: 'c', turns: 0, status: 'absent-failed' },
        ],
      }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('HIGH');
  });

  it('13.1-F: participation undefined → identical to pre-change behavior', () => {
    const result = reconcileConfidence(clean(), 'HIGH');
    expect(result.finalConfidence).toBe('HIGH');
    expect(result.confidenceReasoning.toLowerCase()).toContain('machinery clean');
  });

  it('13.1-G: compression.active=true but no participation → output unchanged', () => {
    const result = reconcileConfidence(
      clean({
        compression: { active: true, activatedAtRound: 3, summaryRegenerations: 2 },
      }),
      'HIGH'
    );
    expect(result.finalConfidence).toBe('HIGH');
    expect(result.confidenceReasoning.toLowerCase()).toContain('machinery clean');
  });

  it('13.1-H: absent-silent with judge LOW stays LOW (cap is min, not forced MEDIUM)', () => {
    const result = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 2, status: 'spoken' },
          { agent: 'c', turns: 0, status: 'absent-silent' },
        ],
      }),
      'LOW'
    );
    expect(result.finalConfidence).toBe('LOW');
  });
});

describe('deriveConfidenceCause — terse header "why" clause', () => {
  // Coupled to reconciler output: feed the real reasoning string the reconciler
  // emits, so a wording change in one without the other fails here.
  it('abort cap → "run aborted"', () => {
    const r = reconcileConfidence(
      { aborted: true, abortReason: 'bad key', allAgentsSpoke: true, turnBalanceOk: true, roundCompleteness: 1 },
      'HIGH'
    );
    expect(deriveConfidenceCause(r.confidenceReasoning)).toBe('run aborted');
  });

  it('not all agents spoke → precise absent count from participation report', () => {
    const r = reconcileConfidence(clean({ allAgentsSpoke: false }), 'HIGH');
    const participation = [
      { status: 'spoken' },
      { status: 'absent' },
      { status: 'absent' },
    ];
    expect(deriveConfidenceCause(r.confidenceReasoning, participation)).toBe('participation: 2 agents absent');
  });

  it('all-but-one absent → precise singular absent count', () => {
    const r = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 2, status: 'spoken' },
          { agent: 'b', turns: 0, status: 'absent-failed' },
        ],
      }),
      'HIGH'
    );
    // Only one absent → singular "agent".
    expect(deriveConfidenceCause(r.confidenceReasoning, [{ status: 'spoken' }, { status: 'absent' }]))
      .toBe('participation: 1 agent absent');
  });

  it('partial round completeness → "rounds N% complete"', () => {
    const r = reconcileConfidence(clean({ roundCompleteness: 0.5 }), 'HIGH');
    expect(deriveConfidenceCause(r.confidenceReasoning)).toBe('rounds 50% complete');
  });

  it('participation-incomplete (silent/capped) → precise absent count', () => {
    const r = reconcileConfidence(
      clean({
        participation: [
          { agent: 'a', turns: 3, status: 'spoken' },
          { agent: 'b', turns: 0, status: 'absent-silent' },
        ],
      }),
      'HIGH'
    );
    expect(deriveConfidenceCause(r.confidenceReasoning, [{ status: 'spoken' }, { status: 'absent-silent' }]))
      .toBe('participation: 1 agent absent');
  });

  it('clean run (judge HIGH) → no clause', () => {
    const r = reconcileConfidence(clean(), 'HIGH');
    expect(deriveConfidenceCause(r.confidenceReasoning)).toBe('');
  });

  it('undefined / unrecognised reasoning → no clause (DEBT-02 parity)', () => {
    expect(deriveConfidenceCause(undefined)).toBe('');
    expect(deriveConfidenceCause('compression active')).toBe('');
  });

  it('participation cause with no report attached → generic phrase (consult mode)', () => {
    expect(deriveConfidenceCause('All-but-one configured agent absent (a, b) — capped LOW.')).toBe('incomplete participation');
  });
});
