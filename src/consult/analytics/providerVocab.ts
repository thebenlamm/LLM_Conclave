import { inferProviderFromModel } from '../../providers/tpmLimits.js';

/**
 * Map a model name to the SAME provider vocabulary the consult path writes to
 * analytics: `getProviderName().toLowerCase()` → claude / openai / gemini / grok
 * / mistral. inferProviderFromModel() returns anthropic / google / xai for three
 * of those, which would split cross-mode `GROUP BY provider` rollups into
 * separate buckets for the same provider. Aligning to the consult vocabulary
 * (the existing analytics data) keeps the buckets consistent across the consult,
 * discuss, continue, and backfill write paths.
 */
const INFER_TO_CONSULT_PROVIDER: Record<string, string> = {
  anthropic: 'claude',
  google: 'gemini',
  xai: 'grok',
};

export function normalizeAnalyticsProvider(model: string): string {
  const inferred = inferProviderFromModel(model ?? '');
  return INFER_TO_CONSULT_PROVIDER[inferred] ?? inferred;
}
