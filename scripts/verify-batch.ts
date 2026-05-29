/**
 * Verify a generated puzzle batch:
 *   - every puzzle solves (uniqueness)
 *   - what bucket does the new solver assign (vs the bucket the generator targeted)
 *   - solve-time perf
 *
 * Usage:  npx tsx scripts/verify-batch.ts public/test_batch.jsonl
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
} from '../src/utils/solver';

type Level = 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';
const ORDER: Level[] = ['easiest', 'easy', 'medium', 'hard', 'expert'];
const NUM: Record<Level, number> = {
  easiest: 0, easy: 1, medium: 2, hard: 3, expert: 4,
};

const path = process.argv[2] ?? 'public/test_batch.jsonl';
const text = readFileSync(resolve(process.cwd(), path), 'utf-8');
const lines = text.trim().split('\n');

type Row = {
  idx: number;
  size: number;
  targetLevel: Level;
  newLevel: Level;
  newScore: number;
  rawScore: number;
  ms: number;
  isValid: boolean;
  delta: number;
};

const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const raw = JSON.parse(lines[i]);
  const t0 = performance.now();
  const r = solveWithTrace(raw.puzzle);
  const ms = performance.now() - t0;
  const newScore = normalizeScore(r.rawScore, raw.puzzle.size);
  const newLevel = difficultyLevel(newScore);
  const targetLevel = raw.metadata.actual_difficulty as Level;
  rows.push({
    idx: i,
    size: raw.puzzle.size,
    targetLevel,
    newLevel,
    newScore,
    rawScore: r.rawScore,
    ms,
    isValid: r.isValid,
    delta: NUM[newLevel] - NUM[targetLevel],
  });
}

// === Validity check ===
const invalid = rows.filter(r => !r.isValid);
console.log(`\n=== Validity: ${rows.length - invalid.length}/${rows.length} solve uniquely ===`);
if (invalid.length > 0) {
  console.log('  Invalid puzzles:');
  invalid.slice(0, 10).forEach(r => console.log(`    idx=${r.idx} size=${r.size} target=${r.targetLevel}`));
}

// === Perf ===
const sortedMs = [...rows].sort((a, b) => a.ms - b.ms);
const pct = (p: number) => sortedMs[Math.floor((sortedMs.length - 1) * p / 100)].ms;
console.log(`\n=== Solve perf (ms) ===`);
console.log(`  p50=${pct(50).toFixed(1)}  p75=${pct(75).toFixed(1)}  p90=${pct(90).toFixed(1)}  p99=${pct(99).toFixed(1)}  max=${pct(100).toFixed(1)}`);

const bySizeMs: Record<number, number[]> = {};
for (const r of rows) {
  if (!bySizeMs[r.size]) bySizeMs[r.size] = [];
  bySizeMs[r.size].push(r.ms);
}
for (const sz of Object.keys(bySizeMs).map(Number).sort()) {
  const ms = bySizeMs[sz].sort((a, b) => a - b);
  const m = (p: number) => ms[Math.floor((ms.length - 1) * p / 100)];
  console.log(`  ${sz}x${sz}: p50=${m(50).toFixed(1)}  p90=${m(90).toFixed(1)}  max=${m(100).toFixed(1)}`);
}

// === Bucket match ===
console.log(`\n=== Bucket match (generator target → solver classification) ===`);
const totals = { exact: 0, off1: 0, off2plus: 0 };
for (const r of rows) {
  if (r.delta === 0) totals.exact++;
  else if (Math.abs(r.delta) === 1) totals.off1++;
  else totals.off2plus++;
}
console.log(`  exact=${totals.exact} (${(totals.exact * 100 / rows.length).toFixed(1)}%)`);
console.log(`  off-by-1=${totals.off1} (${(totals.off1 * 100 / rows.length).toFixed(1)}%)`);
console.log(`  off-by-2+=${totals.off2plus} (${(totals.off2plus * 100 / rows.length).toFixed(1)}%)`);

// Cross-tab
console.log(`\n=== Cross-tab (target × observed) ===`);
const cross: Record<string, number> = {};
for (const r of rows) cross[`${r.targetLevel}→${r.newLevel}`] = (cross[`${r.targetLevel}→${r.newLevel}`] ?? 0) + 1;
console.log('  ' + 'target\\new'.padEnd(11) + ORDER.map(s => s.padEnd(9)).join(''));
for (const tl of ORDER) {
  let line = '  ' + tl.padEnd(11);
  for (const nl of ORDER) line += String(cross[`${tl}→${nl}`] ?? 0).padEnd(9);
  console.log(line);
}

// === Bucket match by size ===
console.log(`\n=== Bucket match by size ===`);
for (const sz of [4, 5, 6, 7]) {
  const subset = rows.filter(r => r.size === sz);
  if (subset.length === 0) continue;
  const exact = subset.filter(r => r.delta === 0).length;
  const meanDelta = subset.reduce((acc, r) => acc + r.delta, 0) / subset.length;
  console.log(`  ${sz}x${sz}: exact=${exact}/${subset.length} (${(exact * 100 / subset.length).toFixed(0)}%)  mean Δ=${meanDelta.toFixed(2)}`);
}
