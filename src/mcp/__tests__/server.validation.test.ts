// Mock all heavy dependencies before importing to prevent server startup
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({ Server: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({ SSEServerTransport: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: {},
  ListToolsRequestSchema: {},
}));
jest.mock('express', () => {
  const mockApp = { get: jest.fn(), post: jest.fn(), use: jest.fn() };
  return jest.fn(() => mockApp);
});
jest.mock('../../orchestration/ConsultOrchestrator.js', () => jest.fn());
jest.mock('../../core/ConversationManager.js', () => jest.fn());
jest.mock('../../core/EventBus.js', () => ({ EventBus: { createInstance: jest.fn() } }));
jest.mock('../../core/SessionManager.js', () => jest.fn());
jest.mock('../../core/ContinuationHandler.js', () => jest.fn());
jest.mock('../../providers/ProviderFactory.js', () => ({ default: { createProvider: jest.fn() } }));
jest.mock('../../utils/ProjectContext.js', () => jest.fn());
jest.mock('../../utils/ConsultLogger.js', () => jest.fn());
jest.mock('../../config/ConfigCascade.js', () => ({ ConfigCascade: { resolve: jest.fn() } }));
jest.mock('../../config/PersonaSystem.js', () => ({ PersonaSystem: { getPersonas: jest.fn(), personasToAgents: jest.fn() } }));
jest.mock('../../consult/formatting/FormatterFactory.js', () => ({ FormatterFactory: { format: jest.fn() } }));
jest.mock('../../consult/context/ContextLoader.js', () => {
  const actual = jest.requireActual('../../consult/context/ContextLoader.js');
  return {
    ContextLoader: jest.fn(),
    parseExtraContextRoots: actual.parseExtraContextRoots,
    isPathWithinRoots: actual.isPathWithinRoots,
  };
});
jest.mock('../../constants.js', () => ({ DEFAULT_SELECTOR_MODEL: 'gpt-4o-mini' }));
jest.mock('../../types/consult.js', () => ({}));

// Prevent process.exit from killing the test runner (main() runs on import)
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

import { validatePath } from '../server';
import * as path from 'path';

describe('validatePath', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  it('rejects paths with null bytes', () => {
    expect(() => {
      validatePath('test\0file', '/home/user');
    }).toThrow('Invalid path (null byte detected)');
  });

  it('rejects path traversal attempts', () => {
    expect(() => {
      validatePath('../../../etc/passwd', '/home/user/project');
    }).toThrow('Path escapes allowed directory');
  });

  it('uses HOME as base when baseDir is "/" — allows paths under HOME', () => {
    process.env.HOME = '/home/testuser';
    // path.resolve('/', 'home/testuser/file.txt') = /home/testuser/file.txt
    // effectiveBase = HOME = /home/testuser
    const result = validatePath('home/testuser/file.txt', '/');
    expect(result).toBe(path.resolve('/', 'home/testuser/file.txt'));
  });

  it('uses HOME as base when baseDir is empty string', () => {
    process.env.HOME = '/home/testuser';
    // When baseDir is empty, effectiveBase = HOME
    // path.resolve('', 'subdir/file.txt') resolves to cwd + subdir/file.txt
    // For this test, use an absolute path under HOME
    const result = validatePath('/home/testuser/docs/file.txt', '');
    expect(result).toBe('/home/testuser/docs/file.txt');
  });

  it('accepts valid subpath', () => {
    const result = validatePath('src/index.ts', '/home/user/project');
    expect(result).toBe(path.resolve('/home/user/project', 'src/index.ts'));
  });

  it('accepts absolute path within baseDir', () => {
    const result = validatePath('/home/user/project/src/index.ts', '/home/user/project');
    expect(result).toBe('/home/user/project/src/index.ts');
  });

  it('rejects absolute path outside baseDir', () => {
    expect(() => {
      validatePath('/etc/passwd', '/home/user/project');
    }).toThrow('Path escapes allowed directory');
  });

  describe('CONCLAVE_ALLOWED_CONTEXT_ROOTS allowlist', () => {
    const originalTransport = process.env.CONCLAVE_TRANSPORT;
    const originalRoots = process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS;

    afterEach(() => {
      if (originalTransport === undefined) {
        delete process.env.CONCLAVE_TRANSPORT;
      } else {
        process.env.CONCLAVE_TRANSPORT = originalTransport;
      }
      if (originalRoots === undefined) {
        delete process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS;
      } else {
        process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS = originalRoots;
      }
    });

    it('accepts a path under an env-allowed root when transport is stdio', () => {
      process.env.CONCLAVE_TRANSPORT = 'stdio';
      process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS = '/home/user/other';
      const result = validatePath('/home/user/other/spec.md', '/home/user/project');
      expect(result).toBe('/home/user/other/spec.md');
    });

    it('rejects a path under an env-allowed root when transport is sse (fail-closed)', () => {
      process.env.CONCLAVE_TRANSPORT = 'sse';
      process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS = '/home/user/other';
      expect(() => {
        validatePath('/home/user/other/spec.md', '/home/user/project');
      }).toThrow('Path escapes allowed directory');
    });

    it('rejects a path under an env-allowed root when transport is unset (fail-closed)', () => {
      delete process.env.CONCLAVE_TRANSPORT;
      process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS = '/home/user/other';
      expect(() => {
        validatePath('/home/user/other/spec.md', '/home/user/project');
      }).toThrow('Path escapes allowed directory');
    });

    it('error message lists the allowed roots', () => {
      process.env.CONCLAVE_TRANSPORT = 'stdio';
      process.env.CONCLAVE_ALLOWED_CONTEXT_ROOTS = '/home/user/other';
      expect(() => {
        validatePath('/etc/passwd', '/home/user/project');
      }).toThrow(/allowed:/);
    });
  });
});
