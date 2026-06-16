<!-- generated-by: gsd-doc-writer -->
# Contributing to LLM Conclave

## Development setup

See [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) for prerequisites and first-run instructions, and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local development setup.

Quick reference:

```bash
cp .env.example .env          # add at least one provider API key
npm install                   # installs deps and builds via postinstall
npm run build                 # rebuild after source changes
```

After any rebuild, start a fresh Claude Code session to pick up new MCP code — stdio MCP processes are cached per session.

## Coding standards

- **TypeScript only** — all source files live under `src/` and must compile cleanly (`npm run build` with zero errors before submitting).
- **No linter config is enforced in CI**, but keep code consistent with surrounding style.
- CI (`test.yml`) runs `npm run build` then `npm test -- --coverage` on every PR to `main`. Both must pass.
- Never swallow exceptions; always log with context. Never disable TypeScript strict checks to silence an error — fix the root cause.

## Testing

Run the full suite before submitting:

```bash
npm test -- --runInBand --watchman=false
```

Run unit tests only (skip integration/live tests):

```bash
npm run test:unit
```

Run with coverage:

```bash
npm run test:coverage -- --runInBand --watchman=false
```

**Requirements:**
- Integration tests must pass 100% — no partial green.
- Run `npm run build` after every distinct error-category fix; do not declare done until zero build errors.
- For multi-file changes, run an adversarial review on the diff before opening a PR.
- Coverage thresholds enforced by `jest.config.js`: `src/providers/` ≥ 50% statements / 35% branches; `src/mcp/` ≥ 28% statements / 15% branches.

## PR guidelines

- **Branch naming**: use `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, or `chore/` prefixes matching the commit type (e.g., `feat/perplexity-provider`).
- **Commit messages**: conventional commits required — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Include a multi-line body explaining what, why, and impact for non-trivial changes.
- **Provider changes**: consult the provider quirks section of `CLAUDE.md` before modifying any provider adapter. Gemini config nesting and tool message format conversions are common footguns.
- **Architectural decisions**: use Conclave itself (`npm run mcp-server` + discuss tool) to validate major architectural choices before implementation.
- CI must be green (build + tests) before requesting review.

## Issue reporting

Open an issue on GitHub with:

- **Bug reports**: steps to reproduce, the exact command or tool call, expected vs. actual behavior, your Node version (`node --version`), and which provider keys are configured (names only, never values).
- **Feature requests**: the use case driving the request, current workaround if any, and whether you are willing to implement it.

For provider-specific failures, include the provider name, model name, and (if safe to share) the relevant section of the conversation JSON.

## License

By contributing, you agree your contributions will be licensed under the [ISC License](LICENSE).
