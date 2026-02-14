// Mock everything before imports to prevent side effects
const mockSetRequestHandler = jest.fn();
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
  connect: jest.fn(),
  sendLoggingMessage: jest.fn().mockResolvedValue(undefined),
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
  const mockApp = {
    get: jest.fn(),
    post: jest.fn(),
    use: jest.fn(),
  };
  return jest.fn(() => mockApp);
});

jest.mock('../../orchestration/ConsultOrchestrator.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../core/ConversationManager.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../core/EventBus.js', () => ({
  EventBus: {
    createInstance: jest.fn(() => ({
      on: jest.fn(),
      off: jest.fn(),
    })),
  },
}));

jest.mock('../../core/SessionManager.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    listSessions: jest.fn().mockResolvedValue([]),
    createSessionManifest: jest.fn(),
    saveSession: jest.fn().mockResolvedValue('session-123'),
    loadSession: jest.fn(),
    getMostRecentSession: jest.fn(),
  })),
}));

jest.mock('../../core/ContinuationHandler.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    validateResumable: jest.fn().mockReturnValue({ isValid: true, warnings: [] }),
    prepareForContinuation: jest.fn().mockReturnValue({
      mergedHistory: [],
      newTask: 'test',
    }),
  })),
}));

jest.mock('../../providers/ProviderFactory.js', () => ({
  __esModule: true,
  default: {
    createProvider: jest.fn(() => ({})),
  },
}));

jest.mock('../../utils/ProjectContext.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    load: jest.fn(),
    formatContext: jest.fn(),
  })),
}));

jest.mock('../../utils/ConsultLogger.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    log: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock('../../cli/ConfigCascade.js', () => ({
  ConfigCascade: {
    resolve: jest.fn(() => ({
      agents: {
        Agent1: { model: 'gpt-4o', prompt: 'test' },
      },
      judge: { model: 'gpt-4o', prompt: 'judge' },
      max_rounds: 4,
    })),
  },
}));

jest.mock('../../cli/PersonaSystem.js', () => ({
  PersonaSystem: {
    getPersonas: jest.fn(() => []),
    personasToAgents: jest.fn(() => ({})),
  },
}));

jest.mock('../../consult/formatting/FormatterFactory.js', () => ({
  FormatterFactory: {
    format: jest.fn(() => 'formatted output'),
  },
}));

jest.mock('../../consult/context/ContextLoader.js', () => ({
  ContextLoader: jest.fn(() => ({
    loadFileContext: jest.fn().mockResolvedValue({ formattedContent: 'context' }),
    loadProjectContext: jest.fn().mockResolvedValue({ formattedContent: 'context' }),
  })),
}));

jest.mock('../../constants.js', () => ({
  DEFAULT_SELECTOR_MODEL: 'gpt-4o-mini',
}));

jest.mock('../../types/consult.js', () => ({}));

import { createServer } from '../server';

describe('MCP Server Handlers', () => {
  describe('createServer', () => {
    it('creates server with correct name and version', () => {
      createServer();
      const { Server } = require('@modelcontextprotocol/sdk/server/index');
      expect(Server).toHaveBeenCalledWith(
        { name: 'llm-conclave', version: '1.0.0' },
        expect.objectContaining({ capabilities: expect.any(Object) })
      );
    });

    it('registers ListTools and CallTool handlers', () => {
      mockSetRequestHandler.mockClear();
      createServer();
      expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        'ListToolsRequestSchema',
        expect.any(Function)
      );
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        'CallToolRequestSchema',
        expect.any(Function)
      );
    });
  });

  describe('ListTools handler', () => {
    it('returns all 4 tools', async () => {
      mockSetRequestHandler.mockClear();
      createServer();
      const listToolsHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'ListToolsRequestSchema'
      )?.[1];
      const result = await listToolsHandler();
      expect(result.tools).toHaveLength(4);
      expect(result.tools.map((t: any) => t.name)).toEqual([
        'llm_conclave_consult',
        'llm_conclave_discuss',
        'llm_conclave_continue',
        'llm_conclave_sessions',
      ]);
    });
  });

  describe('CallTool handler', () => {
    let callToolHandler: Function;

    beforeEach(() => {
      mockSetRequestHandler.mockClear();
      createServer();
      callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];
    });

    it('returns isError for unknown tool', async () => {
      const result = await callToolHandler({
        params: { name: 'unknown_tool', arguments: {} },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('handleSessions returns empty message when no sessions', async () => {
      const result = await callToolHandler({
        params: { name: 'llm_conclave_sessions', arguments: {} },
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('No sessions found');
    });

    it('handleSessions passes limit and mode', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const mockListSessions = jest.fn().mockResolvedValue([]);
      SessionManager.mockImplementation(() => ({
        listSessions: mockListSessions,
      }));

      await callToolHandler({
        params: {
          name: 'llm_conclave_sessions',
          arguments: { limit: 5, mode: 'consensus' },
        },
      });

      expect(mockListSessions).toHaveBeenCalledWith({ limit: 5, mode: 'consensus' });
    });

    it('handleDiscuss validates min_rounds <= rounds', async () => {
      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test', rounds: 3, min_rounds: 5 },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('min_rounds');
      expect(result.content[0].text).toContain('cannot exceed');
    });

    it('handleContinue with invalid session_id returns error', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        loadSession: jest.fn().mockResolvedValue(null),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_continue',
          arguments: { session_id: 'nonexistent', task: 'follow up' },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('handleContinue without session_id uses most recent', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const getMostRecent = jest.fn().mockResolvedValue(null);
      SessionManager.mockImplementation(() => ({
        getMostRecentSession: getMostRecent,
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_continue',
          arguments: { task: 'follow up' },
        },
      });
      expect(getMostRecent).toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No sessions found');
    });
  });
});
