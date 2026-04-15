# LLM Conclave MCP Server

This document covers the current MCP server surface: how to run it, how to configure clients, and what the exposed tools actually accept today.

## Overview

LLM Conclave exposes four MCP tools:

- `llm_conclave_consult`
- `llm_conclave_discuss`
- `llm_conclave_continue`
- `llm_conclave_sessions`

The server supports two transport modes:

- `stdio` for normal MCP client launches
- `SSE` for shared HTTP transport, with an additional REST endpoint for discussion requests

## Build

```bash
npm install
```

Output artifact:

```text
dist/src/mcp/server.js
```

`npm install` also runs the build automatically via `postinstall`.

For the shortest first-run path, use:

```bash
npm install
npm run setup
```

`npm run setup` creates `.env` from `.env.example` if missing, validates that the checked-in `.mcp.json` points to `scripts/mcp-stdio.js`, builds the server, smoke-tests the MCP stdio launcher with an `initialize` request, and prints Claude Code next steps.

## Client Configuration

### Claude Code or Claude Desktop

For Claude Code, prefer a project-local `.mcp.json` in the repository root.

This repository now includes one by default:

```json
{
  "mcpServers": {
    "llm-conclave": {
      "command": "node",
      "args": ["scripts/mcp-stdio.js"]
    }
  }
}
```

That launcher reads provider keys from the repo's `.env` file before starting the built server.

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

### Notes

- Use an absolute path to `dist/src/mcp/server.js`
- If you use the checked-in `.mcp.json`, `scripts/mcp-stdio.js` handles `.env` loading for you
- Only include API keys for providers you intend to use
- `stdio` is the normal MCP launch mode; do not add `--sse` for direct MCP client launches
- After rebuilding or changing config, restart or start a fresh MCP client session
- If the client prompts for MCP server approval, approve `llm-conclave`
- When Anthropic, OpenAI, and Google are all configured, the default zero-config discussion panel is mixed-provider:
  - `Primary`: `claude-sonnet-4-5`
  - `Validator`: `gpt-4o`
  - `Reviewer`: `gemini-2.5-pro`
  - Judge default: `gemini-2.5-flash`
- If only a subset of provider keys is present, defaults are selected from the available providers automatically

## Tool Reference

### `llm_conclave_consult`

Structured consultation with a fixed 1-4 round flow.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `question` | string | Yes | Main prompt |
| `context` | string | No | File paths or a directory path |
| `personas` | string | No | Comma-separated personas or configured persona sets |
| `rounds` | number | No | `1` to `4` |
| `quick` | boolean | No | Uses 2 consult rounds |
| `format` | string | No | `markdown`, `json`, or `both` |
| `judge_model` | string | No | Overrides the consult judge model |

Consult defaults to a three-agent panel if no personas are provided:

- Security Expert
- Systems Architect
- Pragmatic Engineer

### `llm_conclave_discuss`

Free-form collaborative discussion with persisted sessions.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `task` | string | Yes | Main topic |
| `project` | string | No | File or directory context |
| `personas` | string | No | Comma-separated personas |
| `config` | string | No | `.llm-conclave.json` path or inline JSON |
| `rounds` | number | No | Default `4` |
| `min_rounds` | number | No | Default `2`; cannot exceed `rounds` |
| `dynamic` | boolean | No | Enables LLM-selected speaker order |
| `selector_model` | string | No | Defaults to `gpt-4o-mini` |
| `judge_model` | string | No | Overrides the judge model |
| `timeout` | number | No | Seconds; `0` disables timeout |
| `format` | string | No | `markdown`, `json`, or `both` |
| `judge_instructions` | string | No | Appended to the judge prompt |
| `context_optimization` | boolean | No | Structured reasoning/position split for lower context cost |

### `llm_conclave_continue`

Continue a previous discussion session.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `task` | string | Yes | Follow-up request |
| `session_id` | string | No | Defaults to most recent saved session |
| `reset` | boolean | No | Reuse only a summary of the prior session |

### `llm_conclave_sessions`

List recent sessions.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `limit` | number | No | Default `10` |
| `mode` | string | No | `consensus`, `orchestrated`, or `iterative` |

## Personas

Canonical built-ins:

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

Accepted aliases include:

- `architect`, `arch` -> `architecture`
- `qa`, `tester`, `testing`, `quality` -> `testing`
- `sec` -> `security`
- `perf` -> `performance`
- `docs` -> `documentation`
- `a11y` -> `accessibility`
- `devil`, `devils-advocate` -> `skeptic`

Custom personas and persona sets are loaded from `~/.llm-conclave/config.json`.

Example:

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

Then call `personas: "@health"` or `personas: "@health,architecture"`.

## Config Files

### Global config

```text
~/.llm-conclave/config.json
```

Used for custom personas and persona sets.

### Project config

```text
.llm-conclave.json
```

Used for custom agent definitions in discuss mode.

Minimal example:

```json
{
  "agents": {
    "Architect": {
      "model": "gpt-4o",
      "prompt": "You are a senior software architect..."
    },
    "Reviewer": {
      "model": "claude-sonnet-4-5",
      "prompt": "You challenge assumptions and identify risks..."
    }
  }
}
```

The `config` parameter on `llm_conclave_discuss` also accepts inline JSON.

## Running in SSE Mode

```bash
node dist/src/mcp/server.js --sse
```

Endpoints exposed in SSE mode:

- `GET /sse`
- `POST /messages`
- `POST /api/discuss`
- `GET /health`

### REST endpoint

`POST /api/discuss` accepts the same discussion parameters as `llm_conclave_discuss`, with two differences:

- The response is always JSON
- `config` must be inline JSON, not a file path

Example:

```bash
curl -X POST http://localhost:3100/api/discuss \
  -H 'Content-Type: application/json' \
  -d '{"task":"Review this architecture decision","rounds":2}'
```

Optional auth:

- If `CONCLAVE_API_KEY` is unset, no auth is required
- If `CONCLAVE_API_KEY` is set, send `Authorization: Bearer <key>`

## Output Formats

### `markdown`

Human-readable summary with structured sections.

### `json`

Structured payload for programmatic consumers, including fields such as:

- `summary`
- `key_decisions`
- `action_items`
- `dissent`
- `confidence`
- `agents`
- `session_id`

### `both`

JSON plus a `markdown_summary` field.

## Development Notes

- `npm run mcp-dev` runs the server through `ts-node`
- For local test runs in constrained environments, use `--watchman=false`
- The current tests cover the MCP server handlers and transport paths directly

## Related Docs

- [README.md](../README.md)
- [docs/RESUME_FEATURE_DESIGN.md](RESUME_FEATURE_DESIGN.md)
- [TEST_COVERAGE_ANALYSIS.md](../TEST_COVERAGE_ANALYSIS.md)
