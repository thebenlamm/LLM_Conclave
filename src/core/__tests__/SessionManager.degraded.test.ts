/**
 * Phase 20 (AUDIT-05) regression tests — pins the degraded completion status
 * signal across SessionManager.computeSessionStatus and createSessionManifest.
 *
 * Covers ROADMAP Phase 20 Success Criteria:
 *   SC#1: session.status === 'completed_degraded' on any of 4 degradation signals
 *         (substitution, failure, absent agent, summarizer fallback)
 *   SC#2: session.status === 'completed' on a clean run
 *
 * The pure-helper describe block covers every signal in isolation; the
 * createSessionManifest integration describe pins the end-to-end assignment.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import SessionManager, { computeSessionStatus } from '../SessionManager';
import type { SessionManifest } from '../../types/index.js';

// Test 12 (type-level / tsc): force tsc to verify the new enum value compiles.
// If the union is reverted, this line fails to type-check.
const _typeCheckCompletedDegraded: SessionManifest['status'] = 'completed_degraded';
void _typeCheckCompletedDegraded;

function tmpSessionsRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase20-degraded-'));
}

const sampleAgents = [
  { name: 'AgentA', model: 'claude-x', provider: { constructor: { name: 'ClaudeProvider' } }, systemPrompt: '' },
  { name: 'AgentB', model: 'gpt-x',    provider: { constructor: { name: 'OpenAIProvider' } }, systemPrompt: '' },
];

function cleanRunRunIntegrity() {
  return {
    compression: {
      active: false,
      activatedAtRound: null,
      tailSize: 0,
      summaryRegenerations: 0,
      summarizerFallback: null,
    },
    participation: [
      { agent: 'AgentA', turns: 3, status: 'spoken' },
      { agent: 'AgentB', turns: 3, status: 'spoken' },
    ],
  };
}

describe('AUDIT-05 computeSessionStatus + SessionManifest.status degradation (Phase 20)', () => {
  describe('computeSessionStatus pure helper', () => {
    it('clean run: returns "completed" when no signals fire', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: cleanRunRunIntegrity(),
      };
      expect(computeSessionStatus(result)).toBe('completed');
    });

    it('substitution fired: returns "completed_degraded"', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {
          Alice: { original: 'gpt-5', fallback: 'gpt-4o-mini', reason: '429' },
        },
        runIntegrity: cleanRunRunIntegrity(),
      };
      expect(computeSessionStatus(result)).toBe('completed_degraded');
    });

    it('agent failed: returns "completed_degraded"', () => {
      const result = {
        failedAgents: ['Bob'],
        agentSubstitutions: {},
        runIntegrity: cleanRunRunIntegrity(),
      };
      expect(computeSessionStatus(result)).toBe('completed_degraded');
    });

    it('agent absent-silent: returns "completed_degraded"', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: {
          compression: cleanRunRunIntegrity().compression,
          participation: [
            { agent: 'AgentA', turns: 3, status: 'spoken' },
            { agent: 'Bob', turns: 0, status: 'absent-silent' },
          ],
        },
      };
      expect(computeSessionStatus(result)).toBe('completed_degraded');
    });

    it('agent absent-capped: returns "completed_degraded"', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: {
          compression: cleanRunRunIntegrity().compression,
          participation: [
            { agent: 'AgentA', turns: 5, status: 'spoken' },
            { agent: 'Bob', turns: 1, status: 'absent-capped', ratioAtExclusion: 0.9 },
          ],
        },
      };
      expect(computeSessionStatus(result)).toBe('completed_degraded');
    });

    it('agent absent-failed: returns "completed_degraded"', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: {
          compression: cleanRunRunIntegrity().compression,
          participation: [
            { agent: 'AgentA', turns: 3, status: 'spoken' },
            { agent: 'Bob', turns: 0, status: 'absent-failed', reason: 'hard-fail' },
          ],
        },
      };
      expect(computeSessionStatus(result)).toBe('completed_degraded');
    });

    it('summarizer fallback fired: returns "completed_degraded"', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: {
          compression: {
            active: true,
            activatedAtRound: 2,
            tailSize: 4,
            summaryRegenerations: 1,
            summarizerFallback: {
              original: 'claude-haiku',
              substitute: 'gpt-4o-mini',
              reason: 'timeout',
            },
          },
          participation: cleanRunRunIntegrity().participation,
        },
      };
      expect(computeSessionStatus(result)).toBe('completed_degraded');
    });

    it('compression-active-alone is NOT degraded: returns "completed"', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: {
          compression: {
            active: true,
            activatedAtRound: 2,
            tailSize: 4,
            summaryRegenerations: 1,
            summarizerFallback: null, // no fallback = compression worked cleanly
          },
          participation: cleanRunRunIntegrity().participation,
        },
      };
      expect(computeSessionStatus(result)).toBe('completed');
    });

    it('missing runIntegrity defensively: returns "completed" when no other signals', () => {
      const result = {
        failedAgents: [],
        agentSubstitutions: {},
        // runIntegrity intentionally omitted — simulates legacy fixture pre-Phase-13.1
      };
      expect(computeSessionStatus(result)).toBe('completed');
    });
  });

  describe('createSessionManifest integration', () => {
    it('end-to-end with substitution: manifest.status === "completed_degraded"', () => {
      const sm = new SessionManager(tmpSessionsRoot());
      const history = [
        { role: 'user',      speaker: 'System', content: 'task',   roundNumber: 0 },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r1a', roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-4o-mini', content: 'r1b', roundNumber: 1 },
      ];
      const result = {
        rounds: 1,
        solution: 'v',
        consensusReached: true,
        failedAgents: [],
        agentSubstitutions: {
          AgentB: { original: 'gpt-5', fallback: 'gpt-4o-mini', reason: '429' },
        },
        runIntegrity: cleanRunRunIntegrity(),
      };
      const manifest = sm.createSessionManifest('consensus', 'task', sampleAgents, history, result);
      expect(manifest.status).toBe('completed_degraded');
    });

    it('end-to-end with clean result: manifest.status === "completed"', () => {
      const sm = new SessionManager(tmpSessionsRoot());
      const history = [
        { role: 'user',      speaker: 'System', content: 'task',   roundNumber: 0 },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r1a', roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r1b', roundNumber: 1 },
      ];
      const result = {
        rounds: 1,
        solution: 'v',
        consensusReached: true,
        failedAgents: [],
        agentSubstitutions: {},
        runIntegrity: cleanRunRunIntegrity(),
      };
      const manifest = sm.createSessionManifest('consensus', 'task', sampleAgents, history, result);
      expect(manifest.status).toBe('completed');
    });
  });
});
