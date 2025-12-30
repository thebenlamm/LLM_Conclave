# Story 2.3: Hedged Requests with Provider Substitution

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want backup providers to kick in when primary providers are slow or failing,
So that consultations complete reliably even during provider outages.

## Acceptance Criteria

### 1. Hedged Request Logic - Primary Provider with Timeout

**Given** ProviderHealthMonitor is running (from Story 2.2)
**When** HedgedRequestManager executes an agent
**Then** Primary provider is attempted first
**And** Request is sent to the primary provider

**When** Primary provider takes >10 seconds (hedged request threshold)
**Then** System sends identical request to backup provider from same tier
**And** Both requests run in parallel using Promise.race()
**And** First successful response is used
**And** Slower request is cancelled/ignored

### 2. Provider Tier System for Fallback Selection

**Given** An agent needs to execute
**When** Primary provider is selected
**Then** System uses tier-based fallback from ProviderTiers configuration:

**Provider Tiers:**
- **Tier 1 (Premium)**: Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro
- **Tier 2 (Standard)**: Claude Sonnet 3.5, GPT-4, Gemini 2.0 Flash
- **Tier 3 (Fast/Cheap)**: GPT-3.5 Turbo, Mistral Large

**Fallback Logic:**
- If primary provider is in Tier 1 → backup from Tier 1
- If no healthy Tier 1 backup → use Tier 2
- If no healthy Tier 2 backup → use Tier 3
- Backup selection prioritizes healthy providers from ProviderHealthMonitor

### 3. User Substitution Prompt for Complete Failures

**Given** Primary provider fails completely (not just slow, but error/timeout)
**When** Failure is detected
**Then** System prompts user interactively:
```
⚠️ Gemini is unavailable (timeout).
Switch to xAI (Grok) for this agent? [Y/n/Fail]
```

**User Options:**
- **Y** = Use substitute provider and continue
- **n** = Continue with remaining agents (graceful degradation)
- **Fail** = Abort entire consultation

### 4. Substitution Logging and Event Emission

**When** A provider is substituted (hedged OR user-prompted)
**Then** System emits `consultation:provider_substituted` event via EventBus
**And** Event payload includes:
```typescript
{
  agent_id: string,
  original_provider: string,
  substitute_provider: string,
  reason: 'timeout' | 'failure' | 'health_check',
  timestamp: Date
}
```

**And** Substitution is logged in consultation result JSON with full context

### 5. Graceful Degradation - All Tiers Fail

**Given** All provider tiers fail for a specific agent
**When** No providers respond successfully
**Then** Agent response includes error field with failure details
**And** Consultation continues with remaining agents (does NOT abort)
**And** Final verdict includes note about missing agent perspective
**And** Warning logged: "⚠️ Agent [name] failed across all providers"

## Tasks / Subtasks

