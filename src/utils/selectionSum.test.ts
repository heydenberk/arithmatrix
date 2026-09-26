/**
 * Tests for the selection total.
 *
 * The number is arithmetic a player would otherwise do on paper, so the thing
 * worth protecting is that it never claims to know more than the board does:
 * no cell counted twice, and nothing priced that the board has not settled.
 */

import { describe, expect, it } from 'vitest';
import { selectionSum } from './selectionSum';
import type { PuzzleDefinition } from '../types/ArithmatrixTypes';

/*
 * A 4x4 board:
 *   cells 0,1   -> 7+        cells 2,3   -> 6x
 *   cells 4,5   -> 5+        cell  6     -> 3 (stipulated)
 *   cell  7     -> 2-  with 11          (a 2-cell - cage over 7 and 11)
 *   the rest    -> one 20+ cage
 */
const puzzle: PuzzleDefinition = {
  size: 4,
  cages: [
    { cells: [0, 1], operation: '+', value: 7 },
    { cells: [2, 3], operation: '*', value: 6 },
    { cells: [4, 5], operation: '+', value: 5 },
    { cells: [6], operation: '', value: 3 },
    { cells: [7, 11], operation: '-', value: 2 },
    { cells: [8, 9, 10, 12, 13, 14, 15], operation: '+', value: 20 },
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
const keys = (...indexes: number[]) => indexes.map(i => `${Math.floor(i / 4)}-${i % 4}`);

describe('selectionSum', () => {
  it('reports nothing for an empty selection', () => {
    expect(selectionSum(puzzle, emptyGrid(), [])).toEqual({ total: 0, counted: 0, unknown: 0 });
  });

  it('adds up filled cells', () => {
    const grid = gridWith({ 2: 2, 3: 3 });
    expect(selectionSum(puzzle, grid, keys(2, 3))).toEqual({ total: 5, counted: 2, unknown: 0 });
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
    // 7+ over cells 0 and 1, with 3 already placed in cell 0
    const grid = gridWith({ 0: 3 });
    expect(selectionSum(puzzle, grid, keys(0))).toEqual({ total: 3, counted: 1, unknown: 0 });
    expect(selectionSum(puzzle, grid, keys(1))).toEqual({ total: 0, counted: 0, unknown: 1 });
  });

  it('never counts a cell twice when a filled + cage is fully selected', () => {
    // Both cells of the 7+ are filled; the cage target still stands for both
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

  it('cannot price a cage whose operation says nothing about a sum', () => {
    // 6x over two empty cells could be 2+3 or 1+6
    expect(selectionSum(puzzle, emptyGrid(), keys(2, 3))).toEqual({
      total: 0,
      counted: 0,
      unknown: 2,
    });
    // and nor can a - cage
    expect(selectionSum(puzzle, emptyGrid(), keys(7, 11))).toEqual({
      total: 0,
      counted: 0,
      unknown: 2,
    });
  });

  it('mixes cages, filled cells and unknowns in one selection', () => {
    // 7+ whole (7) + stipulated 3 + a filled 2 from the x cage + one empty
    const grid = gridWith({ 2: 2 });
    expect(selectionSum(puzzle, grid, keys(0, 1, 6, 2, 3))).toEqual({
      total: 12,
      counted: 4,
      unknown: 1,
    });
  });

  it('prices a large + cage as a block, whatever is filled inside it', () => {
    const grid = gridWith({ 8: 1, 9: 2 });
    const all = keys(8, 9, 10, 12, 13, 14, 15);
    expect(selectionSum(puzzle, grid, all)).toEqual({ total: 20, counted: 7, unknown: 0 });
  });

  it('does not care what order the selection arrives in', () => {
    const grid = gridWith({ 2: 2 });
    const forward = selectionSum(puzzle, grid, keys(0, 1, 6, 2));
    const backward = selectionSum(puzzle, grid, keys(2, 6, 1, 0));
    expect(backward).toEqual(forward);
  });
});
