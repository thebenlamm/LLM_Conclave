# Roadmap: LLM Conclave

## Milestones

- ✅ **v1.0 Refactoring** — Phases 1-3 (shipped 2026-04-06)
- **v1.1 Bug Fixes & Quality** — Phases 4-6 (current)

## Phases

<details>
<summary>✅ v1.0 Refactoring (Phases 1-3) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-04-06
- [x] Phase 2: ConversationManager Decomposition (3/3 plans) — completed 2026-04-06
- [x] Phase 3: MCP Deduplication + Orchestrator Assessment (2/2 plans) — completed 2026-04-06

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Bug Fixes & Quality

- [ ] **Phase 4: Conversation Integrity** - Fix continuation session bugs (speaker attribution, contamination, orphan context, duplicate injection, metadata drift)
- [ ] **Phase 5: Resilience & Observability** - Log fallback events, route consult judge through fallback, improve partial abort handling, wire cost tracking
- [ ] **Phase 6: Judge Quality** - Fix verdict synthesis collapse, add rubber-stamp detection, eliminate duplicate guidance, fix sentence extraction

## Phase Details

### Phase 4: Conversation Integrity
**Goal**: Continuation sessions produce correct, uncontaminated conversation histories
**Depends on**: Nothing (isolated bug fixes in DiscussionRunner/ConversationManager continuation paths)
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05
**Success Criteria** (what must be TRUE):
  1. A continued session in round 6+ shows the correct agent name in each turn — no speaker swaps between agents
  2. Agent response text contains no "AgentName: " prefix from another agent — content is clean
  3. The continuation context built from a parent session contains no orphan judge guidance entries
  4. The continuation task prompt appears exactly once in the history, never duplicated
  5. currentRound in session metadata matches the actual number of history entries at all points during a continuation
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Fix speaker attribution, orphan judge guidance, and duplicate task prompt in ContinuationHandler
- [x] 04-02-PLAN.md — Fix currentRound metadata drift after priorHistory injection

### Phase 5: Resilience & Observability
**Goal**: Sessions accurately report what happened, degrade gracefully on failure, and expose cost data
**Depends on**: Phase 4
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04, OBSRV-01, OBSRV-02
**Success Criteria** (what must be TRUE):
  1. When an agent silently uses a fallback model, a log line records the original model, the fallback model, and the reason
  2. A consult run where the judge model fails does not abort — it falls back to an alternative and completes synthesis
  3. A consult aborted after round 1 returns a result with partial confidence and agent perspectives, not an empty failure
  4. Session JSON status reads "completed_degraded" (not "completed") when the judge was unavailable during the run
  5. Discuss session JSON files contain non-zero token counts and USD cost after a real run
  6. Consult log aggregate input token count reflects the actual sum across all rounds, not a single-round value
**Plans**: TBD

### Phase 6: Judge Quality
**Goal**: The judge produces differentiated, non-redundant synthesis that reflects actual agent progress each round
**Depends on**: Phase 5
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. Verdict synthesis output contains distinct strategies from different agents — not collapsed to a single generic recommendation
  2. A consult where all agents agree on a high-confidence answer triggers early termination only after rubber-stamp detection confirms genuine consensus, not mere word-level agreement
  3. Judge guidance in consecutive rounds differs — re-evaluates what agents actually said, not copy-paste of prior round guidance
  4. bestEffortJudgeResult sentences extracted from agent responses are content sentences, not markdown headers (no "# Title" or "## Section" text)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-04-06 |
| 2. ConversationManager Decomposition | v1.0 | 3/3 | Complete | 2026-04-06 |
| 3. MCP Deduplication + Orchestrator Assessment | v1.0 | 2/2 | Complete | 2026-04-06 |
| 4. Conversation Integrity | v1.1 | 0/2 | Not started | - |
| 5. Resilience & Observability | v1.1 | 0/TBD | Not started | - |
| 6. Judge Quality | v1.1 | 0/TBD | Not started | - |

## Backlog — Kept

### Phase 999.4: Duplicate consult log file naming (BACKLOG)

**Goal:** Consult logs are written twice with `consult-` and `consult-consult-` prefixes. Two write paths producing near-identical files.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.6: Per-response timestamps in discuss sessions (BACKLOG)

**Goal:** All conversation entries within a session share the session creation timestamp instead of actual response time. Makes round duration analysis impossible.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.7: Provider field stores model name instead of provider name (BACKLOG)

**Goal:** ConsultationResult agents array has `provider: "claude-opus-4-5"` instead of `provider: "anthropic"`. Minor data quality issue.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.8: outputFiles fields always empty (BACKLOG)

**Goal:** Both discuss sessions have `outputFiles: { transcript: "", json: "" }`. Fields are never populated.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.20: consensusReached missing from session manifest (BACKLOG)

**Goal:** Detail files track consensusReached but the manifest does not surface it. Consumers querying the manifest cannot determine session outcomes without loading full session files.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)
