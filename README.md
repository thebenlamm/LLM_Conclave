# LLM Conclave

A command-line tool that enables multiple LLMs (OpenAI GPT, Anthropic Claude, xAI Grok, Google Gemini, and Mistral AI) to collaboratively solve tasks through multi-turn conversation.

## Features

- **Multi-Agent Collaboration**: Configure multiple LLM agents with different models and personas
- **5 LLM Providers**: OpenAI GPT, Anthropic Claude, xAI Grok, Google Gemini, and Mistral AI
- **Four Operational Modes**:
  - **Consult Mode**: Fast 4-round structured debate for quick decisions with cost controls
  - **Consensus Mode**: Democratic discussion with judge-coordinated consensus
  - **Orchestrated Mode**: Structured workflow with primary/secondary agents and validation
  - **Iterative Collaborative Mode**: Multi-turn chunk-based discussions where agents respond to each other
- **Tool Support**: Agents can read/write files, run commands, and perform real file operations
- **Project Context Analysis**: Point the conclave at any codebase or document directory for analysis
- **Cost & Performance Tracking**: Automatic tracking of token usage, API costs, and latency for all providers
- **Context Tax Optimization**: Prompt caching (Anthropic, OpenAI, Gemini), instruction-based tool pruning, context editing, and cache-aware cost tracking
- **High Performance**: Optimized with async I/O, intelligent caching, and parallel processing (5.3x faster than baseline)
- **Streaming Output**: Real-time streaming of agent responses as they're generated
- **Smart Agent Generation**: AI creates optimized, concise agents (1-4 based on task complexity) with format-enforced prompts
- **Guided Runbooks & Template Library**: Use predefined templates for common tasks like code review, architecture design, and bug investigation, pre-configuring agents and modes for low-friction setup.
- **Session Persistence & Continuation**: Automatically saves all conversations with ability to ask follow-up questions and continue discussions
- **Flexible Configuration**: Use the same model multiple times with different system prompts
- **Web UI Dashboard**: Real-time browser-based dashboard to manage sessions, view live token streams, and monitor agent activity.
- **MCP Server**: Expose consultation capabilities as tools for ANY AI assistant (Claude Desktop, Cursor, VS Code, etc.) via Model Context Protocol
- **Autonomous Operation**: Runs fully autonomously after task submission
- **Comprehensive Output**: Saves full transcript, consensus, cost logs, and JSON data

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your API keys:
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```
4. (Optional) Link globally to use `llm-conclave` command:
   ```bash
   npm link
   ```

## Quick Start

**Zero-config mode** - works immediately without setup:

```bash
# Just run it! No configuration needed.
llm-conclave "Review my authentication code"

# Uses smart defaults:
# - Auto-detects best mode (consensus/orchestrated/iterative)
# - 3 expert agents (Claude Sonnet 4.5, GPT-4o, Gemini Pro)
# - Judge: GPT-4o
```

**Or use expert personas:**

```bash
# Specify which experts you want
llm-conclave --with security,performance "Review this API"

# Available personas:
# security, performance, architecture, creative, skeptic,
# pragmatic, testing, devops, accessibility, documentation
```

**Or launch the Web UI:**

```bash
llm-conclave server
```

**Optional: Initialize custom config:**

```bash
llm-conclave init
# Creates .llm-conclave.json with AI-generated agents
```

## Usage

### Command Structure

LLM Conclave uses **Git-style subcommands** for better organization:

```bash
llm-conclave <subcommand> [options] "task"
```

### Core Commands

#### Smart Mode (Auto-detection)
```bash
# Analyzes your task and picks the best mode automatically
llm-conclave "Your task here"
llm-conclave -p ./src "Review this codebase"
```

#### Explicit Modes

```bash
# Fast multi-model consultation
llm-conclave consult "What's the best approach for rate limiting?"

# Democratic discussion (consensus mode)
llm-conclave discuss "Design a payment system"

# Dynamic speaker selection (LLM chooses who speaks next)
llm-conclave discuss --dynamic "Complex architecture debate"

