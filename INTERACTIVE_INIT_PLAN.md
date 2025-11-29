# Interactive Init System - Implementation Plan

Transform `llm-conclave --init` from static config generator to intelligent, conversational setup wizard.

## Vision

```bash
$ llm-conclave --init

╔═══════════════════════════════════════╗
║     LLM Conclave Interactive Setup    ║
╚═══════════════════════════════════════╝

Checking for API keys...
✓ Found: ANTHROPIC_API_KEY, OPENAI_API_KEY

Project name: my-startup

Tell me about your project and the decisions you'll be making:
> I'm building a SaaS product. Need help with product strategy,
> technical architecture decisions, and go-to-market planning.

[Thinking with Claude Sonnet 4.5...]

I recommend 4 specialized agents for your project:
...
[User accepts or modifies]
...

✓ Created .llm-conclave.json
✓ Created project memory: my-startup
✓ Ready to use!
```

---

## Implementation Phases

### **Phase 1: Core Interactive Init** ⭐ Priority
**Goal**: Replace static config generation with LLM-powered agent recommendations

**Deliverables**:
- Interactive CLI prompts
- LLM-based agent generation
- Config file creation with custom agents
- Project memory initialization
- Graceful fallback when no API keys

**Time Estimate**: 2-3 hours

---

### **Phase 2: Project Scanning**
**Goal**: Enable intelligent agent suggestions based on project analysis

**Deliverables**:
- Optional project directory scanning
- Context-aware agent recommendations
- Smart defaults based on project type

**Time Estimate**: 1-2 hours

---

### **Phase 3: Refinement & Polish**
**Goal**: Allow users to modify existing configs and improve UX

**Deliverables**:
- `--init --refine` mode for existing projects
- Better error handling
- Progress indicators
- Setup conversation logging

**Time Estimate**: 1-2 hours

---

## Phase 1: Core Interactive Init

### Architecture

```
src/init/
├── InteractiveInit.js       # Main orchestrator
├── APIKeyDetector.js         # Detect available providers
├── AgentGenerator.js         # LLM-powered agent creation
├── PromptBuilder.js          # Build prompts for LLM
└── ConfigWriter.js           # Write validated config
```

### New Files

#### `src/init/InteractiveInit.js`
Main class that orchestrates the entire init flow.

**Responsibilities**:
- Check for API keys
- Prompt user for project info
- Call AgentGenerator
- Present agent proposals to user
- Handle user feedback loop
- Finalize and write configs

**Key Methods**:
```javascript
class InteractiveInit {
  async run(options = {})
  async promptProjectName()
  async promptProjectDescription()
  async presentAgentProposal(agents)
  async handleUserChoice(choice, agents)
  async finalizeSetup(agents, projectName)
}
```

#### `src/init/APIKeyDetector.js`
Detect which API keys are available in environment.

**Methods**:
```javascript
class APIKeyDetector {
  static detect()  // Returns { provider, keyName, available: true/false }[]
  static hasAnyKey()
  static getBestProvider()  // Prioritize: Claude > GPT-4 > Grok
  static printAvailability()
}
```

#### `src/init/AgentGenerator.js`
Uses LLM to generate agent recommendations.

**Methods**:
```javascript
class AgentGenerator {
  constructor(provider, model)
  async generateAgents(projectDescription, scanContext = null)
  validateAgents(agentsJson)
  sanitizeAgentName(name)
}
```

**LLM Prompt Template**:
```javascript
const AGENT_GENERATION_PROMPT = `
You are an expert at designing multi-agent AI collaboration systems.

PROJECT DESCRIPTION:
${projectDescription}

${scanContext ? `PROJECT ANALYSIS:\n${scanContext}\n` : ''}

Generate 3-4 specialized AI agents for this project as JSON.

Requirements:
1. Agent names: PascalCase with underscores (e.g., Brand_Strategist, Tech_Architect)
2. Each agent should have a distinct, non-overlapping domain
3. Mix of strategic and validation agents if applicable
4. Specific, actionable expertise areas
5. Choose appropriate models:
   - claude-sonnet-4-5: Creative, nuanced reasoning (brand, strategy)
   - gpt-4o: Analytical, structured thinking (ops, technical)
   - grok-3: Market/growth focused

