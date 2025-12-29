# Story 1.7: Output Formatting - Markdown and JSON-LD

Status: review

## Story

As a **developer**,
I want to format consultation results in both human-readable Markdown and machine-readable JSON-LD,
so that results work for both humans and programmatic workflows.

## Acceptance Criteria

- [x] **Given** Consultation completed (State = Complete)
  - **When** Output formatter processes the result
  - **Then** Markdown output includes:
    - Question
    - Consensus summary (from Verdict)
    - Confidence score as percentage
    - Agent perspectives (one section per agent with their opinion)
    - Concerns raised
    - Dissenting views (if any)
    - Cost summary (tokens + USD)
    - Duration in seconds

- [x] **Markdown Format Compliance:**
  - Must follow the structure:
    ```markdown
    # Consultation Summary
    **Question:** [question]
    **Confidence:** [confidence]%
    ## Consensus
    [verdict recommendation]
    ## Agent Perspectives
    ### [Agent Name] ([model])
    [opinion]
    ## Concerns Raised
    - [concern 1]
    ## Dissenting Views
    - [dissent if any]
    ---
    **Cost:** $[cost] | **Duration:** [seconds]s | **Tokens:** [total]
    ```

- [x] **JSON-LD Output:**
  - **When** `--format json` flag is used
  - **Then** System outputs complete JSON object with:
    - consultation_id
    - timestamp (ISO 8601)
    - question
    - context
    - agents[] with name and model
    - rounds: 4
    - All 4 round artifacts in responses{}
    - consensus, confidence, recommendation, reasoning{}
    - concerns[], dissent[], perspectives[]
    - cost{} with tokens{} and usd
    - duration_ms
  - **And** JSON uses snake_case for all field names
  - **And** All artifacts include schema_version field

- [x] **Default Behavior:**
  - **Given** Default format (no --format flag)
  - **When** Output is displayed
  - **Then** Markdown is shown to terminal

## Tasks / Subtasks

- [x] **Implement Output Formatter Infrastructure** (AC: All)
  - [x] Define `OutputFormat` enum (MARKDOWN, JSON, BOTH)
  - [x] Create `IOutputFormatter` interface
  - [x] Implement `MarkdownFormatter` class
  - [x] Implement `JsonLdFormatter` class

- [x] **Markdown Formatter Implementation** (AC: Markdown Format Compliance)
  - [x] Implement template-based Markdown generation
  - [x] Ensure all fields from `ConsultationResult` are mapped correctly
  - [x] Format currency and duration for readability

- [x] **JSON-LD Formatter Implementation** (AC: JSON-LD Output)
  - [x] Implement `toJsonLd()` using `ArtifactTransformer` for snake_case conversion
  - [x] Ensure `schema_version` is included in all nested artifacts
  - [x] Validate output against JSON-LD expectations

- [x] **CLI Integration** (AC: Default Behavior)
  - [x] Update `src/commands/consult.ts` to accept `--format` flag (using Commander.js)
  - [x] Wire the formatter into the `ConsultOrchestrator` or command handler
  - [x] Ensure streaming output remains unaffected while formatting the final result

- [x] **Testing** (AC: All)
  - [x] Unit tests for `MarkdownFormatter`
  - [x] Unit tests for `JsonLdFormatter`
  - [x] Integration test for `consult` command with different formats

## Dev Notes

- **Architecture Patterns:** Use the Strategy pattern for formatters to allow easy addition of new formats (e.g., HTML, CSV) in the future.
- **Transformer:** Leverage the existing `ArtifactTransformer` to handle the camelCase to snake_case conversion for JSON output.
- **Nomenclature:** Ensure agent names and models are correctly retrieved from the `ConsultationResult`.
- **Source Tree:**
  - `src/consult/formatting/` - Create new directory for formatters.
  - `src/commands/consult.ts` - Main entry point to update.
  - `src/types/consult.ts` - Ensure all types support the formatting needs.

### Project Structure Notes

- Follow PascalCase for formatter classes.
- Use camelCase for internal variables.
- JSON output must be strictly snake_case as per architectural decision #2.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Decision 2]

## Dev Agent Record

### Agent Model Used

Gemini 2.0 Flash

### Debug Log References

### Completion Notes List

- Implemented `OutputFormat` enum and `IOutputFormatter` interface in `src/types/consult.ts`.
- Created `MarkdownFormatter` and `JsonLdFormatter` using the Strategy pattern.
- Implemented `FormatterFactory` for centralized format management.
- Refactored `ConsultLogger` to use the new formatters and handle JSON transformation internally.
- Updated `src/commands/consult.ts` to support the `--format` flag and use the new formatting infrastructure.
- Verified implementation with unit tests for formatters and integration tests for the CLI command.
- Fixed existing tests to accommodate the changes in `ConsultLogger`.

### File List

- src/types/consult.ts
- src/consult/formatting/IOutputFormatter.ts (interface embedded in types)
- src/consult/formatting/MarkdownFormatter.ts
- src/consult/formatting/JsonLdFormatter.ts
- src/consult/formatting/FormatterFactory.ts
- src/utils/ConsultLogger.ts
- src/commands/consult.ts
- src/consult/formatting/__tests__/Formatters.test.ts
- src/commands/__tests__/ConsultFormatIntegration.test.ts
- src/commands/__tests__/consult.test.ts (updated)
