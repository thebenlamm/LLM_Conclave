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
import { formatDiscussionResult } from '../server';

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
  });
});

