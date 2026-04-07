---
phase: 11-audit-infrastructure-agents-for-quality
plan: 01
subsystem: core
tags: [dynamic-selection, speaker-selector, conversation-manager, termination, integration-tests]

# Dependency graph
requires:
  - phase: 10-status-mcp-tool
    provides: ConversationManager decomposed with AgentTurnExecutor, JudgeEvaluator
provides:
  - "Fixed runDynamicRound: selector shouldContinue=false ends rounds immediately (no forced speakers)"
  - "allAgentsContributed check preserved for per-discussion validation in both modes"
  - "4 new integration tests proving selector termination correctness in dynamic mode"
affects:
  - 11-02 (turn analytics and dissent instrumentation build on fixed termination)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "__lastInstance pattern for Jest mock SpeakerSelector instance access across test scope"
    - "Dynamic mode round loop respects selector authority — no forced overrides"

key-files:
  created: []
  modified:
    - src/core/ConversationManager.ts
    - src/orchestration/__tests__/ConversationManager.integration.test.ts

key-decisions:
  - "Remove force-remaining-agents block entirely (D-04): when selector says stop, round ends — no exceptions"
  - "allAgentsContributed check stays for both modes: scans all conversationHistory for cross-round validation (D-01)"
  - "Test scenarios must account for degraded-round detection: need 2+ contributors per round to avoid early abort"
  - "__lastInstance module pattern for SpeakerSelector mock: factory stores instance so tests configure it after CM construction"

patterns-established:
  - "Jest module mock with __lastInstance: store each new instance in module scope for per-test configuration access"

requirements-completed:
  - INFRA-01
  - INFRA-02
  - INFRA-03

# Metrics
duration: 35min
completed: 2026-04-06
---

# Phase 11 Plan 01: Selector Termination Fix Summary

**Removed 30-line force-remaining-agents override from runDynamicRound so dynamic discussions end when the selector says stop, not when all agents have spoken in the current round**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-06T00:00:00Z
- **Completed:** 2026-04-06T00:35:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 2

## Accomplishments

- Removed force-remaining-agents block from `runDynamicRound` — selector's `shouldContinue: false` now ends the round immediately
- Preserved the `allAgentsContributed` check that scans all of `conversationHistory` for cross-round validation (ensures every agent speaks at least once across the full discussion, not just current round)
- Added 4 integration tests proving all three success criteria: consensus not overridden when agents contributed, round ends on selector stop, consensus deferred when agent never spoke
- Fixed Jest SpeakerSelector mock pattern to use `__lastInstance` for reliable per-test control

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tests** - `236d2d4` (test)
2. **Task 1 GREEN: Remove force-remaining-agents** - `8bb7677` (fix)
3. **Task 2: Finalize integration tests (GREEN)** - `30a10db` (test)

## Files Created/Modified

- `src/core/ConversationManager.ts` - Removed 30-line force-remaining-agents block from `runDynamicRound()`, replaced with simple break that respects selector's `shouldContinue: false` decision
- `src/orchestration/__tests__/ConversationManager.integration.test.ts` - Updated SpeakerSelector mock to use `__lastInstance` pattern; added "selector termination fixes (Phase 11)" describe block with 4 tests

## Decisions Made

- **Remove force-remaining entirely (D-04):** The fix was simpler than anticipated — the block was fully redundant because `allAgentsContributed` already provides cross-round validation. No partial fix needed.
- **allAgentsContributed stays for both modes:** Context note in 11-CONTEXT.md suggested changing to per-discussion in dynamic mode, but the code already scans all of `conversationHistory` (not just current round). The only real fix was removing force-remaining.
- **__lastInstance mock pattern:** Module-level `jest.fn()` variables can't be referenced in `jest.mock` factory due to hoisting. Solution: factory stores each new instance in the module's own scope, accessible via `require('...SpeakerSelector').__lastInstance`.
- **Test scenarios require 2+ contributors per round:** The degraded-round check aborts if `roundContributors.size < 2` in any round. Dynamic mode tests must configure selector to have at least 2 agents speak per round to avoid false degraded abort.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SpeakerSelector jest.mock cannot reference hoisted module-level variables**
- **Found during:** Task 1 RED (integration tests)
- **Issue:** `jest.mock` factory is hoisted before `const mockSelectNextSpeaker = jest.fn()` declaration. The factory captures an uninitialized reference, so tests couldn't configure selector behavior.
- **Fix:** Changed to `__lastInstance` pattern — factory stores each constructed instance on the module object; tests access it via `require('...SpeakerSelector').__lastInstance` after CM construction.
- **Files modified:** `src/orchestration/__tests__/ConversationManager.integration.test.ts`
- **Verification:** All 4 new tests pass with correctly controlled selector behavior
- **Committed in:** `30a10db`

**2. [Rule 1 - Bug] Test scenarios conflicted with degraded-round detection**
- **Found during:** Task 2 (GREEN phase iteration)
- **Issue:** Initial test scenarios had only 1 agent speak in some rounds. The degraded-round check (`roundContributors.size < 2`) aborted the discussion before judge evaluation, causing `consensusReached: false` for the wrong reason.
- **Fix:** Redesigned scenarios to ensure at least 2 agents speak per round (Scholar + Architect in round 1, then Strategist in round 2).
- **Files modified:** `src/orchestration/__tests__/ConversationManager.integration.test.ts`
- **Verification:** Tests pass with correct behavior differentiation
- **Committed in:** `30a10db`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bug)
**Impact on plan:** Both fixes were test infrastructure bugs, not implementation bugs. Production code change was clean and correct on first attempt.

## Issues Encountered

None in production code. Test setup required two iterations to handle Jest module hoisting behavior and the degraded-round detection boundary condition.

## Known Stubs

None — no placeholder data or deferred wiring in this plan.

## Next Phase Readiness

- Selector termination bug is fixed and proven by integration tests
- Phase 11-02 (turn analytics + dissent instrumentation) can now build on reliable dynamic mode termination
- The `allAgentsContributed` invariant is preserved and tested — future plans can rely on it

## Self-Check: PASSED

- src/core/ConversationManager.ts: FOUND
- src/orchestration/__tests__/ConversationManager.integration.test.ts: FOUND
- .planning/phases/11-audit-infrastructure-agents-for-quality/11-01-SUMMARY.md: FOUND
- Commit 236d2d4: FOUND
- Commit 8bb7677: FOUND
- Commit 30a10db: FOUND

---
*Phase: 11-audit-infrastructure-agents-for-quality*
*Completed: 2026-04-06*
