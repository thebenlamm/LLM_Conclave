import IterativeCollaborativeOrchestrator from '../IterativeCollaborativeOrchestrator';
import ToolRegistry from '../../tools/ToolRegistry';
import ProviderFactory from '../../providers/ProviderFactory';
import { Agent } from '../../types';
import * as fs from 'fs';

// Mock fs to avoid filesystem writes during tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(''),
  appendFileSync: jest.fn(),
}));

// Mock ProviderFactory for fallback tests
jest.mock('../../providers/ProviderFactory', () => ({
  __esModule: true,
  default: {
    createProvider: jest.fn().mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue({ text: 'Fallback response' }),
      getProviderName: jest.fn().mockReturnValue('MockProvider'),
    })),
  },
}));

describe('IterativeCollaborativeOrchestrator - Integration Tests', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    (console.log as any).mockRestore();
    (console.error as any).mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockAgent(name: string, responses: string[], model: string = 'gpt-4o'): Agent {
    let callIndex = 0;
    return {
      name,
      model,
      provider: {
        chat: jest.fn().mockImplementation(() => {
          const text = responses[callIndex] || responses[responses.length - 1];
          callIndex++;
          return Promise.resolve({ text, usage: { input_tokens: 50, output_tokens: 100 } });
        }),
        getProviderName: jest.fn().mockReturnValue('OpenAI'),
      } as any,
      systemPrompt: `You are ${name}`,
    };
  }

  describe('Full multi-chunk processing flow', () => {
    it('should process multiple chunks with planning, discussion, evaluation, and synthesis', async () => {
      const judgeResponses = [
        // planChunks
        JSON.stringify([{ description: 'Chunk 1: Review first section', details: 'Review first section' }, { description: 'Chunk 2: Review second section', details: 'Review second section' }]),
        // judgeEvaluateChunk for chunk 1 — COMPLETE: prefix
        'COMPLETE: Chunk 1 reviewed successfully',
        // judgeEvaluateChunk for chunk 2 — COMPLETE: prefix
        'COMPLETE: Chunk 2 reviewed successfully',
      ];

      const judge = createMockAgent('Judge', judgeResponses);
      const agent1 = createMockAgent('Agent1', ['Agent1 analysis for chunk']);
      const agent2 = createMockAgent('Agent2', ['Agent2 analysis for chunk']);

      const toolRegistry = new ToolRegistry();
      const orchestrator = new IterativeCollaborativeOrchestrator(
        [agent1, agent2],
        judge,
        toolRegistry,
        { chunkSize: 1, maxRoundsPerChunk: 1, outputDir: '/tmp/test' }
      );

      await orchestrator.run('Review the document');

      // Assert judge was called for planning(1) + evaluation(2) = 3
      // (COMPLETE: returns result directly, no separate synthesis needed)
      expect(judge.provider.chat).toHaveBeenCalledTimes(3);

      // Assert agents were called once per chunk = 2 calls each
      expect(agent1.provider.chat).toHaveBeenCalledTimes(2);
      expect(agent2.provider.chat).toHaveBeenCalledTimes(2);

      // Assert shared output file was written
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('Multi-turn discussion within a chunk', () => {
    it('should continue discussion when judge indicates incomplete, then stop when complete', async () => {
      const judgeResponses = [
        // planChunks
        JSON.stringify([{ description: 'Single chunk task', details: 'Complete the task' }]),
        // judgeEvaluateChunk - round 1: not complete (CONTINUE: prefix)
        'CONTINUE: Need more discussion on the topic',
        // judgeEvaluateChunk - round 2: complete (COMPLETE: prefix)
        'COMPLETE: Final result after discussion',
      ];

      const judge = createMockAgent('Judge', judgeResponses);
      const agent1 = createMockAgent('Agent1', [
        'Agent1 round 1 response',
        'Agent1 round 2 response building on previous',
      ]);
      const agent2 = createMockAgent('Agent2', [
        'Agent2 round 1 response',
        'Agent2 round 2 response building on previous',
      ]);

      const toolRegistry = new ToolRegistry();
      const orchestrator = new IterativeCollaborativeOrchestrator(
        [agent1, agent2],
        judge,
        toolRegistry,
        { chunkSize: 1, maxRoundsPerChunk: 5, outputDir: '/tmp/test' }
      );

      await orchestrator.run('Complete this task');

      // Assert agents spoke twice (2 rounds of discussion)
      expect(agent1.provider.chat).toHaveBeenCalledTimes(2);
      expect(agent2.provider.chat).toHaveBeenCalledTimes(2);

      // Assert judge was called: plan(1) + eval(2) = 3
      expect(judge.provider.chat).toHaveBeenCalledTimes(3);
    });
  });

  describe('Agent failure mid-chunk uses fallback', () => {
    it('should use fallback provider when agent fails and continue processing', async () => {
      const judgeResponses = [
        JSON.stringify([{ description: 'Single chunk', details: 'Process the chunk' }]),
        'COMPLETE: Processing done',
      ];

      const judge = createMockAgent('Judge', judgeResponses);

      // Agent1 fails on first call
      const agent1: Agent = {
        name: 'Agent1',
        model: 'gpt-4o',
        provider: {
          chat: jest.fn().mockRejectedValue(new Error('Provider timeout')),
          getProviderName: jest.fn().mockReturnValue('OpenAI'),
        } as any,
        systemPrompt: 'You are Agent1',
      };

      const agent2 = createMockAgent('Agent2', ['Agent2 response']);

      const toolRegistry = new ToolRegistry();
      const orchestrator = new IterativeCollaborativeOrchestrator(
        [agent1, agent2],
        judge,
        toolRegistry,
        { chunkSize: 1, maxRoundsPerChunk: 1, outputDir: '/tmp/test' }
      );

      // Should not throw — fallback provider is used
      await orchestrator.run('Task that causes failure');

      // Assert ProviderFactory.createProvider was called for fallback
      expect(ProviderFactory.createProvider).toHaveBeenCalled();
    });
  });

  describe('Resume from specific chunk', () => {
    it('should skip chunks before startChunk and only process remaining chunks', async () => {
      const judgeResponses = [
        // planChunks — plans 3 chunks
        JSON.stringify([{ description: 'Chunk 0', details: 'Process chunk 0' }, { description: 'Chunk 1', details: 'Process chunk 1' }, { description: 'Chunk 2', details: 'Process chunk 2' }]),
        // Evaluation for chunk 2 (skipped chunk 0 and 1)
        'COMPLETE: Chunk 2 done',
        // Evaluation for chunk 3
        'COMPLETE: Chunk 3 done',
      ];

      const judge = createMockAgent('Judge', judgeResponses);
      const agent1 = createMockAgent('Agent1', ['Agent1 response']);

      const toolRegistry = new ToolRegistry();
      const orchestrator = new IterativeCollaborativeOrchestrator(
        [agent1],
        judge,
        toolRegistry,
        { chunkSize: 1, maxRoundsPerChunk: 1, startChunk: 2, outputDir: '/tmp/test' }
      );

      await orchestrator.run('Process from chunk 2');

      // Agent should be called only 2 times (chunks 2 and 3, chunk 1 skipped)
      expect(agent1.provider.chat).toHaveBeenCalledTimes(2);

      // Should append resume marker
      expect(fs.appendFileSync).toHaveBeenCalled();
    });
  });

  describe('Single chunk with tool calls', () => {
    it('should handle agent tool calls via ToolRegistry during discussion', async () => {
      const judgeResponses = [
        JSON.stringify([{ description: 'Analyze file', details: 'Read and analyze the file' }]),
        'COMPLETE: Analysis complete',
      ];

      const judge = createMockAgent('Judge', judgeResponses);

      // Agent responds with tool call
      const agentWithTools: Agent = {
        name: 'ToolAgent',
        model: 'claude-sonnet-4-5',
        provider: {
          chat: jest.fn()
            .mockResolvedValueOnce({
              text: '',
              tool_calls: [
                { id: 'call_1', name: 'read_file', input: { path: 'test.txt' } }
              ],
              usage: { input_tokens: 50, output_tokens: 100 }
            })
            .mockResolvedValueOnce({
              text: 'File content analyzed',
              usage: { input_tokens: 50, output_tokens: 100 }
            }),
          getProviderName: jest.fn().mockReturnValue('Anthropic'),
        } as any,
        systemPrompt: 'You are a tool-using agent',
      };

      const toolRegistry = new ToolRegistry();
      jest.spyOn(toolRegistry, 'getAnthropicTools').mockReturnValue([
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object' as const,
            properties: { path: { type: 'string', description: 'File path' } },
            required: ['path']
          }
        }
      ]);
      jest.spyOn(toolRegistry, 'executeTool').mockResolvedValue({
        success: true,
        result: 'File content here',
        summary: 'Read test.txt successfully'
      });

      const orchestrator = new IterativeCollaborativeOrchestrator(
        [agentWithTools],
        judge,
        toolRegistry,
        { chunkSize: 1, maxRoundsPerChunk: 1, outputDir: '/tmp/test' }
      );

      await orchestrator.run('Analyze the file');

      // Assert tool was executed
      expect(toolRegistry.executeTool).toHaveBeenCalledWith('read_file', { path: 'test.txt' });

      // Assert agent was called twice (once with tool call, once after tool result)
      expect(agentWithTools.provider.chat).toHaveBeenCalledTimes(2);
    });
  });

  describe('Max rounds per chunk limits discussion', () => {
    it('should stop after maxRoundsPerChunk even if judge says incomplete', async () => {
      const judgeResponses = [
        JSON.stringify([{ description: 'Single chunk', details: 'Process the chunk' }]),
        // Always say incomplete (CONTINUE: prefix)
        'CONTINUE: Not done yet, keep going',
        // judgeSynthesizeResult called after max rounds
        'Synthesis after max rounds reached',
      ];

      const judge = createMockAgent('Judge', judgeResponses);
      const agent1 = createMockAgent('Agent1', ['Agent1 response']);

      const toolRegistry = new ToolRegistry();
      const orchestrator = new IterativeCollaborativeOrchestrator(
        [agent1],
        judge,
        toolRegistry,
        { chunkSize: 1, maxRoundsPerChunk: 1, outputDir: '/tmp/test' }
      );

      await orchestrator.run('Task with max rounds limit');

      // Assert agent was called only once (maxRoundsPerChunk: 1 enforced)
      expect(agent1.provider.chat).toHaveBeenCalledTimes(1);
    });
  });
});
