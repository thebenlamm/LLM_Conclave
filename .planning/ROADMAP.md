# Roadmap: LLM Conclave

## Milestones

- ✅ **v1.0 Refactoring** — Phases 1-3 (shipped 2026-04-06)

## Phases

<details>
<summary>✅ v1.0 Refactoring (Phases 1-3) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-04-06
- [x] Phase 2: ConversationManager Decomposition (3/3 plans) — completed 2026-04-06
- [x] Phase 3: MCP Deduplication + Orchestrator Assessment (2/2 plans) — completed 2026-04-06

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-04-06 |
| 2. ConversationManager Decomposition | v1.0 | 3/3 | Complete | 2026-04-06 |
| 3. MCP Deduplication + Orchestrator Assessment | v1.0 | 2/2 | Complete | 2026-04-06 |

## Backlog

### Phase 999.1: Silent model fallback logging (BACKLOG)

**Goal:** Agents fall back to claude-sonnet without logging when declared model (e.g., gpt-4o) is unavailable. Need to log fallback events or fail fast.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.2: Cost tracking broken in discuss sessions (BACKLOG)

**Goal:** All discuss sessions show cost: 0 in session manifest (going back to Dec 2025). Cost aggregation never wired up for discuss mode.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Aggregate input token count wrong in consult (BACKLOG)

**Goal:** Final consult log shows 28-52 input tokens instead of actual sum. Checkpoint files have correct per-agent counts but aggregate is wrong.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.4: Duplicate consult log file naming (BACKLOG)

**Goal:** Consult logs are written twice with `consult-` and `consult-consult-` prefixes. Two write paths producing near-identical files.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.5: Speaker label contamination in conversation content (BACKLOG)

**Goal:** Agent content has mismatched speaker name prefixes baked into the text (e.g., "Developer:" prefix on Pragmatist response). The speaker metadata field is correct but content is contaminated.
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
