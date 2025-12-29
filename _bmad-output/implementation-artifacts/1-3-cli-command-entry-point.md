# Story: CLI Command Entry Point with Basic Cost Estimation and Real-Time Progress

**Story Key:** 1-3-cli-command-entry-point
**Epic:** Epic 1: 4-Round Multi-Model Consultation Engine
**Status:** in-progress

## Story

As a **developer**,
I want a working CLI command that flows through the full state machine with basic cost estimation and real-time progress display,
So that consultations work end-to-end following the validated architecture and satisfy FR12 (real-time streaming).

## Acceptance Criteria

- [ ] **Command Execution:** `llm-conclave consult "question"` creates ConsultOrchestrator, transitions Idle → Estimating, emits `consultation:started`.
- [ ] **Cost Estimation:** In Estimating state, calculates basic pre-flight cost (tokens * price) and emits `consultation:cost_estimated`.
- [ ] **Auto-Approval:** In AwaitingConsent state, auto-approves, emits `consultation:user_consent` (approved: true), transitions to Independent.
- [ ] **Real-Time Progress:** CLI subscribes to events and displays progress (`started`, `thinking`, `completed`, `round:completed`) using Chalk.
- [ ] **Help & Validation:** `--help` shows usage; missing question shows error.
- [ ] **Hardcoded Pricing:** Uses defined pricing for Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro.

## Tasks/Subtasks

- [x] **Setup Command Structure**
  - [x] Create `src/commands/consult.ts` with Commander.js definition
  - [x] Register command in main CLI entry point (if needed)
  - [x] Implement input validation (question required)
  - [x] Add `--help` description

- [x] **Implement Cost Estimation Logic**
  - [x] Create `src/consult/cost/CostEstimator.ts`
  - [x] Implement token estimation (input length/4, output fixed 2000/round)
  - [x] Implement pricing dictionary (Claude, GPT-4o, Gemini)
  - [x] Implement `estimateCost(question, agents)` method

- [x] **Implement Progress Display**
  - [x] Create `src/cli/ConsultConsoleLogger.ts` (or inline in command) to handle EventBus events
  - [x] Subscribe to `consultation:started`, `agent:thinking`, `agent:completed`, `round:completed`, `consultation:completed`
  - [x] Use `chalk` and `ora` (if available) for visual feedback
  - [x] Handle "hanging" prevention with clear status updates

- [x] **Integrate with Orchestrator**
  - [x] Instantiate `ConsultOrchestrator` in command action
  - [x] Wire up CostEstimator to Orchestrator (or Orchestrator uses it internally)
  - [x] Trigger execution flow
  - [x] Handle auto-approval logic in the command or orchestrator callback

- [x] **Tests**
  - [x] Unit test for `CostEstimator`
  - [x] Integration test for `consult` command (mocking Orchestrator/EventBus)

## Dev Notes

**Implementation Note:** Epic 2 will add user consent prompts, thresholds, and sophisticated cost controls. Epic 1 auto-approves everything to deliver working consultations.

**Architecture:**
- `src/commands/consult.ts` - Entry point
- `src/consult/cost/` - New directory for cost logic
- `src/orchestration/ConsultStateMachine.ts` - Existing state machine to drive transitions
- `src/types/consult.ts` - Existing types

## Dev Agent Record

### Implementation Plan
- [x] TBD

### Completion Notes
- Implemented `consult` command with `ConsultConsoleLogger` for real-time feedback.
- Refactored `ConsultOrchestrator` to remove direct console logging and use `EventBus` for all lifecycle events.
- Implemented `CostEstimator` with hardcoded pricing for Claude, GPT-4o, and Gemini.
- Added `ArtifactTransformer.consultationResultToJSON` to bridge the gap between `consult.ts` camelCase types and `index.ts` snake_case types required by logging.
- Added unit tests for `consult` command verification.
- Fixed EventBus payload handling in console logger and added `round:completed` event type support.
- Aligned cost estimation input token math with story guidance.
- Enforced non-empty question and restored default 4-round max.
- Captured failed agent responses with error metadata for auditability.

## File List
- src/commands/consult.ts
- src/consult/cost/CostEstimator.ts
- src/cli/ConsultConsoleLogger.ts
- src/orchestration/ConsultOrchestrator.ts
- src/consult/artifacts/ArtifactTransformer.ts
- src/commands/__tests__/consult.test.ts
- src/core/EventBus.ts
- src/types/consult.ts

## Change Log
- Refactored ConsultOrchestrator for event-driven output
- Added CostEstimator logic
- Added ConsultConsoleLogger
- [2025-12-29] Fixed cost estimation math, console event payload handling, and question validation.

## Status
in-progress
