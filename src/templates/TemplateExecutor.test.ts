import { TemplateExecutor } from './TemplateExecutor';
import ConversationManager from '../core/ConversationManager';
import ConsultOrchestrator from '../orchestration/ConsultOrchestrator';
import IterativeCollaborativeOrchestrator from '../orchestration/IterativeCollaborativeOrchestrator';
import Orchestrator from '../orchestration/Orchestrator';
import { LoadedTemplate } from './TemplateLoader';

jest.mock('../core/ConversationManager');
jest.mock('../orchestration/ConsultOrchestrator');
jest.mock('../orchestration/IterativeCollaborativeOrchestrator');
jest.mock('../orchestration/Orchestrator');
jest.mock('../providers/ProviderFactory', () => {
  const mockProvider = {
    chat: jest.fn().mockResolvedValue({ text: '{}', usage: {} })
  };
  return {
    __esModule: true,
    default: {
      createProvider: jest.fn().mockReturnValue(mockProvider)
    }
  };
});
jest.mock('../tools/ToolRegistry');
jest.mock('../core/OutputHandler', () => ({
  saveResults: jest.fn().mockResolvedValue({}),
  printSummary: jest.fn()
}));
jest.mock('../utils/ConsultLogger', () => {
  return jest.fn().mockImplementation(() => ({
    log: jest.fn().mockResolvedValue({ jsonPath: 'path.json' })
  }));
});
jest.mock('../consult/output/OutputFormatter', () => {
    return {
        OutputFormatter: jest.fn().mockImplementation(() => ({
            formatOutput: jest.fn().mockReturnValue({ content: 'Output' })
        }))
    }
});

describe('TemplateExecutor', () => {
  let executor: TemplateExecutor;

  beforeEach(() => {
    executor = new TemplateExecutor();
    jest.clearAllMocks();
  });

  it('executes discuss mode', async () => {
    const template: LoadedTemplate = {
      name: 'test',
      description: 'test',
      mode: 'discuss',
      task: 'task',
      source: 'project',
      filePath: 'path',
      agents: [{ name: 'Agent1', model: 'gpt-4o', systemPrompt: 'prompt' }]
    };

    const mockStartConversation = jest.fn().mockResolvedValue({});
    (ConversationManager as unknown as jest.Mock).mockImplementation(() => ({
      startConversation: mockStartConversation
    }));

    await executor.execute(template, 'My Task', {});

    expect(ConversationManager).toHaveBeenCalled();
    expect(mockStartConversation).toHaveBeenCalledWith('My Task', expect.anything(), null);
  });

  it('passes provider config in discuss mode', async () => {
    const template: LoadedTemplate = {
        name: 'test',
        description: 'test',
        mode: 'discuss',
        task: 'task',
        source: 'project',
        filePath: 'path',
        agents: [{ name: 'Agent1', model: 'gpt-4o', systemPrompt: 'prompt', provider: 'openai' } as any]
    };

    const mockStartConversation = jest.fn().mockResolvedValue({});
    (ConversationManager as unknown as jest.Mock).mockImplementation((config) => {
        expect(config.agents['Agent1'].provider).toBe('openai');
        return { startConversation: mockStartConversation };
    });

    await executor.execute(template, 'My Task', {});
    expect(ConversationManager).toHaveBeenCalled();
  });

  it('executes consult mode', async () => {
    const template: LoadedTemplate = {
      name: 'test',
      description: 'test',
      mode: 'consult',
      task: 'task',
      source: 'project',
      filePath: 'path'
    };

    const mockConsult = jest.fn().mockResolvedValue({ logs: [], result: '' });
    (ConsultOrchestrator as jest.Mock).mockImplementation(() => ({
      consult: mockConsult
    }));

    await executor.execute(template, 'My Task', {});

    expect(ConsultOrchestrator).toHaveBeenCalled();
    expect(mockConsult).toHaveBeenCalled();
  });

  it('executes iterate mode', async () => {
    const template: LoadedTemplate = {
      name: 'test',
      description: 'test',
      mode: 'iterate',
      task: 'task',
      source: 'project',
      filePath: 'path',
      agents: [{ name: 'Agent1', model: 'gpt-4o', systemPrompt: 'prompt' }]
    };

    const mockRun = jest.fn().mockResolvedValue({});
    (IterativeCollaborativeOrchestrator as jest.Mock).mockImplementation(() => ({
      run: mockRun
    }));

    await executor.execute(template, 'My Task', {});

    expect(IterativeCollaborativeOrchestrator).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith('My Task', undefined);
  });

  it('executes orchestrated mode', async () => {
    const template: LoadedTemplate = {
      name: 'test',
      description: 'test',
      mode: 'orchestrated',
      task: 'task',
      source: 'project',
      filePath: 'path',
      agents: [{ name: 'Agent1', model: 'gpt-4o', systemPrompt: 'prompt' }]
    };

    const mockExecuteTask = jest.fn().mockResolvedValue({});
    (Orchestrator as jest.Mock).mockImplementation(() => ({
      executeTask: mockExecuteTask
    }));

    await executor.execute(template, 'My Task', {});

    expect(Orchestrator).toHaveBeenCalled();
    expect(mockExecuteTask).toHaveBeenCalledWith('My Task', null);
  });

  it('throws error for unknown mode', async () => {
    const template: LoadedTemplate = {
      name: 'test',
      description: 'test',
      mode: 'invalid' as any,
      task: 'task',
      source: 'project',
      filePath: 'path'
    };

    await expect(executor.execute(template, 'task', {})).rejects.toThrow('Unknown mode: invalid');
  });

  it('throws error if task is missing and not consult', async () => {
    const template: LoadedTemplate = {
      name: 'test',
      description: 'test',
      mode: 'discuss',
      task: '', // Empty
      source: 'project',
      filePath: 'path'
    };

    await expect(executor.execute(template, '', {})).rejects.toThrow('Task is required');
  });
});