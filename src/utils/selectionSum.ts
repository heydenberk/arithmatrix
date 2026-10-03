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

/**
 * Every group of cells in a line that between them note exactly as many values
 * as there are cells - a locked set, which has to hold those values one
 * apiece. Returned biggest first, since a bigger set accounts for more of the
 * selection than the smaller ones hiding inside it.
 *
 * Every subset is tried. A line holds at most seven cells, so that is at most
 * 127 of them, and cells whose notes rule out everything are left out rather
 * than reasoned from.
 */
const nakedSetsIn = (
  lineCells: number[],
  allowed: Map<number, Set<number>>
): { cells: number[]; total: number }[] => {
  const cells = lineCells.filter(cell => allowed.has(cell));
  if (cells.length < 2) return [];

  const found: { cells: number[]; total: number }[] = [];
  for (let mask = 1; mask < 1 << cells.length; mask++) {
    const subset: number[] = [];
    for (let i = 0; i < cells.length; i++) if (mask & (1 << i)) subset.push(cells[i]);
    if (subset.length < 2) continue;
    /*
     * A set whose cells are each settled on their own says nothing the cells
     * do not already say, and there are a great many of them - any two filled
     * cells of a row qualify. Left in, they bury the search in combinations
     * that all come to the same thing.
     */
    if (subset.every(cell => allowed.get(cell)!.size === 1)) continue;
    const union = new Set<number>();
    for (const cell of subset) for (const value of allowed.get(cell)!) union.add(value);
    if (union.size !== subset.length) continue;
    found.push({ cells: subset, total: [...union].reduce((a, b) => a + b, 0) });
  }
  return found.sort((a, b) => b.cells.length - a.cells.length);
};

/**
 * How much the given groups can account for between them, taking no cell
 * twice. Groups overlap, so this is a choice rather than a sum, and the
 * choice has to be the best one available: a selection read any worse than it
 * could be would drop its total as the player selected more cells.
 *
 * An exhaustive search, bounded. Each cell is either covered by one of the
 * groups holding it or left out, and the search walks those choices in worth
 * order so a good answer is reached early. Real selections settle in a few
 * hundred steps; the budget exists only so a pathological one cannot stall a
 * tap, and what it returns then is still a true reading, just not provably
 * the best.
 */
/*
 * How far the search will go before settling for the best it has found.
 *
 * Tuned so an ordinary selection - a cage, a line, a handful of cells - is
 * searched to the end in a millisecond or two, while an extravagant one, half
 * the board at once, still answers within a frame rather than stalling the
 * tap that made it. What it returns on giving up early is still a true
 * reading of the board, just not provably the best one available.
 */
const SEARCH_BUDGET = 60000;

