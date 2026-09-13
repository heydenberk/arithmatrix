/**
 * The difficulty model: technique weights, the bottleneck raw score, and the
 * mapping from raw score to the 0-100 display score and named band.
 *
 * Kept apart from the solver so the numbers that define "how hard" live in
 * one place, and so a change here is visibly a scoring change. Anything that
 * alters a rating without altering the puzzle - a technique added, a weight
 * moved, the scheduling policy, these quantiles - must bump SCORING_VERSION
 * so persisted scores can be told apart from fresh ones.
 */

import { CROSS_SIZE_ANCHORS, CROSS_SIZE_MAX, SIZE_BAND_QUANTILES } from './scoringCalibration';

export type TechniqueId =
  | 'stipulated'
  | 'naked_single'
  | 'cage_impossible'
  | 'hidden_single'
  | 'cage_single'
  | 'cage_locked'
  | 'cage_intersection'
  | 'cage_combinations'
  | 'multi_cage_line_lock'
  | 'summation'
  | 'cross_cage_feasibility'
  | 'trial_and_error';

export type DifficultyLevel = 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTY_ORDER: readonly DifficultyLevel[] = [
  'easiest',
  'easy',
  'medium',
  'hard',
  'expert',
];

/**
 * Version 1: the original trace-order solver, which scanned every hidden
 * single before returning to naked singles (and so charged the dearer weight
 * for cells a naked single would have taken). The shipped corpus and any
 * score persisted before 2026-09 are version 1.
 *
 * Version 2: cheapest-first restart after every single deduction, placement
 * or elimination, with deterministic traversal (decision 3), and the display
 * score on one cross-size scale with bands assigned per size (decision 6).
 * See docs/GENERATION_SYNTHESIS.md.
 */
export const SCORING_VERSION = 2;

export const TECHNIQUE_WEIGHTS: Record<TechniqueId, number> = {
  stipulated: 0,
  naked_single: 1,
  cage_impossible: 2,
  hidden_single: 2,
  cage_single: 3,
  cage_locked: 3,
  cage_intersection: 4,
  cage_combinations: 5,
  multi_cage_line_lock: 8,
  summation: 9,
  cross_cage_feasibility: 10,
  trial_and_error: 15,
};

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  stipulated: 'Stipulated',
  naked_single: 'Naked single',
  cage_impossible: 'Math impossible',
  hidden_single: 'Hidden single',
  cage_single: 'Cage single',
  cage_locked: 'Cage locked',
  cage_intersection: 'Cage intersection',
  cage_combinations: 'Cage combinations',
  multi_cage_line_lock: 'Multi-cage lock',
  summation: 'Summation',
  cross_cage_feasibility: 'Cross-cage feasibility',
  trial_and_error: 'Trial and error',
};

export const emptyCounts = (): Record<TechniqueId, number> => ({
  stipulated: 0,
  naked_single: 0,
  cage_impossible: 0,
  hidden_single: 0,
  cage_single: 0,
  cage_locked: 0,
  cage_intersection: 0,
  cage_combinations: 0,
  multi_cage_line_lock: 0,
  summation: 0,
  cross_cage_feasibility: 0,
  trial_and_error: 0,
});

// Techniques a human experiences as genuine bottlenecks (weight >= 8). They
// drive difficulty at full weight; cheaper techniques are volume-compressed
// (see bottleneckRaw).
const HARD_TECHNIQUES: ReadonlySet<TechniqueId> = new Set<TechniqueId>([
  'multi_cage_line_lock',
  'summation',
  'cross_cage_feasibility',
  'trial_and_error',
]);

/**
 * Bottleneck-aware raw difficulty magnitude: hard techniques at full weight,
 * cheaper bulk square-root compressed so a long cascade of cheap deductions
 * (e.g. many naked singles) can't dominate.
 */
export function bottleneckRaw(counts: Record<TechniqueId, number>): number {
  let hard = 0;
  let cheap = 0;
  for (const t of Object.keys(counts) as TechniqueId[]) {
    const contribution = TECHNIQUE_WEIGHTS[t] * counts[t];
    if (HARD_TECHNIQUES.has(t)) hard += contribution;
    else cheap += contribution;
  }
  return hard + Math.sqrt(cheap);
}

function interp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 <= x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * The 0-100 display score, the same mapping for every size (decision 6 in
 * docs/GENERATION_SYNTHESIS.md).
 *
 * Piecewise-linear through the cross-size raw-score quantiles so the corpus
 * as a whole lands at 20/40/60/80, then log-compressed above q80 so the top
 * fifth spreads over 80-100 instead of pinning at 100: only a raw score at or
 * beyond the largest the corpus has ever produced reads 100. A 4x4 is a small
 * puzzle by this measure and reads low; that is the point of the number.
 * Band membership is a separate, per-size question - see difficultyLevel.
 */
export function normalizeScore(rawScore: number): number {
  if (rawScore <= 0) return 0;
  const [q20, q40, q60, q80] = CROSS_SIZE_ANCHORS;
  if (rawScore < q20) return interp(rawScore, 0, q20, 0, 20);
  if (rawScore < q40) return interp(rawScore, q20, q40, 20, 40);
  if (rawScore < q60) return interp(rawScore, q40, q60, 40, 60);
  if (rawScore < q80) return interp(rawScore, q60, q80, 60, 80);
  const scale = Math.max(1e-9, q80 - q60);
  const top = Math.log1p((CROSS_SIZE_MAX - q80) / scale);
  if (top <= 0) return 100;
  return Math.min(100, 80 + (20 * Math.log1p((rawScore - q80) / scale)) / top);
}

/**
 * The named band, within a size: bottom fifth of that size's raw scores is
 * easiest, top fifth expert. Per-size so every (size, band) bucket stays
 * populated whatever the cross-size number says. Unknown sizes use the 7x7
 * table.
 */
export function difficultyLevel(rawScore: number, size: number): DifficultyLevel {
  const [q20, q40, q60, q80] = SIZE_BAND_QUANTILES[size] ?? SIZE_BAND_QUANTILES[7];
  if (rawScore < q20) return 'easiest';
  if (rawScore < q40) return 'easy';
  if (rawScore < q60) return 'medium';
  if (rawScore < q80) return 'hard';
  return 'expert';
}
