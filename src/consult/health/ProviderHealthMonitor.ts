import { EventBus } from '../../core/EventBus';
import ProviderFactory from '../../providers/ProviderFactory';
import { 
  ProviderHealth, 
  ProviderHealthStatus, 
  HEALTH_CHECK_CONFIG 
} from './ProviderTiers';

export class ProviderHealthMonitor {
  private healthStatus: Map<string, ProviderHealth> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private eventBus: EventBus;
  private monitoredProviders: Set<string> = new Set();

  constructor() {
    this.eventBus = EventBus.getInstance();
  }

  /**
   * Register a provider (model) to be monitored
   * @param providerId The model identifier (e.g., 'gpt-4o')
   */
  public registerProvider(providerId: string): void {
    if (!this.monitoredProviders.has(providerId)) {
      this.monitoredProviders.add(providerId);
      // Initialize status as Unknown
      this.healthStatus.set(providerId, {
        status: ProviderHealthStatus.Unknown,
        lastChecked: new Date(0), // Never checked
        latencyMs: null,
        errorRate: 0,
        consecutiveFailures: 0
      });
    }
  }

  /**
   * Start background monitoring
   */
  public startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already running
    }

    // Run immediately
    this.runHealthChecks();

    // specific interval
    this.monitoringInterval = setInterval(
      () => this.runHealthChecks(),
      HEALTH_CHECK_CONFIG.INTERVAL_MS
    );
    // Ensure the interval doesn't prevent the process from exiting
    this.monitoringInterval.unref();
  }

  /**
   * Stop background monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check if at least one provider is healthy
   */
  public hasHealthyProviders(): boolean {
    if (this.monitoredProviders.size === 0) return false;
    
    for (const id of this.monitoredProviders) {
      const health = this.healthStatus.get(id);
      if (health && health.status === ProviderHealthStatus.Healthy) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get health status for a provider
   */
  public getHealth(providerId: string): ProviderHealth | undefined {
    return this.healthStatus.get(providerId);
  }

  /**
   * Run checks for all registered providers
   */
  private async runHealthChecks(): Promise<void> {
    const checks = Array.from(this.monitoredProviders).map(id => this.checkProvider(id));
    await Promise.all(checks);
  }

  /**
   * Check a specific provider
   * Exposed for testing or manual triggers
   */
  public async checkProvider(providerId: string): Promise<void> {
    this.eventBus.emitEvent('health:check_started', { providerId });
    
    const startTime = Date.now();
    let success = false;
    let latency = 0;

    try {
      const provider = ProviderFactory.createProvider(providerId);
      
      // Use the provider's health check method
      // This allows specific providers to optimize checks (e.g. specialized endpoints)
      // while falling back to "ping" chat for others via base class
      if (typeof provider.healthCheck === 'function') {
         await provider.healthCheck();
      } else {
         // Fallback if provider doesn't inherit LLMProvider properly (shouldn't happen in our codebase)
         await provider.chat(
           [{ role: 'user', content: 'ping' }],
           'Reply with "pong" only.'
         );
      }
      
      latency = Date.now() - startTime;
      success = true;

    } catch (error) {
      latency = Date.now() - startTime;
      success = false;
      // Log error internally or just track failure
    }

    this.updateStatus(providerId, { success, latency });
  }

  /**
   * Update status based on check result
   */
  public updateStatus(providerId: string, result: { success: boolean, latency: number }): void {
    const currentHealth = this.healthStatus.get(providerId);
    if (!currentHealth) return;

    const previousStatus = currentHealth.status;
    let newStatus = previousStatus;

    // Update metrics
    currentHealth.lastChecked = new Date();
    currentHealth.latencyMs = result.latency;

    if (result.success) {
      currentHealth.consecutiveFailures = 0;
      // Simple error rate decay or reset? 
      // For this story, we stick to "consecutive failures" logic for Unhealthy
      // and "recent failures" for Degraded.
      // Let's reset error rate on success for simplicity unless we want a window.
      currentHealth.errorRate = 0; 
    } else {
      currentHealth.consecutiveFailures++;
      currentHealth.errorRate = 1.0; // Mark as error occurred
    }

    // Determine Status
    if (result.success) {
      if (result.latency < HEALTH_CHECK_CONFIG.THRESHOLDS.LATENCY_HEALTHY_MS) {
        newStatus = ProviderHealthStatus.Healthy;
      } else if (result.latency < HEALTH_CHECK_CONFIG.THRESHOLDS.LATENCY_UNHEALTHY_MS) {
        newStatus = ProviderHealthStatus.Degraded;
      } else {
        newStatus = ProviderHealthStatus.Unhealthy; // Latency too high
      }
    } else {
      // Failure
      if (currentHealth.consecutiveFailures >= HEALTH_CHECK_CONFIG.THRESHOLDS.FAILURE_THRESHOLD_UNHEALTHY) {
        newStatus = ProviderHealthStatus.Unhealthy;
      } else if (currentHealth.consecutiveFailures >= HEALTH_CHECK_CONFIG.THRESHOLDS.FAILURE_THRESHOLD_DEGRADED) {
        newStatus = ProviderHealthStatus.Degraded;
      }
      // If 0 failures (success), already handled above.
    }

    // Update status
    currentHealth.status = newStatus;

    // Emit event if changed
    if (previousStatus !== newStatus) {
      this.eventBus.emitEvent('health:status_updated', {
        provider_name: providerId,
        previous_status: previousStatus,
        new_status: newStatus,
        reason: result.success 
          ? `Latency: ${result.latency}ms` 
          : `Failures: ${currentHealth.consecutiveFailures}`
      });
    }
  }
}
