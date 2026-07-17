// Regression lock: each long-running MCP tool handler (consult / discuss /
// continue) must emit a real `notifications/progress` when the client supplies
// an `_meta.progressToken`, and must emit NOTHING on the progress channel when
// no token is supplied.
//
// Why this matters: Claude Code's MCP client resets its per-tool idle-timeout
// (5 min over SSE) on `notifications/progress` — NOT on logging messages. Before
// this fix every keepalive went out via sendLoggingMessage only, so a long
// silent multi-round run was aborted mid-discussion ("no response or progress
// for 300s"). These tests fail if a future refactor drops the progress channel.

const mockSetRequestHandler = jest.fn();
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
  connect: jest.fn(),
  sendLoggingMessage: jest.fn().mockResolvedValue(undefined),
  // The MCP notification channel the idle-timeout fix depends on.
  notification: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => mockServer),
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));
jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: jest.fn(),
}));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
}));

jest.mock('express', () => {
  const mockApp = { get: jest.fn(), post: jest.fn(), use: jest.fn() };
  return jest.fn(() => mockApp);
});

// DiscussionRunner drives discuss/continue. We fully control run() so its
// onProgress callback fires deterministically (the real thing fires it from a
// 30s heartbeat we don't want to wait on).
const mockRunnerRun = jest.fn();
jest.mock('../DiscussionRunner.js', () => ({
  DiscussionRunner: jest.fn(() => ({ run: mockRunnerRun })),
}));

// ConsultOrchestrator drives consult. consult() returns a controllable promise
// so the 30s heartbeat interval can fire under fake timers before it resolves.
const mockConsult = jest.fn();
jest.mock('../../orchestration/ConsultOrchestrator.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({ consult: mockConsult })),
}));

jest.mock('../../core/ConversationManager.js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../core/EventBus.js', () => ({
  EventBus: { createInstance: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })) },
}));

const mockLoadSession = jest.fn();
const mockGetMostRecentSession = jest.fn();
jest.mock('../../core/SessionManager.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    listSessions: jest.fn().mockResolvedValue([]),
    loadSession: mockLoadSession,
    getMostRecentSession: mockGetMostRecentSession,
  })),
  computeSessionStatus: jest.requireActual('../../core/SessionManager').computeSessionStatus,
  computeSubstitutionRate: jest.requireActual('../../core/SessionManager').computeSubstitutionRate,
}));

jest.mock('../../core/ContinuationHandler.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    validateResumable: jest.fn().mockReturnValue({ isValid: true, warnings: [] }),
    prepareForContinuation: jest.fn().mockReturnValue({ mergedHistory: [], newTask: 'test' }),
  })),
}));

jest.mock('../../providers/ProviderFactory.js', () => ({
  __esModule: true,
  default: { createProvider: jest.fn(() => ({})), resolveModelName: (m: string) => m },
}));

jest.mock('../../providers/PreflightChecker.js', () => ({
  PreflightChecker: { check: jest.fn().mockResolvedValue(undefined) },
  PreflightError: class PreflightError extends Error {
    results: any[];
    constructor(results: any[] = []) {
      super('Pre-flight validation failed');
      this.name = 'PreflightError';
      this.results = results;
    }
  },
}));

jest.mock('../../utils/ProjectContext.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({ load: jest.fn(), formatContext: jest.fn() })),
}));

jest.mock('../../utils/ConsultLogger.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({ log: jest.fn().mockResolvedValue({}) })),
}));

jest.mock('../../config/ConfigCascade.js', () => ({
  ConfigCascade: {
    resolve: jest.fn(() => ({
      agents: { Agent1: { model: 'gpt-4o', prompt: 'test' } },
      judge: { model: 'gpt-4o', prompt: 'judge' },
      max_rounds: 4,
    })),
  },
}));

jest.mock('../../config/PersonaSystem.js', () => ({
  PersonaSystem: { getPersonas: jest.fn(() => []), personasToAgents: jest.fn(() => ({})) },
}));

jest.mock('../../consult/formatting/FormatterFactory.js', () => ({
  FormatterFactory: { format: jest.fn(() => 'formatted output') },
}));

jest.mock('../../consult/context/ContextLoader.js', () => {
  const actual = jest.requireActual('../../consult/context/ContextLoader.js');
  return {
    ContextLoader: jest.fn(() => ({
      loadFileContext: jest.fn().mockResolvedValue({ formattedContent: 'context' }),
      loadProjectContext: jest.fn().mockResolvedValue({ formattedContent: 'context' }),
    })),
    parseExtraContextRoots: actual.parseExtraContextRoots,
    isPathWithinRoots: actual.isPathWithinRoots,
    computeAllowedRoots: actual.computeAllowedRoots,
  };
});

jest.mock('../../constants.js', () => ({ DEFAULT_SELECTOR_MODEL: 'gpt-4o-mini' }));
jest.mock('../../types/consult.js', () => ({}));
jest.mock('../StatusFileManager.js', () => ({
  StatusFileManager: jest.fn(() => ({
    readStatus: jest.fn().mockReturnValue(null),
    writeStatus: jest.fn(),
    deleteStatus: jest.fn(),
  })),
}));

import { createServer } from '../server';

const PROGRESS = 'notifications/progress';

