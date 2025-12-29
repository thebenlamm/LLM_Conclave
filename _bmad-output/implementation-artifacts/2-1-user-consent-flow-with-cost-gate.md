# Story 2.1: User Consent Flow with Cost Gate

Status: done

## Story

As a **developer using consult mode**,
I want to see cost estimates before expensive consultations and choose whether to proceed,
So that I have predictable costs and never get surprise bills.

## Acceptance Criteria

### 1. Cost Gate Prompt Replaces Auto-Approval

**Given** Epic 1 Story 1.3 currently auto-approves all consultations (line 131 in ConsultOrchestrator.ts)
**When** I enhance the CostGate component
**Then** State = AwaitingConsent now prompts the user instead of auto-approving

**Cost Gate Prompt Display:**
```
Estimated cost: $0.45
- Input tokens: 1,234
- Expected output tokens: ~8,000
- 3 agents × 4 rounds

Proceed? [Y/n/Always]
```

**And** User can choose:
- `Y` = Approve this consultation
- `n` = Cancel consultation
- `Always` = Set auto-approve threshold

### 2. Config Integration for Auto-Approval Threshold

**When** User selects "Always"
**Then** System prompts: "Auto-approve consultations under: $[amount]"
**And** Saves `alwaysAllowUnder` to `~/.llm-conclave/config.json` (uses existing ConfigCascade system)
**And** Future consultations under threshold auto-approve without prompt

**Config Structure:**
```json
{
  "consult": {
    "alwaysAllowUnder": 0.50
  }
}
```

### 3. Auto-Approve for Cheap Queries

**Given** Config has `consult.alwaysAllowUnder: 0.50`
**When** Estimated cost is $0.30
**Then** Consultation auto-approves without prompt
**And** Displays: "💰 Estimated cost: $0.30 (auto-approved)"
**And** State transitions directly from AwaitingConsent → Independent

### 4. Cancel Flow

**Given** User selects "n" (cancel)
**When** Consent is denied
**Then** State transitions to Aborted via `stateMachine.transition(ConsultState.Aborted, 'User cancelled')`
**And** Message displayed: "Consultation cancelled by user"
**And** No API calls are made
**And** Process exits cleanly with code 0

### 5. In-Flight Cost Monitoring

**Given** Consultation is running (Round 1, 2, 3, or 4)
**When** Actual cumulative cost exceeds estimate by >50%
**Then** System displays warning: "⚠️ Cost exceeded estimate by >50%. Aborting consultation."
**And** State transitions to Aborted
**And** Partial results saved via ConsultationFileLogger (Story 2.5 handles full implementation)
**And** Cost breakdown shows: estimated vs actual

## Tasks / Subtasks

