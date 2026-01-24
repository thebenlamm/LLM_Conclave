import { CostTracker, CallLog } from '../CostTracker';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    // Get a fresh instance
    // Note: CostTracker is a singleton, so we need to access its internal state
    tracker = CostTracker.getInstance();
    // Clear previous logs by accessing the private logs array through reflection
    (tracker as any).logs = [];
  });

  describe('Singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CostTracker.getInstance();
      const instance2 = CostTracker.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('logCall', () => {
    it('should log a call with calculated cost', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        latency: 1500,
        success: true
      });

      const logs = tracker.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].cost).toBeGreaterThan(0);
    });

    it('should calculate cost correctly for known models', () => {
      // gpt-4o pricing: input $0.0025/1K, output $0.01/1K
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 1000,
        latency: 1000,
        success: true
      });

      const logs = tracker.getLogs();
      // Expected: (1000/1000 * 0.0025) + (1000/1000 * 0.01) = 0.0025 + 0.01 = 0.0125
      expect(logs[0].cost).toBeCloseTo(0.0125, 4);
    });

    it('should handle unknown models with zero cost', () => {
      tracker.logCall({
        provider: 'unknown',
        model: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 1000,
        latency: 1000,
        success: true
      });

      const logs = tracker.getLogs();
      expect(logs[0].cost).toBe(0);
    });

    it('should preserve all call metadata', () => {
      tracker.logCall({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        inputTokens: 500,
        outputTokens: 200,
        latency: 2000,
        success: false
      });

      const logs = tracker.getLogs();
      expect(logs[0].provider).toBe('anthropic');
      expect(logs[0].model).toBe('claude-sonnet-4-5');
      expect(logs[0].inputTokens).toBe(500);
      expect(logs[0].outputTokens).toBe(200);
      expect(logs[0].latency).toBe(2000);
      expect(logs[0].success).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('should return correct totals for empty logs', () => {
      const summary = tracker.getSummary();
      expect(summary.totalCost).toBe(0);
      expect(summary.totalCalls).toBe(0);
      expect(summary.totalTokens.input).toBe(0);
      expect(summary.totalTokens.output).toBe(0);
      expect(summary.averageLatency).toBe(0);
    });

    it('should calculate correct totals for single call', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        latency: 1500,
        success: true
      });

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(1);
      expect(summary.totalTokens.input).toBe(1000);
      expect(summary.totalTokens.output).toBe(500);
      expect(summary.averageLatency).toBe(1500);
    });

    it('should calculate correct totals for multiple calls', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        latency: 1000,
        success: true
      });

      tracker.logCall({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        inputTokens: 2000,
        outputTokens: 1000,
        latency: 2000,
        success: true
      });

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalTokens.input).toBe(3000);
      expect(summary.totalTokens.output).toBe(1500);
      expect(summary.averageLatency).toBe(1500); // (1000 + 2000) / 2
    });

    it('should accumulate costs correctly', () => {
      // Two calls with known pricing
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000, // $0.0025
        outputTokens: 1000, // $0.01
        latency: 1000,
        success: true
      });

      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputTokens: 1000, // $0.00015
        outputTokens: 1000, // $0.0006
        latency: 500,
        success: true
      });

      const summary = tracker.getSummary();
      // gpt-4o: 0.0025 + 0.01 = 0.0125
      // gpt-4o-mini: 0.00015 + 0.0006 = 0.00075
      // Total: 0.0125 + 0.00075 = 0.01325
      expect(summary.totalCost).toBeCloseTo(0.01325, 4);
    });
  });

  describe('getLogs', () => {
    it('should return all logged calls', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        latency: 500,
        success: true
      });

      tracker.logCall({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        inputTokens: 200,
        outputTokens: 100,
        latency: 1000,
        success: true
      });

      const logs = tracker.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].model).toBe('gpt-4o');
      expect(logs[1].model).toBe('claude-sonnet-4-5');
    });
  });

  describe('Pricing accuracy', () => {
    const pricingTests: { model: string; inputCost: number; outputCost: number }[] = [
      { model: 'gpt-4o', inputCost: 0.0025, outputCost: 0.01 },
      { model: 'gpt-4o-mini', inputCost: 0.00015, outputCost: 0.0006 },
      { model: 'gpt-3.5-turbo', inputCost: 0.0005, outputCost: 0.0015 },
      { model: 'claude-sonnet-4-5', inputCost: 0.003, outputCost: 0.015 },
      { model: 'claude-opus-4-5', inputCost: 0.005, outputCost: 0.025 },
      { model: 'claude-haiku-4-5', inputCost: 0.001, outputCost: 0.005 },
      { model: 'gemini-2.0-flash', inputCost: 0.00035, outputCost: 0.00105 },
      { model: 'mistral-large-latest', inputCost: 0.008, outputCost: 0.024 },
    ];

    pricingTests.forEach(({ model, inputCost, outputCost }) => {
      it(`should calculate correct cost for ${model}`, () => {
        // Clear logs
        (tracker as any).logs = [];

        tracker.logCall({
          provider: 'test',
          model,
          inputTokens: 1000,
          outputTokens: 1000,
          latency: 1000,
          success: true
        });

        const logs = tracker.getLogs();
        const expectedCost = inputCost + outputCost;
        expect(logs[0].cost).toBeCloseTo(expectedCost, 5);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle zero tokens', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 0,
        outputTokens: 0,
        latency: 100,
        success: true
      });

      const logs = tracker.getLogs();
      expect(logs[0].cost).toBe(0);
    });

    it('should handle very large token counts', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000000, // 1M tokens
        outputTokens: 500000, // 500K tokens
        latency: 60000,
        success: true
      });

      const logs = tracker.getLogs();
      // 1M input @ $0.0025/1K = $2.50
      // 500K output @ $0.01/1K = $5.00
      // Total = $7.50
      expect(logs[0].cost).toBeCloseTo(7.5, 2);
    });

    it('should track failed calls', () => {
      tracker.logCall({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 0,
        latency: 5000,
        success: false
      });

      const summary = tracker.getSummary();
      expect(summary.totalCalls).toBe(1);

      const logs = tracker.getLogs();
      expect(logs[0].success).toBe(false);
    });
  });
});
