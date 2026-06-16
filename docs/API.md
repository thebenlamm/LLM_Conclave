<!-- generated-by: gsd-doc-writer -->
# API Reference

LLM Conclave exposes two interfaces: **MCP tools** (primary, used by MCP-compatible clients such as Claude Code) and a **REST API** (available when running in SSE mode). Both surfaces share the same underlying logic.

---

## Transport Modes

| Mode | How to start | Binds to |
|------|-------------|----------|
| stdio (default) | `node dist/src/mcp/server.js` | stdin/stdout |
| SSE | `node dist/src/mcp/server.js --sse [port]` | `127.0.0.1:<port>` (default `3100`) |

The REST endpoints (`/api/discuss`, `/api/export_record`) and SSE endpoints (`/sse`, `/messages`) are only available in SSE mode. The `MCP_SSE_PORT` environment variable can substitute for the `--sse` flag.

---

## Authentication

### `POST /api/discuss` — optional auth

When `CONCLAVE_API_KEY` is set in the server environment, every request must include a `Bearer` token:

```
Authorization: Bearer <CONCLAVE_API_KEY>
```

Comparison is constant-time (`crypto.timingSafeEqual`) to prevent timing-based key enumeration. If `CONCLAVE_API_KEY` is **not** set, all requests are accepted without auth.

### `POST /api/export_record` — fail-closed auth

This endpoint is **always** auth-gated:

- If `CONCLAVE_API_KEY` is not configured → `503 Service Unavailable`
- If the token is absent or incorrect → `401 Unauthorized`

There is no unauthenticated mode for export.

MCP tools (`llm_conclave_*`) do not use HTTP auth — they are protected by the MCP client's own transport security.

---

## REST Endpoints

### `GET /health`

Health check. Returns immediately with no auth requirement.

**Response**

```json
{
  "status": "ok",
  "transport": "sse",
  "activeSessions": 2
}
```

---

### `POST /api/discuss`

Run a multi-agent discussion and return structured JSON. Accepts the same parameters as the `llm_conclave_discuss` MCP tool. Always returns JSON regardless of any `format` field.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `task` | string | Yes | — | The topic or question to discuss |
| `project` | string | No | — | Project context path (file or directory, validated within server cwd) |
| `personas` | string | No | — | Comma-separated persona names (e.g. `"security,architect,pragmatic"`) or `@set` reference |
| `config` | string | No | — | Inline JSON agent config only — file paths are rejected with 400 |
| `rounds` | number | No | `4` | Maximum discussion rounds |
| `min_rounds` | number | No | `2` | Minimum rounds before consensus can end the discussion early |
| `dynamic` | boolean | No | `false` | Enable LLM-moderated dynamic speaker selection |
| `selector_model` | string | No | (default selector model) | Model used for dynamic speaker selection |
| `judge_model` | string | No | `gemini-2.5-flash` | Model for judge/synthesis step |
| `judge_instructions` | string | No | — | Custom text appended to the judge synthesis prompt |
| `timeout` | number | No | `0` | Max seconds; `0` = no timeout. Must be `>= 0` |
| `context_optimization` | boolean | No | `false` | 50–70% token reduction: agents see only positions, judge sees full turns |
| `show_turns` | boolean | No | `false` | Include full turn-by-turn history as `turns[]` in response |

**Response — success (`200`)**

```json
{
  "success": true,
  "task": "...",
  "summary": "...",
  "consensus_reached": true,
  "confidence": "high",
  "final_confidence": "HIGH",
  "confidence_reasoning": "...",
  "confidence_cause": "...",
  "run_integrity_status": "OK",
  "rounds": { "completed": 3, "max": 4 },
  "agents": [{ "name": "Security", "model": "claude-sonnet-4-5" }],
  "realized_panel": [{ "agent": "Security", "actual_model": "claude-sonnet-4-5", "configured_model": "claude-sonnet-4-5", "substituted": false }],
  "per_agent_positions": [{ "agent": "Security", "model": "claude-sonnet-4-5", "final_turn_excerpt": "...", "truncated": false }],
  "key_decisions": ["..."],
  "action_items": ["..."],
  "dissent": ["..."],
  "constraints_detected": [],
  "provenance": [],
  "tokens": { "input": 12000, "output": 3400, "total": 15400 },
  "cost_usd": 0.0312,
  "session_id": "session_2026-01-20T00-13-38_p3n1",
  "log_file": "/Users/you/.llm-conclave/discussions/...",
  "session_status": "completed",
  "conclave_home": "/Users/you/.llm-conclave",
  "judge_coinage": [],
  "section_order": ["summary", "agent_positions", "constraints_detected", "dissent", "key_decisions", "provenance", "action_items"]
}
```

