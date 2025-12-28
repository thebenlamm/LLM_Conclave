# Migration Guide: v1 → v2

## Overview

LLM Conclave v2 introduces a **major CLI redesign** with:
- **Git-style subcommands** for better discoverability
- **Smart mode auto-detection** - no manual mode selection needed
- **Persona system** - use expert roles instead of configuring agents manually
- **Zero-config mode** - works immediately with sensible defaults
- **Config cascading** - CLI > ENV > Project > Global > Defaults

**Good news:** v2 is **backward compatible** with v1 for now. Old commands still work with deprecation warnings.

---

## Quick Start (New Users)

If you're new to v2, here's the simplest way to get started:

```bash
# No configuration needed!
llm-conclave "Review my authentication code"

# Uses smart defaults:
# - Auto-detects best mode (consensus/orchestrated/iterative)
# - 3 expert agents (Claude Sonnet 4.5, GPT-4o, Gemini Pro)
# - Judge: GPT-4o
```

---

## Command Changes

### Mode Commands

| v1 Command | v2 Command | Notes |
|------------|------------|-------|
| `llm-conclave "task"` | `llm-conclave "task"` | Same, but now auto-detects mode |
| `llm-conclave --orchestrated "task"` | `llm-conclave review "task"` | Clearer name |
| `llm-conclave --iterative "task"` | `llm-conclave iterate "task"` | Clearer name |
| *(no v1 equivalent)* | `llm-conclave discuss "task"` | Explicit consensus mode |

### Utility Commands

| v1 Command | v2 Command | Notes |
|------------|------------|-------|
| `llm-conclave --init` | `llm-conclave init` | Subcommand |
| `llm-conclave --list-templates` | `llm-conclave templates` | No flags |
| `llm-conclave --list-sessions` | `llm-conclave sessions` | No flags |
| `llm-conclave --continue` | `llm-conclave continue` | Subcommand |
| `llm-conclave --resume <id>` | `llm-conclave continue <id>` | Unified command |
| `llm-conclave --server` | `llm-conclave server` | Subcommand |

### New Commands

| Command | Purpose |
|---------|---------|
| `llm-conclave personas` | List available expert personas |
| `llm-conclave config show` | Show current configuration |
| `llm-conclave config edit` | Open config in editor |
| `llm-conclave config set <key> <value>` | Set config value |
| `llm-conclave config get <key>` | Get config value |

---

## Flag Changes

### Iterative Mode Flags

| v1 Flag | v2 Flag | Notes |
|---------|---------|-------|
| `--chunk-size <n>` | `--chunk-size <n>` | Same, but auto-detected if omitted |
| `--max-rounds-per-chunk <n>` | `--rounds <n>` | Shorter name |
| *(no v1 equivalent)* | `--quick` | Shorthand for `--rounds 2` |
| *(no v1 equivalent)* | `--deep` | Shorthand for `--rounds 7` |
| *(no v1 equivalent)* | `--thorough` | Shorthand for `--rounds 10` |

### Global Flags

| v1 Flag | v2 Flag | Notes |
|---------|---------|-------|
| `--project <path>` | `-p, --project <path>` | Added short flag |
| `--config <path>` | `-c, --config <path>` | Added short flag |
| *(no v1 equivalent)* | `--with <personas>` | Use expert personas |

---

## New Features

### 1. Zero-Config Mode

**Before (v1):**
```bash
# Required setup first
$ llm-conclave --init
# ... answer prompts, configure agents ...

$ llm-conclave "task"
```

**After (v2):**
```bash
# Just works!
$ llm-conclave "task"

ℹ️  No configuration found. Using smart defaults...
   • Mode: Consensus (3 expert agents)
   • Agents: Claude Sonnet 4.5, GPT-4o, Gemini Pro
   • Judge: GPT-4o

   💡 Want to customize? Run: llm-conclave init
```

### 2. Smart Mode Detection

**Before (v1):**
```bash
# Had to manually choose mode
$ llm-conclave --orchestrated "Review code"
$ llm-conclave --iterative "Fix line by line"
```

**After (v2):**
```bash
# Auto-detects based on task
$ llm-conclave "Review code for security issues"

🔍 Task Analysis:
   Mode: orchestrated
   Confidence: 85%
   Reason: Task involves review - orchestrated mode provides structured feedback

📝 Starting structured review...
```

