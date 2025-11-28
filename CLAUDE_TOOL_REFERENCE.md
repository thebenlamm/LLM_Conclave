# Tool: LLM Conclave (Multi-Agent Consensus)

## Overview
`llm-conclave` is a command-line tool that enables multiple LLM agents (GPT, Claude, Grok) with different personas to collaboratively discuss complex problems and reach consensus through structured debate.

**When you invoke this tool, multiple AI agents will discuss the problem from different perspectives, coordinated by a judge AI. The final consensus is saved to the `outputs/` directory.**

## When to Use This Tool

### ✅ Use the Conclave For:

1. **Complex Architectural Decisions**
   - "Should we use microservices or monolith?"
   - "Which state management approach is best for this app?"
   - "How should we structure our database schema?"

2. **Design Choices with Significant Trade-offs**
   - "REST vs GraphQL vs gRPC for our API?"
   - "Client-side vs server-side rendering?"
   - "SQL vs NoSQL for this use case?"

3. **Security Reviews**
   - "Review this authentication system for vulnerabilities"
   - "Evaluate security implications of this design"
   - "What are the security risks in this codebase?"

4. **Performance Optimization**
   - "How should we optimize this slow endpoint?"
   - "What caching strategy should we implement?"
   - "Identify performance bottlenecks in this code"

5. **Complex Bug Investigation**
   - "Why is this race condition occurring?"
   - "What's causing this memory leak?"
   - "Diagnose this intermittent production issue"

6. **Controversial Refactoring**
   - "Should we rewrite this legacy module?"
   - "How should we migrate from X to Y?"
   - "Evaluate risks of this large refactor"

### ❌ Don't Use the Conclave For:

- Simple bug fixes with obvious solutions
- Straightforward feature implementations
- Minor code cleanup or style changes
- Questions with factual answers (use regular search/documentation)
- Tasks where the approach is already clear
- Simple code reviews that don't need debate

**Rule of thumb**: If multiple intelligent engineers would have different valid opinions, use the conclave. If the answer is obvious or factual, don't.

## Command Syntax

```bash
# Basic usage
llm-conclave "task description"

# With project context (analyzes files/directory)
llm-conclave --project <path> "task description"

# With custom config
llm-conclave --config <config-file> "task description"
```

## Usage Guidelines

### 1. Be Specific in Task Descriptions

**Bad:**
```bash
llm-conclave "improve the auth system"
```

**Good:**
```bash
llm-conclave --project ./src/auth "Evaluate whether to migrate from session-based authentication to JWT. Consider: 1) Security implications, 2) Scalability for distributed systems, 3) Migration complexity and risks, 4) Impact on existing mobile clients. Current system handles 10k daily active users."
```

### 2. Provide Context

Use `--project` to give agents access to relevant code:

```bash
# Analyze a specific directory
llm-conclave --project ./src/api "Review this API design for scalability issues"

# Analyze a single file
llm-conclave --project ./config/security.js "Is this security configuration robust?"

# Analyze entire codebase (auto-excludes node_modules, etc.)
llm-conclave --project . "Identify architectural inconsistencies"
```

### 3. Include Evaluation Criteria

Help agents focus their discussion:

```bash
llm-conclave "Choose a frontend framework. Prioritize: 1) Developer experience, 2) Performance, 3) Ecosystem maturity, 4) Hiring availability. Team has React experience."
```

## How It Works

1. **You invoke the tool** - Claude runs the conclave command
2. **Agents discuss (Round 1)** - Each agent shares their perspective
3. **Judge evaluates** - AI judge checks if consensus is reached
4. **More rounds if needed** - Agents continue discussing until consensus
5. **Consensus reached** - Judge synthesizes final agreed solution
6. **Output saved** - Results written to `outputs/` directory

**Typical duration**: 2-5 minutes depending on complexity.

## Reading the Output

The conclave creates three files in `outputs/`:

```
outputs/
  conclave-TIMESTAMP-transcript.md   # Full discussion (read for reasoning)
  conclave-TIMESTAMP-consensus.md    # Final solution (read this first)
  conclave-TIMESTAMP-full.json       # Structured data (for programmatic use)
```

**After the conclave completes, you should:**
1. Read the **consensus** file to get the final recommendation
2. Review the **transcript** if you need to understand the reasoning
3. Summarize the findings for the user with key points and rationale

