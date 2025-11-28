# LLM Conclave - Instructions for Claude Code

> **Quick Start**: You have access to the `llm-conclave` command-line tool. Use it to get consensus from multiple AI agents (GPT, Claude, Grok) when facing complex decisions that benefit from diverse perspectives.

## What is This Tool?

LLM Conclave orchestrates multiple AI agents with different personas to collaboratively discuss problems and reach consensus. Think of it as convening a panel of experts who debate and synthesize a solution.

**How it works:**
1. You invoke `llm-conclave` with a task
2. Multiple agents (Architect, Critic, Pragmatist, Creative) discuss the problem
3. A judge AI coordinates and determines when consensus is reached
4. Results are saved to `outputs/` directory for you to read and summarize

## When Should You Use This?

### ✅ GOOD Use Cases:

- **Complex architectural decisions** - "Microservices vs monolith?", "Which database for this use case?"
- **Design choices with trade-offs** - "REST vs GraphQL?", "Client-side vs server-side rendering?"
- **Security reviews** - "Review this auth system for vulnerabilities"
- **Performance optimization** - "What caching strategy?", "How to optimize this slow query?"
- **Controversial refactoring** - "Should we rewrite this legacy code?"
- **Complex bug investigation** - "Why is this race condition happening?"

**Rule of thumb**: If experienced engineers would have different valid opinions, use the conclave.

### ❌ Don't Use For:

- Simple bug fixes
- Straightforward implementations
- Minor code cleanup
- Factual questions (use docs/search instead)
- Tasks where the approach is obvious
- Time-sensitive questions (conclave takes 2-5 minutes)

## Command Syntax

```bash
# Basic usage
llm-conclave "task description"

# With project context (gives agents access to code)
llm-conclave --project /path/to/code "task description"

# With custom config
llm-conclave --config config.json "task description"
```

## Best Practices

### 1. Write Detailed Task Descriptions

**Bad:**
```bash
llm-conclave "improve performance"
```

**Good:**
```bash
llm-conclave --project ./src/api "Our API endpoint /users/search is taking 3-5 seconds under load. Evaluate approaches: 1) Database query optimization, 2) Redis caching, 3) Elasticsearch for search. Consider: query patterns (mostly searches by name), current load (1000 req/min), and operational complexity."
```

### 2. Provide Relevant Context

```bash
# For code review
llm-conclave --project ./src/auth "Review for security vulnerabilities"

# For architecture decisions
llm-conclave --project . "Evaluate our current architecture for scaling to 10x traffic"

# For specific files
llm-conclave --project ./config.js "Is this configuration secure and robust?"
```

### 3. Set User Expectations

Before invoking, inform the user:

> "This is a complex architectural decision that would benefit from multiple perspectives. I'll invoke the LLM Conclave to get consensus from multiple AI agents (this will take 2-3 minutes and make ~20 API calls). Would you like me to proceed?"

Or for less critical tasks:

> "I'll use the LLM Conclave to get diverse perspectives on this approach..."

### 4. Read and Summarize Output

After the conclave completes:

1. **Read the consensus file first:**
   ```bash
   cat outputs/conclave-TIMESTAMP-consensus.md
   ```

2. **Review the transcript if needed:**
   ```bash
   cat outputs/conclave-TIMESTAMP-transcript.md
   ```

3. **Summarize for the user:**
   - State the recommendation clearly
   - Explain the key reasoning
   - Note any important trade-offs discussed
   - Add your own analysis if relevant

## Example Workflow

**User asks:** "Should we use JWT or session-based auth?"

**Your response:**

> This is an architectural decision with significant trade-offs around security, scalability, and complexity. I'll invoke the LLM Conclave to get perspectives from multiple AI agents. This will take about 2-3 minutes.

```bash
llm-conclave --project ./src/auth "Evaluate JWT vs session-based authentication for our application. Consider: 1) Security implications (token theft, rotation, storage), 2) Scalability (distributed systems, load balancing), 3) Implementation complexity, 4) User experience (remember me, logout, session management). Current context: REST API serving web and mobile clients, currently using sessions."
```

**After completion:**