Return ONLY valid JSON in this format:
{
  "agents": [
    {
      "name": "Agent_Name",
      "type": "decision_maker" | "validator",
      "role": "One sentence describing their expertise",
      "domains": ["domain1", "domain2", "domain3"],
      "model": "claude-sonnet-4-5" | "gpt-4o" | "grok-3",
      "prompt": "You are a {name} advisor specializing in {domains}. Your expertise includes {specific areas}. When analyzing tasks, focus on {key concerns}. Provide insights on {what you evaluate}. Be {tone/style}."
    }
  ],
  "reasoning": "2-3 sentences explaining why these specific agents were chosen"
}

Generate thoughtful, project-specific agents now:
`;
```

#### `src/init/PromptBuilder.js`
Helper for building user prompts with nice formatting.

**Methods**:
```javascript
class PromptBuilder {
  static header(text)
  static question(text)
  static info(text)
  static success(text)
  static warning(text)
  static error(text)
  static formatAgent(agent)
  static formatAgentList(agents)
  static menu(options)
}
```

#### `src/init/ConfigWriter.js`
Writes validated config and initializes project.

**Methods**:
```javascript
class ConfigWriter {
  static async writeConfig(projectName, agents, options = {})
  static buildConfigObject(projectName, agents)
  static async initializeProject(projectName)
  static printSummary(projectName, agents, files)
}
```

### Integration Point

**Modify `index.js`**:

```javascript
// Replace current --init handler
if (args.includes('--init')) {
  // Check if interactive mode is requested or API keys available
  const interactive = !args.includes('--template-only');

  if (interactive) {
    const InteractiveInit = require('./src/init/InteractiveInit');
    const init = new InteractiveInit();
    await init.run({ projectName: args[args.indexOf('--init') + 1] });
  } else {
    // Fallback to template mode
    const configPath = ConfigLoader.createExample();
    console.log(`✓ Created template configuration: ${configPath}\n`);
  }

  process.exit(0);
}
```

### User Flow - Phase 1

```
1. User runs: llm-conclave --init [project-name]

2. Check for API keys
   ✓ If found: Continue to interactive mode
   ✗ If none: Print message, create template, exit

3. Prompt for project name (if not provided)
   > Project name: my-startup

4. Prompt for project description
   > Tell me about your project:
   > (Multi-line input, Ctrl+D to finish)

5. Show "Thinking..." indicator
   [Generating agents with Claude Sonnet 4.5...]

6. Present agent proposals
   ┌─────────────────────────────────────────┐
   │ 1. Product_Strategist (Claude 4.5)     │
   │    Product decisions, roadmap, features │
   └─────────────────────────────────────────┘

   [Show all 3-4 agents]

   Reasoning: These agents cover your product strategy,
   technical decisions, and market positioning needs.

7. User menu
   [a] Accept and create config
   [m] Modify agents
   [p] View full prompts
   [r] Regenerate different agents
   [t] Create template instead

   Your choice:

8. Handle choice
   a → Write config and initialize project
   m → Allow adding/removing/editing agents
   p → Show full system prompts, then return to menu
   r → Go back to step 5 with same description
   t → Fall back to template mode

9. Finalize
   ✓ Created .llm-conclave.json (4 agents)
   ✓ Created project memory: my-startup

   Agent prompts can be edited in:
   .llm-conclave.json (agents section)

   🎉 Setup complete! Try:
   llm-conclave --orchestrated "your first task"

10. Exit
```

### Error Handling

**No API keys found**:
```
⚠️  No API keys detected

To use interactive setup, add one of these to your environment:
  • ANTHROPIC_API_KEY
  • OPENAI_API_KEY
  • XAI_API_KEY

Creating template config instead...
✓ Created .llm-conclave.json

Edit this file to customize your agents, then run:
llm-conclave --init-project your-project-name
```

**LLM returns invalid JSON**:
```
⚠️  Failed to generate agents (invalid response)
Creating template config instead...
```

**User cancels (Ctrl+C)**:
```
\n⚠️  Setup cancelled
No files created.
```

**Config already exists**:
```
⚠️  .llm-conclave.json already exists

Options:
  [o] Overwrite
  [r] Refine existing config (requires --init --refine)
  [c] Cancel

Your choice:
```

### Validation Rules

**Agent names**:
- Must be PascalCase with underscores
- No spaces, special characters except _
- 3-30 characters
- Regex: `^[A-Z][a-zA-Z0-9_]*$`

**Agent structure**:
- Required: name, model, prompt
- Optional: type, role, domains
- Model must be one of: claude-sonnet-4-5, gpt-4o, grok-3

**Config structure**:
- Must have at least 2 agents
- Must have judge configuration
- project_id must match project name

