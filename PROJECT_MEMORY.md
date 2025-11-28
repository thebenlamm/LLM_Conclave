# Project Memory System

The Project Memory System enables persistent, cross-conversation memory for multi-agent collaborations. Projects can accumulate context, decisions, and agent-specific knowledge over time, making AI advisors more effective for long-running initiatives.

## Core Concepts

**Project**: A named workspace with persistent memory that tracks:
- Core context (overview, goals, constraints)
- Decision history with consensus tracking
- Agent-specific knowledge domains
- Conversation references

**Memory Manager**: The system that loads, saves, and queries project memory

**Agent Memory**: Domain-specific knowledge retained by each agent role

## Quick Start

### 1. Create a New Project

```bash
node index.js --init-project my-company
```

This creates a new project with empty memory stored in `.conclave/projects/my-company.json`

### 2. Run Conversations with Memory

```bash
node index.js --project-id my-company "We need a marketing plan"
```

The system will:
- Load relevant project context
- Inject it into the conversation
- Record the conversation and any decisions

### 3. Continue Building Context

```bash
node index.js --project-id my-company "Based on our marketing plan, what should we prioritize?"
```

Each conversation builds on previous discussions. The agents can reference prior decisions and context.

### 4. View Project Information

```bash
# List all projects
node index.js --list-projects

# View specific project details
node index.js --project-info my-company
```

## CLI Commands

### Project Management

```bash
# Create a new project
node index.js --init-project <project-id>

# List all projects
node index.js --list-projects

# View project details
node index.js --project-info <project-id>

# Delete a project
node index.js --delete-project <project-id>
```

### Running Conversations

```bash
# Use project memory in a conversation
node index.js --project-id <project-id> "your task"

# Combine with file context
node index.js --project-id my-company --project ./src "Review this code"

# Use custom config
node index.js --config custom-config.json --project-id my-company "your task"
```

## Memory Structure

Projects store:

```json
{
  "projectId": "my-company",
  "created": "2025-11-28T...",
  "lastModified": "2025-11-28T...",

  "coreContext": {
    "overview": "Brief project description",
    "goals": ["Goal 1", "Goal 2"],
    "constraints": ["Constraint 1"],
    "targetAudience": "Description of target users",
    "customFields": {}
  },

  "decisions": [
    {
      "id": "decision_...",
      "timestamp": "...",
      "topic": "Marketing Strategy",
      "description": "...",
      "participants": ["Brand_Architect", "Growth_Strategist"],
      "validators": ["Compliance"],
      "consensusReached": true,
      "outcome": "Final decision text",
      "tags": ["marketing", "launch"]
    }
  ],

  "agentMemory": {
    "Brand_Architect": {
      "pastDecisions": [...],
      "domainKnowledge": {...},
      "preferences": {...}
    }
  },

  "conversationReferences": [
    {
      "id": "conversation_...",
      "timestamp": "...",
      "task": "Original task",
      "agents": ["Agent1", "Agent2"],
      "consensusReached": true,
      "rounds": 3
    }
  ],

  "metadata": {
    "totalConversations": 5,
    "totalDecisions": 3,
    "agentParticipation": {
      "Brand_Architect": 5,
      "Product_Mapper": 4
    }
  }
}
```

## Use Cases

### Business Advisory

Create specialized agents (Brand, Product, Growth, Compliance) that accumulate business knowledge:

```bash
# Set up business advisor project
node index.js --init-project skincare-co

# First conversation - naming
node index.js --project-id skincare-co "Name our first product line"

# Later - pricing strategy (builds on naming decision)
node index.js --project-id skincare-co "How should we price the Lunara line?"

# Later - launch plan (references all previous decisions)
node index.js --project-id skincare-co "Create our launch timeline"
```

### Software Development

Track architectural decisions and implementation context:

```bash
# Set up dev project
node index.js --init-project auction-site

# Architecture discussion
node index.js --project-id auction-site "Design our API structure"

# Implementation builds on architecture
node index.js --project-id auction-site --project ./src "Implement the bidding API"

# Testing references implementation decisions
node index.js --project-id auction-site "Create test plan for bidding system"
```

## How Memory is Injected

When you run a conversation with `--project-id`, the system:

1. **Loads project memory** from `.conclave/projects/<id>.json`
2. **Extracts relevant context**:
   - Core project overview, goals, constraints
   - Recent decisions related to the task
   - Agent-specific knowledge (if applicable)
3. **Injects into conversation** before the task description
4. **Records the conversation** after completion, updating metadata

This happens transparently - the agents receive the context as part of their initial prompt.

## Advanced Usage

### Programmatic Access

You can use the memory system programmatically:

```javascript
const MemoryManager = require('./src/memory/MemoryManager');

// Create or load project
const manager = new MemoryManager();
await manager.createProject('my-project', {
  overview: 'AI-powered task manager',
  goals: ['Simplify task management', 'AI-driven prioritization']
});

// Record a decision
await manager.recordDecision({
  topic: 'Tech Stack',
  description: 'Choosing technologies',
  outcome: 'React + Node.js + PostgreSQL',
  participants: ['CTO', 'Backend_Engineer'],
  consensusReached: true
});

// Query memory
const relevantMemory = manager.getRelevantMemory('API design task');
const decisions = manager.getDecisions({ topic: 'Tech Stack' });
```

### Integration with ConversationManager

```javascript
const ConversationManager = require('./src/core/ConversationManager');
const MemoryManager = require('./src/memory/MemoryManager');

// Load project memory
const memoryManager = new MemoryManager();
await memoryManager.loadProject('my-project');

// Pass to conversation manager
const conversationManager = new ConversationManager(config, memoryManager);

// Memory is automatically injected and recorded
const result = await conversationManager.startConversation(task, judge);
```

## File Locations

- **Memory Storage**: `.conclave/projects/`
- **Project Files**: `.conclave/projects/<project-id>.json`
- **Outputs**: `outputs/` (conversation transcripts, unchanged)

## Roadmap

Future enhancements could include:

- **Semantic search** across conversation history
- **Decision tagging** for better organization
- **Agent learning** from past successes/failures
- **Cross-project patterns** extraction
- **Conflict detection** when decisions contradict
- **Export/import** for collaboration
- **Web UI** for browsing project memory

## Example: Complete Workflow

```bash
# 1. Initialize project
node index.js --init-project wellness-app

# 2. Define brand identity
node index.js --project-id wellness-app "Define our brand voice and target audience"

# 3. Design features (references brand decisions)
node index.js --project-id wellness-app "What features should we build first?"

# 4. Plan technical architecture (references features)
node index.js --project-id wellness-app "Design the system architecture"

# 5. Check project history
node index.js --project-info wellness-app

# Output shows:
# - 3 conversations
# - Agent participation stats
# - Recent decisions
```

## Notes

- Project memory is **local** and stored in your working directory
- Use **descriptive project IDs** (e.g., `skincare-launch-2025` not `project1`)
- Memory grows over time - consider archiving old projects
- The system does not currently auto-summarize long histories (coming soon)

---

For more information on configuring agents and judges, see the main README.md.
