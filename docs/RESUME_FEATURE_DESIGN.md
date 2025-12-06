# Resume & Continuation Feature - Design Document

**Version:** 1.0
**Date:** December 6, 2025
**Status:** Design Phase

---

## Executive Summary

This document outlines the design for a **Resume & Continuation** feature in LLM Conclave, enabling users to continue previous conversations with follow-up questions or resume interrupted sessions. This feature addresses a critical gap in user workflow where multi-turn discussions with the Conclave require maintaining context across separate invocations.

---

## 1. Problem Statement

### Current Limitations
- Users cannot ask follow-up questions to a completed Conclave discussion
- No way to continue a conversation that was interrupted (Ctrl+C, crash, timeout)
- Users must manually copy/paste previous context into new prompts
- Large conversation histories quickly exceed token limits when manually included
- Loss of agent-specific context and reasoning chains

### User Pain Points
1. **Follow-up Questions**: "The Conclave evaluated my idea - now I want to ask them to elaborate on specific points"
2. **Interrupted Sessions**: "My iterative session crashed at chunk 15 - I need to resume without starting over"
3. **Iterative Refinement**: "Based on the Conclave's feedback, I want to present a revised version of my idea"
4. **Deep Dives**: "The agents mentioned scalability concerns - I want them to explore just that aspect in detail"

---

## 2. Feature Overview

### Core Capabilities

1. **Conversation Continuation** (Primary Use Case)
   - Load a previous completed conversation
   - Add new user messages/questions
   - Agents see full history and can reference previous discussion
   - Generate new rounds based on follow-up context

2. **Session Resume** (Secondary Use Case)
   - Resume interrupted sessions from exact breakpoint
   - Primarily for iterative/orchestrated modes
   - Restore agent states, tool execution history, file states

3. **Conversation Branching** (Future Enhancement)
   - Create alternate discussion paths from any point
   - Explore different angles without losing original thread

---

## 3. User Experience

### 3.1 CLI Interface

#### Basic Continuation
```bash
# Continue most recent conversation
llm-conclave --continue "Follow-up: Can you elaborate on the scalability concerns?"

# Continue specific conversation by ID
llm-conclave --resume <session-id> "What about using a database instead of files?"

# Continue from file path
llm-conclave --resume ./outputs/conclave-2025-12-06T20-42-25-full.json \
  "Based on your feedback, here's my revised approach: [...]"

# List available sessions to resume
llm-conclave --list-sessions
```

#### Advanced Options
```bash
# Resume with different agents
llm-conclave --resume <session-id> --models gpt-4o,claude-sonnet-4-5 "Question"

# Resume but start fresh discussion (context-only)
llm-conclave --resume <session-id> --reset-discussion "New question"

# Resume and force new consensus attempt
llm-conclave --resume <session-id> --force-consensus "Question"

# Resume iterative mode from specific chunk
llm-conclave --resume <session-id> --start-chunk 5
```

#### Session Management
```bash
# List all saved sessions
llm-conclave --list-sessions

# Show details of a session
llm-conclave --show-session <session-id>

# Delete old sessions
llm-conclave --delete-session <session-id>

# Clean up sessions older than N days
llm-conclave --cleanup-sessions --older-than 30
```

### 3.2 Interactive Prompts

When running `--continue` without parameters:
```
Found 5 recent sessions:

1. [2025-12-06 20:42] "Evaluate AI brain idea..." (Consensus, 1 round)
2. [2025-12-06 18:30] "Review authentication code" (Orchestrated, 3 rounds)
3. [2025-12-05 14:22] "OCR correction task" (Iterative, 8/10 chunks)
4. [2025-12-05 10:15] "Design API architecture" (Consensus, 2 rounds)
5. [2025-12-04 16:45] "Refactor user module" (Orchestrated, completed)

Which session would you like to continue? (1-5, or 'q' to quit): _
```

---

## 4. Technical Design

### 4.1 Data Structures

