<!-- generated-by: gsd-doc-writer -->
# Configuration

LLM Conclave resolves configuration from five sources in descending priority order:

1. **CLI flags** — highest priority; override everything
2. **`CONCLAVE_*` environment variables** — mapped to config keys at runtime
3. **Project config** — `.llm-conclave.json` in the working directory (or `--config` path)
4. **Global config** — `~/.llm-conclave/config.json`
5. **Smart defaults** — built-in, zero-config fallbacks

## Environment Variables

### Provider API Keys

At least one provider key must be present. The server enables only the providers whose keys it finds at startup.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | One or more required | OpenAI API key (GPT models) |
| `ANTHROPIC_API_KEY` | One or more required | Anthropic API key (Claude models) |
| `GOOGLE_API_KEY` | One or more required | Google API key for Gemini (preferred name) |
| `GEMINI_API_KEY` | One or more required | Gemini alias — accepted alongside `GOOGLE_API_KEY` |
| `XAI_API_KEY` | One or more required | xAI API key (Grok models) |
| `MISTRAL_API_KEY` | One or more required | Mistral AI API key |

Copy `.env.example` to `.env` and populate the keys for the providers you intend to use.

### Server and Transport

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONCLAVE_API_KEY` | Required for REST export | — | Bearer token for `POST /api/discuss` and `POST /api/export_record`. The export route is **fail-closed**: if unset, the route returns 503. The discuss route treats auth as optional when the key is absent. |
| `MCP_SSE_PORT` | Optional | `3100` | Port for the SSE HTTP server. Setting this variable also activates SSE mode (same effect as the `--sse` flag). |

### Data and Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_CONCLAVE_HOME` | Optional | `~/.llm-conclave` | Overrides the runtime artifacts root used for sessions, logs, and consult output. Takes precedence over the `conclaveHome` key in `~/.llm-conclave/config.json`. Must be an absolute path. |
| `CONCLAVE_SECRET` | Optional | random per session | HMAC signing secret for partial result integrity. Without a stable value, results saved in one session cannot be verified in another. |

### Security and Context

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONCLAVE_ALLOWED_CONTEXT_ROOTS` | Optional | — | Colon-separated list of additional absolute paths that the `context` parameter may reference. **Honored only under stdio transport.** Silently ignored under SSE and REST — fail-closed, so leaving this set on a network-exposed server is safe. Never set on a publicly accessible deployment. |

### Provider Behavior

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONCLAVE_ANTHROPIC_CONTEXT_EDITING` | Optional | off | Set to `1` to enable Anthropic context editing in the Claude provider. |
| `CONCLAVE_DISABLE_ROUTING` | Optional | off | Set to `1` or `true` to disable model routing in ConversationManager. |
| `LLM_CONCLAVE_TPM_<PROVIDER>` | Optional | See below | Override the tokens-per-minute ceiling for a specific provider. Replace `<PROVIDER>` with the uppercase provider name: `OPENAI`, `ANTHROPIC`, `GOOGLE`, `XAI`, or `MISTRAL`. Example: `LLM_CONCLAVE_TPM_OPENAI=60000`. |
| `SEMANTIC_ANALYSIS_MODEL` | Optional | `gpt-4o-mini` | Model used for semantic position comparison during consult analysis. |

**Default TPM ceilings** (used when no env var or config override is set):

| Provider | Default TPM |
|---|---|
| OpenAI | 30,000 |
| Anthropic | 40,000 |
| Google | 1,000,000 |
| xAI | 60,000 |
| Mistral | 500,000 |

### CONCLAVE_* Discussion Config Variables

Any `CONCLAVE_<KEY>` variable is parsed into the runtime config object. Valid top-level keys:

```
CONCLAVE_MODE            # consensus | discuss | consult
CONCLAVE_STREAM          # true | false
CONCLAVE_ROUNDS          # number
CONCLAVE_VERBOSE         # true | false
CONCLAVE_QUIET           # true | false
CONCLAVE_FORMAT          # markdown | json | both
CONCLAVE_QUICK           # true | false
CONCLAVE_AUTO_APPROVE    # true | false — ⚠ parsed but not yet wired (see note)
```

> **Note:** `CONCLAVE_AUTO_APPROVE` is now parsed into config as `auto_approve` (a prior `ConfigCascade` bug that split env keys on `_` and tested only the first segment, dropping any multi-word top-level key, was fixed). However, no code currently reads `config.auto_approve`, so the variable still has no observable effect. It is reserved for a future auto-approve feature.