- [x] Create CostGate.ts component (AC: #1, #2, #3, #4)
  - [x] Implement `shouldPromptUser(estimate, config)` method
  - [x] Implement `promptUserForConsent(estimate)` with Inquirer
  - [x] Implement `saveAutoApproveThreshold(amount)` to config.json
  - [x] Add unit tests for all consent flows

- [x] Enhance ConsultOrchestrator.ts (AC: #1, #3, #5)
  - [x] Replace auto-approval (line 126-131) with CostGate.getUserConsent()
  - [x] Add in-flight cost tracking in each round
  - [x] Implement cost threshold checking after each round
  - [x] Abort if threshold exceeded

- [x] Extend ConfigCascade defaults (AC: #2, #3)
  - [x] Add `consult.alwaysAllowUnder: 0.50` to getDefaults()
  - [x] Ensure config resolution includes consult section

- [x] Add ConsultationResult fields for cost tracking (AC: #5)
  - [x] Add `estimatedCost` field
  - [x] Add `actualCost` field
  - [x] Add `costExceeded: boolean` field

## Dev Notes

### Architecture Compliance

**Decision #5 from architecture.md: Cost Gate Implementation**
- Pre-flight cost calculation using existing CostEstimator
- Dynamic user consent with `alwaysAllowUnder` config setting
- In-flight monitoring to abort if cost exceeds estimate by >50%
- Config file: `~/.llm-conclave/config.json`

**Cost Calculation Formula (from CostEstimator.ts):**
```typescript
estimatedCost = agents.reduce((total, agent) => {
  const pricing = getProviderPricing(agent.provider, agent.model);
  return total +
    (inputTokens * pricing.input_token_rate) +
    (outputTokens * pricing.output_token_rate);
}, 0);
```

### Technical Requirements

**File Structure:**
- Create: `src/consult/cost/CostGate.ts` (new component)
- Modify: `src/orchestration/ConsultOrchestrator.ts` (lines 126-131)
- Modify: `src/cli/ConfigCascade.ts` (add consult defaults)
- Modify: `src/types/consult.ts` (add cost tracking fields)

**Dependencies:**
- Existing: CostEstimator (already implemented in `src/consult/cost/CostEstimator.ts`)
- Existing: ConfigCascade (already implemented in `src/cli/ConfigCascade.ts`)
- External: Inquirer (already in package.json for prompts)
- External: Chalk (already in package.json for colored output)

**User Interaction Pattern:**
```typescript
import inquirer from 'inquirer';
import chalk from 'chalk';

const response = await inquirer.prompt([{
  type: 'list',
  name: 'consent',
  message: `Estimated cost: ${chalk.yellow(`$${cost.toFixed(4)}`)}. Proceed?`,
  choices: ['Yes', 'No', 'Always (update threshold)']
}]);
```

### Library & Framework Requirements

**Inquirer Prompts (existing):**
- Type: `list` for menu selection
- Choices: ['Yes', 'No', 'Always']
- Already used in other commands (init.ts, template.ts)

**Chalk Styling (existing):**
- Yellow for cost amounts: `chalk.yellow('$0.45')`
- Red for warnings: `chalk.red('⚠️ Cost exceeded')`
- Green for success: `chalk.green('💰 auto-approved')`

**File I/O for Config:**
- Use existing ConfigCascade write methods
- Path: `~/.llm-conclave/config.json`
- Merge with existing config (don't overwrite)

### File Structure Requirements

**New File: src/consult/cost/CostGate.ts**
```typescript
import { CostEstimate } from './CostEstimator';
import { ConfigCascade } from '../../cli/ConfigCascade';
import inquirer from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class CostGate {
  /**
   * Check if user consent is needed based on config threshold
   */
  shouldPromptUser(estimate: CostEstimate, config: any): boolean {
    const threshold = config?.consult?.alwaysAllowUnder || 0.50;
    return estimate.estimatedCostUsd > threshold;
  }

  /**
   * Prompt user for consent
   * Returns: 'approved' | 'denied' | 'always'
   */
  async getUserConsent(estimate: CostEstimate): Promise<'approved' | 'denied' | 'always'> {
    // Implementation here
  }

  /**
   * Save auto-approve threshold to config
   */
  async saveAutoApproveThreshold(amount: number): Promise<void> {
    // Implementation here
  }
}
```

**Modified: src/orchestration/ConsultOrchestrator.ts (lines 126-131)**
```typescript
// BEFORE (Epic 1 auto-approval):
this.stateMachine.transition(ConsultState.AwaitingConsent);
this.eventBus.emitEvent('consultation:user_consent' as any, {
  consultation_id: this.consultationId,
  approved: true
}); // Auto-approve for Epic 1 MVP

// AFTER (Epic 2 user consent):
this.stateMachine.transition(ConsultState.AwaitingConsent);
const costGate = new CostGate();
const config = ConfigCascade.resolve({}, process.env);

if (costGate.shouldPromptUser(estimate, config)) {
  const consent = await costGate.getUserConsent(estimate);

  if (consent === 'denied') {
    this.stateMachine.transition(ConsultState.Aborted, 'User cancelled');
    throw new Error('Consultation cancelled by user');
  }

  if (consent === 'always') {
    await costGate.saveAutoApproveThreshold(estimate.estimatedCostUsd);
  }

  this.eventBus.emitEvent('consultation:user_consent' as any, {
    consultation_id: this.consultationId,
    approved: true
  });
} else {
  // Auto-approved under threshold
  console.log(chalk.green(`💰 Estimated cost: $${estimate.estimatedCostUsd.toFixed(4)} (auto-approved)`));
  this.eventBus.emitEvent('consultation:user_consent' as any, {
    consultation_id: this.consultationId,
    approved: true,
    auto_approved: true
  });
}
```

### Testing Requirements

**Unit Tests:**
- `src/consult/cost/__tests__/CostGate.test.ts`
  - Test shouldPromptUser() with various thresholds
  - Test getUserConsent() response handling
  - Test saveAutoApproveThreshold() file writing

**Integration Tests:**
- `src/orchestration/__tests__/ConsultOrchestratorCostGate.test.ts`
  - Test auto-approval flow (cost < threshold)
  - Test user prompt flow (cost > threshold)
  - Test cancel flow (user denies)
  - Test 'Always' flow (saves config)
  - Test in-flight cost monitoring (abort if >50% over)

**Test Coverage Target:** >90% for CostGate component

### Previous Story Intelligence

**Story 1.3 implemented:**
- Basic cost estimation in AwaitingConsent state
- Auto-approval placeholder (intentional for MVP)
- Cost estimate event emission

**Key learnings:**
- CostEstimator works well with current formula
- State machine transitions are clean
- EventBus integration is straightforward

**Files already modified in Story 1.3:**
- `src/orchestration/ConsultOrchestrator.ts` (lines 117-131)
- `src/consult/cost/CostEstimator.ts` (full implementation)

**What NOT to change:**
- CostEstimator formula (works as designed)
- State machine transition order (Estimating → AwaitingConsent → Independent)
- Event emission patterns (keep consistent)

### Git Intelligence Summary

**Recent commits show:**
- Stories 1.4-1.7 implemented (synthesis, cross-exam, verdict, formatting)
- Test patterns established: `__tests__/` directories with `.test.ts` files
- Error handling patterns: State machine transitions with reason strings
- Event emission patterns: snake_case fields, consultation_id always included

**Code patterns to follow:**
```typescript
// State transitions with reason
this.stateMachine.transition(ConsultState.Aborted, 'User cancelled');

// Event emission
this.eventBus.emitEvent('consultation:user_consent' as any, {
  consultation_id: this.consultationId,
  approved: true,
  auto_approved: false
});

// Error handling
if (!userApproved) {
  throw new Error('Consultation cancelled by user');
}
```

### Latest Technical Specifics

**Inquirer v9.0.0 API (already in package.json):**
```typescript
import inquirer from 'inquirer';

const { consent } = await inquirer.prompt([{
  type: 'list',
  name: 'consent',
  message: 'Proceed?',
  choices: ['Yes', 'No', 'Always (update threshold)']
}]);

// Returns: consent = 'Yes' | 'No' | 'Always (update threshold)'
```

**Config File Write Pattern (match existing code):**
```typescript
const configPath = path.join(os.homedir(), '.llm-conclave', 'config.json');

// Ensure directory exists
if (!fs.existsSync(path.dirname(configPath))) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
}

// Read existing config
let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// Merge new values
config.consult = config.consult || {};
config.consult.alwaysAllowUnder = amount;

// Write back
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
```

### Project Context Reference

**From project-context.md (if exists):**
- Use existing ConfigCascade patterns
- Follow state machine transition patterns from ConsultStateMachine
- Use Inquirer for all user prompts (consistency)
- Use Chalk for all colored output (consistency)

**Integration Points:**
- ConfigCascade.resolve() for reading config
- CostEstimator.estimateCost() for cost calculation
- ConsultStateMachine.transition() for state changes
- EventBus.emitEvent() for lifecycle events

## Dev Agent Record

### Agent Model Used

**Model:** Claude Sonnet 4.5
**Date:** 2025-12-29

### Debug Log References

No major issues encountered. All tests passed successfully:
- CostGate unit tests: 14/14 passed
- ConsultOrchestrator integration tests: 15/15 passed
- All existing tests: 105/105 passed

### Completion Notes List

**Implementation Approach:**
- Followed TDD red-green-refactor cycle throughout
- Created CostGate component with full inquirer integration
- Enhanced ConsultOrchestrator with cost tracking in all 4 rounds
- Extended ConfigCascade with consult.alwaysAllowUnder default
- Added estimatedCost, actualCost, costExceeded fields to ConsultationResult

**Key Decisions:**
1. **Cost tracking granularity:** Track costs after each agent response using usage tokens
2. **Threshold checking:** Check after each round (R1, R2, R3, R4) to catch overruns early
3. **Auto-approval threshold:** Default $0.50, stored in global config at `~/.llm-conclave/config.json`
4. **User experience:** Display formatted cost breakdown with chalk colors for clarity

**Technical Implementation:**
- `shouldPromptUser()`: Compares estimate against config threshold
- `getUserConsent()`: Interactive inquirer prompt with 3 choices (Yes/No/Always)
- `saveAutoApproveThreshold()`: Merges with existing config, creates directory if needed
- `displayAutoApproved()`: Green success message for under-threshold consultations
- `trackActualCost()`: Calculates cost from token usage using provider pricing
- `checkCostThreshold()`: Aborts if actual > (estimated * 1.5)

**Code Review Fixes (2025-12-29):**
1. **Cost tracking normalization:** Normalize provider usage tokens to prevent NaN costs and ensure in-flight checks work across rounds
2. **Cancel flow exit behavior:** Treat user cancellation as a clean exit (code 0) in CLI
3. **Partial logging on cost abort:** Save partial consultation artifacts when cost exceeds threshold
4. **Config path alignment:** Save and load config from `~/.llm-conclave/config.json`
5. **Test coverage:** Added real abort + partial log test for cost threshold

**Test Coverage:**
- Unit tests: shouldPromptUser, getUserConsent, saveAutoApproveThreshold, edge cases
- Integration tests: Auto-approval flow, user prompt flow, cancel flow, config integration
- All acceptance criteria validated with specific test cases

### File List

**Files Created:**
- `src/consult/cost/CostGate.ts` (148 lines)
- `src/consult/cost/__tests__/CostGate.test.ts` (208 lines)
- `src/orchestration/__tests__/ConsultOrchestratorCostGate.test.ts` (313 lines)

**Files Modified:**
- `src/orchestration/ConsultOrchestrator.ts` (enhanced with CostGate integration, cost tracking, threshold checking)
  - Lines 11-19: Added imports (CostGate, ConfigCascade, chalk)
  - Lines 51-54: Added costGate instance and cost tracking variables
  - Lines 61: Initialize CostGate in constructor
  - Lines 126-170: Replaced auto-approval with CostGate flow
  - Lines 178-184: Added cost tracking after Round 1
  - Lines 205: Added threshold check after Round 2
  - Lines 214: Added threshold check after Round 3
  - Lines 228: Added threshold check after Round 4
  - Lines 244-283: Added cost tracking fields to ConsultationResult
  - Lines 343-345: Track synthesis cost
  - Lines 407-410: Track verdict cost
  - Lines 500-505: Track Round 3 agent costs
  - Lines 532-535: Track Round 3 judge cost
  - Lines 632-681: Added helper methods (trackActualCost, checkCostThreshold, getPricingForModel)
- `src/cli/ConfigCascade.ts` (lines 71-74: added consult defaults)
- `src/types/consult.ts` (lines 198-201: added estimatedCost, actualCost, costExceeded fields)
- `src/commands/consult.ts` (treat user cancel as clean exit code 0)
- `src/consult/cost/CostGate.ts` (config path aligned with AC)
- `src/consult/cost/__tests__/CostGate.test.ts` (config path aligned with AC)
- `src/orchestration/__tests__/ConsultOrchestratorCostGate.test.ts` (in-flight abort + partial log coverage)

**Files Referenced (No Changes):**
- `src/consult/cost/CostEstimator.ts`
- `src/orchestration/ConsultStateMachine.ts`
- `~/.llm-conclave/config.json` (user config file, managed by CostGate)
