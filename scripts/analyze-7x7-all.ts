/**
 * Focused: 7x7 puzzles with operations_tier === 'all', biggest and smallest
 * difficulty changes from old → new.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
} from '../src/utils/solver';

type Level = 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';
const NUM: Record<Level, number> = {
  easiest: 0, easy: 1, medium: 2, hard: 3, expert: 4,
};

const path = resolve(process.cwd(), 'public/all_puzzles.jsonl');
const lines = readFileSync(path, 'utf-8').trim().split('\n');

type Row = {
  idx: number;
  oldLevel: Level;
  newLevel: Level;
  newScore: number;
  rawScore: number;
  delta: number;
  ops: string;
};

const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const raw = JSON.parse(lines[i]);
  if (raw.puzzle.size !== 7) continue;
  if (raw.metadata.operations_tier !== 'all') continue;

  const r = solveWithTrace(raw.puzzle);
  const newScore = normalizeScore(r.rawScore, raw.puzzle.size);
  const newLevel = difficultyLevel(newScore);
  const oldLevel = raw.metadata.actual_difficulty as Level;
  rows.push({
    idx: i,
    oldLevel,
    newLevel,
    newScore,
    rawScore: r.rawScore,
    delta: NUM[newLevel] - NUM[oldLevel],
    ops: raw.metadata.operations_tier,
  });
}

const fmt = (n: number) => n.toString().padStart(5);
const row = (r: Row) => `  idx=${fmt(r.idx)}  ${r.oldLevel.padEnd(7)} → ${r.newLevel.padEnd(7)}  score=${r.newScore.toFixed(1).padStart(5)}  raw=${fmt(r.rawScore)}  Δ${r.delta >= 0 ? '+' : ''}${r.delta}`;

console.log(`\n=== 7x7 puzzles with ops="all": ${rows.length} total ===`);

// By old bucket, show how many fell into each new bucket
const cross: Record<string, number> = {};
for (const r of rows) {
  const k = `${r.oldLevel}→${r.newLevel}`;
  cross[k] = (cross[k] ?? 0) + 1;
}
const ORDER: Level[] = ['easiest', 'easy', 'medium', 'hard', 'expert'];
console.log('\n  old\\new   ' + ORDER.map(s => s.padEnd(8)).join(''));
for (const ol of ORDER) {
  let line = '  ' + ol.padEnd(10);
  for (const nl of ORDER) {
    const v = cross[`${ol}→${nl}`] ?? 0;
    line += String(v).padEnd(8);
  }
  console.log(line);
}

console.log('\n=== Biggest Δ (most changed, sorted by |Δ| desc, then by raw asc) ===');
const sortedByAbs = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.rawScore - a.rawScore);
// Pick one example for each magnitude of change, across each old bucket
const byMagnitude: Record<number, Row[]> = {};
for (const r of sortedByAbs) {
  if (!byMagnitude[Math.abs(r.delta)]) byMagnitude[Math.abs(r.delta)] = [];
  byMagnitude[Math.abs(r.delta)].push(r);
}
const mags = Object.keys(byMagnitude).map(Number).sort((a, b) => b - a);
for (const m of mags) {
  console.log(`\n  |Δ|=${m}  (${byMagnitude[m].length} puzzles)`);
  for (const r of byMagnitude[m].slice(0, 3)) console.log(row(r));
}

console.log('\n=== Smallest Δ (unchanged, by old bucket) ===');
for (const ol of ORDER) {
  const matches = rows.filter(r => r.oldLevel === ol && r.delta === 0);
  if (matches.length === 0) continue;
  console.log(`\n  was ${ol}, still ${ol}  (${matches.length} puzzles)`);
  for (const r of matches.slice(0, 3)) console.log(row(r));
}
