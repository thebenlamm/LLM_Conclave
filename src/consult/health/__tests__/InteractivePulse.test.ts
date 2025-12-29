import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import inquirer from 'inquirer';
import { InteractivePulse, AgentStatus } from '../InteractivePulse';

// Mock inquirer
jest.mock('inquirer');

describe('InteractivePulse', () => {
  let pulse: InteractivePulse;

  beforeEach(() => {
    jest.useFakeTimers();
    pulse = new InteractivePulse();
  });

  afterEach(() => {
    pulse.cleanup();
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('Timer Management', () => {
    it('should start a timer for an agent', () => {
      const callback = jest.fn();
      pulse.startTimer('Agent1', callback);

      // Verify timer started but callback not called yet
      expect(callback).not.toHaveBeenCalled();

      // Fast-forward 30s - still not called
      jest.advanceTimersByTime(30000);
      expect(callback).not.toHaveBeenCalled();

      // Fast-forward another 30s (total 60s) - should be called
      jest.advanceTimersByTime(30000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should cancel a timer for an agent', () => {
      const callback = jest.fn();
      pulse.startTimer('Agent1', callback);

      pulse.cancelTimer('Agent1');

      // Fast-forward past 60s
      jest.advanceTimersByTime(61000);

      // Callback should NOT have been called
      expect(callback).not.toHaveBeenCalled();
    });

    it('should track elapsed time', () => {
      const callback = jest.fn();
      pulse.startTimer('Agent1', callback);

      // Advance 10s
      jest.advanceTimersByTime(10000);

      const elapsed = pulse.getElapsedSeconds('Agent1');
      // Allow small delta for execution time
      expect(elapsed).toBeGreaterThanOrEqual(10);
      expect(elapsed).toBeLessThan(11);
    });

    it('should return 0 elapsed time for unknown agent', () => {
      expect(pulse.getElapsedSeconds('UnknownAgent')).toBe(0);
    });
  });

  describe('Running Agents Tracking', () => {
    it('should identify agents running longer than 60s', () => {
      const callback = jest.fn();
      
      const now = new Date().getTime();
      jest.setSystemTime(now);
      
      pulse.startTimer('SlowAgent', callback);
      
      // Advance 61s
      jest.setSystemTime(now + 61000);
      
      pulse.startTimer('FastAgent', callback);
      
      const running = pulse.getRunningAgents();
      
      expect(running).toHaveLength(1);
      expect(running[0].name).toBe('SlowAgent');
      expect(running[0].elapsedSeconds).toBeGreaterThanOrEqual(61);
    });
  });

  describe('User Interaction', () => {
    it('should prompt user when agents are waiting', async () => {
      const agents: AgentStatus[] = [
        { name: 'Agent1', elapsedSeconds: 70, startTime: new Date() }
      ];

      // Mock user saying "Yes"
      (inquirer.prompt as any).mockResolvedValue({ shouldContinue: true });

      const result = await pulse.promptUserToContinue(agents);

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when user cancels', async () => {
      const agents: AgentStatus[] = [
        { name: 'Agent1', elapsedSeconds: 70, startTime: new Date() }
      ];

      // Mock user saying "No"
      (inquirer.prompt as any).mockResolvedValue({ shouldContinue: false });

      const result = await pulse.promptUserToContinue(agents);

      expect(result).toBe(false);
    });

    it('should auto-continue if no agents are waiting', async () => {
      const result = await pulse.promptUserToContinue([]);
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
