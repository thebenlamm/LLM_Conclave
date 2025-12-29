# Story 1.5: Round 3 - Cross-Examination with Challenge/Rebuttal

**Status:** review
**Story Type:** Feature
**Epic:** Epic 1: 4-Round Multi-Model Consultation Engine
**Sprint:** 1
**Developer:** AI Agent
**Estimates:** 5 points

## Description

As a **developer**,
I want Round 3 (Cross-Examination) to allow agents to challenge each other's positions,
So that weak arguments are exposed and strengthened through debate.

## Acceptance Criteria

- [x] **Given** Round 2 (Synthesis) completed successfully
  - **When** State transitions to CrossExam
  - **Then** Each agent receives:
    - Their own Round 1 position
    - The Synthesis artifact (consensus + tensions)
    - Adversarial prompt: "Challenge the consensus or defend your position"
  - **And** All 3 agents execute in parallel
  - **And** Each agent response is extracted into a challenge/rebuttal structure
  - **And** Judge synthesizes into CrossExamSchema artifact with:
    - challenges[] with challenger, target_agent, challenge, evidence[]
    - rebuttals[] with agent, rebuttal text
    - unresolved[] listing unresolved tensions
    - schema_version: "1.0"
  - **And** System emits `consultation:round_artifact` event with round_number: 3
  - **And** State transitions: CrossExam → Verdict (Note: Currently transitions to Complete as Verdict is pending)

- [x] **Given** Agents provide no new challenges in Round 3
  - **When** Cross-examination completes
  - **Then** unresolved[] is empty
  - **And** Verdict proceeds normally

## Tasks/Subtasks

- [x] **Define CrossExam Schemas and Types**
  - [x] Create `src/consult/artifacts/schemas/CrossExamSchema.ts`
  - [x] Add `CrossExamArtifact` interface to `src/types/consult.ts`
  - [x] Add supporting types: `Challenge`, `Rebuttal`, `UnresolvedTension`
  - [x] Update `ArtifactTransformer` to handle CrossExamSchema

- [x] **Implement Cross-Exam Prompting Strategy**
  - [x] Create `getCrossExamPrompt(agentContext, synthesisArtifact)` in `ConsultOrchestrator`
  - [x] Create `getCrossExamSynthesisPrompt(agentResponses, previousSynthesis)` for the Judge
  - [x] Ensure prompt encourages adversarial/constructive critique based on mode (default: converge)

- [x] **Implement Round 3 Execution Logic**
  - [x] Implement `executeRound3CrossExam` in `ConsultOrchestrator`
  - [x] Fetch Round 1 and Round 2 artifacts
  - [x] Parallel execution of all 3 agents with new prompts
  - [x] Judge execution to synthesize challenges/rebuttals
  - [x] Handle `ArtifactExtractor` updates for new schemas

- [x] **Wire State Machine and Events**
  - [x] Enable `ConsultState.CrossExam` transition in `ConsultOrchestrator`
  - [x] Emit `consultation:round_artifact` (Round 3)
  - [x] Transition CrossExam → Verdict (Updated to transition to Complete until Round 4 is ready)
  - [x] Updated State Machine to allow CrossExam -> Complete

- [x] **Tests**
  - [x] Create unit tests for CrossExam schema validation
  - [x] Create integration test `src/orchestration/__tests__/ConsultOrchestratorRound3.test.ts`
  - [x] Verify parallel execution and judge synthesis
  - [x] Updated existing tests to support full 3-round flow

## Dev Notes

**Architecture:**
- Round 3 is where the "Debate" happens.
- Agents see the Consensus from Round 2.
- If they agree with consensus, they defend it.
- If they disagree (their view is in Tensions), they challenge the consensus.
- The "Judge" synthesizes this into a specific artifact that lists "Challenges" (attacks on ideas) and "Rebuttals" (defense).

**Data Structure:**
- `CrossExamArtifact`:
  - `challenges`: Array of `{ challenger: string, target_point: string, criticism: string }`
  - `rebuttals`: Array of `{ defender: string, target_challenge: string, defense: string }`
  - `unresolved`: List of tensions that remain high.

**Prompt Strategy:**
- Need to feed the agent:
  1. "Here is what you said in Round 1" (Position)
  2. "Here is the group consensus from Round 2" (Synthesis)
  3. "Identify where the group ignores your key points, or where the group is wrong."

## Dev Agent Record

### Implementation Plan
- [x] Implement Schema and Transformer
- [x] Implement Prompts
- [x] Implement Logic and State Machine Updates
- [x] Testing

### Completion Notes
- Implemented `CrossExamSchema` with strict validation.
- Updated `ArtifactExtractor` to map JSON to types.
- Implemented robust `executeRound3CrossExam` with parallel agent execution.
- Added comprehensive prompts for Agents (to critique/defend) and Judge (to synthesize).
- Updated `ConsultStateMachine` to allow `CrossExam -> Complete` as an interim step for Story 1.5.
- Created `ConsultOrchestratorRound3.test.ts` and updated `ConsultOrchestrator.test.ts` and `Round2.test.ts` to support the expanded flow.
- All tests passed.

## File List
- src/consult/artifacts/schemas/CrossExamSchema.ts
- src/types/consult.ts
- src/consult/artifacts/ArtifactExtractor.ts
- src/consult/artifacts/ArtifactTransformer.ts
- src/orchestration/ConsultOrchestrator.ts
- src/orchestration/ConsultStateMachine.ts
- src/orchestration/__tests__/ConsultOrchestratorRound3.test.ts
- src/orchestration/__tests__/ConsultOrchestratorRound2.test.ts
- src/orchestration/__tests__/ConsultOrchestrator.test.ts

## Change Log
- [2025-12-29] Story created from Epics.
- [2025-12-29] Implemented Round 3 Cross-Examination.

## Status
review