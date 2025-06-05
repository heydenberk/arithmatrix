/**
 * Utility functions for managing puzzle statistics in localStorage.
 *
 * This module provides functionality to:
 * - Save completed puzzle statistics to localStorage
 * - Query and analyze saved puzzle statistics
 * - Bind query functions to the window object for debugging/analysis
 */

import { PuzzleDefinition } from '../types/KenkenTypes';

/**
 * Represents a completed puzzle record with all relevant statistics.
 */
export type CompletedPuzzleStats = {
  /** Unique identifier for this puzzle completion */
  id: string;
  /** Timestamp when the puzzle was completed */
  completedAt: Date;
  /** Time taken to complete the puzzle in seconds */
  completionTimeSeconds: number;
  /** The complete puzzle definition */
  puzzle: PuzzleDefinition;
  /** The difficulty level selected by the user */
  difficultyLevel: string;
  /** The puzzle size (e.g., 4, 5, 6, 7) */
  size: number;
  /** Number of difficulty operations (measure of complexity) */
  difficultyOperations?: number;
};

/**
 * Statistics summary for analysis.
 */
export type PuzzleStatsSummary = {
  /** Total number of completed puzzles */
  totalCompleted: number;
  /** Average completion time in seconds */
  averageCompletionTime: number;
  /** Fastest completion time in seconds */
  fastestTime: number;
  /** Slowest completion time in seconds */
  slowestTime: number;
  /** Breakdown by difficulty level */
  byDifficulty: Record<
    string,
    {
      count: number;
      averageTime: number;
      fastestTime: number;
    }
  >;
  /** Breakdown by puzzle size */
  bySize: Record<
    number,
    {
      count: number;
      averageTime: number;
      fastestTime: number;
    }
  >;
  /** Recent completions (last 10) */
  recentCompletions: CompletedPuzzleStats[];
};

const STORAGE_KEY = 'kenken_puzzle_stats';

/**
 * Saves a completed puzzle's statistics to localStorage.
 */
export const saveCompletedPuzzle = (
  puzzle: PuzzleDefinition,
  difficultyLevel: string,
  completionTimeSeconds: number
): void => {
  try {
    const stats: CompletedPuzzleStats = {
      id: generatePuzzleId(),
      completedAt: new Date(),
      completionTimeSeconds,
      puzzle,
      difficultyLevel,
      size: puzzle.size,
      difficultyOperations: puzzle.difficulty_operations,
    };

    const existingStats = getStoredStats();
    existingStats.push(stats);

    // Keep only the last 1000 puzzles to prevent localStorage bloat
    if (existingStats.length > 1000) {
      existingStats.splice(0, existingStats.length - 1000);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingStats));

    console.log('Puzzle stats saved:', stats);
  } catch (error) {
    console.error('Failed to save puzzle stats:', error);
  }
};

/**
 * Retrieves all stored puzzle statistics from localStorage.
 */
export const getStoredStats = (): CompletedPuzzleStats[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    // Convert date strings back to Date objects
    return parsed.map((stat: any) => ({
      ...stat,
      completedAt: new Date(stat.completedAt),
    }));
  } catch (error) {
    console.error('Failed to load puzzle stats:', error);
    return [];
  }
};

/**
 * Generates a comprehensive statistics summary from all completed puzzles.
 */
