# Story 2.1: User Consent Flow with Cost Gate

Status: ready-for-dev

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

- [ ] Create CostGate.ts component (AC: #1, #2, #3, #4)
  - [ ] Implement `shouldPromptUser(estimate, config)` method
  - [ ] Implement `promptUserForConsent(estimate)` with Inquirer
  - [ ] Implement `saveAutoApproveThreshold(amount)` to config.json
  - [ ] Add unit tests for all consent flows

- [ ] Enhance ConsultOrchestrator.ts (AC: #1, #3, #5)
  - [ ] Replace auto-approval (line 126-131) with CostGate.getUserConsent()
  - [ ] Add in-flight cost tracking in each round
  - [ ] Implement cost threshold checking after each round
  - [ ] Abort if threshold exceeded

- [ ] Extend ConfigCascade defaults (AC: #2, #3)
  - [ ] Add `consult.alwaysAllowUnder: 0.50` to getDefaults()
  - [ ] Ensure config resolution includes consult section

- [ ] Add ConsultationResult fields for cost tracking (AC: #5)
  - [ ] Add `estimatedCost` field
  - [ ] Add `actualCost` field
  - [ ] Add `costExceeded: boolean` field
  - [ ] Add `abortReason: string | null` field

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
- Path: `~/.config/llm-conclave/config.json`
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
const configPath = path.join(os.homedir(), '.config', 'llm-conclave', 'config.json');

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

_To be filled by dev agent_

### Debug Log References

_To be filled by dev agent_

### Completion Notes List

_To be filled by dev agent_

### File List

**Files Created:**
- `src/consult/cost/CostGate.ts`
- `src/consult/cost/__tests__/CostGate.test.ts`
- `src/orchestration/__tests__/ConsultOrchestratorCostGate.test.ts`

**Files Modified:**
- `src/orchestration/ConsultOrchestrator.ts` (lines 126-131)
- `src/cli/ConfigCascade.ts` (add consult defaults)
- `src/types/consult.ts` (add cost tracking fields)

**Files Referenced:**
- `src/consult/cost/CostEstimator.ts` (existing, no changes)
- `src/orchestration/ConsultStateMachine.ts` (existing, no changes)
- `~/.config/llm-conclave/config.json` (user config file)
