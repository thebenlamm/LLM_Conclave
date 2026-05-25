import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import ProviderFactory from './ProviderFactory.js';

export interface AgentSpec {
  name: string;
  model: string;
}

export interface PreflightResult {
  agent: string;
  model: string;
  status: 'ok' | 'error';
  error?: string;
}

export class PreflightError extends Error {
  readonly results: PreflightResult[];

  constructor(results: PreflightResult[]) {
    const table = results
      .map(r => `  ${r.status === 'ok' ? '✅' : '❌'} ${r.agent} (${r.model})${r.error ? ` — ${r.error}` : ''}`)
      .join('\n');
    super(`Pre-flight validation failed — fix the issues below and retry:\n\n${table}`);
    this.name = 'PreflightError';
    this.results = results;
  }
}

type ProviderType = 'anthropic' | 'openai' | 'grok' | 'gemini' | 'mistral' | 'unknown';

function detectProvider(model: string): ProviderType {
  const lower = model.toLowerCase();
  if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus') || lower.includes('haiku')) return 'anthropic';
  if (lower.includes('gpt')) return 'openai';
  if (lower.includes('grok')) return 'grok';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('mistral') || lower.includes('codestral')) return 'mistral';
  return 'unknown';
}

function normalizeError(e: any, model: string): string {
  const msg: string = e?.message || String(e);
  const first = msg.split('\n')[0].slice(0, 120);
  if (msg.includes('401') || /invalid.*key|unauthorized|authentication/i.test(msg)) {
    return 'Invalid API key';
  }
  if (msg.includes('404') || /not\.found|model.*not.*found/i.test(msg)) {
    return `Model not found: ${model}`;
  }
  if (msg.includes('timeout')) return 'Credential check timed out (>8s)';
  return first;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (e) {
    clearTimeout(timer!);
    throw e;
  }
}

const PING_TIMEOUT_MS = 8_000;

async function pingModel(type: ProviderType, resolvedModel: string): Promise<string | null> {
  try {
    switch (type) {
      case 'anthropic': {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) return 'ANTHROPIC_API_KEY not set';
        const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: PING_TIMEOUT_MS });
        await withTimeout((client.models as any).retrieve(resolvedModel), PING_TIMEOUT_MS);
        return null;
      }
      case 'openai': {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return 'OPENAI_API_KEY not set';
        const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: PING_TIMEOUT_MS });
        await withTimeout(client.models.retrieve(resolvedModel), PING_TIMEOUT_MS);
        return null;
      }
      case 'grok': {
        const key = process.env.XAI_API_KEY;
        if (!key) return 'XAI_API_KEY not set';
        const client = new OpenAI({ apiKey: key, baseURL: 'https://api.x.ai/v1', maxRetries: 0, timeout: PING_TIMEOUT_MS });
        await withTimeout(client.models.retrieve(resolvedModel), PING_TIMEOUT_MS);
        return null;
      }
      case 'gemini': {
        const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!key) return 'GEMINI_API_KEY or GOOGLE_API_KEY not set';
        const ai = new GoogleGenAI({ apiKey: key });
        await withTimeout(ai.models.get({ model: resolvedModel }), PING_TIMEOUT_MS);
        return null;
      }
      case 'mistral': {
        const key = process.env.MISTRAL_API_KEY;
        if (!key) return 'MISTRAL_API_KEY not set';
        const client = new OpenAI({ apiKey: key, baseURL: 'https://api.mistral.ai/v1', maxRetries: 0, timeout: PING_TIMEOUT_MS });
        await withTimeout(client.models.retrieve(resolvedModel), PING_TIMEOUT_MS);
        return null;
      }
      default:
        return `Unknown provider for model: ${resolvedModel}`;
    }
  } catch (e: any) {
    return normalizeError(e, resolvedModel);
  }
}

/**
 * Validates all agent models before a discussion or consultation begins.
 *
 * Phase A (local): confirms ProviderFactory can resolve each model name.
 * Phase B (network): pings each unique model against the provider's API
 *   to validate both credentials and model existence. Runs in parallel
 *   with an 8s timeout per call.
 *
 * Throws PreflightError with a ✅/❌ table if any check fails.
 * Pass skipPreflight=true to bypass (e.g., in tests or continuation runs).
 */
export class PreflightChecker {
  static async check(agents: AgentSpec[], skipPreflight = false): Promise<void> {
    if (skipPreflight || agents.length === 0) return;

    const results: PreflightResult[] = agents.map(a => ({
      agent: a.name,
      model: a.model,
      status: 'ok' as const,
    }));

    // Phase A: verify ProviderFactory recognises each model name
    const phaseAFailed = new Set<number>();
    for (let i = 0; i < agents.length; i++) {
      const type = detectProvider(agents[i].model);
      if (type === 'unknown') {
        results[i] = {
          ...results[i],
          status: 'error',
          error: `Unrecognised model name — no matching provider`,
        };
        phaseAFailed.add(i);
      }
    }

    // Phase B: credential + model-existence ping per unique resolved model
    // (skip models that already failed Phase A)
    const uniqueModels = new Map<string, { type: ProviderType; resolved: string }>();
    for (let i = 0; i < agents.length; i++) {
      if (phaseAFailed.has(i)) continue;
      const resolved = ProviderFactory.resolveModelName(agents[i].model);
      if (!uniqueModels.has(resolved)) {
        uniqueModels.set(resolved, { type: detectProvider(resolved), resolved });
      }
    }

    const pingResults = new Map<string, string | null>();
    await Promise.all(
      Array.from(uniqueModels.entries()).map(async ([resolved, { type }]) => {
        const err = await pingModel(type, resolved);
        pingResults.set(resolved, err);
      })
    );

    // Propagate Phase B errors back to per-agent results
    for (let i = 0; i < agents.length; i++) {
      if (phaseAFailed.has(i)) continue;
      const resolved = ProviderFactory.resolveModelName(agents[i].model);
      const err = pingResults.get(resolved);
      if (err) {
        results[i] = { ...results[i], status: 'error', error: err };
      }
    }

    if (results.some(r => r.status === 'error')) {
      throw new PreflightError(results);
    }
  }
}
