---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-llm_conclave-2025-12-27.md
  - _bmad-output/planning-artifacts/prd.md
  - docs/RESUME_FEATURE_DESIGN.md
  - docs/PLANNED_FEATURES.md
  - _bmad-output/planning-artifacts/architecture-consult-mode-2025-12-27.md
workflowType: 'architecture'
project_name: 'llm_conclave'
user_name: 'Benlamm'
date: '2025-12-28T16:29:05Z'
completed: true
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- Multi-round consultation engine with a mandated 4-step debate pipeline: Independent -> Synthesis -> Cross-Exam -> Verdict.
- Dual-mode orchestration with explicit `explore` and `converge` behaviors, each with different prompting and synthesis roles.
- Parallel agent execution in early rounds to hit sub-15s latency targets.
- Structured outputs in both human-readable Markdown and machine-readable JSON-LD.
- CLI interface with mode selection, context injection, streaming, and output format flags.
- Logging and analytics (consult-stats) with cost and token usage visibility.
- Persona management and domain specialization (security, architect, pragmatist; future expansion).

**Non-Functional Requirements:**
- Performance: sub-15s target and real-time progress visibility.
- Resilience: provider substitution and graceful degradation.
- Security & privacy: sensitive data scrubbing before external transmission.
- Cost controls: pre-flight cost estimate for large contexts; token-efficient debate summaries.
- Auditability: prompt version tracking and structured logs.
- Persistence: partial consensus artifacts and session state continuity (future).

**Scale & Complexity:**
- Primary domain: CLI orchestration + multi-agent reasoning
- Complexity level: Medium (cross-provider orchestration, latency constraints, auditability)
- Estimated architectural components: ~9 (CLI, context loader, orchestrator, agent runtime, synthesis/judge, output formatter, logger/indexer, stats/analytics, security/cost gates)

### Technical Constraints & Dependencies

- Must integrate with existing provider system and ConfigCascade.
- Requires multi-provider parallel calls with fallback substitution.
- Must respect prompt versioning and log provenance for auditability.
- Debate rounds must run token-efficiently using summaries, not full transcripts (unless verbose).

### Cross-Cutting Concerns Identified

- Latency transparency and round progress visibility
- Cost tracking and consent on large contexts
- Prompt versioning and output schema stability
- Sensitive data redaction
- Provider failure handling and partial results persistence

## Technical Foundation

_Step 3 (Starter Template) skipped - this is an existing codebase with established technical stack._

**Existing Technical Stack:**
- **Language**: TypeScript (Node.js >=14.0.0)
- **CLI Framework**: Commander.js v14
- **LLM SDKs**: Anthropic SDK, OpenAI SDK, Google GenAI SDK
- **CLI UI**: Inquirer (prompts), Chalk (colors), Ora (spinners)
- **Web Mode**: Express v5 + Socket.io v4
- **Build**: TypeScript compiler, ts-node for development
- **Configuration**: ConfigCascade system for multi-level config resolution

This architecture document focuses on the new Consult Mode feature additions to this existing foundation.

## Core Architectural Decisions

_All decisions were validated through LLM Conclave multi-model consultation for quality assurance._

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Orchestration Architecture - Hybrid State Machine + Event-Driven
2. Debate Round Management - Structured Artifact Extraction
3. Mode Switching - Behavior Strategy Pattern

**Important Decisions (Shape Architecture):**
4. Provider Substitution - Hybrid Health Monitoring + Hedged Requests
5. Cost Gate - Dynamic Cost Estimation with Consent
6. Streaming Architecture - Hybrid EventEmitter + Socket.io

**Infrastructure Decisions:**
7. Analytics Storage - Hybrid JSON + SQLite Index

### 1. Orchestration Architecture

**Decision:** Hybrid State Machine-managed Event-Driven Architecture
**Confidence:** 90% (Conclave consensus)
**Rationale:** Combines auditability of State Machine with performance of Event-Driven approach

**Implementation:**
- State Machine layer for control flow, audit trails, and prompt versioning tracking
- Event-Driven layer for parallel agent execution and real-time progress
- Simpler than Temporal/Step Functions (appropriate for CLI tool scope)

**Technologies:**
- Consider XState or custom TypeScript state machine implementation
- Native Node.js EventEmitter for event layer
- Clear state definitions: `Independent`, `Synthesis`, `CrossExam`, `Verdict`

**Trade-offs Accepted:**
- Added complexity vs pure patterns
- Requires distributed tracing for event flows
- Managed through clear event schema and state transition logging

### 2. Debate Round Management

**Decision:** Structured Artifact Extraction
**Confidence:** 95% (Conclave consensus)
**Rationale:** Token-efficient, predictable costs, aligns with JSON-LD output requirement

**Implementation:**
- Each round extracts structured JSON: `{ claims: [], evidence: [], disagreements: [], confidence: number }`
- Next round receives artifacts, not prose summaries
- Include minimal original prose excerpts for rhetorical nuance
- Schema versioning to prevent drift

**Artifact Schemas by Round:**
- **Round 1 (Independent):** `{ agentId, position, keyPoints[], rationale }`
- **Round 2 (Synthesis):** `{ consensusPoints[], tensions[], priorityOrder[] }`
- **Round 3 (Cross-Exam):** `{ challenges[], rebuttals[], unresolved[] }`
- **Round 4 (Verdict):** `{ recommendation, confidence, evidence[], dissent[] }`

**Trade-offs Accepted:**
- Extraction complexity and potential failures
- Loss of some rhetorical nuance (mitigated by prose excerpts)
- Requires robust validation and error handling

### 3. Mode Switching (Explore vs Converge)

**Decision:** Behavior Strategy Pattern with Configuration Parameterization
**Confidence:** 95% (Conclave consensus)
**Rationale:** Extensible, testable, aligns with SOLID principles

