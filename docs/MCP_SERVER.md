# LLM Conclave MCP Server

The LLM Conclave MCP (Model Context Protocol) Server exposes llm_conclave's multi-agent consultation capabilities as tools that ANY MCP-compatible AI assistant can use.

## What is MCP?

The Model Context Protocol (MCP) is a standard way for AI assistants to access external tools and data sources. Instead of being limited to built-in capabilities, AI assistants can invoke MCP tools to extend their functionality.

## Why Use the MCP Server?

**Instead of running llm_conclave CLI commands yourself**, you can let your AI assistant:
- Run multi-model consultations as part of solving your problem
- Get expert consensus on technical decisions in real-time
- Leverage 5 different LLM providers (OpenAI, Claude, Gemini, Grok, Mistral) simultaneously
- Access past consultation results and analytics

**Works with:**
- Claude Desktop
- Cursor
- VS Code with Claude Extension
- Any MCP-compatible AI assistant

---

## Quick Start

### 1. Build the MCP Server

```bash
cd /path/to/llm_conclave
npm run build
```

This compiles the TypeScript and creates `dist/src/mcp/server.js`.

### 2. Configure Your MCP Client

#### For Claude Desktop

Edit your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "llm-conclave": {
      "command": "node",
      "args": [
        "/absolute/path/to/llm_conclave/dist/src/mcp/server.js"
      ],
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

**Important:** Replace `/absolute/path/to/llm_conclave` with your actual path!

#### For Cursor / VS Code

Add to your `.cursor/config.json` or VS Code settings:

```json
{
  "mcp": {
    "servers": {
      "llm-conclave": {
        "command": "node",
        "args": ["/absolute/path/to/llm_conclave/dist/src/mcp/server.js"],
        "env": {
          "OPENAI_API_KEY": "...",
          "ANTHROPIC_API_KEY": "...",
          "GOOGLE_API_KEY": "..."
        }
      }
    }
  }
}
```

### 3. Restart Your AI Assistant

Restart Claude Desktop, Cursor, or VS Code to load the MCP server.

### 4. Use the Tools

Ask your AI assistant to use the tools:

```
"Use llm_conclave_consult to get expert consensus on whether
I should use OAuth or JWT for my authentication system"
```

The AI assistant will invoke the tool, wait for the multi-model consultation to complete, and integrate the results into its response to you.

---

## Available Tools

### 1. `llm_conclave_consult`

**Fast 4-round multi-model consultation**

Get consensus from 3 expert agents:
- **Security Expert** (Claude Sonnet 4.5)
- **Architect** (GPT-4o)
- **Pragmatist** (Gemini 2.5 Pro)

**Parameters:**
- `question` (required): The question or decision to consult on
- `context` (optional): File paths (comma-separated) or project directory
- `quick` (optional): Use single-round mode (faster, less thorough)
- `format` (optional): `markdown` (default), `json`, or `both`

**Example prompt for your AI assistant:**
```
"Use llm_conclave_consult to analyze the security implications
of storing JWT tokens in localStorage vs httpOnly cookies"
```

**When to use:**
- Technical decisions requiring diverse expert perspectives
- Architecture choices
- Security analysis
- Performance vs maintainability trade-offs
- Any decision where you want multiple AI models to debate

---

### 2. `llm_conclave_discuss`

**Democratic consensus discussion**

Run a collaborative discussion where agents contribute equally.

**Parameters:**
- `task` (required): The topic or problem to discuss
- `project` (optional): Project context path
- `personas` (optional): Comma-separated personas to use:
  - `security` - Security Expert
  - `performance` - Performance Engineer
  - `architect` - Systems Architect
  - `creative` - Creative Innovator
  - `critical` - Critical Analyst
  - `pragmatic` - Pragmatic Engineer
  - `qa` - QA Expert
  - `devops` - DevOps Engineer
  - `accessibility` - Accessibility Expert
  - `documentation` - Documentation Specialist
- `rounds` (optional): Number of rounds (default: 3)

**Example prompt:**
```
"Use llm_conclave_discuss with security and performance personas
to brainstorm approaches for caching user sessions"
```

**When to use:**
- Brainstorming multiple approaches
- Exploring design space
- Getting diverse perspectives
- Collaborative problem-solving

---

### 3. `llm_conclave_iterate`

**Iterative collaborative mode** (Coming soon)

Work through tasks chunk-by-chunk with multi-turn discussions per chunk.

**Parameters:**
- `task` (required): The task to work on
- `project` (optional): Project context path
- `chunkSize` (optional): Units per chunk (default: 3)
- `maxRounds` (optional): Rounds per chunk (default: 5)

**When to use:**
- Line-by-line code review
- Documentation improvement
- OCR correction
- Incremental refactoring

---

### 4. `llm_conclave_stats`

**Usage analytics** (Coming soon)

Get statistics on consultations, costs, and performance.

**Parameters:**
- `range` (optional): `week`, `month`, or `all` (default)
- `format` (optional): `text` or `json`

**Example prompt:**
```
"Use llm_conclave_stats to show me my consultation usage this month"
```

**When to use:**
- Tracking consultation budget
- Measuring value from consultations
- Performance monitoring

---

### 5. `llm_conclave_list_sessions`

**List past consultations**

Browse recent consultation sessions with results and costs.

**Parameters:**
- `limit` (optional): Max sessions to return (default: 10)
- `mode` (optional): Filter by `consult`, `discuss`, `iterate`, or `all`

**Example prompt:**
```
"Use llm_conclave_list_sessions to show my recent consultations"
```

**When to use:**
- Reviewing past decisions
- Finding previous consultation results
- Tracking costs over time

---

## Example Usage Scenarios

### Scenario 1: Architecture Decision

**You ask Claude Desktop:**
> "I'm building a SaaS app and need to decide on my authentication architecture. Should I use OAuth 2.0, JWT tokens, or session-based auth?"

**Claude Desktop (using MCP):**
> "Let me consult with multiple AI experts on this decision."
>
> *[Invokes `llm_conclave_consult` with your question]*
>
> *[Waits for 4-round debate between Security Expert, Architect, and Pragmatist]*
>
> "Based on the multi-model consultation, here's the consensus:
>
> **Recommendation:** OAuth 2.0 with JWT access tokens
> **Confidence:** 85%
>
> **Key Points:**
> - Security Expert emphasizes that OAuth 2.0 provides better security boundaries
> - Architect notes the scalability benefits of stateless JWT tokens
> - Pragmatist highlights the ecosystem maturity and library support
>
> **Dissent:** The Pragmatist raised concerns about token refresh complexity for your MVP timeline.
>
> **Cost:** $0.42 | **Duration:** 14s
>
> Here's my analysis of how to implement this..."

---

### Scenario 2: Code Review

**You ask Cursor:**
> "Review this authentication module for security issues"

**Cursor (using MCP):**
> "Let me get expert security analysis on this code."
>
> *[Invokes `llm_conclave_discuss` with security and qa personas]*
>
> "The security experts identified 3 critical issues:
> 1. SQL injection vulnerability in login query
> 2. Passwords stored with weak hashing (MD5)
> 3. No rate limiting on failed login attempts
>
> I'll fix these now..."

---

### Scenario 3: Tracking Usage

**You ask Claude Desktop:**
> "How much have I spent on consultations this month?"

**Claude Desktop (using MCP):**
> *[Invokes `llm_conclave_stats` with range='month']*
>
> "You've run 47 consultations this month:
> - Total cost: $18.42 (within your $20 budget)
> - Average per consultation: $0.39
> - Median response time: 12.3s
> - High confidence rate: 89%
>
> You're on track with your usage!"

---

## How It Works

```
┌─────────────────────┐
│   Your AI Assistant │  (Claude Desktop, Cursor, etc.)
│  (Claude, GPT, etc.)│
└──────────┬──────────┘
           │ MCP Protocol
           │ "Invoke llm_conclave_consult"
           ↓
┌─────────────────────┐
│  LLM Conclave MCP   │  (This server)
│       Server        │
└──────────┬──────────┘
           │
           │ Orchestrates multi-model consultation
           ↓
    ┌──────┴──────┬──────────────┐
    ↓             ↓              ↓
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Claude  │  │ GPT-4o  │  │ Gemini  │
│ Sonnet  │  │         │  │ 2.5 Pro │
└─────────┘  └─────────┘  └─────────┘

    Security      Architect    Pragmatist
    Expert

    [4-Round Debate: Independent → Synthesis → Cross-Exam → Verdict]

           ↓
    ┌─────────────┐
    │   Result    │
    │ (Markdown)  │
    └──────┬──────┘
           │
           ↓
┌─────────────────────┐
│   Your AI Assistant │
│   Integrates result │
│   into its response │
└─────────────────────┘
```

---

## Troubleshooting

### "MCP server not found"

**Check:**
1. Built the server: `npm run build`
2. Path in config is absolute: `/Users/you/llm_conclave/dist/src/mcp/server.js`
3. Restarted Claude Desktop / Cursor after config changes

### "API key errors"

**Check:**
1. API keys in MCP config `env` section
2. Keys have correct format:
   - OpenAI: `sk-...`
   - Anthropic: `sk-ant-...`
   - Google: `AIza...`
   - xAI: `xai-...`
3. Keys are valid (not expired)

### "Consultation taking too long"

**Options:**
1. Use `quick: true` for single-round consultations (5-10s instead of 15-20s)
2. Use `llm_conclave_discuss` with fewer rounds
3. Check your internet connection

### "Error: Cannot find module"

**Fix:**
```bash
cd /path/to/llm_conclave
npm install
npm run build
```

---

## Development

### Running in Development Mode

```bash
npm run mcp-dev
```

This uses `ts-node` to run the TypeScript directly without building.

### Testing the MCP Server

You can test the MCP server directly:

```bash
npm run mcp-server
```

Then send JSON-RPC requests via stdin:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

### Debugging

Set `NODE_OPTIONS` for more verbose logging:

```bash
NODE_OPTIONS="--inspect" npm run mcp-server
```

---

## Advanced Configuration

### Using with Multiple Projects

Create project-specific config files:

```json
{
  "mcpServers": {
    "llm-conclave-project-a": {
      "command": "node",
      "args": ["/path/to/llm_conclave/dist/src/mcp/server.js"],
      "env": {
        "OPENAI_API_KEY": "...",
        "DEFAULT_PROJECT_PATH": "/path/to/project-a"
      }
    },
    "llm-conclave-project-b": {
      "command": "node",
      "args": ["/path/to/llm_conclave/dist/src/mcp/server.js"],
      "env": {
        "OPENAI_API_KEY": "...",
        "DEFAULT_PROJECT_PATH": "/path/to/project-b"
      }
    }
  }
}
```

### Custom Agent Configuration

Set environment variables to customize agents:

```json
{
  "env": {
    "OPENAI_API_KEY": "...",
    "ANTHROPIC_API_KEY": "...",
    "GOOGLE_API_KEY": "...",
    "CONSULT_MAX_ROUNDS": "2",
    "CONSULT_QUICK_MODE": "true"
  }
}
```

---

## Cost Considerations

Each consultation uses multiple LLM providers:

**Typical consultation cost:**
- Quick mode (1 round): $0.10 - $0.20
- Full mode (4 rounds): $0.30 - $0.60

**Cost factors:**
- Number of rounds
- Context size (larger projects = higher cost)
- Provider pricing (Claude > GPT-4o > Gemini)

**Budget management:**
- Use `quick: true` for faster, cheaper consultations
- Limit context to relevant files only
- Use `llm_conclave_stats` to track spending

---

## What's Next?

**Coming Soon:**
- Epic 2: Cost controls with pre-flight estimates and user consent
- Epic 3: Analytics dashboard with usage tracking
- Epic 4: Advanced modes (explore vs converge)
- Epic 5: Stdin support and flexible I/O

**See:** `docs/PLANNED_FEATURES.md` for full roadmap

---

## Support

**Issues:** https://github.com/yourorg/llm_conclave/issues
**Docs:** https://github.com/yourorg/llm_conclave/tree/main/docs

---

## License

ISC
