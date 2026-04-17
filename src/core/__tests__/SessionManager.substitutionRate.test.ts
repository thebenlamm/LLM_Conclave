/**
 * Phase 21 (REPLAY-03) RED-phase tests — pins the contract for the
 * `computeSubstitutionRate` pure function BEFORE Plan 21-03 implements it.
 *
 * Mirrors the RED-first pattern used by Plan 20-02 (judge coinage). Every
 * math rule, every edge case, and every back-compat decision is pinned as a
 * literal assertion that Plan 21-03's GREEN commit must satisfy.
 *
 * Covers ROADMAP Phase 21 Success Criteria SC#5:
 *   - Substitution-rate telemetry covered by tests across zero / partial /
 *     all-substitution session samples.
 *   - Back-compat: pre-Phase-21 session.json files lack the `substituted`
 *     field; they are counted as NOT substituted.
 *   - Input immutability: the pure function must not mutate its input array.
 *
 * DELIBERATELY FAILING STATE: the import of `computeSubstitutionRate` below
 * will not resolve until Plan 21-03 adds the named export to SessionManager.ts.
 * tsc will report "has no exported member", and Jest will report a suite that
 * failed to run. Both are the RED signal this plan is meant to produce.
 *
 * DO NOT suppress the compile error with any TS suppression directive — the
 * failing compile is load-bearing evidence of the RED state.
 */
import { computeSubstitutionRate } from '../SessionManager.js';
import type { SessionSummary } from '../../types';

function buildSummary(
  overrides: Partial<SessionSummary & { substituted?: boolean }> = {}
): SessionSummary & { substituted?: boolean } {
  return {
    id: overrides.id || 'session_test_0001',
    timestamp: overrides.timestamp || '2026-04-17T12:00:00Z',
    mode: overrides.mode || 'consensus',
    task: overrides.task || 'test task',
    status: overrides.status || 'completed',
    roundCount: overrides.roundCount ?? 4,
    agentCount: overrides.agentCount ?? 3,
    cost: overrides.cost ?? 0.01,
    consensusReached: overrides.consensusReached,
    parentSessionId: overrides.parentSessionId,
    substituted: overrides.substituted,
  };
}

describe('computeSubstitutionRate — REPLAY-03 pure-function contract', () => {
  it('REPLAY-03 empty input → total 0, withSubstitution 0, ratePct 0', () => {
    expect(computeSubstitutionRate([])).toEqual({
      total: 0,
      withSubstitution: 0,
      ratePct: 0,
    });
  });

  it('REPLAY-03 zero substitutions across N=5 → ratePct 0', () => {
    const input = [
      buildSummary({ id: 's1', substituted: false }),
      buildSummary({ id: 's2', substituted: false }),
      buildSummary({ id: 's3', substituted: false }),
      buildSummary({ id: 's4', substituted: false }),
      buildSummary({ id: 's5', substituted: false }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 5,
      withSubstitution: 0,
      ratePct: 0,
    });
  });

  it('REPLAY-03 all substitutions across N=5 → ratePct 100', () => {
    const input = [
      buildSummary({ id: 's1', substituted: true }),
      buildSummary({ id: 's2', substituted: true }),
      buildSummary({ id: 's3', substituted: true }),
      buildSummary({ id: 's4', substituted: true }),
      buildSummary({ id: 's5', substituted: true }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 5,
      withSubstitution: 5,
      ratePct: 100,
    });
  });

  it('REPLAY-03 partial: 1 of 3 substituted → ratePct 33.3 (one decimal)', () => {
    const input = [
      buildSummary({ id: 's1', substituted: true }),
      buildSummary({ id: 's2', substituted: false }),
      buildSummary({ id: 's3', substituted: false }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 3,
      withSubstitution: 1,
      ratePct: 33.3,
    });
  });

  it('REPLAY-03 partial: 2 of 3 substituted → ratePct 66.7 (one decimal, rounded)', () => {
    const input = [
      buildSummary({ id: 's1', substituted: true }),
      buildSummary({ id: 's2', substituted: true }),
      buildSummary({ id: 's3', substituted: false }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 3,
      withSubstitution: 2,
      ratePct: 66.7,
    });
  });

  it('REPLAY-03 partial: 1 of 2 substituted → ratePct 50 (whole number retained)', () => {
    const input = [
      buildSummary({ id: 's1', substituted: true }),
      buildSummary({ id: 's2', substituted: false }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 2,
      withSubstitution: 1,
      ratePct: 50,
    });
  });

  it('REPLAY-03 partial: 7 of 9 substituted → ratePct 77.8', () => {
    const input = [
      buildSummary({ id: 's1', substituted: true }),
      buildSummary({ id: 's2', substituted: true }),
      buildSummary({ id: 's3', substituted: true }),
      buildSummary({ id: 's4', substituted: true }),
      buildSummary({ id: 's5', substituted: true }),
      buildSummary({ id: 's6', substituted: true }),
      buildSummary({ id: 's7', substituted: true }),
      buildSummary({ id: 's8', substituted: false }),
      buildSummary({ id: 's9', substituted: false }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 9,
      withSubstitution: 7,
      ratePct: 77.8,
    });
  });
});

describe('computeSubstitutionRate — back-compat for pre-Phase-21 session.json files', () => {
  it('REPLAY-03 back-compat: substituted undefined counts as NOT substituted', () => {
    const input = [
      buildSummary({ id: 's1', substituted: undefined }),
      buildSummary({ id: 's2', substituted: undefined }),
      buildSummary({ id: 's3', substituted: undefined }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 3,
      withSubstitution: 0,
      ratePct: 0,
    });
  });

  it('REPLAY-03 back-compat: mix of undefined and explicit true → only true counted', () => {
    const input = [
      buildSummary({ id: 's1', substituted: undefined }),
      buildSummary({ id: 's2', substituted: true }),
      buildSummary({ id: 's3', substituted: false }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 3,
      withSubstitution: 1,
      ratePct: 33.3,
    });
  });

  it('REPLAY-03 back-compat: explicit false distinct from undefined (both not-substituted)', () => {
    const input = [
      buildSummary({ id: 's1', substituted: false }),
      buildSummary({ id: 's2', substituted: false }),
      buildSummary({ id: 's3', substituted: undefined }),
      buildSummary({ id: 's4', substituted: undefined }),
    ];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 4,
      withSubstitution: 0,
      ratePct: 0,
    });
  });
});

describe('computeSubstitutionRate — single-session edge cases', () => {
  it('REPLAY-03 single session, substituted true → ratePct 100', () => {
    const input = [buildSummary({ id: 's1', substituted: true })];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 1,
      withSubstitution: 1,
      ratePct: 100,
    });
  });

  it('REPLAY-03 single session, substituted false → ratePct 0', () => {
    const input = [buildSummary({ id: 's1', substituted: false })];
    expect(computeSubstitutionRate(input)).toEqual({
      total: 1,
      withSubstitution: 0,
      ratePct: 0,
    });
  });
});

describe('computeSubstitutionRate — does not mutate input', () => {
  it('REPLAY-03 input array is not mutated by the call', () => {
    const input = [
      buildSummary({ id: 's1', substituted: true }),
      buildSummary({ id: 's2', substituted: false }),
    ];
    const inputCopy = JSON.parse(JSON.stringify(input));
    computeSubstitutionRate(input);
    expect(input).toEqual(inputCopy);
  });
});