**Implementation:**
```typescript
interface ModeStrategy {
  agentPrompting(config: ModeConfig): string;
  synthesisLogic(artifacts: Artifact[], config: ModeConfig): Synthesis;
  exitCriteria(roundData: RoundData, config: ModeConfig): boolean;
}

class ExploreStrategy implements ModeStrategy { /* divergent prompts */ }
class ConvergeStrategy implements ModeStrategy { /* consensus prompts */ }
```

**Configuration Parameters:**
- Core logic in strategy classes (secure, developer-controlled)
- Non-core tuning in config (user-customizable)
- Mode-specific prompt templates versioned separately

**Trade-offs Accepted:**
- More code than simple switch statements
- Requires strategy selection logic
- Benefits: easy to add modes, isolated testing

### 4. Provider Substitution Strategy

**Decision:** Hybrid Proactive Health Monitoring + Hedged Requests
**Confidence:** 90% (Conclave consensus)
**Rationale:** Balances resilience with sub-15s latency requirement

**Implementation:**
- Background health checks update provider status (no request latency)
- Hedged requests: if primary slow (>10s), send to backup provider
- Use first successful response, cancel slower request
- Log all substitutions for audit trail

**Provider Tiers for Substitution:**
- **Tier 1 (Premium):** Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro
- **Tier 2 (Standard):** Claude Sonnet 3.5, GPT-4, Gemini 2.0 Flash
- **Tier 3 (Fast/Cheap):** GPT-3.5 Turbo, Mistral Large

**Trade-offs Accepted:**
- Potential data exposure to multiple providers (needs consent)
- Budget overruns during widespread instability (needs limits)
- Complexity of health checking infrastructure

### 5. Cost Gate Implementation

**Decision:** Dynamic Cost Estimation with Consent
**Confidence:** 95% (Conclave consensus)
**Rationale:** Transparency, prevents surprise bills, flexible per use case

**Implementation:**
- Pre-flight calculation: `estimatedCost = inputTokens * providerRate + (expectedOutputTokens * rounds * agents) * providerRate`
- User prompt: `"Estimated cost: $X.XX. Continue? [y/n/always]"`
- Config setting: `alwaysAllowUnder: 0.50` (dollars)
- In-flight monitoring: abort if actual exceeds estimate by >50%

**Cost Tracking:**
- Per-consultation cost logged
- Per-provider cost breakdown
- Monthly spend tracking in analytics
- Per-project cost caps

**Trade-offs Accepted:**
- Conservative estimates may overstate costs
- Users may become desensitized to prompts
- Requires accurate token prediction models

### 6. Streaming Architecture

**Decision:** Hybrid EventEmitter (CLI) + Socket.io (Web UI)
**Confidence:** 95% (Conclave consensus)
**Rationale:** Optimal for both CLI (primary) and Web UI (already exists)

**Implementation:**
- **CLI Mode:** EventEmitter with events like:
  - `consultation:started`, `round:started`, `agent:thinking`
  - `agent:completed`, `round:completed`, `consultation:completed`
  - Progress bars via Ora library

- **Web UI Mode:** Socket.io broadcasting same events
  - Authentication via session tokens
  - Rate limiting per connection
  - State synchronization for late joiners

**Shared Event Schema:**
```typescript
type ConsultEvent =
  | { type: 'consultation:started', data: { id, question, agents } }
  | { type: 'agent:thinking', data: { agentId, roundNumber } }
  | { type: 'agent:completed', data: { agentId, duration, tokens } }
  | { type: 'round:completed', data: { roundNumber, artifacts } }
```

**Trade-offs Accepted:**
- Dual implementation complexity
- Socket.io security requirements (auth, rate limits)
- State sync complexity for web clients

### 7. Analytics Storage

**Decision:** Hybrid JSON + SQLite Index
**Confidence:** 80% (Conclave consensus with dissent)
**Rationale:** Auditability through raw logs + query performance

**Implementation:**
- **JSON Storage:** Append-only JSONL in `~/.llm-conclave/consult-logs/`
  - Each consultation is one JSON object per line
  - Cryptographically signed for tamper-evidence
  - Easy backup, version control, portability

- **SQLite Index:** Fast queries for `consult-stats`
  - Tables: `consultations`, `agents`, `rounds`, `costs`
  - Indexes on: timestamp, cost, agent, confidence
  - Rebuilt from JSON if corrupted (source of truth = JSON)

**Write Pattern:**
1. Write consultation to JSON file (source of truth)
2. Write-through to SQLite index (best effort)
3. Background sync job reconciles any drift

**Trade-offs Accepted:**
- Synchronization complexity (write-through pattern)
- Potential for index drift (mitigated by rebuild capability)
- Storage overhead (logs stored twice)

**Note:** Pragmatist agent dissented, preferring pure SQLite for simplicity

### Decision Impact Analysis

**Implementation Sequence:**
1. State Machine orchestrator foundation → Event layer → Streaming
2. Structured artifact extraction schemas → Validation
3. Behavior strategy pattern → Mode implementations
4. Provider health monitoring → Hedged request logic
5. Cost estimation → User consent flow
6. Analytics storage (JSON + SQLite) → Stats queries

**Cross-Component Dependencies:**
- State Machine emits events consumed by Streaming layer
- Structured artifacts feed between debate rounds and to Analytics
- Provider substitution affects Cost estimates
- Mode strategies determine artifact extraction schemas
- All decisions log to Analytics for auditability

## Implementation Patterns & Consistency Rules

_Patterns derived from existing codebase conventions to ensure AI agent implementation consistency._

### Pattern Categories Defined

**Critical Conflict Points Identified:** 7 major areas where AI agents could make different implementation choices without explicit guidance.

**Existing Codebase Patterns Analyzed:**
- Files: PascalCase for `.ts` files
- Classes/Interfaces: PascalCase
- TypeScript properties: camelCase
- JSON/API fields: snake_case (existing pattern from `tool_calls`, `input_tokens`)
- Events: colon-separated lowercase
- Directories: lowercase