#### Session Manifest
```typescript
interface SessionManifest {
  // Identity
  id: string;                    // e.g., "session_20251206_204225_a3f2"
  timestamp: string;              // ISO 8601

  // Configuration
  mode: 'consensus' | 'orchestrated' | 'iterative';
  task: string;                   // Original user task
  agents: AgentConfig[];          // Model names, providers, system prompts
  judge?: AgentConfig;            // For orchestrated/iterative modes

  // State
  status: 'in_progress' | 'completed' | 'interrupted' | 'error';
  currentRound: number;
  maxRounds?: number;

  // Content
  conversationHistory: Message[];
  projectContext?: string;

  // Mode-specific state
  iterativeState?: {
    currentChunk: number;
    totalChunks: number;
    agentNotes: Record<string, string>;  // Agent name -> notes file content
    sharedOutput: string;
  };

  orchestratedState?: {
    toolExecutions: ToolExecution[];
    fileStates: Record<string, string>;  // File path -> content hash
  };

  // Results
  consensusReached?: boolean;
  finalSolution?: string;

  // Metadata
  cost: {
    totalCost: number;
    totalTokens: { input: number; output: number };
    totalCalls: number;
  };

  // Lineage (for branching)
  parentSessionId?: string;
  branchPoint?: number;           // Round number where branch occurred

  // File paths
  outputFiles: {
    transcript: string;
    consensus: string;
    json: string;
    agentNotes?: string[];
    sharedOutput?: string;
  };
}
```

#### Message Format (Enhanced)
```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'judge';
  content: string;
  speaker?: string;               // Agent name
  model?: string;                 // Model identifier
  timestamp: string;
  roundNumber: number;

  // Tool usage
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];

  // Metadata
  tokens?: { input: number; output: number };
  cost?: number;
  latency?: number;

  // Resume context
  isContinuation?: boolean;       // Added during resume
  continuationContext?: string;   // User's follow-up
}
```

### 4.2 Storage Architecture

#### Directory Structure
```
.llm-conclave/
├── sessions/
│   ├── manifest.json              # Index of all sessions
│   ├── session_20251206_204225_a3f2/
│   │   ├── session.json           # Full SessionManifest
│   │   ├── conversation.json      # Message history
│   │   ├── agent_notes/           # Agent state files (iterative)
│   │   │   ├── Hebrew_Specialist_notes.md
│   │   │   └── Textual_Validator_notes.md
│   │   ├── outputs/               # Generated outputs
│   │   │   ├── transcript.md
│   │   │   ├── consensus.md
│   │   │   └── shared_output.md
│   │   └── checkpoints/           # Auto-save checkpoints
│   │       ├── checkpoint_r1.json
│   │       ├── checkpoint_r2.json
│   │       └── checkpoint_r3.json
│   └── session_20251206_183045_b7e9/
│       └── ...
└── config/
    └── retention.json             # Cleanup policies
```

#### Session Manifest Index
```json
{
  "sessions": [
    {
      "id": "session_20251206_204225_a3f2",
      "timestamp": "2025-12-06T20:42:25.000Z",
      "mode": "consensus",
      "task": "Evaluate AI brain idea...",
      "status": "completed",
      "roundCount": 1,
      "agentCount": 5,
      "cost": 0.0234
    }
  ],
  "lastCleanup": "2025-12-06T00:00:00.000Z",
  "totalSessions": 127,
  "totalSize": "145MB"
}
```

### 4.3 Core Components

