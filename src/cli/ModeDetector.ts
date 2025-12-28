import * as fs from 'fs';

/**
 * Mode detection result
 */
export interface ModeDetection {
  mode: 'consensus' | 'orchestrated' | 'iterative';
  confidence: number;
  reason: string;
}

/**
 * Smart mode detector that analyzes tasks to suggest the best mode
 */
export class ModeDetector {
  /**
   * Analyze task and options to detect the best mode
   */
  static analyze(task: string, options: any = {}): ModeDetection {
    const taskLower = task.toLowerCase();

    // Rule 1: Explicit iterative keywords
    if (this.hasIterativeKeywords(taskLower)) {
      return {
        mode: 'iterative',
        confidence: 0.9,
        reason: 'Task mentions line-by-line or chunk-based processing'
      };
    }

    // Rule 2: Single file context suggests iterative
    if (options.project && this.isSingleFile(options.project)) {
      return {
        mode: 'iterative',
        confidence: 0.75,
        reason: 'Single file provided - iterative mode works well for focused file work'
      };
    }

    // Rule 3: Review/critique keywords suggest orchestrated
    if (this.hasReviewKeywords(taskLower)) {
      return {
        mode: 'orchestrated',
        confidence: 0.85,
        reason: 'Task involves review or critique - orchestrated mode provides structured feedback'
      };
    }

    // Rule 4: Design/architecture keywords suggest consensus
    if (this.hasDesignKeywords(taskLower)) {
      return {
        mode: 'consensus',
        confidence: 0.8,
        reason: 'Task involves design or architecture - consensus mode provides diverse perspectives'
      };
    }

    // Rule 5: Debugging/fixing keywords suggest orchestrated
    if (this.hasDebugKeywords(taskLower)) {
      return {
        mode: 'orchestrated',
        confidence: 0.75,
        reason: 'Task involves debugging or fixing - orchestrated mode provides focused analysis'
      };
    }

    // Rule 6: Multiple files/directory suggests consensus
    if (options.project && this.isDirectoryOrMultipleFiles(options.project)) {
      return {
        mode: 'consensus',
        confidence: 0.7,
        reason: 'Multiple files or directory - consensus mode provides broad analysis'
      };
    }

    // Rule 7: Brainstorm/discussion keywords suggest consensus
    if (this.hasBrainstormKeywords(taskLower)) {
      return {
        mode: 'consensus',
        confidence: 0.85,
        reason: 'Task involves brainstorming or discussion - consensus mode encourages diverse ideas'
      };
    }

    // Default: Consensus mode (safest, most versatile)
    return {
      mode: 'consensus',
      confidence: 0.6,
      reason: 'Default mode - consensus works well for general tasks'
    };
  }

  /**
   * Check for iterative processing keywords
   */
  private static hasIterativeKeywords(task: string): boolean {
    const keywords = [
      'line by line',
      'line-by-line',
      'chunk',
      'incrementally',
      'step by step',
      'one at a time',
      'each line',
      'each section',
      'iterate',
      'sequential',
      'chunk-by-chunk'
    ];

    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check for review/critique keywords
   */
  private static hasReviewKeywords(task: string): boolean {
    const keywords = [
      'review',
      'critique',
      'analyze',
      'evaluate',
      'assess',
      'audit',
      'examine',
      'inspect',
      'check',
      'validate'
    ];

    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check for design/architecture keywords
   */
  private static hasDesignKeywords(task: string): boolean {
    const keywords = [
      'design',
      'architect',
      'plan',
      'structure',
      'organize',
      'approach',
      'strategy',
      'pattern',
      'system design',
      'how should'
    ];

    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check for debugging/fixing keywords
   */
  private static hasDebugKeywords(task: string): boolean {
    const keywords = [
      'debug',
      'fix',
      'bug',
      'error',
      'issue',
      'problem',
      'broken',
      'not working',
      'failing',
      'crash'
    ];

    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check for brainstorm/discussion keywords
   */
  private static hasBrainstormKeywords(task: string): boolean {
    const keywords = [
      'brainstorm',
      'discuss',
      'ideas',
      'opinions',
      'perspectives',
      'thoughts',
      'what do you think',
      'consider',
      'explore',
      'possibilities'
    ];

    return keywords.some(keyword => task.includes(keyword));
  }

  /**
   * Check if path is a single file
   */
  private static isSingleFile(path: string): boolean {
    try {
      const stat = fs.statSync(path);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a directory or multiple files
   */
  private static isDirectoryOrMultipleFiles(path: string): boolean {
    try {
      const stat = fs.statSync(path);
      return stat.isDirectory();
    } catch {
      // If path doesn't exist, check if it looks like a glob pattern
      return path.includes('*') || path.includes(',');
    }
  }

  /**
   * Get suggested chunk size for iterative mode based on file
   */
  static suggestChunkSize(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').length;

      // Small files (< 50 lines): 5 lines per chunk
      if (lines < 50) return 5;

      // Medium files (50-200 lines): 10 lines per chunk
      if (lines < 200) return 10;

      // Large files (200-1000 lines): 20 lines per chunk
      if (lines < 1000) return 20;

      // Very large files: 50 lines per chunk
      return 50;
    } catch {
      // Default to 5 if can't read file
      return 5;
    }
  }

  /**
   * Get suggested number of rounds based on task complexity
   */
  static suggestRounds(task: string, modifier?: string): number {
    // User-specified modifiers
    if (modifier === 'quick') return 2;
    if (modifier === 'deep') return 7;
    if (modifier === 'thorough') return 10;

    // Analyze task complexity
    const taskLower = task.toLowerCase();

    // Complex tasks need more rounds
    const complexKeywords = ['security', 'audit', 'comprehensive', 'thorough', 'detailed'];
    if (complexKeywords.some(kw => taskLower.includes(kw))) {
      return 7;
    }

    // Simple tasks need fewer rounds
    const simpleKeywords = ['quick', 'simple', 'basic', 'brief'];
    if (simpleKeywords.some(kw => taskLower.includes(kw))) {
      return 2;
    }

    // Default: 5 rounds (good balance)
    return 5;
  }
}
