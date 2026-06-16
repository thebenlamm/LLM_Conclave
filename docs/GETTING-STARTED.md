<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide covers the fastest path from clone to working LLM Conclave tools in your MCP client.

## Prerequisites

- **Node.js >= 20.0.0** (required; see `package.json` `engines` field)
- At least one provider API key from the list below

Supported providers and their environment variable names:

| Provider | Variable |
|----------|----------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GOOGLE_API_KEY` |
| xAI Grok | `XAI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

You only need keys for the providers you plan to use. One key is enough to start.

## Installation Steps

1. Clone the repository:

```bash
git clone <repo-url>
cd llm_conclave
```

2. Install dependencies and build:

```bash
npm install
```

`npm install` automatically runs `npm run build` via the `postinstall` hook. This compiles TypeScript and produces `dist/src/mcp/server.js`. No separate build step is needed.

3. Add at least one provider API key to `.env`:

```bash
# If .env does not exist yet, copy the example:
cp .env.example .env
# Then edit .env and replace placeholder values with real keys
```

The `.env.example` file lists every supported variable. You only need to fill in the providers you will use — leave unused keys as the placeholder or remove them.

## First Run

Run the setup validator:

```bash
npm run setup
```

`npm run setup` does four things in order:

1. Creates `.env` from `.env.example` if `.env` does not exist yet
2. Validates that `.mcp.json` correctly points to `scripts/mcp-stdio.js`
3. Builds the TypeScript server (same as `npm run build`)
4. Smoke-tests the MCP stdio launcher with a live `initialize` request

On success it prints which providers are configured and the exact next steps for your MCP client.

After `npm run setup` completes, start a **fresh Claude Code session** from the repository directory. Claude Code reads the project-local `.mcp.json` automatically and will prompt you to approve `llm-conclave` if this is your first time. Approve it, then verify tools are available:

```text
Use llm_conclave_status to check the server.
```

## Common Setup Issues

**`dist/src/mcp/server.js` does not exist**

The build did not complete. Run `npm install` or `npm run build` and confirm it exits with status 0 before retrying.

**Tools do not appear after approving the server**

MCP server processes are cached per session. After any rebuild or `.mcp.json` change you must start a fresh Claude Code session — reloading the window is not enough.

**Model calls fail with 401 or quota errors**

Your `.env` still contains placeholder values. Open `.env`, replace `your_<provider>_api_key_here` with a real key for at least one provider, and run `npm run setup` again. `npm run setup` will warn you if it detects no real keys.

**`CONCLAVE_ALLOWED_CONTEXT_ROOTS` has no effect**

This variable is honored only under stdio transport. It is silently ignored on SSE/REST deployments by design. See [CONFIGURATION.md](CONFIGURATION.md) for details.

## Next Steps

- [CONFIGURATION.md](CONFIGURATION.md) — full environment variable reference, per-environment overrides, and the `LLM_CONCLAVE_HOME` runtime artifact path
- [ARCHITECTURE.md](ARCHITECTURE.md) — module layout, data flow, and key abstractions
- [MCP_SERVER.md](MCP_SERVER.md) — SSE/REST transport, Codex setup, and single-tenant hosting