#### SessionManager Class
```typescript
class SessionManager {
  private sessionsDir: string;
  private manifestPath: string;

  /**
   * Save a session to disk
   */
  async saveSession(session: SessionManifest): Promise<string>;

  /**
   * Load a session by ID
   */
  async loadSession(sessionId: string): Promise<SessionManifest>;

  /**
   * List all available sessions with filters
   */
  async listSessions(filters?: {
    mode?: string;
    status?: string;
    since?: Date;
    limit?: number;
  }): Promise<SessionSummary[]>;

  /**
   * Find most recent session
   */
  async getMostRecentSession(): Promise<SessionManifest>;

  /**
   * Delete a session and its files
   */
  async deleteSession(sessionId: string): Promise<void>;

  /**
   * Create checkpoint (auto-save during long sessions)
   */
  async createCheckpoint(sessionId: string, roundNumber: number): Promise<void>;

  /**
   * Load checkpoint
   */
  async loadCheckpoint(sessionId: string, roundNumber: number): Promise<SessionManifest>;

  /**
   * Clean up old sessions based on retention policy
   */
  async cleanupOldSessions(policy: RetentionPolicy): Promise<CleanupReport>;

  /**
   * Create a branch from existing session
   */
  async branchSession(
    parentSessionId: string,
    branchPoint: number,
    newTask: string
  ): Promise<string>;
}
```

#### ContinuationHandler Class
```typescript
class ContinuationHandler {
  /**
   * Prepare session for continuation
   */
  async prepareForContinuation(
    session: SessionManifest,
    followUpTask: string,
    options?: ContinuationOptions
  ): Promise<ResumableSession>;

  /**
   * Merge continuation into conversation history
   */
  mergeContinuationContext(
    existingHistory: Message[],
    followUpTask: string
  ): Message[];

  /**
   * Restore agent states (for iterative mode)
   */
  async restoreAgentStates(session: SessionManifest): Promise<Map<string, string>>;

  /**
   * Validate session can be resumed
   */
  validateResumable(session: SessionManifest): {
    canResume: boolean;
    reason?: string;
    warnings?: string[];
  };

  /**
   * Generate continuation prompt for agents
   */
  generateContinuationPrompt(
    originalTask: string,
    previousSolution: string,
    followUpTask: string
  ): string;
}
```

#### ConversationManager (Enhanced)
```typescript
class ConversationManager {
  // Existing methods...

  /**
   * Resume a conversation from saved state
   */
  async resumeConversation(
    session: SessionManifest,
    followUpTask: string,
    options?: ResumeOptions
  ): Promise<ConversationResult>;

  /**
   * Save conversation state (called periodically)
   */
  async saveState(sessionId: string): Promise<void>;
}
```

### 4.4 Resume Flow

#### Consensus Mode Resume Flow
```
1. User: llm-conclave --resume <id> "Follow-up question"
   ↓
2. Load SessionManifest from disk
   ↓
3. Validate session is resumable
   ↓
4. Extract: original task, conversation history, final solution
   ↓
5. Generate continuation prompt:
   "Previously you discussed: [task]
    You reached this conclusion: [solution]

    NEW FOLLOW-UP: [user's question]

    Please address the follow-up while considering your previous discussion."
   ↓
6. Initialize agents with same models/prompts as original
   ↓
7. Seed conversation with:
   - System message: "This is a continuation of previous session [id]"
   - User message: Continuation prompt
   ↓
8. Run conversation with access to full history
   ↓
9. Save as new session linked to parent
   ↓
10. Output results with reference to original session
```

#### Iterative Mode Resume Flow
```
1. User: llm-conclave --resume <id> --start-chunk 5
   ↓
2. Load SessionManifest + agent notes + shared output
   ↓
3. Restore agent state files to working directory
   ↓
4. Initialize IterativeCollaborativeOrchestrator with:
   - startChunk = 5
   - Existing conversation history
   - Restored agent notes
   - Restored shared output
   ↓
5. Continue from chunk 5 as if never interrupted
   ↓
6. Update same session (not create new one)
   ↓
7. Mark session status as 'completed' when done
```

---

## 5. Implementation Phases

### Phase 1: Basic Session Persistence (Week 1)
**Goal:** Save all conversations to disk automatically

- [ ] Create `SessionManager` class
- [ ] Create `.llm-conclave/sessions/` directory structure
- [ ] Modify `ConversationManager` to save sessions after completion
- [ ] Save `SessionManifest` with all conversation data
- [ ] No resume capability yet - just persistence

