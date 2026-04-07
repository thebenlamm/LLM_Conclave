# Requirements: LLM Conclave v1.2

**Defined:** 2026-04-07
**Core Value:** Multi-LLM collaboration with reliable, maintainable infrastructure.

## v1.2 Requirements

All items from backlog — data quality fixes, cost pipeline completion, and quality refinements discovered via E2E testing and integration audit.

### Cost & Observability

- [x] **COST-01**: CostTracker data (tokens, calls, USD) reaches session manifest — session JSON shows non-zero cost after a real discuss run
- [x] **COST-02**: formatDiscussionResult and formatDiscussionResultJson use result.cost from CostTracker instead of heuristic msgCount*750 estimate
- [x] **COST-03**: MarkdownFormatter renders a degraded-status banner when consult result status is completed_degraded — callers see judge fallback occurred

### Quality Refinements

- [x] **QUAL-05**: Rubber-stamp detection identifies high-confidence thin verdicts where agents agree strongly but provide generic/overlapping reasoning instead of domain-specific analysis

### Data Quality

- [ ] **DATA-01**: Consult log files are written once, not twice with consult- and consult-consult- prefixes
- [x] **DATA-02**: Conversation entries within a session have per-response timestamps reflecting actual response time, not the shared session creation timestamp
- [ ] **DATA-03**: ConsultationResult agents array provider field contains provider name (e.g., "anthropic") not model name (e.g., "claude-opus-4-5")
- [x] **DATA-04**: Discuss session outputFiles fields (transcript, json) are populated with actual file paths after a run
- [x] **DATA-05**: Session manifest includes consensusReached field so consumers can determine session outcomes without loading full session files

## Out of Scope

| Feature | Reason |
|---------|--------|
| New LLM providers | Bug fixes only — no new functionality |
| MCP tool schema changes | Callers must not notice any difference |
| Consult subdomain restructuring | Already well-organized |
| New features or capabilities | Polish milestone — fixes only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COST-01 | Phase 7 | Complete |
| COST-02 | Phase 7 | Complete |
| COST-03 | Phase 8 | Complete |
| DATA-04 | Phase 8 | Complete |
| DATA-05 | Phase 8 | Complete |
| QUAL-05 | Phase 9 | Complete |
| DATA-01 | Phase 9 | Pending |
| DATA-02 | Phase 9 | Complete |
| DATA-03 | Phase 9 | Pending |

**Coverage:**
- v1.2 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-04-07*