# Structured review (orchestrated mode)
llm-conclave review -p ./src/auth "Audit security"

# Chunk-based iteration (iterative mode)
llm-conclave iterate --deep "Fix bugs line by line"
```

#### Consult Mode (Fast Decision-Making)

Get quick, structured multi-model consultations with cost controls:

```bash
# Basic consultation
llm-conclave consult "Should we use Redis or Memcached for caching?"

# Quick mode (single round, faster)
llm-conclave consult --quick "What's the time complexity of this algorithm?"

# With file context
llm-conclave consult -c src/auth.ts,src/db.ts "Review security of these files"

# With project context
llm-conclave consult -p ./src "What's the best way to refactor this?"

# Explore mode (divergent brainstorming)
llm-conclave consult --mode explore "Creative solutions for user onboarding"

# Pipe content via stdin
cat requirements.md | llm-conclave consult "Estimate implementation complexity"

# Non-interactive (auto-approve costs)
llm-conclave consult --yes "Quick question for CI/CD pipeline"

# Enable Gemini explicit caching for large project contexts
llm-conclave consult --gemini-cache -p ./large-project "Review architecture"
```

**Features:**
- **4-Round Structured Debate**: Independent analysis → Synthesis → Cross-examination → Verdict
- **Fixed Expert Panel**: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini)
- **Cost Controls**: Pre-flight estimates, user consent, auto-approval threshold
- **Early Termination**: Skip rounds when confidence is high (saves money)
- **Brownfield Detection**: Auto-detects existing projects and biases toward consistency
- **Sensitive Data Scrubbing**: API keys and passwords automatically masked
- **Gemini Caching**: `--gemini-cache` flag for explicit context caching on large projects (50K+ tokens)

**Analytics Dashboard:**
```bash
llm-conclave consult-stats              # View usage metrics
llm-conclave consult-stats --week       # Last 7 days
llm-conclave consult-stats --format json # JSON output
```

#### Templates

```bash
# Use predefined workflows
llm-conclave templates              # List available
llm-conclave template code-review "Review API"
```

#### Personas

```bash
# Use expert roles
llm-conclave personas               # List available
llm-conclave --with security,performance "Review code"
```

**Built-in personas:** security, performance, architecture, creative, skeptic, pragmatic, testing, devops, accessibility, documentation

**Persona aliases** (for convenience):
- `arch` → architecture
- `sec` → security
- `perf` → performance
- `dev`, `ops` → devops
- `a11y` → accessibility
- `docs` → documentation
- `devil`, `devils-advocate` → skeptic
- `practical`, `engineer` → pragmatic
- `tester`, `testing`, `quality` → qa

#### Custom Personas

Define your own expert personas in `~/.llm-conclave/config.json`:

```json
{
  "custom_personas": {
    "healthCoach": {
      "name": "Health Coach",
      "description": "Behavior change and habit formation expert",
      "model": "claude-sonnet-4-5",
      "systemPrompt": "You are a certified health coach specializing in behavior change, habit formation, and sustainable lifestyle modifications..."
    },
    "psychologist": {
      "name": "Clinical Psychologist",
      "model": "gpt-4o",
      "systemPrompt": "You are a clinical psychologist with expertise in cognitive behavioral therapy..."
    }
  },
  "persona_sets": {
    "health": ["healthCoach", "psychologist", "nutritionist"],
    "startup": ["architect", "pragmatic", "creative"]
  }
}
```

**Usage:**

```bash
# Use custom persona
llm-conclave --with healthCoach,psychologist "Design a wellness app"

# Use persona set (@ prefix)
llm-conclave --with @health "Plan a fitness program"