**Testing:**
- Run conversations and verify sessions are saved
- Validate JSON structure
- Test across all three modes

### Phase 2: List & Inspect Sessions (Week 1)
**Goal:** Users can browse saved sessions

- [ ] Implement `--list-sessions` command
- [ ] Implement `--show-session <id>` command
- [ ] Add session summary formatting
- [ ] Add interactive session picker

**Testing:**
- List sessions with various filters
- Inspect individual sessions
- Verify output formatting

### Phase 3: Basic Continuation (Week 2)
**Goal:** Resume consensus mode conversations

- [ ] Create `ContinuationHandler` class
- [ ] Implement `--continue` flag for most recent session
- [ ] Implement `--resume <id>` flag for specific session
- [ ] Generate continuation prompts
- [ ] Merge conversation histories
- [ ] Create linked session (parent reference)

**Testing:**
- Resume consensus mode conversations
- Test with various follow-up questions
- Verify agents reference previous discussion
- Test edge cases (empty history, interrupted sessions)

### Phase 4: Iterative Mode Resume (Week 2-3)
**Goal:** Resume interrupted iterative sessions

- [ ] Enhance `SessionManifest` with iterative state
- [ ] Save/restore agent notes files
- [ ] Save/restore shared output
- [ ] Implement `--start-chunk` with resume
- [ ] Auto-detect interruption and offer resume

**Testing:**
- Interrupt iterative sessions at various points
- Resume and verify continuation
- Test agent state preservation
- Verify shared output consistency

### Phase 5: Orchestrated Mode Resume (Week 3)
**Goal:** Resume orchestrated sessions with tool state

- [ ] Save tool execution history
- [ ] Save file state snapshots
- [ ] Restore working directory state
- [ ] Handle file conflicts on resume

**Testing:**
- Resume orchestrated sessions mid-execution
- Verify file states are restored
- Test with various tool types

### Phase 6: Auto-Save Checkpoints (Week 4)
**Goal:** Automatic checkpointing during long sessions

- [ ] Implement checkpoint creation every N rounds
- [ ] Save lightweight checkpoints (not full copies)
- [ ] Detect crashes and offer resume from checkpoint
- [ ] Add `--checkpoint-interval` flag

**Testing:**
- Run long sessions and verify checkpoints
- Force crashes and test recovery
- Verify checkpoint file sizes

### Phase 7: Session Management (Week 4)
**Goal:** Cleanup and maintenance

- [ ] Implement `--delete-session`
- [ ] Implement `--cleanup-sessions --older-than N`
- [ ] Add retention policies to config
- [ ] Add disk space warnings
- [ ] Implement session archival (compress old sessions)

**Testing:**
- Delete individual sessions
- Cleanup with various policies
- Verify file removal
- Test disk space monitoring

### Phase 8: Advanced Features (Future)
**Goal:** Power user features

- [ ] Session branching (`--branch-from <id> --at-round N`)
- [ ] Diff between sessions
- [ ] Export/import sessions
- [ ] Session search by content
- [ ] Session tagging/categorization
- [ ] Web UI for session browsing

---

## 6. Configuration

### User Configuration (.llm-conclave.yaml)
```yaml
session:
  # Auto-save settings
  autoSave: true
  saveLocation: ".llm-conclave/sessions"

  # Checkpointing
  enableCheckpoints: true
  checkpointInterval: 5  # rounds

  # Retention
  retention:
    maxSessions: 500
    maxAge: 90  # days
    maxSize: "1GB"
    deleteOnCleanup: true  # vs archive

  # Resume defaults
  resumeDefaults:
    resetDiscussion: false
    forceConsensus: false
    includeFullHistory: true
```

---

## 7. User Interface Examples

