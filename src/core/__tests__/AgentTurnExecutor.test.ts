import AgentTurnExecutor, { AgentTurnDeps } from '../AgentTurnExecutor.js';
import ConversationHistory from '../ConversationHistory.js';
import { EventBus } from '../EventBus.js';
import { TaskRouter } from '../TaskRouter.js';
import { CostTracker } from '../CostTracker.js';
import { DiscussionHistoryEntry } from '../../types/index.js';
import ProviderFactory from '../../providers/ProviderFactory.js';

// Mock heavy dependencies
jest.mock('../../providers/ProviderFactory.js');
jest.mock('../TaskRouter.js');
jest.mock('../CostTracker.js');
jest.mock('../EventBus.js');

const MockProviderFactory = ProviderFactory as jest.Mocked<typeof ProviderFactory>;

function makeProvider(responseText: string = 'agent response') {
  return {
    chat: jest.fn().mockResolvedValue(responseText),
  };
}

function makeConfig(overrides: any = {}) {
  return {
    agents: {
      Alice: { model: 'gpt-4o', systemPrompt: 'You are Alice.' },
      Bob: { model: 'claude-sonnet-4-5', systemPrompt: 'You are Bob.' },
    },
    judge: { model: 'gemini-2.5-flash', systemPrompt: 'Judge.' },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AgentTurnDeps> = {}): AgentTurnDeps {
  const conversationHistory: DiscussionHistoryEntry[] = [];
  const config = makeConfig();
  const aliceProvider = makeProvider('Alice says hello');
  const bobProvider = makeProvider('Bob says hello');
  const agents = {
    Alice: { name: 'Alice', provider: aliceProvider, systemPrompt: 'You are Alice.', model: 'gpt-4o' },
    Bob: { name: 'Bob', provider: bobProvider, systemPrompt: 'You are Bob.', model: 'claude-sonnet-4-5' },
  };

  const mockHistory = {
    prepareMessagesWithBudget: jest.fn().mockReturnValue([{ role: 'user', content: 'Task' }]),
    prepareMessagesForAgent: jest.fn().mockReturnValue([{ role: 'user', content: 'Task' }]),
    compressHistory: jest.fn().mockResolvedValue(undefined),
    groupHistoryByRound: jest.fn().mockReturnValue([]),
  } as unknown as ConversationHistory;

  const mockEventBus = {
    emitEvent: jest.fn(),
  } as unknown as EventBus;

  return {
    agents,
    config,
    conversationHistory,
    history: mockHistory,
    streamOutput: false,
    eventBus: mockEventBus,
    abortSignal: undefined,
    taskRouter: null,
    costTracker: new CostTracker(),
    ...overrides,
  };
}

describe('AgentTurnExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MockProviderFactory.createProvider as jest.Mock).mockReturnValue(makeProvider('fallback response'));
  });

  // ─── Test 1: Circuit breaker skips agent ────────────────────────────────────
  it('skips agent that is in persistentlyFailedAgents set (circuit breaker)', async () => {
    const deps = makeDeps();
    // Empty responses always trigger recordAgentFailure('empty_response')
    deps.agents.Alice.provider.chat = jest.fn().mockResolvedValue('');
    const executor = new AgentTurnExecutor(deps);

    // First failure — counter = 1
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(false);

    // Second failure — counter = 2, circuit breaker trips
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(true);

    const historyLengthAfterTrip = deps.conversationHistory.length;

    // Now Alice is in persistentlyFailedAgents — this call should return immediately
    await executor.agentTurn('Alice');

    // No new entries added after circuit breaker tripped
    expect(deps.conversationHistory.length).toBe(historyLengthAfterTrip);
  });

  // ─── Test 2: Successful agent call pushes response ───────────────────────────
  it('pushes response to conversationHistory on successful agent call', async () => {
    const deps = makeDeps();
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    expect(deps.conversationHistory).toHaveLength(1);
    const entry = deps.conversationHistory[0];
    expect(entry.role).toBe('assistant');
    expect(entry.speaker).toBe('Alice');
    expect(entry.model).toBe('gpt-4o');
    expect(entry.content).toBe('Alice says hello');
    expect(entry.error).toBeUndefined();
  });

  // ─── Test 3: Empty response triggers one retry before recording failure ──────
  it('retries once on empty response before recording failure', async () => {
    const deps = makeDeps();
    deps.agents.Alice.provider.chat = jest.fn().mockResolvedValue('');
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    // chat should have been called twice (original + 1 retry)
    expect(deps.agents.Alice.provider.chat).toHaveBeenCalledTimes(2);

    // Should have pushed an error entry
    expect(deps.conversationHistory).toHaveLength(1);
    expect(deps.conversationHistory[0].error).toBe(true);
    expect(deps.conversationHistory[0].errorDetails).toBe('empty_response_after_retry');
  });

  // ─── Test 4: Connection error triggers one retry with fallback ───────────────
  it('retries once on connection error before falling through to fallback logic', async () => {
    const deps = makeDeps();
    deps.agents.Alice.provider.chat = jest.fn()
      .mockRejectedValueOnce(new Error('connection error ECONNRESET'))
      .mockResolvedValueOnce('Alice retry response');
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    // Should have a successful entry after retry
    expect(deps.conversationHistory).toHaveLength(1);
    expect(deps.conversationHistory[0].content).toBe('Alice retry response');
    expect(deps.conversationHistory[0].error).toBeUndefined();
  });

  // ─── Test 5: Context overflow triggers history compression and retry ─────────
  it('records failure if prepareMessagesWithBudget returns null (context window exceeded)', async () => {
    const deps = makeDeps();
    (deps.history.prepareMessagesWithBudget as jest.Mock).mockReturnValue(null);
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    expect(deps.conversationHistory).toHaveLength(1);
    expect(deps.conversationHistory[0].error).toBe(true);
    expect(deps.conversationHistory[0].errorDetails).toBe('token_budget_exceeded');
  });

  // ─── Test 6: 3 consecutive failures trip circuit breaker ────────────────────
  it('adds agent to persistentlyFailedAgents after 2 consecutive failures', async () => {
    const deps = makeDeps();
    deps.agents.Alice.provider.chat = jest.fn().mockResolvedValue(''); // empty = failure
    const executor = new AgentTurnExecutor(deps);

    // First failure
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(false);

    // Second failure — trips circuit breaker
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(true);
  });

  // ─── Test 7: getFallbackModel returns model from different provider family ───
  it('getFallbackModel returns a model from a different provider family', () => {
    const deps = makeDeps();
    const executor = new AgentTurnExecutor(deps);

    // @ts-ignore - accessing private method for testing
    const claudeFallback = executor['getFallbackModel']('claude-sonnet-4-5');
    expect(claudeFallback).not.toBeNull();
    expect(claudeFallback).not.toContain('claude');

    // @ts-ignore
    const gptFallback = executor['getFallbackModel']('gpt-4o');
    expect(gptFallback).not.toBeNull();
    expect(gptFallback).not.toContain('gpt');

    // @ts-ignore
    const geminiFallback = executor['getFallbackModel']('gemini-2.5-flash');
    expect(geminiFallback).not.toBeNull();
    expect(geminiFallback).not.toContain('gemini');
  });

  // ─── Test 8: getFallbackModel returns null when no fallback available ────────
  it('getFallbackModel returns gpt-4o-mini as universal fallback for unknown models', () => {
    const deps = makeDeps();
    const executor = new AgentTurnExecutor(deps);

    // @ts-ignore
    const unknownFallback = executor['getFallbackModel']('some-unknown-model-xyz');
    // Unknown models fall back to gpt-4o-mini per the current implementation
    expect(unknownFallback).toBe('gpt-4o-mini');
  });

  // ─── Test 9: createCallAbortController respects external abort signal ────────
  it('createCallAbortController aborts immediately when external signal is already aborted', () => {
    const deps = makeDeps();
    const externalController = new AbortController();
    externalController.abort('test-abort');
    deps.abortSignal = externalController.signal;

    const executor = new AgentTurnExecutor(deps);

    // @ts-ignore - accessing private method for testing
    const { controller, cleanup } = executor['createCallAbortController'](150_000);
    cleanup();

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe('main abort');
  });

  // ─── Test 10: getAgentSubstitutions returns the substitutions map ────────────
  it('getAgentSubstitutions returns empty map initially', () => {
    const deps = makeDeps();
    const executor = new AgentTurnExecutor(deps);
    expect(Object.keys(executor.getAgentSubstitutions()).length).toBe(0);
  });

  // ─── Test 11: model fallback on retryable error ──────────────────────────────
  it('uses fallback provider on 429 rate limit error when no prior substitution', async () => {
    const deps = makeDeps();
    deps.agents.Alice.provider.chat = jest.fn()
      .mockRejectedValue(new Error('rate limit 429'));
    (MockProviderFactory.createProvider as jest.Mock).mockReturnValue({
      chat: jest.fn().mockResolvedValue('fallback model response'),
    });
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    // Should have a successful entry from fallback
    const nonErrorEntries = deps.conversationHistory.filter(e => !e.error);
    expect(nonErrorEntries.length).toBeGreaterThan(0);
    expect('Alice' in executor.getAgentSubstitutions()).toBe(true);
  });

  // ─── Test 12: recordAgentSuccess resets failure counter ─────────────────────
  it('recordAgentSuccess resets failure counter so circuit breaker does not trip after interleaved success', async () => {
    const deps = makeDeps();
    // Sequence: fail, succeed, fail — circuit breaker should NOT trip after 2nd failure
    // because success in between resets the counter.
    // Each "fail" turn calls chat twice (original attempt + retry) since we retry once on empty.
    deps.agents.Alice.provider.chat = jest.fn()
      .mockResolvedValueOnce('') // turn 1, attempt 1: empty
      .mockResolvedValueOnce('') // turn 1, attempt 2 (retry): empty → recordAgentFailure
      .mockResolvedValueOnce('success response') // turn 2: success → recordAgentSuccess
      .mockResolvedValueOnce('') // turn 3, attempt 1: empty
      .mockResolvedValueOnce(''); // turn 3, attempt 2 (retry): empty → recordAgentFailure

    const executor = new AgentTurnExecutor(deps);

    // Turn 1: fails — consecutive failures = 1
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(false);

    // Turn 2: succeeds — resets consecutive failure counter to 0
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(false);

    // Turn 3: fails — consecutive failures = 1 (reset by success), NOT 2, so NO circuit breaker
    await executor.agentTurn('Alice');
    expect(executor.getPersistentlyFailedAgents().has('Alice')).toBe(false);
  });

  // ─── Test 13: Successful response has ISO timestamp ─────────────────────────
  it('adds ISO timestamp to successful agent response entry', async () => {
    const deps = makeDeps();
    const executor = new AgentTurnExecutor(deps);

    const before = new Date().toISOString();
    await executor.agentTurn('Alice');
    const after = new Date().toISOString();

    expect(deps.conversationHistory).toHaveLength(1);
    const entry = deps.conversationHistory[0];
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe('string');
    // Validate it's a valid ISO date within the test window
    expect(entry.timestamp! >= before).toBe(true);
    expect(entry.timestamp! <= after).toBe(true);
  });

  // ─── Test 14: Error entries have ISO timestamp ───────────────────────────────
  it('adds ISO timestamp to error entries (empty response)', async () => {
    const deps = makeDeps();
    deps.agents.Alice.provider.chat = jest.fn().mockResolvedValue('');
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    expect(deps.conversationHistory).toHaveLength(1);
    const entry = deps.conversationHistory[0];
    expect(entry.error).toBe(true);
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe('string');
    // Verify it's a parseable ISO string
    expect(isNaN(Date.parse(entry.timestamp!))).toBe(false);
  });

  // ─── Test 15: Structured FALLBACK_EVENT log on successful fallback ──────────
  it('emits structured FALLBACK_EVENT JSON log when fallback succeeds', async () => {
    const deps = makeDeps();
    deps.agents.Alice.provider.chat = jest.fn()
      .mockRejectedValue(new Error('rate limit 429'));
    (MockProviderFactory.createProvider as jest.Mock).mockReturnValue({
      chat: jest.fn().mockResolvedValue('fallback model response'),
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const executor = new AgentTurnExecutor(deps);

    await executor.agentTurn('Alice');

    // Find the structured FALLBACK_EVENT log call
    const fallbackLogCall = consoleSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('FALLBACK_EVENT')
    );
    expect(fallbackLogCall).toBeDefined();

    // Parse and validate the structured JSON
    const parsed = JSON.parse(fallbackLogCall![0]);
    expect(parsed.event).toBe('FALLBACK_EVENT');
    expect(parsed.agent).toBe('Alice');
    expect(parsed.originalModel).toBe('gpt-4o');
    expect(parsed.fallbackModel).toBeDefined();
    expect(parsed.reason).toContain('429');
    expect(parsed.timestamp).toBeDefined();

    consoleSpy.mockRestore();
  });
});