# Mix custom + built-in
llm-conclave --with @health,security "Review health data API"
```

**Via MCP:**

```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Design a meditation app",
    "personas": "healthCoach,psychologist",
    "config": "/path/to/project/.llm-conclave.json"
  }
}
```

#### Session Management

```bash
llm-conclave sessions               # List all sessions
llm-conclave continue "Follow-up question"
llm-conclave continue <id> "Another question"
```

#### Configuration

```bash
llm-conclave init                   # Interactive setup
llm-conclave config show            # View current config
llm-conclave config set judge.model gpt-4o
```

#### Web UI

```bash
llm-conclave server                 # Start on port 3000
llm-conclave server -p 8080         # Custom port
```

### Common Options

```bash
-p, --project <path>        # Project context (file or directory)
-c, --config <path>         # Custom config file
--with <personas>           # Comma-separated expert personas
--quick                     # Quick mode (fewer rounds)
--deep                      # Deep mode (more thorough)
--thorough                  # Maximum thoroughness
--stream / --no-stream      # Enable/disable streaming
--dynamic                   # Dynamic speaker selection (discuss mode)
--gemini-cache              # Enable Gemini explicit caching (consult mode)
-h, --help                  # Show help
```

### Dynamic Speaker Selection

Enable LLM-based speaker selection instead of round-robin with the `--dynamic` flag:

```bash
llm-conclave discuss --dynamic "Design a complex microservices architecture"
```

**How it works:**
- An LLM moderator analyzes the conversation and decides who should speak next
- Detects explicit handoffs: `@Architect, what do you think?` or `"I'd like to hear from Security Expert"`
- Prevents ping-pong loops (A→B→A blocked)
- Falls back to round-robin after 3 consecutive selection failures (circuit breaker)

**Configuration:**
```bash
# Custom selector model (default: gpt-4o-mini)
llm-conclave discuss --dynamic --selector-model claude-haiku "Task"
```

**Via MCP:**
```json
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Design authentication system",
    "personas": "security,architect,pragmatic",
    "dynamic": true,
    "selector_model": "gpt-4o-mini"
  }
}
```

### Operational Modes

**Consult Mode (`consult`):**
- Fast 4-round structured debate for quick decision-making
- Fixed expert panel: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini)
- Rounds: Independent Analysis → Synthesis → Cross-Examination → Verdict
- Pre-flight cost estimation with user consent
- Early termination when confidence is high (saves money)
- Best for: Architecture decisions, technology choices, quick expert opinions

Example:
```bash
llm-conclave consult "Should we use GraphQL or REST for our API?"
llm-conclave consult --mode explore "Ideas for improving user engagement"
```

**Consensus Mode (default):**
- Democratic discussion where all agents contribute equally
- Judge coordinates and evaluates consensus after each round
- Best for open-ended problems requiring diverse perspectives
- **Dynamic Speaker Selection** (optional): Use `--dynamic` to let an LLM choose who speaks next based on conversation context, instead of round-robin. Detects natural handoffs like "@Architect, what do you think?"

**Orchestrated Mode (`review`):**
- Structured workflow with designated primary agent
- Secondary agents provide critiques
- Optional validation gates for quality assurance
- Best for tasks requiring domain expertise and validation
- **Agents have full tool access**: Can read/write files, run commands, edit code

Example:
```bash
llm-conclave review "Correct all 10 lines of document.txt one at a time"
```

**Iterative Collaborative Mode (`iterate`):**
- Work is divided into configurable chunks (e.g., 3 lines at a time)
- Each chunk has multiple rounds of discussion
- **Agents can respond to each other** within each chunk (not one-and-done)
- Each agent maintains their own state/notes file
- Only judge/coordinator writes to shared output file
- Shared state builds cumulatively across chunks
- Best for incremental, collaborative tasks requiring back-and-forth discussion

**Output Behavior:**
- Iterative mode uses a **persistent working directory**: `./outputs/iterative/`
- Files are **overwritten on each run** (unlike consensus/orchestrated modes which create timestamped directories)
- This allows iterative sessions to build on previous work in the same location
- Output files:
  - `shared_output.md` - Collaborative output document
  - `{AgentName}_notes.md` - Per-agent working notes (one file per agent)

Example:
```bash
llm-conclave iterate -p document.txt "Correct all OCR errors line by line"
llm-conclave iterate --chunk-size 5 "Review and improve documentation"
```

### Examples

```bash
# Create initial config with AI-generated agents
llm-conclave init

# List available templates/runbooks
llm-conclave templates

