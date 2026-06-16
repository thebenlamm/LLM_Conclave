<!-- generated-by: gsd-doc-writer -->
# Testing

## Test Framework and Setup

LLM Conclave uses **Jest ^30.2.0** with **ts-jest ^29.4.6** as the TypeScript transform. No separate global setup step is required beyond the standard `npm install` (which also builds the project via `postinstall`).

Configuration lives in `jest.config.js` at the project root. Key settings:

- **Roots**: `src/` only — all test files must be under `src/`
- **Test match**: `**/__tests__/**/*.test.ts` and `**/*.test.ts`
- **Transform**: ts-jest handles all `.ts` and `.tsx` files
- **Module mapper**: strips `.js` extensions from local imports so ts-jest can resolve `.ts` sources (required by the Node16/ESM-compatible import style used in `src/mcp/server.ts`)

## Running Tests

All commands run from the project root.

**Full test suite (recommended flags for local runs):**

```bash
npm test -- --runInBand --watchman=false
```

`--runInBand` prevents parallel worker contention. `--watchman=false` avoids watchman dependency issues on machines where it is not installed.

**Unit tests only (skip integration and live tests):**

```bash
npm run test:unit
```

Excludes any file whose path contains `integration` or `live`.

**Integration tests only:**

```bash
npm run test:integration
```

**Live provider tests (requires active API keys):**

```bash
LIVE_PROVIDER_TESTS=1 npm run test:live
```

Live tests make real network calls to LLM providers. They are gated by the `LIVE_PROVIDER_TESTS=1` environment variable and are excluded from CI.

**Watch mode:**

```bash
npm run test:watch
```

**With coverage report:**

```bash
npm run test:coverage -- --runInBand --watchman=false
```

**Run a single file:**

```bash
npx jest src/core/__tests__/SessionManager.test.ts --runInBand
```

**Run tests matching a name pattern:**

```bash
npx jest --testNamePattern="converts simple user message" --runInBand
```

## Writing New Tests

### File location and naming

Tests are co-located with their source module inside a `__tests__/` subdirectory:

```
src/
  core/
    SessionManager.ts
    __tests__/
      SessionManager.test.ts
      SessionManager.degraded.test.ts
```

File naming conventions:

| Suffix | Meaning |
|--------|---------|
| `*.test.ts` | Standard unit test |
| `*.contract.test.ts` | Provider message-format contract test (no live API calls) |
| `*.integration.test.ts` | Multi-component test with mocked providers |
| `*.degraded.test.ts` | Behaviour under failure / degraded-mode conditions |

### Shared fixtures

Provider contract tests share message fixtures from `src/providers/__tests__/fixtures.ts`. Import them directly rather than defining duplicate message shapes:

```typescript
import {
  simpleUserMessage,
  assistantWithToolCalls,
  toolResult,
} from './fixtures';
```

### Provider contract tests

Each provider has a `.contract.test.ts` that verifies message format conversion without live network calls. When adding a new provider, create a matching contract test that covers:

- Simple user and assistant message passthrough
- Tool call and tool result conversion
- System message extraction
- Edge cases (empty content, multiple tool calls in one turn)

### Mocking pattern

Integration tests mock `ProviderFactory.createProvider` and `TokenCounter` at the module level so no real provider instances or token counting libraries are invoked:

```typescript
jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: { createProvider: jest.fn() },
}));
```

## Coverage Requirements

Coverage thresholds are configured per-directory in `jest.config.js`:

| Directory | Statements | Branches |
|-----------|-----------|---------|
| `src/providers/` | 50% | 35% |
| `src/mcp/` | 28% | 15% |

No global threshold is configured. Falling below the per-directory minimums causes `jest --coverage` to exit with a non-zero code and fail CI.

Coverage is collected from all `src/**/*.ts` files, excluding `.d.ts` declaration files and test files themselves.

## CI Integration

Workflow file: `.github/workflows/test.yml`

| Property | Value |
|----------|-------|
| Workflow name | Test |
| Triggers | Push to `main`, pull request targeting `main` |
| Runner | `ubuntu-latest` |
| Node version | 20 |
| Test command | `npm test -- --coverage` |

The CI job runs `npm ci` (not `npm install`) and `npm run build` before the test step. Coverage thresholds are enforced by the same `--coverage` flag in CI.

Live tests (`test:live`) are not run in CI. They require provider API keys and are intended for local validation only.

## Known Issue: ArtifactStore Tests in Sandboxes

`src/core/__tests__/ArtifactStore.test.ts` exercises `ArtifactStore`, which writes session artifacts to `~/.llm-conclave/artifacts/`. In sandboxed environments where the test process cannot write to the user's home directory, these tests will fail with a filesystem permission error.

Workaround: ensure the running user has write access to `~/.llm-conclave/`, or run the unit-only suite which does not trigger filesystem writes:

```bash
npm run test:unit
```

The CI runner (`ubuntu-latest`) has a writable home directory, so this issue does not affect CI.
