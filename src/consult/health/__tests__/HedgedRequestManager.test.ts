import { HedgedRequestManager } from '../HedgedRequestManager';
import { ProviderHealthMonitor } from '../ProviderHealthMonitor';
import { EventBus } from '../../../core/EventBus';
import ProviderFactory from '../../../providers/ProviderFactory';
import { ProviderTier } from '../ProviderTiers';

const mockPrompt = jest.fn();
jest.mock('inquirer', () => ({
  default: {
    prompt: mockPrompt
  },
  prompt: mockPrompt
}));

// Mock dependencies
jest.mock('../ProviderHealthMonitor');
jest.mock('../../../core/EventBus');
jest.mock('../../../providers/ProviderFactory');


describe('HedgedRequestManager', () => {
  let manager: HedgedRequestManager;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockHealthMonitor: jest.Mocked<ProviderHealthMonitor>;
  
  const mockAgent = {
    name: 'TestAgent',
    role: 'tester',
    provider: 'gpt-4o', // Tier 1
    model: 'gpt-4o',
    system: 'system prompt'
  };

  const mockMessages = [{ role: 'user', content: 'hello' }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventBus = { emitEvent: jest.fn() } as any; // Simple mock object
    mockHealthMonitor = { 
      getHealth: jest.fn(), 
      healthStatus: new Map([
        ['gpt-4o', { status: 'HEALTHY' }],
        ['claude-sonnet-4.5', { status: 'HEALTHY' }],
        ['gpt-4', { status: 'HEALTHY' }]
      ])
    } as any;
    
    // Default mocks
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);
    
    manager = new HedgedRequestManager(mockEventBus);
  });


  describe('executeAgentWithHedging', () => {
    it('should use primary provider and return result if fast', async () => {
      const mockProvider = {
        chat: jest.fn().mockResolvedValue({ text: 'primary response', usage: { input: 10, output: 10, total: 20 } })
      };
      (ProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

      const result = await manager.executeAgentWithHedging(
        mockAgent,
        mockMessages,
        mockHealthMonitor
      );

      expect(result.content).toBe('primary response');
      expect(result.provider).toBe('gpt-4o');
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    });

    it('should trigger backup if primary is slow (>10s)', async () => {
      // Mock timers
      jest.useFakeTimers();

      const primaryProvider = {
        chat: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ text: 'slow primary' }), 20000)))
      };
      
      const backupProvider = {
        chat: jest.fn().mockResolvedValue({ text: 'fast backup', usage: { input: 10, output: 10, total: 20 } })
      };

      (ProviderFactory.createProvider as jest.Mock).mockImplementation((id) => {
        if (id === 'gpt-4o') return primaryProvider;
        return backupProvider; // Any backup
      });

      // Mock backup selection
      // We need to export/import getBackupProvider to mock it? 
      // Or we can mock the module '../ProviderTiers'
      // But we didn't mock that module in the imports above. 
      // For now, let's assume the real logic works if we mock health monitor to return healthy backup.
      // But ProviderTiers logic is real.
      
      // We need 'claude-sonnet-4.5' (Tier 1) to be healthy
      // Mock health monitor to return healthy for backup
      mockHealthMonitor.getHealth.mockReturnValue({ status: 'HEALTHY' } as any);

      const promise = manager.executeAgentWithHedging(mockAgent, mockMessages, mockHealthMonitor);
      
      // Fast forward past 10s
      jest.advanceTimersByTime(11000);
      
      const result = await promise;
      
      expect(result.content).toBe('fast backup');
      expect(result.provider).not.toBe('gpt-4o'); // Should be backup
      expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:provider_substituted', expect.any(Object));

      jest.useRealTimers();
    });

    it('should prompt user if primary fails completely', async () => {
      const primaryProvider = {
        chat: jest.fn().mockRejectedValue(new Error('Primary failed'))
      };
      
      (ProviderFactory.createProvider as jest.Mock).mockReturnValue(primaryProvider);
      
      // User says Yes to substitution
      mockPrompt.mockResolvedValue({ choice: 'Y' });

      // Mock user substitution selection logic (if interactive) or it picks automatic backup?
      // AC #3: "Switch to xAI (Grok) for this agent? [Y/n/Fail]"
      // It implies it suggests a substitute.
      // We need to ensure a backup is available.
      mockHealthMonitor.getHealth.mockReturnValue({ status: 'HEALTHY' } as any);

      // We need to mock the Backup provider responding successfully
      const backupProvider = {
        chat: jest.fn().mockResolvedValue({ text: 'backup response', usage: {} })
      };
      (ProviderFactory.createProvider as jest.Mock).mockImplementation((id) => {
        if (id === 'gpt-4o') return primaryProvider;
        return backupProvider;
      });

      const result = await manager.executeAgentWithHedging(mockAgent, mockMessages, mockHealthMonitor);
      
      expect(mockPrompt).toHaveBeenCalled();
      expect(result.content).toBe('backup response');
      expect(mockEventBus.emitEvent).toHaveBeenCalledWith('consultation:provider_substituted', expect.objectContaining({
        reason: 'failure'
      }));
    });

    it('should handle user rejection of substitution (graceful degradation)', async () => {
      const primaryProvider = {
        chat: jest.fn().mockRejectedValue(new Error('Primary failed'))
      };
      (ProviderFactory.createProvider as jest.Mock).mockReturnValue(primaryProvider);
      
      // User says No
      mockPrompt.mockResolvedValue({ choice: 'n' });

      const result = await manager.executeAgentWithHedging(mockAgent, mockMessages, mockHealthMonitor);
      
      expect(result.provider_error).toContain('failed'); // Expecting error field
      expect(result.content).toBe(''); // Empty content
    });

    it('should handle all providers failing (graceful degradation)', async () => {
       const primaryProvider = {
        chat: jest.fn().mockRejectedValue(new Error('Primary failed'))
      };
       const backupProvider = {
        chat: jest.fn().mockRejectedValue(new Error('Backup failed'))
      };
      
      (ProviderFactory.createProvider as jest.Mock).mockImplementation(() => primaryProvider); // Assume all fail for simplicity of mock
      
       // Mock getting a backup logic inside failing too?
       // If primary fails, prompt user. User says Yes. Backup fails.
       mockPrompt.mockResolvedValue({ choice: 'Y' });
       
       // Force backup failure by mocking ProviderFactory to always return failing provider
       
       const result = await manager.executeAgentWithHedging(mockAgent, mockMessages, mockHealthMonitor);
       
       expect(result.provider_error).toBeDefined();
    });
  });
});
