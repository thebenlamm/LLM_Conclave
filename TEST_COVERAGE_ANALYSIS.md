# Test Coverage Analysis

This file is a current snapshot of the repository test and coverage posture, not a historical backlog from the pre-MCP-only architecture.

## Snapshot

Captured on `2026-04-07` with:

```bash
npm test -- --runInBand --watchman=false
npm run test:coverage -- --runInBand --watchman=false
```

## Current Test Status

- Test suites: `78` total
- Passing suites: `76`
- Failing suites: `2`
- Tests: `1,048` total
- Passing tests: `1,028`
- Failing tests: `20`

### Current Failures

The remaining failures are environment-specific, not broad product regressions:

- `src/core/__tests__/ArtifactStore.test.ts`
- `src/tools/__tests__/ToolRegistry.test.ts`

Both fail in the sandbox because the tests try to create artifact directories under `~/.llm-conclave/artifacts`, which is not writable in this environment.

Representative error:

```text
EPERM: operation not permitted, mkdir '/Users/benlamm/.llm-conclave/artifacts/...'
```

There is also a Jest open-handle warning after completion:

```text
Jest did not exit one second after the test run has completed.
```

That should be treated as a follow-up cleanup issue, not as a documentation problem.

## Coverage Summary

Overall coverage from the current `coverage/lcov-report/index.html`:

- Statements: `65.57%` (`4837/7376`)
- Branches: `55.93%` (`2717/4857`)
- Functions: `68.78%` (`758/1102`)
- Lines: `66.46%` (`4648/6993`)

## Strong Areas

- `src/config/` is well-covered
- `src/consult/analysis/`, `src/consult/artifacts/`, and much of `src/consult/analytics/` are in good shape
- `src/mcp/` now has direct handler and transport coverage
- Core session/history/judge flows have meaningful test coverage
- `src/tools/ToolRegistry.ts` has strong coverage aside from the artifact-write cases blocked by the sandbox

## Current Gaps

The highest-signal gaps in the current codebase are:

- `src/memory/` remains untested
- `src/orchestration/Orchestrator.ts` and `src/orchestration/TaskClassifier.ts` still show major coverage gaps
- Several provider adapters are only partially covered, especially OpenAI, Grok, and Mistral provider specifics
- `src/utils/ProjectContext.ts`, `src/utils/TokenCounter.ts`, and `src/utils/ConsultLogger.ts` are still weak compared with the main orchestration paths

## Recommended Next Steps

1. Make artifact-store tests use a temp directory instead of `~/.llm-conclave` so they pass in CI and sandboxes.
2. Resolve the Jest open-handle warning and document the root cause once identified.
3. Add focused tests for `src/orchestration/Orchestrator.ts` and `src/orchestration/TaskClassifier.ts`.
4. Expand provider-specific contract coverage for OpenAI, Grok, and Mistral edge cases.
5. Add targeted tests around `ProjectContext`, `TokenCounter`, and `ConsultLogger`.

## Notes

- Older coverage narratives that referenced deleted CLI-era directories are no longer accurate.
- If you regenerate coverage after major file moves, prefer removing the old `coverage/` directory first to avoid confusion when reviewing historical artifacts.