When `show_turns: true`, the response additionally contains a `turns` array:

```json
{
  "turns": [
    { "round": 1, "role": "assistant", "speaker": "Security", "model": "claude-sonnet-4-5", "content": "...", "timestamp": "..." }
  ]
}
```

**Response — pre-flight failure (`400`)**

```json
{
  "success": false,
  "error": "Pre-flight validation failed",
  "preflight_results": [...]
}
```

---

### `POST /api/export_record`

Export a completed Conclave session as a compliance-grade Deliberation Record. Read-only: no LLM calls, no panel re-run.

**Body size limit:** 64 kb (returns `400` with `"Request body too large (limit 64kb)"` on overflow).

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operator_name` | string | Yes | Name of the decision-owner stamped in Field 8. Max 200 bytes. |
| `session_id` | string | No | Session to export (e.g. `session_2026-01-20T00-13-38_p3n1`). Omit for most-recent. Only `[A-Za-z0-9_\-]` allowed; path-traversal chars rejected. Max 200 chars. |
| `panel_rationale` | string | No | Free-text rationale for panel composition (Field 2). Max 5000 bytes. |
| `format` | `"markdown"` \| `"pdf"` | No | Output format. Default `"markdown"`. |
| `branding` | object | No | PDF branding (ignored for markdown). |
| `branding.companyName` | string | No | Company name in PDF header. Max 200 bytes. |
| `branding.accentColor` | string | No | Hex accent color (e.g. `"#1a73e8"`). Max 16 bytes. |
| `branding.footerText` | string | No | Footer line (e.g. confidentiality notice). Max 500 bytes. |
| `mitigations` | object | No | Operator mitigations keyed by EXACT dissent concern text (verbatim match). Max 100 keys; key max 2000 bytes, value max 5000 bytes. |

**Response — success (`200`)**

```json
{
  "success": true,
  "format": "markdown",
  "content": "# Deliberation Record\n...",
  "concern_keys": ["Risk: no rate limiting on auth endpoint"],
  "unmatched_mitigations": []
}
```

When `format: "pdf"`, `content` is a base64-encoded PDF string.

`concern_keys` contains the exact verbatim dissent concern strings keyed in the record. `unmatched_mitigations` surfaces any mitigation keys that did not match a recorded concern (allowing the caller to detect and correct key typos).

---

## Error Codes

| Status | Condition |
|--------|-----------|
| `400` | Missing required field, invalid field type, body too large (>64kb), `ExportValidationError` (bad session_id format, unsupported format, session not found) |
| `401` | Bearer token absent or incorrect |
| `503` | `CONCLAVE_API_KEY` not set (export_record only — fail-closed) |
| `500` | Internal server error |

Error responses always use the envelope `{ "success": false, "error": "<message>" }`.

---

## Rate Limits

No rate limiting is configured. The server binds to `127.0.0.1` and is not intended to be exposed directly to the public internet. Use a reverse proxy with its own rate-limiting layer for production deployments. See `docs/CONFIGURATION.md` for `CONCLAVE_API_KEY` setup.

---

## MCP Tools

The primary interface for MCP clients. Tools are registered on the `llm-conclave` server and invoked via the standard MCP `tools/call` protocol. All tools accept `snake_case` parameters and return text content.

### `llm_conclave_consult`

Run a structured multi-round consultation: independent positions → synthesis → cross-examination → resolution.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `question` | string | Yes | — | The question or problem to consult on |
| `context` | string | No | — | File path(s) or project directory (comma-separated for multiple files). Sandbox-restricted to server cwd or `CONCLAVE_ALLOWED_CONTEXT_ROOTS` (stdio only). |
| `personas` | string | No | — | Comma-separated built-in persona names or `@set`. Default panel: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini). |
| `rounds` | number | No | `4` | Rounds 1–4. 1=opinions, 2=positions+synthesis, 3=adds cross-exam, 4=full with verdict. |
| `quick` | boolean | No | `false` | Shorthand for 2 rounds (positions + synthesis). |
| `format` | `"markdown"` \| `"json"` \| `"both"` | No | `"markdown"` | Output format. |
| `judge_model` | string | No | `gpt-4o` | Model for judge/synthesis rounds. |
| `strict_models` | boolean | No | `false` | Hard-error instead of silently substituting a model on provider failure. |

**Built-in personas:** `security`, `performance`, `architect`, `creative`, `skeptic`, `pragmatic`, `qa`, `devops`, `accessibility`, `documentation`  
**Persona sets:** none are built in. Sets like `@design` / `@backend` are user-defined — `PersonaSystem.loadPersonaSets()` returns `{}` unless you add a `persona_sets` key to `~/.llm-conclave/config.json`.

---

### `llm_conclave_discuss`

Free-form multi-agent discussion where agents debate and build on each other's ideas. Recommended for complex decisions requiring diverse expert perspectives.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task` | string | Yes | — | The topic or task to discuss |
| `project` | string | No | — | Project context path (file or directory) |
| `personas` | string | No | — | Comma-separated personas (3–5 recommended) or `@set` |
| `config` | string | No | — | Custom agent config: inline JSON or file path to `.llm-conclave.json` (file paths restricted under REST) |
| `rounds` | number | No | `4` | Maximum discussion rounds |
| `min_rounds` | number | No | `2` | Minimum rounds before early consensus |
| `dynamic` | boolean | No | `false` | Dynamic speaker selection via LLM moderator |
| `selector_model` | string | No | (default) | Model for dynamic speaker selection |
| `judge_model` | string | No | `gemini-2.5-flash` | Model for judge (evaluates consensus, writes summary) |
| `timeout` | number | No | `0` | Max seconds; `0` = no timeout |
| `format` | `"markdown"` \| `"json"` \| `"both"` | No | `"markdown"` | Output format |
| `judge_instructions` | string | No | — | Custom text appended to judge synthesis prompt |
| `context_optimization` | boolean | No | `false` | 50–70% token reduction mode |
| `strict_models` | boolean | No | `false` | Hard-error on model substitution |
| `show_turns` | boolean | No | `false` | Include full `turns[]` array in JSON response |

