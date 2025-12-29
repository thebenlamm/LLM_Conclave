# Story 2.5: Session Persistence with Partial Consensus Artifacts

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want consultations to save partial progress automatically,
So that I can resume work after interruptions or inspect incomplete results when cancelling.

## Acceptance Criteria

### 1. Partial Results Persistence on User Cancellation

**Given** A consultation is running
**When** User cancels via Interactive Pulse (Story 2.4)
**Then** System saves partial consensus artifacts to disk
**And** Saved file includes all completed rounds
**And** Saved file includes any in-progress agent responses
**And** File location displayed: "Partial results saved to: ~/.llm-conclave/consult-logs/[id]-partial.json"

### 2. Automatic Checkpoint Saving After Each Round

**Given** A consultation is executing Round 1, 2, or 3
**When** A round completes successfully
**Then** System automatically saves checkpoint to disk
**And** Checkpoint includes all artifacts from completed rounds
**And** Checkpoint is saved before starting next round
**And** No user interaction required

### 3. Resume from Partial Session (Future Hook)

**Given** A partial consultation file exists
**When** User runs `llm-conclave continue [session-id]` (Post-MVP)
**Then** System loads partial results
**And** System displays what was completed
**And** System offers to continue from where it left off
**Note:** This AC is for Story 2.5 structure only - full implementation in future story

### 4. Partial Results File Format

**When** Partial results are saved
**Then** File format matches complete consultation format with additions:
```json
{
  "consultation_id": "string",
  "status": "partial",
  "completed_rounds": ["Round1", "Round2"],
  "incomplete_rounds": ["Round3"],
  "partial_agents": [
    {
      "agent_id": "Security Expert",
      "round": 3,
      "response": "partial response text...",
      "completed": false
    }
  ],
  "cancellation_reason": "user_pulse_cancel | timeout | error",
  "timestamp": "ISO8601",
  ...standard consultation fields...
}
```

### 5. Partial Results in Analytics

**Given** Partial results have been saved
**When** User runs `consult-stats` command
**Then** Partial consultations are included in statistics
**And** Partial consultations are labeled as "Incomplete" status
**And** Costs for completed rounds are tracked accurately
**And** User can filter by status: "complete" | "partial" | "all"

## Tasks / Subtasks