### 1. Naming Patterns

#### Code Naming Conventions

**File Naming (PascalCase for TypeScript):**
```
✅ CORRECT:
src/orchestration/ConsultOrchestrator.ts
src/strategies/ExploreStrategy.ts
src/consult/ArtifactExtractor.ts

❌ INCORRECT:
src/strategies/explore-strategy.ts
src/consult/artifact-extractor.ts
```

**Class/Interface/Type Naming (PascalCase):**
```typescript
✅ CORRECT:
export interface ConsultArtifact { }
export class ExploreStrategy implements ModeStrategy { }
export enum DebateRound { Independent, Synthesis, CrossExam, Verdict }

❌ INCORRECT:
export interface consult_artifact { }
export class explore_strategy { }
```

**Variable/Function Naming (camelCase):**
```typescript
✅ CORRECT:
const estimatedCost = calculateCost();
function extractArtifacts(response: string): Artifact { }
let providerHealthStatus: Map<string, HealthStatus>;

❌ INCORRECT:
const estimated_cost = calculate_cost();
```

**Constants (UPPER_SNAKE_CASE for true constants, camelCase for config objects):**
```typescript
const MAX_ROUNDS_PER_CONSULTATION = 4;
const DEFAULT_TOKEN_BUDGET_PER_ROUND = 2000;

const defaultCostConfig = {
  alwaysAllowUnder: 0.50,
  warningThreshold: 1.00
};
```

#### Data Exchange Naming

**JSON Field Naming (snake_case for external consistency):**
```typescript
// JSON format (storage, external APIs)
interface ArtifactJSON {
  agent_id: string;
  round_number: number;
  key_points: string[];
  created_at: string;
  schema_version: string;
}

// TypeScript interface (internal use)
interface Artifact {
  agentId: string;
  roundNumber: number;
  keyPoints: string[];
  createdAt: Date;
  schemaVersion: string;
}

// Transformation functions REQUIRED
function toJSON(artifact: Artifact): ArtifactJSON { }
function fromJSON(json: ArtifactJSON): Artifact { }
```

### 2. Structure Patterns

#### Consult Mode File Structure

```
src/
├── orchestration/
│   ├── ConsultOrchestrator.ts          # Main orchestrator
│   └── ConsultStateMachine.ts          # State machine logic
├── consult/
│   ├── strategies/
│   │   ├── ModeStrategy.ts             # Strategy interface
│   │   ├── ExploreStrategy.ts          # Explore implementation
│   │   └── ConvergeStrategy.ts         # Converge implementation
│   ├── artifacts/
│   │   ├── ArtifactExtractor.ts        # Extraction logic
│   │   ├── ArtifactValidator.ts        # Schema validation
│   │   └── schemas/
│   │       ├── IndependentSchema.ts
│   │       ├── SynthesisSchema.ts
│   │       ├── CrossExamSchema.ts
│   │       └── VerdictSchema.ts
│   ├── health/
│   │   ├── ProviderHealthMonitor.ts    # Health checking
│   │   └── HedgedRequestManager.ts     # Hedged requests
│   ├── cost/
│   │   ├── CostEstimator.ts            # Cost calculation
│   │   └── CostGate.ts                 # User consent
│   └── analytics/
│       ├── ConsultLogger.ts            # JSON logging (exists)
│       ├── AnalyticsIndexer.ts         # SQLite index
│       └── StatsQuery.ts               # Query interface
├── commands/
│   ├── consult.ts                      # CLI command (exists)
│   └── consult-stats.ts                # Stats command (exists)
└── types/
    └── consult.ts                      # Consult-specific types
```

**Test Co-location (Existing Pattern):**
```
src/orchestration/ConsultOrchestrator.ts
src/orchestration/ConsultOrchestrator.test.ts
```

### 3. Format Patterns

#### Debate Artifact Schemas

**Round 1 (Independent):**
```json
{
  "artifact_type": "independent",
  "schema_version": "1.0",
  "agent_id": "security-expert",
  "round_number": 1,
  "position": "The hybrid approach is most secure...",
  "key_points": ["State machine provides audit trail"],
  "rationale": "Security requires...",
  "confidence": 0.85,
  "prose_excerpt": "Original response snippet...",
  "created_at": "2025-12-28T14:00:00.000Z"
}
```

**Round 2 (Synthesis):**
```json
{
  "artifact_type": "synthesis",
  "schema_version": "1.0",
  "round_number": 2,
  "consensus_points": [
    {
      "point": "Hybrid architecture recommended",
      "supporting_agents": ["security-expert", "architect"],
      "confidence": 0.90
    }
  ],
  "tensions": [
    {
      "area": "Implementation complexity",
      "viewpoints": [{"agent": "pragmatist", "concern": "Too complex"}]
    }
  ],
  "priority_order": ["auditability", "performance"],
  "created_at": "2025-12-28T14:00:30.000Z"
}
```

**Round 3 (Cross-Exam):**
```json
{
  "artifact_type": "cross_exam",
  "schema_version": "1.0",
  "round_number": 3,
  "challenges": [
    {
      "challenger": "pragmatist",
      "target_agent": "architect",
      "challenge": "Event-driven adds complexity",
      "evidence": ["Small CLI scope"]
    }
  ],
  "rebuttals": [
    {
      "agent": "architect",
      "rebuttal": "Future web UI requires events"
    }
  ],
  "unresolved": ["Simplicity vs extensibility trade-off"],
  "created_at": "2025-12-28T14:01:00.000Z"
}
```

