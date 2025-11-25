# LLM Conclave

A command-line tool that enables multiple LLMs (ChatGPT, Claude, Grok, and others) to collaboratively solve tasks through multi-turn conversation.

## Features

- **Multi-Agent Collaboration**: Configure multiple LLM agents with different models and personas
- **Judge-Coordinated Consensus**: An AI judge evaluates discussion progress and guides agents toward agreement
- **Flexible Configuration**: Use the same model multiple times with different system prompts
- **Multiple LLM Providers**: Support for OpenAI (GPT), Anthropic (Claude), and xAI (Grok)
- **Autonomous Operation**: Runs fully autonomously after task submission
- **Round-Robin Turns**: Agents take turns in a structured conversation flow
- **Comprehensive Output**: Saves full transcript, consensus, and JSON data

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

## Quick Start

1. **Initialize configuration:**
   ```bash
   node index.js --init
   ```
   This creates `.llm-conclave.json` with example agents.

2. **Edit the configuration** to customize your agents (see Configuration section below)

3. **Run with a task:**
   ```bash
   node index.js "Design a social media application"
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
--help, -h          # Show help information
--init              # Create example configuration file
--config <path>     # Use custom configuration file
```

### Examples

```bash
# Create initial config
node index.js --init

# Run with inline task
node index.js "Create a task management application with real-time collaboration"

# Run with task from file
node index.js ./tasks/project-brief.txt

# Use custom config
node index.js --config ./configs/creative-team.json "Write a short story about AI"
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
      "model": "gpt-4o",
      "prompt": "You are a creative innovator. Think outside the box and propose novel, unconventional approaches."
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

## How It Works

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

## Output Files

All outputs are saved to the `outputs/` directory with timestamps:

- **`*-transcript.md`**: Full conversation history with all agent responses
- **`*-consensus.md`**: Final solution and summary of how it was reached
- **`*-full.json`**: Complete data in JSON format for programmatic access

## API Keys

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
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

- **Cost tracking**: Monitor API usage and costs
- **Judge-directed turns**: Judge selects who speaks next based on discussion needs
- **Streaming output**: Real-time display of agent responses
- **Voting mechanisms**: Explicit agent voting before final decision
- **Custom turn management**: More flexible conversation patterns
- **Additional providers**: Support for more LLM providers

## License

ISC

## Contributing

Contributions welcome! Please open an issue or PR.

## Troubleshooting

**"Configuration file not found"**: Run `node index.js --init` to create a config file

**API errors**: Check that your API keys are correctly set in `.env`

**"Unknown model"**: Verify your model names match supported models (see Supported Models section)

**Rate limits**: Add delays between API calls if you hit rate limits (future enhancement)
