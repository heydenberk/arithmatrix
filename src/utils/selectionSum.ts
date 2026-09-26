/**
 * The total of a multi-cell selection, for the arithmetic a player does by
 * hand.
 *
 * Working out whether a row's leftover cell must be a 4 means adding up the
 * cages that cover the rest of it - the summation technique the solver uses,
 * done on paper. Selecting the cells and reading the total off saves the
 * addition without giving anything away: everything counted here is already
 * printed on the board.
 *
 * What a selected cell is worth:
 *   - a filled cell is worth its value;
 *   - a cage stating one cell's value outright is worth that value, filled or
 *     not, since the board already says so;
 *   - a `+` cage is worth its target, but only when the whole cage is
 *     selected. Half of a 13+ tells you nothing, and counting the filled half
 *     twice - once as cells, once inside the cage total - would be worse than
 *     telling you nothing.
 * Anything else - an empty cell in a x, - or / cage, or in a + cage you have
 * only partly selected - cannot be priced, and is reported as unknown rather
 * than quietly left out of the total.
 */

import type { PuzzleDefinition } from '../types/ArithmatrixTypes';

export type SelectionSum = {
  /** Total of every selected cell whose value the board already settles. */
  total: number;
  /** How many selected cells that total covers. */
  counted: number;
  /** Selected cells whose value nothing on the board settles yet. */
  unknown: number;
};

/** A cell's position index, the form cages use. */
const indexOfKey = (key: string, size: number): number => {
  const [row, col] = key.split('-').map(Number);
  return row * size + col;
};

const valueAt = (gridValues: string[][], index: number, size: number): number | null => {
  const raw = gridValues[Math.floor(index / size)]?.[index % size];
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const selectionSum = (
  puzzle: PuzzleDefinition,
  gridValues: string[][],
  selectedKeys: Iterable<string>
): SelectionSum => {
  const { size, cages } = puzzle;
  const selected = new Set<number>();
  for (const key of selectedKeys) selected.add(indexOfKey(key, size));

  const cageOf = new Map<number, (typeof cages)[number]>();
  for (const cage of cages) for (const cell of cage.cells) cageOf.set(cell, cage);

  let total = 0;
  let counted = 0;
  let unknown = 0;
  /* Cages already priced as a whole, so their cells are not added again. */
  const takenWhole = new Set<(typeof cages)[number]>();

  for (const index of selected) {
    const cage = cageOf.get(index);
    if (cage && takenWhole.has(cage)) continue;

    /*
     * A cage worth its target as a block: a single-cell cage states a value
     * outright, and a fully selected + cage states the total of exactly these
     * cells. Either way the individual cells stop mattering.
     */
    const wholeCageSelected = cage ? cage.cells.every(cell => selected.has(cell)) : false;
    const statesItsTotal =
      cage !== undefined &&
      wholeCageSelected &&
      (cage.cells.length === 1 || cage.operation === '+');

    if (statesItsTotal && cage) {
      takenWhole.add(cage);
      total += cage.value;
      counted += cage.cells.length;
      continue;
    }

    const value = valueAt(gridValues, index, size);
    if (value === null) unknown += 1;
    else {
      total += value;
      counted += 1;
    }
  }

  return { total, counted, unknown };
};