### 3. Persona System

**Before (v1):**
```json
{
  "agents": {
    "SecurityExpert": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a cybersecurity expert..."
    },
    "PerformanceExpert": {
      "model": "gpt-4o",
      "prompt": "You are a performance engineer..."
    }
  }
}
```

**After (v2):**
```bash
# Just specify personas!
$ llm-conclave --with security,performance "Review this API"

Using personas: security,performance

Agents: Security Expert, Performance Engineer
```

**Available Personas:**
- `security` - Security Expert (Claude Sonnet 4.5)
- `performance` - Performance Engineer (GPT-4o)
- `architecture` - Systems Architect (Claude Opus 4.5)
- `creative` - Creative Innovator (Gemini 2.5 Pro)
- `skeptic` - Critical Analyst (GPT-4o)
- `pragmatic` - Pragmatic Engineer (Mistral Large)
- `testing` - QA Expert (GPT-4o)
- `devops` - DevOps Engineer (Gemini 2.5 Pro)
- `accessibility` - Accessibility Expert (Claude Sonnet 4.5)
- `documentation` - Documentation Specialist (GPT-4o)

### 4. Config Cascading

Configuration sources are now merged with clear precedence:

**Priority (highest to lowest):**
1. **CLI flags** - `--judge gpt-4o`
2. **Environment variables** - `CONCLAVE_JUDGE_MODEL=gpt-4o`
3. **Project config** - `.llm-conclave.json`
4. **Global config** - `~/.config/llm-conclave/config.json`
5. **Smart defaults** - Built-in fallbacks

**Example:**
```bash
# Set global default judge
$ llm-conclave config set -g judge.model claude-opus-4

# Override with ENV var
$ CONCLAVE_JUDGE_MODEL=gpt-4o llm-conclave "task"

# Override with CLI flag (highest priority)
$ llm-conclave review --judge gemini-2.5-pro "task"
```

### 5. Smart Modifiers

**Before (v1):**
```bash
$ llm-conclave --iterative --chunk-size 3 --max-rounds-per-chunk 2 "task"
```

**After (v2):**
```bash
# Quick pass (2 rounds per chunk)
$ llm-conclave iterate --quick "task"

# Thorough analysis (7 rounds per chunk)
$ llm-conclave iterate --deep "task"

# Maximum thoroughness (10 rounds per chunk)
$ llm-conclave iterate --thorough "task"
```

---

## Migration Examples

### Example 1: Code Review

**v1:**
```bash
llm-conclave --orchestrated --project ./src/auth "Review this authentication module"
```

**v2:**
```bash
# Option A: Explicit subcommand
llm-conclave review -p ./src/auth "Review this authentication module"

# Option B: Auto-detection
llm-conclave "Review this authentication module" -p ./src/auth

# Option C: With personas
llm-conclave review --with security,architecture -p ./src/auth "Review auth module"
```

### Example 2: Iterative Processing

**v1:**
```bash
llm-conclave --iterative --chunk-size 5 --max-rounds-per-chunk 3 \
  --project document.txt "Correct OCR errors"
```

**v2:**
```bash
# Explicit parameters
llm-conclave iterate --chunk-size 5 --rounds 3 \
  -p document.txt "Correct OCR errors"

# Or use smart modifiers
llm-conclave iterate --deep -p document.txt "Correct OCR errors"

# Or let it auto-detect
llm-conclave "Correct OCR errors line by line" -p document.txt
```

### Example 3: Using Templates

**v1:**
```bash
llm-conclave --template code-review "Review ./src/api.ts"
```

**v2:**
```bash
# Same basic usage
llm-conclave template code-review "Review ./src/api.ts"

# Or interactive selection
llm-conclave template
? Select a template: › code-review - Comprehensive code review...
? What task should the agents work on? › Review ./src/api.ts
```

---

## Configuration File Changes

Your existing `.llm-conclave.json` files **continue to work** in v2. No changes needed!

However, v2 introduces new configuration options:

### Global Configuration

Create `~/.config/llm-conclave/config.json` for user-wide defaults:

```json
{
  "judge": {
    "model": "claude-opus-4"
  },
  "providers": {
    "openai": { "enabled": true },
    "anthropic": { "enabled": true }
  }
}
```

### Environment Variables

Set config via environment variables with `CONCLAVE_` prefix:

