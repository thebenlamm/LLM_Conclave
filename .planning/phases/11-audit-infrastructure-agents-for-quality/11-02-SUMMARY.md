---
phase: 11-audit-infrastructure-agents-for-quality
plan: 02
subsystem: core
tags: [turn-analytics, dissent-quality, session-json, tool-response, conversation-manager]

# Dependency graph
requires:
  - phase: 11-01
    provides: "Fixed selector termination in runDynamicRound"
provides:
  - "turn_analytics: per-agent turn counts and token share % on all ConversationManager return paths"
  - "dissent_quality: captured/missing/not_applicable on all ConversationManager return paths"
  - "Turns one-liner in markdown tool response after cost stats"
  - "dissent_quality warning in markdown tool response when dissent missing despite non-consensus"
  - "turn_analytics and dissent_quality in JSON tool response and session manifest"
affects:
  - callers of discuss/continue tools (new fields in tool response)
  - session JSON files (new persisted fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content length / 4 as token proxy for per-agent token share estimation"
    - "dissent_quality: 'not_applicable' on degraded/abort paths, computed from dissent array on normal path"

key-files:
  created: []
  modified:
    - src/core/ConversationManager.ts
    - src/mcp/server.ts
    - src/core/SessionManager.ts
    - src/types/index.ts

key-decisions:
  - "Token proxy via content length / 4: actual per-entry tokens not tracked in DiscussionHistoryEntry — char/4 approximation is good enough for relative share display"
  - "dissent_quality 'not_applicable' on degraded/abort paths: these end due to failure not disagreement, so missing dissent is expected"
  - "Turn analytics in discuss mode only (not consult): consult uses different conversation model (all agents every round)"

patterns-established:
  - "New analytics fields added to all three ConversationManager return paths (normal, degraded, abort)"

requirements-completed:
  - INFRA-04
  - INFRA-05

# Metrics
duration: 2min
completed: 2026-04-07
---

# Phase 11 Plan 02: Turn Analytics and Dissent Quality Instrumentation Summary

**Added per-agent turn counts and token share percentage to all ConversationManager return paths, plus dissent_quality field with missing-dissent warning in tool response**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-07T06:23:01Z
- **Completed:** 2026-04-07T06:25:26Z
- **Tasks:** 2 (both auto)
- **Files modified:** 4

## Accomplishments

- Added `turn_analytics.per_agent` (name, turns, token_share_pct sorted by turn count) to all three ConversationManager return paths: normal, degraded, and abort/timeout
- Added `dissent_quality` ('captured' | 'missing' | 'not_applicable') to all three return paths — computes from dissent array content on normal path, 'not_applicable' on failure paths
- Added `**Turns:** Scholar 4, Architect 3 | **Tokens:** 60%/40%` one-liner to markdown tool response after cost stats
- Added dissent warning line to tool response when `dissent_quality === 'missing'`
- Added `turn_analytics` and `dissent_quality` to `formatDiscussionResultJson` return object
- Extended `SessionManifest` type and `createSessionManifest` to persist both fields in session JSON

## Task Commits

Each task was committed atomically:

1. **Task 1: Compute turn analytics and dissent quality in ConversationManager** - `42d147d` (feat)
2. **Task 2: Surface turn analytics and dissent quality in tool response and session JSON** - `d626595` (feat)

## Files Created/Modified

- `src/core/ConversationManager.ts` - Turn analytics computation and dissent_quality on all 3 return paths
- `src/mcp/server.ts` - Turns one-liner and dissent warning in formatDiscussionResult; turn_analytics + dissent_quality in formatDiscussionResultJson
- `src/core/SessionManager.ts` - Persist turn_analytics and dissent_quality in createSessionManifest
- `src/types/index.ts` - Added optional turn_analytics and dissent_quality fields to SessionManifest interface

## Decisions Made

- **Token proxy via content length / 4:** Actual per-entry tokens are not tracked in DiscussionHistoryEntry. Using character count / 4 as approximation gives relative share percentages that are good enough for display without requiring provider-level instrumentation.
- **dissent_quality 'not_applicable' on degraded/abort paths:** These exits happen due to agent failures or timeouts, not genuine disagreement. Missing dissent is expected and not a quality concern.
- **Turn analytics in discuss mode only:** Consult mode uses ConsultationResult with a different conversation model (structured rounds with all agents). Mixing the two would require a separate implementation and is out of scope per D-09.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all fields are computed from real conversation history data.

## Self-Check: PASSED

- src/core/ConversationManager.ts: FOUND (4 turn_analytics, 6 dissent_quality, 3 token_share_pct matches)
- src/mcp/server.ts: FOUND (2 turn_analytics, 2 dissent_quality, 1 "Turns:", 1 "Warning.*dissent")
- src/core/SessionManager.ts: FOUND (1 turn_analytics, 1 dissent_quality)
- src/types/index.ts: FOUND (turn_analytics + dissent_quality in SessionManifest)
- Commit 42d147d: FOUND
- Commit d626595: FOUND
- Build: PASSED (0 errors)
- Tests: PASSED (1087/1087)

---
*Phase: 11-audit-infrastructure-agents-for-quality*
*Completed: 2026-04-07*
