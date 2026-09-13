/**
 * Structural validation of a puzzle definition. Mirrors backend/validation.py.
 *
 * countSolutions is a search over the constraints a puzzle states; it says
 * nothing about whether those constraints describe a well-formed board. Its
 * cell-to-cage map keeps the last cage for an overlapping cell and treats an
 * uncovered cell as free, so a malformed puzzle can count as "one solution".
 * Run this first, and trust the solvers only on a puzzle that passes.
 */

import type { Cage, PuzzleDefinition } from '../types/ArithmatrixTypes';

const VALID_OPERATIONS = new Set(['', '+', '-', '*', '/']);

/** Every structural problem with the cages; empty means well-formed. */
export function puzzleStructureErrors(puzzle: PuzzleDefinition): string[] {
  const errors: string[] = [];
  const { size } = puzzle;
  if (!Number.isInteger(size) || size < 1) return [`size must be a positive integer, got ${size}`];
  if (!Array.isArray(puzzle.cages) || puzzle.cages.length === 0) return ['puzzle has no cages'];

  const total = size * size;
  const owner = new Map<number, number>();
  puzzle.cages.forEach((cage, idx) => {
    const cells = cage.cells;
    if (!Array.isArray(cells) || cells.length === 0) {
      errors.push(`cage ${idx} has no cells`);
      return;
    }
    for (const cell of cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= total) {
        errors.push(`cage ${idx} has out-of-range cell ${cell}`);
      } else if (owner.has(cell)) {
        errors.push(`cell ${cell} is in cage ${owner.get(cell)} and cage ${idx}`);
      } else {
        owner.set(cell, idx);
      }
    }
    if (new Set(cells).size !== cells.length) errors.push(`cage ${idx} lists a cell twice`);

    const op = cage.operation;
    if (!VALID_OPERATIONS.has(op)) errors.push(`cage ${idx} has unknown operation "${op}"`);
    else if (op === '' && cells.length !== 1)
      errors.push(`cage ${idx} has no operation but ${cells.length} cells`);
    else if ((op === '-' || op === '/') && cells.length !== 2)
      errors.push(`cage ${idx} uses ${op} with ${cells.length} cells`);
    else if ((op === '+' || op === '*') && cells.length < 2)
      errors.push(`cage ${idx} uses ${op} with a single cell`);

    if (!Number.isInteger(cage.value) || cage.value < 1)
      errors.push(`cage ${idx} has invalid target ${cage.value}`);

    if (!connected(cells, size)) errors.push(`cage ${idx} is not connected`);
  });

  const missing = total - owner.size;
  if (missing > 0) errors.push(`${missing} cell(s) belong to no cage`);
  return errors;
}

/** Problems with a proposed solution: shape, Latin-square rule, cage targets. */
export function solutionErrors(puzzle: PuzzleDefinition, solution: number[][]): string[] {
  const errors: string[] = [];
  const { size } = puzzle;
  if (
    !Array.isArray(solution) ||
    solution.length !== size ||
    solution.some(row => !Array.isArray(row) || row.length !== size)
  ) {
    return [`solution is not a ${size}x${size} grid`];
  }
  const expected = new Set(Array.from({ length: size }, (_, i) => i + 1));
  const same = (a: Set<number>) => a.size === expected.size && [...a].every(v => expected.has(v));
  for (let i = 0; i < size; i++) {
    if (!same(new Set(solution[i]))) errors.push(`row ${i} is not a permutation of 1..${size}`);
    if (!same(new Set(solution.map(row => row[i]))))
      errors.push(`column ${i} is not a permutation of 1..${size}`);
  }
  puzzle.cages.forEach((cage, idx) => {
    const values = cage.cells.map(c => solution[Math.floor(c / size)][c % size]);
    if (!cageSatisfiedBy(cage, values))
      errors.push(
        `cage ${idx} (${cage.operation}${cage.value}) is not satisfied by ${values.join(',')}`
      );
  });
  return errors;
}

export function cageSatisfiedBy(cage: Cage, values: number[]): boolean {
  const { operation: op, value: target } = cage;
  if (op === '') return values.length === 1 && values[0] === target;
  if (op === '+') return values.reduce((a, b) => a + b, 0) === target;
  if (op === '*') return values.reduce((a, b) => a * b, 1) === target;
  if (op === '-') return values.length === 2 && Math.abs(values[0] - values[1]) === target;
  if (op === '/') {
    if (values.length !== 2) return false;
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    return lo !== 0 && hi === target * lo;
  }
  return false;
}

/** Structure first; the solution check presumes a sane structure. */
export function validatePuzzle(puzzle: PuzzleDefinition, solution?: number[][]): string[] {
  const errors = puzzleStructureErrors(puzzle);
  if (errors.length > 0 || solution === undefined) return errors;
  return solutionErrors(puzzle, solution);
}

function connected(cells: number[], size: number): boolean {
  const valid = new Set(cells.filter(c => Number.isInteger(c) && c >= 0 && c < size * size));
  if (valid.size !== cells.length) return false;
  const [start] = valid;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const r = Math.floor(cell / size);
    const c = cell % size;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = nr * size + nc;
      if (valid.has(next) && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size === valid.size;
}