### Testing Strategy

**Unit tests**:
- APIKeyDetector: Mock process.env
- AgentGenerator: Mock LLM responses
- ConfigWriter: Test file creation

**Integration tests**:
- Full flow with mocked LLM
- Invalid JSON handling
- User input simulation

**Manual testing checklist**:
- [ ] No API keys → template fallback
- [ ] With API keys → interactive mode
- [ ] Accept agents → config created
- [ ] Modify agents → allow edits
- [ ] View prompts → display correctly
- [ ] Regenerate → new suggestions
- [ ] Ctrl+C → graceful exit
- [ ] Existing config → prompt to overwrite

---

## Phase 2: Project Scanning

### New Components

#### `src/init/ProjectScanner.js`
Analyzes project directory to provide context for agent generation.

**Methods**:
```javascript
class ProjectScanner {
  constructor(projectPath = process.cwd())

  async scan(timeoutMs = 30000)
  async analyzeProjectType()
  async findKeyFiles()
  async readImportantFiles(files)
  formatForLLM()

  static async shouldScan()  // Prompt user
}
```

**Scanning Strategy**:
1. Check for key indicator files:
   - `package.json` → Node.js project
   - `requirements.txt` → Python project
   - `pom.xml` → Java project
   - `Cargo.toml` → Rust project
   - `README.md` → Project description

2. Read up to 5 important files (truncated to 500 chars each)

3. Analyze structure:
   - Count directories: `src/`, `tests/`, `components/`, etc.
   - Detect frameworks: React, Vue, Express, Django, etc.
   - Identify domain: web, mobile, data, ML, etc.

4. Format summary:
```
PROJECT SCAN RESULTS:
Type: Node.js web application
Framework: React + Express
Structure: Frontend (src/components) + Backend (api/)
Key files: package.json, README.md
Domains: E-commerce, user authentication
```

### Updated User Flow

**Step 3.5: Optional scanning**

```
Tell me about your project:
> [User enters description]

I can analyze your project directory to better understand your needs.
This will scan key files (README, package.json, etc.) and take ~20 seconds.

Scan project? (y/n): y

[Scanning... ⠋]
✓ Scanned 15 files in 8 seconds

I see: Node.js project, React frontend, Express API, e-commerce focus
```

**AgentGenerator receives both**:
- User description (required)
- Scan results (optional, if provided)

### Integration

```javascript
// In InteractiveInit.js

async run(options = {}) {
  // ... existing steps ...

  const description = await this.promptProjectDescription();

  // NEW: Optional scanning
  let scanContext = null;
  if (await ProjectScanner.shouldScan()) {
    const scanner = new ProjectScanner();
    scanContext = await scanner.scan();
    console.log(`\n✓ ${scanContext.summary}\n`);
  }

  const agents = await this.agentGenerator.generateAgents(
    description,
    scanContext  // Pass to LLM
  );

  // ... rest of flow ...
}
```

### CLI Arguments

```bash
llm-conclave --init                    # Interactive, ask about scanning
llm-conclave --init --scan             # Force scanning
llm-conclave --init --no-scan          # Skip scanning
llm-conclave --init --scan-timeout 60  # Custom timeout (seconds)
```

---

## Phase 3: Refinement & Polish

### New Features

#### 1. Refinement Mode

**Allow modifying existing configs**:

```bash
llm-conclave --init --refine
```

**Flow**:
```
Detected existing config with 4 agents:
  • Brand_Strategist
  • Product_Mapper
  • Growth_Lead
  • Compliance

What would you like to do?
  [a] Add new agents
  [r] Remove agents
  [m] Modify agent prompts
  [g] Regenerate all agents
  [c] Cancel

Your choice: a

What type of agent do you need?
> I need a technical architect for API design decisions

[Generates 1 new agent based on request]

Here's the proposed agent:
┌─────────────────────────────────────────┐
│ Tech_Architect (GPT-4o)                 │
│ API design, system architecture         │
└─────────────────────────────────────────┘

Add this agent? (y/n): y

✓ Updated .llm-conclave.json (5 agents)
```

#### 2. Setup Conversation Log

**Save the entire setup conversation**:

```
.conclave/
└── init-conversation.md
```

**Contents**:
```markdown
# Setup Conversation - 2025-11-28

## Project Description
I'm building a SaaS product for task management...

## Generated Agents
- Product_Strategist (Claude Sonnet 4.5)
- Tech_Architect (GPT-4o)
- ...

## User Modifications
- Added: Compliance_Advisor
- Modified: Product_Strategist prompt (more focus on B2B)

## Final Configuration
[Full config JSON]
```