# Run a code review using a predefined template
llm-conclave template code-review -p ./src "Review the 'auth' module for security issues"

# Run an architecture design session using a template
llm-conclave template architecture-design "Design a new payment gateway"

# Run with inline task (consensus mode)
llm-conclave "Create a task management application with real-time collaboration"

# Run with task from file
llm-conclave ./tasks/project-brief.txt

# Use custom config
llm-conclave -c ./configs/creative-team.json "Write a short story about AI"

# Analyze a project directory
llm-conclave -p ./my-app "Review this code for potential bugs and security issues"

# Review mode: Agents can perform actual file operations
llm-conclave review "Correct lines 1-2 of document.txt"

# Review mode: Iterative file processing
llm-conclave review "Correct all 10 lines of document.txt one at a time"

# Review mode: Code refactoring
llm-conclave review -p ./src "Refactor the authentication module"

# Review documentation directory
llm-conclave -p ./docs "Review my technical writing for clarity and completeness"

# Investigate a bug
llm-conclave -p ./src "Find why the login feature isn't working on mobile"

# Iterative collaborative mode: OCR correction with multi-turn discussion
llm-conclave iterate -p document.txt "Correct all OCR errors with collaborative discussion"

# Iterative mode: Custom chunk size for larger sections
llm-conclave iterate --chunk-size 5 -p ./docs "Review and improve each section"

# Iterative mode: More rounds of discussion per chunk
llm-conclave iterate --deep "Iteratively refine the code"

# Enable streaming for real-time agent responses
llm-conclave --stream "Design a microservices architecture"

# Streaming with project context
llm-conclave --stream -p ./src "Review and explain this codebase"
```

## Session Management & Continuation

LLM Conclave automatically saves all conversations, allowing you to continue discussions with follow-up questions or resume interrupted sessions.

### Features

- **Automatic Saving**: Every conversation is automatically saved to `~/.llm-conclave/sessions/`
- **Session History**: List and browse all previous conversations
- **Continuation**: Ask follow-up questions to any previous conversation
- **Linked Sessions**: Continuations are linked to their parent sessions
- **Full Context**: Agents see the complete conversation history when continuing
- **Reset Option**: Start fresh with just a summary (for token limit management)

### CLI Usage

```bash
# List all saved sessions
llm-conclave sessions

# List with filters
llm-conclave sessions --mode consensus --limit 5

# Continue the most recent session
llm-conclave continue "Can you elaborate on the scalability concerns?"

# Resume a specific session by ID
llm-conclave continue session_2025-12-06T20-42-25_a3f2 "What about using a database?"

# Reset history (keep only summary, for long conversations)
llm-conclave continue --reset "Start fresh but remember what we discussed"
```

### MCP Usage

When using LLM Conclave via MCP (e.g., from Claude Desktop), you can continue discussions programmatically:

```json
// List available sessions
{
  "tool": "llm_conclave_sessions",
  "arguments": { "limit": 5 }
}

// Continue most recent session
{
  "tool": "llm_conclave_continue",
  "arguments": {
    "task": "What about the edge cases we discussed?"
  }
}

// Continue a specific session
{
  "tool": "llm_conclave_continue",
  "arguments": {
    "session_id": "session_2025-01-17T20-42-25_a3f2",
    "task": "Can you elaborate on the security concerns?"
  }
}

// Reset and start fresh (keeps summary only)
{
  "tool": "llm_conclave_continue",
  "arguments": {
    "task": "Let's revisit the architecture",
    "reset": true
  }
}
```

### Example Workflow

```bash
# 1. Run initial conversation
$ llm-conclave discuss "Evaluate my AI brain storage idea"
# ... conversation happens ...
🔄 Session ID: session_2025-12-06T20-42-25_a3f2 (use llm_conclave_continue to follow up)

# 2. Later, ask a follow-up question
$ llm-conclave continue "Can you elaborate on the indexing strategies?"
📜 Previous Session:
   ID: session_2025-12-06T20-42-25_a3f2
   Task: Evaluate my AI brain storage idea
   Agents: Primary, Validator, Reviewer

