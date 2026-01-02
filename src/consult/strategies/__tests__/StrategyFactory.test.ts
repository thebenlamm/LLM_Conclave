/**
 * Tests for StrategyFactory
 *
 * Factory pattern for creating ModeStrategy instances
 * Default: ConvergeStrategy (matches MVP behavior from Epic 1)
 */

import { StrategyFactory, getStrategy } from '../StrategyFactory';
import { ExploreStrategy } from '../ExploreStrategy';
import { ConvergeStrategy } from '../ConvergeStrategy';
import { ModeStrategy } from '../ModeStrategy';

describe('StrategyFactory', () => {
  describe('getStrategy function', () => {
    it('should return ExploreStrategy when mode is "explore"', () => {
      const strategy = getStrategy('explore');

      expect(strategy).toBeInstanceOf(ExploreStrategy);
      expect(strategy.name).toBe('explore');
    });

    it('should return ConvergeStrategy when mode is "converge"', () => {
      const strategy = getStrategy('converge');

      expect(strategy).toBeInstanceOf(ConvergeStrategy);
      expect(strategy.name).toBe('converge');
    });

    it('should default to ConvergeStrategy when mode is undefined', () => {
      const strategy = getStrategy();

      expect(strategy).toBeInstanceOf(ConvergeStrategy);
      expect(strategy.name).toBe('converge');
    });

    it('should return valid ModeStrategy interface', () => {
      const exploreStrategy: ModeStrategy = getStrategy('explore');
      const convergeStrategy: ModeStrategy = getStrategy('converge');

      expect(typeof exploreStrategy.getIndependentPrompt).toBe('function');
      expect(typeof convergeStrategy.getIndependentPrompt).toBe('function');
    });
  });

  describe('StrategyFactory class', () => {
    it('should create ExploreStrategy via factory method', () => {
      const strategy = StrategyFactory.create('explore');

      expect(strategy).toBeInstanceOf(ExploreStrategy);
    });

    it('should create ConvergeStrategy via factory method', () => {
      const strategy = StrategyFactory.create('converge');

      expect(strategy).toBeInstanceOf(ConvergeStrategy);
    });

    it('should return default strategy when mode is not specified', () => {
      const strategy = StrategyFactory.create();

      expect(strategy).toBeInstanceOf(ConvergeStrategy);
    });

    it('should expose DEFAULT_MODE constant', () => {
      expect(StrategyFactory.DEFAULT_MODE).toBe('converge');
    });

    it('should list available modes', () => {
      const modes = StrategyFactory.getAvailableModes();

      expect(modes).toContain('explore');
      expect(modes).toContain('converge');
      expect(modes.length).toBe(2);
    });

    it('should validate mode strings', () => {
      expect(StrategyFactory.isValidMode('explore')).toBe(true);
      expect(StrategyFactory.isValidMode('converge')).toBe(true);
      expect(StrategyFactory.isValidMode('invalid')).toBe(false);
      expect(StrategyFactory.isValidMode('')).toBe(false);
    });
  });

  describe('Strategy Caching (Optional)', () => {
    it('should return new instances each time (no singleton pattern)', () => {
      const strategy1 = getStrategy('explore');
      const strategy2 = getStrategy('explore');

      // Strategies are value objects, so new instances are fine
      expect(strategy1).not.toBe(strategy2);
    });
  });
});
