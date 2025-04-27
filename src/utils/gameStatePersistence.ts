/**
 * Utility functions for persisting game state in localStorage.
 *
 * This module provides functionality to:
 * - Save current puzzle definition and user progress to localStorage
 * - Load saved game state on app initialization
 * - Clear saved state when starting new games or completing puzzles
 */

import { PuzzleDefinition } from '../types/ArithmatrixTypes';

/**
 * Represents the complete game state that can be persisted.
 */
export type PersistedGameState = {
  /** The current puzzle definition */
  puzzleDefinition: PuzzleDefinition;
  /** The puzzle solution grid */
  solutionGrid: number[][];
  /** Current user-filled grid values */
  gridValues: string[][];
  /** Current pencil marks for each cell */
  pencilMarks: string[][];
  /** Current puzzle settings */
  puzzleSettings: {
    size: number;
    difficulty: string;
  };
  /** Game state metadata */
  metadata: {
    savedAt: Date;
    startedAt: Date;
    elapsedTime: number;
  };
};

const GAME_STATE_STORAGE_KEY = 'arithmatrix_current_game_state';

/**
 * Saves the current game state to localStorage.
 */
export const saveGameState = (
  puzzleDefinition: PuzzleDefinition,
  solutionGrid: number[][],
  gridValues: string[][],
  pencilMarks: Set<string>[][],
  puzzleSettings: { size: number; difficulty: string },
  elapsedTime: number,
  startedAt?: Date
): void => {
  try {
    // Convert pencil marks from Set[][] to string[][] for JSON serialization
    const serializedPencilMarks = pencilMarks.map(row =>
      row.map(cellSet => Array.from(cellSet).join(','))
    );

    const gameState: PersistedGameState = {
      puzzleDefinition,
      solutionGrid,
      gridValues,
      pencilMarks: serializedPencilMarks,
      puzzleSettings,
      metadata: {
        savedAt: new Date(),
        startedAt: startedAt || new Date(),
        elapsedTime,
      },
    };

    localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(gameState));
    console.log('🔄 Game state saved to localStorage:', {
      hasUserProgress: hasUserProgress(gridValues),
      gridCellsFilled: gridValues.flat().filter(cell => cell !== '').length,
      elapsedTime,
      puzzleSize: puzzleSettings.size,
      difficulty: puzzleSettings.difficulty,
    });
  } catch (error) {
    console.error('❌ Failed to save game state:', error);
  }
};

/**
 * Loads the saved game state from localStorage.
 */
export const loadGameState = (): PersistedGameState | null => {
  try {
    const stored = localStorage.getItem(GAME_STATE_STORAGE_KEY);
    if (!stored) {
      console.log('📭 No saved game state found in localStorage');
      return null;
    }

    const parsed = JSON.parse(stored);

    // Convert date strings back to Date objects
    const gameState: PersistedGameState = {
      ...parsed,
      metadata: {
        ...parsed.metadata,
        savedAt: new Date(parsed.metadata.savedAt),
        startedAt: new Date(parsed.metadata.startedAt),
      },
    };

    console.log('📦 Game state loaded from localStorage:', {
      gridCellsFilled: gameState.gridValues.flat().filter(cell => cell !== '').length,
      elapsedTime: gameState.metadata.elapsedTime,
      puzzleSize: gameState.puzzleSettings.size,
      difficulty: gameState.puzzleSettings.difficulty,
      savedAt: gameState.metadata.savedAt,
    });
    return gameState;
  } catch (error) {
    console.error('❌ Failed to load game state:', error);
    return null;
  }
};

/**
 * Converts serialized pencil marks back to Set[][] format.
 */
export const deserializePencilMarks = (serializedPencilMarks: string[][]): Set<string>[][] => {
  return serializedPencilMarks.map(row =>
    row.map(cellString => {
      if (cellString === '') return new Set<string>();
      return new Set(cellString.split(',').filter(mark => mark !== ''));
    })
  );
};

/**
 * Clears the saved game state from localStorage.
 */
export const clearGameState = (): void => {
  try {
    localStorage.removeItem(GAME_STATE_STORAGE_KEY);
    console.log('Game state cleared from localStorage');
  } catch (error) {
    console.error('Failed to clear game state:', error);
  }
};

/**
 * Checks if there is a saved game state available.
 */
export const hasSavedGameState = (): boolean => {
  return localStorage.getItem(GAME_STATE_STORAGE_KEY) !== null;
};

/**
 * Checks if a grid has any user input (not completely empty).
 */
export const hasUserProgress = (gridValues: string[][]): boolean => {
  return gridValues.some(row => row.some(cell => cell !== ''));
};
