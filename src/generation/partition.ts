/**
 * Cage-size partitions: how many cells each cage gets, drawn so the multiset
 * sums to the board. Ported from backend/arithmatrix.py.
 */

import type { DifficultyLevel } from '../utils/difficulty';
import type { Rng } from './rng';

/** Relative weights for cages of 1..5 cells, by target difficulty. Harder
 *  targets get fewer single-cell gimmes and more 3-5 cell cages. */
export const CAGE_SIZE_WEIGHTS: Record<DifficultyLevel, readonly number[]> = {
  easiest: [8, 34, 16, 6, 1],
  easy: [6, 32, 20, 10, 1],
  medium: [4, 30, 22, 15, 1],
  hard: [3, 25, 26, 18, 2],
  expert: [2, 20, 28, 22, 2],
};

/**
 * Hard cap on single-cell cages: ~10% of cells, minimum 1 - 2/2/4/5 for 4x4
 * to 7x7. The corpus was generated under this table (decision 2).
 */
const SINGLES_CAP: Record<number, number> = { 4: 2, 5: 2, 6: 4, 7: 5 };
export const maxSingleCages = (size: number): number =>
  // Python's round() is banker's rounding (2.5 -> 2); JS rounds half up, so
  // the formula alone would give 5x5 three singles where the corpus has two
  SINGLES_CAP[size] ?? Math.max(1, Math.round(0.1 * size * size));

/**
 * A list of cage sizes summing to `total`, each drawn in proportion to
 * `weights` among the sizes that still fit. Rejection sampling: an attempt
 * that cannot land exactly on the total is thrown away. Null after
 * `maxAttempts` failures or when only zero-weight sizes fit.
 */
export function weightedPartition(
  weights: readonly number[],
  total: number,
  rng: Rng,
  maxAttempts = 10000
): number[] | null {
  const sizes = weights.map((_, i) => i + 1);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result: number[] = [];
    let sum = 0;
    while (sum < total) {
      const remaining = total - sum;
      const allowed = weights.map((w, i) => (sizes[i] <= remaining ? w : 0));
      const idx = rng.weightedIndex(allowed);
      if (idx < 0) break;
      result.push(sizes[idx]);
      sum += sizes[idx];
    }
    if (sum === total) return result;
  }
  return null;
}
