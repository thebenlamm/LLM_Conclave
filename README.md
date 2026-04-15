# LLM Conclave

LLM Conclave is an MCP-first multi-agent LLM collaboration server. It lets an MCP client ask multiple models to debate a problem, converge on a recommendation, continue prior sessions, and return either human-readable or structured output.

## What It Does

- Runs structured consultations with a fixed 1-4 round consult flow
- Runs free-form multi-agent discussions with optional dynamic speaker selection
- Persists sessions so discussions can be continued later
- Supports OpenAI, Anthropic, Google Gemini, xAI Grok, and Mistral models
- Exposes everything as MCP tools, with optional SSE + REST transport

## Requirements

- Node.js 18+
- One or more provider API keys:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`
  - `XAI_API_KEY`
  - `MISTRAL_API_KEY`

You only need keys for the providers you plan to use.

## Quick Start

### 1. Install and Build

```bash
npm install
```

`npm install` also builds the TypeScript server automatically and produces `dist/src/mcp/server.js`.

### Claude Code Fast Path

If someone pastes this GitHub repo into Claude Code and asks it to set up the MCP server, the intended repo-local flow is:

1. Run `npm install`
2. Run `npm run setup`
3. Add at least one provider key to `.env` if you have not already
4. Start a fresh Claude Code session
5. Approve the `llm-conclave` MCP server if prompted

This repo now includes a project-local `.mcp.json` that launches `scripts/mcp-stdio.js`, which loads `.env` and starts the built MCP server.

`npm run setup` creates `.env` from `.env.example` if needed, validates that `.mcp.json` points to `scripts/mcp-stdio.js`, builds the server, smoke-tests the MCP stdio launcher with an `initialize` request, and prints the exact next steps for Claude Code.

### 2. Configure Your MCP Client

For Claude Code, the repo already includes a project-local `.mcp.json` at the root, so most users should not need to hand-write MCP config.

If you do need to configure it manually, use this shape:

Example `.mcp.json`:

```json
{
  "mcpServers": {
    "llm-conclave": {
      "command": "node",
      "args": ["/absolute/path/to/llm_conclave/dist/src/mcp/server.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GOOGLE_API_KEY": "AIza...",
        "XAI_API_KEY": "xai-...",
        "MISTRAL_API_KEY": "..."
      }
    }
  }
}
```

Ready-to-copy example: [mcp-config-example.json](mcp-config-example.json)

If you only want Anthropic to start, keep the config minimal:

```json
{
  "mcpServers": {
    "llm-conclave": {
      "command": "node",
      "args": ["/absolute/path/to/llm_conclave/dist/src/mcp/server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Important behavior notes:

- `stdio` is the normal MCP mode. You do not need `--sse` for Claude Code.
- This repo already ships a working project-local `.mcp.json`.
- Use an absolute path to `dist/src/mcp/server.js`.
- Restart or start a fresh client session after adding or changing MCP config.
- If your MCP client asks you to approve `llm-conclave`, approve it before expecting tools to appear.
- When Anthropic, OpenAI, and Google keys are all present, the default zero-config discussion panel is mixed-provider: `Claude Sonnet` + `GPT-4o` + `Gemini 2.5 Pro`, with judge default `Gemini 2.5 Flash`.
- If only a subset of provider keys is present, LLM Conclave now auto-selects a default panel from the available providers instead of assuming all three.

### 3. Restart the MCP Client

After rebuilding or changing MCP config, restart the client so it picks up the new server binary.

### 4. Use the Tools

Example prompt to your MCP client:

```text
Use llm_conclave_consult to get expert consensus on whether
I should use OAuth or JWT for my authentication system.
```

## MCP Tools

### `llm_conclave_consult`

Structured consultation with a 1-4 round flow: positions, synthesis, cross-exam, verdict.

Key parameters:

| Parameter | Required | Notes |
|-----------|----------|-------|
| `question` | Yes | The decision or question to analyze |
| `context` | No | File paths or a directory path to load into context |
| `personas` | No | Comma-separated personas or persona-set references from global config |
| `rounds` | No | `1` to `4` |
| `quick` | No | Shortcut for a 2-round consult |
| `format` | No | `markdown`, `json`, or `both` |
| `judge_model` | No | Overrides the consult judge model |

Default consult panel if you do not specify personas: Security Expert, Systems Architect, Pragmatic Engineer.

### `llm_conclave_discuss`

Free-form collaborative discussion with session persistence and optional dynamic speaker selection.

Key parameters:

| Parameter | Required | Notes |
|-----------|----------|-------|
| `task` | Yes | The topic or problem to discuss |
| `project` | No | File or directory path for project context |
| `personas` | No | Comma-separated personas |
| `config` | No | Path to `.llm-conclave.json` or inline JSON agent config |
| `rounds` | No | Max rounds, default `4` |
| `min_rounds` | No | Minimum rounds before early consensus, default `2` |
| `dynamic` | No | Enables LLM-driven speaker selection |
| `selector_model` | No | Defaults to `gpt-4o-mini` |
| `judge_model` | No | Overrides the judge model |
| `timeout` | No | Seconds, default `0` for no timeout |
| `format` | No | `markdown`, `json`, or `both` |
| `judge_instructions` | No | Appended to the judge prompt |
| `context_optimization` | No | Structured reasoning/position split to reduce context cost |

### `llm_conclave_continue`

Continue a previous saved discussion.

| Parameter | Required | Notes |
|-----------|----------|-------|
| `task` | Yes | Follow-up request |
| `session_id` | No | Defaults to the most recent session |
| `reset` | No | Start fresh using only the prior summary instead of full history |

### `llm_conclave_sessions`

List recent sessions that can be continued.

| Parameter | Required | Notes |
|-----------|----------|-------|
| `limit` | No | Default `10` |
| `mode` | No | `consensus`, `orchestrated`, or `iterative` |

## Personas

Built-in personas:

- `security`
- `performance`
- `architecture`
- `creative`
- `skeptic`
- `pragmatic`
- `testing`
- `devops`
- `accessibility`
- `documentation`

Common aliases are accepted, including `architect`, `arch`, `qa`, `tester`, `docs`, `a11y`, and `sec`.

Custom personas and persona sets can be defined in `~/.llm-conclave/config.json`:

```json
{
  "custom_personas": {
    "healthCoach": {
      "name": "Health Coach",
      "model": "claude-sonnet-4-5",
      "systemPrompt": "You are a certified health coach..."
    }
  },
  "persona_sets": {
    "health": ["healthCoach", "security"]
  }
}
```

You can then use `personas: "@health"` or mix sets and built-ins like `@health,architecture`.

## Custom Agent Config

Project-local agent config lives in `.llm-conclave.json`.

```json
{
  "agents": {
    "Architect": {
      "model": "gpt-4o",
      "prompt": "You are a senior software architect..."
    },
    "Reviewer": {
      "model": "claude-sonnet-4-5",
      "prompt": "You identify risks and challenge assumptions..."
    }
  }
}
```

The `config` parameter on `llm_conclave_discuss` also accepts inline JSON.

## Supported Model Families

- OpenAI: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4-turbo`
- Anthropic: `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5`
- Google: `gemini-3-pro`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`
- xAI: `grok-3`, `grok-vision-3`
- Mistral: `mistral-large-latest`, `mistral-small-latest`, `codestral-latest`

Shorthand aliases such as `sonnet`, `opus`, `haiku`, `gemini`, `gemini-pro`, and `gemini-flash` are expanded by the provider factory.

## Troubleshooting

### Tools do not appear in the MCP client

- Confirm the checked-in project-root `.mcp.json` still exists.
- Confirm `npm install` completed successfully so `dist/src/mcp/server.js` exists.
- Start a fresh client session after changing `.mcp.json`.
- Check whether the client is waiting for MCP server approval.

### The server starts but mixed-model runs fail

- When Anthropic, OpenAI, and Google are all configured, the default discussion panel uses multiple providers.
- In that mixed case, `llm_conclave_discuss` defaults to `Primary=claude-sonnet-4-5`, `Validator=gpt-4o`, `Reviewer=gemini-2.5-pro`.
- In that mixed case, the default judge model is `gemini-2.5-flash`.
- If only one or two provider keys are configured, defaults are chosen from the available providers automatically.
- If OpenAI or Google billing is not enabled, those calls can fail with `429` or quota errors.
- To stay single-provider, override `judge_model`, pass Anthropic-only personas, or provide a custom `.llm-conclave.json`.

### SSE works but MCP tools do not

- `node dist/src/mcp/server.js --sse` is for HTTP/SSE transport and the REST API.
- MCP clients that spawn the server directly should use plain `node dist/src/mcp/server.js` via `.mcp.json`.
- A healthy `/health` endpoint does not prove the MCP client has loaded or approved the stdio server.

## SSE and REST Mode

The built artifact can run as a standard MCP stdio server or as an SSE server.

```bash
node dist/src/mcp/server.js --sse
```

When running in SSE mode, the server exposes:

- `GET /sse`
- `POST /messages`
- `POST /api/discuss`
- `GET /health`

Example REST request:

```bash
curl -X POST http://localhost:3100/api/discuss \
  -H 'Content-Type: application/json' \
  -d '{"task":"Review this architecture decision","rounds":2}'
```

If `CONCLAVE_API_KEY` is set, `POST /api/discuss` requires `Authorization: Bearer <key>`.

## Development

```bash
npm run build
npm test -- --runInBand --watchman=false
npm run test:coverage -- --runInBand --watchman=false
npm run mcp-dev
```

Current local snapshot from `2026-04-07`:

- `78` test suites total
- `1,048` tests total
- `76` suites and `1,028` tests passing in the sandbox
- The remaining failures are artifact-store tests that try to write under `~/.llm-conclave`, which the sandbox blocks

## Architecture

```text
src/
  config/        Config cascade and persona system
  consult/       Consult-mode analysis, formatting, cost, health, analytics
  core/          Conversation lifecycle, judge, sessions, history, artifacts
  mcp/           MCP server, transports, REST endpoint, discussion runner
  orchestration/ Orchestrators and state machines
  providers/     Provider adapters for all supported LLM families
  tools/         Tool registry and tool-pruning logic
  types/         Shared TypeScript types
  utils/         Context, logging, token, and config helpers
```

## Documentation

- [docs/MCP_SERVER.md](docs/MCP_SERVER.md)
- [docs/PLANNED_FEATURES.md](docs/PLANNED_FEATURES.md)
- [docs/RESUME_FEATURE_DESIGN.md](docs/RESUME_FEATURE_DESIGN.md)
- [docs/plans/2026-02-12-context-tax-optimization.md](docs/plans/2026-02-12-context-tax-optimization.md)
- [TEST_COVERAGE_ANALYSIS.md](TEST_COVERAGE_ANALYSIS.md)
