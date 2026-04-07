# Requirements: LLM Conclave v1.1

**Defined:** 2026-04-06
**Core Value:** Multi-LLM collaboration with reliable, maintainable infrastructure.

## v1.1 Requirements

Bug fixes and quality improvements discovered via live session audit.

### Conversation Integrity

- [x] **INTEG-01**: Speaker attribution in continuation sessions is correct — speaker field matches the actual agent that generated the content in all rounds
- [x] **INTEG-02**: Conversation content does not contain wrong speaker name prefixes — agent responses have no cross-contaminated speaker labels
- [x] **INTEG-03**: Orphan judge guidance from parent session is stripped before building continuation context
- [x] **INTEG-04**: Continuation task prompt is injected exactly once, not duplicated
- [x] **INTEG-05**: currentRound metadata stays in sync with actual conversation history length across continuations

### Resilience & Fallbacks

- [ ] **RESIL-01**: Model fallback events are logged with original model, fallback model, and reason when an agent silently substitutes
- [x] **RESIL-02**: Consult synthesis/cross-exam/verdict rounds fall back to alternative models when judge model fails instead of aborting
- [x] **RESIL-03**: Aborted consults with complete round-1 data report partial confidence and include agent perspectives in the result
- [x] **RESIL-04**: Session status reflects degraded quality when judge was unavailable (e.g., "completed_degraded" instead of "completed")

### Quality & Intelligence

- [ ] **QUAL-01**: Verdict synthesis preserves differentiated strategies and actionable advice instead of collapsing to a generic one-liner
- [ ] **QUAL-02**: Consult early termination checks for rubber-stamp agreement before accepting high-confidence synthesis
- [ ] **QUAL-03**: Judge re-evaluates agent progress each round instead of emitting identical guidance in consecutive rounds
- [ ] **QUAL-04**: bestEffortJudgeResult skips markdown headers when extracting representative sentences from agent responses

### Observability

- [ ] **OBSRV-01**: Discuss sessions track and persist cost data (tokens, calls, USD) to session JSON — no more all-zero cost fields
- [x] **OBSRV-02**: Consult log aggregate input token count sums all rounds correctly instead of showing 28-52 tokens

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Data Quality (from backlog)

- **DATA-01**: Duplicate consult log file naming (consult-consult- prefix doubling)
- **DATA-02**: Per-response timestamps (all entries share session start time)
- **DATA-03**: Provider field stores model name instead of provider name
- **DATA-04**: outputFiles fields always empty
- **DATA-05**: consensusReached missing from session manifest

### Further Cleanup (from v1.0)

- **CLEAN-01**: Extract PARTICIPATION_REQUIREMENT and STRUCTURED_OUTPUT_INSTRUCTION from PersonaSystem into constants
- **CLEAN-02**: Reduce `: any` annotations across remaining files (currently 225 total)
- **CLEAN-03**: Consolidate fallback model selection logic (duplicated in ConversationManager and judge methods)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New LLM providers | Bug fixes only — no new functionality |
| MCP tool schema changes | Callers must not notice any difference |
| Consult subdomain restructuring | Already well-organized |
| Delete legacy orchestrators | Deprecated in v1.0, not urgent to remove |
| ~~CostTracker threading through DiscussionRunner~~ | ~~Tech debt from v1.0~~ — superseded by OBSRV-01 (Phase 5) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTEG-01 | Phase 4 | Complete |
| INTEG-02 | Phase 4 | Complete |
| INTEG-03 | Phase 4 | Complete |
| INTEG-04 | Phase 4 | Complete |
| INTEG-05 | Phase 4 | Complete |
| RESIL-01 | Phase 5 | Pending |
| RESIL-02 | Phase 5 | Complete |
| RESIL-03 | Phase 5 | Complete |
| RESIL-04 | Phase 5 | Complete |
| OBSRV-01 | Phase 5 | Pending |
| OBSRV-02 | Phase 5 | Complete |
| QUAL-01 | Phase 6 | Pending |
| QUAL-02 | Phase 6 | Pending |
| QUAL-03 | Phase 6 | Pending |
| QUAL-04 | Phase 6 | Pending |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after roadmap creation*