> The conclave has reached consensus after 4 rounds of discussion. Here's their recommendation:
>
> **Recommendation: Hybrid approach** - Use session-based auth for web clients and JWT for mobile apps.
>
> **Key reasoning:**
> - Session-based is simpler and more secure for web (CSRF protection easier, instant revocation)
> - JWT is better for mobile (offline token storage, less server state)
> - The hybrid approach leverages strengths of both
>
> **Implementation path:**
> 1. Keep current session system for web
> 2. Add JWT endpoint for mobile clients only
> 3. Share user authentication logic between both
>
> **Trade-offs acknowledged:**
> - Slightly more complex than single approach
> - Need to maintain both systems
> - But provides best UX for each platform
>
> The full discussion transcript is available in `outputs/conclave-[timestamp]-transcript.md` if you'd like to review the detailed reasoning.

## Configuration

The conclave uses `.llm-conclave.json` in the current directory. Default agents:

- **Architect** (GPT-4o) - Systems design and best practices
- **Critic** (Claude Sonnet 4.5) - Critical thinking and identifying issues
- **Pragmatist** (Grok-3) - Practical implementation focus
- **Creative** (GPT-4o) - Novel and unconventional approaches

You can customize agents for specific domains:

```json
{
  "agents": {
    "Security_Expert": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a security expert focusing on vulnerabilities and attack vectors."
    },
    "Performance_Engineer": {
      "model": "gpt-4o",
      "prompt": "You focus on performance, scalability, and optimization."
    },
    "UX_Designer": {
      "model": "grok-3",
      "prompt": "You prioritize user experience and accessibility."
    }
  }
}
```

## Important Considerations

**Cost**: Each conclave invocation uses ~15-25 API calls across providers ($0.20-0.80 per session). Use judiciously.

**Time**: Takes 2-5 minutes to complete. Not suitable for quick questions or when user expects immediate response.

**Autonomy**: Once started, the conclave runs independently until consensus. You can't interrupt or guide it mid-discussion.

**Fallibility**: Multiple LLMs can still have blind spots. Review output critically and add your own analysis.

**Context limits**: With `--project`, very large codebases may hit context limits. Focus on relevant directories.

## Troubleshooting

**"llm-conclave: command not found"**
- Tool not installed globally
- User needs to run `npm link` in llm_conclave directory

**"Configuration file not found"**
- Run `llm-conclave --init` to create default config
- Or use `--config` flag with path to config file

**"API key missing"**
- Need `.env` file in llm_conclave installation directory
- Only requires keys for models being used

**No output files**
- Check for error messages in command output
- Verify `outputs/` directory exists and is writable

## Quick Reference

```bash
# When to use: Complex decisions needing multiple perspectives

# Basic invocation:
llm-conclave "detailed task description"

# With context:
llm-conclave --project ./relevant/code "task"

# Read output:
cat outputs/conclave-TIMESTAMP-consensus.md

# Present to user:
# 1. State recommendation
# 2. Explain reasoning
# 3. Note trade-offs
# 4. Add your analysis
```

## Example Invocations

### Architecture Decision
```bash
llm-conclave --project ./src "Choose between event-driven microservices vs traditional REST APIs. Consider: team experience (mostly REST), scalability needs (10x growth expected), operational complexity, and time-to-market."
```

### Security Review
```bash
llm-conclave --project ./src/auth "Comprehensive security review of our authentication system. Check: OWASP Top 10, session management, password handling, rate limiting, and input validation."
```

### Performance Optimization
```bash
llm-conclave --project ./src/api "Our dashboard loads in 8 seconds. Profile shows slow database queries (60%), large bundle size (25%), unoptimized images (15%). Prioritize improvements by impact and implementation effort."
```

### Bug Investigation
```bash
llm-conclave --project ./src "Users report intermittent 'payment failed' errors but transactions succeed. No clear pattern in logs. Investigate: race conditions, timeout handling, retry logic, and database transactions."
```

### Design Choice
```bash
llm-conclave "Real-time collaboration feature for our document editor. Compare: WebSockets (Socket.io), Operational Transform, CRDT, or server polling. Consider: conflict resolution, offline support, scalability, and implementation complexity."
```

---

## Summary

You have access to LLM Conclave for **complex decisions that benefit from multiple AI perspectives**. Use it judiciously when genuine debate would provide value. Set user expectations about time and cost. Read the output and present a clear summary with the recommendation and reasoning.

**Key principle**: If you'd consult multiple senior engineers for this problem, use the conclave. If the answer is obvious or factual, don't.