**Custom persona config example (inline JSON):**
```json
{
  "agents": {
    "Expert": { "model": "claude-sonnet-4-5", "prompt": "You are a domain expert..." },
    "Reviewer": { "model": "gpt-4o", "prompt": "You review and critique solutions..." }
  }
}
```

---

### `llm_conclave_continue`

Continue a previous discussion session with a follow-up question or task. Preserves agent panel and conversation history. Model substitutions from the original session remain in effect — the originally-configured model is not retried.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task` | string | Yes | — | Follow-up question or task |
| `session_id` | string | No | (most recent) | Session ID to continue |
| `reset` | boolean | No | `false` | Start fresh using only a summary of the previous session |
| `show_turns` | boolean | No | `false` | Return structured JSON with `turns[]` instead of markdown |

---

### `llm_conclave_sessions`

List recent discussion sessions available for continuation.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | `10` | Max sessions to return |
| `mode` | `"consensus"` \| `"orchestrated"` \| `"iterative"` | No | — | Filter by discussion mode |

---

### `llm_conclave_status`

Check the status of any active Conclave discussion, or see the most recent completed session. Instant filesystem read — no LLM calls, never times out.

No parameters required.

---

### `llm_conclave_export_record`

Export a completed session as a compliance-grade Deliberation Record audit artifact. Read-only; no LLM calls, no panel re-run.

**Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operator_name` | string | Yes | Name of the operator/decision-owner stamped in Field 8 |
| `session_id` | string | No | Session to export (e.g. `session_2026-01-20T00-13-38_p3n1`). Omit for most-recent. Only letters, digits, underscores, and hyphens accepted. |
| `panel_rationale` | string | No | Optional free-text rationale for panel composition (Field 2) |
| `format` | `"markdown"` \| `"pdf"` | No | Output format. Default `"markdown"`. PDF returns base64-encoded content. |
| `branding` | object | No | Per-request PDF branding: `companyName`, `accentColor`, `footerText`. Ignored for markdown. |
| `mitigations` | object | No | Operator mitigations keyed by EXACT dissent concern text. Non-matching keys surface in the `unmatched_mitigations` response field. |

**MCP response (PDF):** Returns a text block containing `"Deliberation Record exported as PDF (N bytes, base64).\nConcern keys: ..."` followed by the base64 string.

**MCP response (markdown):** Returns the rendered UTF-8 Deliberation Record text directly.

---

## MCP Error Handling

MCP tool errors return a response with `isError: true` and a `content[].text` describing the failure. Structured error types:

| Trigger | Response |
|---------|----------|
| Pre-flight TPM limit exceeded | Formatted table listing offending agents with options to trim prompt, switch model, or allow substitution |
| `strict_models: true` and a substitution was blocked | Lists the blocked agent, original model, fallback model, and reason |
| Provider credential or model validation failure | Formatted `✅`/`❌` table showing per-agent preflight results |
| `ExportValidationError` in `export_record` | Graceful text: `"Export error: <message>"` without `isError` (user-actionable validation message) |
| Unexpected internal error in `export_record` | `isError: true` with generic `"Export error: internal error"` (detail logged server-side) |
