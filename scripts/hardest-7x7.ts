/**
 * Find the hardest 7x7 puzzles by the new TS solver's score.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
} from '../src/utils/solver';

const path = resolve(process.cwd(), 'public/all_puzzles.jsonl');
const lines = readFileSync(path, 'utf-8').trim().split('\n');

type Row = {
  idx: number;
  oldLevel: string;
  newLevel: string;
  newScore: number;
  rawScore: number;
  steps: number;
  ops: string;
  techniques: Record<string, number>;
};

const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const raw = JSON.parse(lines[i]);
  if (raw.puzzle.size !== 7) continue;
  const r = solveWithTrace(raw.puzzle);
  const newScore = normalizeScore(r.rawScore, raw.puzzle.size);
  rows.push({
    idx: i,
    oldLevel: raw.metadata.actual_difficulty,
    newLevel: difficultyLevel(newScore),
    newScore,
    rawScore: r.rawScore,
    steps: r.steps.length,
    ops: raw.metadata.operations_tier ?? '?',
    techniques: r.techniqueCounts,
  });
}

// Sort by raw score descending
rows.sort((a, b) => b.rawScore - a.rawScore);

console.log('=== Top 10 hardest 7x7 by new raw score ===');
for (const r of rows.slice(0, 10)) {
  const te = r.techniques.trial_and_error ?? 0;
  const ml = r.techniques.multi_cage_line_lock ?? 0;
  const ccf = r.techniques.cross_cage_feasibility ?? 0;
  console.log(
    `idx=${String(r.idx).padStart(5)}  ops=${r.ops.padEnd(8)}  ${r.oldLevel.padEnd(7)} → ${r.newLevel.padEnd(7)}  score=${r.newScore.toFixed(1).padStart(5)}  raw=${String(r.rawScore).padStart(5)}  steps=${String(r.steps).padStart(4)}  T&E=${te}  MultiLock=${ml}  CCF=${ccf}`
  );
}

console.log('\n=== Bottom 5 (for contrast) ===');
for (const r of rows.slice(-5)) {
  console.log(
    `idx=${String(r.idx).padStart(5)}  ops=${r.ops.padEnd(8)}  ${r.oldLevel.padEnd(7)} → ${r.newLevel.padEnd(7)}  score=${r.newScore.toFixed(1).padStart(5)}  raw=${String(r.rawScore).padStart(5)}  steps=${String(r.steps).padStart(4)}`
  );
}

// And the highest normalized score
const byScore = [...rows].sort((a, b) => b.newScore - a.newScore);
console.log('\n=== Top 5 by normalized score (same data, different sort key) ===');
for (const r of byScore.slice(0, 5)) {
  console.log(`idx=${String(r.idx).padStart(5)}  ops=${r.ops.padEnd(8)}  score=${r.newScore.toFixed(1)}  raw=${r.rawScore}  newLevel=${r.newLevel}`);
}
