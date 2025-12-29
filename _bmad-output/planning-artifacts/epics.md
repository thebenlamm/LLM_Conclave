---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/architecture-consult-mode-2025-12-27.md
requirementsValidated: true
functionalRequirements: 24
nonFunctionalRequirements: 9
architecturalDecisions: 7
totalEpics: 5
totalStories: 24
epicsApproved: true
storiesComplete: true
validationComplete: true
readyForDevelopment: true
workflowComplete: true
completedDate: 2025-12-28
---

# llm_conclave - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for llm_conclave Consult Mode, decomposing the requirements from the PRD and Architecture documents into implementable stories.

## Requirements Inventory

### Functional Requirements

**Consultation Orchestration (The Core Engine)**

FR1: The system can execute a multi-round consultation between 3+ distinct LLM agents.

FR2: The system can run agents in parallel for the initial analysis phase to minimize total latency.

FR3: The system can synthesize the output of all agents into a unified "Debate Context."

FR4: The system can force agents to critique peer outputs based on specific adversarial or constructive prompts.

FR5: The system can operate in a **Convergent Mode** (`converge`) that uses "No, Because..." prompts to drill down to a single definitive answer.

FR6: The system can operate in an **Exploration Mode** (`explore`) that uses "Yes, And..." prompts to preserve and catalog a diverse menu of ideas.

FR7: The system can dynamically terminate a consultation once a user-defined confidence threshold is met or a maximum round limit is reached.

FR8: The system can track and report "Value Added by Debate" by comparing agent positions across rounds.

**CLI Interface & Interaction**

FR9: Users can invoke a consultation via a single CLI command (`consult`).

FR10: Users can provide explicit file or text context using a command-line flag (`--context`).

FR11: Users can select the operational mode (`explore` or `converge`) via a command-line flag.

FR12: The system can stream the progress of the multi-agent debate to the terminal in real-time.

FR13: Users can specify the desired output format (`markdown` or `json`) via a command-line flag.

FR14: The system can accept input via standard input (stdin) piping.

**Data & Output Handling**

FR15: The system can generate a human-readable Markdown summary including agent perspectives and consensus results.

FR16: The system can generate a machine-readable JSON-LD object containing all consultation metadata.

FR17: The system can log all consultation sessions (inputs, rounds, results, costs) to a local file system.

FR18: The system can calculate and display the total token usage and USD cost for each consultation.

FR19: The system can identify and highlight dissenting opinions in the final consensus report.

**Persona & Context Management**

FR20: The system can load specialized expert personas (e.g., Security Expert, Hebrew Linguist) based on task classification.

FR21: The system can detect when a user is working on a "Brownfield" project and automatically biased its reasoning toward existing project documentation.

FR22: The system can persist session state to allow for future "Resume & Continuation" features (Post-MVP).

**Analytics & Reporting**

FR23: Users can view a dashboard of usage, performance, and cost analytics via a CLI command (`consult-stats`).

FR24: The system can report confidence scores for consensus results to indicate certainty level.

### Non-Functional Requirements

**Performance & User Control**

NFR1 (Soft Timeouts): The system shall not enforce absolute hard timeouts. Instead, it will use a **60-second Interactive Pulse**. If a round exceeds 60 seconds, the system must ask the user: *"Still waiting on [Agent Name]. Continue waiting? [Y/n]"*.

NFR2 (Latency Visibility): The system must provide real-time feedback on which agent is currently processing to prevent the terminal from appearing "hung."

**Reliability & Resilience**

NFR3 (Smart Provider Substitution): In the event of a provider failure (e.g., API timeout or 5xx error), the system must not fail the consultation. Instead, it must offer the user a substitution: *"Gemini is unavailable. Switch to xAI (Grok) for this agent? [Y/n/Fail]"*.

NFR4 (Session Persistence): The system must save intermediate "Partial Consensus" artifacts. If the user eventually kills a long-running session, they should still be able to access the completed work from earlier rounds.

**Security & Privacy**

NFR5 (Local Context Scrubbing): The CLI shall implement a regex-based **Sensitive Data Filter** to detect and mask common patterns (API keys, passwords, SECRET_KEY) in the `--context` before transmission to external providers.

NFR6 (Auditability): Every consultation log must include the exact **Prompt Version** used for each debate phase to ensure that changes in reasoning quality can be traced back to prompt engineering.

**Cost Management**

NFR7 (Informed Consent): For large contexts (>10k tokens), the system must provide a pre-flight cost estimate. The system will **not** block execution based on cost, but will wait for user confirmation: *"Estimated cost is $0.45. Proceed? [Y/n]"*.

NFR8 (Token Efficiency): The system must support **Token-Efficient Debate**. In the debate rounds (Phase 2 & 3), agents should receive condensed summaries of peer outputs rather than full verbatim histories unless the user explicitly requests `--verbose`.

**Testability**

NFR9 (Ground Truth Benchmarking): The system must include a `benchmark` mode that allows it to run against "Known Good" historical transcriptions (Super OCR) to calculate and report accuracy metrics.

### Additional Requirements

**Technical Stack (Brownfield Extension)**

- Language: TypeScript (Node.js >=14.0.0)
- CLI Framework: Commander.js v14 (existing)
- LLM SDKs: Anthropic SDK, OpenAI SDK, Google GenAI SDK (existing)
- CLI UI: Inquirer, Chalk, Ora (existing)
- Web Mode: Express v5 + Socket.io v4 (existing)
- Build: TypeScript compiler, ts-node for development
- Configuration: ConfigCascade system (existing)

**Architectural Decisions (Validated via Conclave)**

1. **Orchestration Architecture**: Hybrid State Machine + Event-Driven with XState or custom TypeScript implementation
   - State definitions: Idle, Estimating, AwaitingConsent, Independent, Synthesis, CrossExam, Verdict, Complete, Aborted
   - Event-Driven layer for parallel execution and progress streaming

2. **Debate Round Management**: Structured Artifact Extraction
   - Round 1 (Independent): `{ agentId, position, keyPoints[], rationale }`
   - Round 2 (Synthesis): `{ consensusPoints[], tensions[], priorityOrder[] }`
   - Round 3 (Cross-Exam): `{ challenges[], rebuttals[], unresolved[] }`
   - Round 4 (Verdict): `{ recommendation, confidence, evidence[], dissent[] }`
   - All artifacts require `schema_version` field

3. **Mode Switching**: Behavior Strategy Pattern
   - ExploreStrategy: Divergent prompts, "Yes, And..." logic
   - ConvergeStrategy: Consensus prompts, "No, Because..." logic
   - Mode-specific prompt templates versioned separately

4. **Provider Substitution**: Hybrid Proactive Health Monitoring + Hedged Requests
   - Background health checks update provider status
   - Hedged requests: if primary slow (>10s), send to backup provider
   - Provider tiers: Tier 1 (Premium), Tier 2 (Standard), Tier 3 (Fast/Cheap)

5. **Cost Gate Implementation**: Dynamic Cost Estimation with Consent
   - Pre-flight calculation with user prompt for costs >$0.50
   - Config setting: `alwaysAllowUnder: 0.50` (dollars)
   - In-flight monitoring: abort if actual exceeds estimate by >50%

6. **Streaming Architecture**: Hybrid EventEmitter (CLI) + Socket.io (Web UI)
   - CLI events: consultation:started, round:started, agent:thinking, agent:completed, round:completed, consultation:completed
   - Web UI: Socket.io broadcasting same events with authentication

7. **Analytics Storage**: Hybrid JSON + SQLite Index
   - JSONL storage: Append-only in `~/.llm-conclave/consult-logs/`
   - SQLite index: Fast queries for consult-stats
   - Write pattern: JSON first (source of truth), SQLite write-through

**Implementation Patterns**

- File naming: PascalCase for TypeScript files (ConsultOrchestrator.ts)
- Variable/function naming: camelCase (estimatedCost, executeAgent)
- JSON field naming: snake_case for external consistency (agent_id, round_number)
- Event naming: colon-separated lowercase (consultation:started, agent:thinking)
- Directory naming: lowercase (consult/, strategies/, artifacts/)

**Project Structure (New Components)**

- `src/orchestration/ConsultStateMachine.ts` - State machine implementation
- `src/consult/` - New directory for consult-specific code
  - `strategies/` - ModeStrategy interface, ExploreStrategy, ConvergeStrategy
  - `artifacts/` - ArtifactExtractor, ArtifactValidator, schemas/
  - `health/` - ProviderHealthMonitor, HedgedRequestManager, ProviderTiers
  - `cost/` - CostEstimator, CostGate, ProviderPricing
  - `analytics/` - ConsultLogger (existing), AnalyticsIndexer, StatsQuery