/** A well-formed session that passes continuation validation. */
function fakeSession() {
  return {
    id: 'sess-1',
    maxRounds: 4,
    minRounds: 2,
    judge: { model: 'gpt-4o', systemPrompt: 'judge' },
    agents: [{ name: 'Agent1', model: 'gpt-4o', systemPrompt: 'a1' }],
  };
}

describe('MCP progress notifications (idle-timeout keepalive)', () => {
  let callToolHandler: Function;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer.notification.mockResolvedValue(undefined);
    mockServer.sendLoggingMessage.mockResolvedValue(undefined);
    createServer();
    callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === 'CallToolRequestSchema'
    )?.[1];
  });

  function progressCalls() {
    return mockServer.notification.mock.calls.filter(
      (c: any) => c[0]?.method === PROGRESS
    );
  }

  describe('discuss', () => {
    it('emits notifications/progress carrying the client token when a progressToken is supplied', async () => {
      // run() fires one progress event then throws — the notification must have
      // already gone out on the progress channel before the handler bails.
      mockRunnerRun.mockImplementation(async ({ onProgress }: any) => {
        onProgress({ type: 'heartbeat', message: 'round 1/4' });
        throw new Error('stop-after-progress');
      });

      await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test', rounds: 4 },
          _meta: { progressToken: 'tok-discuss' },
        },
      });

      const calls = progressCalls();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toEqual(
        expect.objectContaining({
          method: PROGRESS,
          params: expect.objectContaining({ progressToken: 'tok-discuss' }),
        })
      );
    });

    it('emits NOTHING on the progress channel when no progressToken is supplied', async () => {
      mockRunnerRun.mockImplementation(async ({ onProgress }: any) => {
        onProgress({ type: 'heartbeat', message: 'round 1/4' });
        throw new Error('stop-after-progress');
      });

      await callToolHandler({
        params: { name: 'llm_conclave_discuss', arguments: { task: 'test', rounds: 4 } },
      });

      expect(progressCalls()).toHaveLength(0);
      // Logging keepalive still fires — it just doesn't reset the idle timer.
      expect(mockServer.sendLoggingMessage).toHaveBeenCalled();
    });
  });

  describe('continue', () => {
    it('emits notifications/progress carrying the client token when a progressToken is supplied', async () => {
      mockLoadSession.mockResolvedValue(fakeSession());
      mockRunnerRun.mockImplementation(async ({ onProgress }: any) => {
        onProgress({ type: 'heartbeat', message: 'round 1/4' });
        throw new Error('stop-after-progress');
      });

      await callToolHandler({
        params: {
          name: 'llm_conclave_continue',
          arguments: { session_id: 'sess-1', task: 'follow up' },
          _meta: { progressToken: 42 },
        },
      });

      const calls = progressCalls();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toEqual(
        expect.objectContaining({
          method: PROGRESS,
          params: expect.objectContaining({ progressToken: 42 }),
        })
      );
    });

    it('emits NOTHING on the progress channel when no progressToken is supplied', async () => {
      mockLoadSession.mockResolvedValue(fakeSession());
      mockRunnerRun.mockImplementation(async ({ onProgress }: any) => {
        onProgress({ type: 'heartbeat', message: 'round 1/4' });
        throw new Error('stop-after-progress');
      });

      await callToolHandler({
        params: {
          name: 'llm_conclave_continue',
          arguments: { session_id: 'sess-1', task: 'follow up' },
        },
      });

      expect(progressCalls()).toHaveLength(0);
    });
  });

  describe('consult', () => {
    // The consult heartbeat is a 30s setInterval, so drive it with fake timers.
    it('emits notifications/progress from the heartbeat when a progressToken is supplied', async () => {
      jest.useFakeTimers();
      try {
        let resolveConsult: (v: any) => void = () => {};
        mockConsult.mockReturnValue(new Promise((r) => { resolveConsult = r; }));

        const p = callToolHandler({
          params: {
            name: 'llm_conclave_consult',
            arguments: { question: 'q' },
            _meta: { progressToken: 'tok-consult' },
          },
        });

        // Let PreflightChecker/orchestrator setup microtasks settle, then fire
        // one 30s heartbeat tick.
        await jest.advanceTimersByTimeAsync(31_000);

        const calls = progressCalls();
        expect(calls.length).toBeGreaterThanOrEqual(1);
        expect(calls[0][0]).toEqual(
          expect.objectContaining({
            method: PROGRESS,
            params: expect.objectContaining({ progressToken: 'tok-consult' }),
          })
        );

        resolveConsult({ agents: {} });
        await jest.advanceTimersByTimeAsync(0);
        await p;
      } finally {
        jest.useRealTimers();
      }
    });

    it('emits NOTHING on the progress channel when no progressToken is supplied', async () => {
      jest.useFakeTimers();
      try {
        let resolveConsult: (v: any) => void = () => {};
        mockConsult.mockReturnValue(new Promise((r) => { resolveConsult = r; }));

        const p = callToolHandler({
          params: { name: 'llm_conclave_consult', arguments: { question: 'q' } },
        });

        await jest.advanceTimersByTimeAsync(31_000);

        expect(progressCalls()).toHaveLength(0);
        // Heartbeat still emits a human-visible logging keepalive.
        expect(mockServer.sendLoggingMessage).toHaveBeenCalled();

        resolveConsult({ agents: {} });
        await jest.advanceTimersByTimeAsync(0);
        await p;
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
