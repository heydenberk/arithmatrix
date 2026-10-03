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
 * A 4x4 board, its cages read off a real Latin square so they cannot
 * contradict each other - two earlier versions of this fixture quietly could
 * not be solved at all, which makes every expectation about them meaningless.
 *
 *   1 2 3 4        0,1    +3    2,3   x12   (only 3 and 4, so always 7)
 *   2 1 4 3        4,5    +3    6     =4
 *   3 4 1 2        7,11   -1    8,9,10 +8
 *   4 3 2 1        12..15 +10
 */
const puzzle: PuzzleDefinition = {
  size: 4,
  cages: [
    { cells: [0, 1], operation: '+', value: 3 },
    { cells: [2, 3], operation: '*', value: 12 },
    { cells: [4, 5], operation: '+', value: 3 },
    { cells: [6], operation: '', value: 4 },
    { cells: [7, 11], operation: '-', value: 1 },
    { cells: [8, 9, 10], operation: '+', value: 8 },
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
    const grid = gridWith({ 7: 3, 11: 2 });
    expect(selectionSum(puzzle, grid, keys(7, 11))).toEqual({ total: 5, counted: 2, unknown: 0 });
  });

  it('prices a + cage at its target once the whole cage is selected', () => {
    expect(selectionSum(puzzle, emptyGrid(), keys(0, 1))).toEqual({
      total: 3,
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
    const grid = gridWith({ 0: 1 });
    expect(selectionSum(puzzle, grid, keys(0))).toEqual({ total: 1, counted: 1, unknown: 0 });
    expect(selectionSum(puzzle, grid, keys(1))).toEqual({ total: 0, counted: 0, unknown: 1 });
  });

  it('never counts a cell twice when a filled + cage is fully selected', () => {
    const grid = gridWith({ 0: 1, 1: 2 });
    expect(selectionSum(puzzle, grid, keys(0, 1))).toEqual({
      total: 3,
      counted: 2,
      unknown: 0,
    });
  });

  it('takes a single-cell cage at its word, filled or not', () => {
    expect(selectionSum(puzzle, emptyGrid(), keys(6))).toEqual({
      total: 4,
      counted: 1,
      unknown: 0,
    });
  });

  it('prices a cage its own arithmetic pins down, with nothing filled in', () => {
    // 12x over two cells of a row can only be 3 and 4, either way round
    expect(selectionSum(puzzle, emptyGrid(), keys(2, 3))).toEqual({
      total: 7,
      counted: 2,
      unknown: 0,
    });
  });

  it('prices a cage the notes have narrowed to one multiset', () => {
    // 1- with both cells noted {2,3}: 2 and 3 either way round is 5
    const marks = marksWith({ 7: [2, 3], 11: [2, 3] });
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11), marks)).toEqual({
      total: 5,
      counted: 2,
      unknown: 0,
    });
  });

  it('cannot price a cage whose arrangements disagree on the total', () => {
    // 1- unnarrowed spans {1,2} (3), {2,3} (5) and {3,4} (7)
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11))).toEqual({
      total: 0,
      counted: 0,
      unknown: 2,
    });
  });

  it('cannot price a cage the notes leave straddling two totals', () => {
    const marks = marksWith({ 7: [1, 2], 11: [2, 3] });
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
    const grid = gridWith({ 12: 4, 13: 3 });
    expect(selectionSum(puzzle, grid, keys(12, 13, 14, 15))).toEqual({
      total: 10,
      counted: 4,
      unknown: 0,
    });
  });

  it('prices a whole row at 1+2+3+4, whatever is written in it', () => {
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
    // 8 and 9 are in the +8 cage, 11 in the 1- cage. All three sit in row 2
    // and between them note only {1,2,4}, so that is what they hold.
    const marks = marksWith({ 8: [1, 2], 9: [2, 4], 11: [1, 4] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8, 9, 11), marks)).toEqual({
      total: 7,
      counted: 3,
      unknown: 0,
    });
  });

  it('will not price a line set whose notes leave a value spare', () => {
    const marks = marksWith({ 8: [1, 2], 9: [2, 4], 11: [1, 3] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8, 9, 11), marks)).toEqual({
      total: 0,
      counted: 0,
      unknown: 3,
    });
  });

  it('will not treat cells off the line as a set', () => {
    const marks = marksWith({ 8: [1, 2], 9: [2, 4], 5: [1, 4] });
    expect(selectionSum(puzzle, emptyGrid(), keys(8, 9, 5), marks).unknown).toBe(3);
  });

  it('does not care what order the selection arrives in', () => {
    const grid = gridWith({ 7: 3 });
    const forward = selectionSum(puzzle, grid, keys(0, 1, 6, 7));
    const backward = selectionSum(puzzle, grid, keys(7, 6, 1, 0));
    expect(backward).toEqual(forward);
  });

  /*
   * The total is watched while cells are being picked out, so it going down
   * as the selection grows reads as the thing being broken - whatever the
   * number means. These are the shapes that used to do it.
   */
  describe('never falls as the selection grows', () => {
    it('keeps a locked pair when a cell with other notes joins its line', () => {
      // The pair was dropped outright: the test for a locked set was taken
      // across everything selected in the line at once, all or nothing
      const marks = marksWith({ 8: [1, 2], 9: [1, 2], 10: [3, 4] });
      const pair = selectionSum(puzzle, emptyGrid(), keys(8, 9), marks);
      expect(pair.total).toBe(3);
      const withThird = selectionSum(puzzle, emptyGrid(), keys(8, 9, 10), marks);
      expect(withThird.total).toBeGreaterThanOrEqual(pair.total);
    });

    it('does not spend a line on cells worth more to their cages', () => {
      // Completing row 0 offers a group worth 10; the two cages inside it are
      // worth 10 between them as well, and claiming the row first used to
      // strand whatever those cages reached outside it
      const grid = gridWith({ 4: 2, 5: 1 });
      const before = selectionSum(puzzle, grid, keys(0, 1, 2, 4, 5));
      const after = selectionSum(puzzle, grid, keys(0, 1, 2, 3, 4, 5));
      expect(after.total).toBeGreaterThanOrEqual(before.total);
    });

    it('holds for every cell added, over a filled and noted board', () => {
      const grid = gridWith({ 0: 1, 6: 4, 12: 4, 15: 1 });
      const marks = marksWith({ 2: [3, 4], 3: [3, 4], 8: [1, 3], 9: [2, 4], 11: [2] });
      const order = [6, 2, 11, 0, 9, 3, 15, 8, 12, 1, 5, 10, 7, 4, 13, 14];
      const selection: number[] = [];
      let previous = 0;
      for (const cell of order) {
        selection.push(cell);
        const { total } = selectionSum(puzzle, grid, keys(...selection), marks);
        expect(total, `fell after adding cell ${cell}`).toBeGreaterThanOrEqual(previous);
        previous = total;
      }
    });
  });
});

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