🔄 Continuing with: "Can you elaborate on the indexing strategies?"
# ... agents see full context and continue the discussion ...
📦 New session saved: session_2025-12-06T21-15-30_b7e9

# 3. View session history
$ llm-conclave sessions
Recent Sessions (showing 2):

1. session_2025-12-06T21-15-30_b7e9 (continuation)
   Mode: consensus | Dec 6, 9:15 PM
   Task: Can you elaborate on the indexing strategies?
   Rounds: 2 | Cost: $0.0156

2. session_2025-12-06T20-42-25_a3f2
   Mode: consensus | Dec 6, 8:42 PM
   Task: Evaluate my AI brain storage idea
   Rounds: 3 | Cost: $0.0234
```

### What Gets Saved

Each session includes:
- Full conversation history with all agent responses
- Agent configurations (models, system prompts)
- Judge configuration
- Task description and final solution
- Cost and performance metrics
- Links to parent sessions (for continuations)
- Output file paths

### Structured Output

Discussions return structured fields for easier integration:

- **`key_decisions`**: Major decisions made during the discussion
- **`action_items`**: Specific next steps to take
- **`dissent`**: Any remaining disagreement or minority opinions
- **`confidence`**: Confidence level (HIGH/MEDIUM/LOW) in the consensus

**Example output:**
```
## Summary
[Consensus summary here]

## Key Decisions
- Use OAuth 2.0 with JWT access tokens
- Implement refresh token rotation
- Store tokens in httpOnly cookies

## Action Items
- [ ] Set up OAuth provider configuration
- [ ] Implement token refresh endpoint
- [ ] Add CSRF protection

## Dissenting Views
- Pragmatist: Consider session-based auth for simpler MVP

Confidence: HIGH
```

### Session Storage

Sessions are stored in `~/.llm-conclave/sessions/` with this structure:

```
~/.llm-conclave/sessions/
├── manifest.json                              # Index of all sessions
└── session_2025-12-06T20-42-25_a3f2/
    └── session.json                           # Full session data
```

Sessions persist across projects and directories, making it easy to continue conversations from anywhere.

### How Continuation Works

When you continue a session:

1. **Load Previous Session**: The original session is loaded with full conversation history
2. **Merge Context**: A continuation prompt is generated that includes:
   - The original task
   - The previous conclusion/solution
   - Your new follow-up question
3. **Recreate Agents**: The same agents from the original session are recreated
4. **Run Discussion**: Agents discuss with full context of what was said before
5. **Save New Session**: A new session is created, linked to the parent session

This allows you to have extended, multi-session conversations while maintaining full context.

## MCP Server (Model Context Protocol)

Expose llm_conclave's multi-agent consultation capabilities as tools for ANY AI assistant!

Instead of running CLI commands yourself, let your AI assistant invoke consultations as part of solving your problems.

### Quick Setup

1. **Build the MCP server:**
   ```bash
   npm run build
   ```

2. **Configure Claude Desktop** (or any MCP-compatible client):

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

3. **Restart Claude Desktop**

4. **Use the tools:**
   ```
   "Use llm_conclave_consult to get expert consensus on whether
   I should use OAuth or JWT for authentication"
   ```

### Available Tools

#### Consultation Tools

- **`llm_conclave_consult`** - Fast 4-round multi-model consultation
  - Fixed expert panel: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini)
  - Parameters: `question` (required), `context`, `quick`, `format`

- **`llm_conclave_discuss`** - Democratic consensus discussion with custom personas
  - Parameters: `task` (required), `personas`, `config`, `rounds`, `min_rounds`, `project`, `dynamic`, `selector_model`
  - Supports built-in personas (`security`, `architect`, etc.) or custom agents via inline JSON
  - Use `dynamic: true` for LLM-based speaker selection instead of round-robin

#### Session Management Tools

- **`llm_conclave_sessions`** - List recent sessions that can be continued
  - Parameters: `limit` (default: 10), `mode` (filter by consensus/orchestrated/iterative)
  - Returns session IDs, dates, tasks, and costs

- **`llm_conclave_continue`** - Continue a previous discussion with follow-up questions
  - Parameters: `task` (required), `session_id` (optional, defaults to most recent), `reset`
  - Agents see full conversation history from the previous session
  - Creates a new session linked to the parent

#### Example: Continue a Discussion via MCP

```json
// First, run a discussion
{
  "tool": "llm_conclave_discuss",
  "arguments": {
    "task": "Design a user authentication system",
    "personas": "security,architect,pragmatic"
  }
}
// Output includes: 🔄 Session ID: session_2025-01-17T...

