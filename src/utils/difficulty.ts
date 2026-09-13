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
 * or elimination, with deterministic traversal. See docs/GENERATION_SYNTHESIS.md
 * decision 3.
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

// Per-size raw-score quantile boundaries (q20, q40, q60, q80) defining the
// five tiers: easiest = bottom 20% … expert = top 20%. Quantile bucketing is
// used because the bottleneck raw is bimodal (flows vs hits-walls), so fixed
// thresholds would leave "medium" nearly empty. Derived from the version-1
// corpus; to be re-derived when the corpus is re-scored (Phase 4).
const SIZE_QUANTILES: Record<number, [number, number, number, number]> = {
  4: [5.4, 5.7, 6.1, 6.6],
  5: [7.5, 8.0, 8.4, 9.2],
  6: [10.2, 11.3, 12.4, 33.2],
  7: [13.6, 22.6, 73.5, 183.1],
};

function interp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 <= x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Map a bottleneck raw score to a 0-100 display score by piecewise-linear
 * interpolation through the per-size quantile boundaries, so the tier cutoffs
 * land at exactly 20/40/60/80.
 *
 * Per-size: a 60 on a 4x4 and a 60 on a 7x7 are not comparable, and the top
 * band saturates at 100. Both are known; the replacement is decision 6 in
 * docs/GENERATION_SYNTHESIS.md and lands with the corpus re-score.
 */
export function normalizeScore(rawScore: number, size: number): number {
  if (rawScore <= 0) return 0;
  const [q20, q40, q60, q80] = SIZE_QUANTILES[size] ?? SIZE_QUANTILES[7];
  if (rawScore < q20) return interp(rawScore, 0, q20, 0, 20);
  if (rawScore < q40) return interp(rawScore, q20, q40, 20, 40);
  if (rawScore < q60) return interp(rawScore, q40, q60, 40, 60);
  if (rawScore < q80) return interp(rawScore, q60, q80, 60, 80);
  const span = Math.max(1e-9, q80 - q60);
  return Math.min(100, 80 + ((rawScore - q80) / span) * 20);
}

export function difficultyLevel(score: number): DifficultyLevel {
  if (score < 20) return 'easiest';
  if (score < 40) return 'easy';
  if (score < 60) return 'medium';
  if (score < 80) return 'hard';
  return 'expert';
}
