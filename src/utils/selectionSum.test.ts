/**
 * Tests for the selection total.
 *
 * The number is arithmetic a player would otherwise do on paper, so the thing
 * worth protecting is that it never claims to know more than the board does:
 * no cell counted twice, and nothing priced that is still genuinely open.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectionSum } from './selectionSum';
import type { PuzzleDefinition } from '../types/ArithmatrixTypes';

/*
 * A 4x4 board. Every cage here has arrangements that actually exist - a cage
 * nothing can satisfy is priceless in the unhelpful sense, and an earlier
 * version of this fixture had one by accident.
 *
 *   0,1      7+   same row, so {3,4} - always 7
 *   2,3      6x   same row, so {2,3} - 1x6 needs a 6, so always 5
 *   4,5      5+   always 5
 *   6        3    stated outright
 *   7,11     2-   same column: {1,3} or {2,4} - 4 or 6, genuinely open
 *   8,9,10   9+   three distinct of 1..4 - always 9
 *   12..15   10+  a whole row - always 10
 */
const puzzle: PuzzleDefinition = {
  size: 4,
  cages: [
    { cells: [0, 1], operation: '+', value: 7 },
    { cells: [2, 3], operation: '*', value: 6 },
    { cells: [4, 5], operation: '+', value: 5 },
    { cells: [6], operation: '', value: 3 },
    { cells: [7, 11], operation: '-', value: 2 },
    { cells: [8, 9, 10], operation: '+', value: 9 },
    { cells: [12, 13, 14, 15], operation: '+', value: 10 },
  ],
};

const emptyGrid = () => Array.from({ length: 4 }, () => Array(4).fill(''));
const gridWith = (values: Record<number, number>) => {
  const grid = emptyGrid();
  for (const [index, value] of Object.entries(values)) {
    const i = Number(index);
    grid[Math.floor(i / 4)][i % 4] = String(value);
  }
  return grid;
};
const emptyMarks = () =>
  Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => new Set<string>()));
const marksWith = (notes: Record<number, number[]>) => {
  const marks = emptyMarks();
  for (const [index, values] of Object.entries(notes)) {
    const i = Number(index);
    marks[Math.floor(i / 4)][i % 4] = new Set(values.map(String));
  }
  return marks;
};
const keys = (...indexes: number[]) => indexes.map(i => `${Math.floor(i / 4)}-${i % 4}`);

