/**
 * Persistence for games in progress.
 *
 * Every puzzle you start is kept until you finish it or clear the board, so
 * switching puzzles never loses anything and any of them can be resumed later.
 *
 * Games are keyed by the puzzle's canonical cage signature rather than by its
 * index in the database. The signature is derivable from the puzzle itself, so
 * a save works before the catalog has loaded and survives the database being
 * regenerated with different line numbers.
 */

import { PuzzleDefinition } from '../types/ArithmatrixTypes';
import { canonicalCagesSig } from './puzzleCatalog';

/** One puzzle in progress. Pencil marks are serialized for JSON. */
export type SavedGame = {
  /** Canonical cage signature - the key */
  cagesSig: string;
  /** Line index in the puzzle database, when it was known at save time */
  puzzleIndex: number | null;
  puzzleDefinition: PuzzleDefinition;
  solutionGrid: number[][];
  gridValues: string[][];
  pencilMarks: string[][];
  puzzleSettings: {
    size: number;
    difficulty: string;
    operationsTier?: string;
  };
  elapsedTime: number;
  /** ISO strings; JSON has no date type */
  startedAt: string;
  savedAt: string;
};

const SAVED_GAMES_KEY = 'arithmatrix_saved_games';
const LEGACY_SINGLE_GAME_KEY = 'arithmatrix_current_game_state';

/**
 * Most recent games to keep. Each is a couple of KB, so this is far below any
 * storage limit while still bounding unbounded growth.
 */
const MAX_SAVED_GAMES = 40;

type SavedGameMap = Record<string, SavedGame>;

/**
 * Reads the store, folding in a game saved under the old single-slot key so an
 * in-progress puzzle survives the upgrade.
 */
const readAll = (): SavedGameMap => {
  let games: SavedGameMap = {};
  try {
    const stored = localStorage.getItem(SAVED_GAMES_KEY);
    if (stored) games = JSON.parse(stored) as SavedGameMap;
  } catch (error) {
    console.error('Failed to read saved games:', error);
    games = {};
  }

  try {
    const legacy = localStorage.getItem(LEGACY_SINGLE_GAME_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const sig = canonicalCagesSig(parsed.puzzleDefinition.cages);
      if (!games[sig]) {
        games[sig] = {
          cagesSig: sig,
          puzzleIndex: null,
          puzzleDefinition: parsed.puzzleDefinition,
          solutionGrid: parsed.solutionGrid,
          gridValues: parsed.gridValues,
          pencilMarks: parsed.pencilMarks,
          puzzleSettings: parsed.puzzleSettings,
          elapsedTime: parsed.metadata?.elapsedTime ?? 0,
          startedAt: parsed.metadata?.startedAt ?? new Date().toISOString(),
          savedAt: parsed.metadata?.savedAt ?? new Date().toISOString(),
        };
        writeAll(games);
      }
      localStorage.removeItem(LEGACY_SINGLE_GAME_KEY);
    }
  } catch (error) {
    console.error('Failed to migrate legacy saved game:', error);
    localStorage.removeItem(LEGACY_SINGLE_GAME_KEY);
  }

  return games;
};

const writeAll = (games: SavedGameMap): void => {
  try {
    let entries = Object.values(games);
    if (entries.length > MAX_SAVED_GAMES) {
      entries = entries
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, MAX_SAVED_GAMES);
    }
    const trimmed: SavedGameMap = {};
    for (const entry of entries) trimmed[entry.cagesSig] = entry;
    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to write saved games:', error);
  }
};

/** Saves (or updates) the game in progress for one puzzle. */
export const saveGame = (
  puzzleDefinition: PuzzleDefinition,
  solutionGrid: number[][],
  gridValues: string[][],
  pencilMarks: Set<string>[][],
  puzzleSettings: { size: number; difficulty: string; operationsTier?: string },
  elapsedTime: number,
  startedAt?: Date,
  puzzleIndex?: number | null
): void => {
  const cagesSig = canonicalCagesSig(puzzleDefinition.cages);
  const games = readAll();
  games[cagesSig] = {
    cagesSig,
    puzzleIndex: puzzleIndex ?? null,
    puzzleDefinition,
    solutionGrid,
    gridValues,
    pencilMarks: pencilMarks.map(row => row.map(cellSet => Array.from(cellSet).join(','))),
    puzzleSettings,
    elapsedTime,
    // Keep the original start time across saves
    startedAt: (startedAt ?? new Date()).toISOString(),
    savedAt: new Date().toISOString(),
  };
  writeAll(games);
};

/** The game in progress for a puzzle, if there is one. */
export const loadGame = (cagesSig: string): SavedGame | null => readAll()[cagesSig] ?? null;

/** Looks up by the puzzle itself, for callers that have the definition. */
export const loadGameForPuzzle = (puzzleDefinition: PuzzleDefinition): SavedGame | null =>
  loadGame(canonicalCagesSig(puzzleDefinition.cages));

/** Every game in progress, most recently played first. */
export const listSavedGames = (): SavedGame[] =>
  Object.values(readAll()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

/** The game to drop the player back into on startup. */
export const mostRecentSavedGame = (): SavedGame | null => listSavedGames()[0] ?? null;

export const hasSavedGames = (): boolean => Object.keys(readAll()).length > 0;

/** Forgets one puzzle's progress - on completion, or when its board is cleared. */
export const deleteGame = (cagesSig: string): void => {
  const games = readAll();
  if (cagesSig in games) {
    delete games[cagesSig];
    writeAll(games);
  }
};

export const deleteGameForPuzzle = (puzzleDefinition: PuzzleDefinition): void =>
  deleteGame(canonicalCagesSig(puzzleDefinition.cages));

/** Progress summaries for the gallery, keyed by cage signature. */
export type SavedGameSummary = {
  elapsedTime: number;
  filledCells: number;
  totalCells: number;
  savedAt: string;
  puzzleIndex: number | null;
};

export const savedGameSummaries = (): Map<string, SavedGameSummary> => {
  const summaries = new Map<string, SavedGameSummary>();
  for (const game of listSavedGames()) {
    const size = game.puzzleDefinition.size;
    summaries.set(game.cagesSig, {
      elapsedTime: game.elapsedTime,
      filledCells: game.gridValues.flat().filter(cell => cell !== '').length,
      totalCells: size * size,
      savedAt: game.savedAt,
      puzzleIndex: game.puzzleIndex,
    });
  }
  return summaries;
};

/** Converts serialized pencil marks back to Set[][] format. */
export const deserializePencilMarks = (serializedPencilMarks: string[][]): Set<string>[][] =>
  serializedPencilMarks.map(row =>
    row.map(cellString =>
      cellString === '' ? new Set<string>() : new Set(cellString.split(',').filter(Boolean))
    )
  );

/** True when the grid has any value entered. */
export const hasUserProgress = (gridValues: string[][]): boolean =>
  gridValues.some(row => row.some(cell => cell !== ''));

/** True when there is anything worth keeping - a value or a pencil mark. */
export const hasAnyProgress = (gridValues: string[][], pencilMarks: Set<string>[][]): boolean =>
  hasUserProgress(gridValues) || pencilMarks.some(row => row.some(cell => cell.size > 0));