### Example 1: Basic Follow-up
```bash
$ llm-conclave "Evaluate my AI brain idea..."
[... discussion happens ...]
✓ Consensus reached!
Session saved: session_20251206_204225_a3f2

$ llm-conclave --continue "Can you elaborate on the scalability concerns?"
→ Loading session session_20251206_204225_a3f2...
→ Continuing discussion with 5 agents...

[Architect]: In our previous discussion, I mentioned scalability issues...
[... continuation ...]

✓ Follow-up discussion complete!
Session saved: session_20251206_210834_f8a1 (parent: session_20251206_204225_a3f2)
```

### Example 2: Resume Interrupted Iterative Session
```bash
$ llm-conclave --iterative --project oz.txt "Fix OCR errors"
[... processing chunks 1-7 ...]
^C
✗ Interrupted at chunk 7/15

$ llm-conclave --resume
→ Detected interrupted session: session_20251206_145523_c2d8
→ Task: "Fix OCR errors" (Iterative mode)
→ Progress: 7/15 chunks completed
→ Resume from chunk 8? [Y/n]: y

→ Restoring agent states...
→ Resuming from chunk 8...

[... continues from chunk 8 ...]

✓ All chunks completed!
Session session_20251206_145523_c2d8 marked complete.
```

### Example 3: List & Select Session
```bash
$ llm-conclave --list-sessions --mode consensus --limit 5

Recent Consensus Sessions:
1. [Dec 6, 8:42 PM] "Evaluate AI brain idea..."
   Status: Completed | Rounds: 1 | Cost: $0.023

2. [Dec 6, 6:30 PM] "Design API architecture"
   Status: Completed | Rounds: 2 | Cost: $0.045

3. [Dec 5, 2:22 PM] "Review security approach"
   Status: Completed | Rounds: 3 | Cost: $0.067

$ llm-conclave --resume 2 "What about authentication?"
→ Loading session "Design API architecture"...
→ Continuing discussion...
[...]
```

---

## 8. Technical Considerations

### 8.1 Token Management
**Challenge:** Full conversation histories can exceed context windows

**Solutions:**
- **Summarization**: Summarize older rounds, keep recent rounds verbatim
- **Selective History**: Only include relevant messages based on follow-up
- **Compression**: Use structured summaries for agent responses
- **Windowing**: Keep only last N rounds + initial task + final solution

**Implementation:**
```typescript
interface HistoryCompressionStrategy {
  compress(
    history: Message[],
    maxTokens: number
  ): Message[];
}

class SlidingWindowStrategy implements HistoryCompressionStrategy {
  // Keep first N + last N messages, summarize middle
}

class RelevanceStrategy implements HistoryCompressionStrategy {
  // Keep only messages relevant to follow-up query
}
```

### 8.2 Agent Consistency
**Challenge:** Models may change between sessions

**Solutions:**
- **Save Model Versions**: Store exact model IDs in session
- **Version Warnings**: Warn if model has been updated
- **Model Pinning**: Allow users to pin specific model versions
- **Fallback Strategy**: Use closest available model if original unavailable

**Implementation:**
```typescript
interface ModelVersion {
  provider: string;
  modelName: string;
  version?: string;  // e.g., "2025-11-20"
  apiVersion?: string;
}

// On resume:
const warning = checkModelCompatibility(
  session.agents[0].model,
  currentlyAvailableModels
);
if (warning) {
  console.warn(`Model changed: ${warning}`);
}
```

### 8.3 File State Management (Orchestrated Mode)
**Challenge:** Files may have changed since original session

**Solutions:**
- **Content Hashing**: Track file hashes, detect changes
- **Snapshot Mode**: Save copies of all accessed files
- **Conflict Detection**: Warn if files changed since session
- **Merge Strategy**: Ask user how to handle conflicts

**Implementation:**
```typescript
interface FileSnapshot {
  path: string;
  contentHash: string;
  timestamp: string;
  content?: string;  // Optional full snapshot
}

async function detectFileConflicts(
  session: SessionManifest
): Promise<FileConflict[]> {
  const conflicts: FileConflict[] = [];
  for (const snapshot of session.orchestratedState.fileStates) {
    const currentHash = await hashFile(snapshot.path);
    if (currentHash !== snapshot.contentHash) {
      conflicts.push({
        path: snapshot.path,
        originalHash: snapshot.contentHash,
        currentHash: currentHash
      });
    }
  }
  return conflicts;
}
```