/**
 * The same guarantee over real cages, filled and noted boards: picking out one
 * more cell can only ever leave the total where it was or raise it. Every way
 * of reading a selection is still open once a cell is added to it, so the best
 * reading cannot get worse - and the total falling while cells are being
 * picked out is the one thing that reads as broken.
 */
describe('the total never falls on real puzzles', () => {
  const records = readFileSync('public/all_puzzles.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((_, i) => i === 0 || i === 2400 || i === 3900)
    .map(line => JSON.parse(line));

  for (const record of records) {
    const size: number = record.puzzle.size;
    const solution: number[][] = record.puzzle.solution;
    const real: PuzzleDefinition = { size, cages: record.puzzle.cages };

    it(`${size}x${size}, over a board part filled and part noted`, () => {
      // Fixed arrangement rather than a random one, so a failure is reproducible
      const grid = Array.from({ length: size }, () => Array(size).fill(''));
      const marks = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => new Set<string>())
      );
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const n = r * size + c;
          if (n % 4 === 0) grid[r][c] = String(solution[r][c]);
          else if (n % 4 === 1) marks[r][c] = new Set([String(solution[r][c])]);
          else if (n % 4 === 2) {
            marks[r][c] = new Set([
              String(solution[r][c]),
              String(((solution[r][c] + 1) % size) + 1),
            ]);
          }
        }
      }

      // Walk the board in a shuffled-looking but fixed order
      const order = Array.from({ length: size * size }, (_, i) => (i * 23) % (size * size));
      const selection: string[] = [];
      let previous = 0;
      for (const cell of order.slice(0, 24)) {
        selection.push(`${Math.floor(cell / size)}-${cell % size}`);
        const { total } = selectionSum(real, grid, selection, marks);
        expect(
          total,
          `fell to ${total} from ${previous} at ${selection.length} cells`
        ).toBeGreaterThanOrEqual(previous);
        previous = total;
      }
    });
  }
});
