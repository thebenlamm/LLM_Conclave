# Round-Membership Single Source of Truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD throughout.

**Goal:** Kill the round-membership debt class: one pure module owns "which round an entry belongs to" and "is this entry an agent contribution," route every per-round/contributor decision through it, and fix beta-feedback #7 (abort count disagrees with the participation table when a circuit-breaker System note truncates the backward scan).

**Architecture:** A new pure module `src/core/roundMembership.ts` exports `isAgentContribution`, `roundOf`, `contributorsForRound`, `contributorsOverall`. `entry.roundNumber` is authoritative; `roundOf` falls back to *structural* boundary inference (mirroring `groupHistoryByRound`'s delimiters) only when the stamp is absent — never the uniform-size arithmetic that `getRoundForEntry` currently uses. The #7 abort bug is fixed by replacing the backward history scan (which breaks at the first System note) with `contributorsForRound(history, currentRound)`, which keys off round stamps and so is immune to interleaved System notes.

**Tech Stack:** TypeScript, Jest. Build: `npm run build`. Test: `npm test -- --runInBand --watchman=false`. Baseline: 1439 tests, all green; count grows with new tests.

---

## Call-site catalog (audited)

### IN SCOPE — route through the new module

**The #7 abort bug (the fix):**
- `ConversationManager.ts:477-486` — backward scan, breaks at first `Judge`/`System`. → `contributorsForRound(history, currentRound)`.

**`getRoundForEntry` → `roundOf`:**
- `JudgeEvaluator.ts:230-241` `getRoundForEntry` (arithmetic) → delegate to `roundOf(entry, history)`. Callers at `:506, :519, :539` inherit the fix.

**Contributor-SET / membership decisions → `contributorsOverall`:**
- `ConversationManager.ts:658-663` (contributingAgents overall, drives `allAgentsContributed`).
- `JudgeEvaluator.ts:527-532` (contributingAgents overall, drives `allAgentsContributed`).

**Per-agent contribution predicate → `isAgentContribution(entry)`:**
- `ConversationManager.ts:569` (degraded turn analytics), `:867` (abort turn analytics), `:1006` (normal turn analytics).
- `DiscussionStateExtractor.ts:58, :124, :155, :178`.
- `JudgeEvaluator.ts:268, :292, :445` (and `:519/:539` predicate alongside the `roundOf` swap).
- `SessionManager.ts:358` (judge-coinage agent-turn corpus).
- `src/mcp/server.ts:1178, :1203, :1225, :1374, :1428, :1471` (formatting / agent-listing — these are the *exact* canonical predicate; folding is behavior-preserving. `:1178/:1374` lack `role==='assistant'`; adding it via the helper is a safe tightening — no `role:'user'` entry has a non-Judge/System speaker).

### OUT OF SCOPE — different decisions wearing similar clothes (leave, verified)
- `ConversationHistory.ts:250, :334` — compression role-classification; **intentionally keeps error entries**. Different predicate.
- `ConversationHistory.ts:149-173` `groupHistoryByRound` — round *delimiter* logic; `roundOf`'s fallback mirrors it but does not replace it.
- `src/mcp/server.ts:946-957` — streaming event-emission round state machine.
- `src/mcp/server.ts:1482` `turnsPayload` — intentionally unfiltered full replay.
- `JudgeEvaluator.ts:254-256` `buildCaseFile` — `role:'user' && speaker:'System'` locates the **task**, not contributors.
- `ContinuationHandler.ts:82, :195` — orphan judge-guidance filter (parent-session cleanup).
- `ConversationManager.ts:1282` `agentsWhoContributedThisRound` — live in-loop accumulator in `runDynamicRound`, not a history scan. (The shared abort scan at :477 runs after both paths, so the fix covers dynamic too.)

---

## Task 1: Create the `roundMembership` module + unit tests (pure, TDD)

**Files:**
- Create: `src/core/roundMembership.ts`
- Test: `src/core/__tests__/roundMembership.test.ts`

- [ ] **Step 1: Write failing tests** for all four helpers, including #7's first/middle/last System-note positions.

```typescript
import { DiscussionHistoryEntry } from '../../types';
import {
  isAgentContribution,
  roundOf,
  contributorsForRound,
  contributorsOverall,
} from '../roundMembership';

const agent = (speaker: string, round?: number, over: Partial<DiscussionHistoryEntry> = {}): DiscussionHistoryEntry =>
  ({ role: 'assistant', speaker, content: `${speaker} says something`, roundNumber: round, ...over });
const errored = (speaker: string, round?: number): DiscussionHistoryEntry =>
  agent(speaker, round, { error: true, content: `[${speaker} unavailable]` });
const judgeGuidance = (round?: number): DiscussionHistoryEntry =>
  ({ role: 'user', speaker: 'Judge', content: 'guidance', roundNumber: round });
const systemNote = (round?: number): DiscussionHistoryEntry =>
  ({ role: 'user', speaker: 'System', content: '[System: X removed]', roundNumber: round });
const task = (): DiscussionHistoryEntry =>
  ({ role: 'user', speaker: 'System', content: 'Task: decide', roundNumber: 0 });

describe('isAgentContribution', () => {
  it('accepts a non-error assistant turn with a real speaker', () => {
    expect(isAgentContribution(agent('Agent1', 1))).toBe(true);
  });
  it('rejects Judge, System, errors, and non-assistant roles', () => {
    expect(isAgentContribution(judgeGuidance(1))).toBe(false);
    expect(isAgentContribution(systemNote(1))).toBe(false);
    expect(isAgentContribution(errored('Agent1', 1))).toBe(false);
    expect(isAgentContribution(task())).toBe(false);
    expect(isAgentContribution({ role: 'assistant', speaker: '', content: 'x' } as any)).toBe(false);
  });
});

describe('roundOf', () => {
  it('returns the authoritative stamp when present (including 0)', () => {
    expect(roundOf(task())).toBe(0);
    expect(roundOf(agent('Agent1', 3))).toBe(3);
  });
  it('falls back to structural boundary inference when the stamp is absent', () => {
    // Legacy/unstamped history: task, r1a1, r1a2, judge, r2a1, r2a2
    const h: DiscussionHistoryEntry[] = [
      { role: 'user', speaker: 'System', content: 'Task: t' },
      agent('Agent1'), agent('Agent2'),
      { role: 'user', speaker: 'Judge', content: 'g' },
      agent('Agent1'), agent('Agent2'),
    ];
    expect(roundOf(h[0], h)).toBe(1); // task → round 1 (0 boundaries before)
    expect(roundOf(h[1], h)).toBe(1);
    expect(roundOf(h[4], h)).toBe(2); // after one Judge-guidance boundary
  });
  it('counts compressed-summary entries as boundaries in the fallback', () => {
    const h: DiscussionHistoryEntry[] = [
      agent('Agent1'),
      { role: 'user', speaker: 'System', content: '[Round 1 summary]', compressed: true } as any,
      agent('Agent1'),
    ];
    expect(roundOf(h[2], h)).toBe(2);
  });
});

describe('contributorsForRound — immune to interleaved System notes (#7)', () => {
  // Two healthy agents + a failing agent's error + breaker System note, all stamped round 2.
  // The System-note POSITION must not change the result.
  const build = (notePos: 'first' | 'middle' | 'last'): DiscussionHistoryEntry[] => {
    const a = agent('Agent2', 2), b = agent('Agent3', 2);
    const fail = errored('AgentFail', 2), note = systemNote(2);
    const round2 =
      notePos === 'first' ? [fail, note, a, b] :
      notePos === 'middle' ? [a, fail, note, b] :
      [a, b, fail, note];
    return [task(), agent('Agent2', 1), agent('Agent3', 1), judgeGuidance(1), ...round2];
  };
  it.each(['first', 'middle', 'last'] as const)('counts both healthy agents with System note %s', (pos) => {
    const set = contributorsForRound(build(pos), 2);
    expect(set).toEqual(new Set(['Agent2', 'Agent3']));
  });
  it('returns a genuinely-doomed round (1 distinct agent) as size 1', () => {
    const h = [task(), agent('Agent2', 1), errored('AgentFail', 1), systemNote(1)];
    expect(contributorsForRound(h, 1)).toEqual(new Set(['Agent2']));
  });
});

describe('contributorsOverall', () => {
  it('unions distinct agent speakers across all rounds, excluding errors/Judge/System', () => {
    const h = [
      task(), agent('A', 1), agent('B', 1), errored('C', 1), judgeGuidance(1),
      agent('A', 2), agent('C', 2),
    ];
    expect(contributorsOverall(h)).toEqual(new Set(['A', 'B', 'C']));
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- --runInBand --watchman=false src/core/__tests__/roundMembership.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/core/roundMembership.ts`**

```typescript
import { DiscussionHistoryEntry } from '../types';

/**
 * Single source of truth for round membership and contributor identification.
 *
 * `entry.roundNumber` (Phase 18 AUDIT-03) is the authoritative round stamp; it is
 * set at push time in ConversationManager, AgentTurnExecutor, and ContinuationHandler.
 * These helpers read that stamp and apply the ONE canonical predicate for "this entry
 * is an agent's substantive contribution," replacing logic that was previously
 * copy-pasted across the codebase and re-derived via fragile arithmetic.
 */

/**
 * The canonical contributor predicate: a non-error assistant turn from a real
 * agent (not the Judge, not a System note).
 */
export function isAgentContribution(entry: DiscussionHistoryEntry): boolean {
  return (
    entry.role === 'assistant' &&
    !!entry.speaker &&
    entry.speaker !== 'Judge' &&
    entry.speaker !== 'System' &&
    !entry.error
  );
}

/**
 * The round an entry belongs to. Reads the authoritative `entry.roundNumber`
 * stamp when present (including the legitimate 0 for the pre-round-1 task).
 *
 * Falls back to STRUCTURAL boundary inference ONLY when the stamp is absent
 * (legacy in-memory entries / restored sessions / test fixtures): counts the
 * round delimiters before the entry's position and adds 1. Delimiters mirror
 * `ConversationHistory.groupHistoryByRound` exactly — Judge guidance
 * (`role:'user'` + `speaker:'Judge'`) and compressed round summaries
 * (`compressed === true`) — so the two stay in lockstep. It deliberately does
 * NOT use uniform-size arithmetic (responses / agentCount), which silently
 * miscounts the moment any agent fails, skips, or aborts.
 */
export function roundOf(
  entry: DiscussionHistoryEntry,
  history?: DiscussionHistoryEntry[]
): number {
  if (typeof entry.roundNumber === 'number') return entry.roundNumber;
  if (!history || history.length === 0) return 0;

  const index = history.indexOf(entry);
  if (index < 0) return 0;

  let boundaries = 0;
  for (let i = 0; i < index; i++) {
    const e = history[i];
    const isJudgeGuidance = e.speaker === 'Judge' && e.role === 'user';
    const isCompressedRound = (e as any).compressed === true;
    if (isJudgeGuidance || isCompressedRound) boundaries++;
  }
  return boundaries + 1;
}

/**
 * The distinct set of agents that contributed in round `n`. Keys off the round
 * stamp (via `roundOf`) and the canonical predicate, so interleaved System notes
 * or errored turns never truncate or inflate the count — the fix for the
 * beta-feedback #7 abort/participation mismatch.
 */
export function contributorsForRound(
  history: DiscussionHistoryEntry[],
  n: number
): Set<string> {
  const contributors = new Set<string>();
  for (const entry of history) {
    if (isAgentContribution(entry) && roundOf(entry, history) === n) {
      contributors.add(entry.speaker);
    }
  }
  return contributors;
}

/**
 * The distinct set of agents that contributed across the whole discussion.
 */
export function contributorsOverall(history: DiscussionHistoryEntry[]): Set<string> {
  const contributors = new Set<string>();
  for (const entry of history) {
    if (isAgentContribution(entry)) contributors.add(entry.speaker);
  }
  return contributors;
}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `refactor(round-membership): add roundMembership single-source-of-truth module`.

---

## Task 2: Fix the #7 abort bug (failing test first)

**Files:**
- Modify: `src/core/ConversationManager.ts:477-486`
- Test: `src/orchestration/__tests__/ConversationManager.quality.test.ts` (add failing-agent-LAST regression beside the b588485 first-position test)

- [ ] **Step 1: Write failing integration test — failing-agent LAST must NOT abort.** Mirror the b588485 test's harness but list `AgentFail` LAST in agent order. Pre-fix, the backward scan hits the System note immediately and reports 0 contributors → aborts. Post-fix it must reach the cost-awareness gate (≥2 healthy spoke).

```typescript
it('#7: does NOT abort when the failing agent is LAST in the round (System note no longer truncates the count)', async () => {
  const mockAgentOk = jest.fn().mockResolvedValue({ text: 'Substantive position with real detail and tradeoffs.' });
  const mockAgentFail = jest.fn().mockRejectedValue(new Error('fatal agent meltdown'));
  const mockJudgeChat = jest.fn().mockResolvedValue({ text: 'No consensus yet. Keep discussing the tradeoffs.' });
  const mockFallbackChat = jest.fn().mockResolvedValue({ text: buildFinalVoteText({ summary: 'fallback summary' }) });

  (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
    if (model === 'mistral-large-latest') return { chat: mockAgentFail, getProviderName: jest.fn().mockReturnValue('Mistral') };
    if (model === 'gpt-4o') return { chat: mockAgentOk, getProviderName: jest.fn().mockReturnValue('OpenAI') };
    if (model === 'claude-sonnet-4-6') return { chat: mockAgentOk, getProviderName: jest.fn().mockReturnValue('Claude') };
    if (model === 'gemini-2.5-flash') return { chat: mockFallbackChat, getProviderName: jest.fn().mockReturnValue('Gemini') };
    return { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') };
  });

  // AgentFail listed LAST — the position that pre-fix truncated the backward scan to 0.
  const config = {
    turn_management: 'roundrobin',
    agents: {
      Agent2: { model: 'gpt-4o', prompt: 'A2' },
      Agent3: { model: 'claude-sonnet-4-6', prompt: 'A3' },
      AgentFail: { model: 'mistral-large-latest', prompt: 'AF' },
    },
    judge: { model: 'gpt-4o', prompt: 'Judge' },
    max_rounds: 3,
    min_rounds: 0,
  };

  const statusMessages: string[] = [];
  const eventBus: any = {
    on: jest.fn(),
    emitEvent: jest.fn((type: string, payload: any) => {
      if (type === 'status' && payload?.message) statusMessages.push(payload.message);
    }),
  };

  const cm = new ConversationManager(config, null, false, eventBus, false, 'gpt-4o-mini', { disableRouting: true });
  const judge = { provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') }, systemPrompt: 'Judge', model: 'gpt-4o' };

  const result = await cm.startConversation('Decide architecture', judge);

  // Must NOT abort for a degraded count: no "degraded: only ... responded this round" abort message.
  expect(statusMessages.some(m => /degraded: only \d+ of \d+ agents responded this round/.test(m))).toBe(false);
  expect((result as any).degraded).not.toBe(true);
  // The cost-awareness gate fires instead — the run proceeded with the reduced panel.
  expect(statusMessages.filter(m => m.startsWith('Cost awareness: panel degraded')).length).toBe(1);
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- --runInBand --watchman=false src/orchestration/__tests__/ConversationManager.quality.test.ts -t "#7"` → FAIL (run aborts / degraded true, cost gate count 0).

- [ ] **Step 3: Implement the fix.** Replace the backward scan at `ConversationManager.ts:477-486`:

```typescript
      // Early abort: count how many distinct agents actually contributed THIS
      // round. Keyed off the authoritative round stamp via contributorsForRound
      // (beta-feedback #7) — the previous backward scan broke at the first
      // System note, so a mid-round circuit-breaker note dropped contributors
      // who spoke before the failing agent, undercounting the round.
      const roundContributors = contributorsForRound(this.conversationHistory, this.currentRound);
```

Add the import at the top of the file (alongside other `../core` imports; it is in the same dir, so `./roundMembership`):

```typescript
import { contributorsForRound, contributorsOverall, isAgentContribution } from './roundMembership';
```

- [ ] **Step 4: Run, verify pass** — the #7 test passes AND the b588485 first-position test still passes:
`npm test -- --runInBand --watchman=false src/orchestration/__tests__/ConversationManager.quality.test.ts` → PASS.

- [ ] **Step 5: Commit** — `fix(abort): count round contributors by round stamp, not a System-note-truncated scan (beta-feedback #7)`.

---

## Task 3: Replace `getRoundForEntry` arithmetic with `roundOf`

**Files:**
- Modify: `src/core/JudgeEvaluator.ts:230-241`
- Test: existing `src/core/__tests__/JudgeEvaluator.test.ts:82-112` must stay green (unstamped fixtures exercise the structural fallback: task→1, r1→1, r2→2).

- [ ] **Step 1: Run existing tests to capture green baseline** — `npm test -- --runInBand --watchman=false src/core/__tests__/JudgeEvaluator.test.ts -t getRoundForEntry` → PASS.

- [ ] **Step 2: Replace the method body** to delegate (kept as a thin private wrapper so internal call sites at :506/:519/:539 are unchanged):

```typescript
  /**
   * Which round an entry belongs to. Delegates to the roundMembership
   * single-source-of-truth: the authoritative `entry.roundNumber` stamp when
   * present, else structural boundary inference. Replaces the former
   * uniform-size arithmetic (responses / agentOrder.length), which miscounted
   * whenever an agent failed or skipped.
   */
  private getRoundForEntry(entry: DiscussionHistoryEntry): number {
    return roundOf(entry, this.deps.conversationHistory);
  }
```

Add import at top of `JudgeEvaluator.ts`:

```typescript
import { roundOf, isAgentContribution, contributorsOverall } from './roundMembership';
```

- [ ] **Step 3: Run, verify pass** — getRoundForEntry tests still PASS (fallback reproduces the expected rounds).

- [ ] **Step 4: Commit** — `refactor(judge): derive entry round via roundOf (roundNumber authoritative), retire arithmetic fossil`.

---

## Task 4: Route the remaining contributor/round predicate sites through the module

Behavior-preserving dedup. After each file, run that file's tests. One commit at the end.

**Files & exact edits:**

- [ ] **`src/core/ConversationManager.ts`**
  - `:658-663` → `const contributingAgents = contributorsOverall(this.conversationHistory);` (drives `allAgentsContributed`; replaces the inline loop).
  - `:569`, `:867`, `:1006` turn-analytics loops → swap the inline predicate for `if (isAgentContribution(entry)) {`.

- [ ] **`src/core/JudgeEvaluator.ts`**
  - `:268`, `:445` → `if (isAgentContribution(entry)) {`.
  - `:292` → `.filter((e: any) => isAgentContribution(e))`.
  - `:527-532` (contributingAgents overall) → `const contributingAgents = contributorsOverall(this.deps.conversationHistory);`.
  - `:519` / `:539` → keep the `getRoundForEntry(e) === currentRound` round filter (now routed via `roundOf`); swap the predicate half for `isAgentContribution(e)`. `:519` deliberately retains its current semantics except: it currently lacks `!e.error`; `isAgentContribution` adds it — an errored turn's content is `[X unavailable]`, which never matches the quoting patterns, so this is a safe tightening. Note in commit.

- [ ] **`src/core/DiscussionStateExtractor.ts`**
  - `:58`, `:124`, `:178` → `if (isAgentContribution(entry)) {`.
  - `:155` → `.filter((e: any) => isAgentContribution(e))` (inside a round group, `role:'assistant'` already excluded Judge; identity change).
  - Add import: `import { isAgentContribution } from './roundMembership';`.

- [ ] **`src/core/SessionManager.ts`**
  - `:356-359` agent-turn corpus filter → `.filter((m: any) => isAgentContribution(m))`.
  - Add import: `import { isAgentContribution } from './roundMembership';`.

- [ ] **`src/mcp/server.ts`**
  - `:1176-1181` (`speakers` set for `**Agents:**`) → build via `const speakers = contributorsOverall(conversationHistory);` (drop the manual loop; preserves order? Set iteration is insertion order — `contributorsOverall` adds in history order, identical).
  - `:1201-1209` per-agent last-turn loop → replace the two `continue` guards (`role`, `Judge/System`, `error`) with `if (!isAgentContribution(entry)) continue;`.
  - `:1224-1226` judge-failed fallback filter → `.filter((e: any) => isAgentContribution(e))`.
  - `:1370-1378` JSON agents listing → keep the `seen`/order/`model` capture, replace the predicate with `if (isAgentContribution(msg) && !seen.has(msg.speaker)) {`.
  - `:1426-1434` per-agent JSON loop → `if (!isAgentContribution(entry)) continue;`.
  - `:1469-1472` coinage corpus filter → `.filter((m: any) => isAgentContribution(m))`.
  - Add import: `import { isAgentContribution, contributorsOverall } from '../core/roundMembership.js';` (note `.js` extension — this file uses ESM-style import specifiers).

- [ ] **Run** `npm test -- --runInBand --watchman=false` → full suite PASS.

- [ ] **Commit** — `refactor(round-membership): route all contributor/round predicates through roundMembership`.

---

## Task 5: Invariant lock — every pushed entry carries a numeric round stamp

**Files:**
- Test: `src/orchestration/__tests__/ConversationManager.quality.test.ts` (new test)

- [ ] **Step 1: Write the test.** Run a small healthy 2-agent discussion to consensus and assert every conversationHistory entry has `typeof roundNumber === 'number'` (catches any push site that leaves the stamp undefined mid-run).

```typescript
it('stamps a numeric roundNumber on every pushed history entry (task, agent turns, System notes, judge)', async () => {
  const mockAgentOk = jest.fn().mockResolvedValue({ text: 'Substantive position with detail.' });
  const mockJudgeChat = jest.fn().mockResolvedValue({ text: buildFinalVoteText({ summary: 'agreed' }) });
  (ProviderFactory.createProvider as jest.Mock).mockImplementation(() => ({ chat: mockAgentOk, getProviderName: jest.fn().mockReturnValue('P') }));

  const config = {
    turn_management: 'roundrobin',
    agents: { A1: { model: 'gpt-4o', prompt: 'a' }, A2: { model: 'claude-sonnet-4-6', prompt: 'b' } },
    judge: { model: 'gpt-4o', prompt: 'Judge' },
    max_rounds: 2, min_rounds: 0,
  };
  const cm = new ConversationManager(config, null, false, undefined, false, 'gpt-4o-mini', { disableRouting: true });
  const judge = { provider: { chat: mockJudgeChat, getProviderName: jest.fn().mockReturnValue('Judge') }, systemPrompt: 'Judge', model: 'gpt-4o' };
  const result = await cm.startConversation('Decide', judge);

  for (const entry of (result as any).conversationHistory) {
    expect(typeof entry.roundNumber).toBe('number');
  }
});
```

- [ ] **Step 2: Run.** If any entry is unstamped, FIX THE STAMP at its push site (do not paper over it in `roundOf`). Expected: PASS (all production push sites already stamp per the catalog).

- [ ] **Step 3: Commit** (fold into Task 4's commit if run together, else) — `test(round-membership): lock roundNumber-stamped invariant on every pushed entry`.

---

## Task 6: Verify the abort-message ↔ participation-table invariant

**Files:**
- Test: `src/orchestration/__tests__/ConversationManager.quality.test.ts` (new test) — a genuinely-doomed round that DOES abort with a System note present.

- [ ] **Step 1: Write the test.** 3-agent panel where 2 agents fail by round 2 (breaker trips → System note), leaving 1 distinct contributor → the run aborts. Assert the abort message's per-round number equals `1` and the run-total / participation `spoken` count agree (no `0 of 3` undercount). Capture the abort `status` message and the returned `runIntegrity.participation`.

```typescript
it('#7: when a round genuinely degrades, the abort per-round count matches true contributors and run-total matches the participation table', async () => {
  const mockOk = jest.fn().mockResolvedValue({ text: 'Position with detail.' });
  const mockFail = jest.fn().mockRejectedValue(new Error('hard failure'));
  const mockJudge = jest.fn().mockResolvedValue({ text: 'No consensus. Continue.' });
  const mockFallback = jest.fn().mockResolvedValue({ text: buildFinalVoteText({ summary: 's' }) });

  (ProviderFactory.createProvider as jest.Mock).mockImplementation((model: string) => {
    if (model === 'mistral-large-latest') return { chat: mockFail, getProviderName: jest.fn().mockReturnValue('Mistral') };
    if (model === 'grok-2-latest') return { chat: mockFail, getProviderName: jest.fn().mockReturnValue('Grok') };
    if (model === 'gpt-4o') return { chat: mockOk, getProviderName: jest.fn().mockReturnValue('OpenAI') };
    if (model === 'gemini-2.5-flash') return { chat: mockFallback, getProviderName: jest.fn().mockReturnValue('Gemini') };
    return { chat: mockJudge, getProviderName: jest.fn().mockReturnValue('Judge') };
  });

  const config = {
    turn_management: 'roundrobin',
    agents: {
      Healthy: { model: 'gpt-4o', prompt: 'h' },
      Fail1: { model: 'mistral-large-latest', prompt: 'f1' },
      Fail2: { model: 'grok-2-latest', prompt: 'f2' },
    },
    judge: { model: 'gpt-4o', prompt: 'Judge' },
    max_rounds: 4, min_rounds: 0,
  };
  const statusMessages: string[] = [];
  const eventBus: any = { on: jest.fn(), emitEvent: jest.fn((t: string, p: any) => { if (t === 'status' && p?.message) statusMessages.push(p.message); }) };
  const cm = new ConversationManager(config, null, false, eventBus, false, 'gpt-4o-mini', { disableRouting: true });
  const judge = { provider: { chat: mockJudge, getProviderName: jest.fn().mockReturnValue('Judge') }, systemPrompt: 'Judge', model: 'gpt-4o' };

  const result = await cm.startConversation('Decide', judge);

  const abortMsg = statusMessages.find(m => /degraded: only \d+ of \d+ agents responded this round/.test(m));
  expect(abortMsg).toBeDefined();
  // Per-round count is the TRUE distinct contributor count for the degraded round — 1, never 0.
  const perRound = Number(abortMsg!.match(/only (\d+) of \d+ agents/)![1]);
  expect(perRound).toBe(1);
  // Run-total in the message equals the participation table's 'spoken' count.
  const runTotal = Number(abortMsg!.match(/\((\d+) spoke across the run\)/)![1]);
  const spoken = ((result as any).runIntegrity?.participation ?? []).filter((p: any) => p.status === 'spoken').length;
  expect(runTotal).toBe(spoken);
});
```

> Note: exact round at which both fail agents trip the breaker depends on the 2-consecutive-failure rule; if the panel aborts at the `<2` guard in round 1 (both fail immediately, only Healthy speaks) the assertions still hold (`perRound === 1`). Adjust mock model names to the config's actual defaults if `grok-2-latest`/`mistral-large-latest` are not what the test factory expects — verify against the b588485 test's working model names.

- [ ] **Step 2: Run, verify pass.** If `perRound` resolves to `0` pre-fix, that's the bug; post-Task-2 it must be `1`. → PASS.

- [ ] **Step 3: Commit** — `test(abort): lock abort-count == participation 'spoken' count for a mid-round breaker trip`.

---

## Task 7: Full verification + adversarial review

- [ ] **Step 1:** `npm run build` → 0 errors.
- [ ] **Step 2:** `npm test -- --runInBand --watchman=false` → all green (≥1439 + new tests). Note any pre-existing sandbox artifact-store failures (expected per CLAUDE.md) and confirm they are unrelated.
- [ ] **Step 3:** Adversarial review on the final diff only (give reviewer the diff, expect 2-5 rounds, triage). Use the `advisor` tool before declaring done.
- [ ] **Step 4:** Rebuild + restart the MCP server per CLAUDE.md/memory before any live verification.

---

## Self-review notes
- **Spec coverage:** #7 abort fix (T2), module + 4 helpers (T1), `getRoundForEntry`→`roundOf` (T3), predicate dedup all sites (T4), cost-gate first kept + last added (T2), genuinely-doomed still aborts (T1 helper test + T6), stamp invariant (T5), abort==participation (T6). ✓
- **Out-of-scope folded only if same decision:** server.ts formatting sites folded (exact predicate); ConversationHistory compression, streaming events, turnsPayload, buildCaseFile task-finder, ContinuationHandler orphan-filter, dynamic accumulator — all left, reasons logged in catalog. ✓
- **No behavior change intended** except the correct `[Round 0]` label for the stamped task entry in the judge cached-discussion text (grep confirmed no test couples to `[Round 1] System`/`Task`).
