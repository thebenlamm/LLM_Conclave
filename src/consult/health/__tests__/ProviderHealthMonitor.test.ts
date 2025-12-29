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
});