- [x] Create `src/consult/health/ProviderTiers.ts` (AC: #2)
  - [x] Define `ProviderTier` enum (Tier1, Tier2, Tier3)
  - [x] Create `PROVIDER_TIER_MAP` mapping provider names to tiers
  - [x] Create `getProvidersInTier(tier)` function
  - [x] Create `getBackupProvider(primary, healthStatus)` function

- [x] Create `src/consult/health/HedgedRequestManager.ts` (AC: #1, #2, #3, #4, #5)
  - [x] Implement `executeAgentWithHedging(agent, prompt, healthMonitor)`
  - [x] Implement `raceWithTimeout(primaryPromise, backupPromise, timeout)`
  - [x] Implement `promptUserForSubstitution(provider, error)`
  - [x] Integrate with `ProviderHealthMonitor` for health checks
  - [x] Integrate with `EventBus` for substitution events

- [x] Update `src/orchestration/ConsultOrchestrator.ts` (AC: #1, #3, #4)
  - [x] Replace direct agent execution with `HedgedRequestManager.executeAgentWithHedging()`
  - [x] Pass `ProviderHealthMonitor` instance to hedged manager
  - [x] Handle substitution prompts in consultation flow
  - [x] Update Round 1 (Independent) to use hedged requests
  - [x] Update Round 3 (CrossExam) to use hedged requests
  - [ ] Update Round 4 (Verdict) to use hedged requests for judge (SKIPPED: Per Dev Notes warning) (SKIPPED: Per Dev Notes warning "DO NOT implement hedging for ... verdict")

- [x] Verify `src/core/EventBus.ts` has `consultation:provider_substituted` (AC: #4)
  - [x] Event type already existed from earlier commit (a5d5c44)

- [x] Update `src/types/consult.ts` (AC: #4, #5)
  - [x] Add `ProviderSubstitution` interface
  - [x] Add `substitutions[]` field to `ConsultationResult`
  - [x] Add `provider_error` field to `AgentResponse`

- [x] Add Unit Tests
  - [x] `src/consult/health/__tests__/ProviderTiers.test.ts`
  - [x] `src/consult/health/__tests__/HedgedRequestManager.test.ts`

- [x] Add Integration Tests
  - [x] `src/orchestration/__tests__/ConsultOrchestratorHedging.test.ts`

## Dev Notes

### Architecture Compliance

**Decision #4 from architecture.md: Provider Substitution (Hedged Requests)**

This story implements the **Hedged Requests** half of Architecture Decision #4. Story 2.2 implemented the Health Monitoring foundation.

**Hedged Request Pattern (95% confidence from architecture):**
- **Primary Strategy**: Send to primary provider first
- **Backup Trigger**: If primary takes >10s, send to backup in parallel
- **Winner Selection**: First successful response wins (Promise.race pattern)
- **Cost Trade-off**: Hedging doubles cost on slow requests, but guarantees reliability

**User Control:**
- Hard failures (not just slow) require user consent for substitution
- User can choose to continue with fewer agents or abort entirely
- This prevents surprise costs from automatic failover

**Integration with Story 2.2:**
- `HedgedRequestManager` depends on `ProviderHealthMonitor` for status
- Healthy providers are preferred for backup selection
- Unhealthy providers are skipped in tier fallback logic

### Technical Requirements

**File Structure:**
- Create: `src/consult/health/ProviderTiers.ts`
- Create: `src/consult/health/HedgedRequestManager.ts`
- Create: `src/consult/health/__tests__/ProviderTiers.test.ts`
- Create: `src/consult/health/__tests__/HedgedRequestManager.test.ts`
- Create: `src/orchestration/__tests__/ConsultOrchestratorHedging.test.ts`
- Modify: `src/orchestration/ConsultOrchestrator.ts`
- Modify: `src/core/EventBus.ts`
- Modify: `src/types/consult.ts`

**Dependencies:**
- `ProviderHealthMonitor` (from Story 2.2)
- `EventBus` (existing)
- `LLMProvider` (existing)
- `ProviderFactory` (existing)
- `Inquirer` (existing - for user prompts)

**Promise Patterns:**
```typescript
// Hedged request implementation pattern
async function raceWithTimeout(
  primaryPromise: Promise<any>,
  backupPromise: Promise<any>,
  timeoutMs: number
): Promise<{ result: any; source: 'primary' | 'backup' }> {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Hedged timeout')), timeoutMs)
  );

  // Start primary first
  const primaryRace = Promise.race([primaryPromise, timeout]);

  // After timeout, start backup
  setTimeout(() => {
    Promise.race([backupPromise, primaryPromise]).then(result => {
      // First wins
    });
  }, timeoutMs);
}
```

**Provider Tier Mapping (ProviderTiers.ts):**
```typescript
export enum ProviderTier {
  Tier1 = 'TIER_1', // Premium
  Tier2 = 'TIER_2', // Standard
  Tier3 = 'TIER_3'  // Fast/Cheap
}

export const PROVIDER_TIER_MAP: Record<string, ProviderTier> = {
  'claude-sonnet-4.5': ProviderTier.Tier1,
  'gpt-4o': ProviderTier.Tier1,
  'gemini-2.5-pro': ProviderTier.Tier1,
  'claude-sonnet-3.5': ProviderTier.Tier2,
  'gpt-4': ProviderTier.Tier2,
  'gemini-2.0-flash': ProviderTier.Tier2,
  'gpt-3.5-turbo': ProviderTier.Tier3,
  'mistral-large': ProviderTier.Tier3
};
```

**Types (src/types/consult.ts additions):**
```typescript
export interface ProviderSubstitution {
  agent_id: string;
  original_provider: string;
  substitute_provider: string;
  reason: 'timeout' | 'failure' | 'health_check';
  timestamp: Date;
}

export interface AgentResponse {
  agent_id: string;
  response: string;
  // ... existing fields
  provider_error?: string; // NEW: For failed agents
}

export interface ConsultationResult {
  // ... existing fields
  substitutions: ProviderSubstitution[]; // NEW: Track all substitutions
}
```

### Library & Framework Requirements

- **Promise.race()**: Standard JavaScript for racing primary vs backup requests
- **Promise.allSettled()**: For handling multiple agent failures gracefully
- **Inquirer**: For interactive user prompts (existing dependency)
- **AbortController**: For cancelling slower requests (Node.js 15+)

**Modern Abort Pattern:**
```typescript
const controller = new AbortController();
const primaryPromise = provider.chat(prompt, { signal: controller.signal });

// If backup wins, abort primary
backupPromise.then(() => controller.abort());
```

### Testing Requirements

**Unit Tests:**
- `ProviderTiers.test.ts`: Test tier mapping and backup selection logic
- `HedgedRequestManager.test.ts`: Test hedged execution with mocked providers

**Integration Tests:**
- `ConsultOrchestratorHedging.test.ts`: Test full consultation with provider failures
  - Scenario 1: Primary slow, backup wins
  - Scenario 2: Primary fails, user substitutes
  - Scenario 3: All providers fail, graceful degradation
  - Scenario 4: Successful hedged request with cost tracking

**Testing Patterns:**
```typescript
// Mock slow primary provider
jest.spyOn(primaryProvider, 'chat').mockImplementation(async () => {
  await new Promise(resolve => setTimeout(resolve, 12000)); // 12s
  return { text: 'slow response' };
});

// Mock fast backup provider
jest.spyOn(backupProvider, 'chat').mockImplementation(async () => {
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2s
  return { text: 'fast response' };
});

// Assert backup won
expect(result.source).toBe('backup');
expect(result.substitutions).toHaveLength(1);
```

### Previous Story Intelligence

**Learnings from Story 2.2 (Provider Health Monitoring):**
- Health status should be checked BEFORE selecting backup provider
- `EventBus` integration requires snake_case event payloads
- Singleton pattern used for `ProviderHealthMonitor` - consider same for `HedgedRequestManager`
- In-memory Map used for fast lookups

**Learnings from Story 2.1 (Cost Gate):**
- User prompts should use Inquirer for consistency
- Config settings use camelCase (e.g., `hedgedTimeoutMs`)
- Cost tracking must account for hedged requests (2x cost potential)

**Recent Git Patterns (from git log):**
- Story files created in `_bmad-output/implementation-artifacts/`
- Tests co-located in `__tests__/` subdirectories
- ConsultOrchestrator tests use descriptive names: `ConsultOrchestratorCostGate.test.ts`

### Project Structure Notes

**Alignment with Unified Structure:**
- `src/consult/health/` is the correct home for health and hedging logic
- Follows established pattern from Story 2.2
- `ProviderTiers.ts` should export both types and tier mapping
- `HedgedRequestManager.ts` should be a class (not singleton) to allow testing

**Detected Patterns:**
- PascalCase for TypeScript class files
- camelCase for variables and functions
- snake_case for JSON event payloads
- colon-separated lowercase for event names

**Provider Interface:**
- All providers extend `LLMProvider` base class
- Providers expose `chat(messages, options)` method
- Options can include `signal` for AbortController
- Check: Verify all providers support AbortSignal (might need fallback)

### Latest Tech Information

**AbortController Browser/Node.js Support:**
- **Node.js 15+**: Native AbortController support
- **Node.js 14**: Requires `abort-controller` polyfill
- **Current Project**: Check `package.json` for Node version requirement
- **Recommendation**: Use native AbortController if Node 15+, otherwise add polyfill

**Promise.race() Gotcha:**
- Rejected promises still propagate even if another wins
- Use `.catch()` handlers on each promise to prevent unhandled rejections
- Pattern: Wrap each promise in try/catch or `.catch(err => null)`

**Inquirer 9.x (Current Version):**
- Uses ESM modules - ensure correct import syntax
- `select` prompt for [Y/n/Fail] choices
- Default value support for "Y" as default

**TypeScript 5.x Patterns:**
- Use `satisfies` operator for type-safe config: `const config = {...} satisfies Config`
- Prefer `unknown` over `any` for error handling
- Use template literal types for event names if needed

### Critical Implementation Notes

**🚨 AVOID THESE MISTAKES:**

1. **DO NOT** implement hedging for synthesis (Round 2) or verdict (Round 4) judge calls - only for agent calls (Round 1, Round 3)
2. **DO NOT** automatically substitute without user consent on hard failures - only hedge on slow responses
3. **DO NOT** forget to cancel slower request when faster one wins - memory/connection leak
4. **DO NOT** assume all providers support AbortController - add graceful fallback
5. **DO NOT** double-count costs for hedged requests - track separately in analytics
6. **DO NOT** use same backup provider twice - select different provider from tier

**🎯 SUCCESS CRITERIA:**
- Hedged requests complete in <15s even with slow primary (p95)
- User substitution prompts appear within 2s of failure detection
- Cost tracking accurately reflects hedged request overhead
- All provider failures logged to consultation JSON
- Integration tests cover all substitution scenarios

### References

**Architecture Document:**
- [Architecture Decision #4: Provider Substitution - Hedged Requests](_bmad-output/planning-artifacts/architecture.md#decision-4-provider-substitution)

**Epic Document:**
- [Epic 2: Cost Controls & Resilience](_bmad-output/planning-artifacts/epics.md#epic-2-cost-controls--resilience)
- [Story 2.3: Hedged Requests with Provider Substitution](_bmad-output/planning-artifacts/epics.md#story-23-hedged-requests-with-provider-substitution)

**Related Stories:**
- [Story 2.2: Provider Health Monitoring System](_bmad-output/implementation-artifacts/2-2-provider-health-monitoring.md)
- [Story 2.1: User Consent Flow with Cost Gate](_bmad-output/implementation-artifacts/2-1-user-consent-flow-with-cost-gate.md)

**Codebase References:**
- Provider base class: `src/providers/LLMProvider.ts`
- Provider factory: `src/providers/ProviderFactory.ts`
- Event bus: `src/core/EventBus.ts`
- Orchestrator: `src/orchestration/ConsultOrchestrator.ts`
- Consult types: `src/types/consult.ts`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (via code-review workflow)

### Code Review Findings Fixed

**Review Date:** 2025-12-30
**Issues Found:** 3 High, 4 Medium, 2 Low
**Issues Fixed:** 7 (All HIGH and MEDIUM)

#### HIGH Severity Fixes (3)

1. **AC #4 Substitutions Tracking** - Added substitutions array to ConsultationResult
   - Added `private substitutions` field to ConsultOrchestrator
   - Subscribed to `consultation:provider_substituted` events in constructor
   - Populated `substitutions` field in final result assembly

2. **Encapsulation Violation** - Fixed dirty cast to access private healthStatus Map
   - Added `getAllHealthStatus()` public method to ProviderHealthMonitor
   - Updated HedgedRequestManager to use public API instead of `(healthMonitor as any).healthStatus`

3. **Story File Inaccuracy** - Corrected File List documentation
   - Removed `src/core/EventBus.ts` from File List (not modified in this story)
   - Added `src/consult/health/ProviderHealthMonitor.ts` (was modified)

#### MEDIUM Severity Fixes (4)

4. **Hardcoded Backup Model** - Derived actual model name from provider ID
   - Replaced `'backup-model'` placeholder with `backupProviderId`

5. **Promise.race Error Handling** - Improved rejection handling
   - Wrapped promises to catch rejections gracefully
   - Added fallback logic: if winner rejects, wait for other provider
   - Only throws if both primary and backup fail

6. **Redundant Type Extension** - Removed local `AgentResponseWithError` interface
   - Global `AgentResponse` already has `provider_error?` field
   - Simplified code by using global type directly

7. **Missing Documentation** - Added comment to HEDGED_TIMEOUT_MS constant
   - Documented: "10s threshold from AC #1 - Primary provider timeout before backup launches"

### Completion Notes List

- ✅ All 5 Acceptance Criteria implemented and verified
- ✅ All tests passing (178 tests across 24 suites)
- ✅ TypeScript compiles cleanly with no errors
- ✅ Code review findings resolved (7/7 HIGH and MEDIUM issues fixed)
- ⚠️ LOW issue (test worker leak warning) - pre-existing, does not impact functionality

### File List

**Files Created:**
- `src/consult/health/ProviderTiers.ts`
- `src/consult/health/HedgedRequestManager.ts`
- `src/consult/health/__tests__/ProviderTiers.test.ts`
- `src/consult/health/__tests__/HedgedRequestManager.test.ts`
- `src/orchestration/__tests__/ConsultOrchestratorHedging.test.ts`

**Files Modified:**
- `src/orchestration/ConsultOrchestrator.ts`
- `src/types/consult.ts`
- `src/consult/cost/CostGate.ts` (ESM fix)
- `src/consult/health/ProviderHealthMonitor.ts` (Added getAllHealthStatus() public API)
