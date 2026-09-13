/**
 * Benchmark the acceptance path on fresh candidates - the work the generator
 * actually pays for, as opposed to the corpus, which is the survivors.
 *
 *   npx tsx scripts/bench-generation.ts [candidatesPerSize=60] [seed=1]
 *
 * Reports, per size: how many candidates were unique, and p50/p95/max of
 * countSolutions(cap 2) and of the rating trace on the unique ones.
 */
import { buildCandidate } from '../src/generation/generate';
import { OPERATIONS_TIERS } from '../src/generation/operations';
import { Rng } from '../src/generation/rng';
import { countSolutions, scorePuzzle } from '../src/utils/solver';
import type { DifficultyLevel } from '../src/utils/difficulty';

const perSize = Number(process.argv[2] ?? 60);
const seed = Number(process.argv[3] ?? 1);
const DIFFS: DifficultyLevel[] = ['easiest', 'easy', 'medium', 'hard', 'expert'];

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (xs: number[]) =>
  `p50 ${pct(xs, 50).toFixed(1).padStart(7)}  p95 ${pct(xs, 95).toFixed(1).padStart(7)}  max ${Math.max(
    0,
    ...xs
  )
    .toFixed(1)
    .padStart(8)} ms`;

let grandTotal = 0;
for (const size of [4, 5, 6, 7]) {
  const rng = new Rng(seed * 1000 + size);
  const countTimes: number[] = [];
  const rateTimes: number[] = [];
  let unique = 0;
  const t0 = performance.now();
  for (let i = 0; i < perSize; i++) {
    const difficulty = DIFFS[i % DIFFS.length];
    const c = buildCandidate(size, difficulty, OPERATIONS_TIERS.all, rng);
    if (!c) continue;
    const a = performance.now();
    const n = countSolutions(c.puzzle, 2);
    const b = performance.now();
    countTimes.push(b - a);
    if (n === 1) {
      unique++;
      scorePuzzle(c.puzzle, { solution: c.solution });
      rateTimes.push(performance.now() - b);
    }
  }
  const total = performance.now() - t0;
  grandTotal += total;
  console.log(
    `${size}x${size}  candidates ${perSize}  unique ${unique}  total ${(total / 1000).toFixed(2)}s  accepted/s ${(unique / (total / 1000)).toFixed(1)}`
  );
  console.log(`      countSolutions  ${fmt(countTimes)}`);
  console.log(`      rating          ${fmt(rateTimes)}`);
}
console.log(`total ${(grandTotal / 1000).toFixed(2)}s`);
