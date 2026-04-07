# Roadmap: LLM Conclave

## Milestones

- ✅ **v1.0 Refactoring** — Phases 1-3 (shipped 2026-04-06)
- ✅ **v1.1 Bug Fixes & Quality** — Phases 4-6 (shipped 2026-04-07)
- **v1.2 Data Quality & Polish** — Phases 7-11 (current)

## Phases

<details>
<summary>✅ v1.0 Refactoring (Phases 1-3) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-04-06
- [x] Phase 2: ConversationManager Decomposition (3/3 plans) — completed 2026-04-06
- [x] Phase 3: MCP Deduplication + Orchestrator Assessment (2/2 plans) — completed 2026-04-06

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Bug Fixes & Quality (Phases 4-6) — SHIPPED 2026-04-07</summary>

- [x] Phase 4: Conversation Integrity (2/2 plans) — completed 2026-04-07
- [x] Phase 5: Resilience & Observability (2/2 plans) — completed 2026-04-07
- [x] Phase 6: Judge Quality (2/2 plans) — completed 2026-04-07

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### v1.2 Data Quality & Polish

- [x] **Phase 7: Cost Pipeline** - Wire CostTracker data through to session manifest and tool response output (completed 2026-04-07)
- [ ] **Phase 8: Output Completeness** - Populate outputFiles paths, consensusReached in manifest, and degraded-status banner
- [ ] **Phase 9: Data Correctness** - Fix duplicate logs, per-response timestamps, provider field naming, and rubber-stamp thin-verdict detection
- [ ] **Phase 10: Status MCP Tool** - Add llm_conclave_status tool with active-discussion.json status file
- [ ] **Phase 11: Infrastructure Agent Quality** - Fix selector termination in dynamic mode, add turn analytics and dissent instrumentation

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
- [x] 04-01-PLAN.md — Fix speaker attribution, orphan judge guidance, and duplicate task prompt in ContinuationHandler
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
**Plans:** 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md — Structured fallback logging and discuss cost tracking wiring
- [x] 05-02-PLAN.md — Judge fallback in consult rounds, partial abort results, degraded status, token fix

### Phase 6: Judge Quality
**Goal**: The judge produces differentiated, non-redundant synthesis that reflects actual agent progress each round
**Depends on**: Phase 5
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. Verdict synthesis output contains distinct strategies from different agents — not collapsed to a single generic recommendation
  2. A consult where all agents agree on a high-confidence answer triggers early termination only after rubber-stamp detection confirms genuine consensus, not mere word-level agreement
  3. Judge guidance in consecutive rounds differs — re-evaluates what agents actually said, not copy-paste of prior round guidance
  4. bestEffortJudgeResult sentences extracted from agent responses are content sentences, not markdown headers (no "# Title" or "## Section" text)
**Plans:** 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — Verdict prompt differentiation and rubber-stamp early termination gate
- [x] 06-02-PLAN.md — Prior guidance injection for round freshness and markdown header filtering

### Phase 7: Cost Pipeline
**Goal**: CostTracker data flows completely from the discuss pipeline through to the session manifest and the tool response seen by callers
**Depends on**: Phase 6
**Requirements**: COST-01, COST-02
**Success Criteria** (what must be TRUE):
  1. After a real discuss run, session JSON shows non-zero token counts and a non-zero USD cost in all cost fields
  2. The tool response returned to the MCP caller shows real cost from CostTracker, not a heuristic msgCount * 750 estimate
**Plans:** 1/1 plans complete

Plans:
- [x] 07-01-PLAN.md — Wire CostTracker data into session manifest and replace heuristic formatters

### Phase 8: Output Completeness
**Goal**: Callers receive complete, accurate output metadata — file paths populated, degraded status visible, and session manifest exposes outcome fields
**Depends on**: Phase 7
**Requirements**: COST-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. A completed_degraded consult result renders a visible banner in the markdown output indicating judge fallback occurred
  2. After a discuss run, outputFiles.transcript and outputFiles.json contain actual file paths, not empty strings
  3. The session manifest includes a consensusReached field that consumers can read without loading full session detail files
**Plans:** 1 plan

Plans:
- [x] 08-01-PLAN.md — Degraded banner, outputFiles paths, and consensusReached in session listing

### Phase 9: Data Correctness
**Goal**: Session data is internally accurate — no duplicate log files, correct timestamps per response, correct provider names, and rubber-stamp detection catches thin-verdict agreement
**Depends on**: Phase 8
**Requirements**: QUAL-05, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. A consult run produces exactly one log file, not two files with consult- and consult-consult- prefixes
  2. Conversation entries within a discuss session have timestamps that reflect actual response time, not the shared session creation timestamp
  3. ConsultationResult agents array shows provider name (e.g., "anthropic") not model name (e.g., "claude-opus-4-5") in the provider field
  4. Rubber-stamp detection flags high-confidence verdicts where agents supply generic/overlapping reasoning rather than domain-specific analysis
**Plans**: TBD

### Phase 10: Status MCP Tool
**Goal**: Add `llm_conclave_status` MCP tool — a 0ms filesystem read that returns active discussion status or last completed session. Write `active-discussion.json` during execution via existing heartbeat, delete on completion.
**Depends on**: Nothing (read-only tool, no behavioral changes)
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Calling `llm_conclave_status` during an active discussion returns current round, elapsed time, agent names, and which agent is thinking
  2. Calling `llm_conclave_status` with no active discussion returns the most recent completed session summary (task, outcome, timestamp)
  3. The tool never errors, never times out, and never returns empty — always a valid structured response
  4. `active-discussion.json` is written on discussion start, updated every heartbeat, and deleted on completion
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 11: Infrastructure Agent Quality
**Goal**: Fix selector termination bugs in dynamic mode (per-round contribution override, force-remaining-agents) and add lightweight instrumentation (turn analytics, dissent quality check) to verify fixes work
**Depends on**: Phase 10 (not technically, but ships after)
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. In dynamic mode, the judge's consensus declaration is not overridden by per-round contribution checks — consensus stops the discussion
  2. In dynamic mode, when the selector says `shouldContinue: false`, the round ends without forcing remaining agents to speak
  3. The per-discussion contribution check ensures every agent has spoken at least once across all rounds before allowing consensus
  4. Session JSON and tool response include per-agent turn counts and token share percentages
  5. Session JSON includes `dissent_quality` field ("captured"/"missing"/"not_applicable") and tool response shows a warning when dissent is missing despite disagreement
**Plans**: TBD

Plans:
- [ ] TBD

## Backlog

(empty)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-04-06 |
| 2. ConversationManager Decomposition | v1.0 | 3/3 | Complete | 2026-04-06 |
| 3. MCP Deduplication + Orchestrator Assessment | v1.0 | 2/2 | Complete | 2026-04-06 |
| 4. Conversation Integrity | v1.1 | 2/2 | Complete | 2026-04-07 |
| 5. Resilience & Observability | v1.1 | 2/2 | Complete | 2026-04-07 |
| 6. Judge Quality | v1.1 | 2/2 | Complete | 2026-04-07 |
| 7. Cost Pipeline | v1.2 | 1/1 | Complete   | 2026-04-07 |
| 8. Output Completeness | v1.2 | 0/1 | Not started | - |
| 9. Data Correctness | v1.2 | 0/? | Not started | - |
| 10. Status MCP Tool | v1.2 | 0/? | Not started | - |
| 11. Infrastructure Agent Quality | v1.2 | 0/? | Not started | - |