// Later, continue with a follow-up
{
  "tool": "llm_conclave_continue",
  "arguments": {
    "task": "What about OAuth vs JWT for the mobile app?",
    "session_id": "session_2025-01-17T..."
  }
}
```

**Full documentation:** See [`docs/MCP_SERVER.md`](docs/MCP_SERVER.md)

**Example config:** See [`mcp-config-example.json`](mcp-config-example.json)

## Using Streaming and Cost Monitoring

### Streaming Output

Enable real-time streaming of agent responses as they're generated with the `--stream` flag:

```bash
llm-conclave --stream "Your task here"
```

**How It Works:**
- Without `--stream`: Agents complete their full response, then it's displayed all at once
- With `--stream`: Agent responses appear word-by-word in real-time as they're generated
- Works with all providers that support streaming (OpenAI, Anthropic, Gemini, Mistral)
- Provides immediate feedback during long-running conversations

**When to Use:**
- Long discussions where you want to see progress in real-time
- Interactive sessions where immediate feedback is valuable
- Debugging to see how agents are thinking through problems

### Cost & Performance Monitoring

Cost tracking is **automatic** and always enabled. After every session, you'll see:

**Console Output:**
```
================================================================================
SESSION COST & PERFORMANCE
================================================================================

Total Cost: $0.023450
Total Tokens: 4523 (Input: 2341, Output: 2182)
Total Calls: 12
Average Latency: 1847.33ms
```

**Saved to `cost_log.json`:**
```json
[
  {
    "provider": "OpenAI",
    "model": "gpt-4o",
    "inputTokens": 234,
    "outputTokens": 189,
    "latency": 1542,
    "success": true,
    "cost": 0.003885
  },
  ...
]
```

**What's Tracked:**
- **Per-call metrics**: Provider, model, token counts, latency, cost
- **Session totals**: Total cost, token usage, API call count, average latency
- **Success/failure status**: Track which calls succeeded or failed
- **All providers**: OpenAI, Anthropic, Gemini, Mistral, Grok

**Pricing Data:**
- Updated regularly with current API pricing from all providers
- Grok and experimental models show $0 (pricing not public/free preview)
- Use cost data to optimize agent configurations and model choices

## Project Context Analysis

LLM Conclave can analyze individual files or entire directories. Use the `--project` flag to point it at any file or directory:

```bash
# Single file
llm-conclave -p /path/to/file.txt "your question or task"

# Directory
llm-conclave -p /path/to/project "your question or task"
```

### How It Works

**For Single Files:**
- Reads the file content directly
- Works with any text file (transcriptions, documents, code, configs, etc.)
- No size or type restrictions beyond text readability

**For Directories:**
1. **Smart Filtering**: Automatically excludes common non-essential files:
   - Dependencies: `node_modules`, `.venv`, `venv`
   - Version control: `.git`, `.svn`, `.hg`
   - Build outputs: `dist`, `build`, `out`, `target`
   - Binary files: images, videos, executables, archives
   - Large files: files over 100KB

2. **Context Format**: Agents receive:
   - Directory structure (file tree)
   - Contents of all included files
   - Full conversation history

### Use Cases

**Single File:**
- Transcription correction: "Fix all errors in this transcription"
- Document editing: "Improve the clarity and flow of this article"
- Code review: "Review this function for bugs"
- Config validation: "Check this config file for errors"

**Directory:**
- Bug investigation: "Find the cause of this login error"
- Code review: "Review this code for security vulnerabilities"
- Architecture review: "Suggest improvements to this codebase structure"
- Documentation review: "Review my technical writing for clarity"
- Refactoring advice: "How can I improve this code?"

### Example Session

```bash
# Point conclave at your project
llm-conclave -p ./my-webapp "Review this React app for performance issues"