const bestPacking = (
  groups: { cells: number[]; total: number }[],
  allowed: Map<number, Set<number>>
): { total: number; covered: Set<number> } => {
  if (groups.length === 0) return { total: 0, covered: new Set() };

  /*
   * One group per set of cells, the best of any that cover the same ground -
   * a locked set spanning a whole line and the line itself say the same
   * thing, and keeping both only doubles the work.
   */
  const byCoverage = new Map<string, { cells: number[]; total: number }>();
  for (const group of groups) {
    const key = [...group.cells].sort((a, b) => a - b).join(',');
    const seen = byCoverage.get(key);
    if (!seen || group.total > seen.total) byCoverage.set(key, group);
  }
  const byWorth = [...byCoverage.values()].sort(
    (a, b) => b.total - a.total || b.cells.length - a.cells.length
  );
  const cells = [...new Set(byWorth.flatMap(group => group.cells))].sort((a, b) => a - b);
  const holding = new Map<number, typeof byWorth>();
  for (const group of byWorth) {
    for (const cell of group.cells) {
      const list = holding.get(cell);
      if (list) list.push(group);
      else holding.set(cell, [group]);
    }
  }

  /*
   * The most a cell could still be worth, for the bound below: whatever it
   * holds, a group counting it adds at most this much on its account.
   */
  const ceiling = new Map<number, number>();
  for (const cell of cells) ceiling.set(cell, Math.max(...(allowed.get(cell) ?? [0])));
  let loose = cells.reduce((sum, cell) => sum + ceiling.get(cell)!, 0);

  /*
   * `settled` holds the cells this branch has decided about, either by
   * counting them in a group or by passing over them. Deciding each cell once,
   * in order, is what keeps the same combination from being reached by a
   * dozen different routes.
   */
  const settled = new Set<number>();
  const covered = new Set<number>();
  let bestTotal = 0;
  let bestCovered = new Set<number>();
  let steps = 0;

  const walk = (from: number, running: number) => {
    if (steps++ > SEARCH_BUDGET) return;
    // Nothing still undecided could make up the difference
    if (running + loose <= bestTotal) return;

    let i = from;
    while (i < cells.length && settled.has(cells[i])) i++;
    if (i === cells.length) {
      if (running > bestTotal) {
        bestTotal = running;
        bestCovered = new Set(covered);
      }
      return;
    }

    const cell = cells[i];
    for (const group of holding.get(cell)!) {
      if (group.cells.some(other => settled.has(other))) continue;
      for (const other of group.cells) {
        settled.add(other);
        covered.add(other);
        loose -= ceiling.get(other)!;
      }
      walk(i + 1, running + group.total);
      for (const other of group.cells) {
        settled.delete(other);
        covered.delete(other);
        loose += ceiling.get(other)!;
      }
    }

    /*
     * Or leave this one out of the reckoning, and see what the rest can do -
     * unless it stands alone as a group of its own, which a filled cell does.
     * Counting it then costs nothing any other group wanted and is worth
     * something, so passing over it could never come out ahead.
     */
    if (holding.get(cell)!.some(group => group.cells.length === 1)) return;
    settled.add(cell);
    loose -= ceiling.get(cell)!;
    walk(i + 1, running);
    settled.delete(cell);
    loose += ceiling.get(cell)!;
  };

  walk(0, 0);
  return { total: bestTotal, covered: bestCovered };
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

  const selected = new Set(remaining);
  const inLine = (orientation: 'row' | 'col', line: number): number[] =>
    [...selected].filter(cell =>
      orientation === 'row' ? Math.floor(cell / size) === line : cell % size === line
    );

  /*
   * Every group of cells the board settles between them, gathered before any
   * of them is claimed.
   */
  const groups: { cells: number[]; total: number }[] = [];

  // A whole row or column, whatever is written in it
  const lineTotal = (size * (size + 1)) / 2;
  for (const orientation of ['row', 'col'] as const) {
    for (let line = 0; line < size; line++) {
      const cells = inLine(orientation, line);
      if (cells.length === size) groups.push({ cells, total: lineTotal });
    }
  }

  // A whole cage whose arrangements agree on the total
  for (const cage of cages) {
    if (!cage.cells.every(cell => selected.has(cell))) continue;
    const cageTotal = settledCageTotal(cage, size, allowed);
    if (cageTotal !== null) groups.push({ cells: cage.cells, total: cageTotal });
  }

  /*
   * k cells of one line noting exactly k values between them. They share a
   * line, so no two can hold the same value, which leaves them holding all k
   * of those values one apiece - whatever cages they happen to fall in.
   */
  for (const orientation of ['row', 'col'] as const) {
    for (let line = 0; line < size; line++) {
      groups.push(...nakedSetsIn(inLine(orientation, line), allowed));
    }
  }

  /*
   * A cell with one value left to it - filled in, or noted down to one - is a
   * group of its own.
   *
   * It has to go through the same search as the rest. Priced afterwards out
   * of whatever the search left over, it was worth nothing to the choice
   * being made, and the search would give up a four-point cell to win a
   * one-point set, taking the total down as a cell was added.
   */
  for (const [cell, candidates] of allowed) {
    if (candidates.size === 1) groups.push({ cells: [cell], total: [...candidates][0] });
  }

  /*
   * The best the groups can do between them.
   *
   * They overlap - a cage lies across a row, a locked pair inside both - and
   * only one of any two overlapping groups can be counted, so which to claim
   * is a choice. Taking them in some fixed order of kind, or greedily by
   * worth, both get it wrong: a filled row of a 4x4 is worth 10 and outranks
   * each of three settled cages worth 16 between them, so claiming it first
   * lowered the total just as another cell was selected.
   *
   * Searching for the best combination instead is what keeps the total rising
   * as the selection grows: every way of reading a selection is still
   * available once a cell is added to it, so the best can only improve. That
   * is the behaviour that reads as arithmetic rather than as a glitch.
   */
  const best = bestPacking(groups, allowed);
  const total = best.total;
  let counted = 0;
  for (const cell of best.covered) {
    remaining.delete(cell);
    counted += 1;
  }

  // Whatever the search could not account for
  const unknown = remaining.size;

  return { total, counted, unknown };
};
