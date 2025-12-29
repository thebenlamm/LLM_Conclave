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
