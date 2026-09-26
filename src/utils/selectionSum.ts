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
 * A selected cell is worth something when the board leaves no choice about it:
 *
 *   - a filled cell is worth its value;
 *   - an empty cell whose notes name a single candidate is worth that;
 *   - a whole selected cage is worth its total whenever every arrangement it
 *     still allows adds up the same. That covers a `+` cage outright, since
 *     the target is the sum; a cage its arithmetic pins down on its own, like
 *     6x over two cells of a 4x4, which can only be 2 and 3; and a cage the
 *     player has narrowed to one multiset, like a 2- whose cells are both
 *     noted {3,5} - either way round that is 8.
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
  gridValues: string[][],
  pencilMarks?: Set<string>[][]
): number | null => {
  const allowed = cage.cells.map(cell => candidatesAt(cell, size, gridValues, pencilMarks));
  if (allowed.some(set => set === null)) return null;

  let total: number | null = null;
  for (const combo of combinationsFor(cage, size)) {
    if (combo.some((value, pos) => !allowed[pos]!.has(value))) continue;
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
  const selected = new Set<number>();
  for (const key of selectedKeys) selected.add(indexOfKey(key, size));

  const cageOf = new Map<number, Cage>();
  for (const cage of cages) for (const cell of cage.cells) cageOf.set(cell, cage);

  // Selected cells grouped by the cage they belong to, so a cage is judged whole
  const byCage = new Map<Cage | undefined, number[]>();
  for (const index of selected) {
    const cage = cageOf.get(index);
    const group = byCage.get(cage);
    if (group) group.push(index);
    else byCage.set(cage, [index]);
  }

  let total = 0;
  let counted = 0;
  let unknown = 0;

  for (const [cage, indexes] of byCage) {
    if (cage && indexes.length === cage.cells.length) {
      const cageTotal = settledCageTotal(cage, size, gridValues, pencilMarks);
      if (cageTotal !== null) {
        total += cageTotal;
        counted += cage.cells.length;
        continue;
      }
    }

    // Priced one cell at a time: only what is filled in, or noted down to one
    for (const index of indexes) {
      const candidates = candidatesAt(index, size, gridValues, pencilMarks);
      if (candidates && candidates.size === 1) {
        total += [...candidates][0];
        counted += 1;
      } else {
        unknown += 1;
      }
    }
  }

  return { total, counted, unknown };
};