**Benefits**:
- User can see reasoning later
- Helpful for onboarding team members
- Track evolution of agent setup

#### 3. Progress Indicators

Replace simple "Thinking..." with rich progress:

```javascript
const ora = require('ora');  // Popular spinner library

const spinner = ora('Analyzing your project...').start();

// After each step
spinner.text = 'Generating agent recommendations...';
spinner.succeed('Generated 4 specialized agents');
```

#### 4. Better Agent Modification UI

**Current menu**:
```
[m] Modify agents
```

**Enhanced**:
```
Which agent would you like to modify?
  1. Product_Strategist
  2. Tech_Architect
  3. Growth_Lead
  4. Compliance
  5. Add new agent
  6. Remove an agent
  0. Back to main menu

Choice: 2

Modify Tech_Architect:
  [n] Change name
  [m] Change model
  [p] Edit prompt
  [d] Edit domains
  [r] Regenerate this agent
  [x] Remove this agent
  [b] Back

Choice: p

Current prompt:
"You are a Tech_Architect advisor specializing in..."

Enter new prompt (or press Enter to keep current):
> [User enters new prompt or edits current]

✓ Updated Tech_Architect prompt
```

#### 5. Smart Defaults

**Detect project context without full scan**:

```javascript
// Quick heuristics
if (fs.existsSync('package.json')) {
  defaultAgents.push('Tech_Lead');
}

if (fs.existsSync('marketing/') || fs.existsSync('content/')) {
  defaultAgents.push('Marketing_Strategist');
}

if (description.includes('e-commerce') || description.includes('shop')) {
  defaultAgents.push('Product_Manager');
}
```

#### 6. Presets

**Quick start templates**:

```bash
llm-conclave --init --preset saas
llm-conclave --init --preset ecommerce
llm-conclave --init --preset agency
```

**Presets**:
- `saas`: Product, Engineering, Growth, Customer_Success
- `ecommerce`: Brand, Product, Marketing, Compliance
- `agency`: Creative, Strategy, Account, Production
- `consulting`: Strategy, Operations, Finance, Risk

---

## File Structure Summary

```
llm_conclave/
├── src/
│   ├── init/                          # NEW
│   │   ├── InteractiveInit.js         # Phase 1
│   │   ├── APIKeyDetector.js          # Phase 1
│   │   ├── AgentGenerator.js          # Phase 1
│   │   ├── PromptBuilder.js           # Phase 1
│   │   ├── ConfigWriter.js            # Phase 1
│   │   ├── ProjectScanner.js          # Phase 2
│   │   ├── RefinementMode.js          # Phase 3
│   │   └── Presets.js                 # Phase 3
│   ├── core/
│   ├── memory/
│   ├── orchestration/
│   └── ...
├── index.js                           # Modified: --init handler
└── ...
```

---

## CLI Arguments Reference

```bash
# Basic
llm-conclave --init                           # Interactive setup
llm-conclave --init my-project                # With project name
llm-conclave --init --template-only           # Skip interactive, create template

# Phase 2: Scanning
llm-conclave --init --scan                    # Force project scan
llm-conclave --init --no-scan                 # Skip scanning
llm-conclave --init --scan-timeout 60         # Custom timeout

# Phase 3: Advanced
llm-conclave --init --refine                  # Modify existing config
llm-conclave --init --preset saas             # Use preset
llm-conclave --init --model gpt-4o            # Choose setup LLM
llm-conclave --init --save-conversation       # Save setup log
llm-conclave --init --agents 5                # Request specific number
```

---

## Configuration Schema Extension

**Add metadata to track setup**:

```json
{
  "project_id": "my-startup",
  "created": "2025-11-28T12:00:00Z",
  "created_by": "interactive_init",
  "setup_conversation": ".conclave/init-conversation.md",

  "agents": { ... },
  "judge": { ... }
}
```

---

## Dependencies

**New dependencies needed**:

```json
{
  "dependencies": {
    "ora": "^6.0.0",           // Spinner for progress
    "chalk": "^5.0.0",         // Colors for terminal output
    "prompts": "^2.4.0"        // Better than readline for menus
  }
}
```

**Or keep it minimal**: Use only built-in `readline` for now, add fancy UI later.

---

## Migration Path

**For existing users**:

