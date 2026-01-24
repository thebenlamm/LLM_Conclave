# Test Coverage Analysis Report

## Executive Summary

**Current Overall Coverage:**
- Statements: 41.65% (2958/7101)
- Branches: 32.35% (1348/4166)
- Functions: 47.36% (513/1083)
- Lines: 42.04% (2847/6772)

**Test Statistics:**
- Total Test Files: 56
- Passing Tests: 494 (98.4%)
- Failing Tests: 8 (1.6%)
- Total Test Suites: 56 (52 passing, 4 failing)

The current test suite shows reasonable coverage for the consultation subsystem (`src/consult/`) but has significant gaps in core infrastructure, providers, and utility modules.

---

## Critical Coverage Gaps

### 1. **Providers Layer (0% coverage)** - HIGH PRIORITY
**Files with no tests:**
| File | Lines | Priority |
|------|-------|----------|
| `src/providers/ProviderFactory.ts` | 77 | Critical |
| `src/providers/OpenAIProvider.ts` | 165 | Critical |
| `src/providers/ClaudeProvider.ts` | 165 | Critical |
| `src/providers/GeminiProvider.ts` | 269 | Critical |
| `src/providers/GrokProvider.ts` | 155 | High |
| `src/providers/MistralProvider.ts` | 183 | High |
| `src/providers/LLMProvider.ts` | 168 | High |

**Why this matters:** The provider layer is the foundation of all LLM interactions. Bugs here affect every feature.

**Recommended tests:**
- ProviderFactory: Model pattern matching, shorthand expansions (e.g., "sonnet" → full model name)
- Individual providers: API response parsing, error handling, retry logic
- Use mocked API responses to avoid real API calls

---

### 2. **Core Infrastructure (89% untested)** - HIGH PRIORITY
**Files with no tests:**
| File | Lines | Purpose |
|------|-------|---------|
| `src/core/ConversationManager.ts` | 711 | Main conversation orchestration |
| `src/core/SessionManager.ts` | 300 | Session persistence |
| `src/core/ContinuationHandler.ts` | 259 | Resume conversations |
| `src/core/CostTracker.ts` | 108 | Cost accumulation |
| `src/core/ConfigLoader.ts` | 148 | Configuration loading |
| `src/core/EventBus.ts` | 80 | Event pub/sub |
| `src/core/OutputHandler.ts` | 140 | Result formatting |
| `src/core/TemplateManager.ts` | 116 | Template loading |

**Only tested:** `SpeakerSelector.ts` (excellent test coverage)

**Recommended tests:**
- ConversationManager: Multi-turn conversation flows, round limits, consensus detection
- SessionManager: CRUD operations, session persistence, retrieval
- CostTracker: Token accumulation, cost calculation accuracy
- EventBus: Event emission and subscription

---

### 3. **MCP Server (0% coverage)** - HIGH PRIORITY
**File:** `src/mcp/server.ts` (787 lines)

**Why this matters:** The MCP server is a primary integration point for external tools (Claude Desktop, Cursor, VS Code). It must be reliable.

**Recommended tests:**
- Tool registration and invocation
- Error handling for malformed requests
- Session management
- Output formatting

---

### 4. **Tools Module (0% coverage)** - HIGH PRIORITY
**File:** `src/tools/ToolRegistry.ts` (483 lines)

**Why this matters:** Contains security-critical features (path sandboxing, command blacklisting).

**Recommended tests:**
- Path sandboxing: Verify paths outside baseDir are rejected
- Command blacklist: Verify dangerous commands are blocked
- File operations: read_file, write_file, edit_file
- Error handling for invalid inputs

---

### 5. **CLI Layer (0% coverage)** - MEDIUM PRIORITY
| File | Lines |
|------|-------|
| `src/cli/PersonaSystem.ts` | 585 |
| `src/cli/ConfigCascade.ts` | 274 |
| `src/cli/ModeDetector.ts` | 271 |
| `src/cli/ConsultConsoleLogger.ts` | 92 |

**Recommended tests:**
- PersonaSystem: Persona loading, combination, template expansion
- ConfigCascade: Config resolution order, environment overrides
- ModeDetector: Mode selection based on task characteristics

---

### 6. **Init Module (0% coverage)** - MEDIUM PRIORITY
| File | Lines |
|------|-------|
| `src/init/ProjectScanner.ts` | 426 |
| `src/init/InteractiveInit.ts` | 320 |
| `src/init/AgentGenerator.ts` | 305 |
| `src/init/ConfigWriter.ts` | 158 |
| `src/init/PromptBuilder.ts` | 156 |
| `src/init/APIKeyDetector.ts` | 96 |

**Why this matters:** First-run experience affects user adoption.

---

### 7. **Orchestration Layer (partial coverage)** - MEDIUM PRIORITY
**Tested:**
- ConsultOrchestrator (good coverage with multiple test files)
- ConsultStateMachine

**Untested:**
| File | Lines |
|------|-------|
| `src/orchestration/IterativeCollaborativeOrchestrator.ts` | 1005 |
| `src/orchestration/Orchestrator.ts` | 687 |
| `src/orchestration/AgentRoles.ts` | 229 |
| `src/orchestration/TaskClassifier.ts` | 170 |
| `src/orchestration/chatOptionsHelper.ts` | 44 |

