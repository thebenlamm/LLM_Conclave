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

jest.mock('../../config/ConfigCascade.js', () => ({
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

jest.mock('../../config/PersonaSystem.js', () => ({
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

// Mock StatusFileManager for llm_conclave_status tests
const mockReadStatus = jest.fn().mockReturnValue(null);
jest.mock('../StatusFileManager.js', () => ({
  StatusFileManager: jest.fn(() => ({
    readStatus: mockReadStatus,
    writeStatus: jest.fn(),
    deleteStatus: jest.fn(),
  })),
}));

import { createServer } from '../server';
import { formatDiscussionResult, formatDiscussionResultJson } from '../server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// Phase 18 tests use the REAL StatusFileManager and SessionManager (bypassing the
// module mocks above) to exercise the actual round-counter code paths that
// handleStatus reads from in production.
const {
  StatusFileManager: RealStatusFileManager,
} = jest.requireActual('../StatusFileManager');
const { default: RealSessionManager } = jest.requireActual('../../core/SessionManager');

// Import saveFullDiscussion and formatDiscussionResult for direct testing
// They are not exported, so we test them indirectly through handleDiscuss.
// Instead, we test the output formatting by examining the CallTool handler results.

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
    it('returns all 5 tools including llm_conclave_status', async () => {
      mockSetRequestHandler.mockClear();
      createServer();
      const listToolsHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'ListToolsRequestSchema'
      )?.[1];
      const result = await listToolsHandler();
      expect(result.tools).toHaveLength(5);
      expect(result.tools.map((t: any) => t.name)).toEqual([
        'llm_conclave_consult',
        'llm_conclave_discuss',
        'llm_conclave_continue',
        'llm_conclave_sessions',
        'llm_conclave_status',
      ]);
    });

    it('llm_conclave_status tool has no required properties', async () => {
      mockSetRequestHandler.mockClear();
      createServer();
      const listToolsHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'ListToolsRequestSchema'
      )?.[1];
      const result = await listToolsHandler();
      const statusTool = result.tools.find((t: any) => t.name === 'llm_conclave_status');
      expect(statusTool).toBeDefined();
      expect(statusTool.inputSchema.required).toBeUndefined();
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

    it('handleDiscuss rejects negative timeout', async () => {
      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test', timeout: -1 },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('timeout must be >= 0');
    });

    it('handleContinue uses minRounds=0 for legacy sessions without the field', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const ConversationManager = require('../../core/ConversationManager').default;

      const legacySession = {
        id: 'session-legacy',
        mode: 'consensus',
        task: 'old task',
        agents: [{ name: 'Agent1', model: 'gpt-4o', systemPrompt: 'test' }],
        judge: { model: 'gpt-4o', systemPrompt: 'judge' },
        maxRounds: 4,
        // minRounds intentionally absent — simulates pre-change session
        conversationHistory: [],
        status: 'completed',
      };

      SessionManager.mockImplementation(() => ({
        loadSession: jest.fn().mockResolvedValue(legacySession),
        createSessionManifest: jest.fn().mockReturnValue({ id: 'new-session' }),
        saveSession: jest.fn().mockResolvedValue('new-session'),
      }));

      // Mock fs to prevent test from writing real files to ~/.llm-conclave/discuss-logs/
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      // Capture the config passed to ConversationManager constructor
      let capturedConfig: any;
      ConversationManager.mockImplementation((config: any) => {
        capturedConfig = config;
        return {
          conversationHistory: [],
          currentRound: 0,
          abortSignal: undefined,
          startConversation: jest.fn().mockResolvedValue({
            task: 'follow up',
            rounds: 1,
            maxRounds: 4,
            minRounds: 0,
            consensusReached: false,
            solution: 'test solution',
            conversationHistory: [],
            failedAgents: [],
            agentSubstitutions: {},
          }),
        };
      });

      await callToolHandler({
        params: {
          name: 'llm_conclave_continue',
          arguments: { session_id: 'session-legacy', task: 'follow up' },
        },
      });

      expect(capturedConfig.min_rounds).toBe(0);
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

    it('handleDiscuss shows per-agent error details in output', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'test task',
          rounds: 1,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: false,
          solution: 'partial solution',
          conversationHistory: [
            { role: 'assistant', content: 'Agent1 response', speaker: 'Agent1', model: 'gpt-4o' },
            { role: 'assistant', content: '[Agent2 unavailable]', speaker: 'Agent2', model: 'claude-sonnet-4-5', error: true, errorDetails: 'Connection error.' },
          ],
          failedAgents: ['Agent2'],
          failedAgentDetails: {
            Agent2: { error: 'Connection error.', model: 'claude-sonnet-4-5' },
          },
          agentSubstitutions: {},
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'LOW',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test task' },
        },
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      // Should contain per-agent error details, not generic "API errors"
      expect(text).toContain('Agent2');
      expect(text).toContain('Connection error.');
      expect(text).toContain('claude-sonnet-4-5');
      expect(text).not.toContain('(API errors)');
    });

    // ================================================================
    // Format parameter tests
    // ================================================================

    it('handleDiscuss format=json returns valid JSON with expected keys', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'test task',
          rounds: 2,
          maxRounds: 4,
          minRounds: 2,
          consensusReached: true,
          solution: 'The panel agreed on approach X.',
          conversationHistory: [
            { role: 'assistant', content: 'response 1', speaker: 'Analyst', model: 'gpt-4o' },
            { role: 'assistant', content: 'response 2', speaker: 'Reviewer', model: 'claude-sonnet-4-5' },
          ],
          failedAgents: [],
          failedAgentDetails: {},
          agentSubstitutions: {},
          keyDecisions: ['Use approach X'],
          actionItems: ['Implement X'],
          dissent: ['Minor concern about Y'],
          confidence: 'HIGH',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test task', format: 'json' },
        },
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBe('test task');
      expect(parsed.summary).toBe('The panel agreed on approach X.');
      expect(parsed.key_decisions).toEqual(['Use approach X']);
      expect(parsed.action_items).toEqual(['Implement X']);
      expect(parsed.dissent).toEqual(['Minor concern about Y']);
      expect(parsed.confidence).toBe('high'); // lowercase
      expect(parsed.consensus_reached).toBe(true);
      expect(parsed.rounds).toEqual({ completed: 2, max: 4 });
      expect(parsed.agents).toEqual([
        { name: 'Analyst', model: 'gpt-4o' },
        { name: 'Reviewer', model: 'claude-sonnet-4-5' },
      ]);
      expect(parsed.session_id).toBe('session-test');
      expect(parsed.log_file).toBeDefined();
    });

    it('handleDiscuss format=both returns JSON with markdown_summary field', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'test task',
          rounds: 1,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: false,
          solution: 'test solution',
          conversationHistory: [],
          failedAgents: [],
          failedAgentDetails: {},
          agentSubstitutions: {},
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'MEDIUM',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test task', format: 'both' },
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('test solution');
      expect(parsed.markdown_summary).toBeDefined();
      expect(parsed.markdown_summary).toContain('Discussion Summary');
    });

    it('handleDiscuss default format returns markdown (not JSON)', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'test task',
          rounds: 1,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: false,
          solution: 'test solution',
          conversationHistory: [],
          failedAgents: [],
          failedAgentDetails: {},
          agentSubstitutions: {},
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'MEDIUM',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test task' },
        },
      });

      const text = result.content[0].text;
      expect(text).toContain('# Discussion Summary');
      // Should NOT be valid JSON
      expect(() => JSON.parse(text)).toThrow();
    });

    it('handleDiscuss format=json omits empty optional fields', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'test',
          rounds: 1,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: false,
          solution: 'test',
          conversationHistory: [],
          failedAgents: [],
          failedAgentDetails: {},
          agentSubstitutions: {},
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'MEDIUM',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test', format: 'json' },
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.failed_agents).toBeUndefined();
      expect(parsed.substitutions).toBeUndefined();
      expect(parsed.timed_out).toBeUndefined();
      expect(parsed.degraded).toBeUndefined();
    });

    // ================================================================
    // judge_instructions parameter tests
    // ================================================================

    it('handleDiscuss passes judge_instructions to ConversationManager', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      let capturedOptions: any;
      ConversationManager.mockImplementation((_config: any, _mem: any, _stream: any, _bus: any, _dyn: any, _sel: any, opts: any) => {
        capturedOptions = opts;
        return {
          conversationHistory: [],
          currentRound: 1,
          abortSignal: undefined,
          startConversation: jest.fn().mockResolvedValue({
            task: 'test',
            rounds: 1,
            maxRounds: 4,
            minRounds: 0,
            consensusReached: false,
            solution: 'test',
            conversationHistory: [],
            failedAgents: [],
            failedAgentDetails: {},
            agentSubstitutions: {},
            keyDecisions: [],
            actionItems: [],
            dissent: [],
            confidence: 'MEDIUM',
          }),
        };
      });

      await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test', judge_instructions: 'Focus on cost analysis' },
        },
      });

      expect(capturedOptions).toMatchObject({ judgeInstructions: 'Focus on cost analysis' });
    });

    it('handleDiscuss without judge_instructions passes undefined', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      let capturedOptions: any;
      ConversationManager.mockImplementation((_config: any, _mem: any, _stream: any, _bus: any, _dyn: any, _sel: any, opts: any) => {
        capturedOptions = opts;
        return {
          conversationHistory: [],
          currentRound: 1,
          abortSignal: undefined,
          startConversation: jest.fn().mockResolvedValue({
            task: 'test',
            rounds: 1,
            maxRounds: 4,
            minRounds: 0,
            consensusReached: false,
            solution: 'test',
            conversationHistory: [],
            failedAgents: [],
            failedAgentDetails: {},
            agentSubstitutions: {},
            keyDecisions: [],
            actionItems: [],
            dissent: [],
            confidence: 'MEDIUM',
          }),
        };
      });

      await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test' },
        },
      });

      expect(capturedOptions).toMatchObject({ judgeInstructions: undefined });
    });

    // ================================================================
    // Transcript inclusion on timeout tests
    // ================================================================

    it('handleDiscuss includes transcript in markdown on timeout', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'timeout test',
          rounds: 1,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: false,
          solution: 'partial summary',
          conversationHistory: [
            { role: 'assistant', content: 'My analysis shows...', speaker: 'Analyst', model: 'gpt-4o' },
            { role: 'assistant', content: 'I disagree because...', speaker: 'Critic', model: 'claude-sonnet-4-5' },
          ],
          failedAgents: [],
          failedAgentDetails: {},
          agentSubstitutions: {},
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'LOW',
          timedOut: true,
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'timeout test' },
        },
      });

      const text = result.content[0].text;
      expect(text).toContain('Discussion Transcript');
      expect(text).toContain('Analyst');
      expect(text).toContain('My analysis shows...');
      expect(text).toContain('Critic');
      expect(text).toContain('I disagree because...');
    });

    it('handleDiscuss omits transcript in markdown when not timed out', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'normal test',
          rounds: 2,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: true,
          solution: 'full summary',
          conversationHistory: [
            { role: 'assistant', content: 'response 1', speaker: 'Agent1', model: 'gpt-4o' },
          ],
          failedAgents: [],
          failedAgentDetails: {},
          agentSubstitutions: {},
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'HIGH',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'normal test' },
        },
      });

      const text = result.content[0].text;
      expect(text).not.toContain('Discussion Transcript');
    });

    it('handleDiscuss shows degraded abort message', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-test' }),
        saveSession: jest.fn().mockResolvedValue('session-test'),
      }));
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue({
          task: 'test task',
          rounds: 1,
          maxRounds: 4,
          minRounds: 0,
          consensusReached: false,
          solution: 'partial',
          conversationHistory: [],
          failedAgents: ['Agent1', 'Agent2'],
          failedAgentDetails: {
            Agent1: { error: 'Connection error.', model: 'gpt-4o' },
            Agent2: { error: 'Connection error.', model: 'claude-sonnet-4-5' },
          },
          agentSubstitutions: {},
          degraded: true,
          degradedReason: 'Only 0 of 2 agents responded in round 1',
          keyDecisions: [],
          actionItems: [],
          dissent: [],
          confidence: 'LOW',
        }),
      }));

      const result = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test task' },
        },
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).toContain('Discussion aborted');
      expect(text).toContain('Only 0 of 2 agents responded');
      expect(text).toContain('mcp-server.log');
    });

    // ================================================================
    // Cost data in discuss output (COST-02)
    // ================================================================

    describe('Cost data in discuss output (COST-02)', () => {
      const makeMockResult = (cost?: any) => ({
        task: 'cost test',
        rounds: 2,
        maxRounds: 4,
        minRounds: 0,
        consensusReached: true,
        solution: 'test solution',
        conversationHistory: [
          { role: 'assistant', content: 'response', speaker: 'Analyst', model: 'gpt-4o' },
        ],
        failedAgents: [],
        failedAgentDetails: {},
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        confidence: 'HIGH',
        cost,
      });

      const setupMocks = (cost?: any) => {
        const ConversationManager = require('../../core/ConversationManager').default;
        const SessionManager = require('../../core/SessionManager').default;
        SessionManager.mockImplementation(() => ({
          createSessionManifest: jest.fn().mockReturnValue({ id: 'session-cost-test' }),
          saveSession: jest.fn().mockResolvedValue('session-cost-test'),
        }));
        const fs = require('fs');
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

        ConversationManager.mockImplementation(() => ({
          conversationHistory: [],
          currentRound: 1,
          abortSignal: undefined,
          startConversation: jest.fn().mockResolvedValue(makeMockResult(cost)),
        }));
      };

      it('markdown output shows real token count and USD cost from result.cost', async () => {
        setupMocks({ totalCost: 0.05, totalTokens: { input: 3000, output: 1500 }, totalCalls: 6 });

        const result = await callToolHandler({
          params: {
            name: 'llm_conclave_discuss',
            arguments: { task: 'cost test' },
          },
        });

        const text = result.content[0].text;
        expect(text).toContain('**Tokens:** 4,500');
        expect(text).toContain('3,000 in');
        expect(text).toContain('1,500 out');
        expect(text).toContain('**Cost:** $0.0500');
        expect(text).not.toContain('Est. tokens');
        expect(text).not.toContain('Est. cost');
      });

      it('JSON output returns tokens and cost_usd from result.cost (not heuristic fields)', async () => {
        setupMocks({ totalCost: 0.05, totalTokens: { input: 3000, output: 1500 }, totalCalls: 6 });

        const result = await callToolHandler({
          params: {
            name: 'llm_conclave_discuss',
            arguments: { task: 'cost test', format: 'json' },
          },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.tokens).toEqual({ input: 3000, output: 1500, total: 4500 });
        expect(parsed.cost_usd).toBe(0.05);
        expect(parsed).not.toHaveProperty('estimated_tokens');
        expect(parsed).not.toHaveProperty('estimated_cost');
      });

      it('markdown output falls back gracefully when result.cost is absent', async () => {
        setupMocks(undefined);

        const result = await callToolHandler({
          params: {
            name: 'llm_conclave_discuss',
            arguments: { task: 'cost test' },
          },
        });

        const text = result.content[0].text;
        expect(text).not.toContain('Est. tokens');
        expect(text).not.toContain('Est. cost');
        expect(text).toContain('unavailable');
      });

      it('JSON output returns null tokens and cost_usd when result.cost is absent', async () => {
        setupMocks(undefined);

        const result = await callToolHandler({
          params: {
            name: 'llm_conclave_discuss',
            arguments: { task: 'cost test', format: 'json' },
          },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.tokens).toBeNull();
        expect(parsed.cost_usd).toBeNull();
        expect(parsed).not.toHaveProperty('estimated_tokens');
        expect(parsed).not.toHaveProperty('estimated_cost');
      });
    });

    describe('handleStatus', () => {
      beforeEach(() => {
        mockReadStatus.mockReturnValue(null);
      });

      it('returns "No Active Discussion" when no status file and no sessions', async () => {
        const result = await callToolHandler({
          params: { name: 'llm_conclave_status', arguments: {} },
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('No Active Discussion');
        expect(result.content[0].text).toContain('llm_conclave_discuss');
      });

      it('returns last completed session summary when no active discussion', async () => {
        const SessionManager = require('../../core/SessionManager').default;
        SessionManager.mockImplementation(() => ({
          listSessions: jest.fn().mockResolvedValue([
            {
              id: 'session-xyz',
              timestamp: new Date('2026-04-07T05:00:00.000Z').toISOString(),
              task: 'What is the best architecture for this project?',
              mode: 'consensus',
              status: 'completed',
              roundCount: 3,
              agentCount: 3,
              cost: 0.0512,
              consensusReached: true,
            },
          ]),
        }));

        const result = await callToolHandler({
          params: { name: 'llm_conclave_status', arguments: {} },
        });
        expect(result.isError).toBeUndefined();
        const text = result.content[0].text;
        expect(text).toContain('No Active Discussion');
        expect(text).toContain('Last completed');
        expect(text).toContain('What is the best architecture');
        expect(text).toContain('Yes'); // consensusReached
        expect(text).toContain('0.0512');
      });

      it('returns active discussion status when status file exists', async () => {
        mockReadStatus.mockReturnValue({
          active: true as const,
          task: 'Debate: AI regulation',
          startTime: new Date(Date.now() - 90000).toISOString(),
          elapsedMs: 90000,
          agents: ['Claude', 'GPT-4', 'Gemini'],
          currentRound: 2,
          maxRounds: 4,
          currentAgent: 'Claude',
          updatedAt: new Date().toISOString(),
        });

        const result = await callToolHandler({
          params: { name: 'llm_conclave_status', arguments: {} },
        });
        expect(result.isError).toBeUndefined();
        const text = result.content[0].text;
        expect(text).toContain('Active Discussion');
        expect(text).toContain('Debate: AI regulation');
        expect(text).toContain('2/4');
        expect(text).toContain('Claude');
        expect(text).toContain('GPT-4');
      });

      it('warns when status file is stale (>2 min old)', async () => {
        const staleTime = new Date(Date.now() - 200_000).toISOString(); // ~3.3 min ago
        mockReadStatus.mockReturnValue({
          active: true as const,
          task: 'Stale task',
          startTime: new Date(Date.now() - 300_000).toISOString(),
          elapsedMs: 300_000,
          agents: ['Agent1'],
          currentRound: 1,
          maxRounds: 4,
          currentAgent: null,
          updatedAt: staleTime,
        });

        const result = await callToolHandler({
          params: { name: 'llm_conclave_status', arguments: {} },
        });
        expect(result.content[0].text).toContain('Warning');
        expect(result.content[0].text).toContain('crashed');
      });

      it('never errors even if SessionManager throws', async () => {
        const SessionManager = require('../../core/SessionManager').default;
        SessionManager.mockImplementation(() => ({
          listSessions: jest.fn().mockRejectedValue(new Error('disk error')),
        }));

        const result = await callToolHandler({
          params: { name: 'llm_conclave_status', arguments: {} },
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('No Active Discussion');
      });
    });
  });

  describe('DEBT regression locks (Phase 16)', () => {
    // DEBT-01: Rule 3.5a LOW-cap reasoning must produce the (participation: N agents absent) tag.
    // Reasoning contains 'absent' but NOT 'participation' — pins the broadened regex from commit 0ff80e0
    // against reverting to the old literal 'participation' matcher.
    it('DEBT-01: renders (participation: N agents absent) for Rule 3.5a LOW-cap reasoning', () => {
      const result = {
        task: 'test task',
        conversationHistory: [],
        solution: 'test solution',
        consensusReached: false,
        rounds: 4,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        finalConfidence: 'LOW',
        confidenceReasoning:
          'All-but-one configured agent absent (2 of 3 configured agents did not participate)',
        runIntegrity: {
          participation: [
            { name: 'Agent1', status: 'spoken' },
            { name: 'Agent2', status: 'absent' },
            { name: 'Agent3', status: 'absent' },
          ],
        },
        agents_config: [],
      };

      const output = formatDiscussionResult(result, '/tmp/log.jsonl');

      expect(output).toContain('(participation: 2 agents absent)');
    });

    // DEBT-02: confidenceReasoning containing 'compression' must NOT produce any tag.
    // Pins the deletion of the unreachable `compression active` branch (commit 0ff80e0).
    it('DEBT-02: renders no parenthesised tag when confidenceReasoning is compression-only', () => {
      const result = {
        task: 'test task',
        conversationHistory: [],
        solution: 'test solution',
        consensusReached: true,
        rounds: 3,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        finalConfidence: 'MEDIUM',
        confidenceReasoning: 'compression active',
        runIntegrity: { participation: [] },
        agents_config: [],
      };

      const output = formatDiscussionResult(result, '/tmp/log.jsonl');

      // No participation tag, no compression tag, no other parenthesised suffix on the Confidence line.
      expect(output).not.toContain('(participation:');
      expect(output).not.toContain('(compression');
      // The Confidence line should terminate cleanly with the value (no ` (...)` suffix).
      // Note: `**Confidence:**` is rendered mid-line after `**Rounds:** ... | **Consensus:** ... |`
      // (see formatDiscussionResult in src/mcp/server.ts:1028). Match the containing line.
      const confidenceLine = output.split('\n').find((l) => l.includes('**Confidence:**'));
      expect(confidenceLine).toBeDefined();
      expect(confidenceLine).not.toMatch(/\*\*Confidence:\*\* \w+ \(/);
    });

    // DEBT-03: handleSessions must render the Consensus line across all three
    // undefined-tracking branches (true/false/undefined).
    it('DEBT-03: handleSessions renders **Consensus:** Yes / No / N/A for three SessionSummary records', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const sampleSessions = [
        {
          id: 'session-true',
          timestamp: '2026-04-16T10:00:00Z',
          mode: 'consensus',
          task: 'task-true',
          status: 'completed',
          roundCount: 3,
          agentCount: 3,
          cost: 0.1234,
          consensusReached: true,
        },
        {
          id: 'session-false',
          timestamp: '2026-04-16T11:00:00Z',
          mode: 'consensus',
          task: 'task-false',
          status: 'completed',
          roundCount: 4,
          agentCount: 3,
          cost: 0.2345,
          consensusReached: false,
        },
        {
          id: 'session-undefined',
          timestamp: '2026-04-16T12:00:00Z',
          mode: 'orchestrated',
          task: 'task-undefined',
          status: 'completed',
          roundCount: 2,
          agentCount: 3,
          cost: 0.0456,
          // consensusReached intentionally undefined
        },
      ];
      SessionManager.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue(sampleSessions),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const result = await callToolHandler({
        params: { name: 'llm_conclave_sessions', arguments: {} },
      });

      const text: string = result.content[0].text;
      expect(text).toContain('- **Consensus:** Yes');
      expect(text).toContain('- **Consensus:** No');
      expect(text).toContain('- **Consensus:** N/A');
      // Confirm exactly three Consensus lines (one per session).
      const consensusCount = (text.match(/- \*\*Consensus:\*\*/g) ?? []).length;
      expect(consensusCount).toBe(3);
    });
  });

  describe('Phase 17 — Final Output Auditability', () => {
    // Shared fixture builder: three agents, each with two rounds of non-error
    // assistant turns, plus a Judge turn. Extra content length triggers the
    // 800-char truncation on AgentB's final turn so the `truncated` flag is
    // observable in the JSON.
    const buildResult = () => {
      const longContent = 'A'.repeat(900); // > 800 to exercise truncation
      return {
        task: 'phase 17 coverage',
        conversationHistory: [
          { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'A round1 position' },
          { role: 'assistant', speaker: 'AgentB', model: 'gpt-x', content: 'B round1 position' },
          { role: 'assistant', speaker: 'AgentC', model: 'gemini-x', content: 'C round1 position' },
          { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'A final position' },
          { role: 'assistant', speaker: 'AgentB', model: 'gpt-x', content: longContent },
          { role: 'assistant', speaker: 'AgentC', model: 'gemini-x', content: 'C final position' },
          { role: 'assistant', speaker: 'Judge', model: 'judge-x', content: 'judge synthesis' },
        ],
        solution: 'judge synthesis text',
        consensusReached: true,
        rounds: 2,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: ['decision-alpha'],
        actionItems: ['action-alpha'],
        dissent: ['dissent-alpha'],
        finalConfidence: 'HIGH',
        confidenceReasoning: 'clean run',
        runIntegrity: { participation: [] },
        agents_config: {
          AgentA: { model: 'claude-x' },
          AgentB: { model: 'gpt-x' },
          AgentC: { model: 'gemini-x' },
        },
      };
    };

    // AUDIT-01 (markdown): per-agent block present, one ### block per agent,
    // final turn content wins over first turn content.
    it('AUDIT-01 markdown: renders ## Agent Positions with one ### block per agent showing final turn', () => {
      const output = formatDiscussionResult(buildResult(), '/tmp/log.jsonl');
      expect(output).toContain('## Agent Positions\n');
      expect(output).toContain('### AgentA\n');
      expect(output).toContain('### AgentB\n');
      expect(output).toContain('### AgentC\n');
      // Final-turn content wins (e.g., 'A final position' present, 'A round1 position' absent)
      expect(output).toContain('A final position');
      expect(output).toContain('C final position');
      // Round-1 content must NOT appear in the output (it would appear if the walk picked first instead of last)
      expect(output).not.toContain('A round1 position');
      expect(output).not.toContain('C round1 position');
    });

    // AUDIT-02 (markdown): Dissenting Views appears BEFORE Key Decisions and Action Items
    // in the rendered string.
    it('AUDIT-02 markdown: ## Dissenting Views appears before ## Key Decisions and ## Action Items', () => {
      const output = formatDiscussionResult(buildResult(), '/tmp/log.jsonl');
      const dissentIdx = output.indexOf('## Dissenting Views');
      const decisionsIdx = output.indexOf('## Key Decisions');
      const actionsIdx = output.indexOf('## Action Items');
      expect(dissentIdx).toBeGreaterThan(-1);
      expect(decisionsIdx).toBeGreaterThan(-1);
      expect(actionsIdx).toBeGreaterThan(-1);
      expect(dissentIdx).toBeLessThan(decisionsIdx);
      expect(decisionsIdx).toBeLessThan(actionsIdx);
    });

    // AUDIT-01 (JSON): per_agent_positions array present with expected shape.
    it('AUDIT-01 JSON: per_agent_positions array contains every participating agent with correct shape', () => {
      const json = formatDiscussionResultJson(buildResult(), '/tmp/log.jsonl');
      expect(Array.isArray(json.per_agent_positions)).toBe(true);
      expect(json.per_agent_positions).toHaveLength(3);
      const names = json.per_agent_positions.map((p: any) => p.agent);
      expect(names).toEqual(['AgentA', 'AgentB', 'AgentC']); // first-speak order
      const agentA = json.per_agent_positions[0];
      expect(agentA).toMatchObject({
        agent: 'AgentA',
        model: 'claude-x',
        final_turn_excerpt: 'A final position',
        truncated: false,
      });
      const agentB = json.per_agent_positions[1];
      expect(agentB.truncated).toBe(true); // 900-char longContent triggered truncation
      expect(agentB.final_turn_excerpt.length).toBe(803); // 800 chars + '...'
      expect(agentB.final_turn_excerpt.endsWith('...')).toBe(true);
    });

    // AUDIT-02 (JSON): section_order field advertises the canonical layout.
    it('AUDIT-02 JSON: section_order equals the canonical dissent-above-actions sequence', () => {
      const json = formatDiscussionResultJson(buildResult(), '/tmp/log.jsonl');
      expect(json.section_order).toEqual([
        'summary',
        'agent_positions',
        'dissent',
        'key_decisions',
        'action_items',
      ]);
    });

    // Schema-stability guard: every pre-Phase-17 top-level JSON key is still present.
    it('JSON shape: all pre-Phase-17 top-level keys remain present (no rename, no removal)', () => {
      const json = formatDiscussionResultJson(buildResult(), '/tmp/log.jsonl', 'sess-1');
      const required = [
        'task', 'summary', 'realized_panel', 'key_decisions', 'action_items',
        'dissent', 'confidence', 'final_confidence', 'confidence_reasoning',
        'consensus_reached', 'rounds', 'agents', 'tokens', 'cost_usd',
        'runIntegrity', 'turn_analytics', 'dissent_quality', 'session_id',
        'log_file',
      ];
      for (const key of required) {
        expect(json).toHaveProperty(key);
      }
      // Additive keys from this phase must also be present.
      expect(json).toHaveProperty('per_agent_positions');
      expect(json).toHaveProperty('section_order');
    });
  });

  describe('Phase 18 — Round Counter Unification (AUDIT-03)', () => {
    const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase18-status-'));

    // COST-02 tests above install jest.spyOn fs.writeFileSync / mkdirSync / existsSync
    // without restoring — restore them here so our real StatusFileManager + SessionManager
    // calls hit the real filesystem. Without this, writeFileSync is a no-op and renameSync
    // fails with ENOENT because the .tmp file was never actually written.
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('AUDIT-03 status-active: round reported from status file equals the round stamped by DiscussionRunner', () => {
      // Simulate the post-18-02 DiscussionRunner initial write:
      // currentRound = (conversationManager.currentRound ?? 0) + 1
      // For a continuation resuming at round 3, that's 3 + 1 = 4.
      const baseDir = tmpDir();
      const sfm = new RealStatusFileManager(baseDir);
      sfm.writeStatus({
        active: true,
        task: 'continuation task',
        startTime: new Date().toISOString(),
        elapsedMs: 0,
        agents: ['AgentA', 'AgentB'],
        currentRound: 4,
        maxRounds: 5,
        currentAgent: null,
        updatedAt: new Date().toISOString(),
      });
      const read = sfm.readStatus();
      expect(read).not.toBeNull();
      expect(read!.currentRound).toBe(4);
      expect(read!.maxRounds).toBe(5);

      // The server.ts L742 render line is literally `**Round:** ${active.currentRound}/${active.maxRounds}`.
      // We don't import handleStatus directly (it's async with module side effects); instead we assert
      // on the read shape, which is what handleStatus renders. This matches the Phase 17 pattern of
      // testing the formatter inputs rather than the transport wrapper.
      const expectedLine = `**Round:** ${read!.currentRound}/${read!.maxRounds}`;
      expect(expectedLine).toBe('**Round:** 4/5');
    });

    it('AUDIT-03 status-last-completed: summary.roundCount equals session.currentRound (server.ts prints Rounds: N line correctly)', async () => {
      const baseDir = tmpDir();
      const sm = new RealSessionManager(baseDir);
      const history: any[] = [
        { role: 'user',      speaker: 'System', content: 'task',  roundNumber: 0 },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r1', roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r1', roundNumber: 1 },
        { role: 'user',      speaker: 'Judge',  content: 'g1',    roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentA', model: 'claude-x', content: 'r2', roundNumber: 2 },
        { role: 'assistant', speaker: 'AgentB', model: 'gpt-x',    content: 'r2', roundNumber: 2 },
      ];
      const agents = [
        { name: 'AgentA', model: 'claude-x', provider: { constructor: { name: 'ClaudeProvider' } }, systemPrompt: '' },
        { name: 'AgentB', model: 'gpt-x',    provider: { constructor: { name: 'OpenAIProvider' } }, systemPrompt: '' },
      ];
      const manifest = sm.createSessionManifest('consensus', 'task', agents, history, {
        rounds: 2,
        solution: 'v',
        consensusReached: true,
      });
      await sm.saveSession(manifest);
      const summaries = await sm.listSessions({ limit: 1 });
      expect(summaries).toHaveLength(1);

      // server.ts L778 renders: `- **Rounds:** ${session.roundCount} | **Cost:** $${session.cost.toFixed(4)}\n`
      // Lock the field the renderer reads.
      expect(summaries[0].roundCount).toBe(2);
      expect(summaries[0].roundCount).toBe(manifest.currentRound);
      // And the per-message stamps agree with the session counter.
      const stamps = manifest.conversationHistory.map((m: any) => m.roundNumber);
      expect(Math.max(...stamps)).toBe(manifest.currentRound);
    });

    it('AUDIT-03 three-way parity: session.currentRound === max(history roundNumber) === summary.roundCount', async () => {
      const sm = new RealSessionManager(tmpDir());
      const history: any[] = [
        { role: 'user',      speaker: 'System', content: 't',   roundNumber: 0 },
        { role: 'assistant', speaker: 'AgentA', model: 'c', content: '1', roundNumber: 1 },
        { role: 'user',      speaker: 'Judge',  content: 'g',   roundNumber: 1 },
        { role: 'assistant', speaker: 'AgentA', model: 'c', content: '2', roundNumber: 2 },
        { role: 'user',      speaker: 'Judge',  content: 'g',   roundNumber: 2 },
        { role: 'assistant', speaker: 'AgentA', model: 'c', content: '3', roundNumber: 3 },
      ];
      const agents = [{ name: 'AgentA', model: 'c', provider: { constructor: { name: 'ClaudeProvider' } }, systemPrompt: '' }];
      const manifest = sm.createSessionManifest('consensus', 't', agents, history, {
        rounds: 3,
        solution: 'v',
        consensusReached: true,
      });
      await sm.saveSession(manifest);
      const summaries = await sm.listSessions({ limit: 1 });

      const sessionRound = manifest.currentRound;
      const maxHistoryRound = Math.max(...manifest.conversationHistory.map((m: any) => m.roundNumber));
      const summaryRound = summaries[0].roundCount;

      // The exact failure signature from AUDIT-03 ("session says 4, history has 7"):
      // these three values MUST equal each other. This is the single assertion that
      // future regressions are guaranteed to trip over.
      expect(sessionRound).toBe(3);
      expect(maxHistoryRound).toBe(3);
      expect(summaryRound).toBe(3);
      expect(sessionRound).toBe(maxHistoryRound);
      expect(maxHistoryRound).toBe(summaryRound);
    });
  });
});

