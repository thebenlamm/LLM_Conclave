# LLM Conclave Integration for Claude Code

This document explains how to integrate llm-conclave with Claude Code instances in other repositories.

## What is LLM Conclave?

LLM Conclave is a multi-agent LLM collaboration tool that enables GPT, Claude, and Grok models to discuss problems and reach consensus. It's particularly useful for:

- **Complex architectural decisions** with multiple valid approaches
- **Code review requiring diverse perspectives** (security, performance, maintainability)
- **Design choices** where trade-offs need careful evaluation
- **Bug investigation** benefiting from multiple analytical approaches
- **Any problem where a single LLM perspective might miss important considerations**

## Integration Approach

The recommended approach is to:
1. **Install llm-conclave globally** - Makes it available from any repository
2. **Add tool documentation** - Place a reference file in your repo's `.claudecode/` directory
3. **Claude automatically discovers it** - Claude will know when and how to use the conclave

## Setup Instructions (For Users)

### Step 1: Install llm-conclave globally

From this directory, run:

```bash
npm link
```

This makes the `llm-conclave` command available globally on your system.

Verify installation:
```bash
llm-conclave --help
```

### Step 2: Configure API keys (if not already done)

Ensure you have a `.env` file in the llm-conclave directory with your API keys:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
```

### Step 3: Add tool documentation to your target repository

Copy the `CLAUDE_TOOL_REFERENCE.md` file (created below) to your target repository:

```bash
# In your target repository
mkdir -p .claudecode/tools
cp /path/to/llm_conclave/CLAUDE_TOOL_REFERENCE.md .claudecode/tools/llm-conclave.md
```

### Step 4: Initialize conclave config in your repository

In your target repository, create a default configuration:

```bash
llm-conclave --init
```

This creates `.llm-conclave.json` which you can customize for your project's needs.

---

## How Claude Should Use This Tool

Once set up, Claude Code will have access to llm-conclave documentation and can invoke it when appropriate.

### When to Use the Conclave

**✅ GOOD Use Cases:**
- Complex architectural decisions with multiple valid approaches
- Design choices with significant trade-offs to evaluate
- Security reviews requiring multiple perspectives
- Performance optimization requiring diverse strategies
- Controversial refactoring decisions
- Feature design with UX, technical, and business considerations
- Debugging complex, multi-system issues

**❌ Don't Use For:**
- Simple bug fixes with obvious solutions
- Straightforward feature implementations
- Minor refactoring or code cleanup
- Questions with factual answers
- Tasks where the approach is already clear
- Simple code reviews

### Command Format

```bash
# Basic usage
llm-conclave "task description"

# With project context (analyzes codebase)
llm-conclave --project /path/to/code "task description"

# With custom config
llm-conclave --config custom-config.json "task description"
```

### Example Workflow

1. **Claude identifies a complex problem**
   - User asks: "Should we refactor our auth system to use JWT or keep sessions?"

2. **Claude recognizes this needs multiple perspectives**
   - This has architectural, security, and operational trade-offs

3. **Claude invokes the conclave**
   ```bash
   llm-conclave --project ./src/auth "Evaluate whether to refactor from session-based auth to JWT. Consider security, scalability, complexity, and migration effort."
   ```

4. **Claude reads the output**
   - Transcript: `outputs/conclave-*-transcript.md`
   - Consensus: `outputs/conclave-*-consensus.md`
   - Full data: `outputs/conclave-*-full.json`

5. **Claude presents the consensus to the user**
   - Summarizes the discussion
   - Explains the reasoning
   - Provides the recommended approach

### Important Notes

- **The conclave runs autonomously** - Once started, it completes its discussion without further input
- **Output is saved to `outputs/` directory** - Claude should read these files after completion
- **Relative paths work** - When using `--project`, paths are relative to the current directory
- **Task descriptions should be detailed** - Include context, constraints, and evaluation criteria
- **The conclave can take several minutes** - Depending on complexity and number of rounds

### Configuration Customization

You can customize the agents in `.llm-conclave.json`:

```json
{
  "agents": {
    "Security_Expert": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a security expert. Evaluate solutions for security implications, vulnerabilities, and best practices."
    },
    "Performance_Engineer": {
      "model": "gpt-4o",
      "prompt": "You focus on performance, scalability, and efficiency. Consider latency, throughput, and resource usage."
    },
    "Maintainability_Advocate": {
      "model": "grok-3",
      "prompt": "You prioritize code maintainability, readability, and long-term sustainability."
    }
  }
}
```

---

## Output Format

The conclave produces three files:

1. **`*-transcript.md`** - Full conversation with all agent responses
2. **`*-consensus.md`** - Final agreed-upon solution and summary
3. **`*-full.json`** - Complete structured data for programmatic access

Claude should primarily read the **consensus** file for the final answer, but can reference the **transcript** for detailed reasoning.

---

## Troubleshooting

**"Command not found: llm-conclave"**
- Run `npm link` from the llm_conclave directory
- Verify with `which llm-conclave`

**"Configuration file not found"**
- Run `llm-conclave --init` in the target repository
- Or use `--config` flag to specify a path

**API key errors**
- Ensure `.env` exists in the llm_conclave installation directory
- Verify API keys are correct and active
- You only need keys for the models you're using

**"No such file or directory" when using --project**
- Ensure paths are correct relative to current directory
- Use absolute paths if unsure

---

## Cost Considerations

The conclave uses multiple LLM APIs simultaneously. A typical session might:
- Run 3-5 rounds of discussion
- Use 4 agents + 1 judge = 5 API calls per round
- Total: 15-25 API calls for one task

Claude should inform users when invoking the conclave so they're aware of the API usage.

---

## Advanced: Custom Configurations per Project

You can maintain multiple configurations:

```bash
# For security reviews
llm-conclave --config .llm-conclave-security.json "review task"

# For architecture decisions
llm-conclave --config .llm-conclave-architecture.json "design task"

# For code review
llm-conclave --config .llm-conclave-review.json "review task"
```

Each config can have specialized agents tuned for specific types of problems.
