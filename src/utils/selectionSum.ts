/**
 * The total of a multi-cell selection, for the arithmetic a player does by
 * hand.
 *
 * Working out whether a row's leftover cell must be a 4 means adding up the
 * cages that cover the rest of it - the summation technique the solver uses,
 * done on paper. Selecting the cells and reading the total off saves the
 * addition without giving anything away: everything counted here the player
 * could already read off the board and their own notes.
 *
 * Cells are priced in the order the reasoning is strongest, each rule taking
 * the cells it settles out of the reckoning before the next one looks:
 *
 *   1. a whole row or column is worth 1+2+...+n whatever is written in it;
 *   2. a whole cage is worth its total whenever every arrangement still open
 *      to it adds up the same - a + cage outright, since the target is the
 *      sum; a cage its arithmetic pins down on its own, like 6x over two
 *      cells of a 4x4, which can only be 2 and 3; or a cage the notes have
 *      narrowed to one multiset, like a 2- whose cells are both noted {3,5};
 *   3. k cells sharing a row or column, between them noting exactly k
 *      distinct values, are worth those values' total - they have to hold all
 *      of them, one each, whatever cages they fall in;
 *   4. anything left is worth its value if filled, or its note if noted down
 *      to one.
 *
 * Half a cage is priced cell by cell, not as a share of the target: half of a
 * 13+ says nothing, and counting the filled half twice - once as cells, once
 * inside the cage total - would be worse than saying nothing. Anything left
 * over is reported as unknown rather than quietly dropped, so the total never
 * claims to know more than the board does.
 */

import type { Cage, PuzzleDefinition } from '../types/ArithmatrixTypes';
import { precomputeCageCombinations } from './solver';

/*
 * A cage's arrangements depend only on its own arithmetic and shape, so they
 * are worked out once and kept. This sits on the selection path - every tap
 * while dragging out a selection asks again - and enumerating a five-cell
 * cage is not something to repeat for an answer that cannot have changed.
 */
const combinationCache = new WeakMap<Cage, number[][]>();

const combinationsFor = (cage: Cage, size: number): number[][] => {
  const cached = combinationCache.get(cage);
  if (cached) return cached;
  const combos = precomputeCageCombinations(cage, size);
  combinationCache.set(cage, combos);
  return combos;
};

export type SelectionSum = {
  /** Total of every selected cell whose value the board already settles. */
  total: number;
  /** How many selected cells that total covers. */
  counted: number;
  /** Selected cells whose value nothing on the board settles yet. */
  unknown: number;
};

const indexOfKey = (key: string, size: number): number => {
  const [row, col] = key.split('-').map(Number);
  return row * size + col;
};

/**
 * Everything a cell could still hold: the value in it, else the notes on it,
 * else anything at all. Null when the player's notes rule out every value,
 * which is their mistake to find rather than ours to price.
 */
const candidatesAt = (
  index: number,
  size: number,
  gridValues: string[][],
  pencilMarks?: Set<string>[][]
): Set<number> | null => {
  const row = Math.floor(index / size);
  const col = index % size;
  const raw = gridValues[row]?.[col];
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) ? new Set([value]) : null;
  }
  const marks = pencilMarks?.[row]?.[col];
  if (marks && marks.size > 0) {
    const values = new Set<number>();
    for (const mark of marks) {
      const value = Number(mark);
      if (Number.isFinite(value)) values.add(value);
    }
    return values.size > 0 ? values : null;
  }
  return new Set(Array.from({ length: size }, (_, i) => i + 1));
};

/**
 * The cage's total, when every arrangement still open to it comes to the same
 * thing. Null when they differ, or when nothing is open to it at all.
 */
const settledCageTotal = (
  cage: Cage,
  size: number,
  allowed: Map<number, Set<number>>
): number | null => {
  const perPosition = cage.cells.map(cell => allowed.get(cell));
  if (perPosition.some(set => set === undefined)) return null;

  let total: number | null = null;
  for (const combo of combinationsFor(cage, size)) {
    if (combo.some((value, pos) => !perPosition[pos]!.has(value))) continue;
    const sum = combo.reduce((a, b) => a + b, 0);
    if (total === null) total = sum;
    else if (total !== sum) return null;
  }
  return total;
};

export const selectionSum = (
  puzzle: PuzzleDefinition,
  gridValues: string[][],
  selectedKeys: Iterable<string>,
  pencilMarks?: Set<string>[][]
): SelectionSum => {
  const { size, cages } = puzzle;
  const remaining = new Set<number>();
  for (const key of selectedKeys) remaining.add(indexOfKey(key, size));

  /* Worked out once: every rule below asks what a cell could still hold. */
  const allowed = new Map<number, Set<number>>();
  for (const index of remaining) {
    const candidates = candidatesAt(index, size, gridValues, pencilMarks);
    if (candidates) allowed.set(index, candidates);
  }

  let total = 0;
  let counted = 0;

  const take = (cells: Iterable<number>, worth: number) => {
    let taken = 0;
    for (const cell of cells) {
      remaining.delete(cell);
      taken += 1;
    }
    total += worth;
    counted += taken;
  };

  /** Cells of one line among those still unpriced. */
  const lineCells = (orientation: 'row' | 'col', line: number): number[] =>
    [...remaining].filter(cell =>
      orientation === 'row' ? Math.floor(cell / size) === line : cell % size === line
    );

  // 1. A whole row or column, whatever is written in it
  const lineTotal = (size * (size + 1)) / 2;
  for (const orientation of ['row', 'col'] as const) {
    for (let line = 0; line < size; line++) {
      const cells = lineCells(orientation, line);
      if (cells.length === size) take(cells, lineTotal);
    }
  }

  // 2. A whole cage whose arrangements agree on the total
  for (const cage of cages) {
    if (!cage.cells.every(cell => remaining.has(cell))) continue;
    const cageTotal = settledCageTotal(cage, size, allowed);
    if (cageTotal !== null) take(cage.cells, cageTotal);
  }

  /*
   * 3. k cells of one line noting exactly k values between them. They share a
   * line, so no two can hold the same value, which leaves them holding all k
   * of those values one apiece - whatever cages they happen to fall in.
   */
  for (const orientation of ['row', 'col'] as const) {
    for (let line = 0; line < size; line++) {
      const cells = lineCells(orientation, line);
      if (cells.length < 2) continue;
      if (cells.some(cell => !allowed.has(cell))) continue;
      const union = new Set<number>();
      for (const cell of cells) for (const value of allowed.get(cell)!) union.add(value);
      if (union.size !== cells.length) continue;
      take(
        cells,
        [...union].reduce((a, b) => a + b, 0)
      );
    }
  }

  // 4. Whatever is left, one cell at a time
  let unknown = 0;
  for (const index of remaining) {
    const candidates = allowed.get(index);
    if (candidates && candidates.size === 1) {
      total += [...candidates][0];
      counted += 1;
    } else {
      unknown += 1;
    }
  }

  return { total, counted, unknown };
};
