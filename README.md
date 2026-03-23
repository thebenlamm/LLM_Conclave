# LLM Conclave

A multi-agent LLM collaboration MCP server. Enables multiple LLMs (OpenAI, Anthropic, Google Gemini, xAI Grok, Mistral) to collaboratively solve tasks through structured multi-turn conversation.

## Features

- **Multi-Agent Collaboration**: Configure multiple LLM agents with different models and personas
- **5 LLM Providers**: OpenAI GPT, Anthropic Claude, xAI Grok, Google Gemini, Mistral AI
- **MCP Server**: Expose consultation capabilities as tools for any MCP-compatible AI assistant (Claude Code, Claude Desktop, Cursor, VS Code, etc.)
- **Structured Consultation**: 4-round debate (positions, synthesis, cross-examination, verdict)
- **Democratic Discussion**: Consensus-driven multi-agent discussions with judge coordination
- **Dynamic Speaker Selection**: LLM-based speaker selection instead of round-robin
- **Session Continuation**: Save and continue discussions with follow-up questions
- **Tool Support**: Agents can read/write files, run commands, and perform real file operations
- **Context Tax Optimization**: Prompt caching, tool pruning, context editing (35-50% cost reduction)
- **Cost Tracking**: Automatic per-session cost, token, and latency tracking
- **Structured Output**: Returns `key_decisions`, `action_items`, `dissent`, `confidence`
- **Devil's Advocate Mode**: Detects shallow agreement and pushes for genuine analysis

## Quick Start

### 1. Build

```bash
npm install
npm run build
```

### 2. Configure Your MCP Client

#### Claude Code

Add to `~/.claude/settings.json` or project `.mcp.json`:

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

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "llm-conclave": {
      "command": "node",
      "args": ["/absolute/path/to/llm_conclave/dist/src/mcp/server.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GOOGLE_API_KEY": "AIza..."
      }
    }
  }
}
```

### 3. Restart Your AI Assistant

Restart Claude Code / Claude Desktop / Cursor to load the MCP server.

### 4. Use the Tools

Ask your AI assistant:

```
"Use llm_conclave_consult to get expert consensus on whether
I should use OAuth or JWT for my authentication system"
```

## Available MCP Tools

### `llm_conclave_consult`

Fast 4-round structured consultation with a configurable expert panel (2-5 agents).

**Default panel:** Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini)

| Parameter | Required | Description |
|-----------|----------|-------------|
| `question` | Yes | The question or decision to consult on |
| `context` | No | File paths (comma-separated) or project directory |
| `personas` | No | Expert panel: `security`, `performance`, `architect`, `creative`, `skeptic`, `pragmatic`, `qa`, `devops`, `accessibility`, `documentation`. Sets: `@design`, `@backend` |
| `rounds` | No | 1-4 rounds. 1=opinions, 2=+synthesis, 3=+cross-exam, 4=full |
| `quick` | No | Quick mode (2 rounds) |
| `format` | No | `markdown` (default), `json`, or `both` |

### `llm_conclave_discuss`

Democratic consensus discussion where agents contribute equally.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task` | Yes | The topic or problem to discuss |
| `personas` | No | Comma-separated personas (see above) |
| `config` | No | Path to `.llm-conclave.json` or inline JSON agent definitions |
| `project` | No | Project context path |
| `rounds` | No | Maximum rounds (default: 4) |
| `min_rounds` | No | Minimum rounds before early consensus |
| `dynamic` | No | Enable LLM-based speaker selection |
| `selector_model` | No | Model for speaker selection (default: gpt-4o-mini) |
| `judge_model` | No | Judge model (default: gemini-2.5-flash) |

### `llm_conclave_continue`

Continue a previous discussion with follow-up questions.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task` | Yes | Follow-up question |
| `session_id` | No | Session to continue (default: most recent) |
| `reset` | No | Start fresh with summary only |

### `llm_conclave_sessions`

List recent sessions that can be continued.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `limit` | No | Number of sessions (default: 10) |
| `mode` | No | Filter by mode |

## Personas

**Built-in:** `security`, `performance`, `architect`, `creative`, `skeptic`, `pragmatic`, `qa`, `devops`, `accessibility`, `documentation`

**Aliases:** `arch`, `sec`, `perf`, `dev`, `ops`, `a11y`, `docs`, `devil`, `practical`, `tester`

**Persona sets** (@ prefix): `@design`, `@backend`, or define custom sets in `~/.llm-conclave/config.json`

### Custom Personas

Define in `~/.llm-conclave/config.json`:

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
    "health": ["healthCoach", "psychologist", "nutritionist"]
  }
}
```

## Custom Agent Configuration

Create `.llm-conclave.json` for custom agents:

```json
{
  "agents": {
    "Architect": {
      "model": "gpt-4o",
      "prompt": "You are a senior software architect..."
    },
    "Critic": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a critical thinker and devil's advocate..."
    },
    "Creative": {
      "model": "gemini-2.5-pro",
      "prompt": "You are a creative innovator..."
    }
  }
}
```

Or pass inline JSON via the MCP `config` parameter:

```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Design auth system",
    "config": "{\"agents\":{\"Expert\":{\"model\":\"claude-sonnet-4-5\",\"prompt\":\"...\"}}}"
  }
}
```

## Supported Models

| Provider | Models | Env Var |
|----------|--------|---------|
| OpenAI | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4-turbo` | `OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| Google | `gemini-3-pro`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` | `GOOGLE_API_KEY` |
| xAI | `grok-3`, `grok-vision-3` | `XAI_API_KEY` |
| Mistral | `mistral-large-latest`, `mistral-small-latest`, `codestral-latest` | `MISTRAL_API_KEY` |

You only need API keys for the providers you're using.

## Development

```bash
npm run build          # TypeScript compile
npm test               # Jest (885 tests, 70 suites)
npm run test:unit      # Skip integration/live tests
npm run test:coverage  # With coverage report
npm run mcp-dev        # Run MCP server in dev mode (ts-node)
```

## Architecture

```
src/
  config/        # ConfigCascade, PersonaSystem
  consult/       # Consult mode: artifacts, strategies, health, cost, analytics
  core/          # ConversationManager (judge logic, fallbacks, tool execution)
  mcp/           # MCP server (SSE transport, consult/discuss/continue/sessions tools)
  orchestration/ # Orchestrators per mode + ConsultStateMachine
  providers/     # LLM providers (Claude, OpenAI, Gemini, Grok, Mistral)
  tools/         # Tool registry, ToolPruningInstructions
  types/         # Shared TypeScript interfaces
```

## Documentation

- [MCP Server Setup](docs/MCP_SERVER.md) - Detailed setup and usage guide
- [Planned Features](docs/PLANNED_FEATURES.md) - Roadmap and future plans
- [Resume Feature Design](docs/RESUME_FEATURE_DESIGN.md) - Session continuation architecture
- [Context Tax Optimization](docs/plans/2026-02-12-context-tax-optimization.md) - Cost optimization design

## Troubleshooting

**"MCP server not found"**: Verify the path in your MCP config is absolute and you've run `npm run build`.

**API errors**: Check that API keys are set in the MCP config `env` section.

**"Unknown model"**: Verify model names match the supported models table above.

**MCP code changes not picked up**: After rebuilding, restart your AI assistant. MCP processes are cached per session.

## License

ISC
