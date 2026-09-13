/**
 * Derive the scoring calibration from the corpus under the current engine and
 * write it to src/utils/scoringCalibration.ts.
 *
 *   npx tsx scripts/calibrate-scoring.ts [public/all_puzzles.jsonl]
 *
 * Two things come out (docs/GENERATION_SYNTHESIS.md, decision 6):
 *   - per-size raw-score quantiles (q20..q80), which assign the named band
 *     within a size so every bucket stays populated;
 *   - cross-size anchors (q20..q80 over all sizes, plus the max), which map a
 *     raw score to one 0-100 number that means the same thing on every size.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SCORING_VERSION } from '../src/utils/difficulty';
import { scorePuzzle } from '../src/utils/solver';

const path = process.argv[2] ?? 'public/all_puzzles.jsonl';
const lines = readFileSync(path, 'utf8').trim().split('\n');

const bySize = new Map<number, number[]>();
const all: number[] = [];
let i = 0;
for (const line of lines) {
  const record = JSON.parse(line);
  const raw = scorePuzzle({ size: record.puzzle.size, cages: record.puzzle.cages }).rawScore;
  (
    bySize.get(record.puzzle.size) ?? bySize.set(record.puzzle.size, []).get(record.puzzle.size)!
  ).push(raw);
  all.push(raw);
  if (++i % 500 === 0) console.error(`${i}/${lines.length}`);
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const anchors = (xs: number[]) =>
  [0.2, 0.4, 0.6, 0.8].map(q => r1(quantile(xs, q))) as [number, number, number, number];

const perSize: Record<number, [number, number, number, number]> = {};
for (const [size, xs] of [...bySize.entries()].sort((a, b) => a[0] - b[0])) {
  perSize[size] = anchors(xs);
  console.error(
    `${size}x${size}: n=${xs.length} q20..q80 = ${perSize[size].join(', ')}  max ${r1(Math.max(...xs))}`
  );
}
const cross = { anchors: anchors(all), max: r1(Math.max(...all)) };
console.error(`all: q20..q80 = ${cross.anchors.join(', ')}  max ${cross.max}`);

const out = `/**
 * Scoring calibration, derived from the corpus by scripts/calibrate-scoring.ts
 * under scoring version ${SCORING_VERSION} on ${new Date().toISOString().slice(0, 10)}.
 * Generated; do not edit by hand. Re-run the script after a scoring change.
 *
 * Per-size quantiles assign the named band within a size (bottom 20% easiest
 * ... top 20% expert). Cross-size anchors map a raw score to the 0-100 display
 * number the same way for every size.
 */

export const CALIBRATION_SCORING_VERSION = ${SCORING_VERSION};

/** Raw-score q20, q40, q60, q80 within each size. */
export const SIZE_BAND_QUANTILES: Record<number, [number, number, number, number]> = {
${Object.entries(perSize)
  .map(([size, q]) => `  ${size}: [${q.join(', ')}],`)
  .join('\n')}
};

/** Raw-score q20, q40, q60, q80 over every size, and the largest raw score seen. */
export const CROSS_SIZE_ANCHORS: [number, number, number, number] = [${cross.anchors.join(', ')}];
export const CROSS_SIZE_MAX = ${cross.max};
`;
writeFileSync('src/utils/scoringCalibration.ts', out);
console.error('wrote src/utils/scoringCalibration.ts');
