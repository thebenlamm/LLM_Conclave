# Story 2.6: Token-Efficient Debate with Artifact Filtering

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want agents to receive filtered structured artifacts in later rounds rather than full arrays,
So that token costs are reduced while maintaining the validated JSON artifact structure.

## Acceptance Criteria

### 1. No Filtering in Round 2 (Synthesis)

**Given** Round 2 (Synthesis) is starting
**When** Judge receives Round 1 artifacts
**Then** Full artifacts are used (no filtering in Round 2)
**And** All `IndependentSchema` artifacts passed complete to Judge
**And** Judge can see all agent positions, key points, and rationales

### 2. Round 3 Artifact Filtering (Cross-Examination)

**Given** Round 3 (CrossExam) is starting
**When** Agents receive context from previous rounds
**Then** Each agent receives:
- Their own Round 1 `IndependentSchema` artifact (FULL - unfiltered)
- Filtered Round 2 `SynthesisSchema` artifact with:
  - `consensusPoints[]` limited to top 3 (sorted by `confidence` score descending)
  - `tensions[]` limited to top 2 (sorted by disagreement level - most viewpoints first)
  - `priorityOrder[]` - ALL items preserved (used for ranking)
  - All required fields preserved: `artifactType`, `schemaVersion`, `roundNumber`, `createdAt`
  - **Structure remains valid JSON matching SynthesisSchema.validate()**

**And** Filtered artifact passes `SynthesisSchema.validate()` without errors
**And** Token usage reduced by ~20-40% compared to full artifacts

### 3. Round 4 Artifact Filtering (Verdict)

**Given** Round 4 (Verdict) is starting
**When** Judge receives all round context
**Then** Judge receives:
- All Round 1 `IndependentSchema` artifacts (FULL - needed for comprehensive synthesis)
- Filtered Round 2 `SynthesisSchema` artifact:
  - Top 3 `consensusPoints` (by confidence)
  - Top 2 `tensions` (by disagreement level)
  - All `priorityOrder` items
- Filtered Round 3 `CrossExamSchema` artifact:
  - `challenges[]` limited to top 5 (by severity/importance)
  - `rebuttals[]` limited to top 5 (most substantive by length and key terminology)
  - `unresolved[]` - ALL items preserved (critical for final verdict)
  - All required fields preserved: `artifactType`, `schemaVersion`, `roundNumber`, `createdAt`
  - **Structure remains valid JSON matching CrossExamSchema.validate()**

**And** Filtered artifacts pass schema validation
**And** Judge still has sufficient context for accurate verdict

### 4. Schema Integrity After Filtering

**When** Artifacts are filtered
**Then** All required schema fields are present:
- `artifactType` (unchanged)
- `schemaVersion: "1.0"` (unchanged)
- `roundNumber` (unchanged)
- `createdAt` (unchanged)
- All type-specific fields present (even if arrays are smaller)

**And** Filtered artifacts pass `SynthesisSchema.validate()` or `CrossExamSchema.validate()`
**And** JSON structure matches original schema exactly (no new fields, no removed required fields)
**And** Array item structure within filtered arrays remains identical to original

### 5. Verbose Mode Override

**Given** User runs `llm-conclave consult --verbose "question"`
**When** `--verbose` flag is detected
**Then** All agents receive FULL unfiltered artifacts
**And** No filtering applied to any round
**And** Display message at start: "🔍 Verbose mode: using full debate artifacts (higher token cost)"
**And** Cost estimate reflects higher token usage due to verbose mode

### 6. Token Savings Tracking

**When** Consultation completes with artifact filtering (non-verbose mode)
**Then** Log includes `token_efficiency_stats` object:
```json
{
  "tokens_used": 12450,
  "tokens_saved_via_filtering": 3200,
  "efficiency_percentage": 20.4,
  "filtering_method": "structured_artifact_array_truncation",
  "filtered_rounds": [3, 4]
}
```

**And** Stats include comparison to theoretical unfiltered cost
**And** Efficiency percentage calculated as: `(tokens_saved / (tokens_used + tokens_saved)) * 100`

### 7. Filtering Configuration

