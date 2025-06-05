/**
 * Additional game types for improved type safety
 */
import { DIFFICULTY_LEVELS, VALID_SIZES } from "../constants/gameConstants";

// Extract literal types from constants
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
export type PuzzleSize = (typeof VALID_SIZES)[number];

// Raw puzzle data structure from JSONL
export interface RawPuzzleData {
  puzzle: {
    size: number;
    cages: Array<{
      value: number;
      operation: string;
      cells: number[];
    }>;
    solution: number[][];
    difficulty_operations?: number;
  };
  metadata: {
    size: number;
    actual_difficulty: string;
    operation_count: number;
    generation_time: number;
    generated_at: string;
    generator_version: string;
  };
}

// Complete puzzle data including solution and metadata
export interface PuzzleData {
  size: PuzzleSize;
  cages: Array<{
    value: number;
    operation: string;
    cells: number[];
  }>;
  solution: number[][];
  difficulty: string;
  difficulty_operations?: number;
}

// Game state for persistence
export interface GameState {
  currentPuzzle: PuzzleData | null;
  isGameWon: boolean;
  isTimerRunning: boolean;
  resetKey: number;
  puzzleRefreshKey: number;
}

// UI interaction events
export interface GameEvents {
  onWin: () => void;
  onReset: () => void;
  onNewGame: () => void;
  onSettingsToggle: () => void;
}

// Error types for better error handling
export type PuzzleLoadError =
  | "FETCH_FAILED"
  | "PARSE_ERROR"
  | "NO_PUZZLES_FOUND"
  | "INVALID_DIFFICULTY"
  | "INVALID_SIZE";

export interface AppError {
  type: PuzzleLoadError;
  message: string;
  details?: unknown;
}
