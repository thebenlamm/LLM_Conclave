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
  'claude-sonnet-4.5': ProviderTier.Tier1,
  'gpt-4o': ProviderTier.Tier1,
  'gemini-2.5-pro': ProviderTier.Tier1,
  'claude-sonnet-3.5': ProviderTier.Tier2,
  'gpt-4': ProviderTier.Tier2,
  'gemini-2.0-flash': ProviderTier.Tier2,
  'gpt-3.5-turbo': ProviderTier.Tier3,
  'mistral-large': ProviderTier.Tier3
};

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