describe('selectionSum', () => {
  it('reports nothing for an empty selection', () => {
    expect(selectionSum(puzzle, emptyGrid(), [])).toEqual({ total: 0, counted: 0, unknown: 0 });
  });

  it('adds up filled cells', () => {
    const grid = gridWith({ 7: 2, 11: 4 });
    expect(selectionSum(puzzle, grid, keys(7, 11))).toEqual({ total: 6, counted: 2, unknown: 0 });
  });

  it('prices a + cage at its target once the whole cage is selected', () => {
    expect(selectionSum(puzzle, emptyGrid(), keys(0, 1))).toEqual({
      total: 7,
      counted: 2,
      unknown: 0,
    });
  });

  it('will not price half a + cage', () => {
    expect(selectionSum(puzzle, emptyGrid(), keys(0))).toEqual({
      total: 0,
      counted: 0,
      unknown: 1,
    });
  });

  it('counts the filled half of a partly selected + cage, and no more', () => {
    const grid = gridWith({ 0: 3 });
    expect(selectionSum(puzzle, grid, keys(0))).toEqual({ total: 3, counted: 1, unknown: 0 });
    expect(selectionSum(puzzle, grid, keys(1))).toEqual({ total: 0, counted: 0, unknown: 1 });
  });

  it('never counts a cell twice when a filled + cage is fully selected', () => {
    const grid = gridWith({ 0: 3, 1: 4 });
    expect(selectionSum(puzzle, grid, keys(0, 1))).toEqual({
      total: 7,
      counted: 2,
      unknown: 0,
    });
  });

  it('takes a single-cell cage at its word, filled or not', () => {
    expect(selectionSum(puzzle, emptyGrid(), keys(6))).toEqual({
      total: 3,
      counted: 1,
      unknown: 0,
    });
  });

  it('prices a cage its own arithmetic pins down, with nothing filled in', () => {
    // 6x over two cells of a row can only be 2 and 3, either way round
    expect(selectionSum(puzzle, emptyGrid(), keys(2, 3))).toEqual({
      total: 5,
      counted: 2,
      unknown: 0,
    });
  });

  it('prices a cage the notes have narrowed to one multiset', () => {
    // 2- with both cells noted {1,3}: 1 and 3 either way round is 4
    const marks = marksWith({ 7: [1, 3], 11: [1, 3] });
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11), marks)).toEqual({
      total: 4,
      counted: 2,
      unknown: 0,
    });
  });

  it('cannot price a cage whose arrangements disagree on the total', () => {
    // 2- unnarrowed could be {1,3} (4) or {2,4} (6)
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11))).toEqual({
      total: 0,
      counted: 0,
      unknown: 2,
    });
  });

  it('cannot price a cage the notes leave straddling two totals', () => {
    // {1,2} against {3,4} still allows 1+3 and 2+4
    const marks = marksWith({ 7: [1, 2], 11: [3, 4] });
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11), marks)).toEqual({
      total: 0,
      counted: 0,
      unknown: 2,
    });
  });

  it("takes a lone note as the cell's value, even outside a whole cage", () => {
    const marks = marksWith({ 8: [4] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8), marks)).toEqual({
      total: 4,
      counted: 1,
      unknown: 0,
    });
  });

  it('ignores notes that rule out every value rather than trusting them', () => {
    const marks = emptyMarks();
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11), marks).unknown).toBe(2);
  });

  it('prices a whole row cage as a block, whatever is filled inside it', () => {
    const grid = gridWith({ 12: 1, 13: 2 });
    expect(selectionSum(puzzle, grid, keys(12, 13, 14, 15))).toEqual({
      total: 10,
      counted: 4,
      unknown: 0,
    });
  });

  it('mixes cages, known cells and unknowns in one selection', () => {
    // 7+ whole (7) + the stipulated 3 + half a 2-, which stays open
    expect(selectionSum(puzzle, emptyGrid(), keys(0, 1, 6, 7))).toEqual({
      total: 10,
      counted: 3,
      unknown: 1,
    });
  });

  it('prices a whole row at 1+2+3+4, whatever is written in it', () => {
    // Row 0 spans the 7+ and 6x cages; neither matters, a row is always 10
    expect(selectionSum(puzzle, emptyGrid(), keys(0, 1, 2, 3))).toEqual({
      total: 10,
      counted: 4,
      unknown: 0,
    });
  });

  it('prices a whole column the same way', () => {
    // Column 3 is cells 3, 7, 11, 15 - three different cages between them
    expect(selectionSum(puzzle, emptyGrid(), keys(3, 7, 11, 15))).toEqual({
      total: 10,
      counted: 4,
      unknown: 0,
    });
  });

  it('prices a line set that crosses cages, from the notes alone', () => {
    // Cells 8 and 9 are in the 9+ cage, 11 is in the 2- cage. All three sit in
    // row 2, and between them note only {1,2,4}, so that is what they hold.
    const marks = marksWith({ 8: [1, 2], 9: [2, 4], 11: [1, 4] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8, 9, 11), marks)).toEqual({
      total: 7,
      counted: 3,
      unknown: 0,
    });
  });

  it('will not price a line set whose notes leave a value spare', () => {
    // Four values noted between three cells: which one is left out is open
    const marks = marksWith({ 8: [1, 2], 9: [2, 4], 11: [1, 3] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8, 9, 11), marks)).toEqual({
      total: 0,
      counted: 0,
      unknown: 3,
    });
  });

  it('will not treat cells off the line as a set', () => {
    // Same notes, but cell 5 is in row 1 - nothing stops it repeating a value
    const marks = marksWith({ 8: [1, 2], 9: [2, 4], 5: [1, 4] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8, 9, 5), marks).unknown).toBe(3);
  });

  it('prefers the whole line to a cage inside it', () => {
    // Row 0 holds the whole 7+ cage. Pricing the cage first would leave the
    // other two cells adrift; the row settles all four outright.
    expect(selectionSum(puzzle, emptyGrid(), keys(0, 1, 2, 3)).unknown).toBe(0);
  });

  it('does not care what order the selection arrives in', () => {
    const grid = gridWith({ 7: 2 });
    const forward = selectionSum(puzzle, grid, keys(0, 1, 6, 7));
    const backward = selectionSum(puzzle, grid, keys(7, 6, 1, 0));
    expect(backward).toEqual(forward);
  });
});

