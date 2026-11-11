import { normalizeError, PreflightChecker } from '../PreflightChecker.js';

/**
 * Locks in the hard/soft classification contract.
 *
 * HARD failures abort the run before spending tokens (preflight's purpose).
 * SOFT failures are transient/non-fatal at the models endpoint and must NOT
 * abort — otherwise a single rate-limit blip kills the very run preflight is
 * meant to protect.
 */
describe('normalizeError — hard/soft classification', () => {
  const model = 'gpt-4o';

  describe('HARD failures (abort the run)', () => {
    it('classifies 401 as hard with an Invalid API key message', () => {
      const r = normalizeError(new Error('401 Incorrect API key provided'), model);
      expect(r.severity).toBe('hard');
      expect(r.message).toBe('Invalid API key');
    });

    it('classifies "unauthorized" text as hard', () => {
      expect(normalizeError(new Error('Request unauthorized'), model).severity).toBe('hard');
    });

    it('classifies 404 as hard model-not-found', () => {
      const r = normalizeError(new Error("404 The model 'foo' does not exist"), model);
      expect(r.severity).toBe('hard');
      expect(r.message).toBe(`Model not found: ${model}`);
    });

    it('classifies provider "model_not_found" / "NOT_FOUND" bodies as hard', () => {
      expect(normalizeError(new Error('error code: model_not_found'), model).severity).toBe('hard');
      expect(normalizeError(new Error('{"status":"NOT_FOUND"}'), model).severity).toBe('hard');
      expect(normalizeError(new Error('model is not found'), model).severity).toBe('hard');
    });
  });

  describe('SOFT failures (proceed with the run)', () => {
    it('classifies 429 rate-limit as soft', () => {
      expect(normalizeError(new Error('429 Too Many Requests'), model).severity).toBe('soft');
    });

    it('classifies billing/quota 403 as soft (key is valid, just out of credits)', () => {
      const r = normalizeError(new Error('403 You have used all available credits'), model);
      expect(r.severity).toBe('soft');
    });

    it('classifies 5xx as soft', () => {
      expect(normalizeError(new Error('500 Internal Server Error'), model).severity).toBe('soft');
      expect(normalizeError(new Error('503 Service Unavailable'), model).severity).toBe('soft');
    });

    it('classifies a network blip as soft', () => {
      expect(normalizeError(new Error('Connection error.'), model).severity).toBe('soft');
    });

    it('classifies the preflight timeout as soft', () => {
      expect(normalizeError(new Error('timeout'), model).severity).toBe('soft');
    });
  });
});

/**
 * M2 (PR #13 review): Perplexity has no reliable /models endpoint to ping, so a
 * typo'd Sonar model would otherwise pass preflight and burn a full run. The
 * perplexity case validates the model name against the known Sonar set locally —
 * no network call — so these run fast and deterministically.
 */
describe('PreflightChecker — Perplexity local model validation', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('hard-fails an unknown Sonar model before spending tokens', async () => {
    process.env.PERPLEXITY_API_KEY = 'test-key';
    await expect(
      PreflightChecker.check([{ name: 'A', model: 'sonar-bogus' }])
    ).rejects.toThrow(/Model not found: sonar-bogus/);
  });

  it('passes a valid Sonar model', async () => {
    process.env.PERPLEXITY_API_KEY = 'test-key';
    await expect(
      PreflightChecker.check([{ name: 'A', model: 'sonar-pro' }])
    ).resolves.toBeUndefined();
  });

  it('passes the bare "perplexity" alias (resolves to sonar-pro)', async () => {
    process.env.PERPLEXITY_API_KEY = 'test-key';
    await expect(
      PreflightChecker.check([{ name: 'A', model: 'perplexity' }])
    ).resolves.toBeUndefined();
  });

  it('hard-fails when PERPLEXITY_API_KEY is missing', async () => {
    delete process.env.PERPLEXITY_API_KEY;
    await expect(
      PreflightChecker.check([{ name: 'A', model: 'sonar-pro' }])
    ).rejects.toThrow(/PERPLEXITY_API_KEY not set/);
  });
});
