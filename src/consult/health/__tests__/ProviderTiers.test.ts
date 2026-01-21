import { 
  ProviderTier, 
  PROVIDER_TIER_MAP, 
  getProvidersInTier, 
  getBackupProvider,
  ProviderHealthStatus,
  ProviderHealth
} from '../ProviderTiers';

describe('ProviderTiers', () => {
  describe('ProviderTier Enum', () => {
    it('should have correct tier definitions', () => {
      expect(ProviderTier.Tier1).toBe('TIER_1');
      expect(ProviderTier.Tier2).toBe('TIER_2');
      expect(ProviderTier.Tier3).toBe('TIER_3');
    });
  });

  describe('PROVIDER_TIER_MAP', () => {
    it('should map providers to correct tiers', () => {
      expect(PROVIDER_TIER_MAP['gpt-4o']).toBe(ProviderTier.Tier1);
      expect(PROVIDER_TIER_MAP['claude-sonnet-4-5']).toBe(ProviderTier.Tier1);
      expect(PROVIDER_TIER_MAP['gpt-4']).toBe(ProviderTier.Tier2);
      expect(PROVIDER_TIER_MAP['mistral-large']).toBe(ProviderTier.Tier3);
    });
  });

  describe('getProvidersInTier', () => {
    it('should return all providers in a given tier', () => {
      const tier1Providers = getProvidersInTier(ProviderTier.Tier1);
      expect(tier1Providers).toContain('gpt-4o');
      expect(tier1Providers).toContain('claude-sonnet-4-5');
      expect(tier1Providers).not.toContain('gpt-4');
    });
  });

  describe('getBackupProvider', () => {
    // Mock health status map
    const healthStatus = new Map<string, ProviderHealth>();
    
    // Helper to set health
    const setHealth = (id: string, status: ProviderHealthStatus) => {
      healthStatus.set(id, {
        status,
        lastChecked: new Date(),
        latencyMs: 100,
        errorRate: 0,
        consecutiveFailures: 0
      });
    };

    beforeEach(() => {
      healthStatus.clear();
      // Setup default healthy state for common providers
      setHealth('gpt-4o', ProviderHealthStatus.Healthy);
      setHealth('claude-sonnet-4-5', ProviderHealthStatus.Healthy);
      setHealth('gemini-2.5-pro', ProviderHealthStatus.Healthy);
      
      setHealth('gpt-4', ProviderHealthStatus.Healthy);
      setHealth('claude-sonnet-3.5', ProviderHealthStatus.Healthy);
      
      setHealth('gpt-3.5-turbo', ProviderHealthStatus.Healthy);
    });

    it('should return a different provider from the same tier if available and healthy', () => {
      // Primary: gpt-4o (Tier 1)
      // Backup should be another Tier 1
      const backup = getBackupProvider('gpt-4o', healthStatus);
      expect(PROVIDER_TIER_MAP[backup!]).toBe(ProviderTier.Tier1);
      expect(backup).not.toBe('gpt-4o');
      expect(healthStatus.get(backup!)?.status).toBe(ProviderHealthStatus.Healthy);
    });

    it('should fallback to Tier 2 if no healthy Tier 1 backup exists', () => {
      // Make all Tier 1 unhealthy except primary (or even primary is checking backup)
      setHealth('claude-sonnet-4-5', ProviderHealthStatus.Unhealthy);
      setHealth('gemini-2.5-pro', ProviderHealthStatus.Unhealthy);
      // Assume these are the only other Tier 1s for the test
      
      const backup = getBackupProvider('gpt-4o', healthStatus);
      expect(PROVIDER_TIER_MAP[backup!]).toBe(ProviderTier.Tier2);
    });

    it('should fallback to Tier 3 if no healthy Tier 1 or 2 exists', () => {
      // Make Tier 1 and Tier 2 unhealthy
      Object.keys(PROVIDER_TIER_MAP).forEach(p => {
        if (PROVIDER_TIER_MAP[p] === ProviderTier.Tier1 || PROVIDER_TIER_MAP[p] === ProviderTier.Tier2) {
          setHealth(p, ProviderHealthStatus.Unhealthy);
        }
      });
      // Tier 3 healthy
      setHealth('gpt-3.5-turbo', ProviderHealthStatus.Healthy);

      const backup = getBackupProvider('gpt-4o', healthStatus);
      expect(PROVIDER_TIER_MAP[backup!]).toBe(ProviderTier.Tier3);
    });

    it('should return null if NO healthy providers exist at all', () => {
       Object.keys(PROVIDER_TIER_MAP).forEach(p => {
          setHealth(p, ProviderHealthStatus.Unhealthy);
      });
      
      const backup = getBackupProvider('gpt-4o', healthStatus);
      expect(backup).toBeNull();
    });

    it('should not return the primary provider as backup', () => {
      // Only gpt-4o and gpt-4 are healthy
      healthStatus.clear();
      setHealth('gpt-4o', ProviderHealthStatus.Healthy);
      setHealth('gpt-4', ProviderHealthStatus.Healthy); // Tier 2

      // If we ask for backup for gpt-4o, it shouldn't return gpt-4o
      const backup = getBackupProvider('gpt-4o', healthStatus);
      expect(backup).not.toBe('gpt-4o');
    });
  });
});
