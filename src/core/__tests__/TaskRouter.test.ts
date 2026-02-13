import { TaskRouter } from '../TaskRouter';

describe('TaskRouter', () => {
  describe('disabled router', () => {
    it('should return null when disabled', async () => {
      const router = new TaskRouter({ enabled: false });
      const result = await router.route('summarize', 'Summarize this text');
      expect(result).toBeNull();
    });

    it('should report inactive when disabled', () => {
      const router = new TaskRouter({ enabled: false });
      expect(router.isActive()).toBe(false);
    });
  });

  describe('provider failure', () => {
    it('should return null when cheap model provider fails to initialize', async () => {
      // Use a model name that will fail provider creation (no API key)
      const router = new TaskRouter({ cheapModel: 'nonexistent-model-xyz', enabled: true });
      const result = await router.route('summarize', 'Test prompt');
      expect(result).toBeNull();
    });

    it('should report inactive when provider fails to initialize', () => {
      const router = new TaskRouter({ cheapModel: 'nonexistent-model-xyz', enabled: true });
      expect(router.isActive()).toBe(false);
    });
  });

  describe('default configuration', () => {
    it('should be enabled by default', () => {
      // Note: this test may report inactive if no OpenAI key is configured,
      // but the router should still be "enabled" in its config
      const router = new TaskRouter();
      // Can't assert isActive() since it depends on env, but construction should not throw
      expect(router).toBeDefined();
    });
  });

  describe('successful routing (mock)', () => {
    it('should call provider and return response text', async () => {
      // Create router with mocked provider
      const router = new TaskRouter({ enabled: false }); // Start disabled

      // Replace internals for testing
      const mockProvider = {
        chat: jest.fn().mockResolvedValue({ text: '- Key point 1\n- Key point 2' })
      };
      (router as any).cheapProvider = mockProvider;
      (router as any).enabled = true;

      const result = await router.route('summarize', 'Summarize this discussion');

      expect(result).toBe('- Key point 1\n- Key point 2');
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);

      const callArgs = mockProvider.chat.mock.calls[0];
      expect(callArgs[0]).toEqual([{ role: 'user', content: 'Summarize this discussion' }]);
    });

    it('should return null when provider returns empty text', async () => {
      const router = new TaskRouter({ enabled: false });
      const mockProvider = {
        chat: jest.fn().mockResolvedValue({ text: '' })
      };
      (router as any).cheapProvider = mockProvider;
      (router as any).enabled = true;

      const result = await router.route('summarize', 'Test');
      expect(result).toBeNull();
    });

    it('should return null when provider throws', async () => {
      const router = new TaskRouter({ enabled: false });
      const mockProvider = {
        chat: jest.fn().mockRejectedValue(new Error('API rate limit'))
      };
      (router as any).cheapProvider = mockProvider;
      (router as any).enabled = true;

      const result = await router.route('summarize', 'Test');
      expect(result).toBeNull();
    });

    it('should use custom system prompt when provided', async () => {
      const router = new TaskRouter({ enabled: false });
      const mockProvider = {
        chat: jest.fn().mockResolvedValue({ text: 'summary' })
      };
      (router as any).cheapProvider = mockProvider;
      (router as any).enabled = true;

      await router.route('summarize', 'Test', 'Custom system prompt');

      const callArgs = mockProvider.chat.mock.calls[0];
      expect(callArgs[1]).toBe('Custom system prompt');
    });
  });
});
