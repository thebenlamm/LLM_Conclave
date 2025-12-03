# LLM Conclave

A command-line tool that enables multiple LLMs (OpenAI GPT, Anthropic Claude, xAI Grok, Google Gemini, and Mistral AI) to collaboratively solve tasks through multi-turn conversation.

## Features

- **Multi-Agent Collaboration**: Configure multiple LLM agents with different models and personas
- **5 LLM Providers**: OpenAI GPT, Anthropic Claude, xAI Grok, Google Gemini, and Mistral AI
- **Three Operational Modes**:
  - **Consensus Mode**: Democratic discussion with judge-coordinated consensus
  - **Orchestrated Mode**: Structured workflow with primary/secondary agents and validation
  - **Iterative Collaborative Mode**: Multi-turn chunk-based discussions where agents respond to each other
- **Tool Support**: Agents can read/write files, run commands, and perform real file operations
- **Project Context Analysis**: Point the conclave at any codebase or document directory for analysis
- **Cost & Performance Tracking**: Automatic tracking of token usage, API costs, and latency for all providers
- **High Performance**: Optimized with async I/O, intelligent caching, and parallel processing (5.3x faster than baseline)
- **Streaming Output**: Real-time streaming of agent responses as they're generated
- **Interactive Init**: AI-powered agent generation based on your project description
- **Flexible Configuration**: Use the same model multiple times with different system prompts
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

1. **Initialize configuration:**
   ```bash
   llm-conclave --init
   # Or without npm link: node index.js --init
   ```
   This creates `.llm-conclave.json` with AI-generated agents tailored to your project.

2. **Edit the configuration** to customize your agents (see Configuration section below)

3. **Run with a task:**
   ```bash
   llm-conclave "Design a social media application"
   # Or: node index.js "Design a social media application"
   ```

## Usage

### Basic Usage

```bash
# Provide task as argument
node index.js "Your task here"

# Read task from file
node index.js task.txt

# Interactive mode (will prompt for task)
node index.js
```

### Options

```bash
--help, -h                      # Show help information
--init                          # Create AI-generated agent configuration
--config <path>                 # Use custom configuration file
--project <path>                # Include file or directory context for analysis
--orchestrated                  # Use orchestrated mode (primary/secondary/validation workflow)
--iterative                     # Use iterative collaborative mode (multi-turn chunk discussion)
--chunk-size <n>                # Chunk size for iterative mode (default: 3)
--max-rounds-per-chunk <n>      # Max discussion rounds per chunk (default: 5)
--project-id <id>               # Use persistent project memory
```

### Operational Modes

**Consensus Mode (default):**
- Democratic discussion where all agents contribute equally
- Judge coordinates and evaluates consensus after each round
- Best for open-ended problems requiring diverse perspectives

**Orchestrated Mode (`--orchestrated`):**
- Structured workflow with designated primary agent
- Secondary agents provide critiques
- Optional validation gates for quality assurance
- Best for tasks requiring domain expertise and validation
- **Agents have full tool access**: Can read/write files, run commands, edit code

Example:
```bash
llm-conclave --orchestrated "Correct all 10 lines of oz.txt one at a time"
```

**Iterative Collaborative Mode (`--iterative`):**
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
llm-conclave --iterative --project oz.txt "Correct all OCR errors line by line"
llm-conclave --iterative --chunk-size 5 "Review and improve documentation"
```

### Examples

```bash
# Create initial config with AI-generated agents
llm-conclave --init

# Run with inline task (consensus mode)
llm-conclave "Create a task management application with real-time collaboration"

# Run with task from file
llm-conclave ./tasks/project-brief.txt

# Use custom config
llm-conclave --config ./configs/creative-team.json "Write a short story about AI"

# Analyze a project directory
llm-conclave --project ./my-app "Review this code for potential bugs and security issues"

# Orchestrated mode: Agents can perform actual file operations
llm-conclave --orchestrated "Correct lines 1-2 of oz.txt"

# Orchestrated mode: Iterative file processing
llm-conclave --orchestrated "Correct all 10 lines of document.txt one at a time"

# Orchestrated mode: Code refactoring
llm-conclave --orchestrated --project ./src "Refactor the authentication module"

# Review documentation directory
llm-conclave --project ./docs "Review my technical writing for clarity and completeness"

# Investigate a bug
llm-conclave --project ./src "Find why the login feature isn't working on mobile"

# Iterative collaborative mode: OCR correction with multi-turn discussion
llm-conclave --iterative --project oz.txt "Correct all OCR errors with collaborative discussion"

# Iterative mode: Custom chunk size for larger sections
llm-conclave --iterative --chunk-size 5 --project ./docs "Review and improve each section"

# Iterative mode: More rounds of discussion per chunk
llm-conclave --iterative --max-rounds-per-chunk 7 "Iteratively refine the code"
```

## Project Context Analysis

LLM Conclave can analyze individual files or entire directories. Use the `--project` flag to point it at any file or directory:

```bash
# Single file
node index.js --project /path/to/file.txt "your question or task"

# Directory
node index.js --project /path/to/project "your question or task"
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
llm-conclave --project ./my-webapp "Review this React app for performance issues"

# The agents will:
# 1. Read all source files (excluding node_modules, etc.)
# 2. See the full directory structure
# 3. Discuss performance concerns
# 4. Reach consensus on recommendations
# 5. Output detailed findings to the outputs/ directory

# Or use orchestrated mode for actual file changes:
llm-conclave --orchestrated --project ./my-webapp "Fix all ESLint errors"
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
      "model": "gemini-2.0-flash-exp",
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
- `gemini-2.0-flash-exp` (recommended)
- `gemini-2.5-flash`
- `gemini-flash`, `gemini-pro` (shorthand, maps to `gemini-2.0-flash-exp`)
- Note: Gemini 1.5 models deprecated - use Gemini 2.x

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
- **`cost_log.json`**: Detailed cost and performance metrics for the session

### Cost & Performance Summary

After each session, LLM Conclave displays and saves detailed cost tracking:

```
================================================================================
SESSION COST & PERFORMANCE
================================================================================

Total Cost: $0.023450
Total Tokens: 4523 (Input: 2341, Output: 2182)
Total Calls: 12
Average Latency: 1847.33ms
```

The `cost_log.json` file includes per-call details:
- Provider and model used
- Input/output token counts
- Latency per call
- Cost per call
- Success/failure status

This helps you monitor API usage and optimize your agent configurations.

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

## Future Enhancements

- **Cost tracking**: Monitor API usage and costs across providers
- **Judge-directed turns**: Judge selects who speaks next based on discussion needs
- **Streaming output**: Real-time display of agent responses
- **Voting mechanisms**: Explicit agent voting before final decision
- **Custom turn management**: More flexible conversation patterns beyond round-robin
- **Custom file filters**: User-configurable include/exclude patterns for project analysis
- **Embeddings/RAG**: Support for very large projects using vector search
- **Agent memory**: Long-term memory for agents across sessions
- **Parallel execution**: Run independent agent analyses in parallel

## License

ISC

## Contributing

Contributions welcome! Please open an issue or PR.

## Troubleshooting

**"Configuration file not found"**: Run `llm-conclave --init` to create a config file

**API errors**: Check that your API keys are correctly set in `.env`

**"Unknown model"**: Verify your model names match supported models (see Supported Models section)

**Tool iteration limit**: If agents stop mid-task, they may have hit the 25-iteration tool limit. Break task into smaller steps.

**File encoding issues**: Ensure files are UTF-8 encoded for best results with non-English text