```bash
export CONCLAVE_JUDGE_MODEL=gpt-4o
export CONCLAVE_MAX_ROUNDS=5
export CONCLAVE_STREAM=true

# Nested keys use underscores
export CONCLAVE_JUDGE_PROMPT="You are an expert judge..."
```

---

## Breaking Changes

### Minimal Breaking Changes in v2.0

v2.0 maintains **full backward compatibility** with v1 commands. All old flags still work!

The only breaking change is:
- **Removed**: `--list-sessions` → Use `llm-conclave sessions`
- **Removed**: `--list-templates` → Use `llm-conclave templates`

These show deprecation warnings and will be removed in v2.1 (6 months).

### Future Deprecations (v2.1+)

In 6 months, these v1 flags will be removed:
- `--orchestrated` → Use `llm-conclave review`
- `--iterative` → Use `llm-conclave iterate`
- `--init` → Use `llm-conclave init`
- `--continue` / `--resume` → Use `llm-conclave continue`

**Recommendation:** Start using v2 subcommands now to avoid future issues.

---

## Troubleshooting

### "Command not found" after upgrade

**Problem:** Old commands not working.

**Solution:**
```bash
# Rebuild after upgrade
npm run build

# Or reinstall globally
npm install -g llm-conclave
```

### "Configuration Error" on first run

**Problem:** v2 requires API keys in environment.

**Solution:**
```bash
# Set required API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Or use .env file (automatically loaded)
echo "OPENAI_API_KEY=sk-..." >> .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

### "No agents configured"

**Problem:** Old config format might be incompatible.

**Solution:**
```bash
# Regenerate config
llm-conclave init --overwrite

# Or use zero-config mode
llm-conclave "task"  # Uses built-in defaults
```

### Personas not working as expected

**Problem:** Persona names misspelled.

**Solution:**
```bash
# List available personas
llm-conclave personas

# Use exact names
llm-conclave --with security,performance "task"
```

---

## Cheat Sheet

### Common v1 → v2 Conversions

```bash
# Modes
llm-conclave --orchestrated "task"  →  llm-conclave review "task"
llm-conclave --iterative "task"     →  llm-conclave iterate "task"

# Setup
llm-conclave --init                 →  llm-conclave init

# Utilities
llm-conclave --list-templates       →  llm-conclave templates
llm-conclave --list-sessions        →  llm-conclave sessions
llm-conclave --continue             →  llm-conclave continue

# Iterative flags
--max-rounds-per-chunk 2            →  --quick
--max-rounds-per-chunk 7            →  --deep
--max-rounds-per-chunk 10           →  --thorough

# Projects
--project ./src                     →  -p ./src
```

### New v2-Only Features

```bash
# Personas
llm-conclave --with security,performance "task"

# Auto-detection
llm-conclave "Review code"  # Detects orchestrated mode

# Config management
llm-conclave config show
llm-conclave config set judge.model gpt-4o

# Zero-config
llm-conclave "task"  # No setup required!
```

---

## Getting Help

### Built-in Help

```bash
# General help
llm-conclave --help

# Command-specific help
llm-conclave review --help
llm-conclave iterate --help

# List personas
llm-conclave personas -v

# List templates
llm-conclave templates -v
```

### Resources

- **README**: Full documentation
- **CLI_V2_PROGRESS.md**: Technical implementation details
- **GitHub Issues**: https://github.com/anthropics/llm-conclave/issues

---

## Summary

**What Changed:**
- ✅ Git-style subcommands (`review`, `iterate`, `discuss`)
- ✅ Persona system (`--with security,performance`)
- ✅ Zero-config mode (works without setup)
- ✅ Smart auto-detection (picks best mode automatically)
- ✅ Config cascading (CLI > ENV > Project > Global)
- ✅ Smart modifiers (`--quick`, `--deep`, `--thorough`)

**What Stayed the Same:**
- ✅ Configuration file format (`.llm-conclave.json`)
- ✅ Templates system
- ✅ Session management
- ✅ Tool support
- ✅ All providers (OpenAI, Anthropic, Google, xAI, Mistral)

**Bottom Line:**
v2 makes LLM Conclave **dramatically easier to use** while maintaining full compatibility with v1. You can migrate gradually or dive right in!

---

**Welcome to LLM Conclave v2! 🎉**