- `src/commands/consult.ts` - Enhanced CLI command
- `src/commands/consult-stats.ts` - Enhanced stats command

**Infrastructure & Deployment**

- User data directory: `~/.llm-conclave/`
- Consult logs: `~/.llm-conclave/consult-logs/` (JSONL format)
- Analytics database: `~/.llm-conclave/consult-analytics.db` (SQLite)
- Config file: `~/.llm-conclave/config.json`

**Monitoring & Logging Requirements**

- All consultations logged to structured JSONL format with schema_version
- State transitions logged via EventBus
- Provider substitutions logged with reason (timeout/failure/health_check)
- Prompt version tracking in all consultation logs
- Cost tracking per consultation with per-provider breakdown

**Security Implementation**

- Regex-based sensitive data filter before external transmission
- Patterns to detect: API keys, passwords, SECRET_KEY, tokens
- User consent flow for large contexts (>10k tokens)
- Cost gates with confirmation prompts
- Provider health status monitoring for resilience

**Integration Points**

- Existing PersonaSystem integration (Security Expert, Architect, Pragmatist)
- Existing ProviderFactory for LLM provider creation
- Existing EventBus for event emission (extend with 9 new consult event types)
- Existing ProjectContext for brownfield project detection
- Existing ConfigCascade for configuration resolution

**Performance Requirements**

- Sub-15s target for median response time (p50)
- Parallel execution for Round 1 (all 3 agents simultaneously)
- Hedged requests with 10s timeout threshold
- Token-efficient debate with condensed summaries (unless --verbose)

### FR Coverage Map

**Epic 1 (4-Round Consultation Engine):**
- FR1: Multi-round consultation (3+ agents, 4 rounds)
- FR2: Parallel execution for speed
- FR3: Unified synthesis with structured artifacts
- FR4: Agents critique each other (Round 3: Cross-Exam)
- FR9: Single CLI command (`consult`)
- FR12: Real-time streaming progress
- FR15: Human-readable Markdown output
- FR16: Machine-readable JSON-LD output
- FR17: Automatic logging to filesystem
- FR18: Token usage + USD cost display
- FR19: Highlight dissenting opinions
- FR20: Load expert personas (Security, Architect, Pragmatist)

**Epic 2 (Cost Controls & Resilience):**
- NFR1: 60-second interactive pulse (soft timeouts)
- NFR2: Latency visibility (real-time agent status)
- NFR3: Smart provider substitution (hedged requests)
- NFR4: Session persistence (partial consensus artifacts)
- NFR7: Informed consent (pre-flight cost estimates)
- NFR8: Token efficiency (condensed summaries)

**Epic 3 (Analytics):**
- FR23: Usage/performance/cost dashboard (`consult-stats`)
- FR24: Confidence score reporting

**Epic 4 (Advanced Modes):**
- FR5: Convergent Mode ("No, Because...")
- FR6: Exploration Mode ("Yes, And...")
- FR7: Dynamic termination (confidence threshold)
- FR8: Track "Value Added by Debate"
- FR11: Mode selection via CLI flag
- FR21: Brownfield project detection

**Epic 5 (Flexible I/O):**
- FR10: Explicit file context (`--context`)
- FR13: Output format selection (`--format`)
- FR14: Stdin piping support
- NFR5: Local context scrubbing (sensitive data filter)

**Covered in Epic 1 + Epic 2:**
- NFR6: Auditability (prompt version tracking in logs)

**Post-MVP:**
- FR22: Resume & Continuation
- NFR9: Ground truth benchmarking mode

## Epic List

### Epic 1: 4-Round Multi-Model Consultation Engine

Users can get fast consensus from 3 AI experts through a rigorous 4-round debate pipeline, with full transparency on confidence, dissent, and costs.

**FRs covered:** FR1, FR2, FR3, FR4, FR9, FR12, FR15, FR16, FR17, FR18, FR19, FR20

