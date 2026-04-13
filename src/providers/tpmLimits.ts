/**
 * Pre-flight TPM (tokens-per-minute) guard.
 *
 * Closes the silent-fallback gap identified in Phase 12 CONTEXT
 * (Trollix run: 31838 tokens vs 30K OpenAI TPM — both GPT-4o agents
 * silently fell back to claude-sonnet-4-5 mid-round 1).
 *
 * This module estimates round-1 input tokens per agent against
 * provider TPM ceilings and throws a structured error before any
 * LLM call occurs, allowing callers to take corrective action
 * (trim prompt, switch model, accept substitution) explicitly.
 */

import { encode } from 'gpt-tokenizer';

// ---------------------------------------------------------------------------
// TPM ceiling defaults
// ---------------------------------------------------------------------------

/**
 * Default per-provider TPM ceilings, seeded from known tier-1 limits.
 *
 * Override at runtime via:
 *   - env var `LLM_CONCLAVE_TPM_<PROVIDER_UPPER>` (e.g. LLM_CONCLAVE_TPM_OPENAI=60000)
 *   - `configOverrides` parameter passed into getTpmLimit() / preFlightTpmCheck()
 *     (typically loaded from .llm-conclave.json by the caller).
 */
export const DEFAULT_TPM_LIMITS: Record<string, { default: number; perModel?: Record<string, number> }> = {
  openai:    { default: 30_000 },     // tier-1 GPT-4o
  anthropic: { default: 40_000 },     // tier-1 Claude
  google:    { default: 1_000_000 },  // Gemini is generous
  xai:       { default: 60_000 },     // Grok
  mistral:   { default: 500_000 },    // Mistral large
};

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

/**
 * Infer the provider key for a given model identifier.
 *
 * Mirrors the dispatch logic in ProviderFactory.createProvider() but returns
 * a normalized provider key suitable for TPM lookups. Kept as a small local
 * helper rather than reaching into ProviderFactory because ProviderFactory's
 * createProvider() instantiates a real client (and we just need the label).
 *
 * Returns 'unknown' for unrecognized models — the caller should treat unknown
 * providers as having no TPM limit (Number.POSITIVE_INFINITY).
 */
export function inferProviderFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('gpt')) return 'openai';
  if (m.includes('claude') || m.includes('sonnet') || m.includes('opus') || m.includes('haiku')) return 'anthropic';
  if (m.includes('gemini')) return 'google';
  if (m.includes('grok')) return 'xai';
  if (m.includes('mistral') || m.includes('codestral')) return 'mistral';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// TPM limit resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective TPM ceiling for a (provider, model) pair.
 *
 * Priority:
 *   1. Env var LLM_CONCLAVE_TPM_<PROVIDER_UPPER>  (e.g. LLM_CONCLAVE_TPM_OPENAI)
 *   2. configOverrides[provider]                  (caller-supplied, e.g. from .llm-conclave.json)
 *   3. DEFAULT_TPM_LIMITS[provider].perModel?.[model]
 *   4. DEFAULT_TPM_LIMITS[provider].default
 *
 * Unknown providers return Number.POSITIVE_INFINITY so the pre-flight check
 * does not block on models we haven't classified yet.
 */
export function getTpmLimit(
  provider: string,
  model: string,
  configOverrides?: Record<string, number>
): number {
  // 1. Env var override
  const envKey = `LLM_CONCLAVE_TPM_${provider.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal) {
    const parsed = Number.parseInt(envVal, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  // 2. Config-injected override
  if (configOverrides && Object.prototype.hasOwnProperty.call(configOverrides, provider)) {
    const v = configOverrides[provider];
    if (Number.isFinite(v) && v > 0) return v;
  }

  // 3 / 4. Built-in defaults
  const entry = DEFAULT_TPM_LIMITS[provider];
  if (!entry) return Number.POSITIVE_INFINITY;
  if (entry.perModel && entry.perModel[model] !== undefined) return entry.perModel[model];
  return entry.default;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the round-1 input tokens for an agent.
 *
 * Sums the token counts of the system prompt, the task prompt, and any
 * project context the orchestrator will inject on the first turn.
 *
 * Note: gpt-tokenizer uses OpenAI's BPE, which is approximate for Claude
 * and Gemini — empirically within ~15%. Good enough as a pre-flight
 * heuristic; we'd rather have a small false-positive rate at the gate
 * than allow a silent mid-round fallback.
 */
export function estimateRound1InputTokens(
  systemPrompt: string,
  taskPrompt: string,
  projectContext?: string
): number {
  const parts = [systemPrompt, taskPrompt, projectContext].filter(Boolean) as string[];
  return parts.reduce((sum, p) => sum + encode(p).length, 0);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export interface AgentTpmViolation {
  agentName: string;
  model: string;
  provider: string;
  estimatedInputTokens: number;
  tpmLimit: number;
}

/**
 * Thrown by preFlightTpmCheck() when one or more agents would exceed their
 * provider's TPM ceiling on round 1. Caught by the MCP discuss handler and
 * surfaced as a structured tool_error listing user-actionable options.
 */
export class PreFlightTpmError extends Error {
  public readonly violations: AgentTpmViolation[];

  constructor(violations: AgentTpmViolation[]) {
    super(
      `Pre-flight TPM check failed: ${violations.length} agent(s) exceed provider TPM limits. ` +
      violations
        .map(v => `${v.agentName} (${v.model}): ${v.estimatedInputTokens} > ${v.tpmLimit}`)
        .join('; ')
    );
    this.name = 'PreFlightTpmError';
    this.violations = violations;
    // Preserve prototype chain for instanceof across compiled output
    Object.setPrototypeOf(this, PreFlightTpmError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Pre-flight check
// ---------------------------------------------------------------------------

/**
 * Minimal agent shape consumed by preFlightTpmCheck. Designed to match
 * ConversationManager's `this.agents` record without coupling to its full
 * runtime type (which carries an instantiated provider client).
 */
export interface PreFlightAgent {
  model: string;
  systemPrompt?: string;
  prompt?: string;
}

/**
 * Run the pre-flight TPM check for an agent panel. Throws PreFlightTpmError
 * if any agent's estimated round-1 input exceeds its provider's TPM ceiling.
 *
 * Called at the very top of ConversationManager.startConversation(), before
 * any LLM call, history seeding, or run:start event — failure produces no
 * session side effects.
 */
export function preFlightTpmCheck(
  agents: Record<string, PreFlightAgent>,
  task: string,
  projectContext: string | undefined,
  configOverrides?: Record<string, number>
): void {
  const violations: AgentTpmViolation[] = [];

  for (const [agentName, cfg] of Object.entries(agents)) {
    const provider = inferProviderFromModel(cfg.model);
    const limit = getTpmLimit(provider, cfg.model, configOverrides);
    const systemPrompt = cfg.systemPrompt || cfg.prompt || '';
    const estimated = estimateRound1InputTokens(systemPrompt, task, projectContext);

    if (estimated > limit) {
      violations.push({
        agentName,
        model: cfg.model,
        provider,
        estimatedInputTokens: estimated,
        tpmLimit: limit,
      });
    }
  }

  if (violations.length > 0) {
    throw new PreFlightTpmError(violations);
  }
}
