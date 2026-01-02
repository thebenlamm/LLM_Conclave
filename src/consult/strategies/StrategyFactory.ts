/**
 * StrategyFactory - Factory for creating ModeStrategy instances
 *
 * Provides both a static class interface and a simple function for strategy resolution.
 * Default mode is 'converge' to match MVP behavior from Epic 1.
 */

import { ModeStrategy } from './ModeStrategy';
import { ExploreStrategy } from './ExploreStrategy';
import { ConvergeStrategy } from './ConvergeStrategy';

export type ModeType = 'explore' | 'converge';

/**
 * Simple function to get a strategy by mode
 *
 * @param mode - 'explore' or 'converge', defaults to 'converge'
 * @returns ModeStrategy implementation
 */
export function getStrategy(mode?: ModeType): ModeStrategy {
  if (mode === 'explore') {
    return new ExploreStrategy();
  }
  return new ConvergeStrategy();
}

/**
 * StrategyFactory class for more complex factory operations
 *
 * Provides:
 * - Strategy creation
 * - Mode validation
 * - Available mode listing
 */
export class StrategyFactory {
  /** Default mode when none specified */
  static readonly DEFAULT_MODE: ModeType = 'converge';

  /** Available strategy modes */
  private static readonly AVAILABLE_MODES: readonly ModeType[] = ['explore', 'converge'];

  /**
   * Create a ModeStrategy instance
   *
   * @param mode - 'explore' or 'converge', defaults to 'converge'
   * @returns ModeStrategy implementation
   */
  static create(mode?: ModeType): ModeStrategy {
    return getStrategy(mode);
  }

  /**
   * Get list of available strategy modes
   *
   * @returns Array of available mode names
   */
  static getAvailableModes(): readonly ModeType[] {
    return this.AVAILABLE_MODES;
  }

  /**
   * Validate if a string is a valid mode
   *
   * @param mode - String to validate
   * @returns true if valid mode, false otherwise
   */
  static isValidMode(mode: string): mode is ModeType {
    return this.AVAILABLE_MODES.includes(mode as ModeType);
  }
}
