# Story 1.4: Round 2 - Synthesis with Consensus Building

**Status:** review
**Story Type:** Feature
**Epic:** Epic 1: 4-Round Multi-Model Consultation Engine
**Sprint:** 1
**Developer:** AI Agent
**Estimates:** 5 points

## Description

As a **developer**,
I want Round 2 (Synthesis) to identify consensus points and tensions from Round 1 artifacts,
So that the debate builds structured understanding before cross-examination.

## Acceptance Criteria

- [x] **Given** Round 1 (Independent) completed with 2+ agent artifacts
  - **When** State transitions to Synthesis
  - **Then** System creates synthesis context from Round 1 artifacts
  - **And** Judge agent (GPT-4o) receives all IndependentSchema artifacts
  - **And** Judge prompt asks to extract:
    - Consensus points (what agents agree on)
    - Tensions (where agents disagree)
    - Priority order (most important topics)
  - **And** Judge response is extracted into SynthesisSchema artifact with:
    - consensus_points[] with supporting_agents[] and confidence per point
    - tensions[] with viewpoints[] from different agents
    - priority_order[] ranking topics
    - schema_version: "1.0"
  - **And** System emits `consultation:round_artifact` event with round_number: 2
  - **And** State transitions: Synthesis → CrossExam (Note: Currently transitions to Complete as partial impl)

- [x] **Given** Judge fails during synthesis
  - **When** Synthesis extraction fails
  - **Then** Consultation aborts with state = Aborted
  - **And** Error logged with round context

## Tasks/Subtasks

- [x] Define `SynthesisSchema` and related types
  - [x] Create `src/consult/artifacts/schemas/SynthesisSchema.ts`
  - [x] Add types to `src/types/consult.ts` if needed (ConsensusPoint, Tension, etc.)
  - [x] Update `ArtifactTransformer` to handle SynthesisSchema
- [x] Implement `SynthesisRound` logic
  - [x] Create prompt template for Synthesis (Judge)
  - [x] Implement `executeSynthesis` method in `ConsultOrchestrator` (or separate class)
  - [x] Handle 2+ artifacts requirement
- [x] Wire up State Machine
  - [x] Ensure transition Independent → Synthesis works
  - [x] Implement Synthesis → CrossExam transition (Modified to Synthesis -> Complete for this story)
  - [x] Handle Abort on failure
- [x] Verify Event Emission
  - [x] Emit `consultation:round_artifact` with correct payload

## Dev Notes

- **Architecture:**
  - Round 2 is the first point where agents stop working independently.
  - The "Judge" is GPT-4o (as defined in Epic 1).
  - Use `SynthesisSchema` to strictly type the output.
  - The context passed to the Judge should include the formatted output of Round 1.

- **Types:**
  - Need `ConsensusPoint`: { point: string, supporting_agents: string[], confidence: number }
  - Need `Tension`: { point: string, viewpoints: { agent_id: string, view: string }[] }
  - Need `SynthesisSchema`: extends BaseArtifact, plus above fields.

## Dev Agent Record

### Implementation Plan
- [x] Create Schema
- [x] Create Prompt
- [x] Implement Logic
- [x] Test

### Completion Notes
- Implemented `SynthesisSchema` in `src/consult/artifacts/schemas/SynthesisSchema.ts`.
- Updated `ArtifactExtractor` to support `extractSynthesisArtifact`.
- Updated `ConsultOrchestrator` to include `executeRound2Synthesis`.
- Added `getSynthesisPrompt` with specific JSON schema instructions for the Judge.
- Verified with new test suite `src/orchestration/__tests__/ConsultOrchestratorRound2.test.ts` and existing tests.
- Note: Transition logic temporarily goes Synthesis -> Complete to allow testing of this story in isolation without implementing Round 3 yet.

## File List
- src/consult/artifacts/schemas/SynthesisSchema.ts
- src/consult/artifacts/ArtifactExtractor.ts
- src/orchestration/ConsultOrchestrator.ts
- src/orchestration/__tests__/ConsultOrchestratorRound2.test.ts
- src/orchestration/__tests__/ConsultOrchestrator.test.ts

## Change Log
- [2025-12-29] Story created.
- [2025-12-29] Implemented Round 2 Synthesis logic and tests.