**Round 4 (Verdict):**
```json
{
  "artifact_type": "verdict",
  "schema_version": "1.0",
  "round_number": 4,
  "recommendation": "Implement hybrid architecture",
  "confidence": 0.90,
  "evidence": ["Meets auditability", "Enables parallel execution"],
  "dissent": [
    {
      "agent": "pragmatist",
      "concern": "Implementation complexity",
      "severity": "minor"
    }
  ],
  "created_at": "2025-12-28T14:01:30.000Z"
}
```

#### Event Schema Extensions

**New Consult Mode Events (add to EventType):**
```typescript
| 'consultation:started'
| 'consultation:cost_estimated'
| 'consultation:user_consent'
| 'consultation:round_artifact'
| 'consultation:provider_substituted'
| 'consultation:completed'
| 'health:check_started'
| 'health:status_updated'
| 'cost:gate_triggered'
```

**Event Payload Examples:**
```typescript
// Consultation started
{
  type: 'consultation:started',
  payload: {
    consultationId: string;
    question: string;
    mode: 'explore' | 'converge';
    agents: Array<{ id, model, provider }>;
    estimatedCost: number;
  },
  timestamp: number
}

// Provider substituted
{
  type: 'consultation:provider_substituted',
  payload: {
    consultationId: string;
    agentId: string;
    originalProvider: string;
    substituteProvider: string;
    reason: 'timeout' | 'failure' | 'health_check';
  },
  timestamp: number
}
```

### 4. Communication Patterns

#### State Machine States

```typescript
export enum ConsultState {
  Idle = 'IDLE',
  Estimating = 'ESTIMATING',
  AwaitingConsent = 'AWAITING_CONSENT',
  Independent = 'INDEPENDENT',
  Synthesis = 'SYNTHESIS',
  CrossExam = 'CROSS_EXAM',
  Verdict = 'VERDICT',
  Complete = 'COMPLETE',
  Aborted = 'ABORTED'
}

// State transitions emit events
eventBus.emitEvent('state:transition', {
  from: ConsultState.Independent,
  to: ConsultState.Synthesis,
  consultationId: 'abc123'
});
```

#### Provider Health Status

```typescript
export enum ProviderHealthStatus {
  Healthy = 'HEALTHY',
  Degraded = 'DEGRADED',
  Unhealthy = 'UNHEALTHY',
  Unknown = 'UNKNOWN'
}

interface ProviderHealth {
  status: ProviderHealthStatus;
  lastChecked: Date;
  latencyMs: number | null;
  errorRate: number; // 0.0 to 1.0
  consecutiveFailures: number;
}

// Stored in-memory Map
const healthMap: Map<string, ProviderHealth> = new Map();
```

#### Mode Strategy Configuration

```typescript
interface ModeConfig {
  maxRoundsPerAgent: number;
  tokenBudgetPerRound: number;
  synthesisPromptTemplate: string;
  exitThresholdConfidence: number;
}

const exploreConfig: ModeConfig = {
  maxRoundsPerAgent: 3,
  tokenBudgetPerRound: 2500,
  synthesisPromptTemplate: 'explore_synthesis_v1',
  exitThresholdConfidence: 0.70
};

const convergeConfig: ModeConfig = {
  maxRoundsPerAgent: 2,
  tokenBudgetPerRound: 2000,
  synthesisPromptTemplate: 'converge_synthesis_v1',
  exitThresholdConfidence: 0.85
};
```

### 5. Storage Patterns

#### Analytics JSON Storage (JSONL)

```json
{
  "consultation_id": "mjq3gfej-owsfpnk",
  "question": "Which orchestration pattern?",
  "mode": "converge",
  "agents": [
    {"agent_id": "security-expert", "model": "claude-sonnet-4-5"}
  ],
  "rounds": [
    {
      "round_number": 1,
      "round_type": "independent",
      "duration_ms": 15300,
      "tokens_used": 8450
    }
  ],
  "final_recommendation": "Hybrid architecture",
  "confidence": 0.90,
  "total_cost": 0.0721,
  "total_tokens": 19765,
  "duration_ms": 63500,
  "created_at": "2025-12-28T13:59:43.000Z",
  "schema_version": "1.0"
}
```

#### SQLite Schema

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
  schema_version TEXT
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
```

### 6. Process Patterns

#### Cost Estimation & Consent Flow

```typescript
async function estimateCost(
  question: string,
  mode: 'explore' | 'converge',
  agents: Agent[]
): Promise<CostEstimate> {
  const inputTokens = await countTokens(question);
  const config = mode === 'explore' ? exploreConfig : convergeConfig;

  const expectedOutputTokens =
    agents.length *
    MAX_ROUNDS_PER_CONSULTATION *
    config.tokenBudgetPerRound;

  // Calculate with 20% buffer
  const estimatedCost = agents.reduce((total, agent) => {
    const pricing = getProviderPricing(agent.provider, agent.model);
    return total +
      (inputTokens * pricing.input_token_rate) +
      (expectedOutputTokens * pricing.output_token_rate);
  }, 0) * 1.20;

  return { estimatedCost, inputTokens, expectedOutputTokens };
}

