# LLM Conclave Beta Feedback

Tracking feedback from beta testing to inform future improvements.

---

## 2026-01-15

### llm_conclave_discuss - DB constraint decision

- **Tool used:** llm_conclave_discuss
- **Personas:** architect, pragmatic, security
- **Task:** DB constraint vs env var flexibility decision
- **Result quality:** 4/5 stars - reached consensus quickly with clear rationale
- **Response time:** Fast (~2s)
- **Issues:** None
- **Suggestions:** Would be nice to see the full reasoning without needing to read the log file

**Potential improvement:** Add `--verbose` or `--show-reasoning` flag to include agent reasoning in terminal output instead of only in log files.

---

## 2026-01-17

### llm_conclave_discuss - Custom domain expert personas

- **Tool used:** llm_conclave_discuss
- **Personas:** Custom (DigitalArchivist, ComputerVisionEngineer, HebraicPaleographer)
- **Task:** Domain-specific analysis requiring specialized expertise
- **Result quality:** 5/5 stars - Domain experts brought genuinely useful specialized knowledge
- **Response time:** Acceptable (~30s)
- **Issues:** Config requires file path, not inline JSON
- **Suggestions:** Allow inline agent definitions in the config parameter

**Potential improvement:** Support inline JSON agent definitions directly in the `config` parameter, e.g.:
```
config='{"agents":{"Expert":{"model":"claude-sonnet-4-5","prompt":"You are..."}}}'
```
This would eliminate the need to create a separate config file for one-off custom personas.

**✅ FIXED** in commit `95cbe56` - Inline JSON config now supported!

---

## 2026-01-19

### llm_conclave_discuss - HTR pipeline design

- **Tool used:** llm_conclave_discuss
- **Personas requested:** architect, creative, skeptic, pragmatic
- **Personas received:** Creative Innovator, Critical Analyst, Pragmatic Engineer (3/4 - "architect" silently dropped)
- **Task:** Revolutionary HTR pipeline design
- **Result quality:** 4/5 stars - Excellent depth of analysis, concrete recommendations emerged
- **Response time:** Acceptable (~2 min for 4 rounds)
- **Issues:**
  1. Summary too vague - just said "three horizons" without actual content
  2. Persona mismatch - requested 4, got 3 with different names
  3. Repetition across rounds - agents kept restating similar points
  4. "Consensus reached early" felt premature
  5. No structured output (key decisions, action items, dissent)
- **Suggestions:**
  - Return richer summary with actual recommendations
  - Enforce persona alignment
  - Add devil's advocate mode
  - Structured key_decisions and action_items in output

### FIXES IMPLEMENTED (2026-01-19)

**1. Persona aliases added** (`PersonaSystem.ts`)
- `architect` now correctly maps to `architecture` (Systems Architect)
- Added 17 common aliases: `arch`, `sec`, `perf`, `dev`, `ops`, `a11y`, `docs`, `innovation`, `critic`, `devil`, etc.
- New `resolveAlias()` method for consistent lookup

**2. Structured output added** (`ConversationManager.ts`, `server.ts`)
- Judge prompts now request structured format with sections
- New fields in result: `keyDecisions`, `actionItems`, `dissent`, `confidence`
- `parseStructuredOutput()` method extracts sections from judge responses
- MCP response now includes separate sections for Key Decisions, Action Items, and Dissenting Views
- Confidence level (HIGH/MEDIUM/LOW) shown in summary

**3. Devil's advocate mode added**
- Updated judge evaluation prompt to detect "shallow agreement" patterns
- Judge now pushes for genuine consensus (specific recommendations, trade-offs acknowledged)
- When agents just agree, judge injects adversarial guidance: "Play devil's advocate on [point]"
- Updated PARTICIPATION_REQUIREMENT to discourage "I agree" responses
- Agents instructed to add edge cases, failure modes, and trade-offs even when agreeing

**Commits:**
- `b115231` - feat: Improve discuss output with structured summaries and persona aliases
- `9fc0986` - feat: Add dynamic speaker selection with robustness fixes

---
