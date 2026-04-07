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
npm run build
```

Output artifact:

```text
dist/src/mcp/server.js
```

## Client Configuration

### Claude Code or Claude Desktop

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
- Only include API keys for providers you intend to use
- After rebuilding or changing config, restart the MCP client

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