```bash
# Old way (still works)
llm-conclave --init
# → Creates template .llm-conclave.json

# New way (if API keys present)
llm-conclave --init
# → Interactive agent generation

# Force old behavior
llm-conclave --init --template-only
```

---

## Success Metrics

**User experience**:
- [ ] Time to first working config: < 3 minutes
- [ ] User understands what agents do: Yes (clear descriptions)
- [ ] No manual JSON editing needed: Yes (unless user wants to)

**Technical**:
- [ ] Works without API keys (fallback)
- [ ] Works in any directory
- [ ] Handles interrupts gracefully (Ctrl+C)
- [ ] Generated configs are always valid

**Adoption**:
- [ ] Reduces setup friction significantly
- [ ] Users actually use the generated agents (vs editing heavily)
- [ ] Positive feedback on agent quality

---

## Testing Plan

### Phase 1 Tests

```javascript
// test/init/InteractiveInit.test.js
describe('InteractiveInit', () => {
  it('detects API keys correctly')
  it('prompts for project name')
  it('generates valid agents from description')
  it('writes config file correctly')
  it('initializes project memory')
  it('handles no API keys gracefully')
  it('validates agent structure')
  it('handles user cancellation')
});
```

### Manual Test Scenarios

**Scenario 1: Happy path**
1. Run `llm-conclave --init`
2. Enter project name: "test-project"
3. Enter description: "Building a mobile app for fitness tracking"
4. Accept generated agents
5. Verify config created
6. Verify project memory created
7. Run first command successfully

**Scenario 2: No API keys**
1. Unset all API keys
2. Run `llm-conclave --init`
3. Should create template config
4. Should print helpful message about API keys

**Scenario 3: Modify agents**
1. Run init
2. Choose "modify agents"
3. Remove one agent
4. Add custom agent
5. Accept
6. Verify config has correct agents

**Scenario 4: Existing config**
1. Create `.llm-conclave.json`
2. Run `llm-conclave --init`
3. Should detect existing config
4. Should offer overwrite option

---

## Documentation Updates

**Update README.md**:
- Add "Quick Start" section with `--init`
- Show interactive setup flow
- Remove manual config instructions (move to "Advanced")

**Update ORCHESTRATION.md**:
- Update setup instructions
- Show new init flow
- Keep manual config as "Advanced Setup"

**New doc: INIT_GUIDE.md**:
- Detailed guide for init system
- How to customize generated agents
- Tips for writing good project descriptions
- Troubleshooting

---

## Rollout Plan

### Week 1: Phase 1
- [ ] Build core interactive init
- [ ] Test with various project types
- [ ] Document and commit

### Week 2: Phase 2
- [ ] Add project scanning
- [ ] Test scanning performance
- [ ] Document and commit

### Week 3: Phase 3
- [ ] Add refinement mode
- [ ] Polish UX
- [ ] Add presets
- [ ] Final testing
- [ ] Update all docs
- [ ] Release!

---

## Future Enhancements

**Beyond Phase 3**:

1. **Web UI for init**
   - Visual agent builder
   - Drag-and-drop agent customization
   - Preview conversations

2. **Learning from usage**
   - Track which agent types work best
   - Suggest improvements after N conversations
   - Auto-tune prompts based on outcomes

3. **Team sharing**
   - Export/import agent configs
   - Community agent templates
   - Rating system for agent designs

4. **AI-powered refinement**
   - "My agents aren't working well for X"
   - Analyze conversation history
   - Suggest specific prompt improvements

---

## Open Questions

1. **Should we allow agent editing during init?**
   - Pro: More control
   - Con: Complexity
   - Decision: Phase 3 feature

2. **How many agents should we default to?**
   - Proposal: 3-4 for most projects, max 6
   - Let LLM decide based on project complexity

3. **Should we validate prompts for quality?**
   - E.g., check for specificity, actionable guidance
   - Probably Phase 3 if at all

4. **Handling model unavailability**
   - User has Claude but not GPT-4
   - Generated config wants GPT-4
   - Solution: Substitute with available model + warning

---

## Summary

This plan transforms llm-conclave setup from:
```
❌ Copy config template → Edit 50 lines of JSON → Hope you got it right
```

To:
```
✅ llm-conclave --init → Describe your project → Accept agents → Done
```

**Total implementation time**: ~6-8 hours across 3 phases
**User time savings**: ~15-20 minutes per setup
**Developer experience**: 10x better

Ready to start with Phase 1! 🚀