### 8.4 Cost Tracking
**Challenge:** Resume sessions have cumulative costs

**Solutions:**
- Track costs per session and per continuation
- Show cumulative cost across session lineage
- Warn before resuming expensive sessions
- Add cost limits to prevent runaway costs

**Implementation:**
```typescript
interface SessionCostTracking {
  sessionCost: number;        // This session only
  cumulativeCost: number;     // Including all parents
  costByRound: number[];
  costByAgent: Record<string, number>;
}

function calculateLineageCost(sessionId: string): number {
  let total = 0;
  let current = loadSession(sessionId);
  while (current) {
    total += current.cost.totalCost;
    current = current.parentSessionId
      ? loadSession(current.parentSessionId)
      : null;
  }
  return total;
}
```

### 8.5 Storage Optimization
**Challenge:** Session files can grow large

**Solutions:**
- **Compression**: Gzip old sessions automatically
- **Deduplication**: Share common data between sessions
- **Lazy Loading**: Don't load full history unless needed
- **Tiered Storage**: Keep recent in fast storage, archive old to slow storage

**Space Estimates:**
- Small session (1 round, 5 agents): ~50KB
- Medium session (3 rounds, 5 agents): ~200KB
- Large iterative session (15 chunks, 5 agents): ~2MB
- Expected: ~100MB per 500 sessions

---

## 9. Error Handling

### Session Not Found
```
Error: Session 'session_abc123' not found.

Available recent sessions:
  - session_20251206_204225_a3f2: "Evaluate AI brain idea..."
  - session_20251206_183045_b7e9: "Review authentication code"

Run 'llm-conclave --list-sessions' to see all sessions.
```

### Session Corrupted
```
Error: Session 'session_20251206_204225_a3f2' appears to be corrupted.

Details:
  - Missing conversation history
  - JSON parse error at line 142

Try:
  - llm-conclave --recover-session session_20251206_204225_a3f2
  - llm-conclave --list-sessions (to find other sessions)
```

### Model Unavailable
```
Warning: Original model 'gpt-4o' from session no longer available.

Options:
  1. Continue with 'gpt-4o' (current version may differ)
  2. Use 'gpt-4' instead
  3. Specify different models with --models

Continue? [y/N]:
```

### File Conflicts (Orchestrated)
```
Warning: Files have changed since original session:

  ✗ src/auth.ts (modified)
  ✗ src/db.ts (deleted)
  ✓ src/api.ts (unchanged)

Options:
  1. Continue anyway (may cause inconsistencies)
  2. Restore files from snapshot
  3. Cancel resume

Choice [1-3]:
```

---

## 10. Success Metrics

### Adoption Metrics
- **Usage Rate**: % of users who use `--continue` at least once
- **Follow-up Rate**: % of sessions that have follow-ups
- **Session Count**: Average number of sessions per user

### Quality Metrics
- **Resume Success Rate**: % of resume attempts that complete successfully
- **Context Preservation**: User satisfaction with agents' memory of previous context
- **Error Rate**: % of resume attempts that fail

### Performance Metrics
- **Resume Latency**: Time to load and prepare session for continuation
- **Storage Growth**: Disk space used per session
- **Cost Impact**: Additional token costs from context loading

### Target Metrics (6 months post-launch)
- 40% of users try `--continue` feature
- 25% of sessions have at least one follow-up
- <5% resume error rate
- <2 second resume latency
- <100MB storage per user

---

## 11. Future Enhancements

### Session Collaboration
- Share sessions with other users
- Collaborative follow-ups (multiple users continuing same session)
- Session permissions and access control