**Key Features:**
- Single CLI command: `llm-conclave consult "question"`
- Fixed expert panel: Security Expert (Claude), Architect (GPT-4o), Pragmatist (Gemini)
- 4-Round Debate Pipeline (Architecture Decision #2, 95% confidence):
  - Round 1: Independent analysis (parallel execution)
  - Round 2: Synthesis (consensus points + tensions)
  - Round 3: Cross-examination (challenges + rebuttals)
  - Round 4: Verdict (final recommendation)
- Structured artifacts for each round with schema versioning
- Real-time progress streaming
- Dual output formats: Markdown (human) + JSON-LD (machine)
- Automatic logging with prompt version tracking
- Cost breakdown (tokens + USD)
- Confidence scores and dissenting opinions highlighted

**Implementation:** State machine with 9 states, structured artifact extraction, EventBus integration.

---

### Epic 2: Cost Controls & Resilience

Users get predictable costs with pre-flight estimates and reliable consultations even when LLM providers fail or slow down.

**NFRs covered:** NFR1, NFR2, NFR3, NFR4, NFR7, NFR8

**Key Features:**

**Cost Gate (Architecture Decision #5, 95% confidence):**
- Pre-flight cost estimates before execution
- User consent prompt: "Estimated cost: $0.45. Proceed? [Y/n/Always]"
- Configurable auto-approval threshold (default: $0.50)
- In-flight monitoring - abort if cost exceeds estimate by >50%

**Provider Substitution (Architecture Decision #4, 90% confidence):**
- Background health checks (Healthy/Degraded/Unhealthy status)
- Hedged requests: backup provider if primary slow (>10s timeout)
- 3-tier fallback system: Premium → Standard → Fast/Cheap
- User substitution prompts: "Gemini unavailable. Switch to Grok? [Y/n/Fail]"
- All substitutions logged for audit

**Resilience Features:**
- 60-second interactive pulse (soft timeouts, no hard kills)
- Real-time latency visibility: "Security Expert thinking..."
- Session persistence: partial consensus artifacts saved if interrupted
- Token efficiency: condensed summaries in debate rounds (unless --verbose)

**Implementation:** ProviderHealthMonitor, HedgedRequestManager, CostEstimator, CostGate with consent flow.

---

### Epic 3: Usage Analytics & Cost Visibility

Users can track their consultation usage patterns, costs, and performance to stay within budget and measure value.

**FRs covered:** FR23, FR24

**Key Features:**
- `llm-conclave consult-stats` dashboard command
- Usage metrics: total consultations, active days, avg per day
- Performance metrics: p50, p95, p99 response times
- Cost tracking: total spend, cost per consultation, monthly budget monitoring
- Quality metrics: confidence scores, decision change rates
- Date range filtering: week, month, all-time
- Success validation: 150+ consultations/30 days, <$20/month budget targets

**Implementation:** Hybrid JSONL + SQLite storage (Architecture Decision #7). JSONL source of truth, SQLite for fast queries.

---

### Epic 4: Advanced Reasoning Modes

Users can choose different reasoning styles (exploration vs convergence) and leverage specialized personas for domain-specific consultations.

**FRs covered:** FR5, FR6, FR7, FR8, FR11, FR21

**Key Features:**
- **Explore Mode** (`--mode explore`): Divergent "Yes, And..." brainstorming
- **Converge Mode** (`--mode converge`): Adversarial "No, Because..." truth-seeking
- Custom confidence thresholds for early termination
- "Value Added by Debate" metrics (agent mind changes tracked)
- Automatic brownfield project detection (biases toward existing docs)
- Specialized persona loading (future: Hebrew Linguist for Super OCR)

**Implementation:** Behavior Strategy Pattern with ModeStrategy interface, ExploreStrategy, ConvergeStrategy (Architecture Decision #3, 95% confidence).

---

### Epic 5: Flexible Context & Output Options

Users can provide context from multiple sources (files, projects, stdin) and customize output formats for their workflow.

**FRs covered:** FR10, FR13, FR14
**NFRs covered:** NFR5

**Key Features:**
- Explicit file context: `--context file1.ts,file2.ts`
- Stdin piping: `cat doc.md | llm-conclave consult "summarize"`
- Output format selection: `--format json` (scripting) or `--format markdown` (human)
- Local context scrubbing: Regex-based sensitive data filter
  - Auto-masks API keys, passwords, SECRET_KEY patterns
  - Prevents accidental exposure to external LLM providers

**Implementation:** Leverages existing ProjectContext utility, adds stdin detection and sensitive data filter.

---

### Post-MVP (Future)

**FR22:** Resume & Continuation - Allow users to ask follow-up questions to previous consultations
**NFR9:** Ground truth benchmarking mode for Super OCR validation

---

## Epic 1: 4-Round Multi-Model Consultation Engine

Users can get fast consensus from 3 AI experts through a rigorous 4-round debate pipeline, with full transparency on confidence, dissent, and costs.

### Story 1.1: Consultation Foundation - Types, State Machine, and Event Infrastructure

As a **developer implementing consult mode**,
I want the core foundation types, state machine, artifact schemas, and event infrastructure,
So that all consultation features are built on the validated architecture from the start.

**Acceptance Criteria:**

**Given** The existing LLM Conclave codebase
**When** I implement the consultation foundation
**Then** The following components are created:

**Core Types (`src/types/consult.ts`):**
- `ConsultationResult` interface with all required fields
- `AgentResponse` interface
- `AgentPerspective` interface
- `ConsensusSynthesis` interface
- `CostSummary` interface
- `ConsultMetrics` interface
- All types use camelCase for TypeScript properties

**State Machine (`src/orchestration/ConsultStateMachine.ts`):**
- `ConsultState` enum with 9 states: Idle, Estimating, AwaitingConsent, Independent, Synthesis, CrossExam, Verdict, Complete, Aborted
- State transition validation logic
- Event emission on each state transition
- Initial state = Idle

**Artifact Schemas (`src/consult/artifacts/schemas/`):**
- `IndependentSchema.ts`: Round 1 artifact with fields: artifact_type, schema_version, agent_id, round_number, position, key_points[], rationale, confidence, prose_excerpt, created_at
- `SynthesisSchema.ts`: Round 2 artifact with fields: artifact_type, schema_version, round_number, consensus_points[], tensions[], priority_order[], created_at
- `CrossExamSchema.ts`: Round 3 artifact with fields: artifact_type, schema_version, round_number, challenges[], rebuttals[], unresolved[], created_at
- `VerdictSchema.ts`: Round 4 artifact with fields: artifact_type, schema_version, round_number, recommendation, confidence, evidence[], dissent[], created_at
- All schemas include `schema_version: "1.0"` field
- JSON format uses snake_case for all field names

**EventBus Extensions (`src/core/EventBus.ts`):**
- Add 9 new event types to EventType enum:
  - `consultation:started`
  - `consultation:cost_estimated`
  - `consultation:user_consent`
  - `consultation:round_artifact`
  - `consultation:provider_substituted`
  - `consultation:completed`
  - `health:check_started`
  - `health:status_updated`
  - `cost:gate_triggered`
- Event payloads use snake_case for JSON fields

**TypeScript/JSON Transformers (`src/consult/artifacts/ArtifactTransformer.ts`):**
- `toJSON()` function: converts TypeScript (camelCase) to JSON (snake_case)
- `fromJSON()` function: converts JSON (snake_case) to TypeScript (camelCase)
- Transformer for each artifact type

**And** All files follow naming conventions:
- TypeScript files: PascalCase (ConsultStateMachine.ts)
- Variables/functions: camelCase (consultationId, emitEvent)
- JSON fields: snake_case (agent_id, round_number)
- Events: colon-separated lowercase (consultation:started)

**And** Unit tests exist for:
- State machine transitions
- Artifact schema validation
- TypeScript ↔ JSON transformations

**Given** Invalid state transitions are attempted
**When** The state machine validates transitions
**Then** It throws an error with a clear message

**Given** An artifact is missing the schema_version field
**When** Validation is attempted
**Then** It fails with error: "Missing required field: schema_version"

---

### Story 1.2: Round 1 - Independent Analysis with Parallel Execution

As a **developer**,
I want Round 1 (Independent Analysis) to execute all 3 agents in parallel and extract structured artifacts,
So that consultations are fast and follow the validated 4-round debate pipeline.

**Acceptance Criteria:**

**Given** The foundation from Story 1.1 is complete
**When** A consultation enters the Independent state
**Then** All 3 agents (Security Expert, Architect, Pragmatist) execute in parallel using Promise.all()
**And** Each agent receives the user's question
**And** System emits `agent:thinking` event for each agent
**And** Agent responses are extracted into IndependentSchema artifacts
**And** Each artifact includes: agent_id, position, key_points[], rationale, confidence, schema_version: "1.0"
**And** System emits `agent:completed` event with duration and tokens
**And** State transitions from Independent → Synthesis
**And** Total Round 1 execution time is <= slowest agent (not sum of all agents)

**Given** One agent fails during Round 1
**When** The other 2 agents complete successfully
**Then** The consultation continues with 2 artifacts
**And** Failed agent response includes error field
**And** Warning is logged: "⚠️ Agent [name] failed: [reason]"

**Given** All 3 agents fail during Round 1
**When** No successful responses are received
**Then** The consultation aborts with state = Aborted
**And** Error message: "All agents failed. Unable to provide consultation."

---

### Story 1.3: CLI Command Entry Point with Basic Cost Estimation and Real-Time Progress

As a **developer**,
I want a working CLI command that flows through the full state machine with basic cost estimation and real-time progress display,
So that consultations work end-to-end following the validated architecture and satisfy FR12 (real-time streaming).

**Acceptance Criteria:**

**Given** The foundation from Story 1.1 is complete
**When** I run `llm-conclave consult "Should I use OAuth or JWT?"`
**Then** The system creates a new ConsultOrchestrator instance
**And** State transitions: Idle → Estimating
**And** System emits `consultation:started` event with consultation_id, question, agents[], mode

**Cost Estimation Flow:**
**When** State = Estimating
**Then** CostEstimator calculates basic pre-flight cost:
- Input tokens from question text (length / 4 rough estimate)
- Expected output tokens (agents × rounds × 2000 tokens/round)
- Total estimated cost using provider pricing
**And** System emits `consultation:cost_estimated` event with estimated_cost
**And** State transitions: Estimating → AwaitingConsent

**Auto-Approval (Epic 1 MVP):**
**When** State = AwaitingConsent
**Then** System auto-approves (no user prompt in Epic 1)
**And** System emits `consultation:user_consent` event with approved: true
**And** State transitions: AwaitingConsent → Independent
**And** Round 1 execution begins (Story 1.2)

**Real-Time Progress Display (FR12):**
**Given** CLI command is running
**When** EventBus emits consultation lifecycle events
**Then** CLI subscribes to events and displays real-time progress:
- `consultation:started` → Display: "🔍 Starting consultation with 3 experts..."
- `agent:thinking` → Display: "⚡ [Agent Name] thinking..."
- `agent:completed` → Display: "✅ [Agent Name] completed ([duration]s)"
- `round:completed` → Display: "📋 Round [N] complete"
- `consultation:completed` → Display: "✨ Consultation complete"

**And** Progress messages use Chalk for colored output
**And** Progress prevents terminal from appearing "hung" during long operations
**And** Each round transition is clearly visible to user

**Command Options:**
**Given** I run `llm-conclave consult --help`
**When** Help is displayed
**Then** It shows: `llm-conclave consult <question>`
**And** Explains basic usage

**Given** I run `llm-conclave consult` without a question
**When** The command is parsed
**Then** Error displayed: "Error: Question is required. Usage: llm-conclave consult <question>"

**And** Basic cost estimation uses hardcoded pricing:
- Claude Sonnet 4.5: $0.003/1K input, $0.015/1K output
- GPT-4o: $0.0025/1K input, $0.01/1K output
- Gemini 2.5 Pro: $0.00125/1K input, $0.005/1K output

**Implementation Note:** Epic 2 will add user consent prompts, thresholds, and sophisticated cost controls. Epic 1 auto-approves everything to deliver working consultations.

---

### Story 1.4: Round 2 - Synthesis with Consensus Building

As a **developer**,
I want Round 2 (Synthesis) to identify consensus points and tensions from Round 1 artifacts,
So that the debate builds structured understanding before cross-examination.

**Acceptance Criteria:**

**Given** Round 1 (Independent) completed with 2+ agent artifacts
**When** State transitions to Synthesis
**Then** System creates synthesis context from Round 1 artifacts
**And** Judge agent (GPT-4o) receives all IndependentSchema artifacts
**And** Judge prompt asks to extract:
- Consensus points (what agents agree on)
- Tensions (where agents disagree)
- Priority order (most important topics)
**And** Judge response is extracted into SynthesisSchema artifact with:
  - consensus_points[] with supporting_agents[] and confidence per point
  - tensions[] with viewpoints[] from different agents
  - priority_order[] ranking topics
  - schema_version: "1.0"
**And** System emits `consultation:round_artifact` event with round_number: 2
**And** State transitions: Synthesis → CrossExam

**Given** Judge fails during synthesis
**When** Synthesis extraction fails
**Then** Consultation aborts with state = Aborted
**And** Error logged with round context

---

### Story 1.5: Round 3 - Cross-Examination with Challenge/Rebuttal

As a **developer**,
I want Round 3 (Cross-Examination) to allow agents to challenge each other's positions,
So that weak arguments are exposed and strengthened through debate.

**Acceptance Criteria:**

**Given** Round 2 (Synthesis) completed successfully
**When** State transitions to CrossExam
**Then** Each agent receives:
- Their own Round 1 position
- The Synthesis artifact (consensus + tensions)
- Adversarial prompt: "Challenge the consensus or defend your position"
**And** All 3 agents execute in parallel
**And** Each agent response is extracted into a challenge/rebuttal structure
**And** Judge synthesizes into CrossExamSchema artifact with:
  - challenges[] with challenger, target_agent, challenge, evidence[]
  - rebuttals[] with agent, rebuttal text
  - unresolved[] listing unresolved tensions
  - schema_version: "1.0"
**And** System emits `consultation:round_artifact` event with round_number: 3
**And** State transitions: CrossExam → Verdict

**Given** Agents provide no new challenges in Round 3
**When** Cross-examination completes
**Then** unresolved[] is empty
**And** Verdict proceeds normally

---

### Story 1.6: Round 4 - Verdict with Final Recommendation

As a **developer**,
I want Round 4 (Verdict) to produce a final recommendation with confidence and dissent tracking,
So that users get actionable consensus with full transparency.

**Acceptance Criteria:**

**Given** Round 3 (CrossExam) completed successfully
**When** State transitions to Verdict
**Then** Judge agent receives all 3 round artifacts:
- Round 1: Independent positions
- Round 2: Consensus + tensions
- Round 3: Challenges + rebuttals
**And** Judge prompt asks for final synthesis
**And** Judge response is extracted into VerdictSchema artifact with:
  - recommendation (final answer to user's question)
  - confidence (0.0-1.0 based on agreement level)
  - evidence[] (key supporting points)
  - dissent[] with agent, concern, severity fields
  - schema_version: "1.0"
**And** System emits `consultation:round_artifact` event with round_number: 4
**And** State transitions: Verdict → Complete
**And** System emits `consultation:completed` event

**Given** Confidence score is < 0.70
**When** Verdict is generated
**Then** Dissent[] is populated with concerns from minority agents

**Given** All agents strongly agree
**When** Confidence is calculated
**Then** Confidence >= 0.85
**And** Dissent[] is empty or contains minor concerns only

---

### Story 1.7: Output Formatting - Markdown and JSON-LD

As a **developer**,
I want to format consultation results in both human-readable Markdown and machine-readable JSON-LD,
So that results work for both humans and programmatic workflows.

**Acceptance Criteria:**

**Given** Consultation completed (State = Complete)
**When** Output formatter processes the result
**Then** Markdown output includes:
- Question
- Consensus summary (from Verdict)
- Confidence score as percentage
- Agent perspectives (one section per agent with their opinion)
- Concerns raised
- Dissenting views (if any)
- Cost summary (tokens + USD)
- Duration in seconds

**Markdown Format:**
```markdown
# Consultation Summary

**Question:** [question]
**Confidence:** [confidence]%

## Consensus
[verdict recommendation]

## Agent Perspectives
### Security Expert (claude-sonnet-4.5)
[opinion]
### Architect (gpt-4o)
[opinion]
### Pragmatist (gemini-2.5-pro)
[opinion]

## Concerns Raised
- [concern 1]
- [concern 2]

## Dissenting Views
- [dissent if any]

---
**Cost:** $[cost] | **Duration:** [seconds]s | **Tokens:** [total]
```

**JSON-LD Output:**
**When** `--format json` flag is used
**Then** System outputs complete JSON object with:
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

**And** JSON uses snake_case for all field names
**And** All artifacts include schema_version field

**Given** Default format (no --format flag)
**When** Output is displayed
**Then** Markdown is shown to terminal

---

### Story 1.8: Consultation Logging with JSONL and Prompt Versioning

As a **developer**,
I want all consultations logged to structured JSONL files with prompt version tracking,
So that we have a complete audit trail for analysis and debugging.

**Acceptance Criteria:**

**Given** Consultation completed (State = Complete)
**When** ConsultLogger processes the result
**Then** A JSONL file is written to `~/.llm-conclave/consult-logs/`
**And** Filename format: `consult-[consultation_id].json`
**And** Log directory is auto-created if it doesn't exist

**JSONL Log Structure:**
**Then** Each log file contains one JSON object with:
- All fields from ConsultationResult interface
- schema_version: "1.0"
- prompt_versions{} object with:
  - independent_prompt_version: "v1.0"
  - synthesis_prompt_version: "v1.0"
  - cross_exam_prompt_version: "v1.0"
  - verdict_prompt_version: "v1.0"
**And** All round artifacts are included
**And** Token usage is tracked per agent per round
**And** Total cost calculated correctly

**Markdown Summary:**
**When** Consultation is logged
**Then** A companion Markdown file is also written
**And** Filename: `consult-[consultation_id].md`
**And** Content matches Story 1.7 Markdown format

**Given** Disk space is full
**When** Logging attempts to write
**Then** Error is logged to console: "Failed to write consultation log: [reason]"
**And** Consultation result is still returned to user

**Given** Log directory has no write permissions
**When** Logger attempts to create file
**Then** Error is logged with clear message about permissions

---

## Epic 2: Cost Controls & Resilience

Users get predictable costs with pre-flight estimates and reliable consultations even when LLM providers fail or slow down.

### Story 2.1: User Consent Flow with Cost Gate

As a **developer using consult mode**,
I want to see cost estimates before expensive consultations and choose whether to proceed,
So that I have predictable costs and never get surprise bills.

**Acceptance Criteria:**

**Given** Epic 1 Story 1.3 auto-approves all consultations
**When** I enhance the CostGate component
**Then** State = AwaitingConsent now prompts the user instead of auto-approving

**Cost Gate Prompt:**
**Given** Estimated cost is calculated (State = Estimating)
**When** State transitions to AwaitingConsent
**Then** System displays prompt:
```
Estimated cost: $0.45
- Input tokens: 1,234
- Expected output tokens: ~8,000
- 3 agents × 4 rounds

Proceed? [Y/n/Always]
```
**And** User can choose:
- Y = Approve this consultation
- n = Cancel consultation
- Always = Set auto-approve threshold

**Config Integration:**
**When** User selects "Always"
**Then** System prompts: "Auto-approve consultations under: $[amount]"
**And** Saves `alwaysAllowUnder` to `~/.llm-conclave/config.json`
**And** Future consultations under threshold auto-approve

**Auto-Approve for Cheap Queries:**
**Given** Config has `alwaysAllowUnder: 0.50`
**When** Estimated cost is $0.30
**Then** Consultation auto-approves without prompt
**And** Displays: "💰 Estimated cost: $0.30 (auto-approved)"

**Cancel Flow:**
**Given** User selects "n" (cancel)
**When** Consent is denied
**Then** State transitions to Aborted
**And** Message displayed: "Consultation cancelled by user"
**And** No API calls are made

**In-Flight Cost Monitoring:**
**Given** Consultation is running
**When** Actual cost exceeds estimate by >50%
**Then** System displays warning: "⚠️ Cost exceeded estimate. Aborting consultation."
**And** State transitions to Aborted
**And** Partial results saved (Story 2.5)

---

### Story 2.2: Provider Health Monitoring System

As a **developer**,
I want background health checks to track provider status,
So that the system knows which providers are reliable before consultations start.

**Acceptance Criteria:**

**Given** LLM Conclave starts up
**When** ProviderHealthMonitor initializes
**Then** Background health checks start for all configured providers

**Health Check Mechanism:**
**When** Health check runs (every 30 seconds)
**Then** System sends lightweight test request to each provider
**And** Tracks response time and success/failure
**And** Updates ProviderHealth status:
  - Healthy: < 3s response, 0 recent failures
  - Degraded: 3-10s response OR 1-2 recent failures
  - Unhealthy: >10s response OR 3+ consecutive failures
  - Unknown: Never checked

**Health Status Storage:**
**Then** Health status stored in-memory Map:
```typescript
Map<string, ProviderHealth> {
  'anthropic': { status: 'Healthy', lastChecked: Date, latencyMs: 2100, errorRate: 0.0, consecutiveFailures: 0 },
  'openai': { status: 'Degraded', lastChecked: Date, latencyMs: 8500, errorRate: 0.1, consecutiveFailures: 1 },
  'google': { status: 'Healthy', lastChecked: Date, latencyMs: 1800, errorRate: 0.0, consecutiveFailures: 0 }
}
```

**Event Emission:**
**When** Provider status changes
**Then** System emits `health:status_updated` event with provider_name and new status

**Graceful Degradation:**
**Given** No providers are Healthy
**When** Consultation starts
**Then** Warning displayed: "⚠️ All providers degraded. Consultation may be slower than usual."
**And** Consultation proceeds (doesn't fail)

---

### Story 2.3: Hedged Requests with Provider Substitution

As a **developer**,
I want backup providers to kick in when primary providers are slow or failing,
So that consultations complete reliably even during provider outages.

**Acceptance Criteria:**

**Given** ProviderHealthMonitor is running (Story 2.2)
**When** HedgedRequestManager executes an agent
**Then** Primary provider is attempted first

**Hedged Request Logic:**
**When** Primary provider takes >10 seconds
**Then** System sends identical request to backup provider from same tier
**And** Both requests run in parallel
**And** First successful response is used
**And** Slower request is cancelled

**Provider Tier System:**
**Given** Agent needs to execute
**When** Primary provider is selected
**Then** System uses tier-based fallback:
- Tier 1 (Premium): Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro
- Tier 2 (Standard): Claude Sonnet 3.5, GPT-4, Gemini 2.0 Flash
- Tier 3 (Fast/Cheap): GPT-3.5 Turbo, Mistral Large

**Substitution Prompt:**
**Given** Primary provider fails completely (not just slow)
**When** Failure is detected
**Then** System prompts user:
```
⚠️ Gemini is unavailable (timeout).
Switch to xAI (Grok) for this agent? [Y/n/Fail]
```
**And** User can choose:
- Y = Use substitute provider
- n = Continue with remaining agents
- Fail = Abort consultation

**Substitution Logging:**
**When** Provider is substituted
**Then** System emits `consultation:provider_substituted` event with:
- agent_id
- original_provider
- substitute_provider
- reason (timeout/failure/health_check)
**And** Substitution is logged in consultation result

**Given** All tiers fail for an agent
**When** No providers respond
**Then** Agent response includes error field
**And** Consultation continues with remaining agents (graceful degradation)

---

### Story 2.4: 60-Second Interactive Pulse with Soft Timeouts

As a **developer**,
I want the system to check in with me during long-running rounds rather than hanging indefinitely,
So that I stay in control without hard timeouts killing valid consultations.

**Acceptance Criteria:**

**Given** A consultation round is running
**When** 60 seconds have elapsed
**Then** System displays interactive pulse:
```
⏱️ Still waiting on Security Expert (72s elapsed).
Continue waiting? [Y/n]
```

**User Continues:**
**When** User selects "Y"
**Then** Consultation continues
**And** Another 60-second timer starts
**And** System displays: "⏳ Continuing..."

**User Cancels:**
**When** User selects "n"
**Then** Current round is cancelled
**And** State transitions to Aborted
**And** Partial results are saved (Story 2.5)
**And** Message: "Consultation cancelled by user after 72s"

**Multiple Agents:**
**Given** Multiple agents are still running after 60s
**When** Pulse is displayed
**Then** All slow agents are listed:
```
⏱️ Still waiting on:
- Security Expert (72s)
- Architect (65s)
Continue waiting? [Y/n]
```

**No Pulse for Fast Consultations:**
**Given** Consultation completes in < 60s
**When** All rounds finish quickly
**Then** No interactive pulse is displayed
**And** Results are returned immediately

---

### Story 2.5: Session Persistence with Partial Consensus Artifacts

As a **developer**,
I want partial results saved if I cancel or a consultation fails,
So that I don't lose valuable work from completed rounds.

**Acceptance Criteria:**

**Given** Consultation has completed 1+ rounds
**When** User cancels via interactive pulse (Story 2.4)
**Then** Partial results are saved to `~/.llm-conclave/consult-logs/`

**Partial Consultation Log:**
**When** Partial save occurs
**Then** JSONL file written with:
- consultation_id
- timestamp
- question
- agents[]
- state (Aborted)
- completed_rounds[] with all completed round artifacts
- incomplete_rounds[] listing rounds that didn't finish
- abort_reason ("user_cancelled" / "cost_exceeded" / "timeout")
- partial_consensus (if Round 2+ completed)
- cost{} for completed work only

**Resume Capability (Future):**
**And** File includes resume_token for future continuation (FR22, Post-MVP)
**And** Display message: "💾 Partial results saved to: [filename]"

**Given** Consultation fails mid-round due to provider errors
**When** State = Aborted
**Then** All completed artifacts are saved
**And** Error context is included in log

**Given** Cost exceeded estimate (Story 2.1)
**When** Consultation is aborted
**Then** Partial results include actual cost breakdown
**And** Abort reason: "cost_exceeded_estimate"

---

### Story 2.6: Token-Efficient Debate with Artifact Filtering

As a **developer**,
I want agents to receive filtered structured artifacts in later rounds rather than full arrays,
So that token costs are reduced while maintaining the validated JSON artifact structure.

**Acceptance Criteria:**

**Given** Round 2 (Synthesis) is starting
**When** Judge receives Round 1 artifacts
**Then** Full artifacts are used (no filtering in Round 2)

**Round 3 Artifact Filtering:**
**Given** Round 3 (CrossExam) is starting
**When** Agents receive context from previous rounds
**Then** Each agent receives:
- Their own Round 1 IndependentSchema artifact (full - unfiltered)
- Filtered Round 2 SynthesisSchema artifact:
  - `consensus_points[]` limited to top 3 (by confidence score)
  - `tensions[]` limited to top 2 (by disagreement level)
  - `priority_order[]` (all - used for ranking)
  - All other fields preserved (artifact_type, schema_version, created_at)
  - **Structure remains valid JSON matching SynthesisSchema**

**Round 4 Artifact Filtering:**
**Given** Round 4 (Verdict) is starting
**When** Judge receives all round context
**Then** Judge receives:
- All Round 1 IndependentSchema artifacts (full - needed for comprehensive synthesis)
- Filtered Round 2 SynthesisSchema artifact (top 3 consensus, top 2 tensions)
- Filtered Round 3 CrossExamSchema artifact:
  - `challenges[]` limited to top 5 (by severity/importance)
  - `rebuttals[]` limited to top 5 (most substantive)
  - `unresolved[]` (all - critical for final verdict)
  - **Structure remains valid JSON matching CrossExamSchema**

**Schema Integrity:**
**When** Artifacts are filtered
**Then** All required schema fields are present:
- artifact_type
- schema_version: "1.0"
- round_number
- created_at
- All type-specific fields (even if arrays are smaller)
**And** Filtered artifacts pass ArtifactValidator.validate()
**And** JSON structure matches original schema exactly

**Verbose Mode Override:**
**Given** User runs `llm-conclave consult --verbose "question"`
**When** `--verbose` flag is detected
**Then** All agents receive FULL unfiltered artifacts
**And** Display message: "🔍 Verbose mode: using full debate artifacts"
**And** Cost estimate reflects higher token usage

**Token Savings Tracking:**
**When** Consultation completes with artifact filtering
**Then** Log includes token_efficiency_stats:
```json
{
  "tokens_used": 12450,
  "tokens_saved_via_filtering": 3200,
  "efficiency_percentage": 20.4,
  "filtering_method": "structured_artifact_array_truncation"
}
```

**Implementation Note:** This is **artifact filtering**, not progressive compression. The JSON structure and schema remain identical - only array lengths are reduced by keeping highest-priority items.

---

## Epic 3: Usage Analytics & Cost Visibility

Users can track their consultation usage patterns, costs, and performance to stay within budget and measure value.

### Story 3.1: SQLite Analytics Indexer with Write-Through Pattern

As a **developer**,
I want consultation logs indexed in SQLite for fast queries,
So that stats dashboards load instantly even with hundreds of consultations.

**Acceptance Criteria:**

**Given** Epic 1 Story 1.8 writes JSONL logs
**When** AnalyticsIndexer initializes
**Then** SQLite database is created at `~/.llm-conclave/consult-analytics.db`
**And** Database directory is auto-created if it doesn't exist

**Database Schema:**
**When** Database is created
**Then** The following tables exist:
```sql
CREATE TABLE consultations (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  mode TEXT NOT NULL,
  final_recommendation TEXT,
  confidence REAL,
  total_cost REAL,
  total_tokens INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  schema_version TEXT,
  state TEXT NOT NULL
);

CREATE TABLE consultation_agents (
  consultation_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id)
);

CREATE TABLE consultation_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  round_type TEXT NOT NULL,
  duration_ms INTEGER,
  tokens_used INTEGER,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id)
);

CREATE INDEX idx_consultations_created_at ON consultations(created_at);
CREATE INDEX idx_consultations_cost ON consultations(total_cost);
CREATE INDEX idx_consultations_mode ON consultations(mode);
CREATE INDEX idx_consultations_state ON consultations(state);
```

**Write-Through Pattern:**
**Given** A consultation completes (Epic 1 Story 1.8)
**When** ConsultLogger writes JSONL file
**Then** AnalyticsIndexer is notified
**And** Consultation data is written to SQLite (write-through)
**And** If SQLite write fails, error is logged but JSONL write still succeeds
**And** JSONL remains source of truth

**Index Rebuild Capability:**
**Given** SQLite database is corrupted or missing
**When** User runs `llm-conclave consult-stats --rebuild-index`
**Then** System deletes existing SQLite database
**And** Reads all JSONL files from `~/.llm-conclave/consult-logs/`
**And** Re-indexes all consultations into fresh SQLite database
**And** Displays progress: "Rebuilding index... [50/150] consultations"
**And** Displays: "✅ Index rebuilt successfully. [150] consultations indexed."

**Schema Versioning:**
**Given** Future schema changes occur
**When** Old SQLite database is detected
**Then** System runs migrations automatically
**And** Migration SQL files exist in `src/consult/analytics/schemas/migrations/`

---

### Story 3.2: Stats Query Engine with Metrics Computation

As a **developer**,
I want a stats query interface that computes performance, cost, and quality metrics,
So that the consult-stats command has data to display.

**Acceptance Criteria:**

**Given** SQLite analytics index exists (Story 3.1)
**When** StatsQuery computes metrics
**Then** The following metrics are calculated:

**Usage Metrics:**
```typescript
{
  total: number,                    // Total consultations
  dateRange: {
    start: string,                  // First consultation date
    end: string,                    // Last consultation date
    totalDays: number               // Days between first and last
  },
  activeDays: number,               // Days with 1+ consultation
  avgPerDay: number,                // total / activeDays
  byState: {
    completed: number,
    aborted: number
  }
}
```

**Performance Metrics:**
```typescript
{
  p50: number,     // Median duration_ms
  p95: number,     // 95th percentile duration_ms
  p99: number,     // 99th percentile duration_ms
  avgDuration: number,
  fastestConsultation: { id, duration_ms },
  slowestConsultation: { id, duration_ms }
}
```

**Cost Metrics:**
```typescript
{
  total: number,                // Total USD spent
  avgPerConsultation: number,   // total / completed consultations
  totalTokens: number,          // Sum of all tokens
  byProvider: {
    anthropic: { cost, tokens },
    openai: { cost, tokens },
    google: { cost, tokens }
  },
  mostExpensive: { id, cost },
  cheapest: { id, cost }
}
```

**Quality Metrics:**
```typescript
{
  avgConfidence: number,        // Average of all confidence scores
  highConfidence: number,       // Count of consultations with confidence >= 0.85
  lowConfidence: number,        // Count of consultations with confidence < 0.70
  withDissent: number          // Count with dissent[] not empty
}
```

**Date Range Filtering:**
**Given** User specifies date range
**When** Metrics are computed
**Then** Only consultations within range are included:
- `--week`: Last 7 days
- `--month YYYY-MM`: Specific month
- `--all-time`: All consultations (default)

**SQL Query Optimization:**
**When** Metrics are computed
**Then** Queries use indexes for performance:
- `idx_consultations_created_at` for date filtering
- `idx_consultations_cost` for cost queries
- `idx_consultations_state` for completion rate

**Given** No consultations exist
**When** Metrics are computed
**Then** Empty metrics object is returned with sensible defaults (zeros, nulls)

---

### Story 3.3: Consult-Stats CLI Dashboard with Success Validation

As a **developer using consult mode**,
I want a visual dashboard showing my usage, performance, and costs,
So that I can track progress toward success criteria and stay within budget.

**Acceptance Criteria:**

**Given** SQLite analytics index exists (Story 3.1)
**When** I run `llm-conclave consult-stats`
**Then** A formatted dashboard is displayed to terminal

**Dashboard Format:**
```
┌─────────────────────────────────────────────────┐
│  LLM Conclave Consult Stats                    │
├─────────────────────────────────────────────────┤
│  Usage Metrics                                  │
│  • Total Consultations: 147                     │
│  • Active Days: 22/30 (73%)                     │
│  • Avg per Day: 6.7                             │
│  • Completed: 142 (97%)                         │
│  • Aborted: 5 (3%)                              │
├─────────────────────────────────────────────────┤
│  Performance Metrics                            │
│  • Median Response Time: 12.3s (p50)            │
│  • p95 Response Time: 18.7s                     │
│  • p99 Response Time: 24.2s                     │
│  • Fastest: 8.1s                                │
│  • Slowest: 31.5s                               │
├─────────────────────────────────────────────────┤
│  Cost Metrics                                   │
│  • Total Cost: $18.42                           │
│  • Avg per Consultation: $0.13                  │
│  • Total Tokens: 1,847,230                      │
│  • By Provider:                                 │
│    - Anthropic: $7.21 (39%)                     │
│    - OpenAI: $6.85 (37%)                        │
│    - Google: $4.36 (24%)                        │
├─────────────────────────────────────────────────┤
│  Quality Metrics                                │
│  • Avg Confidence: 84%                          │
│  • High Confidence (≥85%): 98 (69%)             │
│  • Low Confidence (<70%): 12 (8%)               │
│  • With Dissent: 34 (24%)                       │
└─────────────────────────────────────────────────┘
```

**Success Criteria Validation:**
**When** Dashboard is displayed
**Then** System evaluates PRD success criteria:
- ✅ 150+ consultations in 30 days: Display "✅ SUCCESS: Consistent usage!" if achieved
- ⚡ p50 < 15s: Display "⚡ SPEED: Excellent response times!" if achieved
- 💰 Monthly cost < $20: Display "💰 COST: Within budget target!" if achieved

**If not yet achieved:**
```
📊 Progress toward Success Criteria:
• Usage: 147/150 consultations (98%) - Almost there!
• Speed: 12.3s median (target: <15s) ✅
• Cost: $18.42/$20.00 budget (92%) ✅
```

**Command Options:**
**Given** User runs with options
**Then** Dashboard adjusts accordingly:
- `--week`: Shows last 7 days only
- `--month 2025-12`: Shows December 2025 only
- `--all-time`: Shows all consultations (default)
- `--json`: Outputs raw JSON metrics instead of dashboard

**Empty State:**
**Given** No consultations exist
**When** Dashboard is displayed
**Then** Message shown:
```
📭 No consultations found.

Run your first consultation:
  llm-conclave consult "Your question here"
```

**Colored Output:**
**When** Dashboard is displayed
**Then** Chalk is used for colored output:
- Green for success indicators (✅, within budget)
- Yellow for warnings (approaching limits)
- Red for concerns (over budget, slow performance)
- Cyan for neutral info (headers, totals)

---

## Epic 4: Advanced Reasoning Modes

Users can choose different reasoning styles (exploration vs convergence) and leverage specialized personas for domain-specific consultations.

### Story 4.1: Mode Strategy Pattern with Explore and Converge Implementations

As a **developer**,
I want a ModeStrategy interface with pluggable Explore and Converge implementations,
So that consultation prompts adapt based on the user's desired reasoning style.

**Acceptance Criteria:**

**Given** The 4-round consultation engine from Epic 1
**When** I implement the mode strategy pattern
**Then** The following interfaces and implementations are created:

**ModeStrategy Interface (`src/consult/strategies/ModeStrategy.ts`):**
```typescript
interface ModeStrategy {
  name: string;  // 'explore' or 'converge'

  // Prompt generators for each round
  getIndependentPrompt(question: string, context: string): string;
  getSynthesisPrompt(round1Artifacts: IndependentSchema[]): string;
  getCrossExamPrompt(agent: Agent, synthesis: SynthesisSchema): string;
  getVerdictPrompt(allArtifacts: ArtifactCollection): string;

  // Termination logic
  shouldTerminateEarly(confidence: number, roundNumber: number): boolean;
}
```

**ExploreStrategy Implementation (`src/consult/strategies/ExploreStrategy.ts`):**
**When** Mode is 'explore'
**Then** Prompts use divergent, "Yes, And..." framing:
- Independent: "Generate diverse perspectives. What possibilities do you see?"
- Synthesis: "Find common themes AND preserve unique insights."
- CrossExam: "Build on others' ideas. What else should we consider?"
- Verdict: "Present a menu of valid options with trade-offs."

**ConvergeStrategy Implementation (`src/consult/strategies/ConvergeStrategy.ts`):**
**When** Mode is 'converge'
**Then** Prompts use adversarial, "No, Because..." framing:
- Independent: "Take a strong position. What's the best answer?"
- Synthesis: "Find disagreements. Where do perspectives conflict?"
- CrossExam: "Challenge weak arguments. What's wrong with this position?"
- Verdict: "Provide ONE definitive recommendation with confidence score."

**CLI Integration:**
**Given** User runs consultation
**When** Mode flag is specified
**Then** Appropriate strategy is loaded:
- `llm-conclave consult --mode explore "question"` → ExploreStrategy
- `llm-conclave consult --mode converge "question"` → ConvergeStrategy
- Default (no flag) → ConvergeStrategy (matches MVP behavior from Epic 1)

**Mode-Specific Artifact Validation:**
**When** Explore mode is used
**Then** VerdictSchema allows multiple recommendations in recommendation field
**And** Confidence can be split across multiple options

**When** Converge mode is used
**Then** VerdictSchema enforces single recommendation
**And** Confidence is unified score for that recommendation

**Prompt Version Tracking:**
**When** Consultation is logged
**Then** prompt_versions includes mode-specific versions:
```json
{
  "mode": "explore",
  "explore_independent_v": "v1.0",
  "explore_synthesis_v": "v1.0",
  "explore_cross_exam_v": "v1.0",
  "explore_verdict_v": "v1.0"
}
```

---

### Story 4.2: Confidence-Based Early Termination

As a **developer**,
I want consultations to terminate early when confidence thresholds are met,
So that users don't pay for unnecessary rounds when consensus is already strong.

**Acceptance Criteria:**

**Given** Consultation is running
**When** Round 2 (Synthesis) completes
**Then** System checks if early termination criteria are met

**Early Termination Logic:**
**When** Synthesis confidence >= configured threshold (default: 0.90)
**Then** System displays prompt:
```
✨ Strong consensus reached (confidence: 92%)
Terminate early and skip Rounds 3-4? [Y/n]
```

**User Accepts Early Termination:**
**When** User selects "Y"
**Then** State transitions directly to Complete (skips CrossExam and Verdict)
**And** Final result uses Round 2 synthesis as the verdict
**And** Consultation log includes:
  - early_termination: true
  - early_termination_reason: "high_confidence_after_synthesis"
  - rounds_completed: 2
  - confidence: [synthesis confidence score]

**User Declines Early Termination:**
**When** User selects "n"
**Then** Consultation continues to Round 3 normally
**And** early_termination: false in log

**Custom Threshold Configuration:**
**Given** User sets custom threshold
**When** User runs `llm-conclave consult --confidence-threshold 0.85 "question"`
**Then** Early termination triggers at 85% confidence instead of default 90%

**Mode-Specific Termination:**
**When** Explore mode is active
**Then** Early termination is disabled (divergent thinking needs all rounds)
**And** Message displayed: "🔍 Explore mode: all rounds will execute"

**When** Converge mode is active
**Then** Early termination is enabled (convergent thinking can short-circuit)

**Cost Savings Tracking:**
**When** Early termination occurs
**Then** Log includes estimated_cost_saved:
```json
{
  "early_termination": true,
  "rounds_skipped": 2,
  "estimated_cost_saved": 0.18,
  "actual_cost": 0.22
}
```

---

### Story 4.3: Debate Value Tracking with Agent Position Analysis

As a **developer**,
I want to track when agents change their positions during debate,
So that users can see the value added by multi-round discussion.

**Acceptance Criteria:**

**Given** Consultation completes all 4 rounds
**When** Debate value is analyzed
**Then** System compares agent positions across rounds

**Position Change Detection:**
**When** Round 1 (Independent) positions are compared to Round 4 (Verdict)
**Then** System identifies position changes:
```typescript
{
  agent_id: "security_expert",
  round1_position: "Use OAuth 2.0 with JWT tokens",
  round1_confidence: 0.75,
  round4_position: "Use session-based auth for MVP, OAuth later",
  round4_confidence: 0.88,
  position_changed: true,
  change_magnitude: "significant",  // significant | moderate | minor
  influenced_by: ["pragmatist", "architect"]
}
```

**Semantic Similarity Analysis:**
**When** Positions are compared
**Then** System makes one additional LLM call (GPT-4o-mini for cost efficiency):
- Prompt: "Compare these two positions semantically. Are they: 'same' / 'minor_refinement' / 'moderate_shift' / 'significant_change'?"
- Input: Round 1 position vs Round 4 position
- Output: Change magnitude with reasoning
**And** Cost of semantic comparison: ~$0.001 per consultation (minimal)
**And** Result is more accurate than keyword matching

**Change Magnitude Calculation:**
**When** Semantic analysis completes
**Then** Magnitude is determined by:
- LLM semantic similarity assessment (primary method)
- Confidence delta (0.88 - 0.75 = +0.13) as supporting signal
- significant: completely different recommendation
- moderate: same general direction, different specifics
- minor: refined details only

**Value Added Summary:**
**When** Consultation completes
**Then** Summary is displayed:
```
🎯 Debate Value Analysis:
• 2/3 agents changed positions during debate
• Security Expert: minor refinement (confidence +8%)
• Architect: maintained position (confidence +5%)
• Pragmatist: significant shift influenced by Security Expert

Key Insights:
- Early consensus on OAuth framework
- Debate revealed MVP complexity concerns
- Final recommendation balances security and pragmatism
```

**Logged Metadata:**
**When** Consultation is saved
**Then** Log includes debate_value_analysis:
```json
{
  "agents_changed_position": 2,
  "total_agents": 3,
  "change_rate": 0.67,
  "avg_confidence_increase": 0.09,
  "key_influencers": ["pragmatist"],
  "convergence_score": 0.82,
  "semantic_comparison_cost": 0.0012
}
```

**Display in consult-stats:**
**When** User runs `llm-conclave consult-stats`
**Then** Dashboard includes debate value section:
```
Debate Value Metrics:
• Avg Position Changes: 1.8/3 agents (60%)
• Avg Confidence Increase: +11%
• High-Value Debates (>50% change rate): 98 (69%)
```

---

### Story 4.4: Brownfield Project Detection with Documentation Bias

As a **developer**,
I want automatic detection of brownfield projects with bias toward existing documentation,
So that consultations leverage project-specific context instead of generic advice.

**Acceptance Criteria:**

**Given** User runs consultation
**When** Context is loaded
**Then** System detects if project is brownfield

**Brownfield Detection Logic:**
**When** `--project` flag is used
**Then** System scans for brownfield indicators:
- Existing source files (src/, lib/, app/ directories with 10+ files)
- Package manifests (package.json, requirements.txt, Cargo.toml, Gemfile, pom.xml, etc.)
- Configuration files (tsconfig.json, .eslintrc, webpack.config.js, vite.config.ts, etc.)
- Documentation (README.md, ARCHITECTURE.md, CONTRIBUTING.md, etc.)
- Git repository with 10+ commits

**If 3+ indicators found:**
**Then** Project is classified as brownfield
**And** System displays: "🏗️ Brownfield project detected. Biasing toward existing patterns."

**Framework Detection:**
**When** package.json exists
**Then** System detects framework from dependencies:
- React: "react" in dependencies
- Next.js: "next" in dependencies (detect App Router vs Pages Router from directory structure)
- Vue: "vue" in dependencies
- Angular: "@angular/core" in dependencies
- Svelte: "svelte" in dependencies
- Express: "express" in dependencies
- Fastify: "fastify" in dependencies
- NestJS: "@nestjs/core" in dependencies

**When** Other manifest files exist
**Then** System detects:
- Python: requirements.txt → Flask/Django/FastAPI detection
- Ruby: Gemfile → Rails detection
- Rust: Cargo.toml → framework from dependencies
- Java: pom.xml or build.gradle → Spring Boot detection

**Documentation Discovery:**
**When** Brownfield project is detected
**Then** System searches for project documentation:
- README.md, ARCHITECTURE.md, CONTRIBUTING.md, DESIGN.md
- docs/ directory
- .github/ directory (PULL_REQUEST_TEMPLATE, CODING_STANDARDS, etc.)
- Comments in package.json ("description", "keywords")
- JSDoc/TSDoc comments in main entry points

**Context Augmentation:**
**When** Documentation is found
**Then** Agent prompts are augmented:
```
IMPORTANT: This is a brownfield project with existing patterns.

Project Context:
- Framework: Next.js 14 App Router
- State Management: Zustand
- Styling: Tailwind CSS
- Testing: Vitest + Playwright
- API Layer: tRPC
- Database: PostgreSQL with Prisma ORM

When recommending solutions:
1. Prefer patterns already used in this codebase
2. Maintain consistency with existing architecture
3. Only suggest changes if they solve specific problems
4. Consider migration costs and team familiarity
5. Respect existing tech stack choices unless critically flawed
```

**Greenfield vs Brownfield Prompting:**
**When** No brownfield indicators found (greenfield project)
**Then** Prompts focus on best practices and modern patterns
**And** No bias toward existing patterns
**And** System displays: "🆕 Greenfield project. Recommendations based on current best practices."

**Override Flag:**
**Given** User wants to ignore brownfield context
**When** User runs `llm-conclave consult --greenfield "question"`
**Then** System treats project as greenfield even if brownfield indicators exist
**And** Message: "🔧 Ignoring existing patterns (--greenfield mode)"

**Logged Metadata:**
**When** Consultation is saved
**Then** Log includes project_context:
```json
{
  "project_type": "brownfield",
  "framework_detected": "nextjs",
  "framework_version": "14",
  "architecture_pattern": "app_router",
  "tech_stack": {
    "state_management": "zustand",
    "styling": "tailwind",
    "testing": ["vitest", "playwright"],
    "api": "trpc",
    "database": "postgresql",
    "orm": "prisma"
  },
  "indicators_found": ["package.json", "tsconfig.json", "README.md", "src/", "git"],
  "documentation_used": ["README.md", "ARCHITECTURE.md"],
  "bias_applied": true
}
```

---

## Epic 5: Flexible Context & Output Options

Users can provide context from multiple sources (files, projects, stdin) and customize output formats for their workflow.

### Story 5.1: Multi-Source Context Loading with File and Project Support

As a **developer**,
I want to provide context from explicit files or entire projects,
So that consultations have the information they need to give relevant advice.

**Acceptance Criteria:**

**Given** User runs consultation
**When** `--context` flag is provided
**Then** System loads specified files

**Explicit File Context:**
**When** User runs `llm-conclave consult --context file1.ts,file2.md "question"`
**Then** System reads each file:
- file1.ts contents
- file2.md contents
**And** Context is formatted:
```
### File: file1.ts

[contents of file1.ts]

### File: file2.md

[contents of file2.md]
```
**And** Context is prepended to agent prompts in Round 1

**File Path Validation:**
**Given** Invalid file paths are provided
**When** Context loading is attempted
**Then** Error is displayed:
```
❌ Context file not found: /path/to/missing.ts

Valid paths must exist and be readable.
```
**And** Consultation does not proceed

**Project Context (Existing ProjectContext utility):**
**When** User runs `llm-conclave consult --project ./myproject "question"`
**Then** System uses existing ProjectContext utility
**And** Analyzes project structure:
- Framework detection (from Epic 4 Story 4.4)
- File tree summary
- README.md contents
- Key configuration files
**And** Summary is formatted:
```
### Project Context

**Framework:** Next.js 14 App Router
**Structure:**
- src/app/ (App Router pages)
- src/components/ (React components)
- src/lib/ (Utilities)

**Key Files:**
- README.md: [summary]
- package.json: [dependencies]
```

**Combined Context:**
**When** Both `--context` and `--project` flags are used
**Then** Both contexts are included:
1. Project context first (high-level overview)
2. Explicit file context second (specific details)

**Context Size Warning:**
**Given** Context exceeds 10,000 tokens (estimated)
**When** Context is loaded
**Then** Warning is displayed:
```
⚠️ Large context detected (~12,500 tokens)
This may increase cost and response time.
Continue? [Y/n]
```
**And** User can cancel before proceeding

---

### Story 5.2: Sensitive Data Scrubbing with Regex Filter

As a **developer**,
I want automatic detection and masking of sensitive data in context,
So that API keys and secrets don't accidentally leak to external LLM providers.

**Acceptance Criteria:**

**Given** Context is loaded from files or project
**When** Sensitive data filter runs (before transmission to LLMs)
**Then** System applies regex patterns to detect secrets

**Sensitive Pattern Detection:**
**When** Context is scanned
**Then** The following patterns are detected and masked:
- API Keys: `OPENAI_API_KEY=sk-...` → `OPENAI_API_KEY=[REDACTED_API_KEY]`
- Generic secrets: `SECRET_KEY=...`, `API_SECRET=...` → `[REDACTED_SECRET]`
- Passwords: `password: "..."`, `PASSWORD=...` → `[REDACTED_PASSWORD]`
- Tokens: `token: "..."`, `TOKEN=...`, `bearer ...` → `[REDACTED_TOKEN]`
- GitHub tokens: `ghp_...`, `github_pat_...` → `[REDACTED_GITHUB_TOKEN]`
- Private keys: `-----BEGIN PRIVATE KEY-----` → `[REDACTED_PRIVATE_KEY]`
- AWS keys: `AKIA...` → `[REDACTED_AWS_KEY]`
- Database URLs with passwords: `postgresql://user:pass@...` → `postgresql://user:[REDACTED]@...`

**Regex Patterns:**
```typescript
const sensitivePatterns = [
  { pattern: /\b[A-Z_]*API_KEY\s*=\s*['"]?[^\s'"]+['"]?/gi, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\b[A-Z_]*SECRET\s*=\s*['"]?[^\s'"]+['"]?/gi, replacement: '[REDACTED_SECRET]' },
  { pattern: /\bpassword\s*[:=]\s*['"]?[^\s'"]+['"]?/gi, replacement: '[REDACTED_PASSWORD]' },
  { pattern: /\btoken\s*[:=]\s*['"]?[^\s'"]+['"]?/gi, replacement: '[REDACTED_TOKEN]' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /github_pat_[a-zA-Z0-9_]{82}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/gi, replacement: '[REDACTED_PRIVATE_KEY]' },
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  { pattern: /(postgresql|mysql):\/\/([^:]+):([^@]+)@/gi, replacement: '$1://$2:[REDACTED]@' }
];
```

**Scrubbing Report:**
**When** Sensitive data is detected and masked
**Then** User is notified:
```
🔒 Security: 4 sensitive values detected and masked in context:
- 1 GitHub token
- 1 API key
- 1 secret
- 1 database password
```

**No False Positives Warning:**
**When** No sensitive data is detected
**Then** No message is displayed (silent success)
**And** Context is transmitted as-is

**Disable Filter (Advanced Users):**
**Given** User wants to disable scrubbing
**When** User runs `llm-conclave consult --no-scrub "question"`
**Then** Sensitive data filter is skipped
**And** Warning displayed:
```
⚠️ WARNING: Sensitive data scrubbing disabled.
Ensure your context contains no secrets!
```

**Logged Metadata:**
**When** Consultation is logged
**Then** Log includes scrubbing_report:
```json
{
  "sensitive_data_scrubbed": true,
  "patterns_matched": 4,
  "types_detected": ["github_token", "api_key", "secret", "database_password"]
}
```

---

### Story 5.3: Stdin Piping and Output Format Selection

As a **developer**,
I want to pipe data via stdin and choose output formats,
So that consultations integrate seamlessly into my development workflow.

**Acceptance Criteria:**

**Given** User wants to pipe data
**When** User runs `cat file.md | llm-conclave consult "Summarize this"`
**Then** System detects stdin is not a TTY
**And** Reads all stdin data
**And** Includes stdin as context:
```
### Stdin Input

[piped content]
```

**Stdin + File Context:**
**When** User pipes stdin AND provides `--context` flag
**Then** Both contexts are included:
1. Stdin context first
2. Explicit file context second

**Stdin Detection:**
**When** No stdin is available (TTY mode)
**Then** Stdin context section is skipped
**And** Only explicit context is used

**Output Format Selection (FR13):**
**When** User runs `llm-conclave consult --format markdown "question"`
**Then** Output is human-readable Markdown (default from Epic 1 Story 1.7)

**JSON Output:**
**When** User runs `llm-conclave consult --format json "question"`
**Then** Output is machine-readable JSON with all fields:
```json
{
  "consultation_id": "consult-abc123",
  "timestamp": "2025-12-28T10:30:00.000Z",
  "question": "Should I use OAuth or JWT?",
  "consensus": "Use OAuth 2.0 with JWT access tokens",
  "confidence": 0.85,
  "recommendation": "Implement OAuth 2.0...",
  "concerns": ["Token refresh complexity", "..."],
  "dissent": [],
  "perspectives": [
    { "agent": "Security Expert", "model": "claude-sonnet-4.5", "opinion": "..." },
    { "agent": "Architect", "model": "gpt-4o", "opinion": "..." },
    { "agent": "Pragmatist", "model": "gemini-2.5-pro", "opinion": "..." }
  ],
  "cost": { "tokens": { "input": 8234, "output": 4219, "total": 12453 }, "usd": 0.0418 },
  "duration_ms": 14200
}
```

**Both Formats:**
**When** User runs `llm-conclave consult --format both "question"`
**Then** Both Markdown and JSON are output:
1. Markdown first (human-readable)
2. Separator: `\n---\n`
3. JSON second (machine-readable)

**Script Integration Example:**
**When** User runs in script:
```bash
result=$(llm-conclave consult --format json "question")
echo "$result" | jq '.recommendation'
```
**Then** JSON can be parsed with jq or other tools

**Pipe Chain Example:**
**When** User chains commands:
```bash
cat problem.md | llm-conclave consult --format json "Analyze this" | jq '.confidence'
```
**Then** Entire workflow executes smoothly

**Default Format:**
**Given** No `--format` flag is provided
**When** Consultation completes
**Then** Markdown output is displayed (matches Epic 1 default)