---

### 8. **Memory & Interactive (0% coverage)** - LOW PRIORITY
| File | Lines |
|------|-------|
| `src/memory/MemoryManager.ts` | 289 |
| `src/memory/ProjectMemory.ts` | 266 |
| `src/interactive/InteractiveSession.ts` | 256 |
| `src/interactive/StatusDisplay.ts` | 128 |

---

### 9. **Utilities (0% coverage)** - LOW PRIORITY
| File | Lines |
|------|-------|
| `src/utils/ProjectContext.ts` | 370 |
| `src/utils/TokenCounter.ts` | 185 |
| `src/utils/ConsultLogger.ts` | 115 |
| `src/utils/ConfigPaths.ts` | 22 |

---

## Test Quality Issues

### Issue 1: Tests require API keys
4 test files fail because they don't properly mock API providers:
- `TemplateExecutor.test.ts`
- `ConsultOrchestratorPersistence.test.ts`
- `ConsultOrchestrator_EarlyTermination.test.ts`
- `ConsultationFileLogger.test.ts`

**Fix:** Ensure ProviderFactory is fully mocked before ConsultOrchestrator instantiation.

### Issue 2: EventEmitter memory leak warning
```
MaxListenersExceededWarning: 11 error listeners added to [EventBus]. MaxListeners is 10.
```
Tests should clean up EventBus listeners in `afterEach` hooks.

### Issue 3: Limited edge case coverage
Most existing tests cover happy paths. Recommended additions:
- Network timeouts and retries
- Malformed LLM responses
- Rate limiting scenarios
- Partial failures in multi-agent calls

### Issue 4: No integration tests
All tests are unit tests with heavy mocking. Consider adding:
- End-to-end consultation flow tests (with mock LLM responses)
- CLI command integration tests
- MCP server protocol compliance tests

---

## Recommended Test Priorities

### Phase 1: Critical Infrastructure (Weeks 1-2)
1. **ProviderFactory.test.ts** - Test model detection and shorthand expansion
2. **ToolRegistry.test.ts** - Test security features (sandboxing, command blocking)
3. **MCP server tests** - Tool registration and invocation
4. Fix existing failing tests (mock providers properly)

### Phase 2: Core Components (Weeks 3-4)
1. **ConversationManager.test.ts** - Multi-turn flows, consensus detection
2. **SessionManager.test.ts** - CRUD, persistence
3. **CostTracker.test.ts** - Cost calculation accuracy
4. **EventBus.test.ts** - Event pub/sub patterns

### Phase 3: Orchestration (Weeks 5-6)
1. **IterativeCollaborativeOrchestrator.test.ts**
2. **Orchestrator.test.ts**
3. **TaskClassifier.test.ts**

### Phase 4: CLI & Init (Weeks 7-8)
1. **PersonaSystem.test.ts**
2. **ConfigCascade.test.ts**
3. **ProjectScanner.test.ts**

---

## Suggested Test Patterns

### Mocking Providers
```typescript
// Always mock before importing modules that use ProviderFactory
jest.mock('../../providers/ProviderFactory', () => ({
  createProvider: jest.fn().mockReturnValue({
    chat: jest.fn().mockResolvedValue({ text: '{}', usage: {} })
  })
}));
```

### Testing Security Features
```typescript
describe('ToolRegistry Security', () => {
  it('should reject paths outside baseDir', async () => {
    const registry = new ToolRegistry('/safe/dir');
    await expect(registry.execute('read_file', {
      file_path: '/etc/passwd'
    })).rejects.toThrow(/outside.*sandbox/i);
  });

  it('should block dangerous commands', async () => {
    const registry = new ToolRegistry('/safe/dir', { enableRunCommand: true });
    await expect(registry.execute('run_command', {
      command: 'rm -rf /'
    })).rejects.toThrow(/blocked/i);
  });
});
```

### Testing LLM Response Parsing
```typescript
describe('Provider response parsing', () => {
  it('should handle malformed JSON gracefully', async () => {
    mockProvider.chat.mockResolvedValue({ text: 'not json', usage: {} });
    const result = await orchestrator.consult('test');
    expect(result.errors).toContain(expect.stringMatching(/parse/i));
  });
});
```

---

## Coverage Target Recommendations

| Metric | Current | Target (3 months) | Target (6 months) |
|--------|---------|-------------------|-------------------|
| Statements | 41.65% | 60% | 75% |
| Branches | 32.35% | 50% | 65% |
| Functions | 47.36% | 65% | 80% |
| Lines | 42.04% | 60% | 75% |

---

## Summary

The codebase has solid test coverage in the consultation subsystem but lacks tests for foundational components. The highest-impact improvements would be:

1. **Add provider layer tests** - Critical for reliability
2. **Add ToolRegistry security tests** - Critical for safety
3. **Fix existing failing tests** - Improve CI reliability
4. **Add MCP server tests** - Important for integrations

These improvements would significantly increase confidence in deployments and reduce regression risk.
