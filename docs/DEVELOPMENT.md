<!-- generated-by: gsd-doc-writer -->
# Development Guide

This guide covers local development setup, build commands, code style, and the PR process for LLM Conclave.

## Local Setup

**Prerequisites:** Node.js `>= 20.0.0`

```bash
git clone <repo-url>
cd llm_conclave
cp .env.example .env        # add at least one provider API key
npm install                 # also runs the build via postinstall
```

Alternatively, use the setup script, which validates `.mcp.json`, builds the server, and smoke-tests the MCP stdio launcher in one step:

```bash
npm run setup
```

**Provider API keys** go in `.env`. At minimum one key is needed for tests that hit a live provider. The env vars are:

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI (GPT) |
| `GOOGLE_API_KEY` | Google (Gemini) |
| `XAI_API_KEY` | xAI (Grok) |
| `MISTRAL_API_KEY` | Mistral |

**MCP rebuild note:** After `npm run build`, you cannot pick up new MCP code in the same Claude Code window. MCP processes are cached per session. Start a new Claude Code session after every rebuild.

## Build Commands

| Command | Description |
|---|---|
| `npm run build` | TypeScript compile (`tsc`) via `scripts/build.js`; also chmods the server entry on non-Windows |
| `npm run setup` | Validate `.mcp.json`, build, and smoke-test the MCP stdio launcher |
| `npm run mcp-server` | Start the MCP server from compiled dist (`dist/src/mcp/server.js`) |
| `npm run mcp-dev` | Start the MCP server via `ts-node` without a compile step (dev convenience) |
| `npm run backfill:analytics` | Backfill discuss-analytics data for existing sessions |
| `npm test` | Run the full test suite |
| `npm run test:unit` | Unit tests only — excludes files matching `integration` or `live` in their path |
| `npm run test:integration` | Integration tests only |
| `npm run test:live` | Live provider tests — requires `LIVE_PROVIDER_TESTS=1` in environment |
| `npm run test:watch` | Jest watch mode |
| `npm run test:coverage` | Full suite with coverage report |

**Locally, run tests with these flags** to avoid Jest concurrency and watchman issues:

```bash
npm test -- --runInBand --watchman=false
npm run test:coverage -- --runInBand --watchman=false
```

The `postinstall` hook runs `npm run build` automatically after `npm install`. The `prepublishOnly` hook does the same before `npm publish`.

## Code Style

There is no ESLint or Prettier config in this repository. The primary code quality gate is the **TypeScript compiler** in strict mode (`"strict": true` in `tsconfig.json`).

**Compiler settings of note** (`tsconfig.json`):
- `target`: `ES2020`
- `module`: `commonjs`
- `outDir`: `./dist`
- `strict`: `true`
- `esModuleInterop`: `true`

Pass `npm run build` before opening a PR — the CI pipeline runs it and fails the build on any TypeScript error.

**Commit message format:** Conventional commits are required.

| Prefix | Use for |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no behavior change |
| `test:` | Test additions or changes |
| `chore:` | Build, tooling, or dependency updates |

## Branch Conventions

- Default/target branch: `main`
- No formal branch naming convention is documented. A common pattern used in this repo is `feat/<short-description>` or `fix/<short-description>`.
- Conventional commits apply to all branches.

## PR Process

1. Ensure `npm run build` passes with zero TypeScript errors.
2. Run `npm run test:unit` (and `npm test` if touching integration paths) — all tests must pass.
3. **Run an adversarial review on all multi-file changes** before opening the PR. Give the reviewer only the diff; expect 2–5 rounds of findings.
4. For changes that affect core architecture (orchestration, providers, judge logic), use Conclave itself to validate the decision.
5. CI (`test.yml`) runs on all pushes and PRs to `main`: it executes `npm ci`, `npm run build`, and `npm test -- --coverage`. The PR cannot merge if CI is red.
6. There is no required reviewer count configured in the repo; coordinate review with the team directly.