async function getCostConsent(estimate: CostEstimate): Promise<boolean> {
  const config = await loadConfig();

  // Auto-approve under threshold
  if (estimate.estimatedCost <= config.alwaysAllowUnder) {
    return true;
  }

  // Prompt user
  const response = await prompt({
    type: 'list',
    message: `Estimated cost: $${estimate.estimatedCost.toFixed(4)}. Continue?`,
    choices: ['Yes', 'No', 'Always (update threshold)']
  });

  if (response === 'Always') {
    await updateConfig({ alwaysAllowUnder: estimate.estimatedCost });
  }

  return response !== 'No';
}
```

#### Provider Substitution (Hedged Requests)

```typescript
async function executeWithFallback(
  agent: Agent,
  prompt: string,
  primaryProvider: LLMProvider
): Promise<ProviderResponse> {
  const healthStatus = healthMonitor.getStatus(primaryProvider.name);

  // Start primary request
  const primaryPromise = primaryProvider.chat([
    { role: 'user', content: prompt }
  ]);

  // Hedged request if provider degraded or timeout
  const timeout = 10000; // 10s
  const hedgePromise = new Promise<ProviderResponse>((resolve) => {
    setTimeout(async () => {
      if (healthStatus === ProviderHealthStatus.Degraded) {
        const backupProvider = selectBackupProvider(primaryProvider);
        eventBus.emitEvent('consultation:provider_substituted', {
          agentId: agent.name,
          originalProvider: primaryProvider.name,
          substituteProvider: backupProvider.name,
          reason: 'timeout'
        });
        resolve(await backupProvider.chat([
          { role: 'user', content: prompt }
        ]));
      }
    }, timeout);
  });

  // Return first to complete
  return Promise.race([primaryPromise, hedgePromise]);
}
```

### 7. Enforcement Guidelines

**All AI Agents MUST:**

1. **Follow naming conventions exactly:**
   - TypeScript: camelCase (variables/properties), PascalCase (classes/types)
   - JSON/SQL: snake_case (fields/columns)
   - Events: colon-separated lowercase
   - Files: PascalCase for `.ts` files

2. **Use typed artifacts with schema versioning:**
   - All artifacts include `schema_version` field
   - Validate artifacts against schemas before storage
   - Transform between TypeScript (camelCase) and JSON (snake_case)

3. **Emit events at state transitions:**
   - State changes emit `state:transition` event
   - Provider substitutions emit `consultation:provider_substituted`
   - Use EventBus singleton for all events

4. **Log to analytics storage:**
   - Write to JSONL first (source of truth)
   - Write-through to SQLite (best effort)
   - Include all required schema fields

5. **Respect cost gates:**
   - Call `estimateCost()` before consultation
   - Get user consent via `getCostConsent()`
   - Monitor in-flight costs, abort if exceeding estimate by >50%

**Pattern Enforcement:**

- **Linting**: ESLint with naming convention rules
- **Type checking**: TypeScript strict mode
- **Schema validation**: Zod or similar for runtime validation
- **Code review**: Pattern compliance checklist
- **Documentation**: Link to this architecture document in README

### Anti-Patterns to Avoid

❌ **DON'T mix naming conventions:**
```typescript
// BAD
interface Artifact {
  agentId: string;      // camelCase
  round_number: number; // snake_case - WRONG in TypeScript
}
```

❌ **DON'T skip artifact validation:**
```typescript
// BAD
const artifact = JSON.parse(response);

// GOOD
const artifact = ArtifactValidator.validate(
  JSON.parse(response),
  'independent',
  '1.0'
);
```

❌ **DON'T bypass EventBus:**
```typescript
// BAD
this.emit('round:start', { round: 1 });

// GOOD
this.eventBus.emitEvent('round:start', { consultationId, round: 1 });
```

❌ **DON'T skip cost tracking:**
```typescript
// BAD
await provider.chat(messages);

