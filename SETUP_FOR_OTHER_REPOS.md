# Setting Up LLM Conclave for Other Repositories

This guide explains how to make llm-conclave available to Claude Code instances working in other repositories.

## Quick Setup (5 minutes)

### Step 1: Install llm-conclave globally

From this directory (`llm_conclave`), run:

```bash
npm link
```

Verify it worked:
```bash
llm-conclave --help
```

You should see the help output. The `llm-conclave` command is now available globally on your system.

### Step 2: Add tool documentation to your target repository

In your target repository where you want Claude to use llm-conclave:

```bash
# Navigate to your target repository
cd /path/to/your/other/repo

# Create the tools directory
mkdir -p .claudecode/tools

# Copy the reference documentation
cp /Users/benlamm/Workspace/llm_conclave/CLAUDE_TOOL_REFERENCE.md .claudecode/tools/llm-conclave.md
```

### Step 3: Initialize conclave config (optional)

If you want a project-specific configuration, create one in your target repository:

```bash
cd /path/to/your/other/repo
llm-conclave --init
```

This creates `.llm-conclave.json` which you can customize with agents specific to your project needs.

### Step 4: Commit the documentation (optional but recommended)

```bash
git add .claudecode/tools/llm-conclave.md
git add .llm-conclave.json  # if you created one
git commit -m "Add LLM Conclave tool for Claude Code"
```

## How It Works

Once set up, Claude Code in your target repository will:

1. **Discover the tool** - The `.claudecode/tools/llm-conclave.md` file provides context
2. **Know when to use it** - The documentation explains appropriate use cases
3. **Invoke it when needed** - Claude can run `llm-conclave` commands
4. **Read the output** - Results are saved to `outputs/` directory
5. **Present findings** - Claude summarizes the multi-agent consensus for you

## What Claude Will See

Claude reads the `CLAUDE_TOOL_REFERENCE.md` file and learns:
- What llm-conclave is and how it works
- When to use it (complex decisions, architectural choices, security reviews)
- When NOT to use it (simple tasks, obvious solutions)
- How to invoke it with proper syntax
- How to read and present the output

## Example Usage

Once set up, you can ask Claude in your other repository:

**You:** "Should we use Redis or Memcached for caching?"

**Claude:** "This is a complex decision with multiple trade-offs. I'll invoke the LLM Conclave to get perspectives from multiple AI agents..."

```bash
llm-conclave "Compare Redis vs Memcached for our use case. Consider: data structures needed, persistence requirements, memory efficiency, operational complexity, and community support."
```

**Claude:** "The conclave has reached consensus. Based on discussion between the Architect, Critic, Pragmatist, and Creative agents, here's their recommendation..."

## Customizing for Your Project

You can create project-specific agent configurations. For example:

### For a Security-Focused Project

Edit `.llm-conclave.json`:
```json
{
  "agents": {
    "Security_Expert": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a security expert. Focus on vulnerabilities, attack vectors, and security best practices."
    },
    "Compliance_Officer": {
      "model": "gpt-4o",
      "prompt": "You focus on compliance (GDPR, SOC2, HIPAA). Ensure solutions meet regulatory requirements."
    },
    "Penetration_Tester": {
      "model": "grok-3",
      "prompt": "You think like an attacker. Identify potential exploits and weaknesses."
    },
    "Security_Architect": {
      "model": "claude-sonnet-4-5",
      "prompt": "You design secure systems. Balance security with usability and performance."
    }
  }
}
```

### For a Frontend Project

```json
{
  "agents": {
    "UX_Designer": {
      "model": "gpt-4o",
      "prompt": "You prioritize user experience, accessibility, and intuitive design."
    },
    "Performance_Expert": {
      "model": "claude-sonnet-4-5",
      "prompt": "You focus on frontend performance: bundle size, render speed, Core Web Vitals."
    },
    "Accessibility_Advocate": {
      "model": "grok-3",
      "prompt": "You ensure WCAG compliance and inclusive design for all users."
    },
    "Pragmatic_Developer": {
      "model": "gpt-4o",
      "prompt": "You balance ideals with practical implementation and maintenance concerns."
    }
  }
}
```

