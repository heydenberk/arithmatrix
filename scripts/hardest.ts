/**
 * Hardest puzzle(s) of a given size + ops tier by the new solver's raw score.
 * Usage:  npx tsx scripts/hardest.ts <size> [opsTier]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
} from '../src/utils/solver';

const size = parseInt(process.argv[2] ?? '7', 10);
const opsFilter = process.argv[3] ?? 'all';

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
  te: number;
  ml: number;
  ccf: number;
};

const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const raw = JSON.parse(lines[i]);
  if (raw.puzzle.size !== size) continue;
  if ((raw.metadata.operations_tier ?? 'all') !== opsFilter) continue;
  const r = solveWithTrace(raw.puzzle);
  const newScore = normalizeScore(r.rawScore, raw.puzzle.size);
  rows.push({
    idx: i,
    oldLevel: raw.metadata.actual_difficulty,
    newLevel: difficultyLevel(newScore),
    newScore,
    rawScore: r.rawScore,
    steps: r.steps.length,
    ops: raw.metadata.operations_tier ?? 'all',
    te: r.techniqueCounts.trial_and_error ?? 0,
    ml: r.techniqueCounts.multi_cage_line_lock ?? 0,
    ccf: r.techniqueCounts.cross_cage_feasibility ?? 0,
  });
}

rows.sort((a, b) => b.rawScore - a.rawScore);
console.log(`\n=== Top 10 hardest ${size}x${size} ops="${opsFilter}" by raw score (${rows.length} total) ===`);
for (const r of rows.slice(0, 10)) {
  console.log(
    `idx=${String(r.idx).padStart(5)}  ${r.oldLevel.padEnd(7)} → ${r.newLevel.padEnd(7)}  score=${r.newScore.toFixed(1).padStart(5)}  raw=${String(r.rawScore).padStart(4)}  steps=${String(r.steps).padStart(4)}  T&E=${r.te}  MultiLock=${r.ml}  CCF=${r.ccf}`
  );
}
