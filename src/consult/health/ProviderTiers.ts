/**
 * Provider Health Tiers and Definitions
 *
 * Defines the health states and thresholds for LLM providers.
 * Part of Story 2.2: Provider Health Monitoring
 */

export enum ProviderHealthStatus {
  Healthy = 'HEALTHY',
  Degraded = 'DEGRADED',
  Unhealthy = 'UNHEALTHY',
  Unknown = 'UNKNOWN'
}

export enum ProviderTier {
  Tier1 = 'TIER_1', // Premium
  Tier2 = 'TIER_2', // Standard
  Tier3 = 'TIER_3'  // Fast/Cheap
}

export const PROVIDER_TIER_MAP: Record<string, ProviderTier> = {
  'claude-sonnet-4-5': ProviderTier.Tier1,
  'gpt-4o': ProviderTier.Tier1,
  'gpt-4.1': ProviderTier.Tier1,
  'gemini-2.5-pro': ProviderTier.Tier1,
  'claude-sonnet-3.5': ProviderTier.Tier2,
  'gpt-4': ProviderTier.Tier2,
  'gpt-4.1-mini': ProviderTier.Tier2,
  'gemini-2.0-flash': ProviderTier.Tier2,
  'gpt-3.5-turbo': ProviderTier.Tier3,
  'gpt-4.1-nano': ProviderTier.Tier3,
  'mistral-large': ProviderTier.Tier3
};

/**
 * Map providers to their cheapest variant for cost-minimized health checks
 * Critical for Story 2.2 AC #2: "Use the cheapest model for the provider if possible"
 */
export const CHEAP_HEALTH_CHECK_MODEL: Record<string, string> = {
  // Claude family -> Use Haiku (cheapest)
  'claude-sonnet-4-5': 'claude-haiku-4',
  'claude-sonnet-3.5': 'claude-haiku-4',
  'claude-opus-4': 'claude-haiku-4',
  'claude-haiku-4': 'claude-haiku-4', // Already cheapest

  // OpenAI family -> Use cheapest variant
  'gpt-4o': 'gpt-4.1-nano',
  'gpt-4.1': 'gpt-4.1-nano',
  'gpt-4.1-mini': 'gpt-4.1-nano',
  'gpt-4.1-nano': 'gpt-4.1-nano', // Already cheapest
  'gpt-4': 'gpt-4.1-nano',
  'gpt-4-turbo': 'gpt-4.1-nano',
  'gpt-3.5-turbo': 'gpt-3.5-turbo', // Already cheapest

  // Gemini family -> Use Flash (cheapest)
  'gemini-2.5-pro': 'gemini-2.0-flash',
  'gemini-2.0-flash': 'gemini-2.0-flash', // Already cheapest
  'gemini-1.5-pro': 'gemini-2.0-flash',

  // Mistral/Others
  'mistral-large': 'mistral-large', // No cheaper variant
  'grok-beta': 'grok-beta' // No cheaper variant
};

/**
 * Get the cheapest model variant for health checks.
 * Reduces health check costs by 10-20x while maintaining reliability.
 * Returns an ordered list: preferred cheap model first, then the original
 * model as fallback (in case the cheap model is unavailable for the account/region).
 */
export function getCheapHealthCheckModel(providerId: string): string {
  return CHEAP_HEALTH_CHECK_MODEL[providerId] || providerId;
}

/**
 * Get health check model candidates in preference order.
 * First element is cheapest, last is the original model as fallback.
 */
export function getHealthCheckModelCandidates(providerId: string): string[] {
  const cheap = CHEAP_HEALTH_CHECK_MODEL[providerId];
  if (!cheap || cheap === providerId) return [providerId];
  return [cheap, providerId];
}

export interface ProviderHealth {
  status: ProviderHealthStatus;
  lastChecked: Date;
  latencyMs: number | null;
  errorRate: number;
  consecutiveFailures: number;
}

export const HEALTH_CHECK_CONFIG = {
  INTERVAL_MS: 30000, // 30 seconds
  TIMEOUT_MS: 10000,  // 10 seconds strict timeout
  
  THRESHOLDS: {
    // Healthy: < 3s response AND 0 recent failures
    LATENCY_HEALTHY_MS: 3000,
    
    // Unhealthy: > 10s response OR 3+ consecutive failures
    LATENCY_UNHEALTHY_MS: 10000,
    FAILURE_THRESHOLD_UNHEALTHY: 3,
    
    // Degraded is implied between Healthy and Unhealthy
    FAILURE_THRESHOLD_DEGRADED: 1 // 1-2 failures = Degraded
  }
};

/**
 * Get all providers belonging to a specific tier
 */
export function getProvidersInTier(tier: ProviderTier): string[] {
  return Object.entries(PROVIDER_TIER_MAP)
    .filter(([_, t]) => t === tier)
    .map(([provider]) => provider);
}

/**
 * Get a backup provider for the given primary provider
 * Prioritizes: Same Tier -> Next Lower Tier -> Next Lower Tier
 * Only returns Healthy providers (or Degraded if no Healthy?)
 * For now, strict on Healthy.
 */
export function getBackupProvider(
  primaryProviderId: string, 
  healthStatusMap: Map<string, ProviderHealth>
): string | null {
  const primaryTier = PROVIDER_TIER_MAP[primaryProviderId];
  if (!primaryTier) return null; // Unknown provider

  // Define fallback order
  const tiersToCheck: ProviderTier[] = [];
  
  if (primaryTier === ProviderTier.Tier1) {
    tiersToCheck.push(ProviderTier.Tier1, ProviderTier.Tier2, ProviderTier.Tier3);
  } else if (primaryTier === ProviderTier.Tier2) {
    tiersToCheck.push(ProviderTier.Tier2, ProviderTier.Tier3);
  } else {
    tiersToCheck.push(ProviderTier.Tier3);
  }

  for (const tier of tiersToCheck) {
    const candidates = getProvidersInTier(tier);
    
    // Filter candidates
    const validBackup = candidates.find(candidateId => {
      // Cannot be the primary itself
      if (candidateId === primaryProviderId) return false;

      // Must be healthy
      const health = healthStatusMap.get(candidateId);
      // If no health data, assume healthy? Or assume unsafe?
      // Story says: "Backup selection prioritizes healthy providers"
      // Let's assume Unknown is NOT safe. Only Healthy.
      return health?.status === ProviderHealthStatus.Healthy;
    });

    if (validBackup) {
      return validBackup;
    }
  }

  return null;
}