## Multiple Repositories Setup

If you work with many repositories, you have options:

### Option A: Global Default + Local Overrides

1. Keep a default config in `llm_conclave/.llm-conclave.json`
2. Create project-specific configs in each repo as needed
3. Use `--config` flag when you want the global one:
   ```bash
   llm-conclave --config /Users/benlamm/Workspace/llm_conclave/.llm-conclave.json "task"
   ```

### Option B: Copy Tool Reference to Each Repo

```bash
# Create a script to set up new repos
cat > ~/.local/bin/setup-conclave-repo.sh << 'EOF'
#!/bin/bash
mkdir -p .claudecode/tools
cp /Users/benlamm/Workspace/llm_conclave/CLAUDE_TOOL_REFERENCE.md .claudecode/tools/llm-conclave.md
llm-conclave --init
echo "✓ LLM Conclave configured for this repository"
EOF

chmod +x ~/.local/bin/setup-conclave-repo.sh

# Then in any new repo:
cd /path/to/new/repo
setup-conclave-repo.sh
```

### Option C: Symbolic Links

```bash
cd /path/to/your/repo
mkdir -p .claudecode/tools
ln -s /Users/benlamm/Workspace/llm_conclave/CLAUDE_TOOL_REFERENCE.md .claudecode/tools/llm-conclave.md
```

This keeps a single source of truth. Updates to the reference automatically apply to all repos.

## Sharing with Team Members

If your team uses Claude Code, they can set this up too:

1. **Share this repo** - Have them clone `llm_conclave`
2. **Install dependencies** - `npm install` in the llm_conclave directory
3. **Link globally** - `npm link` in the llm_conclave directory
4. **Configure API keys** - Each team member adds their `.env` with API keys
5. **Tool reference is committed** - The `.claudecode/tools/llm-conclave.md` is in git, so they automatically have it

## Troubleshooting

**"llm-conclave: command not found"**
- Run `npm link` again from the llm_conclave directory
- Check if `~/.npm-packages/bin` or similar is in your PATH
- Try: `which llm-conclave` to see if it's installed

**Claude doesn't seem to know about the tool**
- Verify `.claudecode/tools/llm-conclave.md` exists
- The file may need to be read by Claude first - you can explicitly ask: "Do you have access to llm-conclave?"
- Restart your Claude Code session if needed

**Output files not appearing**
- Check you're in the right directory - outputs are saved to `./outputs/` relative to where you run the command
- Verify the command completed successfully - check for error messages

**API key errors**
- Ensure `.env` file exists in `/Users/benlamm/Workspace/llm_conclave/`
- Verify API keys are valid
- You only need keys for the models you're using (e.g., just ANTHROPIC_API_KEY if only using Claude)

## Cost Considerations

Each conclave invocation uses ~15-25 API calls across multiple providers. Typical costs:
- GPT-4o: ~$0.01-0.03 per call
- Claude Sonnet: ~$0.01-0.02 per call
- Grok: ~$0.01-0.02 per call

A single conclave session might cost $0.20-0.80 depending on conversation length and context size.

**Best practices:**
- Use judiciously for genuinely complex decisions
- Claude should inform you before invoking it
- Consider creating project-specific configs that use fewer agents for routine reviews

## Advanced: MCP Server (Future)

A more integrated approach would be creating an MCP (Model Context Protocol) server that exposes llm-conclave as a native tool. This would:
- Make it a first-class Claude Code tool
- Provide structured inputs/outputs
- Enable streaming of agent discussions

This is not currently implemented but could be added if there's interest.

## Summary

**For quick setup:**
1. `npm link` in this directory
2. Copy `CLAUDE_TOOL_REFERENCE.md` to your target repo's `.claudecode/tools/`
3. Claude will automatically discover and use it appropriately

**Share with other Claude instance:**
Simply give the other Claude instance the `CLAUDE_TOOL_REFERENCE.md` file content or path. That file contains everything Claude needs to know about when and how to use llm-conclave.
