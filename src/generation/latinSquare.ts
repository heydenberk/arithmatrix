/**
 * Random Latin squares by isotopy: start from the cyclic square and apply
 * row swaps, column swaps and symbol swaps, each of which preserves the Latin
 * property. Ported from backend/latin_square.py, minus the pool - a fresh
 * square is about a millisecond, and a pool shared across workers was the
 * one thing that made 4x4 draws repeat.
 */

import type { Rng } from './rng';

export function cyclicSquare(n: number): number[][] {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => ((r + c) % n) + 1)
  );
}

/** n^1.5 * 10 moves: 80 for 4x4 up to 185 for 7x7, tuned for mixing. */
export const isotopySteps = (n: number): number => Math.floor(n ** 1.5 * 10);

export function randomLatinSquare(n: number, rng: Rng, steps = isotopySteps(n)): number[][] {
  const square = cyclicSquare(n);
  for (let i = 0; i < steps; i++) {
    const move = rng.int(3);
    const [a, b] = rng.pair(n);
    if (move === 0) {
      [square[a], square[b]] = [square[b], square[a]];
    } else if (move === 1) {
      for (const row of square) [row[a], row[b]] = [row[b], row[a]];
    } else {
      const sa = a + 1;
      const sb = b + 1;
      for (const row of square) {
        for (let c = 0; c < n; c++) {
          if (row[c] === sa) row[c] = sb;
          else if (row[c] === sb) row[c] = sa;
        }
      }
    }
  }
  return square;
}

export function isLatinSquare(square: number[][]): boolean {
  const n = square.length;
  const expected = Array.from({ length: n }, (_, i) => i + 1).join(',');
  for (let i = 0; i < n; i++) {
    if (square[i].length !== n) return false;
    if ([...square[i]].sort((a, b) => a - b).join(',') !== expected) return false;
    if (
      square
        .map(row => row[i])
        .sort((a, b) => a - b)
        .join(',') !== expected
    )
      return false;
  }
  return true;
}