# The agents will:
# 1. Read all source files (excluding node_modules, etc.)
# 2. See the full directory structure
# 3. Discuss performance concerns
# 4. Reach consensus on recommendations
# 5. Output detailed findings to the outputs/ directory

# Or use review mode for actual file changes:
llm-conclave review -p ./my-webapp "Fix all ESLint errors"
# Agents can read, analyze, and directly edit files!
```

## Configuration

The configuration file (`.llm-conclave.json`) defines:
- **turn_management**: How agents take turns (currently supports "roundrobin")
- **max_rounds**: Maximum conversation rounds before forcing a final vote (default: 20)
- **judge**: AI judge configuration with model and system prompt
- **agents**: Named agents with their models and personas

### Example Configuration

```json
{
  "turn_management": "roundrobin",
  "max_rounds": 20,
  "judge": {
    "model": "gpt-4o",
    "prompt": "You are the judge and coordinator of this discussion. Evaluate whether consensus has been reached. If yes, respond with 'CONSENSUS_REACHED' followed by the solution. If not, guide the discussion toward resolution."
  },
  "agents": {
    "Architect": {
      "model": "gpt-4o",
      "prompt": "You are a senior software architect. Approach problems from a systems design perspective, considering scalability, maintainability, and best practices."
    },
    "Critic": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a critical thinker and devil's advocate. Challenge assumptions, identify potential issues, and push for robust solutions."
    },
    "Pragmatist": {
      "model": "grok-3",
      "prompt": "You are a pragmatic engineer focused on practical, implementable solutions. Balance idealism with real-world constraints."
    },
    "Creative": {
      "model": "gemini-2.5-pro",
      "prompt": "You are a creative innovator. Think outside the box and propose novel, unconventional approaches."
    },
    "Analyst": {
      "model": "mistral-large-latest",
      "prompt": "You are a data-driven analyst. Focus on metrics, evidence, and quantifiable outcomes when evaluating solutions."
    }
  }
}
```

### Supported Models

**OpenAI (requires `OPENAI_API_KEY`):**
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4o`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Anthropic (requires `ANTHROPIC_API_KEY`):**
- `claude-sonnet-4-5` (or shorthand: `sonnet`)
- `claude-opus-4-5` (or shorthand: `opus`)
- `claude-haiku-4-5` (or shorthand: `haiku`)

**xAI (requires `XAI_API_KEY`):**
- `grok-3`
- `grok-vision-3`

**Google (requires `GEMINI_API_KEY`):**
- `gemini-3-pro`
- `gemini-2.5-pro`
- `gemini-2.5-pro-exp`
- `gemini-2.5-flash`
- `gemini-2.0-flash`
- `gemini-flash` (shorthand, maps to `gemini-2.0-flash`)
- `gemini-pro` (shorthand, maps to `gemini-2.5-pro`)
- Note: Gemini 1.5 models deprecated - use Gemini 2.x or 3.x

**Mistral AI (requires `MISTRAL_API_KEY`):**
- `mistral-large-latest`
- `mistral-small-latest`
- `codestral-latest`

## How It Works

### Consensus Mode (Default)

1. **Task Submission**: User provides a task via CLI argument, file, or interactive prompt
2. **Agent Initialization**: Each configured agent is initialized with its model and system prompt
3. **Round-Robin Discussion**:
   - Agents take turns sharing perspectives (Round 1)
   - Each agent sees the full conversation history
   - Agents can build on, challenge, or refine each other's ideas
4. **Judge Evaluation**: After each round, the judge evaluates if consensus is reached
5. **Guidance or Consensus**:
   - If consensus: Judge extracts and summarizes the agreed solution
   - If not: Judge provides guidance to help agents converge
