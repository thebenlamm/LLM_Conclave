/**
 * Phase 18 (AUDIT-03) regression tests — pins the unified round counter across
 * SessionManager.createSessionManifest and ContinuationHandler.mergeContinuationContext.
 *
 * Covers ROADMAP Success Criteria:
 *   SC-1: session.currentRound, per-history-entry roundNumber, and the index
 *         manifest summary.roundCount all report the same round.
 *   SC-2: Continuation sessions preserve the unified counter across resume.
 *   SC-3: Regression tests cover both fresh and continuation paths.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import SessionManager from '../SessionManager.js';
import ContinuationHandler from '../ContinuationHandler.js';
import type { DiscussionHistoryEntry, SessionManifest, SessionMessage } from '../../types/index.js';

function tmpSessionsRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase18-sessions-'));
}

const agents = [
  { name: 'AgentA', model: 'claude-x', provider: { constructor: { name: 'ClaudeProvider' } }, systemPrompt: '' },
  { name: 'AgentB', model: 'gpt-x',    provider: { constructor: { name: 'OpenAIProvider' } }, systemPrompt: '' },
  { name: 'AgentC', model: 'gemini-x', provider: { constructor: { name: 'GeminiProvider' } }, systemPrompt: '' },
];

// 3-round discussion with deliberately UNEVEN turns per round — the scenario
// that exposes the pre-Phase-18 Math.floor(index / agents.length) bug.
function buildFreshHistory(): DiscussionHistoryEntry[] {
  return [
    { role: 'user',      speaker: 'System', content: 'Task: analyze X',   timestamp: '', roundNumber: 0 },
    { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r1-a', timestamp: '', roundNumber: 1 },
    { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r1-b', timestamp: '', roundNumber: 1 },
    // AgentC failed round 1 — only 2 assistant turns this round
    { role: 'user',      speaker: 'Judge',  content: 'guidance 1',        timestamp: '', roundNumber: 1 },
    { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r2-a', timestamp: '', roundNumber: 2 },
    { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r2-b', timestamp: '', roundNumber: 2 },
    { role: 'assistant', speaker: 'AgentC', model: 'gemini-x', content: 'r2-c', timestamp: '', roundNumber: 2 },
    { role: 'user',      speaker: 'Judge',  content: 'guidance 2',        timestamp: '', roundNumber: 2 },
    { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r3-a', timestamp: '', roundNumber: 3 },
    { role: 'assistant', speaker: 'AgentC', model: 'gemini-x', content: 'r3-c', timestamp: '', roundNumber: 3 },
  ];
}

describe('Phase 18 — Round Counter Unification (AUDIT-03)', () => {
  describe('Fresh discussion: session.currentRound, per-message roundNumber, and index summary all agree', () => {
    it('AUDIT-03 fresh: session.currentRound === max(history roundNumber) === summary.roundCount', async () => {
      const sm = new SessionManager(tmpSessionsRoot());
      const history = buildFreshHistory();
      const result = { rounds: 3, solution: 'verdict', consensusReached: true };
      const manifest = sm.createSessionManifest('consensus', 'task', agents, history, result);

      // Session-level counter
      expect(manifest.currentRound).toBe(3);

      // Per-message stamps preserved from source
      const stamps = manifest.conversationHistory.map(m => m.roundNumber);
      expect(stamps).toEqual([0, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
      expect(Math.max(...stamps)).toBe(3);

      // Phase 18 regression hook: positional Math.floor(index / agents.length)
      // with agents.length=3 would have produced 0 for index 2 (AgentB r1),
      // but the stamped path preserves 1. This distinguishing assertion locks
      // the fix vs the pre-18 bug.
      expect(manifest.conversationHistory[2].roundNumber).toBe(1);

      // Persist + read-back the index summary; roundCount must match currentRound
      await sm.saveSession(manifest);
      const summaries = await sm.listSessions({ limit: 1 });
      expect(summaries[0].roundCount).toBe(3);
    });

    it('AUDIT-03 fresh: invariant throws when result.rounds disagrees with max(stamped)', () => {
      const sm = new SessionManager(tmpSessionsRoot());
      const history = buildFreshHistory(); // max stamp = 3
      const drifted = { rounds: 5, solution: 'x', consensusReached: true }; // disagrees

      // Jest sets NODE_ENV=test automatically — invariant fires as throw
      expect(() => sm.createSessionManifest('consensus', 'task', agents, history, drifted))
        .toThrow(/round counter drift/i);
    });

    it('AUDIT-03 fresh: entries lacking roundNumber stamp fall back to positional index (back-compat)', () => {
      const sm = new SessionManager(tmpSessionsRoot());
      // Legacy entries — no roundNumber field at all
      const legacy: DiscussionHistoryEntry[] = [
        { role: 'user',      speaker: 'System', content: 'task',  timestamp: '' },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r1', timestamp: '' },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r1', timestamp: '' },
        { role: 'assistant', speaker: 'AgentC', model: 'gemini-x', content: 'r1', timestamp: '' },
      ];
      const result = { rounds: 1, solution: 'x', consensusReached: true };
      const manifest = sm.createSessionManifest('consensus', 'task', agents, legacy, result);

      // Positional fallback: Math.floor(index / 3) for indices 0..3 → [0, 0, 0, 1]
      // The invariant sees max(stamped)=1 and result.rounds=1 → no throw.
      expect(manifest.conversationHistory.map(m => m.roundNumber)).toEqual([0, 0, 0, 1]);
      expect(manifest.currentRound).toBe(1);
    });
  });

  describe('Continuation: resume preserves the unified counter across ContinuationHandler', () => {
    it('AUDIT-03 continuation: marker inherits max(parent stamps); user message is max + 1', () => {
      const parentHistory: SessionMessage[] = [
        { role: 'user',      speaker: 'System', content: 'task',            timestamp: '', roundNumber: 0 },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r1', timestamp: '', roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r1', timestamp: '', roundNumber: 1 },
        { role: 'user',      speaker: 'Judge',  content: 'guidance',        timestamp: '', roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r2', timestamp: '', roundNumber: 2 },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r2', timestamp: '', roundNumber: 2 },
        { role: 'user',      speaker: 'Judge',  content: 'guidance',        timestamp: '', roundNumber: 2 },
      ];
      const handler = new ContinuationHandler();
      const merged = handler.mergeContinuationContext(
        parentHistory,
        'follow-up',
        'task',
        'parent conclusion'
      );

      // Orphan Judge entries are filtered (INTEG-03) — marker + user message are appended.
      const marker = merged[merged.length - 2];
      const userMsg = merged[merged.length - 1];

      expect(marker.content).toBe('[CONTINUATION FROM PREVIOUS SESSION]');
      expect(marker.roundNumber).toBe(2); // Parent's max stamped round
      expect(userMsg.roundNumber).toBe(3); // Opens next round
      expect(userMsg.isContinuation).toBe(true);
    });

    it('AUDIT-03 continuation: reset branch summary.roundNumber equals session.currentRound', () => {
      const session: SessionManifest = {
        id: 'sess-1',
        timestamp: '',
        mode: 'consensus',
        task: 'task',
        agents: [],
        status: 'completed',
        currentRound: 4,
        conversationHistory: [],
        consensusReached: true,
        finalSolution: 'verdict',
        agentSubstitutions: {},
        cost: { totalCost: 0, totalTokens: { input: 0, output: 0 }, totalCalls: 0 },
        outputFiles: { transcript: '', json: '' },
      } as SessionManifest;

      const handler = new ContinuationHandler();
      const prepared = handler.prepareForContinuation(session, 'follow-up', { resetDiscussion: true });
      expect(prepared.mergedHistory).toHaveLength(1);
      expect(prepared.mergedHistory[0].roundNumber).toBe(4); // inherits parent's final round
      expect(prepared.mergedHistory[0].isContinuation).toBe(true);
    });

    it('AUDIT-03 continuation: when parent history has no stamps, falls back to filteredHistory.length (back-compat)', () => {
      const legacyParent: SessionMessage[] = [
        { role: 'user',      speaker: 'System', content: 'task', timestamp: '' } as SessionMessage,
        { role: 'assistant', speaker: 'AgentA', content: 'turn', timestamp: '' } as SessionMessage,
        { role: 'assistant', speaker: 'AgentB', content: 'turn', timestamp: '' } as SessionMessage,
      ];
      const handler = new ContinuationHandler();
      const merged = handler.mergeContinuationContext(legacyParent, 'follow', 'task', 'conclusion');
      const marker = merged[merged.length - 2];
      // filteredHistory length = 3 (no Judge entries to filter) → resumeRound falls back to 3
      expect(marker.roundNumber).toBe(3);
    });
  });
});
