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

Run a collaborative discussion where agents contribute equally and build on each other's ideas.

**Parameters:**
- `task` (required): The topic or problem to discuss
- `project` (optional): Project context path (file or directory)
- `config` (optional): Path to custom `.llm-conclave.json` OR inline JSON agent definitions
- `personas` (optional): Comma-separated personas (see below)
- `rounds` (optional): Maximum number of rounds (default: 4)
- `min_rounds` (optional): Minimum rounds before early consensus can end discussion (default: 0)
- `dynamic` (optional): Enable LLM-based speaker selection instead of round-robin (default: false)
- `selector_model` (optional): Model for speaker selection when dynamic=true (default: gpt-4o-mini)

**Built-in Personas:**
- `security` - Security Expert (Claude) - OWASP, auth, encryption
- `performance` - Performance Engineer (GPT-4o) - optimization, scaling
- `architect` - Systems Architect (Claude Opus) - design patterns, trade-offs
- `creative` - Creative Innovator (Gemini) - novel approaches
- `skeptic` - Critical Analyst (GPT-4o) - devil's advocate, risks
- `pragmatic` - Pragmatic Engineer (GPT-4o) - shipping focus, MVP
- `qa` - QA Expert (GPT-4o) - testing strategies
- `devops` - DevOps Engineer (Gemini) - CI/CD, infrastructure
- `accessibility` - Accessibility Expert (Claude) - WCAG, a11y
- `documentation` - Documentation Specialist (GPT-4o) - API docs

**Persona Aliases** (for convenience):
- `arch`, `architecture` → architect
- `sec` → security
- `perf` → performance
- `dev`, `ops` → devops
- `a11y` → accessibility
- `docs` → documentation
- `devil`, `devils-advocate` → skeptic
- `practical`, `engineer` → pragmatic
- `tester`, `testing`, `quality` → qa

**Example prompts:**
```
"Use llm_conclave_discuss with security and performance personas
to brainstorm approaches for caching user sessions"

"Use llm_conclave_discuss with architect,pragmatic,skeptic to
evaluate microservices vs monolith for our MVP"

"Use llm_conclave_discuss with dynamic speaker selection
to let agents naturally hand off to each other"
```

**Dynamic Speaker Selection:**

Enable `dynamic: true` to let an LLM moderator choose who speaks next based on conversation context:

```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Design authentication architecture",
    "personas": "security,architect,pragmatic",
    "dynamic": true,
    "selector_model": "gpt-4o-mini"
  }
}
```

Benefits:
- Natural conversation flow with explicit handoffs (`@Security, what about XSS?`)
- Prevents ping-pong loops (A→B→A blocked)
- Circuit breaker falls back to round-robin after failures

**Inline JSON Config:**

Define custom agents directly in the `config` parameter without creating a file:

```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Analyze document",
    "config": "{\"agents\":{\"Expert\":{\"model\":\"claude-sonnet-4-5\",\"prompt\":\"You are a domain expert...\"}}}"
  }
}
```

**When to use:**
- Brainstorming multiple approaches
- Exploring design space
- Getting diverse perspectives
- Collaborative problem-solving
- Complex debates requiring dynamic speaker selection

---

## Structured Output

Discussions automatically return structured fields for easier integration:

**Output Fields:**
- `key_decisions`: Major decisions made during discussion
- `action_items`: Specific next steps to take
- `dissent`: Remaining disagreement or minority opinions
- `confidence`: Confidence level (HIGH/MEDIUM/LOW)

**Example MCP Response:**
```
## Summary
After thorough analysis, the team recommends OAuth 2.0...

## Key Decisions
- Use OAuth 2.0 with JWT access tokens
- Implement refresh token rotation
- Store tokens in httpOnly cookies

## Action Items
- [ ] Set up OAuth provider configuration
- [ ] Implement token refresh endpoint

## Dissenting Views
- Pragmatist raised concerns about MVP timeline complexity

Confidence: HIGH
```

**Devil's Advocate Mode:**
The judge automatically detects shallow agreement ("I agree", "I concur") and pushes agents to provide genuine analysis with trade-offs and edge cases.

---

## Custom Personas (Domain-Specific Experts)

The built-in personas are software engineering focused. For other domains (health, legal, finance, education, etc.), you can define custom personas.