**Given** System configuration exists
**When** Filtering limits are needed
**Then** Default limits are:
- Round 3 Synthesis filter: top 3 consensus, top 2 tensions
- Round 4 Synthesis filter: top 3 consensus, top 2 tensions
- Round 4 CrossExam filter: top 5 challenges, top 5 rebuttals

**And** Limits can be overridden via config:
```json
{
  "filtering": {
    "round3": {
      "consensus_points": 3,
      "tensions": 2
    },
    "round4": {
      "consensus_points": 3,
      "tensions": 2,
      "challenges": 5,
      "rebuttals": 5
    }
  }
}
```

## Tasks / Subtasks

- [ ] Create `src/consult/artifacts/ArtifactFilter.ts` (AC: #2, #3, #4)
  - [ ] Implement `filterSynthesisArtifact(artifact, limits)` method
  - [ ] Implement `filterCrossExamArtifact(artifact, limits)` method
  - [ ] Implement sorting logic for consensus points by confidence
  - [ ] Implement sorting logic for tensions by viewpoint count
  - [ ] Implement sorting logic for challenges by severity keywords
  - [ ] Implement sorting logic for rebuttals by substantiveness (length + keywords)
  - [ ] Add schema validation after filtering
  - [ ] Add token estimation for savings calculation

- [ ] Create `src/consult/artifacts/FilterConfig.ts` (AC: #7)
  - [ ] Define `FilterLimits` interface
  - [ ] Implement default filter limits (Round 3 & 4)
  - [ ] Implement config loading from `~/.llm-conclave/config.json`
  - [ ] Add config validation

- [ ] Update `src/orchestration/ConsultOrchestrator.ts` (AC: #2, #3, #5, #6)
  - [ ] Add ArtifactFilter instance to constructor
  - [ ] Add `--verbose` flag detection from CLI
  - [ ] Apply filtering in Round 3 before passing to agents (if not verbose)
  - [ ] Apply filtering in Round 4 before passing to Judge (if not verbose)
  - [ ] Track token savings via CostEstimator
  - [ ] Add token_efficiency_stats to consultation result

- [ ] Update `src/types/consult.ts` (AC: #6)
  - [ ] Add `TokenEfficiencyStats` interface
  - [ ] Add `token_efficiency_stats` field to `ConsultationResult`
  - [ ] Add `verbose` boolean flag to `ConsultationOptions`

- [ ] Update `src/commands/consult.ts` (AC: #5)
  - [ ] Add `--verbose` CLI flag option
  - [ ] Pass verbose flag to ConsultOrchestrator
  - [ ] Display verbose mode message if enabled

- [ ] Update `src/consult/cost/CostEstimator.ts` (AC: #6)
  - [ ] Add `estimateTokenSavings(unfilteredSize, filteredSize)` method
  - [ ] Add `calculateEfficiencyPercentage(saved, total)` method
  - [ ] Integrate with ArtifactFilter for token counting

- [ ] Add Unit Tests
  - [ ] `src/consult/artifacts/__tests__/ArtifactFilter.test.ts`
  - [ ] Test filterSynthesisArtifact() returns valid schema
  - [ ] Test filterCrossExamArtifact() returns valid schema
  - [ ] Test sorting algorithms (consensus by confidence, tensions by viewpoints)
  - [ ] Test array truncation preserves structure
  - [ ] Test filtered artifacts pass schema validation
  - [ ] Test verbose mode bypasses filtering
  - [ ] Test config limits override defaults

- [ ] Add Integration Tests
  - [ ] `src/orchestration/__tests__/ConsultOrchestratorFiltering.test.ts`
  - [ ] Test Round 3 receives filtered Round 2 artifacts
  - [ ] Test Round 4 receives filtered Round 2 & 3 artifacts
  - [ ] Test Round 1 artifacts always unfiltered
  - [ ] Test verbose mode disables all filtering
  - [ ] Test token savings calculation
  - [ ] Test filtering reduces token count by 20-40%

## Dev Notes

### Architecture Compliance

**NFR8 from PRD: Token-Efficient Debate**
> "The system must support **Token-Efficient Debate**. In the debate rounds (Phase 2 & 3), agents should receive condensed summaries of peer outputs rather than full verbatim histories unless the user explicitly requests `--verbose`."

**Epic 2 Story 2.6 Scope:**
- This is **structured artifact filtering**, NOT progressive compression or summarization
- Arrays are truncated to top-N items based on relevance scoring
- JSON schema structure remains 100% intact and valid
- No content summarization - original text preserved for kept items
- Filtering only applies to Rounds 3 & 4 (not Round 2)

**Implementation Note from Epics:**
> "This is **artifact filtering**, not progressive compression. The JSON structure and schema remain identical - only array lengths are reduced by keeping highest-priority items."

**Key Architectural Decisions:**
1. **Preserve Schema Validity:** Filtered artifacts MUST pass `Schema.validate()` checks
2. **No Summarization:** Keep original text for selected items (don't compress/paraphrase)
3. **Intelligent Sorting:** Use confidence scores, viewpoint counts, and keyword analysis for ranking
4. **Configurable Limits:** Allow power users to customize filtering thresholds
5. **Verbose Override:** Always provide escape hatch for full context when needed

### Technical Requirements

**File Structure:**
- Create: `src/consult/artifacts/ArtifactFilter.ts` (new component)
- Create: `src/consult/artifacts/FilterConfig.ts` (config management)
- Create: `src/consult/artifacts/__tests__/ArtifactFilter.test.ts`
- Create: `src/orchestration/__tests__/ConsultOrchestratorFiltering.test.ts`
- Modify: `src/orchestration/ConsultOrchestrator.ts` (filtering integration)
- Modify: `src/types/consult.ts` (token efficiency types)
- Modify: `src/commands/consult.ts` (--verbose flag)
- Modify: `src/consult/cost/CostEstimator.ts` (savings calculation)

**Dependencies:**
- `SynthesisSchema` (existing - validation after filtering)
- `CrossExamSchema` (existing - validation after filtering)
- `CostEstimator` (existing - token counting)
- `ConsultOrchestrator` (existing - orchestration integration)
- Node.js built-ins: no new external dependencies needed

**Filtering Algorithm Design:**

**Synthesis Artifact Filtering (Round 3 & 4):**
```typescript
function filterSynthesisArtifact(
  artifact: SynthesisArtifact,
  limits: { consensusPoints: number; tensions: number }
): SynthesisArtifact {
  // Sort consensus points by confidence (descending)
  const sortedConsensus = [...artifact.consensusPoints]
    .sort((a, b) => b.confidence - a.confidence);

  // Sort tensions by disagreement level (viewpoint count descending)
  const sortedTensions = [...artifact.tensions]
    .sort((a, b) => b.viewpoints.length - a.viewpoints.length);

  // Create filtered artifact with same structure
  const filtered: SynthesisArtifact = {
    artifactType: artifact.artifactType,
    schemaVersion: artifact.schemaVersion,
    roundNumber: artifact.roundNumber,
    consensusPoints: sortedConsensus.slice(0, limits.consensusPoints),
    tensions: sortedTensions.slice(0, limits.tensions),
    priorityOrder: artifact.priorityOrder, // Keep all - used for ranking
    createdAt: artifact.createdAt
  };

  // Validate filtered artifact
  SynthesisSchema.validate(filtered);

  return filtered;
}
```

**CrossExam Artifact Filtering (Round 4 only):**
```typescript
function filterCrossExamArtifact(
  artifact: CrossExamArtifact,
  limits: { challenges: number; rebuttals: number }
): CrossExamArtifact {
  // Sort challenges by severity (keyword scoring)
  const sortedChallenges = [...artifact.challenges]
    .sort((a, b) => {
      const scoreA = calculateSeverityScore(a);
      const scoreB = calculateSeverityScore(b);
      return scoreB - scoreA;
    });

  // Sort rebuttals by substantiveness (length + keyword density)
  const sortedRebuttals = [...artifact.rebuttals]
    .sort((a, b) => {
      const scoreA = calculateSubstantivenessScore(a);
      const scoreB = calculateSubstantivenessScore(b);
      return scoreB - scoreA;
    });

  // Create filtered artifact
  const filtered: CrossExamArtifact = {
    artifactType: artifact.artifactType,
    schemaVersion: artifact.schemaVersion,
    roundNumber: artifact.roundNumber,
    challenges: sortedChallenges.slice(0, limits.challenges),
    rebuttals: sortedRebuttals.slice(0, limits.rebuttals),
    unresolved: artifact.unresolved, // Keep all - critical for verdict
    createdAt: artifact.createdAt
  };

  // Validate filtered artifact
  CrossExamSchema.validate(filtered);

  return filtered;
}

// Severity scoring for challenges
function calculateSeverityScore(challenge: Challenge): number {
  const keywords = ['critical', 'severe', 'major', 'fatal', 'incorrect', 'flawed', 'broken'];
  let score = challenge.evidence.length * 2; // More evidence = higher severity

  keywords.forEach(keyword => {
    if (challenge.challenge.toLowerCase().includes(keyword)) {
      score += 5;
    }
  });

  return score;
}

// Substantiveness scoring for rebuttals
function calculateSubstantivenessScore(rebuttal: Rebuttal): number {
  const keywords = ['because', 'evidence', 'data', 'research', 'proven', 'demonstrates'];
  let score = rebuttal.rebuttal.length / 10; // Longer = more substantive

  keywords.forEach(keyword => {
    if (rebuttal.rebuttal.toLowerCase().includes(keyword)) {
      score += 3;
    }
  });

  return score;
}
```

**Token Savings Calculation:**
```typescript
// In CostEstimator.ts
class CostEstimator {
  estimateTokenSavings(
    unfilteredArtifacts: any[],
    filteredArtifacts: any[]
  ): number {
    const unfilteredTokens = this.estimateTokens(JSON.stringify(unfilteredArtifacts));
    const filteredTokens = this.estimateTokens(JSON.stringify(filteredArtifacts));
    return unfilteredTokens - filteredTokens;
  }

  calculateEfficiencyPercentage(saved: number, total: number): number {
    return (saved / total) * 100;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }
}
```

**Integration in ConsultOrchestrator:**
```typescript
// In ConsultOrchestrator.ts
import { ArtifactFilter } from '../consult/artifacts/ArtifactFilter';
import { FilterConfig } from '../consult/artifacts/FilterConfig';

export class ConsultOrchestrator {
  private artifactFilter: ArtifactFilter;
  private filterConfig: FilterConfig;
  private verboseMode: boolean;

  constructor(options: ConsultOptions) {
    // ... existing initialization
    this.artifactFilter = new ArtifactFilter();
    this.filterConfig = new FilterConfig();
    this.verboseMode = options.verbose || false;

    if (this.verboseMode) {
      console.log(chalk.cyan('🔍 Verbose mode: using full debate artifacts (higher token cost)'));
    }
  }

  async executeRound3(round1Artifacts, round2Artifact): Promise<any> {
    // Filter Round 2 artifact for Round 3 agents (unless verbose mode)
    let filteredRound2 = round2Artifact;

    if (!this.verboseMode) {
      const limits = this.filterConfig.getRound3Limits();
      filteredRound2 = this.artifactFilter.filterSynthesisArtifact(
        round2Artifact,
        limits
      );

      // Track token savings
      this.tokenSavings.round3 = this.costEstimator.estimateTokenSavings(
        [round2Artifact],
        [filteredRound2]
      );
    }

    // Execute Round 3 with filtered (or full) artifacts
    // Each agent gets their own Round 1 artifact + filtered Round 2
    // ...
  }

  async executeRound4(round1Artifacts, round2Artifact, round3Artifact): Promise<any> {
    // Filter Round 2 & 3 artifacts for Judge (unless verbose mode)
    let filteredRound2 = round2Artifact;
    let filteredRound3 = round3Artifact;

    if (!this.verboseMode) {
      const limits = this.filterConfig.getRound4Limits();

      filteredRound2 = this.artifactFilter.filterSynthesisArtifact(
        round2Artifact,
        { consensusPoints: limits.consensusPoints, tensions: limits.tensions }
      );

      filteredRound3 = this.artifactFilter.filterCrossExamArtifact(
        round3Artifact,
        { challenges: limits.challenges, rebuttals: limits.rebuttals }
      );

      // Track token savings
      this.tokenSavings.round4 = this.costEstimator.estimateTokenSavings(
        [round2Artifact, round3Artifact],
        [filteredRound2, filteredRound3]
      );
    }

    // Execute Round 4 with filtered (or full) artifacts
    // Judge gets: all Round 1 + filtered Round 2 + filtered Round 3
    // ...
  }

  private buildTokenEfficiencyStats(): TokenEfficiencyStats {
    const totalSaved = this.tokenSavings.round3 + this.tokenSavings.round4;
    const totalUsed = this.totalTokens; // From cost tracking

    return {
      tokens_used: totalUsed,
      tokens_saved_via_filtering: totalSaved,
      efficiency_percentage: this.costEstimator.calculateEfficiencyPercentage(
        totalSaved,
        totalUsed + totalSaved
      ),
      filtering_method: 'structured_artifact_array_truncation',
      filtered_rounds: [3, 4]
    };
  }
}
```

### Library & Framework Requirements

**No New Dependencies:**
- All functionality can be implemented with existing TypeScript and Node.js built-ins
- Reuse existing schema validation classes (SynthesisSchema, CrossExamSchema)
- Reuse existing CostEstimator for token counting

**TypeScript Features:**
- Array methods: `sort()`, `slice()`, `map()`, `filter()`
- Spread operator for immutable array copying: `[...array]`
- Type guards for schema validation
- Interface definitions for type safety

**JSON Operations:**
- `JSON.stringify()` for token estimation
- Deep cloning via spread operators (artifacts are relatively small)
- Schema validation ensures structure integrity

### File Structure Requirements

**ArtifactFilter.ts Structure:**
```typescript
import { SynthesisArtifact, CrossExamArtifact, Challenge, Rebuttal } from '../../types/consult';
import { SynthesisSchema } from './schemas/SynthesisSchema';
import { CrossExamSchema } from './schemas/CrossExamSchema';

export interface FilterLimits {
  consensusPoints?: number;
  tensions?: number;
  challenges?: number;
  rebuttals?: number;
}

export class ArtifactFilter {
  /**
   * Filter SynthesisArtifact to top-N items
   * @param artifact Original synthesis artifact
   * @param limits Filtering limits for consensus and tensions
   * @returns Filtered artifact that passes schema validation
   */
  filterSynthesisArtifact(
    artifact: SynthesisArtifact,
    limits: { consensusPoints: number; tensions: number }
  ): SynthesisArtifact {
    // Sort and truncate consensus points
    const sortedConsensus = [...artifact.consensusPoints]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limits.consensusPoints);

    // Sort and truncate tensions
    const sortedTensions = [...artifact.tensions]
      .sort((a, b) => b.viewpoints.length - a.viewpoints.length)
      .slice(0, limits.tensions);

    // Create filtered artifact
    const filtered: SynthesisArtifact = {
      artifactType: artifact.artifactType,
      schemaVersion: artifact.schemaVersion,
      roundNumber: artifact.roundNumber,
      consensusPoints: sortedConsensus,
      tensions: sortedTensions,
      priorityOrder: artifact.priorityOrder, // Keep all
      createdAt: artifact.createdAt
    };

    // Validate filtered artifact
    SynthesisSchema.validate(filtered);

    return filtered;
  }

  /**
   * Filter CrossExamArtifact to top-N items
   * @param artifact Original cross-exam artifact
   * @param limits Filtering limits for challenges and rebuttals
   * @returns Filtered artifact that passes schema validation
   */
  filterCrossExamArtifact(
    artifact: CrossExamArtifact,
    limits: { challenges: number; rebuttals: number }
  ): CrossExamArtifact {
    // Sort and truncate challenges by severity
    const sortedChallenges = [...artifact.challenges]
      .sort((a, b) => this.calculateSeverityScore(b) - this.calculateSeverityScore(a))
      .slice(0, limits.challenges);

    // Sort and truncate rebuttals by substantiveness
    const sortedRebuttals = [...artifact.rebuttals]
      .sort((a, b) => this.calculateSubstantivenessScore(b) - this.calculateSubstantivenessScore(a))
      .slice(0, limits.rebuttals);

    // Create filtered artifact
    const filtered: CrossExamArtifact = {
      artifactType: artifact.artifactType,
      schemaVersion: artifact.schemaVersion,
      roundNumber: artifact.roundNumber,
      challenges: sortedChallenges,
      rebuttals: sortedRebuttals,
      unresolved: artifact.unresolved, // Keep all - critical
      createdAt: artifact.createdAt
    };

    // Validate filtered artifact
    CrossExamSchema.validate(filtered);

    return filtered;
  }

  /**
   * Calculate severity score for a challenge
   * Higher score = more severe/important
   */
  private calculateSeverityScore(challenge: Challenge): number {
    const severityKeywords = [
      'critical', 'severe', 'major', 'fatal', 'incorrect',
      'flawed', 'broken', 'wrong', 'dangerous', 'serious'
    ];

    let score = challenge.evidence.length * 2; // Evidence weight

    severityKeywords.forEach(keyword => {
      if (challenge.challenge.toLowerCase().includes(keyword)) {
        score += 5;
      }
    });

    // Add length factor (longer challenges often more detailed)
    score += challenge.challenge.length / 100;

    return score;
  }

  /**
   * Calculate substantiveness score for a rebuttal
   * Higher score = more substantive/evidence-based
   */
  private calculateSubstantivenessScore(rebuttal: Rebuttal): number {
    const substantiveKeywords = [
      'because', 'evidence', 'data', 'research', 'proven',
      'demonstrates', 'shows', 'indicates', 'suggests', 'confirms'
    ];

    let score = rebuttal.rebuttal.length / 10; // Length weight

    substantiveKeywords.forEach(keyword => {
      if (rebuttal.rebuttal.toLowerCase().includes(keyword)) {
        score += 3;
      }
    });

    return score;
  }
}
```

**FilterConfig.ts Structure:**
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Round3FilterLimits {
  consensus_points: number;
  tensions: number;
}

export interface Round4FilterLimits {
  consensus_points: number;
  tensions: number;
  challenges: number;
  rebuttals: number;
}

export interface FilterConfiguration {
  round3: Round3FilterLimits;
  round4: Round4FilterLimits;
}

export class FilterConfig {
  private static readonly DEFAULT_CONFIG: FilterConfiguration = {
    round3: {
      consensus_points: 3,
      tensions: 2
    },
    round4: {
      consensus_points: 3,
      tensions: 2,
      challenges: 5,
      rebuttals: 5
    }
  };

  private config: FilterConfiguration;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Get Round 3 filtering limits
   */
  getRound3Limits(): Round3FilterLimits {
    return this.config.round3;
  }

  /**
   * Get Round 4 filtering limits
   */
  getRound4Limits(): Round4FilterLimits {
    return this.config.round4;
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): FilterConfiguration {
    try {
      const configPath = path.join(os.homedir(), '.llm-conclave', 'config.json');

      if (fs.existsSync(configPath)) {
        const configFile = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        if (configFile.filtering) {
          return {
            round3: { ...FilterConfig.DEFAULT_CONFIG.round3, ...configFile.filtering.round3 },
            round4: { ...FilterConfig.DEFAULT_CONFIG.round4, ...configFile.filtering.round4 }
          };
        }
      }
    } catch (error) {
      console.warn('Failed to load filter config, using defaults:', error);
    }

    return FilterConfig.DEFAULT_CONFIG;
  }
}
```

### Testing Requirements

**Unit Tests: ArtifactFilter.test.ts**
- Test `filterSynthesisArtifact()` returns top-N consensus points by confidence
- Test `filterSynthesisArtifact()` returns top-N tensions by viewpoint count
- Test filtered Synthesis artifact passes `SynthesisSchema.validate()`
- Test `filterCrossExamArtifact()` returns top-N challenges by severity
- Test `filterCrossExamArtifact()` returns top-N rebuttals by substantiveness
- Test filtered CrossExam artifact passes `CrossExamSchema.validate()`
- Test severity scoring algorithm (keywords + evidence count)
- Test substantiveness scoring algorithm (keywords + length)
- Test array truncation preserves original item structure
- Test priorityOrder and unresolved arrays not truncated

**Integration Tests: ConsultOrchestratorFiltering.test.ts**
- Test Round 3 agents receive filtered Round 2 artifacts
- Test Round 4 Judge receives filtered Round 2 & 3 artifacts
- Test Round 1 artifacts always passed unfiltered
- Test verbose mode bypasses all filtering
- Test token savings calculation accuracy
- Test token_efficiency_stats added to consultation result
- Test config overrides default filter limits
- Test filtering reduces token count by 20-40%

**Test Coverage Target:** >90% for ArtifactFilter, >85% for integration

### Previous Story Intelligence

**Story 2.5 (Session Persistence) - Token Efficiency Context:**
- Partial results save partial token counts
- Filtering reduces partial session costs too
- Token efficiency stats should be included in partial saves
- This helps users understand cost savings even for incomplete consultations

**Story 1.8 (Consultation Logging) - Logging Integration:**
- ConsultationFileLogger already writes complete consultation results
- Add `token_efficiency_stats` field to logged result
- Maintain JSONL format compatibility
- Token savings visible in historical analysis

**Story 1.2 (Round 1 Independent) - No Filtering Needed:**
- Round 1 artifacts always passed complete (no filtering)
- Agents need full independent context
- Only Rounds 3 & 4 apply filtering

**Key Patterns from Previous Stories:**
- Schema validation is CRITICAL (all existing schemas must pass)
- Event emission via EventBus with snake_case payloads
- Chalk styling: cyan for info, yellow for warnings
- Configuration loading from `~/.llm-conclave/config.json`
- Cost tracking integrated with CostEstimator

### Git Intelligence Summary

**Recent Commits (Reviewed):**
- Story 2.3: Hedged requests with provider substitution
- Story 2.2: Provider health monitoring
- Story 2.1: Cost gate with user consent

**Code Patterns Established:**
- Health/cost components in `src/consult/health/` and `src/consult/cost/`
- Artifact components in `src/consult/artifacts/`
- Schema validation classes with static methods
- Integration with ConsultOrchestrator via constructor injection
- Unit tests colocated in `__tests__/` subdirectories

**What NOT to Change:**
- Existing schema validation interfaces (maintain compatibility)
- Schema field names and types (must match SynthesisSchema, CrossExamSchema)
- Round numbering (Round 2 = Synthesis, Round 3 = CrossExam, Round 4 = Verdict)
- JSON serialization patterns (snake_case for external, camelCase internal)

### Latest Technical Specifics

**TypeScript Array Methods:**
```typescript
// Immutable sorting with spread operator
const sorted = [...array].sort((a, b) => b.score - a.score);

// Slice for truncation
const topN = sorted.slice(0, limit);

// Combined sort + slice
const filtered = [...array]
  .sort((a, b) => scoreFunc(b) - scoreFunc(a))
  .slice(0, limit);
```

**Token Estimation:**
- Industry standard: ~4 characters per token for English
- Formula: `Math.ceil(text.length / 4)`
- JSON serialization adds overhead (~10-15% for pretty-print)
- Use `JSON.stringify()` without spacing for accurate token count

**Confidence Scoring Best Practices:**
- Confidence is 0.0-1.0 float (from SynthesisSchema)
- Higher confidence = more agreement = more important
- Sort descending: `sort((a, b) => b.confidence - a.confidence)`

**Viewpoint Count as Disagreement Proxy:**
- More viewpoints = more disagreement = more important to surface
- Sort descending: `sort((a, b) => b.viewpoints.length - a.viewpoints.length)`

**Keyword Scoring:**
- Simple substring matching: `text.toLowerCase().includes(keyword)`
- Weight keywords appropriately (severity vs substantiveness)
- Combine with other signals (length, evidence count) for robustness

### Project Context Reference

**From Project Structure:**
- `src/consult/artifacts/` directory: Artifact-related components
- Create ArtifactFilter.ts in this directory (consistent placement)
- `src/consult/artifacts/schemas/` directory: Schema validation classes
- `src/orchestration/ConsultOrchestrator.ts`: Main orchestration logic

**Integration Points:**
- `SynthesisSchema.validate()` for filtered Synthesis artifacts
- `CrossExamSchema.validate()` for filtered CrossExam artifacts
- `CostEstimator` for token counting and savings calculation
- `FilterConfig` loads from `~/.llm-conclave/config.json`

**Naming Conventions (from architecture):**
- Files: PascalCase (ArtifactFilter.ts, FilterConfig.ts)
- Classes: PascalCase (ArtifactFilter, FilterConfig)
- Methods: camelCase (filterSynthesisArtifact, getRound3Limits)
- JSON fields: snake_case (consensus_points, token_efficiency_stats)
- Config keys: snake_case (consensus_points, tensions)

### Critical Implementation Notes

**🚨 CRITICAL: Schema Validation After Filtering**
Filtered artifacts MUST pass schema validation:
```typescript
const filtered = this.filterSynthesisArtifact(artifact, limits);

// This MUST NOT throw an error
SynthesisSchema.validate(filtered);
```

**🚨 CRITICAL: Immutable Array Operations**
Never mutate original artifacts:
```typescript
// CORRECT: Use spread operator
const sortedConsensus = [...artifact.consensusPoints].sort(...);

// WRONG: Mutates original
artifact.consensusPoints.sort(...); // DON'T DO THIS
```

**🚨 CRITICAL: Preserve All Required Fields**
Filtered artifacts must have ALL schema fields:
- artifactType (unchanged)
- schemaVersion: "1.0" (unchanged)
- roundNumber (unchanged)
- createdAt (unchanged)
- All type-specific arrays (even if empty after filtering edge cases)

**🚨 CRITICAL: Verbose Mode Override**
Verbose mode completely bypasses filtering:
```typescript
if (this.verboseMode) {
  // Use original artifacts directly - NO filtering
  return originalArtifact;
}

// Only filter if NOT verbose mode
const filtered = this.artifactFilter.filterSynthesisArtifact(...);
```

**🚨 CRITICAL: Token Savings Calculation**
Must account for JSON serialization overhead:
```typescript
// Estimate tokens from serialized JSON (what LLM sees)
const unfilteredTokens = this.estimateTokens(JSON.stringify(unfilteredArtifact));
const filteredTokens = this.estimateTokens(JSON.stringify(filteredArtifact));
const savings = unfilteredTokens - filteredTokens;
```

**🚨 CRITICAL: Config Defaults**
Always have sane defaults if config loading fails:
```typescript
try {
  this.config = this.loadConfigFromFile();
} catch (error) {
  console.warn('Using default filter config');
  this.config = FilterConfig.DEFAULT_CONFIG; // Fallback
}
```

### Success Criteria Validation

**From NFR8 (Token-Efficient Debate):**
> "The system must support **Token-Efficient Debate**. In the debate rounds (Phase 2 & 3), agents should receive condensed summaries of peer outputs rather than full verbatim histories unless the user explicitly requests `--verbose`."

✅ Round 3 agents receive filtered Round 2 artifacts
✅ Round 4 Judge receives filtered Round 2 & 3 artifacts
✅ Verbose mode provides full unfiltered artifacts
✅ Token usage reduced by 20-40% in normal mode
✅ Schema validation ensures integrity

**From Architecture (Structured Artifact Extraction):**
> "All artifacts require `schema_version` field. Artifacts must be validated before use."

✅ Filtered artifacts preserve schema_version field
✅ ArtifactFilter validates filtered output before returning
✅ Schema structure remains identical after filtering
✅ Only array lengths reduced (structure preserved)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

**Files to Create:**
- `src/consult/artifacts/ArtifactFilter.ts`
- `src/consult/artifacts/FilterConfig.ts`
- `src/consult/artifacts/__tests__/ArtifactFilter.test.ts`
- `src/orchestration/__tests__/ConsultOrchestratorFiltering.test.ts`

**Files to Modify:**
- `src/orchestration/ConsultOrchestrator.ts` (add filtering integration)
- `src/types/consult.ts` (add TokenEfficiencyStats interface)
- `src/commands/consult.ts` (add --verbose flag)
- `src/consult/cost/CostEstimator.ts` (add token savings methods)

