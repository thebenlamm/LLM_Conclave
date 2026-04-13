import { reconcileConfidence, MachinerySignals, Confidence } from '../ConfidenceReconciler';

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

  it('Test 1: machinery clean + judge HIGH → finalConfidence HIGH', () => {
    const result = reconcileConfidence(clean(), 'HIGH');
    expect(result.finalConfidence).toBe('HIGH');
    expect(result.confidenceReasoning.toLowerCase()).toContain('machinery clean');
    expect(result.confidenceReasoning.toLowerCase()).toContain('judge');
    expect(result.judgeConfidence).toBe('HIGH');
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

  it('Test 5: aborted=true + judge HIGH → LOW (judge overridden)', () => {
    const result = reconcileConfidence(clean({ aborted: true }), 'HIGH');
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('aborted');
  });

  it('Test 6: turnBalanceOk=false + judge HIGH → LOW', () => {
    const result = reconcileConfidence(clean({ turnBalanceOk: false }), 'HIGH');
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('turn balance');
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

  it('aborted takes priority over all other flags', () => {
    const result = reconcileConfidence(
      { aborted: true, abortReason: 'timeout', allAgentsSpoke: false, turnBalanceOk: false, roundCompleteness: 0.5 },
      'HIGH'
    );
    expect(result.finalConfidence).toBe('LOW');
    expect(result.confidenceReasoning.toLowerCase()).toContain('aborted');
  });

  it('partial completeness with LOW judge stays LOW (not promoted to MEDIUM)', () => {
    const result = reconcileConfidence(clean({ roundCompleteness: 0.5 }), 'LOW' as Confidence);
    expect(result.finalConfidence).toBe('LOW');
  });
});
