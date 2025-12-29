# Story 1.8: Consultation Logging with JSONL and Prompt Versioning

**Status:** review
**Story Type:** Feature
**Epic:** Epic 1: 4-Round Multi-Model Consultation Engine
**Sprint:** 1
**Developer:** AI Agent
**Estimates:** 5 points

## Description

As a **developer**,
I want all consultations logged to structured JSONL files with prompt version tracking,
So that we have a complete audit trail for analysis and debugging.

## Acceptance Criteria

- [x] **Given** Consultation completed (State = Complete)
  - **When** ConsultLogger processes the result
  - **Then** A JSONL file is written to `~/.llm-conclave/consult-logs/`
  - **And** Filename format: `consult-[consultation_id].json`
  - **And** Log directory is auto-created if it doesn't exist

- [x] **JSONL Log Structure:**
  - **Then** Each log file contains one JSON object with:
    - All fields from ConsultationResult interface
    - schema_version: "1.0"
    - prompt_versions{} object with:
      - independent_prompt_version: "v1.0"
      - synthesis_prompt_version: "v1.0"
      - cross_exam_prompt_version: "v1.0"
      - verdict_prompt_version: "v1.0"
  - **And** All round artifacts are included
  - **And** Token usage is tracked per agent per round
  - **And** Total cost calculated correctly

- [x] **Markdown Summary:**
  - **When** Consultation is logged
  - **Then** A companion Markdown file is also written
  - **And** Filename: `consult-[consultation_id].md`
  - **And** Content matches Story 1.7 Markdown format

- [x] **Given** Disk space is full
  - **When** Logging attempts to write
  - **Then** Error is logged to console: "Failed to write consultation log: [reason]"
  - **And** Consultation result is still returned to user

- [x] **Given** Log directory has no write permissions
  - **When** Logger attempts to create file
  - **Then** Error is logged with clear message about permissions

## Tasks/Subtasks

- [x] **Setup Logging Infrastructure**
  - [x] Create `src/consult/logging/ConsultationFileLogger.ts`
  - [x] Define log directory path: `~/.llm-conclave/consult-logs/`
  - [x] Implement directory creation with proper error handling
  - [x] Add filename generation logic: `consult-[consultation_id].json`

- [x] **Implement JSONL Logger**
  - [x] Create method `logConsultation(result: ConsultationResult)`
  - [x] Add prompt version tracking to result object
  - [x] Serialize to JSON with snake_case (use ArtifactTransformer)
  - [x] Write to JSONL file atomically
  - [x] Handle write errors gracefully (log to console, don't fail consultation)

- [x] **Implement Markdown Logger**
  - [x] Reuse MarkdownFormatter from Story 1.7
  - [x] Write companion `.md` file with same consultation_id
  - [x] Ensure formatting matches Story 1.7 spec

- [x] **Add Prompt Versioning**
  - [x] Track prompt versions in ConsultOrchestrator
  - [x] Add prompt_versions field to ConsultationResult type
  - [x] Populate versions for all 4 rounds

- [x] **Wire into Orchestrator**
  - [x] Integrate ConsultationFileLogger into ConsultOrchestrator
  - [x] Call logger after consultation completes (State = Complete)
  - [x] Ensure logging doesn't block user getting result

- [x] **Tests**
  - [x] Unit tests for ConsultationFileLogger
  - [x] Test file creation and directory handling
  - [x] Test error handling (permissions, disk full simulation)
  - [x] Integration test for end-to-end logging

## Dev Notes

**Architecture:**
- `src/consult/logging/ConsultationFileLogger.ts` - New logging module
- Reuse `MarkdownFormatter` from Story 1.7
- Use `ArtifactTransformer` for JSON snake_case conversion
- Log directory: `~/.llm-conclave/consult-logs/`

**Error Handling:**
- Logging failures must NOT block consultation completion
- Always log errors to console with helpful messages
- Consider using try-catch around entire logging operation

**Prompt Versioning:**
- Hardcode version "v1.0" for all prompts in Epic 1
- Future enhancement: dynamic version tracking from prompt templates

**File Format:**
- JSON file: Single JSON object (not newline-delimited for now)
- Markdown file: Human-readable summary using Story 1.7 format

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.5

### Implementation Plan
- Created ConsultationFileLogger with JSON and Markdown logging
- Integrated into ConsultOrchestrator after consultation completion
- Added comprehensive tests with 100% pass rate
- Reused existing MarkdownFormatter from Story 1.7
- Used ArtifactTransformer for snake_case JSON conversion

### Debug Log References
None

### Completion Notes
- Implemented ConsultationFileLogger with atomic file writes
- Directory auto-creation with proper error handling
- Logging is non-blocking (fire-and-forget pattern)
- Error handling ensures logging failures don't block consultation results
- Prompt versioning already existed in ConsultationResult type
- All 5 acceptance criteria validated and passing
- 5 new tests added, all passing (92/92 total tests)

## File List
- src/consult/logging/ConsultationFileLogger.ts (new)
- src/consult/logging/__tests__/ConsultationFileLogger.test.ts (new)
- src/orchestration/ConsultOrchestrator.ts (modified - added logger integration)

## Change Log
- [2025-12-29] Story created from epic file.
- [2025-12-29] Implemented ConsultationFileLogger with JSON and Markdown logging.
- [2025-12-29] Integrated logger into ConsultOrchestrator.
- [2025-12-29] Added comprehensive unit tests (5 tests, all passing).
- [2025-12-29] Validated all acceptance criteria - marked story ready for review.
