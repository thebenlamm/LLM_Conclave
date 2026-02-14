/**
 * MCP Server Transport Layer Tests (SSE)
 *
 * Tests the SSE transport implementation by intercepting express route handlers.
 * Verifies health endpoint, SSE connection setup, message routing, heartbeat, and shutdown.
 */

// Mock express to capture route handlers
const routeHandlers: Record<string, Function> = {};
const mockApp = {
  get: jest.fn((path: string, handler: Function) => { routeHandlers[`GET:${path}`] = handler; }),
  post: jest.fn((path: string, handler: Function) => { routeHandlers[`POST:${path}`] = handler; }),
  use: jest.fn(),
};

const mockExpress: any = jest.fn(() => mockApp);
mockExpress.json = jest.fn(() => jest.fn()); // express.json() middleware
jest.mock('express', () => mockExpress);

// Mock http.createServer to prevent actually listening
const mockHttpServer = {
  listen: jest.fn((_port: number, cb: Function) => { cb(); }),
  close: jest.fn(),
};
jest.mock('http', () => ({
  createServer: jest.fn(() => mockHttpServer),
}));

// Mock MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    sendLoggingMessage: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: jest.fn() }));

const mockHandlePostMessage = jest.fn().mockImplementation((_req: any, res: any) => {
  res.json({ ok: true });
});
jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: jest.fn().mockImplementation((_path: string, _res: any) => ({
    sessionId: 'test-session-123',
    handlePostMessage: mockHandlePostMessage,
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
}));

// Mock all internal dependencies
jest.mock('../../orchestration/ConsultOrchestrator.js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../core/ConversationManager.js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../core/EventBus.js', () => ({ EventBus: { createInstance: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })) } }));
jest.mock('../../core/SessionManager.js', () => ({ __esModule: true, default: jest.fn(() => ({ listSessions: jest.fn().mockResolvedValue([]) })) }));
jest.mock('../../core/ContinuationHandler.js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../providers/ProviderFactory.js', () => ({ __esModule: true, default: { createProvider: jest.fn() } }));
jest.mock('../../utils/ProjectContext.js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/ConsultLogger.js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../cli/ConfigCascade.js', () => ({ ConfigCascade: { resolve: jest.fn(() => ({ agents: {}, judge: {} })) } }));
jest.mock('../../cli/PersonaSystem.js', () => ({ PersonaSystem: { getPersonas: jest.fn(), personasToAgents: jest.fn() } }));
jest.mock('../../consult/formatting/FormatterFactory.js', () => ({ FormatterFactory: { format: jest.fn() } }));
jest.mock('../../consult/context/ContextLoader.js', () => ({ ContextLoader: jest.fn() }));
jest.mock('../../constants.js', () => ({ DEFAULT_SELECTOR_MODEL: 'gpt-4o-mini' }));
jest.mock('../../types/consult.js', () => ({}));

// Prevent process.exit from killing the test runner
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

import { startSSE } from '../server';

describe('MCP Server Transport (SSE)', () => {
  beforeAll(async () => {
    // Wait for the module's main() side effect to settle
    await new Promise(r => setTimeout(r, 100));
    await startSSE(3199);
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('GET /health', () => {
    it('returns status ok with active sessions count', () => {
      const handler = routeHandlers['GET:/health'];
      expect(handler).toBeDefined();

      const mockRes = { json: jest.fn() };
      handler({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        transport: 'sse',
        activeSessions: 0,
      });
    });
  });

  describe('GET /sse', () => {
    it('establishes SSE connection', async () => {
      const handler = routeHandlers['GET:/sse'];
      expect(handler).toBeDefined();

      const mockRes = {
        on: jest.fn(),
        writableEnded: false,
        destroyed: false,
        write: jest.fn(),
      };

      await handler({}, mockRes);

      // Should register close handler
      expect(mockRes.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('POST /messages', () => {
    it('returns 400 for unknown session ID', async () => {
      const handler = routeHandlers['POST:/messages'];
      expect(handler).toBeDefined();

      const mockReq = { query: { sessionId: 'nonexistent' }, body: {} };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unknown session ID' });
    });
  });

  describe('Heartbeat', () => {
    it('sends :ping every 15 seconds via setInterval', async () => {
      jest.useFakeTimers();

      const handler = routeHandlers['GET:/sse'];
      const mockRes = {
        on: jest.fn(),
        writableEnded: false,
        destroyed: false,
        write: jest.fn(),
      };

      await handler({}, mockRes);

      // Advance 15 seconds
      jest.advanceTimersByTime(15_000);

      expect(mockRes.write).toHaveBeenCalledWith(':ping\n\n');

      // Trigger close to clean up
      const closeHandler = mockRes.on.mock.calls.find((c: any) => c[0] === 'close')?.[1];
      if (closeHandler) await closeHandler();

      jest.useRealTimers();
    });
  });

  describe('Graceful shutdown', () => {
    it('registers SIGINT and SIGTERM handlers', () => {
      // startSSE already called in beforeAll — check process.listeners directly
      // (spying after-the-fact won't capture already-registered handlers)
      const sigintListeners = process.listeners('SIGINT');
      const sigtermListeners = process.listeners('SIGTERM');
      expect(sigintListeners.length).toBeGreaterThanOrEqual(1);
      expect(sigtermListeners.length).toBeGreaterThanOrEqual(1);
    });
  });
});
