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

---