Valid nested keys (mapped using underscore-separated segments):

```
CONCLAVE_JUDGE_MODEL     # e.g. gemini-2.5-flash
CONCLAVE_JUDGE_PROVIDER  # e.g. google
CONCLAVE_JUDGE_PROMPT    # custom judge system prompt
CONCLAVE_OUTPUT_FORMAT   # output format override
CONCLAVE_OUTPUT_DIR      # output directory
CONCLAVE_PROVIDERS_OPENAI    # true | false
CONCLAVE_PROVIDERS_ANTHROPIC # true | false
CONCLAVE_PROVIDERS_GOOGLE    # true | false
CONCLAVE_PROVIDERS_XAI       # true | false
CONCLAVE_PROVIDERS_MISTRAL   # true | false
```

Unknown `CONCLAVE_*` keys are ignored with a warning (suppressed in production).

## Config File Format

### Project Config — `.llm-conclave.json`

Placed in the working directory or passed via `--config`. Supports both file paths and inline JSON strings (a string beginning with `{` is parsed directly rather than treated as a path).

```json
{
  "turn_management": "roundrobin",
  "max_rounds": 20,
  "judge": {
    "model": "gemini-2.5-flash",
    "prompt": "You are the judge..."
  },
  "agents": {
    "Architect": {
      "model": "claude-sonnet-4-6",
      "prompt": "You are a senior software architect..."
    },
    "Critic": {
      "model": "gpt-5.5",
      "prompt": "You are a critical thinker..."
    }
  }
}
```

**Agent fields:**

| Field | Required | Notes |
|---|---|---|
| `model` | Yes | Any model string recognized by the provider factory |
| `prompt` or `systemPrompt` | Yes | Both accepted; `prompt` wins if both are set with different values |
| `provider` | No | Inferred from model name when omitted |

**Top-level fields:**

| Field | Default | Notes |
|---|---|---|
| `agents` | — | Required; must contain at least one agent |
| `judge.model` | `gpt-5.5` | Synthesis model |
| `judge.prompt` | built-in | System prompt for the judge |
| `max_rounds` | `20` | Maximum discussion rounds before forced consensus |
| `turn_management` | `roundrobin` | Only `roundrobin` is supported |

### Global Config — `~/.llm-conclave/config.json`

User-level config applied before project config. Supports custom personas and data root relocation.

```json
{
  "conclaveHome": "/opt/conclave-data",
  "custom_personas": {
    "healthCoach": {
      "name": "Health Coach",
      "model": "claude-sonnet-4-6",
      "provider": "anthropic",
      "systemPrompt": "You are a certified health coach..."
    }
  },
  "persona_sets": {
    "health": ["healthCoach", "nutritionist", "psychologist"]
  }
}
```

**Top-level keys:**

| Key | Description |
|---|---|
| `conclaveHome` | Absolute path to relocate runtime artifacts. Overridden by `LLM_CONCLAVE_HOME` env var. |
| `custom_personas` | Named expert personas available to the `--with` / `personas` parameter. |
| `persona_sets` | Named groups that expand to a list of persona names (prefix with `@` to use a set). |

## Runtime Artifacts Root

The effective data root (`LLM_CONCLAVE_HOME`) is resolved in this order:

1. `LLM_CONCLAVE_HOME` environment variable (if set and non-empty)
2. `conclaveHome` key in `~/.llm-conclave/config.json`
3. `~/.llm-conclave` (default)

The global config file itself always lives at `~/.llm-conclave/config.json` regardless of where the data root is redirected — this avoids a chicken-and-egg problem.

## MCP Repo-Local Setup

The `.mcp.json` at the project root registers the server with Claude Code using stdio transport:

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

Provider keys and other variables are read from `.env` at startup. To add environment variables visible to the MCP process, add them to `.env` and restart Claude Code (stdio processes are cached per session).

## Smart Defaults

When no project or global config file is present, the server selects agents automatically based on which provider keys are set:

- **Full panel (OpenAI + Anthropic + Google all present):** Primary=`claude-sonnet-4-6`, Validator=`gpt-5.5`, Reviewer=`gemini-2.5-pro`, Judge=`gemini-2.5-flash`
- **Single provider:** Three agents from that provider's model list
- **No keys set:** Falls back to the full-panel defaults (useful for config validation before keys are populated)

Default discussion mode is `consensus` with streaming enabled.
