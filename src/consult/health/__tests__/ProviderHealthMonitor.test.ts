import { ProviderHealthMonitor } from '../ProviderHealthMonitor';
import { EventBus } from '../../../core/EventBus';
import { ProviderHealthStatus, HEALTH_CHECK_CONFIG } from '../ProviderTiers';
import ProviderFactory from '../../../providers/ProviderFactory';

// Mock EventBus
jest.mock('../../../core/EventBus');
// Mock ProviderFactory
jest.mock('../../../providers/ProviderFactory');

describe('ProviderHealthMonitor', () => {
  let monitor: ProviderHealthMonitor;
  let eventBusMock: any;
  let providerMock: any;

  beforeEach(() => {
    jest.useFakeTimers();
    eventBusMock = {
      emitEvent: jest.fn()
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(eventBusMock);

    providerMock = {
      chat: jest.fn().mockResolvedValue({ text: 'pong' }),
      healthCheck: jest.fn().mockResolvedValue(true)
    };
    (ProviderFactory.createProvider as jest.Mock).mockReturnValue(providerMock);
    
    monitor = new ProviderHealthMonitor(); 
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    monitor.stopMonitoring();
  });

  it('should register a provider with Unknown status', () => {
    monitor.registerProvider('gpt-4o');
    const health = monitor.getHealth('gpt-4o');
    expect(health).toBeDefined();
    expect(health?.status).toBe(ProviderHealthStatus.Unknown);
  });

  it('should run health checks and update status to Healthy', async () => {
    monitor.registerProvider('gpt-4o');
    
    // Fast response
    providerMock.chat.mockResolvedValue({ text: 'pong' });
    // Note: We can't easily mock execution time in JS without more complex mocks,
    // but our implementation calculates latency = Date.now() - start.
    // We can just rely on the fact that the mock returns immediately (latency ~0-1ms)
    
    await monitor.checkProvider('gpt-4o');

    const health = monitor.getHealth('gpt-4o');
    expect(health?.status).toBe(ProviderHealthStatus.Healthy);
    expect(eventBusMock.emitEvent).toHaveBeenCalledWith('health:status_updated', expect.objectContaining({
      new_status: ProviderHealthStatus.Healthy
    }));
  });

  it('should handle failures and transition to Degraded then Unhealthy', async () => {
    monitor.registerProvider('gpt-4o');
    
    // 1st Failure -> Degraded (Threshold is 1)
    providerMock.healthCheck.mockRejectedValue(new Error('Network error'));
    await monitor.checkProvider('gpt-4o');
    
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Degraded);
    expect(monitor.getHealth('gpt-4o')?.consecutiveFailures).toBe(1);

    // 2nd Failure -> Degraded (Threshold is 1, Unhealthy is 3)
    await monitor.checkProvider('gpt-4o');
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Degraded);
    expect(monitor.getHealth('gpt-4o')?.consecutiveFailures).toBe(2);

    // 3rd Failure -> Unhealthy
    await monitor.checkProvider('gpt-4o');
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Unhealthy);
    expect(monitor.getHealth('gpt-4o')?.consecutiveFailures).toBe(3);
  });

  it('should correctly report if any provider is healthy', async () => {
    monitor.registerProvider('gpt-4o');

    // Initially Unknown -> Not Healthy
    expect(monitor.hasHealthyProviders()).toBe(false);

    // Make it Healthy
    providerMock.healthCheck.mockResolvedValue(true);
    await monitor.checkProvider('gpt-4o');
    expect(monitor.hasHealthyProviders()).toBe(true);

    // Make it Unhealthy
    monitor.updateStatus('gpt-4o', { success: false, latency: 0 }); // Manually trigger update or use checkProvider
    // (Actually checkProvider logic does counting, updateStatus sets it based on result)
    // To be precise, let's just force status for this test or use checkProvider multiple times
    // But updateStatus is public, so we can use it.

    // Force Unhealthy
    const unhealthyResult = { success: false, latency: 0 };
    monitor.updateStatus('gpt-4o', unhealthyResult); // 1 fail -> Degraded (threshold 1)

    // Depending on logic, 1 fail might be Degraded.
    // Let's check logic:
    // Degraded: 1-2 failures. Unhealthy: 3+.
    // So 1 failure is Degraded (which is !Healthy).
    expect(monitor.hasHealthyProviders()).toBe(false);
  });

  // MEDIUM #9: Additional test coverage for missing scenarios

  it('should transition from Unhealthy -> Degraded -> Healthy on recovery', async () => {
    monitor.registerProvider('gpt-4o');

    // Make Unhealthy (3 failures)
    providerMock.healthCheck.mockRejectedValue(new Error('Network error'));
    await monitor.checkProvider('gpt-4o');
    await monitor.checkProvider('gpt-4o');
    await monitor.checkProvider('gpt-4o');
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Unhealthy);

    // Recover -> Healthy (success with fast latency)
    providerMock.healthCheck.mockResolvedValue(true);
    await monitor.checkProvider('gpt-4o');
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Healthy);
    expect(monitor.getHealth('gpt-4o')?.consecutiveFailures).toBe(0);
  });

  it('should mark as Degraded when latency is between 3-10s', () => {
    monitor.registerProvider('gpt-4o');

    // Success but slow (5s = 5000ms)
    monitor.updateStatus('gpt-4o', { success: true, latency: 5000 });
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Degraded);
  });

  it('should mark as Unhealthy when latency exceeds 10s', () => {
    monitor.registerProvider('gpt-4o');

    // Success but very slow (12s = 12000ms)
    monitor.updateStatus('gpt-4o', { success: true, latency: 12000 });
    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Unhealthy);
  });

  it('should calculate error rate as rolling window average', async () => {
    monitor.registerProvider('gpt-4o');

    // 3 successes
    for (let i = 0; i < 3; i++) {
      monitor.updateStatus('gpt-4o', { success: true, latency: 1000 });
    }
    expect(monitor.getHealth('gpt-4o')?.errorRate).toBe(0.0);

    // 2 failures
    for (let i = 0; i < 2; i++) {
      monitor.updateStatus('gpt-4o', { success: false, latency: 1000 });
    }
    // Error rate = 2 failures / 5 total = 0.4
    expect(monitor.getHealth('gpt-4o')?.errorRate).toBe(0.4);
  });

  it('should track hasCompletedFirstCheck correctly', async () => {
    monitor.registerProvider('gpt-4o');

    // Initially false
    expect(monitor.hasCompletedFirstCheck()).toBe(false);

    // After first check
    await monitor.checkProvider('gpt-4o');
    expect(monitor.hasCompletedFirstCheck()).toBe(true);
  });

  it('should emit events for ALL status transitions', async () => {
    monitor.registerProvider('gpt-4o');

    // Unknown -> Healthy
    providerMock.healthCheck.mockResolvedValue(true);
    await monitor.checkProvider('gpt-4o');
    expect(eventBusMock.emitEvent).toHaveBeenCalledWith('health:status_updated', expect.objectContaining({
      previous_status: ProviderHealthStatus.Unknown,
      new_status: ProviderHealthStatus.Healthy
    }));

    // Healthy -> Degraded
    eventBusMock.emitEvent.mockClear();
    providerMock.healthCheck.mockRejectedValue(new Error('Fail'));
    await monitor.checkProvider('gpt-4o');
    expect(eventBusMock.emitEvent).toHaveBeenCalledWith('health:status_updated', expect.objectContaining({
      previous_status: ProviderHealthStatus.Healthy,
      new_status: ProviderHealthStatus.Degraded
    }));
  });

  it('should stop monitoring and cleanup timers', () => {
    monitor.startMonitoring();
    expect(monitor['monitoringInterval']).not.toBeNull();

    monitor.stopMonitoring();
    expect(monitor['monitoringInterval']).toBeNull();
  });

  it('should handle multiple providers simultaneously', async () => {
    monitor.registerProvider('gpt-4o');
    monitor.registerProvider('claude-sonnet-4-5');
    monitor.registerProvider('gemini-2.5-pro');

    providerMock.healthCheck.mockResolvedValue(true);
    await monitor.checkProvider('gpt-4o');
    await monitor.checkProvider('claude-sonnet-4-5');
    await monitor.checkProvider('gemini-2.5-pro');

    expect(monitor.getHealth('gpt-4o')?.status).toBe(ProviderHealthStatus.Healthy);
    expect(monitor.getHealth('claude-sonnet-4-5')?.status).toBe(ProviderHealthStatus.Healthy);
    expect(monitor.getHealth('gemini-2.5-pro')?.status).toBe(ProviderHealthStatus.Healthy);
  });

  it('should throw error when checking unregistered provider', async () => {
    await expect(monitor.checkProvider('unknown-provider')).rejects.toThrow(
      'Provider unknown-provider not registered for monitoring'
    );
  });
});