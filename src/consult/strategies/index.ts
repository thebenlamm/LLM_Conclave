/**
 * Mode Strategy exports
 *
 * This module provides the Strategy Pattern implementation for consultation modes.
 * - ExploreStrategy: Divergent "Yes, And..." reasoning for brainstorming
 * - ConvergeStrategy: Adversarial "No, Because..." reasoning for decision-making
 */

// Core interface and types
export {
  ModeStrategy,
  StrategyPromptVersions,
  AgentInfo,
  ArtifactCollection,
  COMMON_JSON_INSTRUCTION
} from './ModeStrategy';

// Strategy implementations
export { ExploreStrategy } from './ExploreStrategy';
export { ConvergeStrategy } from './ConvergeStrategy';

// Factory
export { StrategyFactory, getStrategy, ModeType } from './StrategyFactory';