## Example Invocations

### Example 1: Architecture Decision
```bash
llm-conclave --project ./src "We're experiencing slow database queries as our user base grows. Evaluate solutions: 1) Add read replicas, 2) Implement Redis caching, 3) Denormalize certain tables. Consider cost, complexity, and maintenance burden."
```

### Example 2: Security Review
```bash
llm-conclave --project ./src/auth "Review this authentication implementation for security vulnerabilities. Check for: injection attacks, session management issues, timing attacks, and OWASP Top 10 vulnerabilities."
```

### Example 3: Design Choice
```bash
llm-conclave "Our real-time dashboard needs updates every second. Compare: 1) WebSockets, 2) Server-Sent Events (SSE), 3) Long polling. Consider browser support, server load, connection reliability, and implementation complexity."
```

### Example 4: Bug Investigation
```bash
llm-conclave --project ./src/payments "Users report occasional duplicate charges. The issue is intermittent and doesn't appear in logs. Investigate potential causes: race conditions, retry logic, database transactions, or payment gateway issues."
```

### Example 5: Refactoring Decision
```bash
llm-conclave --project ./src/legacy "This module was written 5 years ago and needs updates. Evaluate: 1) Incremental refactoring, 2) Complete rewrite, 3) Leave as-is and wrap with new interface. Consider: business risk, development time, testing requirements."
```

## Configuration

The conclave uses `.llm-conclave.json` in the current directory. This defines the agents and their personas.

**Default agents** (if you've run `llm-conclave --init`):
- **Architect** (GPT-4o) - Systems design perspective
- **Critic** (Claude Sonnet 4.5) - Critical thinking, identifies issues
- **Pragmatist** (Grok-3) - Practical implementation focus
- **Creative** (GPT-4o) - Novel approaches

**You can customize** agents for specific projects:
- Security-focused team (security, compliance, privacy experts)
- Frontend team (UX, performance, accessibility experts)
- Backend team (scalability, reliability, data experts)

## Cost Awareness

**Important**: Each conclave session uses multiple LLM APIs:
- Typically 3-5 rounds of discussion
- 4 agents + 1 judge = 5 API calls per round
- Total: ~15-25 API calls

**When invoking the conclave, you should inform the user**, for example:
> "This is a complex decision that would benefit from multiple perspectives. I'll invoke the LLM Conclave (this will make ~20 API calls). The agents will discuss and I'll summarize their consensus for you."

## Output Handling

After the conclave completes:

1. **Find the latest output files:**
   ```bash
   ls -t outputs/ | head -3
   ```

2. **Read the consensus:**
   ```bash
   cat outputs/conclave-TIMESTAMP-consensus.md
   ```

3. **Present to user:**
   - Summarize the recommendation
   - Include key reasoning points
   - Mention any important dissenting views from transcript
   - Provide your own assessment if appropriate

## Important Notes

- **The conclave runs autonomously** - It completes its full discussion without requiring further input
- **It takes time** - Don't invoke for time-sensitive tasks where the user expects immediate answers
- **It's not always right** - Multiple LLMs can still have blind spots or biases
- **Review the output critically** - Don't blindly accept the consensus
- **Consider the user's experience** - They're waiting while this runs, so set expectations

## Troubleshooting

**Error: "llm-conclave: command not found"**
- The tool may not be installed or linked globally
- Ask user to run: `cd /path/to/llm_conclave && npm link`

**Error: "Configuration file not found"**
- Run: `llm-conclave --init` to create default config
- Or specify config with: `--config /path/to/config.json`

**Error: "API key missing"**
- Ensure `.env` file exists in llm_conclave directory with required keys
- User only needs keys for the models they're using

**Error: "No such file or directory" with --project**
- Verify the path is correct relative to current working directory
- Use absolute paths if uncertain

## Summary

LLM Conclave is a powerful tool for **complex decisions requiring multiple perspectives**. Use it judiciously when the problem genuinely benefits from diverse analytical approaches. When invoked, multiple AI agents will debate the issue and produce a consensus recommendation that you can present to the user.

**Key decision**: If you're uncertain whether the conclave would be valuable, ask the user: "This problem has multiple valid approaches. Would you like me to invoke the LLM Conclave to get perspectives from multiple AI agents (GPT, Claude, Grok)? This will take a few minutes and make ~20 API calls."
