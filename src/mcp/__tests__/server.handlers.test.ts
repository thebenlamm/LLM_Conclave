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
  // AUDIT-05 (Phase 20): expose the pure helper to consumers of this mock.
  // The production server.ts reads it to derive session_status on the MCP
  // response. Delegates to the real implementation so signal detection logic
  // is tested end-to-end rather than stubbed.
  computeSessionStatus: jest.requireActual('../../core/SessionManager').computeSessionStatus,
  // REPLAY-03 (Phase 21): expose the substitution-rate helper to consumers of
  // this mock for the same reason as computeSessionStatus — handleStatus /
  // handleSessions import it to render the Substitution rate line. Delegating
  // to the real implementation keeps the telemetry math unmocked.
  computeSubstitutionRate: jest.requireActual('../../core/SessionManager').computeSubstitutionRate,
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

  describe('Phase 19 — AUDIT-04 conclave_home reporting', () => {
    const ORIGINAL_ENV = process.env.LLM_CONCLAVE_HOME;

    beforeEach(() => {
      delete process.env.LLM_CONCLAVE_HOME;
    });

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) {
        delete process.env.LLM_CONCLAVE_HOME;
      } else {
        process.env.LLM_CONCLAVE_HOME = ORIGINAL_ENV;
      }
    });

    const minimalResult = {
      task: 'audit04 task',
      conversationHistory: [],
      solution: 'done',
      consensusReached: true,
      rounds: 2,
      maxRounds: 4,
      failedAgents: [],
      agentSubstitutions: {},
      keyDecisions: [],
      actionItems: [],
      dissent: [],
      cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 } },
    };

    it('JSON response includes conclave_home equal to getConclaveHome() when env is unset (tmpdir fallback)', () => {
      const json = formatDiscussionResultJson(minimalResult, '/tmp/log.jsonl', 'session-xyz');
      expect(typeof json.conclave_home).toBe('string');
      // In the Jest harness, getConclaveHome() resolves to tmpdir/llm-conclave-test-logs.
      const expected = path.join(os.tmpdir(), 'llm-conclave-test-logs');
      expect(json.conclave_home).toBe(expected);
    });

    it('JSON response conclave_home reflects LLM_CONCLAVE_HOME env override', () => {
      process.env.LLM_CONCLAVE_HOME = '/tmp/audit04-sandbox';
      const json = formatDiscussionResultJson(minimalResult, '/tmp/log.jsonl', 'session-xyz');
      expect(json.conclave_home).toBe('/tmp/audit04-sandbox');
    });

    it('JSON response preserves existing fields (task, summary, session_id, log_file) when conclave_home is added', () => {
      const json = formatDiscussionResultJson(minimalResult, '/tmp/log.jsonl', 'session-xyz');
      expect(json.task).toBe('audit04 task');
      expect(json.summary).toBe('done');
      expect(json.session_id).toBe('session-xyz');
      expect(json.log_file).toBe('/tmp/log.jsonl');
      // And the additive field sits alongside existing ones.
      expect(Object.prototype.hasOwnProperty.call(json, 'conclave_home')).toBe(true);
    });
  });

  describe('Phase 20 — Degraded Status (AUDIT-05)', () => {
    beforeEach(() => { jest.restoreAllMocks(); });

    const cleanRunIntegrity = () => ({
      compression: {
        active: false,
        activatedAtRound: null,
        tailSize: 0,
        summaryRegenerations: 0,
        summarizerFallback: null,
      },
      participation: [
        { agent: 'AgentA', turns: 3, status: 'spoken' },
        { agent: 'AgentB', turns: 3, status: 'spoken' },
      ],
    });

    const buildCleanResult = () => ({
      task: 'phase 20 clean task',
      conversationHistory: [],
      solution: 'clean summary',
      consensusReached: true,
      rounds: 2,
      maxRounds: 4,
      failedAgents: [],
      agentSubstitutions: {},
      keyDecisions: ['decision-alpha'],
      actionItems: ['action-alpha'],
      dissent: ['dissent-alpha'],
      cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 } },
      runIntegrity: cleanRunIntegrity(),
      agents_config: {
        AgentA: { model: 'claude-x' },
        AgentB: { model: 'gpt-x' },
      },
    });

    const buildDegradedResult = () => ({
      ...buildCleanResult(),
      agentSubstitutions: {
        AgentB: { original: 'gpt-5', fallback: 'gpt-4o-mini', reason: '429' },
      },
    });

    it('AUDIT-05 clean-run JSON: session_status === "completed"', () => {
      const json = formatDiscussionResultJson(buildCleanResult(), '/tmp/log.jsonl', 'sess-clean');
      expect(json.session_status).toBe('completed');
    });

    it('AUDIT-05 degraded-run JSON: session_status === "completed_degraded"', () => {
      const json = formatDiscussionResultJson(buildDegradedResult(), '/tmp/log.jsonl', 'sess-deg');
      expect(json.session_status).toBe('completed_degraded');
    });

    it('AUDIT-05 existing-fields-preserved (SC#5 non-regression): degraded JSON retains every pre-existing top-level field and leaves old degraded/degraded_reason untouched', () => {
      const json = formatDiscussionResultJson(buildDegradedResult(), '/tmp/log.jsonl', 'sess-deg');
      expect(json.task).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.session_id).toBeDefined();
      expect(json.log_file).toBeDefined();
      expect(json.conclave_home).toBeDefined();
      expect(json.substitutions).toBeDefined(); // non-empty on degraded run
      expect(json.realized_panel).toBeDefined();
      expect(json.section_order).toEqual(['summary', 'agent_positions', 'dissent', 'key_decisions', 'action_items']);
      // Old pre-existing `degraded` / `degraded_reason` mean "discussion aborted"
      // — NOT triggered by completed_degraded status. They remain undefined.
      expect(json.degraded).toBeUndefined();
      expect(json.degraded_reason).toBeUndefined();
      // And the new additive field
      expect(json.session_status).toBe('completed_degraded');
    });

    it('AUDIT-05 handleStatus last-completed branch renders degraded Status line', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const degradedSummary = {
        id: 'sess-degraded',
        timestamp: '2026-04-17T10:00:00Z',
        mode: 'consensus',
        task: 'degraded task',
        status: 'completed_degraded',
        roundCount: 3,
        agentCount: 2,
        cost: 0.0500,
        consensusReached: true,
      };
      SessionManager.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([degradedSummary]),
      }));
      mockReadStatus.mockReturnValueOnce(null); // ensure no-active branch

      mockSetRequestHandler.mockClear();
      createServer();
      const handler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];
      const result = await handler({
        params: { name: 'llm_conclave_status', arguments: {} },
      });
      const text: string = result.content[0].text;
      expect(text).toContain('**Status:** completed_degraded');
    });

    it('AUDIT-05 handleStatus last-completed branch renders clean Status line', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const cleanSummary = {
        id: 'sess-clean',
        timestamp: '2026-04-17T10:00:00Z',
        mode: 'consensus',
        task: 'clean task',
        status: 'completed',
        roundCount: 2,
        agentCount: 2,
        cost: 0.0200,
        consensusReached: true,
      };
      SessionManager.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([cleanSummary]),
      }));
      mockReadStatus.mockReturnValueOnce(null); // ensure no-active branch

      mockSetRequestHandler.mockClear();
      createServer();
      const handler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];
      const result = await handler({
        params: { name: 'llm_conclave_status', arguments: {} },
      });
      const text: string = result.content[0].text;
      expect(text).toContain('**Status:** completed');
    });

    it('AUDIT-05 sessions-listing renders Status per session (clean + degraded)', async () => {
      const SessionManager = require('../../core/SessionManager').default;
      const sampleSessions = [
        {
          id: 'sess-clean',
          timestamp: '2026-04-17T10:00:00Z',
          mode: 'consensus',
          task: 'clean task',
          status: 'completed',
          roundCount: 2,
          agentCount: 2,
          cost: 0.02,
          consensusReached: true,
        },
        {
          id: 'sess-degraded',
          timestamp: '2026-04-17T11:00:00Z',
          mode: 'consensus',
          task: 'degraded task',
          status: 'completed_degraded',
          roundCount: 3,
          agentCount: 2,
          cost: 0.05,
          consensusReached: false,
        },
      ];
      SessionManager.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue(sampleSessions),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const handler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];
      const result = await handler({
        params: { name: 'llm_conclave_sessions', arguments: {} },
      });
      const text: string = result.content[0].text;
      expect(text).toContain('**Status:** completed');
      expect(text).toContain('**Status:** completed_degraded');
    });
  });

  describe('Phase 20 — AUDIT-06 judge_coinage reporting', () => {
    beforeEach(() => { jest.restoreAllMocks(); });

    // Test 1: grounded run — judge_coinage is an empty array (not undefined)
    it('AUDIT-06 grounded-run JSON: judge_coinage is []', () => {
      const result = {
        task: 'phase 20 audit06 grounded',
        solution: 'Adopt the Apollo Framework for the launch sequence.',
        consensusReached: true,
        rounds: 2,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        conversationHistory: [
          { role: 'assistant', speaker: 'Alice', content: 'I recommend the Apollo Framework — it is battle-tested.' },
          { role: 'assistant', speaker: 'Bob', content: 'Agreed, Apollo Framework is the right choice.' },
        ],
        cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 } },
      };
      const json = formatDiscussionResultJson(result, '/tmp/log.jsonl', 'sess-grounded');
      expect(Array.isArray(json.judge_coinage)).toBe(true);
      expect(json.judge_coinage).toEqual([]);
    });

    // Test 2: coined run — judge_coinage contains the coined phrase
    it('AUDIT-06 coined-run JSON: judge_coinage contains Benthic Protocol', () => {
      const result = {
        task: 'phase 20 audit06 coined',
        solution: 'Deploy the Benthic Protocol in coordination with the team.',
        consensusReached: true,
        rounds: 2,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        conversationHistory: [
          { role: 'assistant', speaker: 'Alice', content: 'We should focus on deep-sea mining.' },
          { role: 'assistant', speaker: 'Bob', content: 'Agreed — the seabed approach is sound.' },
        ],
        cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 } },
      };
      const json = formatDiscussionResultJson(result, '/tmp/log.jsonl', 'sess-coined');
      expect(Array.isArray(json.judge_coinage)).toBe(true);
      expect(json.judge_coinage).toContain('Benthic Protocol');
    });

    // Test 3: non-regression SC#5 — all pre-existing top-level fields preserved
    it('AUDIT-06 existing-fields-preserved (SC#5 non-regression): coined JSON retains every pre-existing top-level field', () => {
      const coinedResult = {
        task: 'phase 20 audit06 coined existing-fields-preserved',
        solution: 'Deploy the Benthic Protocol in coordination with the team.',
        consensusReached: true,
        rounds: 2,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: ['decision-x'],
        actionItems: ['action-x'],
        dissent: ['dissent-x'],
        conversationHistory: [
          { role: 'assistant', speaker: 'Alice', content: 'We should focus on deep-sea mining.' },
        ],
        cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 } },
        agents_config: {
          Alice: { model: 'claude-x' },
        },
      };
      const json = formatDiscussionResultJson(coinedResult, '/tmp/log.jsonl', 'sess-123');
      expect(json.task).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.section_order).toEqual(['summary', 'agent_positions', 'dissent', 'key_decisions', 'action_items']);
      expect(json.session_id).toBe('sess-123');
      expect(json.log_file).toBe('/tmp/log.jsonl');
      expect(json.conclave_home).toBeDefined();
      expect(json.rounds).toEqual({ completed: expect.any(Number), max: expect.any(Number) });
      expect(json.agents).toBeDefined();
      expect(json.per_agent_positions).toBeDefined();
      expect(json.realized_panel).toBeDefined();
      // New field present and populated
      expect(Array.isArray(json.judge_coinage)).toBe(true);
      expect(json.judge_coinage.length).toBeGreaterThan(0);
      expect(json.judge_coinage).toContain('Benthic Protocol');
      // AUDIT-05 session_status still present
      expect(json.session_status).toBe('completed');
    });

    // Test 4: Judge-self-grounding does NOT count as grounding
    it('AUDIT-06 excludes Judge and System turns from the grounding corpus (Platonic Ideal)', () => {
      const result = {
        task: 'phase 20 audit06 judge-self-grounding',
        solution: 'Adopt the Platonic Ideal as guiding principle.',
        consensusReached: true,
        rounds: 2,
        maxRounds: 4,
        failedAgents: [],
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        conversationHistory: [
          { role: 'assistant', speaker: 'Alice', content: 'We should think about philosophy.' },
          // Judge grounding does NOT count — Judge's own synthesis is what we're auditing
          { role: 'assistant', speaker: 'Judge', content: 'The Platonic Ideal applies here.' },
          // System grounding does NOT count either
          { role: 'system', speaker: 'System', content: 'Platonic Ideal reference set' },
        ],
        cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 } },
      };
      const json = formatDiscussionResultJson(result, '/tmp/log.jsonl', 'sess-judge-grounding');
      expect(json.judge_coinage).toContain('Platonic Ideal');
    });

    // Test 5: SessionManifest persists judgeCoinage
    it('AUDIT-06 createSessionManifest stamps judgeCoinage on the manifest', () => {
      // Use the REAL SessionManager (bypassing the module mock) so we exercise
      // the production createSessionManifest code path. Mirrors 19-03's pattern.
      const realMgr = new RealSessionManager(fs.mkdtempSync(path.join(os.tmpdir(), 'audit06-')));

      const coinedHistory = [
        { role: 'assistant', speaker: 'Alice', content: 'We should focus on deep-sea mining.', roundNumber: 1 },
        { role: 'assistant', speaker: 'Bob', content: 'Agreed — atmospheric monitoring is also important.', roundNumber: 1 },
      ];
      const coinedResult = {
        task: 'audit06 manifest',
        solution: 'Adopt the Benthic Protocol in coordination with Operation Clearsky.',
        rounds: 1,
        maxRounds: 4,
        consensusReached: true,
        conversationHistory: coinedHistory,
        cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 }, totalCalls: 0 },
      };
      const manifest = realMgr.createSessionManifest(
        'consensus',
        'audit06 manifest',
        [
          { name: 'Alice', model: 'claude-x', provider: { constructor: { name: 'ClaudeProvider' } }, systemPrompt: '' },
          { name: 'Bob', model: 'gpt-x', provider: { constructor: { name: 'OpenAIProvider' } }, systemPrompt: '' },
        ],
        coinedHistory,
        coinedResult,
        undefined,
        undefined
      );
      expect(Array.isArray(manifest.judgeCoinage)).toBe(true);
      expect(manifest.judgeCoinage).toContain('Benthic Protocol');
      expect(manifest.judgeCoinage).toContain('Operation Clearsky');

      // And grounded run yields empty array
      const groundedHistory = [
        { role: 'assistant', speaker: 'Alice', content: 'Apollo Framework is battle-tested.', roundNumber: 1 },
      ];
      const groundedResult = {
        task: 'audit06 grounded manifest',
        solution: 'Adopt the Apollo Framework.',
        rounds: 1,
        maxRounds: 4,
        consensusReached: true,
        conversationHistory: groundedHistory,
        cost: { totalCost: 0.01, totalTokens: { input: 10, output: 20 }, totalCalls: 0 },
      };
      const groundedManifest = realMgr.createSessionManifest(
        'consensus',
        'audit06 grounded manifest',
        [{ name: 'Alice', model: 'claude-x', provider: { constructor: { name: 'ClaudeProvider' } }, systemPrompt: '' }],
        groundedHistory,
        groundedResult,
        undefined,
        undefined
      );
      expect(Array.isArray(groundedManifest.judgeCoinage)).toBe(true);
      expect(groundedManifest.judgeCoinage).toEqual([]);
    });
  });

  describe('Phase 21 — REPLAY-01/02 show_turns inline turn delivery', () => {
    beforeEach(() => { jest.restoreAllMocks(); });

    // Shared fixture: result object with a conversationHistory containing
    // System + agent + Judge turns — mirrors what ConversationManager produces.
    function buildResultWithHistory() {
      return {
        task: 'phase 21 replay-01 test',
        solution: 'Synthesis text grounded in positions A and B',
        consensusReached: true,
        rounds: 2,
        maxRounds: 4,
        failedAgents: [],
        failedAgentDetails: {},
        agentSubstitutions: {},
        keyDecisions: [],
        actionItems: [],
        dissent: [],
        agents_config: {},
        conversationHistory: [
          { role: 'user', content: 'task', speaker: 'System', roundNumber: 0, timestamp: '2026-04-17T12:00:00Z' },
          { role: 'assistant', content: 'Position A', speaker: 'SecurityExpert', model: 'claude-sonnet-4-5', roundNumber: 1, timestamp: '2026-04-17T12:01:00Z' },
          { role: 'assistant', content: 'Position B', speaker: 'Architect', model: 'gpt-4o', roundNumber: 1, timestamp: '2026-04-17T12:02:00Z' },
          { role: 'assistant', content: 'Round 2 guidance', speaker: 'Judge', model: 'gemini-2.5-flash', roundNumber: 1, timestamp: '2026-04-17T12:03:00Z' },
          { role: 'assistant', content: 'Refined A', speaker: 'SecurityExpert', model: 'claude-sonnet-4-5', roundNumber: 2, timestamp: '2026-04-17T12:04:00Z' },
        ],
        cost: { totalCost: 0.02, totalTokens: { input: 100, output: 200 } },
      };
    }

    // --- Test 1: discuss inputSchema advertises show_turns (REPLAY-01) ---
    it('REPLAY-01 llm_conclave_discuss inputSchema advertises show_turns: boolean default false', async () => {
      mockSetRequestHandler.mockClear();
      createServer();
      const listToolsHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'ListToolsRequestSchema'
      )?.[1];
      const { tools } = await listToolsHandler();
      const discussTool = tools.find((t: any) => t.name === 'llm_conclave_discuss');
      expect(discussTool).toBeDefined();
      expect(discussTool.inputSchema.properties.show_turns).toBeDefined();
      expect(discussTool.inputSchema.properties.show_turns.type).toBe('boolean');
      expect(discussTool.inputSchema.properties.show_turns.default).toBe(false);
      // Must not be required (opt-in flag)
      expect(discussTool.inputSchema.required || []).not.toContain('show_turns');
    });

    // --- Test 2: continue inputSchema advertises show_turns (REPLAY-02) ---
    it('REPLAY-02 llm_conclave_continue inputSchema advertises show_turns: boolean default false', async () => {
      mockSetRequestHandler.mockClear();
      createServer();
      const listToolsHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'ListToolsRequestSchema'
      )?.[1];
      const { tools } = await listToolsHandler();
      const continueTool = tools.find((t: any) => t.name === 'llm_conclave_continue');
      expect(continueTool).toBeDefined();
      expect(continueTool.inputSchema.properties.show_turns).toBeDefined();
      expect(continueTool.inputSchema.properties.show_turns.type).toBe('boolean');
      expect(continueTool.inputSchema.properties.show_turns.default).toBe(false);
      expect(continueTool.inputSchema.required || []).not.toContain('show_turns');
    });

    // --- Test 3: consult explicitly NOT advertised (scope-exclusion) ---
    it('REPLAY-01 llm_conclave_consult inputSchema does NOT advertise show_turns (scope-excluded — markdown-only tool)', async () => {
      mockSetRequestHandler.mockClear();
      createServer();
      const listToolsHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'ListToolsRequestSchema'
      )?.[1];
      const { tools } = await listToolsHandler();
      const consultTool = tools.find((t: any) => t.name === 'llm_conclave_consult');
      expect(consultTool).toBeDefined();
      expect(consultTool.inputSchema.properties.show_turns).toBeUndefined();
    });

    // --- Test 4: opt-out default — 3-arg call omits turns key ---
    it('REPLAY-01 formatDiscussionResultJson(3-arg) returns no turns key (back-compat)', () => {
      const json = formatDiscussionResultJson(buildResultWithHistory(), '/tmp/log.jsonl', 'sess-1');
      expect('turns' in json).toBe(false);
      expect((json as any).turns).toBeUndefined();
    });

    // --- Test 5: explicit showTurns: false — omits turns key ---
    it('REPLAY-01 formatDiscussionResultJson with { showTurns: false } returns no turns key', () => {
      const json = (formatDiscussionResultJson as any)(buildResultWithHistory(), '/tmp/log.jsonl', 'sess-1', { showTurns: false });
      expect('turns' in json).toBe(false);
      expect((json as any).turns).toBeUndefined();
    });

    // --- Test 6: opt-in — turns[] mirrors conversationHistory ---
    it('REPLAY-01 formatDiscussionResultJson with { showTurns: true } returns turns[] mirroring conversationHistory', () => {
      const result = buildResultWithHistory();
      const json = (formatDiscussionResultJson as any)(result, '/tmp/log.jsonl', 'sess-1', { showTurns: true });
      expect(Array.isArray((json as any).turns)).toBe(true);
      expect((json as any).turns.length).toBe(result.conversationHistory.length);
      // First entry (System welcome / user task) — round 0, role user, speaker System
      const first = (json as any).turns[0];
      expect(first.round).toBe(0);
      expect(first.role).toBe('user');
      expect(first.speaker).toBe('System');
      expect(first.content).toBe('task');
      expect(first.timestamp).toBe('2026-04-17T12:00:00Z');
      // Second entry — SecurityExpert assistant turn with model
      const second = (json as any).turns[1];
      expect(second.round).toBe(1);
      expect(second.role).toBe('assistant');
      expect(second.speaker).toBe('SecurityExpert');
      expect(second.model).toBe('claude-sonnet-4-5');
      expect(second.content).toBe('Position A');
      // Fourth entry — Judge turn is INCLUDED (not filtered)
      const judgeTurn = (json as any).turns[3];
      expect(judgeTurn.speaker).toBe('Judge');
      expect(judgeTurn.model).toBe('gemini-2.5-flash');
    });

    // --- Test 7: REPLAY-02 sandbox-safety pin — opt-in works with non-existent log path ---
    it('REPLAY-02 formatDiscussionResultJson with { showTurns: true } does NOT read log file from disk (sandbox-safety)', () => {
      const bogusPath = `/tmp/does-not-exist-${Date.now()}-${Math.random()}.jsonl`;
      expect(fs.existsSync(bogusPath)).toBe(false);
      const result = buildResultWithHistory();
      // Must not throw — proves no fs read happens on the opt-in branch
      const json = (formatDiscussionResultJson as any)(result, bogusPath, 'sess-sandbox', { showTurns: true });
      expect(Array.isArray((json as any).turns)).toBe(true);
      expect((json as any).turns.length).toBe(result.conversationHistory.length);
      expect((json as any).log_file).toBe(bogusPath);
    });

    // --- Test 8: SC#2 non-regression — every pre-Phase-21 top-level field preserved on opt-out ---
    it('REPLAY-01 SC#2 opt-out JSON shape is byte-stable (all pre-Phase-21 top-level fields present, turns absent)', () => {
      const result = buildResultWithHistory();
      // Enrich result with fields that drive every pre-existing top-level key
      (result as any).keyDecisions = ['decision-x'];
      (result as any).actionItems = ['action-x'];
      (result as any).dissent = ['dissent-x'];
      (result as any).agents_config = { SecurityExpert: { model: 'claude-sonnet-4-5' } };
      (result as any).finalConfidence = 'HIGH';
      (result as any).confidenceReasoning = 'strong consensus';
      const json: any = formatDiscussionResultJson(result, '/tmp/log.jsonl', 'sess-optout');
      // Every pre-Phase-21 top-level key must exist
      expect(json).toHaveProperty('task');
      expect(json).toHaveProperty('summary');
      expect(json).toHaveProperty('realized_panel');
      expect(json).toHaveProperty('key_decisions');
      expect(json).toHaveProperty('action_items');
      expect(json).toHaveProperty('dissent');
      expect(json).toHaveProperty('confidence');
      expect(json).toHaveProperty('final_confidence');
      expect(json).toHaveProperty('consensus_reached');
      expect(json).toHaveProperty('rounds');
      expect(json).toHaveProperty('agents');
      expect(json).toHaveProperty('per_agent_positions');
      expect(json).toHaveProperty('section_order');
      expect(json).toHaveProperty('judge_coinage');
      expect(json).toHaveProperty('session_id');
      expect(json).toHaveProperty('log_file');
      expect(json).toHaveProperty('session_status');
      expect(json).toHaveProperty('conclave_home');
      // Values unchanged
      expect(json.task).toBe('phase 21 replay-01 test');
      expect(json.key_decisions).toEqual(['decision-x']);
      expect(json.action_items).toEqual(['action-x']);
      expect(json.dissent).toEqual(['dissent-x']);
      expect(json.confidence).toBe('high');
      expect(json.final_confidence).toBe('HIGH');
      expect(json.consensus_reached).toBe(true);
      expect(json.session_id).toBe('sess-optout');
      expect(json.log_file).toBe('/tmp/log.jsonl');
      // turns must be ABSENT (not null, not [])
      expect('turns' in json).toBe(false);
      expect(json.turns).toBeUndefined();
    });

    // --- Test 9: Judge + System included (not filtered like judge_coinage grounding) ---
    it('REPLAY-01 turns[] includes Judge and System turns (no filtering — full replay)', () => {
      const result = buildResultWithHistory();
      const json: any = (formatDiscussionResultJson as any)(result, '/tmp/log.jsonl', 'sess-filter', { showTurns: true });
      const speakers = json.turns.map((t: any) => t.speaker);
      expect(speakers).toContain('System');
      expect(speakers).toContain('Judge');
      expect(speakers).toContain('SecurityExpert');
      expect(speakers).toContain('Architect');
      // Length equals the full history
      expect(json.turns.length).toBe(result.conversationHistory.length);
    });

    // --- Test 10: E2E handler-level test — handleDiscuss with show_turns: true surfaces turns[] in response ---
    it('REPLAY-01 E2E handleDiscuss with show_turns: true emits turns[] in JSON response body', async () => {
      const ConversationManager = require('../../core/ConversationManager').default;
      const SessionManager = require('../../core/SessionManager').default;
      SessionManager.mockImplementation(() => ({
        createSessionManifest: jest.fn().mockReturnValue({ id: 'session-e2e-replay' }),
        saveSession: jest.fn().mockResolvedValue('session-e2e-replay'),
      }));
      const localFs = require('fs');
      jest.spyOn(localFs, 'existsSync').mockReturnValue(true);
      jest.spyOn(localFs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(localFs, 'mkdirSync').mockImplementation(() => {});

      const fixture = buildResultWithHistory();
      ConversationManager.mockImplementation(() => ({
        conversationHistory: [],
        currentRound: 1,
        abortSignal: undefined,
        startConversation: jest.fn().mockResolvedValue(fixture),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: {
          name: 'llm_conclave_discuss',
          arguments: { task: 'test task', format: 'json', show_turns: true },
        },
      });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(Array.isArray(parsed.turns)).toBe(true);
      expect(parsed.turns.length).toBe(fixture.conversationHistory.length);
      // First entry shape validated
      const first = parsed.turns[0];
      expect(first).toHaveProperty('round');
      expect(first).toHaveProperty('role');
      expect(first).toHaveProperty('speaker');
      expect(first).toHaveProperty('content');
    });
  });

  describe('Phase 21 — REPLAY-03 substitution-rate telemetry', () => {
    // Strategy: for tests 1-4 and 6, seed SessionSummary[] directly via the
    // module-mocked SessionManager.listSessions — matches the Phase 20
    // AUDIT-05 handleStatus pattern (plain-object mock return). For Test 5
    // (back-compat), seed SessionSummary entries with NO `substituted` field
    // (the `substituted: undefined` case that simulates pre-Phase-21 data
    // read back through listSessions unchanged).

    // SessionSummary fixture builder (post-Phase-21 shape; `substituted` explicit).
    function buildSummary(overrides: {
      id: string;
      substituted: boolean;
      timestamp?: string;
    }): any {
      return {
        id: overrides.id,
        timestamp: overrides.timestamp || '2026-04-17T12:00:00Z',
        mode: 'consensus',
        task: 'replay-03 fixture task',
        status: 'completed',
        roundCount: 2,
        agentCount: 2,
        cost: 0.01,
        consensusReached: true,
        substituted: overrides.substituted,
      };
    }

    // Pre-Phase-21 SessionSummary fixture (NO `substituted` field at all).
    // Serialized + deserialized JSON on disk without the field produces this
    // shape in memory; we construct it explicitly to pin the back-compat path.
    function buildLegacySummary(overrides: { id: string; timestamp?: string }): any {
      return {
        id: overrides.id,
        timestamp: overrides.timestamp || '2026-03-01T10:00:00Z',
        mode: 'consensus',
        task: 'legacy task',
        status: 'completed',
        roundCount: 2,
        agentCount: 2,
        cost: 0.01,
        consensusReached: true,
        // NOTE: `substituted` intentionally absent — simulates pre-Phase-21 persisted data.
      };
    }

    beforeEach(() => {
      // Phase 18 pattern: prior COST-02 tests install jest.spyOn on
      // fs.writeFileSync / mkdirSync / existsSync without restoring — restore
      // them here so Test 5's direct manifest.json write actually hits disk.
      jest.restoreAllMocks();
      mockReadStatus.mockReturnValue(null); // force status to fall through to last-completed branch
    });

    // --- Test 1: handleStatus — zero substitution across 3 sessions ---
    it('REPLAY-03 handleStatus renders 0/3 (0%) when no recent session has substitutions', async () => {
      const SessionManagerModule = require('../../core/SessionManager').default;
      SessionManagerModule.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([
          buildSummary({ id: 's-clean-1', substituted: false }),
          buildSummary({ id: 's-clean-2', substituted: false }),
          buildSummary({ id: 's-clean-3', substituted: false }),
        ]),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: { name: 'llm_conclave_status', arguments: {} },
      });
      expect(response.isError).toBeUndefined();
      const text = response.content[0].text;
      expect(text).toContain('No Active Discussion');
      expect(text).toContain('**Substitution rate:** 0/3 (0%) across recent 3 sessions');
    });

    // --- Test 2: handleStatus — partial substitution (2 of 5) ---
    it('REPLAY-03 handleStatus renders 2/5 (40%) when 2 of 5 recent sessions substituted', async () => {
      const SessionManagerModule = require('../../core/SessionManager').default;
      SessionManagerModule.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([
          buildSummary({ id: 's-p5', substituted: false }),
          buildSummary({ id: 's-p4', substituted: true }),
          buildSummary({ id: 's-p3', substituted: false }),
          buildSummary({ id: 's-p2', substituted: true }),
          buildSummary({ id: 's-p1', substituted: false }),
        ]),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: { name: 'llm_conclave_status', arguments: {} },
      });
      expect(response.isError).toBeUndefined();
      const text = response.content[0].text;
      expect(text).toContain('**Substitution rate:** 2/5 (40%) across recent 5 sessions');
    });

    // --- Test 3: handleStatus — all 3 substituted ---
    it('REPLAY-03 handleStatus renders 3/3 (100%) when every recent session substituted', async () => {
      const SessionManagerModule = require('../../core/SessionManager').default;
      SessionManagerModule.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([
          buildSummary({ id: 's-all-1', substituted: true }),
          buildSummary({ id: 's-all-2', substituted: true }),
          buildSummary({ id: 's-all-3', substituted: true }),
        ]),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: { name: 'llm_conclave_status', arguments: {} },
      });
      expect(response.isError).toBeUndefined();
      const text = response.content[0].text;
      expect(text).toContain('**Substitution rate:** 3/3 (100%) across recent 3 sessions');
    });

    // --- Test 4: handleSessions — header renders rate across listed sessions ---
    it('REPLAY-03 handleSessions header renders 1/4 (25%) across listed sessions with intro line preserved', async () => {
      const SessionManagerModule = require('../../core/SessionManager').default;
      SessionManagerModule.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([
          buildSummary({ id: 's-list-1', substituted: false }),
          buildSummary({ id: 's-list-2', substituted: false }),
          buildSummary({ id: 's-list-3', substituted: true }),
          buildSummary({ id: 's-list-4', substituted: false }),
        ]),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: { name: 'llm_conclave_sessions', arguments: { limit: 10 } },
      });
      expect(response.isError).toBeUndefined();
      const text = response.content[0].text;
      expect(text).toContain('**Substitution rate:** 1/4 (25%) across listed sessions');
      // Ordering pin: intro line sits immediately above the rate line.
      const introIdx = text.indexOf('Use `llm_conclave_continue`');
      const rateIdx = text.indexOf('**Substitution rate:**');
      expect(introIdx).toBeGreaterThan(-1);
      expect(rateIdx).toBeGreaterThan(introIdx);
    });

    // --- Test 5: back-compat — pre-Phase-21 SessionSummary entries without substituted field ---
    it('REPLAY-03 handleSessions counts pre-Phase-21 summaries (missing substituted field) as NOT substituted', async () => {
      // Write manifest.json directly via fs.writeFileSync to a tmpDir, then
      // read it back through a RealSessionManager to prove the round-trip
      // (pre-Phase-21 persisted data → in-memory SessionSummary without the
      // substituted field → computeSubstitutionRate returns 0/N). This pins
      // the on-disk back-compat guarantee separately from the in-memory
      // undefined case already pinned by Plan 21-02's tests.
      const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase21-replay03-legacy-'));
      const manifestPath = path.join(baseDir, 'manifest.json');
      const prePhase21Manifest = {
        sessions: [
          buildLegacySummary({ id: 's-legacy-1', timestamp: '2026-03-01T10:00:00Z' }),
          buildLegacySummary({ id: 's-legacy-2', timestamp: '2026-03-01T11:00:00Z' }),
        ],
        totalSessions: 2,
      };
      fs.writeFileSync(manifestPath, JSON.stringify(prePhase21Manifest, null, 2));
      // Sanity: the persisted manifest must lack the substituted field.
      const readBack = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(Object.prototype.hasOwnProperty.call(readBack.sessions[0], 'substituted')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(readBack.sessions[1], 'substituted')).toBe(false);

      const real = new RealSessionManager(baseDir);
      const SessionManagerModule = require('../../core/SessionManager').default;
      SessionManagerModule.mockImplementation(() => real);

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: { name: 'llm_conclave_sessions', arguments: { limit: 10 } },
      });
      expect(response.isError).toBeUndefined();
      const text = response.content[0].text;
      expect(text).toContain('**Substitution rate:** 0/2 (0%) across listed sessions');
    });

    // --- Test 6: SC#2 non-regression — handleStatus existing lines preserved in order ---
    it('REPLAY-03 SC#2 non-regression: handleStatus preserves every pre-existing markdown line in order', async () => {
      const SessionManagerModule = require('../../core/SessionManager').default;
      SessionManagerModule.mockImplementation(() => ({
        listSessions: jest.fn().mockResolvedValue([
          buildSummary({ id: 's-nonreg-1', substituted: true }),
        ]),
      }));

      mockSetRequestHandler.mockClear();
      createServer();
      const callToolHandler = mockSetRequestHandler.mock.calls.find(
        (call: any) => call[0] === 'CallToolRequestSchema'
      )?.[1];

      const response = await callToolHandler({
        params: { name: 'llm_conclave_status', arguments: {} },
      });
      expect(response.isError).toBeUndefined();
      const text = response.content[0].text;
      // Every pre-existing line present
      expect(text).toContain('**Task:**');
      expect(text).toContain('**Completed:**');
      expect(text).toContain('**Consensus:**');
      expect(text).toContain('**Status:**');
      expect(text).toContain('**Rounds:**');
      expect(text).toContain('**Conclave home:**');
      // Ordering: Task → Completed → Consensus → Status → Substitution rate → Rounds → Conclave home
      const idxTask = text.indexOf('**Task:**');
      const idxCompleted = text.indexOf('**Completed:**');
      const idxConsensus = text.indexOf('**Consensus:**');
      const idxStatus = text.indexOf('**Status:**');
      const idxSubRate = text.indexOf('**Substitution rate:**');
      const idxRounds = text.indexOf('**Rounds:**');
      const idxConclave = text.indexOf('**Conclave home:**');
      expect(idxTask).toBeGreaterThan(-1);
      expect(idxCompleted).toBeGreaterThan(idxTask);
      expect(idxConsensus).toBeGreaterThan(idxCompleted);
      expect(idxStatus).toBeGreaterThan(idxConsensus);
      expect(idxSubRate).toBeGreaterThan(idxStatus);
      expect(idxRounds).toBeGreaterThan(idxSubRate);
      expect(idxConclave).toBeGreaterThan(idxRounds);
    });
  });
});

