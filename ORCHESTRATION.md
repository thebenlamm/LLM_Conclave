# Orchestrated Multi-Agent Coordination

The orchestration system provides structured, role-based multi-agent collaboration with primary/secondary/validator workflow patterns. This is ideal for domain-specific advisory work where agents have clear specializations and decisions need validation.

## Overview

**Two Modes Available:**

1. **Standard Mode** (default): Democratic consensus-driven discussions
2. **Orchestrated Mode** (`--orchestrated`): Structured role-based workflow

## Orchestrated Mode Workflow

```
Task → Task Classification
         ↓
      Primary Agent (domain expert responds)
         ↓
      Secondary Agents (structured critiques)
         ↓
      Primary Agent (revision based on feedback)
         ↓
      Validator Agents (compliance, language, UX review)
         ↓
      Final Output (with validation results)
```

## Agent Roles

### Decision-Making Agents

**Brand_Architect**
- **Domains**: Naming, messaging, aesthetics, brand identity, storytelling
- **Speaks First For**: Brand-related tasks (naming, voice, identity)
- **Example Tasks**: "Name our product", "Define brand voice"

**Product_Mapper**
- **Domains**: SKU mapping, operations, feasibility, pricing, logistics
- **Speaks First For**: Product structure, operational tasks
- **Example Tasks**: "Structure our SKU catalog", "Price our product line"

**Growth_Strategist**
- **Domains**: Market positioning, customer acquisition, distribution, scaling
- **Speaks First For**: Marketing, growth, strategy tasks
- **Example Tasks**: "Create launch plan", "Identify target audience"

### Validator Agents

**Compliance**
- **Validates**: Legal requirements, regulatory compliance, risk assessment
- **Reviews**: All major decisions and customer-facing content

**Language_Filter**
- **Validates**: Tone consistency, brand voice, inclusivity, clarity
- **Reviews**: All customer-facing content

**Experience_Designer**
- **Validates**: User experience, customer journey, accessibility
- **Reviews**: Product and customer interaction decisions

## Task Classification

The system automatically routes tasks to the appropriate primary agent:

```javascript
"Name our product" → Brand_Architect (primary)
"Price our SKUs" → Product_Mapper (primary)
"Plan our launch" → Growth_Strategist (primary)
"Optimize checkout flow" → Experience_Designer (primary for UX tasks)
```

Classification is based on keyword matching against each agent's domain expertise.

## Critique Structure

Secondary agents provide structured feedback:

1. **Concise critique** (1-3 sentences)
2. **Specific improvement suggestion**
3. **One clarifying question** (if needed)
4. **Agreement level**: Yes/No/Partial

This ensures feedback is actionable and focused.

## Validation Format

Validators provide structured reviews:

1. **Status**: PASS / FAIL / NEEDS_REVISION
2. **Issues found** (if any)
3. **Recommendations** for improvement

## Usage

### Simplified Per-Directory Workflow (Recommended)

Set up once per project directory:

```bash
cd ~/my-company

# 1. Install llm-conclave globally (one-time)
npm install -g /path/to/llm_conclave

# 2. Copy config template
cp /path/to/llm_conclave/company-advisors-config.json .llm-conclave.json

# 3. Edit config to set your project_id
# Edit .llm-conclave.json: { "project_id": "my-company", ... }

# 4. Initialize the project
llm-conclave --init-project my-company

# 5. Now just run commands - config and project picked up automatically!
llm-conclave --orchestrated "Name our product"
llm-conclave --orchestrated "Plan our launch"
llm-conclave --orchestrated "Create pricing strategy"

# All conversations use the same project memory automatically
```

### Basic Orchestrated Conversation

```bash
# Without project memory
llm-conclave --orchestrated "Name our skincare product for sensitive skin"
```

### With Project Memory (Manual)

```bash
# Create project
llm-conclave --init-project my-company

# Run orchestrated conversation with memory (specify each time)
llm-conclave --orchestrated --project-id my-company "Plan our Q1 launch"
```

### With Custom Config

```bash
node index.js --orchestrated --config company-advisors-config.json "Design packaging"
```

### Complete Workflow Example

```bash
# Initialize project
node index.js --init-project wellness-brand

# First conversation - naming
node index.js --orchestrated \
  --config company-advisors-config.json \
  --project-id wellness-brand \
  "Name our wellness app for stressed professionals"

# Second conversation - builds on naming decision
node index.js --orchestrated \
  --project-id wellness-brand \
  "Create launch marketing strategy"

# View project history
node index.js --project-info wellness-brand
```

## Configuration

### Project-Specific Setup

You can add an optional `project_id` field to your config to avoid specifying `--project-id` on every command:

```json
{
  "project_id": "my-company",
  "agents": {...}
}
```

With this set, you can simply run:
```bash
llm-conclave --orchestrated "your task"
```

