/**
 * Tests for saved games.
 *
 * This is the code that decides whether a player's progress survives. The
 * migration path matters especially: an in-progress game saved under the old
 * single-slot key has to carry over, and it only gets one chance to.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteGameForPuzzle,
  deserializePencilMarks,
  hasAnyProgress,
  hasSavedGames,
  hasUserProgress,
  listSavedGames,
  loadGameForPuzzle,
  mostRecentSavedGame,
  saveGame,
  savedGameSummaries,
} from './gameStatePersistence';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';

const PUZZLE_A: PuzzleDefinition = {
  size: 2,
  cages: [
    { cells: [0, 1], operation: '+', value: 3 },
    { cells: [2, 3], operation: '+', value: 3 },
  ],
};

const PUZZLE_B: PuzzleDefinition = {
  size: 2,
  cages: [
    { cells: [0, 2], operation: '+', value: 3 },
    { cells: [1, 3], operation: '+', value: 3 },
  ],
};

const emptyMarks = (size: number) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => new Set<string>()));

const save = (puzzle: PuzzleDefinition, grid: string[][], elapsed = 30, index: number | null = 1) =>
  saveGame(
    puzzle,
    [
      [1, 2],
      [2, 1],
    ],
    grid,
    emptyMarks(puzzle.size),
    { size: puzzle.size, difficulty: 'easy', operationsTier: 'all' },
    elapsed,
    new Date('2026-01-01T00:00:00Z'),
    index
  );

beforeEach(() => {
  localStorage.clear();
});

describe('saving and loading', () => {
  it('round-trips a game', () => {
    save(
      PUZZLE_A,
      [
        ['1', ''],
        ['', ''],
      ],
      42
    );

    const loaded = loadGameForPuzzle(PUZZLE_A);
    expect(loaded).not.toBeNull();
    expect(loaded!.gridValues[0][0]).toBe('1');
    expect(loaded!.elapsedTime).toBe(42);
    expect(loaded!.puzzleIndex).toBe(1);
  });

  it('keeps different puzzles apart', () => {
    save(PUZZLE_A, [
      ['1', ''],
      ['', ''],
    ]);
    save(PUZZLE_B, [
      ['2', ''],
      ['', ''],
    ]);

    expect(listSavedGames()).toHaveLength(2);
    expect(loadGameForPuzzle(PUZZLE_A)!.gridValues[0][0]).toBe('1');
    expect(loadGameForPuzzle(PUZZLE_B)!.gridValues[0][0]).toBe('2');
  });

  it('updates in place rather than accumulating', () => {
    save(
      PUZZLE_A,
      [
        ['1', ''],
        ['', ''],
      ],
      10
    );
    save(
      PUZZLE_A,
      [
        ['1', '2'],
        ['', ''],
      ],
      20
    );

    expect(listSavedGames()).toHaveLength(1);
    expect(loadGameForPuzzle(PUZZLE_A)!.elapsedTime).toBe(20);
  });

  it('is keyed by the puzzle, not its index', () => {
    // Same puzzle saved under a different index still resolves
    save(
      PUZZLE_A,
      [
        ['1', ''],
        ['', ''],
      ],
      10,
      7
    );
    save(
      PUZZLE_A,
      [
        ['1', '2'],
        ['', ''],
      ],
      20,
      99
    );
    expect(listSavedGames()).toHaveLength(1);
  });

  it('returns null for a puzzle with nothing saved', () => {
    expect(loadGameForPuzzle(PUZZLE_A)).toBeNull();
  });

  it('preserves pencil marks through serialization', () => {
    const marks = emptyMarks(2);
    marks[0][1].add('1');
    marks[0][1].add('2');
    saveGame(
      PUZZLE_A,
      [
        [1, 2],
        [2, 1],
      ],
      [
        ['', ''],
        ['', ''],
      ],
      marks,
      { size: 2, difficulty: 'easy' },
      0
    );

    const restored = deserializePencilMarks(loadGameForPuzzle(PUZZLE_A)!.pencilMarks);
    expect([...restored[0][1]].sort()).toEqual(['1', '2']);
    expect(restored[0][0].size).toBe(0);
  });
});

describe('deleting', () => {
  it('removes one game and leaves the others', () => {
    save(PUZZLE_A, [
      ['1', ''],
      ['', ''],
    ]);
    save(PUZZLE_B, [
      ['2', ''],
      ['', ''],
    ]);

    deleteGameForPuzzle(PUZZLE_A);

    expect(loadGameForPuzzle(PUZZLE_A)).toBeNull();
    expect(loadGameForPuzzle(PUZZLE_B)).not.toBeNull();
  });

  it('is a no-op for a puzzle that was never saved', () => {
    save(PUZZLE_A, [
      ['1', ''],
      ['', ''],
    ]);
    deleteGameForPuzzle(PUZZLE_B);
    expect(listSavedGames()).toHaveLength(1);
  });
});

describe('mostRecentSavedGame', () => {
  it('returns null with nothing saved', () => {
    expect(mostRecentSavedGame()).toBeNull();
    expect(hasSavedGames()).toBe(false);
  });

  it('returns the game saved last', async () => {
    save(PUZZLE_A, [
      ['1', ''],
      ['', ''],
    ]);
    // savedAt has millisecond resolution; make the order unambiguous
    await new Promise(resolve => setTimeout(resolve, 5));
    save(PUZZLE_B, [
      ['2', ''],
      ['', ''],
    ]);

    expect(mostRecentSavedGame()!.gridValues[0][0]).toBe('2');
  });
});

describe('savedGameSummaries', () => {
  it('reports progress for the gallery', () => {
    save(
      PUZZLE_A,
      [
        ['1', '2'],
        ['', ''],
      ],
      75
    );

    const summary = [...savedGameSummaries().values()][0];
    expect(summary.elapsedTime).toBe(75);
    expect(summary.filledCells).toBe(2);
    expect(summary.totalCells).toBe(4);
  });
});

describe('migration from the old single-slot key', () => {
  it('carries an in-progress game over', () => {
    localStorage.setItem(
      'arithmatrix_current_game_state',
      JSON.stringify({
        puzzleDefinition: PUZZLE_A,
        solutionGrid: [
          [1, 2],
          [2, 1],
        ],
        gridValues: [
          ['1', ''],
          ['', ''],
        ],
        pencilMarks: [
          ['', ''],
          ['', ''],
        ],
        puzzleSettings: { size: 2, difficulty: 'easy', operationsTier: 'all' },
        metadata: {
          savedAt: '2026-01-01T00:00:00Z',
          startedAt: '2026-01-01T00:00:00Z',
          elapsedTime: 99,
        },
      })
    );

    const loaded = loadGameForPuzzle(PUZZLE_A);
    expect(loaded).not.toBeNull();
    expect(loaded!.elapsedTime).toBe(99);
    // and the old key is retired so it cannot be migrated twice
    expect(localStorage.getItem('arithmatrix_current_game_state')).toBeNull();
  });

  it('survives an unparseable legacy record', () => {
    localStorage.setItem('arithmatrix_current_game_state', 'not json');
    expect(() => listSavedGames()).not.toThrow();
    expect(localStorage.getItem('arithmatrix_current_game_state')).toBeNull();
  });
});

describe('progress predicates', () => {
  it('sees a value as progress', () => {
    expect(
      hasUserProgress([
        ['', ''],
        ['1', ''],
      ])
    ).toBe(true);
    expect(
      hasUserProgress([
        ['', ''],
        ['', ''],
      ])
    ).toBe(false);
  });

  it('counts a lone pencil mark as progress worth keeping', () => {
    const marks = emptyMarks(2);
    marks[1][1].add('3');
    expect(
      hasAnyProgress(
        [
          ['', ''],
          ['', ''],
        ],
        marks
      )
    ).toBe(true);
    expect(
      hasAnyProgress(
        [
          ['', ''],
          ['', ''],
        ],
        emptyMarks(2)
      )
    ).toBe(false);
  });
});