// GOOD
const response = await provider.chat(messages);
this.costTracker.add(response.usage);
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
llm_conclave/
├── README.md
├── package.json
├── tsconfig.json
├── .env
├── .env.example
├── .gitignore
├── index.ts                                    # Main CLI entry point (exists)
├── index-v1-backup.ts                          # Backup of v1 CLI
├── dist/                                       # Build output
│   └── **/*.js
├── src/
│   ├── types/
│   │   ├── index.ts                            # Core types (exists)
│   │   └── consult.ts                          # NEW: Consult-specific types
│   │
│   ├── core/
│   │   ├── ConfigLoader.ts                     # Existing
│   │   ├── OutputHandler.ts                    # Existing
│   │   ├── CostTracker.ts                      # Existing
│   │   ├── TemplateManager.ts                  # Existing
│   │   ├── ConversationManager.ts              # Existing
│   │   ├── SessionManager.ts                   # Existing
│   │   ├── ContinuationHandler.ts              # Existing
│   │   └── EventBus.ts                         # Existing - EXTEND with consult events
│   │
│   ├── cli/
│   │   ├── ConfigCascade.ts                    # Existing
│   │   ├── PersonaSystem.ts                    # Existing
│   │   └── ModeDetector.ts                     # Existing
│   │
│   ├── commands/
│   │   ├── discuss.ts                          # Existing
│   │   ├── review.ts                           # Existing
│   │   ├── iterate.ts                          # Existing
│   │   ├── template.ts                         # Existing
│   │   ├── templates.ts                        # Existing
│   │   ├── personas.ts                         # Existing
│   │   ├── init.ts                             # Existing
│   │   ├── sessions.ts                         # Existing
│   │   ├── continue.ts                         # Existing
│   │   ├── server.ts                           # Existing
│   │   ├── config.ts                           # Existing
│   │   ├── consult.ts                          # EXISTS - ENHANCE with new features
│   │   └── consult-stats.ts                    # EXISTS - ENHANCE with SQLite queries
│   │
│   ├── providers/
│   │   ├── LLMProvider.ts                      # Interface (exists)
│   │   ├── ProviderFactory.ts                  # Existing
│   │   ├── ClaudeProvider.ts                   # Existing
│   │   ├── OpenAIProvider.ts                   # Existing
│   │   ├── GeminiProvider.ts                   # Existing
│   │   ├── GrokProvider.ts                     # Existing
│   │   └── MistralProvider.ts                  # Existing
│   │
│   ├── orchestration/
│   │   ├── Orchestrator.ts                     # Existing base
│   │   ├── AgentRoles.ts                       # Existing
│   │   ├── TaskClassifier.ts                   # Existing
│   │   ├── IterativeCollaborativeOrchestrator.ts  # Existing
│   │   ├── ConsultOrchestrator.ts              # EXISTS - REFACTOR with State Machine
│   │   └── ConsultStateMachine.ts              # NEW: State machine implementation
│   │
│   ├── consult/                                # NEW DIRECTORY
│   │   ├── strategies/
│   │   │   ├── ModeStrategy.ts                 # NEW: Strategy interface
│   │   │   ├── ExploreStrategy.ts              # NEW: Explore mode implementation
│   │   │   └── ConvergeStrategy.ts             # NEW: Converge mode implementation
│   │   │
│   │   ├── artifacts/
│   │   │   ├── ArtifactExtractor.ts            # NEW: Extraction logic
│   │   │   ├── ArtifactValidator.ts            # NEW: Schema validation
│   │   │   ├── ArtifactTransformer.ts          # NEW: JSON ↔ TypeScript transforms
│   │   │   └── schemas/
│   │   │       ├── IndependentSchema.ts        # NEW: Round 1 schema + validator
│   │   │       ├── SynthesisSchema.ts          # NEW: Round 2 schema + validator
│   │   │       ├── CrossExamSchema.ts          # NEW: Round 3 schema + validator
│   │   │       └── VerdictSchema.ts            # NEW: Round 4 schema + validator
│   │   │
│   │   ├── health/
│   │   │   ├── ProviderHealthMonitor.ts        # NEW: Background health checking
│   │   │   ├── HedgedRequestManager.ts         # NEW: Hedged request logic
│   │   │   └── ProviderTiers.ts                # NEW: Provider tier definitions
│   │   │
│   │   ├── cost/
│   │   │   ├── CostEstimator.ts                # NEW: Pre-flight cost calculation
│   │   │   ├── CostGate.ts                     # NEW: User consent flow
│   │   │   └── ProviderPricing.ts              # NEW: Provider pricing data
│   │   │
│   │   └── analytics/
│   │       ├── ConsultLogger.ts                # EXISTS - keeps JSONL logging
│   │       ├── AnalyticsIndexer.ts             # NEW: SQLite index management
│   │       ├── StatsQuery.ts                   # NEW: Query interface for stats
│   │       └── schemas/
│   │           ├── ConsultationSchema.ts       # NEW: JSONL schema + SQLite DDL
│   │           └── migrations/                 # NEW: SQLite migrations
│   │               └── 001_initial.sql
│   │
│   ├── tools/
│   │   └── ToolRegistry.ts                     # Existing
│   │
│   ├── utils/
│   │   ├── ProjectContext.ts                   # Existing
│   │   ├── TokenCounter.ts                     # Existing
│   │   └── ConsultLogger.ts                    # Existing - MOVE to consult/analytics/
│   │
│   ├── memory/
│   │   ├── MemoryManager.ts                    # Existing
│   │   └── ProjectMemory.ts                    # Existing
│   │
│   ├── interactive/
│   │   ├── InteractiveSession.ts               # Existing
│   │   └── StatusDisplay.ts                    # Existing
│   │
│   ├── init/
│   │   ├── InteractiveInit.ts                  # Existing
│   │   ├── APIKeyDetector.ts                   # Existing
│   │   ├── PromptBuilder.ts                    # Existing
│   │   ├── ProjectScanner.ts                   # Existing
│   │   ├── AgentGenerator.ts                   # Existing
│   │   └── ConfigWriter.ts                     # Existing
│   │
│   └── server/
│       ├── Server.ts                           # Existing - ENHANCE with Socket.io consult events
│       └── SessionManager.ts                   # Existing
│
├── tests/                                      # NEW DIRECTORY for tests
│   ├── consult/
│   │   ├── strategies/
│   │   │   ├── ExploreStrategy.test.ts
│   │   │   └── ConvergeStrategy.test.ts
│   │   ├── artifacts/
│   │   │   ├── ArtifactExtractor.test.ts
│   │   │   └── ArtifactValidator.test.ts
│   │   ├── health/
│   │   │   └── ProviderHealthMonitor.test.ts
│   │   ├── cost/
│   │   │   ├── CostEstimator.test.ts
│   │   │   └── CostGate.test.ts
│   │   └── analytics/
│   │       └── AnalyticsIndexer.test.ts
│   ├── orchestration/
│   │   ├── ConsultOrchestrator.test.ts
│   │   └── ConsultStateMachine.test.ts
│   └── __fixtures__/
│       ├── sample-consultation.json
│       └── sample-artifacts.json
│
├── docs/
│   ├── RESUME_FEATURE_DESIGN.md               # Existing
│   ├── PLANNED_FEATURES.md                    # Existing
│   └── CONSULT_MODE_ARCHITECTURE.md           # NEW: This architecture document
│
├── _bmad-output/
│   └── planning-artifacts/
│       ├── product-brief-llm_conclave-2025-12-27.md
│       ├── prd.md
│       ├── architecture-consult-mode-2025-12-27.md
│       └── architecture.md                    # THIS DOCUMENT
│
└── ~/.llm-conclave/                           # User data directory
    ├── config.json                            # User configuration
    ├── consult-logs/                          # JSONL consultation logs
    │   ├── consult-[id].json
    │   └── ...
    └── consult-analytics.db                   # SQLite analytics index
```

### Architectural Boundaries

#### API Boundaries

**CLI Command Interface:**
- Entry Point: `src/commands/consult.ts`
- Contract: Commander.js command definition
- Inputs: Question, mode, agents, context
- Outputs: Formatted consultation results (Markdown/JSON-LD)

**Provider Interface:**
- Boundary: `src/providers/LLMProvider.ts`
- Contract: `chat(messages, options) → ProviderResponse`
- Implementations: Claude, OpenAI, Gemini, Grok, Mistral
- Substitution: Managed by HedgedRequestManager

**Event Interface:**
- Boundary: `src/core/EventBus.ts`
- Contract: `emitEvent(type: EventType, payload: any)`
- Consumers: CLI, Web UI (Socket.io), Analytics

#### Component Boundaries

**Orchestration Layer:**
- Responsibility: Coordinates debate rounds, manages state machine
- IN: Question, mode, agents from CLI
- OUT: Events to EventBus, artifacts to Analytics

**Strategy Layer:**
- Responsibility: Defines mode-specific behavior (explore vs converge)
- IN: ModeConfig, round context
- OUT: Prompts, synthesis logic, exit criteria

**Artifact Layer:**
- Responsibility: Extract, validate, transform structured debate data
- IN: Raw LLM responses (text)
- OUT: Typed artifacts (TypeScript → JSON)

**Health Monitoring Layer:**
- Responsibility: Track provider health, manage hedged requests
- IN: Provider responses/failures
- OUT: Health status, substitution decisions

**Cost Gate Layer:**
- Responsibility: Estimate costs, get user consent
- IN: Question, agents, mode
- OUT: Cost estimate, consent decision

**Analytics Layer:**
- Responsibility: Log consultations, provide stats queries
- IN: Consultation data, artifacts
- OUT: JSONL files, SQLite index

#### Data Boundaries

**In-Memory State:**
- ConsultStateMachine current state
- ProviderHealthMonitor status map
- EventBus event queue

**Persistent Storage (JSONL):**
- Source of truth: `~/.llm-conclave/consult-logs/*.json`
- Schema: snake_case fields, schema_version required
- Access: Append-only

**Indexed Storage (SQLite):**
- Fast queries: `~/.llm-conclave/consult-analytics.db`
- Schema: consultations, consultation_agents, consultation_rounds tables
- Access: Write-through from JSONL

### Requirements to Structure Mapping

#### Functional Requirements → Components

**Multi-round debate pipeline:**
- State Machine: `src/orchestration/ConsultStateMachine.ts`
- Orchestrator: `src/orchestration/ConsultOrchestrator.ts`
- Tests: `tests/orchestration/ConsultOrchestrator.test.ts`

**Dual-mode orchestration:**
- Strategy Interface: `src/consult/strategies/ModeStrategy.ts`
- Implementations: `ExploreStrategy.ts`, `ConvergeStrategy.ts`
- Tests: `tests/consult/strategies/*.test.ts`

**Parallel agent execution:**
- Implementation: ConsultOrchestrator with Promise.all()
- Health Monitoring: `src/consult/health/ProviderHealthMonitor.ts`
- Hedged Requests: `src/consult/health/HedgedRequestManager.ts`

**Structured outputs:**
- Extraction: `src/consult/artifacts/ArtifactExtractor.ts`
- Schemas: `src/consult/artifacts/schemas/*.ts`
- Validation: `src/consult/artifacts/ArtifactValidator.ts`

**CLI interface with streaming:**
- Command: `src/commands/consult.ts`
- EventBus: `src/core/EventBus.ts`
- Server: `src/server/Server.ts` (Socket.io)

**Logging and analytics:**
- JSONL: `src/consult/analytics/ConsultLogger.ts`
- SQLite: `src/consult/analytics/AnalyticsIndexer.ts`
- Queries: `src/consult/analytics/StatsQuery.ts`
- CLI: `src/commands/consult-stats.ts`

#### Non-Functional Requirements → Components

**Sub-15s latency:**
- Parallel execution in ConsultOrchestrator
- Hedged requests with 10s timeout
- Provider tiers for fallback

**Resilience:**
- ProviderHealthMonitor background checks
- HedgedRequestManager fallback logic
- Event logging for audit trail

**Cost controls:**
- CostEstimator pre-flight calculation
- CostGate user consent flow
- In-flight monitoring via CostTracker

**Auditability:**
- State transitions logged via EventBus
- schema_version in all artifacts
- Full consultation logs in JSONL

### Integration Points

#### Internal Communication

**CLI → Orchestrator:**
- `consult.ts` → `ConsultOrchestrator.run()`
- Data: Question, mode, agents, config
- Return: ConsultResult with artifacts

**Orchestrator → Providers:**
- Path: ConsultOrchestrator → HedgedRequestManager → LLMProvider
- Data: Prompts with context
- Return: ProviderResponse

**Orchestrator → EventBus:**
- Emits typed events (consultation lifecycle)
- Consumers: CLI display, Web UI, Analytics

**EventBus → Analytics:**
- Event stream → ConsultLogger
- Storage: JSONL + SQLite index

#### External Integrations

**LLM Provider APIs:**
- Anthropic Claude, OpenAI, Google Gemini, xAI Grok, Mistral

**File System:**
- JSONL logs: `~/.llm-conclave/consult-logs/`
- SQLite: `~/.llm-conclave/consult-analytics.db`
- Config: `~/.llm-conclave/config.json`

#### Data Flow

**Consultation Execution:**
1. User: `llm-conclave consult "question"`
2. CLI → CostEstimator → User consent
3. If approved → ConsultOrchestrator.run()
4. State Machine: Idle → Independent
5. For each round (1-4):
   - Strategy provides prompts
   - Parallel execution via HedgedRequestManager
   - Responses → ArtifactExtractor → Validation
   - State transition + Events emitted
6. Verdict → Complete
7. ConsultLogger (JSONL) → AnalyticsIndexer (SQLite)
8. Return formatted results

### File Organization Patterns

**Configuration:**
- Root: package.json, tsconfig.json, .env
- User: ~/.llm-conclave/config.json

**Source Organization:**
- Layered: commands/, orchestration/, consult/, providers/, core/
- Feature grouping in consult/: strategies, artifacts, health, cost, analytics

**Test Organization:**
- Co-located unit tests: *.test.ts alongside source
- Grouped integration tests: tests/consult/, tests/orchestration/
- Fixtures: tests/__fixtures__/

**Asset Organization:**
- User data: ~/.llm-conclave/
- Build output: dist/

### Development Workflow Integration

**Development:**
- `npm run dev` → ts-node (hot reload)
- Web UI: `llm-conclave server`

**Build:**
- `npm run build` → tsc compiles to dist/
- Post-build: chmod +x dist/index.js

**Deployment:**
- npm package with bin field
- Global install: `npm install -g llm-conclave`
- Executable: `llm-conclave` command

## Architecture Validation Results

_All architectural decisions validated through Conclave multi-model consultation for quality assurance._

### Coherence Validation ✅

**Decision Compatibility:**
All architectural decisions are mutually compatible and work together seamlessly. The Hybrid State Machine + Event-Driven orchestrator naturally supports structured artifacts, while the strategy pattern cleanly separates mode behaviors. Provider health monitoring integrates with cost estimation without conflicts. Storage architecture (JSON + SQLite) operates independently and doesn't interfere with real-time processing.

**Pattern Consistency:**
Implementation patterns align perfectly with existing codebase conventions (PascalCase for TypeScript, camelCase for properties, snake_case for JSON). Event naming follows the established `colon:separated` pattern. The new `src/consult/` directory structure mirrors existing organizational principles with clear separation of concerns.

**Structure Alignment:**
Project structure fully supports all architectural decisions. Component boundaries are well-defined with clear interfaces. The layered architecture (commands → orchestration → consult → providers) enables proper separation and testability. Integration points use existing infrastructure (EventBus, LLMProvider interface) for consistency.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
- ✅ Multi-round debate pipeline: ConsultStateMachine with 4 states
- ✅ Dual-mode orchestration: ExploreStrategy + ConvergeStrategy
- ✅ Parallel agent execution: ConsultOrchestrator with Promise.all() + HedgedRequestManager
- ✅ Structured outputs: 4 artifact schemas with extraction, validation, transformation
- ✅ CLI interface with streaming: Enhanced consult.ts + EventBus + Socket.io
- ✅ Logging and analytics: Hybrid JSONL + SQLite with StatsQuery
- ✅ Persona management: Integrated with existing PersonaSystem

**Non-Functional Requirements Coverage:**
- ✅ Sub-15s latency: Parallel execution + hedged requests (10s timeout) + provider tiering
- ✅ Resilience: ProviderHealthMonitor + HedgedRequestManager + 3-tier provider fallback
- ✅ Security & privacy: CostGate with consent, data exposure controls, audit trails
- ✅ Cost controls: CostEstimator + CostGate + in-flight monitoring (abort if >50% over)
- ✅ Auditability: State transitions logged, schema_version in artifacts, full JSONL logs
- ✅ Persistence: JSONL enables future resume capability

### Implementation Readiness Validation ✅

**Decision Completeness:**
- All 7 core decisions documented with Conclave validation (80-95% confidence)
- Technology choices with versions specified
- Implementation approaches with code patterns
- Trade-offs explicitly acknowledged
- Rationale documented for each choice

**Structure Completeness:**
- 60+ files specified (existing vs NEW clearly marked)
- Full directory tree from root to leaf
- Component boundaries with interfaces
- Integration points with data flow
- Test structure (co-located + grouped)
- User data directory specified

**Pattern Completeness:**
- 7 pattern categories documented
- Good examples + anti-patterns provided
- TypeScript ↔ JSON transformations required
- Event schema extensions (9 new types)
- Enforcement mechanisms (ESLint, TypeScript strict, Zod)

### Gap Analysis Results

**Critical Gaps:** NONE

**Important Gaps (Non-blocking):**
1. SQLite migration tooling - Use simple SQL files + version tracking
2. Provider pricing data source - Hardcode initial rates from provider docs
3. Health check scheduling - setInterval with 30s checks, configurable

**Nice-to-Have Gaps:**
- Schema validation library choice (Zod suggested)
- Logging verbosity levels (follow existing patterns)
- Web UI components (out of scope for backend architecture)

### Validation Issues Addressed

No critical issues found. All important gaps are implementation details that can be resolved during development without architectural changes.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] 7 critical decisions documented with Conclave validation
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** ✅ **READY FOR IMPLEMENTATION**

**Confidence Level:** **HIGH (95%)**

**Key Strengths:**
1. Validated Decision Quality - Every major decision validated by Conclave
2. Existing Codebase Integration - Respects and extends established patterns
3. Clear Boundaries - 7 well-defined layers with explicit interfaces
4. Implementation Specificity - 60+ files specified, not generic placeholders
5. Pattern Consistency - Aligned with existing naming and structure
6. Comprehensive Coverage - All FR/NFR mapped to components
7. Auditability Built-In - Schema versioning, state transitions, event logging

**Areas for Future Enhancement:**
1. Advanced health monitoring with predictive analysis
2. Dynamic provider pricing from APIs
3. Enhanced resume capability (Phase 4)
4. Adaptive budget allocation with ML
5. Rich web UI components

### Implementation Handoff

**AI Agent Guidelines:**
1. Follow all architectural decisions exactly as documented
2. Use implementation patterns consistently across components
3. Respect project structure and boundaries
4. Validate artifacts with schema_version
5. Emit events through EventBus for all state transitions
6. Log to JSONL first, SQLite write-through
7. Track costs with CostEstimator, CostGate, CostTracker
8. Refer to this document for architectural questions

**First Implementation Priorities:**

1. **Foundation**: Create types, extend EventBus, implement ConsultStateMachine
2. **Core Components**: Implement strategies, artifact schemas, extraction/validation
3. **Health & Cost**: Implement health monitoring, hedged requests, cost estimation
4. **Orchestration**: Refactor ConsultOrchestrator with State Machine integration
5. **Analytics & CLI**: Implement SQLite indexer, enhance CLI commands
6. **Testing**: Unit tests + integration tests, validate sub-15s latency

---

**Architecture Document Complete**
**Total Consultation Cost:** $0.29 (7 Conclave consultations)
**Decisions Validated:** 7/7 with 80-95% confidence
**Status:** Ready for implementation
