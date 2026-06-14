import { PreflightChecker, PreflightError } from '../PreflightChecker.js';

/**
 * Exercises the PreflightChecker.check() orchestration and the per-provider
 * pingModel paths. The provider SDKs are mocked so the suite is fully offline
 * and deterministic — a "ping" resolves/rejects according to the mock, never
 * the network. Covers Phase A (local model recognition), Phase B (credential +
 * model-existence ping), hard-vs-soft propagation, and dedup of repeated models.
 */

const mockRetrieve = jest.fn();
const mockGeminiGet = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { retrieve: (...args: any[]) => mockRetrieve(...args) },
  })),
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { retrieve: (...args: any[]) => mockRetrieve(...args) },
  })),
}));

jest.mock('@google/genai', () => ({
  __esModule: true,
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { get: (...args: any[]) => mockGeminiGet(...args) },
  })),
}));

// Identity resolver keeps model→provider mapping predictable for dedup assertions.
jest.mock('../ProviderFactory.js', () => ({
  __esModule: true,
  default: { resolveModelName: (m: string) => m },
}));

const PROVIDER_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'XAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
] as const;

describe('PreflightChecker.check', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieve.mockResolvedValue({ id: 'model' });
    mockGeminiGet.mockResolvedValue({ name: 'model' });
    for (const k of PROVIDER_KEYS) {
      savedEnv[k] = process.env[k];
      process.env[k] = 'test-key';
    }
  });

  afterEach(() => {
    for (const k of PROVIDER_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('returns immediately when skipPreflight is true (no pings)', async () => {
    await expect(
      PreflightChecker.check([{ name: 'A', model: 'gpt-4o' }], true)
    ).resolves.toBeUndefined();
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('returns immediately for an empty agent list', async () => {
    await expect(PreflightChecker.check([])).resolves.toBeUndefined();
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('passes when every model pings successfully across providers', async () => {
    await expect(
      PreflightChecker.check([
        { name: 'Claude', model: 'claude-sonnet-4-6' },
        { name: 'GPT', model: 'gpt-4o' },
        { name: 'Grok', model: 'grok-4' },
        { name: 'Mistral', model: 'mistral-large' },
        { name: 'Gemini', model: 'gemini-2.5-flash' },
      ])
    ).resolves.toBeUndefined();
    // anthropic + openai + grok + mistral all route through models.retrieve
    expect(mockRetrieve).toHaveBeenCalledTimes(4);
    expect(mockGeminiGet).toHaveBeenCalledTimes(1);
  });

  it('pings each unique resolved model only once (dedup)', async () => {
    await PreflightChecker.check([
      { name: 'A', model: 'gpt-4o' },
      { name: 'B', model: 'gpt-4o' },
    ]);
    expect(mockRetrieve).toHaveBeenCalledTimes(1);
  });

  it('throws PreflightError for an unrecognised model (Phase A)', async () => {
    expect.assertions(4);
    try {
      await PreflightChecker.check([{ name: 'Mystery', model: 'totally-made-up-model' }]);
    } catch (e) {
      const err = e as PreflightError;
      expect(err).toBeInstanceOf(PreflightError);
      expect(err.results[0].status).toBe('error');
      expect(err.results[0].error).toMatch(/no matching provider/i);
      // Phase A failures skip the network ping entirely.
      expect(mockRetrieve).not.toHaveBeenCalled();
    }
  });

  it('treats an invalid-key (401) ping as hard and aborts', async () => {
    mockRetrieve.mockRejectedValue(new Error('401 Incorrect API key provided'));
    expect.assertions(2);
    try {
      await PreflightChecker.check([{ name: 'GPT', model: 'gpt-4o' }]);
    } catch (e) {
      const err = e as PreflightError;
      expect(err).toBeInstanceOf(PreflightError);
      expect(err.results[0].error).toBe('Invalid API key');
    }
  });

  it('proceeds (no throw) on a soft 429 failure and logs to stderr', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRetrieve.mockRejectedValue(new Error('429 Too Many Requests'));
    await expect(
      PreflightChecker.check([{ name: 'GPT', model: 'gpt-4o' }])
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('proceeding with the run'));
    spy.mockRestore();
  });

  describe('missing credentials are hard failures', () => {
    const cases: Array<{ key: string; model: string; expected: RegExp }> = [
      { key: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-4-6', expected: /ANTHROPIC_API_KEY not set/ },
      { key: 'OPENAI_API_KEY', model: 'gpt-4o', expected: /OPENAI_API_KEY not set/ },
      { key: 'XAI_API_KEY', model: 'grok-4', expected: /XAI_API_KEY not set/ },
      { key: 'MISTRAL_API_KEY', model: 'mistral-large', expected: /MISTRAL_API_KEY not set/ },
    ];

    it.each(cases)('aborts when $key is missing', async ({ key, model, expected }) => {
      delete process.env[key];
      expect.assertions(1);
      try {
        await PreflightChecker.check([{ name: 'X', model }]);
      } catch (e) {
        expect((e as PreflightError).results[0].error).toMatch(expected);
      }
    });

    it('aborts when neither GEMINI_API_KEY nor GOOGLE_API_KEY is set', async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      expect.assertions(1);
      try {
        await PreflightChecker.check([{ name: 'G', model: 'gemini-2.5-flash' }]);
      } catch (e) {
        expect((e as PreflightError).results[0].error).toMatch(/GEMINI_API_KEY or GOOGLE_API_KEY not set/);
      }
    });
  });
});

describe('PreflightError message', () => {
  it('renders a ✅/❌ table of results', () => {
    const err = new PreflightError([
      { agent: 'Good', model: 'gpt-4o', status: 'ok' },
      { agent: 'Bad', model: 'grok-9', status: 'error', error: 'Model not found: grok-9' },
    ]);
    expect(err.name).toBe('PreflightError');
    expect(err.message).toContain('✅ Good (gpt-4o)');
    expect(err.message).toContain('❌ Bad (grok-9) — Model not found: grok-9');
  });
});