### Advanced Branching
```bash
# Create multiple branches from same session
llm-conclave --branch-from <id> --at-round 2 "Explore approach A"
llm-conclave --branch-from <id> --at-round 2 "Explore approach B"

# Compare branches
llm-conclave --diff-sessions <branch-a> <branch-b>

# Merge insights from branches
llm-conclave --merge-sessions <branch-a> <branch-b> "Synthesize best approach"
```

### Smart Context Selection
- AI-powered selection of relevant history
- Automatic summarization of less relevant rounds
- Intelligent prompt compression

### Session Analytics
```bash
# Analyze session patterns
llm-conclave --analyze-session <id>

Output:
  - Consensus patterns
  - Agent agreement/disagreement metrics
  - Topic drift analysis
  - Cost breakdown by agent/round
```

### Web UI
- Visual session browser
- Conversation timeline
- Branch visualization (tree view)
- Search across all sessions
- Session export/import

---

## 12. Open Questions

1. **Token Budget for Resume**: Should we enforce token limits differently for resumed sessions?

2. **History Compression Default**: Should we compress by default or let users opt-in?

3. **Session Linking UI**: How do we show the relationship between parent and child sessions in output?

4. **Cost Attribution**: Should follow-up costs be added to original session or tracked separately?

5. **Agent State Drift**: How do we handle agent notes that become stale or contradictory in resumed sessions?

6. **Privacy**: Should we offer encryption for sensitive session data?

7. **Cloud Sync**: Should sessions be synced across machines (e.g., via git)?

---

## 13. Dependencies

### New Dependencies
- None required (use existing Node.js fs/path modules)

### Internal Dependencies
- ConversationManager (enhanced)
- OutputHandler (enhanced)
- CostTracker (enhanced for lineage)

---

## 14. Testing Strategy

### Unit Tests
- SessionManager save/load operations
- ContinuationHandler prompt generation
- History compression strategies
- Session manifest validation

### Integration Tests
- End-to-end resume flows (all modes)
- Cross-mode compatibility
- Agent state restoration
- File conflict handling

### User Acceptance Tests
- Follow-up question scenarios
- Interrupted session recovery
- Session browsing and selection
- Cleanup and maintenance

### Performance Tests
- Load time for large sessions (>100 messages)
- Storage growth over 1000+ sessions
- Compression effectiveness
- Token usage efficiency

---

## 15. Documentation Requirements

### User Documentation
- Tutorial: "Asking Follow-up Questions"
- Tutorial: "Resuming Interrupted Sessions"
- CLI reference for resume flags
- FAQ on session management

### Developer Documentation
- SessionManager API reference
- ContinuationHandler API reference
- Session data structure spec
- Migration guide for existing users

---

## 16. Migration Path

### Existing Users
- Automatic migration: old outputs remain in `outputs/`
- New sessions automatically saved to `.llm-conclave/sessions/`
- Option to import old sessions: `llm-conclave --import-legacy-outputs`

### Backward Compatibility
- Resume feature is opt-in via flags
- Existing workflows unchanged
- No breaking changes to CLI

---

## 17. Security & Privacy

### Sensitive Data
- Sessions may contain sensitive conversations
- API keys should NOT be stored in sessions
- Project context may include proprietary code

### Security Measures
- Sessions stored in user's home directory only (not in project)
- Option to exclude sensitive files from snapshots
- Clear documentation on what gets saved
- Optional encryption for session files

### Retention Policies
- Default: Keep sessions for 90 days
- User-configurable retention
- Automatic cleanup on schedule
- Manual purge command for immediate deletion

---

## Conclusion

The Resume & Continuation feature addresses a critical gap in LLM Conclave's workflow, enabling natural multi-turn discussions and robust recovery from interruptions. The phased implementation approach ensures incremental delivery of value while maintaining system stability.

**Recommended Next Steps:**
1. Review and approve this design document
2. Create GitHub issues for each implementation phase
3. Begin Phase 1 implementation (session persistence)
4. Gather user feedback on `--list-sessions` before building resume logic

---

**Document History:**
- v1.0 (2025-12-06): Initial design document