export const generateStatsSummary = (): PuzzleStatsSummary => {
  const stats = getStoredStats();

  if (stats.length === 0) {
    return {
      totalCompleted: 0,
      averageCompletionTime: 0,
      fastestTime: 0,
      slowestTime: 0,
      byDifficulty: {},
      bySize: {},
      recentCompletions: [],
    };
  }

  const times = stats.map(s => s.completionTimeSeconds);
  const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const fastestTime = Math.min(...times);
  const slowestTime = Math.max(...times);

  // Group by difficulty
  const byDifficulty: Record<string, { count: number; averageTime: number; fastestTime: number }> =
    {};
  stats.forEach(stat => {
    if (!byDifficulty[stat.difficultyLevel]) {
      byDifficulty[stat.difficultyLevel] = {
        count: 0,
        averageTime: 0,
        fastestTime: Infinity,
      };
    }

    const diffStats = byDifficulty[stat.difficultyLevel];
    diffStats.count++;
    diffStats.averageTime =
      (diffStats.averageTime * (diffStats.count - 1) + stat.completionTimeSeconds) /
      diffStats.count;
    diffStats.fastestTime = Math.min(diffStats.fastestTime, stat.completionTimeSeconds);
  });

  // Group by size
  const bySize: Record<number, { count: number; averageTime: number; fastestTime: number }> = {};
  stats.forEach(stat => {
    if (!bySize[stat.size]) {
      bySize[stat.size] = {
        count: 0,
        averageTime: 0,
        fastestTime: Infinity,
      };
    }

    const sizeStats = bySize[stat.size];
    sizeStats.count++;
    sizeStats.averageTime =
      (sizeStats.averageTime * (sizeStats.count - 1) + stat.completionTimeSeconds) /
      sizeStats.count;
    sizeStats.fastestTime = Math.min(sizeStats.fastestTime, stat.completionTimeSeconds);
  });

  // Recent completions (last 10, sorted by completion time descending)
  const recentCompletions = [...stats]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, 10);

  return {
    totalCompleted: stats.length,
    averageCompletionTime: averageTime,
    fastestTime,
    slowestTime,
    byDifficulty,
    bySize,
    recentCompletions,
  };
};

/**
 * Queries puzzles by specific criteria.
 */
export const queryPuzzles = (criteria: {
  difficultyLevel?: string;
  size?: number;
  minTime?: number;
  maxTime?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): CompletedPuzzleStats[] => {
  let results = getStoredStats();

  if (criteria.difficultyLevel) {
    results = results.filter(stat => stat.difficultyLevel === criteria.difficultyLevel);
  }

  if (criteria.size) {
    results = results.filter(stat => stat.size === criteria.size);
  }

  if (criteria.minTime !== undefined) {
    results = results.filter(stat => stat.completionTimeSeconds >= criteria.minTime!);
  }

  if (criteria.maxTime !== undefined) {
    results = results.filter(stat => stat.completionTimeSeconds <= criteria.maxTime!);
  }

  if (criteria.startDate) {
    results = results.filter(stat => stat.completedAt >= criteria.startDate!);
  }

  if (criteria.endDate) {
    results = results.filter(stat => stat.completedAt <= criteria.endDate!);
  }

  // Sort by completion time (most recent first)
  results.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  if (criteria.limit) {
    results = results.slice(0, criteria.limit);
  }

  return results;
};

/**
 * Clears all stored puzzle statistics.
 */
export const clearAllStats = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('All puzzle stats cleared');
  } catch (error) {
    console.error('Failed to clear puzzle stats:', error);
  }
};

/**
 * Exports all puzzle statistics as a JSON string for backup/analysis.
 */
export const exportStats = (): string => {
  const stats = getStoredStats();
  return JSON.stringify(stats, null, 2);
};

/**
 * Imports puzzle statistics from a JSON string.
 */
export const importStats = (jsonData: string): boolean => {
  try {
    const stats = JSON.parse(jsonData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    console.log('Puzzle stats imported successfully');
    return true;
  } catch (error) {
    console.error('Failed to import puzzle stats:', error);
    return false;
  }
};

/**
 * Generates a unique ID for a puzzle completion.
 */
const generatePuzzleId = (): string => {
  return `puzzle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Formats completion time in a human-readable format.
 */
export const formatCompletionTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

/**
 * Binds query functions to the window object for easy access in dev tools.
 * Call this function once during app initialization.
 */
export const bindStatsToWindow = (): void => {
  if (typeof window !== 'undefined') {
    (window as any).puzzleStats = {
      getAll: getStoredStats,
      getSummary: generateStatsSummary,
      query: queryPuzzles,
      clear: clearAllStats,
      export: exportStats,
      import: importStats,
      formatTime: formatCompletionTime,
    };

    console.log('Puzzle stats functions bound to window.puzzleStats');
    console.log(
      'Available functions: getAll(), getSummary(), query(criteria), clear(), export(), import(data), formatTime(seconds)'
    );
  }
};
