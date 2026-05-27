/**
 * Re-score every puzzle in public/all_puzzles.jsonl with the new TS solver
 * and report how the new classification compares to the stored
 * `actual_difficulty`. Run with:
 *
 *   npx tsx scripts/analyze-difficulty.ts
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
  easiest: 0,
  easy: 1,
  medium: 2,
  hard: 3,
  expert: 4,
};

type Record = {
  idx: number;
  size: number;
  oldLevel: Level;
  newLevel: Level;
  newScore: number;
  rawScore: number;
  delta: number;
  steps: number;
  techniques: Record<string, number>;
};

const path = resolve(process.cwd(), 'public/all_puzzles.jsonl');
const text = readFileSync(path, 'utf-8');
const lines = text.trim().split('\n');

const records: Record[] = [];
let t0 = Date.now();
let last = 0;

for (let i = 0; i < lines.length; i++) {
  const raw = JSON.parse(lines[i]);
  const r = solveWithTrace(raw.puzzle);
  const newScore = normalizeScore(r.rawScore, raw.puzzle.size);
  const newLevel = difficultyLevel(newScore);
  const oldLevel = raw.metadata.actual_difficulty as Level;
  records.push({
    idx: i,
    size: raw.puzzle.size,
    oldLevel,
    newLevel,
    newScore,
    rawScore: r.rawScore,
    delta: NUM[newLevel] - NUM[oldLevel],
    steps: r.steps.length,
    techniques: r.techniqueCounts,
  });

  // Progress log every 100 puzzles, throttled
  if ((i + 1) % 200 === 0 || i === lines.length - 1) {
    const ms = Date.now() - t0;
    const rate = ((i + 1 - last) / ((ms - last) / 1000)).toFixed(1);
    last = ms;
    process.stderr.write(`[${i + 1}/${lines.length}] ${ms}ms (~${rate}/s)\n`);
  }
}

// Aggregate stats
const dist: Record<number, number> = {};
const bySize: Record<number, { total: number; exact: number; easier: number; harder: number; deltaSum: number }> = {};
for (const r of records) {
  dist[r.delta] = (dist[r.delta] ?? 0) + 1;
  if (!bySize[r.size]) bySize[r.size] = { total: 0, exact: 0, easier: 0, harder: 0, deltaSum: 0 };
  bySize[r.size].total++;
  bySize[r.size].deltaSum += r.delta;
  if (r.delta === 0) bySize[r.size].exact++;
  else if (r.delta > 0) bySize[r.size].harder++;
  else bySize[r.size].easier++;
}

// Cross-tab old × new
const cross: Record<string, number> = {};
for (const r of records) {
  const key = `${r.oldLevel}→${r.newLevel}`;
  cross[key] = (cross[key] ?? 0) + 1;
}

// Top movements
const harder = [...records].filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta || b.newScore - a.newScore).slice(0, 15);
const easier = [...records].filter(r => r.delta < 0).sort((a, b) => a.delta - b.delta || a.newScore - b.newScore).slice(0, 15);

const fmt = (n: number) => n.toString().padStart(5);

console.log('\n=== Distribution of (new − old) categorical change ===');
for (const d of Object.keys(dist).map(Number).sort((a, b) => a - b)) {
  const sign = d > 0 ? '+' : '';
  console.log(`  Δ${sign}${d}: ${fmt(dist[d])} (${((dist[d] / records.length) * 100).toFixed(1)}%)`);
}

console.log('\n=== By size ===');
for (const sz of Object.keys(bySize).map(Number).sort((a, b) => a - b)) {
  const b = bySize[sz];
  console.log(
    `  ${sz}×${sz}: total=${b.total}  exact=${b.exact} (${((b.exact / b.total) * 100).toFixed(1)}%)  easier=${b.easier}  harder=${b.harder}  mean Δ=${(b.deltaSum / b.total).toFixed(2)}`
  );
}

console.log('\n=== old → new cross-tab ===');
console.log('  ' + ['old\\new', ...ORDER].map(s => s.padEnd(10)).join(''));
for (const oldL of ORDER) {
  const row = [oldL.padEnd(10)];
  for (const newL of ORDER) {
    const k = `${oldL}→${newL}`;
    row.push(((cross[k] ?? 0).toString()).padEnd(10));
  }
  console.log('  ' + row.join(''));
}

console.log('\n=== Biggest "got harder" (top 15) ===');
for (const r of harder) {
  console.log(`  idx=${fmt(r.idx)}  size=${r.size}  ${r.oldLevel.padEnd(7)} → ${r.newLevel.padEnd(7)}  score=${r.newScore.toFixed(1).padStart(5)}  raw=${fmt(r.rawScore)}  Δ${r.delta > 0 ? '+' : ''}${r.delta}`);
}
if (harder.length === 0) console.log('  (none — nothing got harder)');

console.log('\n=== Biggest "got easier" (top 15) ===');
for (const r of easier) {
  console.log(`  idx=${fmt(r.idx)}  size=${r.size}  ${r.oldLevel.padEnd(7)} → ${r.newLevel.padEnd(7)}  score=${r.newScore.toFixed(1).padStart(5)}  raw=${fmt(r.rawScore)}  Δ${r.delta}`);
}

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
