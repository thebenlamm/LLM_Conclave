import { EventBus } from '../../core/EventBus';
import ProviderFactory from '../../providers/ProviderFactory';
import {
  ProviderHealth,
  ProviderHealthStatus,
  HEALTH_CHECK_CONFIG,
  getCheapHealthCheckModel,
  getHealthCheckModelCandidates
} from './ProviderTiers';

export class ProviderHealthMonitor {
  private healthStatus: Map<string, ProviderHealth> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private eventBus: EventBus;
  private monitoredProviders: Set<string> = new Set();
  private recentResults: Map<string, boolean[]> = new Map(); // Rolling window for error rate (HIGH #3 fix)
  private isRunningChecks = false;
  private inFlightChecks: Set<string> = new Set();
  private _paused = false;

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
    // MEDIUM #8: Removed unref() - health monitoring should keep process alive if running
    // Previous code had .unref() which could cause premature exit
  }

  /**
   * Pause health check output (suppresses console.error during interactive prompts)
   */
  public pause(): void {
    this._paused = true;
  }

  /**
   * Resume health check output
   */
  public resume(): void {
    this._paused = false;
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
   * Check if at least one check has completed for any provider
   * (Used to avoid false alarms on startup)
   */
  public hasCompletedFirstCheck(): boolean {
    for (const id of this.monitoredProviders) {
      const health = this.healthStatus.get(id);
      if (health && health.lastChecked.getTime() > 0) {
        return true;
      }
    }
    return false;
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
   * Get all health statuses as a Map
   * Used by HedgedRequestManager for backup provider selection
   */
  public getAllHealthStatus(): Map<string, ProviderHealth> {
    return this.healthStatus;
  }

  /**
   * Run checks for all registered providers
   */
  private async runHealthChecks(): Promise<void> {
    if (this.isRunningChecks) {
      return;
    }

    this.isRunningChecks = true;
    try {
      const checks = Array.from(this.monitoredProviders).map(id => this.checkProvider(id));
      // MEDIUM #6: Use Promise.allSettled to allow independent failures
      // One provider failing shouldn't stop checks for other providers
      await Promise.allSettled(checks);
    } finally {
      this.isRunningChecks = false;
    }
  }

  /**
   * Check a specific provider
   * Exposed for testing or manual triggers
   */
  public async checkProvider(providerId: string): Promise<void> {
    // MEDIUM #5: Validate provider is registered
    if (!this.monitoredProviders.has(providerId)) {
      throw new Error(`Provider ${providerId} not registered for monitoring`);
    }
    if (this.inFlightChecks.has(providerId)) {
      return;
    }
    this.inFlightChecks.add(providerId);

    this.eventBus.emitEvent('health:check_started', { providerId });

    const startTime = Date.now();
    let success = false;
    let latency = 0;
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Use cheapest model variant for cost minimization, with fallback to
      // the original model if the cheap variant is unavailable for the account/region
      const candidates = getHealthCheckModelCandidates(providerId);
      let lastError: Error | null = null;

      for (const candidateModel of candidates) {
        try {
          const provider = ProviderFactory.createProvider(candidateModel);

          // Enforce 10s timeout (AC #2 requirement)
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Health check timed out')), HEALTH_CHECK_CONFIG.TIMEOUT_MS);
          });

          // healthCheck() returns boolean (false = failure) instead of throwing,
          // so we must check the return value explicitly
          const checkPromise = (typeof provider.healthCheck === 'function')
            ? provider.healthCheck().then((ok: boolean) => {
                if (!ok) throw new Error(`Health check returned false for ${candidateModel}`);
              })
            : provider.chat([{ role: 'user', content: 'ping' }], 'Reply with "pong" only.');

          await Promise.race([checkPromise, timeoutPromise]);

          latency = Date.now() - startTime;
          success = true;
          lastError = null;
          break; // Success — stop trying candidates
        } catch (err: any) {
          lastError = err;
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
          // Try next candidate
        }
      }

      if (lastError) throw lastError;

    } catch (error: any) {
      latency = Date.now() - startTime;
      success = false;
      // MEDIUM #4: Add error logging for debuggability (suppressed when paused for interactive prompts)
      if (!this._paused) {
        console.error(`[ProviderHealthMonitor] Health check failed for ${providerId}:`, error.message);
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.inFlightChecks.delete(providerId);
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

    // HIGH #3: Implement rolling window error rate (not just binary 0|1)
    // Track last 10 results for true error rate calculation
    const history = this.recentResults.get(providerId) || [];
    history.push(result.success);
    if (history.length > 10) history.shift(); // Keep last 10 results
    this.recentResults.set(providerId, history);

    const failures = history.filter(s => !s).length;
    currentHealth.errorRate = failures / history.length; // True rate: 0.0 to 1.0

    if (result.success) {
      currentHealth.consecutiveFailures = 0;
    } else {
      currentHealth.consecutiveFailures++;
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
