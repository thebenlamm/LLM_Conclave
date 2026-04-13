/**
 * Phase 15.2 — Task 1: failure visibility regression tests.
 *
 * Source fixture: ~/.llm-conclave/discuss-logs/discuss-2026-04-13T13-35-08-816Z.md
 * That session contained provider failures and persona-impersonation errors that
 * were silently dropped by renderTranscriptMarkdown's `if (msg.error) continue`
 * skip (DiscussionRunner.ts:85, pre-15.2). The aggregator at
 * ConversationManager.ts:631-662 already populated error/errorDetails/agent/model
 * on those entries — this test feeds an equivalent synthetic history and asserts
 * the markdown now contains an inline FAILED block per error entry.
 */

import { renderTranscriptMarkdown } from '../../mcp/DiscussionRunner';

describe('renderTranscriptMarkdown failure visibility (Phase 15.2)', () => {
  it('renders provider failures as inline FAILED blocks while preserving surrounding turns', () => {
    const history = [
      {
        role: 'assistant',
        content: 'Here is my opening analysis of the WAL handling.',
        speaker: 'Tech Ethicist',
        model: 'claude-sonnet-4',
      },
      {
        role: 'assistant',
        content: '',
        speaker: 'Security Expert',
        model: 'claude-sonnet-4',
        error: true,
        errorDetails: 'provider timeout',
      },
      {
        role: 'assistant',
        content: 'Continuing the discussion despite the prior failure.',
        speaker: 'Pragmatic Engineer',
        model: 'gpt-4o',
      },
    ];

    const md = renderTranscriptMarkdown(history);

    expect(md).toContain('[FAILED] Security Expert');
    expect(md).toContain('claude-sonnet-4');
    expect(md).toContain('provider timeout');
    expect(md).toContain('reason: provider failure');
    // Surrounding non-error turns still render.
    expect(md).toContain('Here is my opening analysis');
    expect(md).toContain('Continuing the discussion');
    // Order preserved: Tech Ethicist appears before FAILED block, which appears before Pragmatic Engineer.
    const teIdx = md.indexOf('Tech Ethicist');
    const failedIdx = md.indexOf('[FAILED] Security Expert');
    const peIdx = md.indexOf('Pragmatic Engineer');
    expect(teIdx).toBeGreaterThanOrEqual(0);
    expect(failedIdx).toBeGreaterThan(teIdx);
    expect(peIdx).toBeGreaterThan(failedIdx);
  });

  it('renders persona-impersonation failures with the Phase 15.1 reason hint', () => {
    const history = [
      {
        role: 'assistant',
        content: '',
        speaker: 'Security Expert',
        model: 'claude-sonnet-4',
        error: true,
        errorDetails: 'persona-impersonation',
      },
    ];

    const md = renderTranscriptMarkdown(history);

    expect(md).toContain('[FAILED] Security Expert');
    expect(md).toContain('persona-impersonation');
    expect(md).toContain('persona impersonation (Phase 15.1 guard)');
    // Should NOT mislabel as a provider failure.
    expect(md).not.toContain('reason: provider failure');
  });

  it('does not regress clean transcripts (no FAILED token, all turns rendered)', () => {
    const history = [
      {
        role: 'assistant',
        content: 'Opening thought.',
        speaker: 'Tech Ethicist',
        model: 'claude-sonnet-4',
      },
      {
        role: 'assistant',
        content: 'Counterpoint.',
        speaker: 'Critical Analyst',
        model: 'gemini-2.5-flash',
      },
      {
        role: 'user',
        content: 'Round 1 wrap-up: explore tradeoffs more deeply.',
        speaker: 'Judge',
        model: 'claude-opus-4',
      },
      {
        role: 'assistant',
        content: 'Round 2 follow-up.',
        speaker: 'Tech Ethicist',
        model: 'claude-sonnet-4',
      },
    ];

    const md = renderTranscriptMarkdown(history);

    expect(md).not.toContain('FAILED');
    expect(md).toContain('Opening thought.');
    expect(md).toContain('Counterpoint.');
    expect(md).toContain('Round 1 wrap-up');
    expect(md).toContain('Round 2 follow-up.');
  });

  it('emits Round 1 header before a first-turn failure (WR-02 regression)', () => {
    // Phase 15.2 WR-02: if Round 1 begins with a failed turn (e.g. provider
    // timeout on the first speaker), the FAILED block must render under a
    // "### Round 1" header — not as an orphan block before any header.
    const history = [
      {
        role: 'assistant',
        content: '',
        speaker: 'Security Expert',
        model: 'claude-sonnet-4',
        error: true,
        errorDetails: 'provider timeout',
      },
      {
        role: 'assistant',
        content: 'Picking up after the failed opener.',
        speaker: 'Tech Ethicist',
        model: 'claude-sonnet-4',
      },
    ];

    const md = renderTranscriptMarkdown(history);

    const roundIdx = md.indexOf('### Round 1');
    const failedIdx = md.indexOf('[FAILED] Security Expert');
    expect(roundIdx).toBeGreaterThanOrEqual(0);
    expect(failedIdx).toBeGreaterThan(roundIdx);
  });

  it('renders a failure immediately after a Judge delimiter under the new round header', () => {
    // Phase 15.2 WR-02: a failure that is the first turn of a new round
    // (right after a Judge entry) must render under the NEW round's header,
    // not the previous round's.
    const history = [
      {
        role: 'assistant',
        content: 'Round 1 opening.',
        speaker: 'Tech Ethicist',
        model: 'claude-sonnet-4',
      },
      {
        role: 'user',
        content: 'Round 1 wrap-up.',
        speaker: 'Judge',
        model: 'claude-opus-4',
      },
      {
        role: 'assistant',
        content: '',
        speaker: 'Security Expert',
        model: 'claude-sonnet-4',
        error: true,
        errorDetails: 'provider timeout',
      },
      {
        role: 'assistant',
        content: 'Round 2 continuation.',
        speaker: 'Pragmatic Engineer',
        model: 'gpt-4o',
      },
    ];

    const md = renderTranscriptMarkdown(history);

    const round1Idx = md.indexOf('### Round 1');
    const round2Idx = md.indexOf('### Round 2');
    const failedIdx = md.indexOf('[FAILED] Security Expert');
    expect(round1Idx).toBeGreaterThanOrEqual(0);
    expect(round2Idx).toBeGreaterThan(round1Idx);
    // Failed block must fall AFTER the Round 2 header, not between Round 1 and Round 2.
    expect(failedIdx).toBeGreaterThan(round2Idx);
  });

  it('handles multiple mixed failures (provider + persona) inline in order', () => {
    const history = [
      {
        role: 'assistant',
        content: '',
        speaker: 'Security Expert',
        model: 'claude-sonnet-4',
        error: true,
        errorDetails: 'provider timeout',
      },
      {
        role: 'assistant',
        content: '',
        speaker: 'Tech Ethicist',
        model: 'gpt-4o',
        error: true,
        errorDetails: 'persona-impersonation',
      },
    ];

    const md = renderTranscriptMarkdown(history);

    const firstFailedIdx = md.indexOf('[FAILED] Security Expert');
    const secondFailedIdx = md.indexOf('[FAILED] Tech Ethicist');
    expect(firstFailedIdx).toBeGreaterThanOrEqual(0);
    expect(secondFailedIdx).toBeGreaterThan(firstFailedIdx);
    expect(md).toContain('provider timeout');
    expect(md).toContain('persona impersonation (Phase 15.1 guard)');
  });
});
