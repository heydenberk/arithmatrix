/**
 * Pick a representative ("most typical") puzzle for each (size, difficulty)
 * bucket: the one whose solver score is closest to the MEDIAN score of that
 * bucket. Prints the JSONL index so you can load it with Cmd+G and judge
 * whether the difficulty feels right.
 *
 * Usage:
 *   npx tsx scripts/difficulty-ladder.ts            # all sizes, ops=all
 *   npx tsx scripts/difficulty-ladder.ts 7          # just size 7, ops=all
 *   npx tsx scripts/difficulty-ladder.ts 7 add      # size 7, ops=add
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { difficultyLevel, normalizeScore, solveWithTrace } from '../src/utils/solver';

type Level = 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';
const ORDER: Level[] = ['easiest', 'easy', 'medium', 'hard', 'expert'];

const sizeFilter = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const opsFilter = process.argv[3] ?? 'all';

const path = resolve(process.cwd(), 'public/all_puzzles.jsonl');
const lines = readFileSync(path, 'utf-8').trim().split('\n');

type Row = {
  idx: number;
  size: number;
  targetLevel: Level;
  newLevel: Level;
  score: number;
  raw: number;
  cages: number;
};

const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const rec = JSON.parse(lines[i]);
  if (sizeFilter && rec.puzzle.size !== sizeFilter) continue;
  if ((rec.metadata.operations_tier ?? 'all') !== opsFilter) continue;
  const r = solveWithTrace(rec.puzzle);
  const score = normalizeScore(r.rawScore, rec.puzzle.size);
  rows.push({
    idx: i,
    size: rec.puzzle.size,
    targetLevel: rec.metadata.actual_difficulty,
    newLevel: difficultyLevel(score),
    score,
    raw: r.rawScore,
    cages: rec.puzzle.cages.length,
  });
}

const sizes = sizeFilter ? [sizeFilter] : [4, 5, 6, 7];

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

console.log(`\n=== Difficulty ladder (ops="${opsFilter}") — most-typical puzzle per bucket ===`);
console.log('Load each with Cmd+G, then press ` to watch the solver.\n');

for (const size of sizes) {
  console.log(`${size}x${size}:`);
  for (const level of ORDER) {
    // Use the puzzle's SOLVER-assigned level (newLevel) so the ladder reflects
    // what the current model actually thinks, not the stored target.
    const bucket = rows.filter(r => r.size === size && r.newLevel === level);
    if (bucket.length === 0) {
      console.log(`  ${level.padEnd(8)}: (none classified here)`);
      continue;
    }
    const med = median(bucket.map(r => r.score));
    // Closest-to-median puzzle = the most representative example
    const pick = bucket.reduce((best, r) =>
      Math.abs(r.score - med) < Math.abs(best.score - med) ? r : best
    );
    console.log(
      `  ${level.padEnd(8)}: idx=${String(pick.idx).padStart(4)}  score=${pick.score.toFixed(1).padStart(5)}  raw=${String(pick.raw).padStart(4)}  cages=${pick.cages}  (bucket size ${bucket.length})`
    );
  }
  console.log('');
}