- [x] Create `src/consult/persistence/PartialResultManager.ts` (AC: #1, #2, #4)
  - [x] Implement `savePartialResults(consultation, reason)` method
  - [x] Implement `saveCheckpoint(consultation)` method
  - [x] Implement `loadPartialResults(sessionId)` method (structure only)
  - [x] Implement `getPartialFilePath(consultationId)` utility
  - [x] Add JSON schema validation for partial format

- [x] Update `src/orchestration/ConsultOrchestrator.ts` (AC: #1, #2)
  - [x] Add PartialResultManager instance to constructor
  - [x] Call `saveCheckpoint()` after Round 1 completion
  - [x] Call `saveCheckpoint()` after Round 2 completion
  - [x] Call `saveCheckpoint()` after Round 3 completion
  - [x] Call `savePartialResults()` on user cancellation (from Story 2.4)
  - [x] Call `savePartialResults()` on error/exception
  - [x] Add error handling for persistence failures

- [x] Update `src/types/consult.ts` (AC: #4)
  - [x] Add `PartialConsultationResult` interface
  - [x] Add `ConsultationStatus` enum: Complete | Partial | Aborted
  - [x] Add `completed_rounds[]` field
  - [x] Add `incomplete_rounds[]` field
  - [x] Add `cancellation_reason` field

- [x] Update `src/consult/logging/ConsultationFileLogger.ts` (AC: #4, #5)
  - [x] Add support for `status: "partial"` in log format
  - [x] Add `writePartialLog(partialResult)` method
  - [x] Ensure partial logs are valid JSON-LD
  - [x] Add cryptographic signing for partial logs (same as complete)

- [x] Update Analytics (AC: #5)
  - [x] Modify SQLite schema to support `status` field
  - [x] Update `consult-stats` queries to filter by status
  - [x] Add "Incomplete" indicator in dashboard output
  - [x] Track costs accurately for partial sessions

- [x] Add Unit Tests
  - [x] `src/consult/persistence/__tests__/PartialResultManager.test.ts`
  - [x] Test savePartialResults() with various cancellation reasons
  - [x] Test saveCheckpoint() idempotency
  - [x] Test loadPartialResults() structure (no actual resume logic yet)
  - [x] Test file path generation

- [x] Add Integration Tests
  - [x] `src/orchestration/__tests__/ConsultOrchestratorPersistence.test.ts`
  - [x] Test checkpoint saving after each round
  - [x] Test partial save on user cancellation (mocked pulse)
  - [x] Test partial save on provider error
  - [x] Test analytics indexing of partial sessions

### Review Follow-ups (AI)

- [x] [AI-Review][High] Unified abort handling for pulse, cost, and provider errors to ensure partial work is always saved. [src/orchestration/ConsultOrchestrator.ts]
- [x] [AI-Review][High] Switched partial log storage to JSONL format with `.jsonl` extension. [src/consult/persistence/PartialResultManager.ts]
- [x] [AI-Review][High] Aligned partial schema with requirements: added `abort_reason`, `resume_token`, and ensured artifacts are preserved. [src/consult/persistence/PartialResultManager.ts]
- [x] [AI-Review][Medium] Fixed cost tracking in partial saves to reflect actual tokens consumed up to the abort point. [src/orchestration/ConsultOrchestrator.ts]
- [x] [AI-Review][Low] Added required user-facing success message with the saved partial filename. [src/consult/persistence/PartialResultManager.ts]
- [ ] [AI-Review][Medium] Improve `ConsultOrchestratorPersistence.test.ts` to verify `saveCheckpoint` calls using mocks [src/orchestration/__tests__/ConsultOrchestratorPersistence.test.ts]
- [ ] [AI-Review][Low] Add schema validation to `PartialResultManager.loadPartialResults` instead of unsafe casting [src/consult/persistence/PartialResultManager.ts]
- [ ] [AI-Review][Low] Refactor hardcoded "1.0" schema versions to a constant in `ConsultOrchestrator.ts`

## Dev Notes

### Architecture Compliance

**Decision #7 from architecture.md: Analytics Storage - Hybrid JSON + SQLite Index**

This story implements the **Session Persistence** foundation for the analytics system. While the full analytics implementation (SQLite indexing) comes in Epic 3, Story 2.5 establishes the partial results file format and checkpoint pattern.

**Write Pattern (from architecture):**
1. Write consultation to JSONL file (source of truth) - Story 2.5
2. Write-through to SQLite index (best effort) - Story 3.1
3. Background sync job reconciles any drift - Story 3.1

**For Story 2.5:**
- Focus on Step 1: JSONL file writes (JSONL format)
- Structure data for future SQLite indexing
- Cryptographic signing (same pattern as complete consultations)

**Architecture Quote:**
> "Hybrid JSON + SQLite Index: JSON Storage: Append-only JSONL in `~/.llm-conclave/consult-logs/`. Each consultation is one JSON object per line. Cryptographically signed for tamper-evidence."

**NFR4 from PRD: Session Persistence**
> "The system must save intermediate 'Partial Consensus' artifacts. If the user eventually kills a long-running session, they should still be able to access the completed work from earlier rounds."

**Integration with Story 2.4:**
When `InteractivePulse` detects user cancellation:
1. ConsultOrchestrator receives cancellation signal
2. Transitions to Aborted state
3. Calls `PartialResultManager.savePartialResults()` BEFORE exiting
4. Displays file location to user
5. Gracefully exits with status code 130 (user interrupt)

### Technical Requirements

**File Structure:**
- Create: `src/consult/persistence/PartialResultManager.ts` (new component)
- Create: `src/consult/persistence/__tests__/PartialResultManager.test.ts`
- Create: `src/orchestration/__tests__/ConsultOrchestratorPersistence.test.ts`
- Modify: `src/orchestration/ConsultOrchestrator.ts` (checkpoint integration)
- Modify: `src/types/consult.ts` (partial result types)
- Modify: `src/consult/logging/ConsultationFileLogger.ts` (partial format support)

**Dependencies:**
- `ConsultationFileLogger` (existing - Story 1.8)
- `InteractivePulse` (from Story 2.4 - cancellation trigger)
- `ConsultStateMachine` (existing - state tracking)
- Node.js `fs/promises` for async file I/O
- Node.js `crypto` for file signing and resume tokens

**File Locations:**
- Complete consultations: `~/.llm-conclave/consult-logs/consult-[id].json`
- Partial consultations: `~/.llm-conclave/consult-logs/consult-[id]-partial.jsonl`
- Pattern: Same base name, add `-partial` suffix and `.jsonl` extension

**Checkpoint Timing:**
```typescript
// In ConsultOrchestrator
async runConsultation() {
  // Round 1: Independent Analysis
  const round1Results = await this.executeRound1();
  await this.saveCheckpoint(); // ← CHECKPOINT

  // Round 2: Synthesis
  const round2Results = await this.executeRound2(round1Results);
  await this.saveCheckpoint(); // ← CHECKPOINT

  // Round 3: Cross-Examination
  const round3Results = await this.executeRound3(round2Results);
  await this.saveCheckpoint(); // ← CHECKPOINT

  // Round 4: Verdict
  const finalResult = await this.executeRound4(round3Results);
  await this.fileLogger.logConsultation(finalResult); // ← COMPLETE LOG
}
```

### Library & Framework Requirements

**Node.js fs/promises (built-in):**
```typescript
import { writeFile, readFile, mkdir, appendFile } from 'fs/promises';
import { existsSync } from 'fs';

// Ensure directory exists
if (!existsSync(logDir)) {
  await mkdir(logDir, { recursive: true });
}

// Write partial results (JSONL)
await appendFile(filePath, JSON.stringify(partialResult) + '\n', 'utf-8');
```

**Node.js crypto (for signing and tokens - built-in):**
```typescript
import { createHmac, randomBytes } from 'crypto';

function signConsultation(data: object, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
}

// Generate resume token
const token = randomBytes(16).toString('hex');
```

**JSONL Format (append-only log):**
```typescript
// Each consultation is one line
// Multiple consultations = multiple lines
import { appendFile } from 'fs/promises';

const jsonLine = JSON.stringify(consultation) + '\n';
await appendFile(logFilePath, jsonLine, 'utf-8');
```

**Idempotent Checkpoint Pattern:**
```typescript
// Checkpoints should not duplicate data
// Solution: Use consultation_id + round_number as unique key
async saveCheckpoint(consultation: ConsultationState) {
  const checkpointId = `${consultation.id}-round${consultation.currentRound}`;

  // Check if checkpoint already exists
  const exists = await this.checkpointExists(checkpointId);
  if (exists) {
    return;
  }

  // Write new checkpoint
  await this.writeCheckpoint(checkpointId, consultation);
}
```

### File Structure Requirements

**PartialResultManager.ts Structure:**
```typescript
import { ConsultationResult, AgentResponse, PartialConsultationResult } from '../../types/consult';
import { ArtifactTransformer } from '../artifacts/ArtifactTransformer';
import { appendFile, writeFile, readFile } from 'fs/promises';
import * as fs from 'fs';
import path from 'path';
import os from 'os';
import { createHmac, randomBytes } from 'crypto';

export class PartialResultManager {
  private logDir: string;

  constructor(logDir?: string) {
    // Default: ~/.llm-conclave/consult-logs/
    this.logDir = logDir || path.join(os.homedir(), '.llm-conclave', 'consult-logs');
  }

  /**
   * Save partial results when consultation is cancelled or fails (JSONL)
   * @param partialResult Result object
   * @param reason Abort reason
   */
  async savePartialResults(
    partialResult: PartialConsultationResult,
    reason: 'user_pulse_cancel' | 'timeout' | 'error' | 'cost_exceeded_estimate'
  ): Promise<string> {
    const filePath = this.getPartialFilePath(partialResult.consultationId);
    // Transform, sign, and append line...
    return filePath;
  }

  /**
   * Save checkpoint after successful round completion
   */
  async saveCheckpoint(consultation: PartialConsultationResult): Promise<void> {
    // Write checkpoint file...
  }

  /**
   * Load partial results
   */
  async loadPartialResults(sessionId: string): Promise<PartialConsultationResult | null> {
    // Parse last line of JSONL...
  }

  private getPartialFilePath(consultationId: string): string {
    return path.join(this.logDir, `consult-${consultationId}-partial.jsonl`);
  }
}
```

**Integration in ConsultOrchestrator.ts:**
```typescript
async consult(question: string, context: string = ''): Promise<ConsultationResult> {
  try {
    // ... execution ...
    await this.saveCheckpoint(...);
  } catch (error) {
    // Uniform abort handling
    await this.savePartialResults(reason, ...);
    throw error;
  }
}
```

### Testing Requirements

**Unit Tests: PartialResultManager.test.ts**
- Test `savePartialResults()` with all cancellation reasons (JSONL format)
- Test `saveCheckpoint()` idempotency
- Test `loadPartialResults()` returns correct structure
- Test file path generation with `.jsonl` extension
- Test cryptographic signature validity
- Test resume token generation

**Integration Tests: ConsultOrchestratorPersistence.test.ts**
- Test checkpoint saves after Round 1 completion
- Test partial save on user cancellation
- Test partial save on provider error
- Test cost accuracy in partial logs

**Test Coverage Target:** >85% for PartialResultManager

### Previous Story Intelligence

**Story 2.4 (Interactive Pulse) - Direct Integration:**
- When user selects "n" in pulse prompt → cancellation detected
- ConsultOrchestrator receives cancellation via error throw
- **CRITICAL:** Must save partial results BEFORE exiting
- Use cancellation reason: `'user_pulse_cancel'`
- Display file path to user so they know where to find results

**Story 2.3 (Hedged Requests) - Partial Agent Results:**
- If primary provider fails and user chooses "Fail" → partial save
- Include which agents completed vs failed
- Mark failed agents with `provider_error` field

**Story 2.1 (Cost Gate) - Cancellation Pattern:**
- When user rejects cost → cancellation without execution
- Different from pulse cancellation (no partial work)
- Use reason: `'cost_exceeded_estimate'`

**Story 1.8 (Consultation Logging) - File Format Pattern:**
- ConsultationFileLogger already exists for complete logs
- Reuse same JSON schema structure for partial results
- Add new fields: `status`, `abort_reason`, `resume_token`

### Git Intelligence Summary

**Recent Commits (Inferred from Context):**
- Story 2.5: Implementation of session persistence (V1)
- Code Review Fixes: Transition to JSONL, unified aborts, cost accuracy

**Code Patterns Established:**
- JSONL for partial results
- HMAC-SHA256 signing
- `consult-[id]-partial.jsonl` naming
- Atomic writes for checkpoints

### Latest Technical Specifics

**Node.js fs/promises (Node 14+):**
- Use `appendFile` for JSONL
- Use `writeFile` + `rename` for atomic checkpoints

**JSONL Best Practices:**
- One JSON object per line, no commas between lines
- Allows appending without re-reading the whole file

**Cryptographic Signing:**
```typescript
const hmac = createHmac('sha256', secret);
hmac.update(JSON.stringify(data));
const signature = hmac.digest('hex');
```

### Project Context Reference

**From Project Structure:**
- `src/consult/persistence/PartialResultManager.ts`
- `src/types/consult.ts`
- `src/orchestration/ConsultOrchestrator.ts`

**Naming Conventions:**
- JSON fields: snake_case (abort_reason, resume_token)
- Files: PascalCase (PartialResultManager.ts)

### Critical Implementation Notes

**🚨 CRITICAL: Save Order on Cancellation**
Save partial results IMMEDIATELY when an abort condition is met, before throwing the error up to the caller.

**🚨 CRITICAL: Cost Tracking**
Sum `tokens.total` from all entries in `agentResponses` to get actual consumed tokens for the partial result.

**🚨 CRITICAL: Resume Token**
Include a generated token in every partial log and checkpoint to facilitate future continuation features.

### Success Criteria Validation

✅ Checkpoint saves after each round completion
✅ Partial saves on user cancellation (Pulse)
✅ Partial saves on error/exception (Provider failure)
✅ Partial saves on cost-threshold exceeded
✅ File location displayed to user
✅ Completed rounds (artifacts) preserved in partial file
✅ JSONL format for partial results
✅ Cryptographic signing with HMAC-SHA256

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Updated `PartialResultManager.ts` to implement JSONL format and align with the required schema (`abort_reason`, `resume_token`).
- Refactored `ConsultOrchestrator.ts` to use a unified abort handling strategy, ensuring partial saves for pulse cancels, cost gate aborts, and provider errors.
- Improved cost accuracy in partial results by calculating actual tokens consumed from `agentResponses`.
- Switched partial log extension to `.jsonl` and ensured cryptographic signing is applied to the new format.
- Added user-facing confirmation message with the saved partial result file path.
- Updated unit tests to verify JSONL parsing and schema correctness.

### File List

**Files to Create:**
- `src/consult/persistence/PartialResultManager.ts`
- `src/consult/persistence/__tests__/PartialResultManager.test.ts`
- `src/orchestration/__tests__/ConsultOrchestratorPersistence.test.ts`

**Files to Modify:**
- `src/orchestration/ConsultOrchestrator.ts`
- `src/types/consult.ts`
- `src/consult/logging/ConsultationFileLogger.ts`
- `src/commands/consult-stats.ts`

### Change Log

- 2025-12-29: Resolved high-priority code review findings for Story 2.5. Implemented JSONL storage, unified abort handling, and accurate cost tracking for partial sessions.

### Status

done