/**
 * The fixture above is a hand-built 4x4. These run the same rules over real
 * cages from the shipped corpus, where the combinations are the ones the
 * solver actually enumerates.
 */
describe('selectionSum on shipped puzzles', () => {
  // A 7x7 carrying the full range of operations, so there is a - cage to narrow
  const record = JSON.parse(
    readFileSync('public/all_puzzles.jsonl', 'utf8')
      .split('\n')
      .find(line => {
        if (!line) return false;
        const parsed = JSON.parse(line);
        return (
          parsed.puzzle.size === 7 &&
          parsed.puzzle.cages.some(
            (c: { operation: string; cells: number[] }) =>
              c.operation === '-' && c.cells.length === 2
          )
        );
      })!
  );
  const real: PuzzleDefinition = { size: 7, cages: record.puzzle.cages };
  const blank = () => Array.from({ length: 7 }, () => Array(7).fill(''));
  const noMarks = () =>
    Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => new Set<string>()));
  const cellKeys = (cells: number[]) => cells.map(c => `${Math.floor(c / 7)}-${c % 7}`);

  it('prices every + cage at its target when the whole cage is selected', () => {
    const plusCages = real.cages.filter(c => c.operation === '+' && c.cells.length > 1);
    expect(plusCages.length).toBeGreaterThan(0);
    for (const cage of plusCages) {
      expect(selectionSum(real, blank(), cellKeys(cage.cells))).toEqual({
        total: cage.value,
        counted: cage.cells.length,
        unknown: 0,
      });
    }
  });

  it('leaves a bare two-cell subtraction open, and prices it once the notes pin it', () => {
    const minus = real.cages.find(c => c.operation === '-')!;
    expect(minus).toBeDefined();
    // Unnarrowed, a - cage spans several totals on a 7x7
    expect(selectionSum(real, blank(), cellKeys(minus.cells)).unknown).toBe(2);

    // Note both cells with one pair that satisfies it: the sum is then fixed
    const low = 1;
    const high = low + minus.value;
    const marks = noMarks();
    for (const cell of minus.cells) {
      marks[Math.floor(cell / 7)][cell % 7] = new Set([String(low), String(high)]);
    }
    expect(selectionSum(real, blank(), cellKeys(minus.cells), marks)).toEqual({
      total: low + high,
      counted: 2,
      unknown: 0,
    });
  });

  it('prices any whole row or column at 28, on an untouched board', () => {
    for (let line = 0; line < 7; line++) {
      const row = Array.from({ length: 7 }, (_, c) => line * 7 + c);
      const col = Array.from({ length: 7 }, (_, r) => r * 7 + line);
      expect(selectionSum(real, blank(), cellKeys(row))).toEqual({
        total: 28,
        counted: 7,
        unknown: 0,
      });
      expect(selectionSum(real, blank(), cellKeys(col))).toEqual({
        total: 28,
        counted: 7,
        unknown: 0,
      });
    }
  });

  it('agrees with the solution when a whole cage is filled in', () => {
    const solution: number[][] = record.puzzle.solution;
    const grid = solution.map(row => row.map(String));
    for (const cage of real.cages) {
      const expected = cage.cells.reduce(
        (sum, cell) => sum + solution[Math.floor(cell / 7)][cell % 7],
        0
      );
      expect(
        selectionSum(real, grid, cellKeys(cage.cells)).total,
        `cage ${cage.operation}${cage.value}`
      ).toBe(expected);
    }
  });
});