Instead of:
```bash
llm-conclave --orchestrated --project-id my-company "your task"
```

The `--project-id` flag overrides the config if you need to use a different project temporarily.

### Agent Setup

Use `company-advisors-config.json` as a template:

```json
{
  "project_id": "my-company",
  "agents": {
    "Brand_Architect": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a Brand Architect advisor..."
    },
    "Product_Mapper": {
      "model": "gpt-4o",
      "prompt": "You are a Product Mapper advisor..."
    },
    "Growth_Strategist": {
      "model": "grok-3",
      "prompt": "You are a Growth Strategist advisor..."
    },
    "Compliance": {
      "model": "gpt-4o",
      "prompt": "You are a Compliance advisor..."
    },
    "Language_Filter": {
      "model": "claude-sonnet-4-5",
      "prompt": "You are a Language Filter advisor..."
    },
    "Experience_Designer": {
      "model": "gpt-4o",
      "prompt": "You are an Experience Designer advisor..."
    }
  }
}
```

### Custom Agent Roles

You can define your own agent roles by editing `src/orchestration/AgentRoles.js`:

```javascript
const AGENT_ROLES = {
  Your_Agent: {
    type: AGENT_TYPES.DECISION_MAKER, // or VALIDATOR
    domains: ['domain1', 'domain2'],
    speaksFirstFor: ['keyword1', 'keyword2'],
    critiquesAs: ['critique focus areas']
  }
};
```

## Output Files

Orchestrated conversations generate:

1. **Orchestrated Transcript** (`*-orchestrated-transcript.md`)
   - Full conversation with all phases
   - Primary response, critiques, revision, validations

2. **Final Output** (`*-final-output.md`)
   - Cleaned final answer
   - Validation summary

3. **JSON Data** (`*-full.json`)
   - Complete structured data
   - Classification metadata
   - All agent responses

## When to Use Orchestrated Mode

**Use Orchestrated Mode When:**
- Agents have clear specialized roles
- You need structured feedback cycles
- Decisions require validation gates
- You want deterministic routing based on task type
- Working on domain-specific advisory (business, product, legal)

**Use Standard Mode When:**
- Open-ended exploration
- Creative brainstorming
- No clear primary expert
- Democratic consensus is preferred
- Complex problems requiring all perspectives equally

## Example: Company Advisory Session

```bash
# Set up company project
node index.js --init-project skincare-startup

# Task 1: Product naming (Brand leads)
node index.js --orchestrated \
  --config company-advisors-config.json \
  --project-id skincare-startup \
  "Name our sensitive skin care line with natural ingredients"

# Result: Brand_Architect leads, others critique, validators review

# Task 2: Pricing strategy (Product leads)
node index.js --orchestrated \
  --project-id skincare-startup \
  "Determine pricing for our 3-product starter line"

# Result: Product_Mapper leads, references naming decision from memory

# Task 3: Launch plan (Growth leads)
node index.js --orchestrated \
  --project-id skincare-startup \
  "Create 90-day launch plan targeting health-conscious millennials"

# Result: Growth_Strategist leads, references all previous decisions

# View complete project history
node index.js --project-info skincare-startup
```

## Advanced: Conflict Resolution

When agents disagree, the system uses resolution modes:

- **BRAND_FIRST**: Aesthetic/message choices dominate (for branding tasks)
- **OPERATIONS_FIRST**: Feasibility/logistics dominate (for operational tasks)
- **MARKET_FIRST**: Audience resonance dominates (for strategy tasks)

Resolution mode is automatically determined by task classification.

## Tips

1. **Clear Task Descriptions**: Use domain keywords to ensure correct routing
   - Good: "Name our product for sensitive skin users"
   - Bad: "We need ideas" (too vague)

2. **Use Project Memory**: Build institutional knowledge over time
   ```bash
   # Always use --project-id for related conversations
   --project-id my-company
   ```

3. **Review Validations**: Pay attention to validator feedback
   - FAIL: Serious issues that must be addressed
   - NEEDS_REVISION: Improvements recommended
   - PASS: Ready to proceed

4. **Iterate Based on Feedback**: Use validator suggestions for follow-up conversations
   ```bash
   # After getting NEEDS_REVISION for trademark concerns
   node index.js --orchestrated --project-id my-company \
     "Refine the 'Tenderkin' name considering trademark availability"
   ```

## Integration with Memory System

Orchestrated conversations automatically:
- Load relevant project memory before starting
- Record conversation metadata (primary agent, task type)
- Track all agent participation
- Store decisions with confidence scores

This enables agents to reference previous decisions and build context over time.

---

For more information:
- **Project Memory**: See `PROJECT_MEMORY.md`
- **Standard Consensus Mode**: See `README.md`
- **Agent Role Definitions**: See `src/orchestration/AgentRoles.js`
