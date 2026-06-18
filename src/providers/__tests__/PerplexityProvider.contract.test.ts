/**
 * Contract tests for PerplexityProvider — lock the PR-#13-review fixes:
 *   H1: streaming calls must report token usage (else paid Sonar calls log $0).
 *   M1: web sources (search_results / citations) must reach the returned text.
 * Plus baseline constructor / provider-name / tool-call behavior.
 */
const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((config: any) => {
    (global as any).__perplexityLastConfig = config;
    return { chat: { completions: { create: mockCreate } } };
  }),
}));

import PerplexityProvider, { SONAR_MODELS } from '../PerplexityProvider';
import { CostTracker } from '../../core/CostTracker';
import { Message } from '../../types';

/** Build an async-iterable the provider's `for await` loop can consume. */
function asyncStream(chunks: any[]): any {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

const MESSAGES: Message[] = [{ role: 'user', content: 'What happened today?' } as any];

describe('PerplexityProvider Contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PERPLEXITY_API_KEY: 'test-key' };
    mockCreate.mockReset();
    delete (global as any).__perplexityLastConfig;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor / identity', () => {
    it('uses the Perplexity base URL and PERPLEXITY_API_KEY', () => {
      new PerplexityProvider('sonar-pro');
      const config = (global as any).__perplexityLastConfig;
      expect(config.baseURL).toBe('https://api.perplexity.ai');
      expect(config.apiKey).toBe('test-key');
    });

    it('getProviderName returns Perplexity', () => {
      expect(new PerplexityProvider('sonar-pro').getProviderName()).toBe('Perplexity');
    });

    it('exports the known Sonar model set', () => {
      expect(SONAR_MODELS).toContain('sonar-pro');
      expect(SONAR_MODELS).toContain('sonar-deep-research');
    });
  });

  describe('H1: streaming reports usage', () => {
    it('captures token usage from the final stream chunk so cost is not logged as $0', async () => {
      mockCreate.mockResolvedValue(
        asyncStream([
          { choices: [{ delta: { content: 'Live ' } }] },
          { choices: [{ delta: { content: 'answer' } }] },
          { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 20 } },
        ])
      );
      const costTracker = new CostTracker();
      const provider = new PerplexityProvider('sonar-pro', undefined, costTracker);

      const res = await provider.chat(MESSAGES, null, { stream: true });

      expect(res.text).toContain('Live answer');
      // include_usage must have been requested.
      expect(mockCreate.mock.calls[0][0].stream_options).toEqual({ include_usage: true });
      // Usage flowed into cost tracking — the H1 regression would log zero.
      const summary = costTracker.getSummary();
      expect(summary.totalTokens).toEqual({ input: 10, output: 20 });
      expect(summary.totalCost).toBeGreaterThan(0);
    });

    it('streams tokens through onToken', async () => {
      mockCreate.mockResolvedValue(
        asyncStream([
          { choices: [{ delta: { content: 'a' } }] },
          { choices: [{ delta: { content: 'b' } }] },
          { choices: [{ delta: {} }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
        ])
      );
      const tokens: string[] = [];
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      await provider.chat(MESSAGES, null, { stream: true, onToken: t => tokens.push(t) });
      expect(tokens).toEqual(['a', 'b']);
    });

    it('appends streamed search_results as a Sources footer', async () => {
      mockCreate.mockResolvedValue(
        asyncStream([
          { choices: [{ delta: { content: 'Answer' } }] },
          {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
            search_results: [{ title: 'Example', url: 'https://example.com' }],
          },
        ])
      );
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      const res = await provider.chat(MESSAGES, null, { stream: true });
      expect(res.text).toContain('Sources:');
      expect(res.text).toContain('Example');
      expect(res.text).toContain('https://example.com');
    });
  });

  describe('M1: web sources reach the response text', () => {
    it('appends search_results (preferred over citations)', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'The answer' } }],
        usage: { prompt_tokens: 5, completion_tokens: 7 },
        citations: ['https://fallback.example'],
        search_results: [{ title: 'Primary', url: 'https://primary.example' }],
      });
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      const res = await provider.chat(MESSAGES);
      expect(res.text).toContain('The answer');
      expect(res.text).toContain('Primary');
      expect(res.text).toContain('https://primary.example');
      // search_results wins — the bare citation URL is not used.
      expect(res.text).not.toContain('fallback.example');
    });

    it('falls back to citations when search_results is absent', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'The answer' } }],
        usage: { prompt_tokens: 5, completion_tokens: 7 },
        citations: ['https://a.example', 'https://b.example'],
      });
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      const res = await provider.chat(MESSAGES);
      expect(res.text).toContain('1. https://a.example');
      expect(res.text).toContain('2. https://b.example');
    });

    it('returns plain content unchanged when there are no sources', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'No sources here' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      const res = await provider.chat(MESSAGES);
      expect(res.text).toBe('No sources here');
    });

    it('preserves null content when there is neither content nor sources', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      const res = await provider.chat(MESSAGES);
      expect(res.text).toBeNull();
    });
  });

  describe('tool calls', () => {
    it('parses tool_calls and returns structured input', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: 'tc1', function: { name: 'search', arguments: '{"q":"x"}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
      const provider = new PerplexityProvider('sonar-pro', undefined, new CostTracker());
      const res: any = await provider.chat(MESSAGES, null, { tools: [{ type: 'function' } as any] });
      expect(res.tool_calls).toHaveLength(1);
      expect(res.tool_calls[0]).toMatchObject({ id: 'tc1', name: 'search', input: { q: 'x' } });
    });
  });
});
