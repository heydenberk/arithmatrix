/**
 * The uniqueness counter against the plain backtracker it replaced.
 *
 * The new search orders cells by fewest legal values and prunes on running
 * cage sums, products and - / partners. None of that may change the answer:
 * on every puzzle the two must agree on the count, with and without a
 * player's partial grid, and the cap must still be honoured.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Cage, PuzzleDefinition } from '../types/ArithmatrixTypes';
import { countSolutions } from './solver';
import { buildCandidate } from '../generation/generate';
import { OPERATIONS_TIERS } from '../generation/operations';
import { Rng } from '../generation/rng';

/** The previous implementation, verbatim, as the oracle. */
function countSolutionsReference(
  puzzle: PuzzleDefinition,
  cap = 2,
  startGrid?: number[][]
): number {
  const size = puzzle.size;
  const cageOf = new Map<number, Cage>();
  for (const cage of puzzle.cages) for (const cell of cage.cells) cageOf.set(cell, cage);
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const rowMask = new Array(size).fill(0);
  const colMask = new Array(size).fill(0);
  let found = 0;
  const cageSatisfiedFor = (cage: Cage): boolean => {
    const values: number[] = [];
    for (const cell of cage.cells) {
      const v = grid[Math.floor(cell / size)][cell % size];
      if (v !== 0) values.push(v);
    }
    const complete = values.length === cage.cells.length;
    if (cage.cells.length === 1 || cage.operation === '=' || cage.operation === '') {
      return !complete || values[0] === cage.value;
    }
    switch (cage.operation) {
      case '+': {
        const sum = values.reduce((a, b) => a + b, 0);
        return complete ? sum === cage.value : sum < cage.value;
      }
      case '*': {
        const product = values.reduce((a, b) => a * b, 1);
        return complete ? product === cage.value : cage.value % product === 0;
      }
      case '-':
        return !complete || (values.length === 2 && Math.abs(values[0] - values[1]) === cage.value);
      case '/': {
        if (!complete) return true;
        if (values.length !== 2) return false;
        const hi = Math.max(values[0], values[1]);
        const lo = Math.min(values[0], values[1]);
        return lo !== 0 && hi === cage.value * lo;
      }
      default:
        return !complete || values[0] === cage.value;
    }
  };
  if (startGrid) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const value = startGrid[row]?.[col] ?? 0;
        if (!value) continue;
        const bit = 1 << value;
        if (rowMask[row] & bit || colMask[col] & bit) return 0;
        grid[row][col] = value;
        rowMask[row] |= bit;
        colMask[col] |= bit;
      }
    }
    for (const cage of puzzle.cages) if (!cageSatisfiedFor(cage)) return 0;
  }
  const recurse = (pos: number): void => {
    if (found >= cap) return;
    if (pos === size * size) {
      found += 1;
      return;
    }
    const row = Math.floor(pos / size);
    const col = pos % size;
    if (grid[row][col] !== 0) {
      recurse(pos + 1);
      return;
    }
    const cage = cageOf.get(pos);
    for (let value = 1; value <= size; value++) {
      const bit = 1 << value;
      if (rowMask[row] & bit || colMask[col] & bit) continue;
      grid[row][col] = value;
      rowMask[row] |= bit;
      colMask[col] |= bit;
      if (!cage || cageSatisfiedFor(cage)) recurse(pos + 1);
      grid[row][col] = 0;
      rowMask[row] &= ~bit;
      colMask[col] &= ~bit;
      if (found >= cap) return;
    }
  };
  recurse(0);
  return found;
}

type Record_ = { puzzle: { size: number; cages: Cage[]; solution: number[][] } };
const LINES = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
const corpusSample = (): Record_[] => LINES.filter((_, i) => i % 97 === 0).map(l => JSON.parse(l));

describe('countSolutions matches the reference backtracker', () => {
  it('on shipped puzzles, from an empty board', () => {
    for (const record of corpusSample()) {
      const puzzle = { size: record.puzzle.size, cages: record.puzzle.cages };
      expect(countSolutions(puzzle, 2)).toBe(countSolutionsReference(puzzle, 2));
    }
  });

  it('on fresh candidates, unique or not, up to a higher cap', () => {
    const rng = new Rng(2024);
    for (let i = 0; i < 40; i++) {
      const size = 4 + (i % 3); // 4, 5, 6: small enough to enumerate several
      const c = buildCandidate(size, 'medium', OPERATIONS_TIERS.all, rng)!;
      expect(countSolutions(c.puzzle, 5)).toBe(countSolutionsReference(c.puzzle, 5));
    }
  });

  it('from a partial grid, including wrong placements', () => {
    const rng = new Rng(7);
    for (const record of corpusSample().slice(0, 12)) {
      const puzzle = { size: record.puzzle.size, cages: record.puzzle.cages };
      const size = puzzle.size;
      // Half the solution in place
      const partial = record.puzzle.solution.map(row => row.map(v => (rng.next() < 0.5 ? v : 0)));
      expect(countSolutions(puzzle, 2, partial)).toBe(1);
      expect(countSolutionsReference(puzzle, 2, partial)).toBe(1);
      // One wrong placement: a value swapped within a row
      const wrong = record.puzzle.solution.map(row => row.slice());
      const r = rng.int(size);
      [wrong[r][0], wrong[r][1]] = [wrong[r][1], wrong[r][0]];
      expect(countSolutions(puzzle, 1, wrong)).toBe(countSolutionsReference(puzzle, 1, wrong));
    }
  });

  it('honours the cap and reports zero for an unsatisfiable puzzle', () => {
    const open: PuzzleDefinition = {
      size: 4,
      cages: [{ cells: Array.from({ length: 16 }, (_, i) => i), operation: '+', value: 40 }],
    };
    expect(countSolutions(open, 3)).toBe(3);
    expect(countSolutions(open, 1000)).toBe(576);
    const impossible: PuzzleDefinition = {
      size: 4,
      cages: [
        { cells: [0, 1], operation: '+', value: 9 },
        ...Array.from({ length: 14 }, (_, i) => ({ cells: [i + 2], operation: '', value: 1 })),
      ],
    };
    expect(countSolutions(impossible, 2)).toBe(0);
  });
});