6. **Iteration**: Steps 3-5 repeat until consensus or max rounds reached
7. **Final Vote**: If max rounds reached without consensus, judge synthesizes best solution
8. **Output**:
   - Full transcript saved to `outputs/conclave-[timestamp]-transcript.md`
   - Consensus/solution saved to `outputs/conclave-[timestamp]-consensus.md`
   - Complete data saved to `outputs/conclave-[timestamp]-full.json`

### Iterative Collaborative Mode

1. **Task Submission**: User provides task and optional chunk size/max rounds parameters
2. **Chunk Planning**: Judge breaks down the task into manageable chunks (default: 3 units per chunk)
3. **For Each Chunk**:
   - **Round 1**: Each agent provides initial thoughts on the chunk
   - **Rounds 2-N**: Agents respond to each other's comments and continue discussion
   - **Agent State**: Each agent updates their own notes file after contributing
   - **Judge Evaluation**: After each round, judge evaluates if chunk is complete
   - **Completion**: When consensus reached or max rounds hit, judge writes result to shared output
4. **Cumulative State**: Shared output builds incrementally as each chunk is completed
5. **Output Files**:
   - `outputs/iterative/shared_output.md`: Judge-coordinated cumulative results
   - `outputs/iterative/[AgentName]_notes.md`: Each agent's working notes and thoughts
   - Agents can reference each other's notes files for context

**Key Difference**: Unlike other modes where agents speak once per phase, iterative mode enables true multi-turn discussion where agents can respond to each other multiple times within each chunk.

## Output Files

All outputs are saved to the `outputs/` directory with timestamps:

- **`*-transcript.md`**: Full conversation history with all agent responses
- **`*-consensus.md`**: Final solution and summary of how it was reached
- **`*-full.json`**: Complete data in JSON format for programmatic access
- **`cost_log.json`**: Detailed cost and performance metrics for the session (see [Cost & Performance Monitoring](#cost--performance-monitoring))

Additionally, sessions are automatically saved for continuation:

- **`~/.llm-conclave/sessions/`**: Persistent session storage across all projects
  - Each session includes full conversation history, agent configs, costs, and lineage
  - Use `sessions` to view and `continue` to resume conversations
  - See [Session Management & Continuation](#session-management--continuation) for details

## API Keys

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
```

You only need API keys for the providers you're using.

**Optional environment variables:**
```env
CONCLAVE_ANTHROPIC_CONTEXT_EDITING=1  # Enable beta context editing (auto-clears stale tool results)
```

**Get your API keys:**
- OpenAI: https://platform.openai.com/settings/organization/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- Google (Gemini): https://aistudio.google.com/apikey
- xAI (Grok): https://console.x.ai/team/default/api-keys
- Mistral: https://console.mistral.ai/api-keys

## Advanced Configuration

### Using Same Model with Different Personas

You can use the same model multiple times with different system prompts:

```json
{
  "agents": {
    "Optimist": {
      "model": "gpt-4o",
      "prompt": "You are an optimistic visionary who sees possibilities."
    },
    "Pessimist": {
      "model": "gpt-4o",
      "prompt": "You are a skeptical realist who identifies risks."
    },
    "Realist": {
      "model": "gpt-4o",
      "prompt": "You balance optimism and caution with practical thinking."
    }
  }
}
```

### Customizing the Judge

The judge's system prompt controls how it evaluates consensus:

```json
{
  "judge": {
    "model": "claude-sonnet-4-5",
    "prompt": "You are a neutral mediator. Look for genuine agreement, not just surface-level consensus. Push agents to address disagreements. When real consensus emerges, respond with 'CONSENSUS_REACHED' and summarize the solution."
  }
}
```

## License

ISC

## Contributing

Contributions welcome! Please open an issue or PR.

## Troubleshooting

**"Configuration file not found"**: Run `llm-conclave init` to create a config file

**API errors**: Check that your API keys are correctly set in `.env`

**"Unknown model"**: Verify your model names match supported models (see Supported Models section)

**Tool iteration limit**: If agents stop mid-task, they may have hit the 25-iteration tool limit. Break task into smaller steps.

**File encoding issues**: Ensure files are UTF-8 encoded for best results with non-English text
