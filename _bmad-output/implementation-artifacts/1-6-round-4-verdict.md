# Story 1.6: Round 4 - Verdict with Final Recommendation

**Status:** review
**Story Type:** Feature
**Epic:** Epic 1: 4-Round Multi-Model Consultation Engine
**Sprint:** 1
**Developer:** AI Agent
**Estimates:** 5 points

## Description

As a **developer**,
I want Round 4 (Verdict) to produce a final recommendation with confidence and dissent tracking,
So that users get actionable consensus with full transparency.

## Acceptance Criteria

- [x] **Given** Round 3 (CrossExam) completed successfully
  - **When** State transitions to Verdict
  - **Then** Judge agent receives all 3 round artifacts:
    - Round 1: Independent positions
    - Round 2: Consensus + tensions
    - Round 3: Challenges + rebuttals
  - **And** Judge prompt asks for final synthesis
  - **And** Judge response is extracted into VerdictSchema artifact with:
    - recommendation (final answer to user's question)
    - confidence (0.0-1.0 based on agreement level)
    - evidence[] (key supporting points)
    - dissent[] with agent, concern, severity fields
    - schema_version: "1.0"
  - **And** System emits `consultation:round_artifact` event with round_number: 4
  - **And** State transitions: Verdict → Complete
  - **And** System emits `consultation:completed` event

- [x] **Given** Confidence score is < 0.70
  - **When** Verdict is generated
  - **Then** Dissent[] is populated with concerns from minority agents

- [x] **Given** All agents strongly agree
  - **When** Confidence is calculated
  - **Then** Confidence >= 0.85
  - **And** Dissent[] is empty or contains minor concerns only

## Tasks/Subtasks

- [x] **Define Verdict Schemas and Types**
  - [x] Create `src/consult/artifacts/schemas/VerdictSchema.ts`
  - [x] Ensure `VerdictArtifact` and `Dissent` interfaces exist in `src/types/consult.ts`
  - [x] Update `ArtifactTransformer` to handle VerdictSchema

- [x] **Implement Verdict Prompting Strategy**
  - [x] Create `getVerdictPrompt(allArtifacts)` in `ConsultOrchestrator`
  - [x] Ensure prompt specifically asks to weigh Round 3 challenges when forming the verdict

- [x] **Implement Round 4 Execution Logic**
  - [x] Implement `executeRound4Verdict` in `ConsultOrchestrator`
  - [x] Pass full history (R1, R2, R3) to Judge
  - [x] Handle `ArtifactExtractor` updates for Verdict
  - [x] Calculate/Extract confidence and dissent mapping

- [x] **Wire State Machine and Events**
  - [x] Enable `ConsultState.Verdict` transition
  - [x] Emit `consultation:round_artifact` (Round 4)
  - [x] Emit `consultation:completed` with final result

- [x] **Tests**
  - [x] Create unit tests for Verdict schema validation
  - [x] Create integration test `src/orchestration/__tests__/ConsultOrchestratorRound4.test.ts`
  - [x] Verify confidence logic and dissent extraction
  - [x] Updated all existing tests to pass with Round 4 implementation

## Dev Notes

**Architecture:**
- The "Verdict" is the final output.
- It is NOT just a summary; it is a **decision**.
- The Judge must look at:
  1. R1: Original ideas.
  2. R2: What everyone agreed on.
  3. R3: What withstood cross-examination.
- If a point was challenged in R3 and NOT rebutted well, it should be discarded.
- If a point survived R3, it becomes Evidence.

**Data Structure:**
- `VerdictArtifact`:
  - `recommendation`: The clear, actionable answer.
  - `confidence`: Numeric score.
  - `evidence`: Why we believe this (citing R1/R2/R3 findings).
  - `dissent`: "Agent X still disagrees because Y."

**Confidence Logic:**
- If Dissent array is empty -> High confidence (>0.9).
- If Dissent has 'High' severity items -> Low confidence (<0.7).
- If Dissent has 'Low' severity items -> Medium confidence (0.7-0.9).

## Dev Agent Record

### Implementation Plan
- [x] Define Types & Schemas
- [x] Implement Logic
- [x] Tests

### Completion Notes
- Implemented `VerdictSchema` with strict validation.
- Updated `ArtifactExtractor` and `ArtifactTransformer` for Verdict artifacts.
- Added `getVerdictPrompt` to synthesize R1, R2, and R3 artifacts into a final decision.
- Implemented `executeRound4Verdict` and updated the `consult` method to execute the full 4-round pipeline.
- Verified with `ConsultOrchestratorRound4.test.ts` and updated all other orchestrator tests.
- All tests passing.

## File List
- src/consult/artifacts/schemas/VerdictSchema.ts
- src/consult/artifacts/ArtifactExtractor.ts
- src/consult/artifacts/ArtifactTransformer.ts
- src/orchestration/ConsultOrchestrator.ts
- src/orchestration/__tests__/ConsultOrchestratorRound4.test.ts
- src/orchestration/__tests__/ConsultOrchestratorRound3.test.ts
- src/orchestration/__tests__/ConsultOrchestratorRound2.test.ts
- src/orchestration/__tests__/ConsultOrchestrator.test.ts

## Change Log
- [2025-12-29] Story created from Epics.
- [2025-12-29] Implemented Round 4 Verdict.

## Status
review