### Setting Up Custom Personas

Create `~/.llm-conclave/config.json`:

```json
{
  "custom_personas": {
    "healthCoach": {
      "name": "Health Coach",
      "description": "Behavior change and habit formation expert",
      "model": "claude-sonnet-4-5",
      "systemPrompt": "You are a certified health coach specializing in behavior change, sustainable habit formation, and holistic wellness. You focus on practical, science-backed approaches to health improvement."
    },
    "psychologist": {
      "name": "Clinical Psychologist",
      "description": "Mental health and cognitive behavioral therapy specialist",
      "model": "gpt-4o",
      "systemPrompt": "You are a clinical psychologist with expertise in cognitive behavioral therapy, mental health assessment, and evidence-based therapeutic approaches. You consider psychological factors in all recommendations."
    },
    "nutritionist": {
      "name": "Registered Dietitian",
      "model": "gpt-4o",
      "systemPrompt": "You are a registered dietitian with expertise in clinical nutrition, meal planning, and evidence-based dietary interventions. You provide practical, sustainable nutrition guidance."
    }
  },
  "persona_sets": {
    "health": ["healthCoach", "psychologist", "nutritionist"],
    "startup": ["architect", "pragmatic", "creative"],
    "security-review": ["security", "architect", "skeptic"]
  }
}
```

### Using Custom Personas

**Individual custom personas:**
```
"Use llm_conclave_discuss with healthCoach,psychologist personas
to design a mental wellness tracking app"
```

**Persona sets (@ prefix expands the set):**
```
"Use llm_conclave_discuss with @health personas to create
a personalized fitness plan"
```

**Mix custom + built-in:**
```
"Use llm_conclave_discuss with @health,security personas
to review data privacy for a health app"
```

### Using Project-Level Config

For project-specific agents, create `.llm-conclave.json` in your project directory and pass it via the `config` parameter:

```json
{
  "agents": {
    "Domain Expert": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are an expert in [specific domain]..."
    },
    "Validator": {
      "model": "gpt-4o",
      "prompt": "You validate solutions against [specific criteria]..."
    }
  }
}
```

Then invoke with:
```
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Your task here",
    "config": "/path/to/project/.llm-conclave.json"
  }
}
```

### Supported Models

When defining custom personas, you can use any model:

| Model | Provider | Best For |
|-------|----------|----------|
| `claude-sonnet-4-5` | Anthropic | Nuanced analysis, safety-critical |
| `claude-opus-4-5` | Anthropic | Complex reasoning, architecture |
| `gpt-4o` | OpenAI | Fast, balanced, cost-effective |
| `gemini-2.5-pro` | Google | Creative, brainstorming |
| `grok-2` | xAI | Alternative perspectives |
| `mistral-large` | Mistral | European data considerations |

Provider is auto-inferred from model name, or specify explicitly with `"provider": "anthropic"`

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

**Get your API keys:**
- OpenAI: https://platform.openai.com/settings/organization/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- Google (Gemini): https://aistudio.google.com/apikey
- xAI (Grok): https://console.x.ai/team/default/api-keys
- Mistral: https://console.mistral.ai/api-keys

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

**Recently Implemented:**
- ✅ Dynamic speaker selection (`dynamic: true`) - LLM chooses who speaks next
- ✅ Session continuation (`llm_conclave_continue`, `llm_conclave_sessions`)
- ✅ Structured output (key_decisions, action_items, dissent, confidence)
- ✅ Persona aliases (17 convenient shortcuts)
- ✅ Inline JSON config support
- ✅ Devil's advocate mode (detects shallow agreement)

**Already Implemented (via CLI):**
- Cost controls with pre-flight estimates and user consent
- Analytics dashboard with usage tracking (`llm-conclave consult-stats`)
- Advanced modes (explore vs converge)
- Stdin piping and flexible I/O

**Coming Soon to MCP:**
- `llm_conclave_iterate` - Chunk-based iterative collaboration
- `llm_conclave_stats` - Usage analytics via MCP

**See:** `docs/PLANNED_FEATURES.md` for full roadmap

---

## Support

**Issues:** https://github.com/yourorg/llm_conclave/issues
**Docs:** https://github.com/yourorg/llm_conclave/tree/main/docs

---

## License

ISC
