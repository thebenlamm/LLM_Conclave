# Story 2.2: Provider Health Monitoring System

Status: review

## Story

As a **developer**,
I want background health checks to track provider status,
So that the system knows which providers are reliable before consultations start.

## Acceptance Criteria

### 1. Provider Health Monitor Initialization

**Given** LLM Conclave starts up
**When** ProviderHealthMonitor initializes
**Then** Background health checks start for all configured providers (Claude, OpenAI, Gemini, etc.)
**And** Initial status for all providers is set to `Unknown`

### 2. Periodic Health Check Mechanism

**When** Health check runs (default interval: 30 seconds)
**Then** System sends a lightweight test request to each provider
**And** Request is a minimal generation (e.g., "ping" -> "pong") to minimize cost
**And** System tracks response time (latency) and success/failure status
**And** Updates `ProviderHealth` status in memory

**Health Status Logic:**
- **Healthy**: < 3s response AND 0 recent failures
- **Degraded**: 3-10s response OR 1-2 recent failures
- **Unhealthy**: >10s response OR 3+ consecutive failures
- **Unknown**: Initial state or never checked

### 3. Health Status Storage

**Then** Health status is stored in an in-memory Map:
```typescript
Map<string, ProviderHealth> {
  'anthropic': {
    status: 'Healthy',
    lastChecked: Date,
    latencyMs: 2100,
    errorRate: 0.0,
    consecutiveFailures: 0
  },
  // ... other providers
}
```

### 4. Event Emission

**When** A provider's status changes (e.g., Healthy -> Degraded)
**Then** System emits `health:status_updated` event via EventBus
**And** Payload includes: `provider_name`, `previous_status`, `new_status`, `reason`

### 5. Graceful Degradation Warning

**Given** No providers are Healthy (all Degraded or Unhealthy)
**When** A consultation starts
**Then** Warning is displayed to the user: "⚠️ All providers degraded. Consultation may be slower than usual."
**And** Consultation proceeds (it does NOT fail automatically)

## Tasks / Subtasks

- [x] Create `src/consult/health/ProviderTiers.ts` (AC: #1)
  - [x] Define `ProviderHealthStatus` enum
  - [x] Define `ProviderHealth` interface
  - [x] Define default check intervals and thresholds

- [x] Create `src/consult/health/ProviderHealthMonitor.ts` (AC: #1, #2, #3, #4)
  - [x] Implement `startMonitoring()` and `stopMonitoring()`
  - [x] Implement `checkProvider(providerId)`
  - [x] Implement `updateStatus(providerId, result)`
  - [x] Implement `getHealth(providerId)`
  - [x] Integrate with `EventBus` for status updates

- [x] Update `src/providers/LLMProvider.ts`
  - [x] Add optional `healthCheck()` method (or use `chat()` with minimal prompt)

- [x] Integrate with `ConsultOrchestrator.ts` (AC: #1, #5)
  - [x] Initialize `ProviderHealthMonitor` on startup
  - [x] Add check for "all degraded" warning before starting consultation

- [x] Add Unit Tests
  - [x] `src/consult/health/__tests__/ProviderHealthMonitor.test.ts`

## Dev Notes

### Architecture Compliance

**Decision #4 from architecture.md: Provider Substitution**
- This story implements the **Health Monitoring** half of the decision.
- The **Hedged Requests** half will be implemented in Story 2.3.
- **Goal**: Proactive status tracking to avoid routing requests to dead providers.
- **Pattern**: Background interval timer (detached from user requests).

**Component Boundary:**
- `ProviderHealthMonitor` is a singleton or scoped instance managed by the application core.
- It sits in `src/consult/health/`.
- It communicates OUT via `EventBus`.
- It is queried BY `HedgedRequestManager` (next story) and `ConsultOrchestrator`.

### Technical Requirements

**File Structure:**
- Create: `src/consult/health/ProviderHealthMonitor.ts`
- Create: `src/consult/health/ProviderTiers.ts` (for types/enums)
- Modify: `src/orchestration/ConsultOrchestrator.ts`
- Modify: `src/core/EventBus.ts` (add `health:status_updated` event type)
- Modify: `src/types/consult.ts` (export health types if needed globally)

**Dependencies:**
- `EventBus` (existing)
- `LLMProvider` (existing)
- `ProviderFactory` (existing - to get provider instances)

**Health Check Implementation:**
- **Cost Minimization**: Use the cheapest model for the provider if possible, or a very short prompt (max_tokens=1).
- **Prompt**: "ping" is standard. Expected output length: ~1-5 tokens.
- **Timeout**: Strict 10s timeout for health checks. If >10s, mark as failure.

**Types (src/consult/health/ProviderTiers.ts):**
```typescript
export enum ProviderHealthStatus {
  Healthy = 'HEALTHY',
  Degraded = 'DEGRADED',
  Unhealthy = 'UNHEALTHY',
  Unknown = 'UNKNOWN'
}

export interface ProviderHealth {
  status: ProviderHealthStatus;
  lastChecked: Date;
  latencyMs: number | null;
  errorRate: number;
  consecutiveFailures: number;
}
```

### Library & Framework Requirements

- **Node.js Timers**: Use standard `setInterval` / `clearInterval`.
- **Date Handling**: Use standard `Date` or `performance.now()` for latency measurement.
- **Events**: Use the existing `EventBus` implementation.

### Previous Story Intelligence

**Learnings from Story 2.1 (Cost Gate):**
- Event emission needs `snake_case` payloads for consistency.
- New components should be strictly typed (PascalCase classes).
- Integration tests in `src/orchestration/__tests__/` are effective.

**Git Intelligence:**
- Recent commits establish `src/consult/` as the home for new features.
- Test files should be co-located in `__tests__` subdirectories (e.g., `src/consult/health/__tests__/`).

### Project Context Reference

**Provider Factory:**
- You will need to get ALL configured providers to check them.
- `ProviderFactory` might need a method to `getAllProviders()` or similar, or `ProviderHealthMonitor` needs to be passed the list.
- **Check**: Does `ProviderFactory` support listing? If not, `ProviderHealthMonitor` might need to be initialized with the active provider list from config.

**Event Schema Extension:**
- Add `health:status_updated` to `EventType` in `src/core/EventBus.ts`.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_To be filled by dev agent_

### Completion Notes List

- Implemented `ProviderHealthMonitor` with `healthCheck` support.
- Added `healthCheck` to `LLMProvider` base class.
- Integrated with `ConsultOrchestrator` to warn on degraded providers.
- `EventBus` already contained `health:status_updated`, no change needed.
- `src/types/consult.ts` not modified as types are self-contained in `ProviderTiers.ts`.
- Note: Existing regression tests for `ConsultOrchestrator` fail due to `inquirer` ESM import issues (pre-existing environment configuration). Verified new functionality with `src/consult/health/__tests__/ProviderHealthMonitor.test.ts`.

### File List

**Files Created:**
- `src/consult/health/ProviderHealthMonitor.ts`
- `src/consult/health/ProviderTiers.ts`
- `src/consult/health/__tests__/ProviderHealthMonitor.test.ts`

**Files Modified:**
- `src/orchestration/ConsultOrchestrator.ts`
- `src/providers/LLMProvider.ts`

## Status
review
