/**
 * Pin the scoring fixtures: technique counts and raw score for one corpus
 * puzzle per size x difficulty, under the current SCORING_VERSION. Run after
 * an intentional scoring change (and bump SCORING_VERSION first); the parity
 * test in src/utils/solver.parity.test.ts fails on any unintentional one.
 *
 *   npx tsx scripts/pin-scoring-fixtures.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SCORING_VERSION, scorePuzzle } from '../src/utils/solver';

type Record_ = {
  puzzle: {
    size: number;
    cages: { cells: number[]; operation: string; value: number }[];
    solution: number[][];
  };
  metadata: { size: number; actual_difficulty: string };
};

const lines = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
const picked = new Map<string, { index: number; record: Record_ }>();
lines.forEach((line, index) => {
  const record = JSON.parse(line) as Record_;
  const key = `${record.metadata.size}:${record.metadata.actual_difficulty}`;
  if (!picked.has(key)) picked.set(key, { index, record });
});

const fixtures = [...picked.values()].map(({ index, record }) => {
  const r = scorePuzzle(
    { size: record.puzzle.size, cages: record.puzzle.cages },
    { solution: record.puzzle.solution }
  );
  return {
    index,
    size: record.puzzle.size,
    storedLevel: record.metadata.actual_difficulty,
    techniqueCounts: r.techniqueCounts,
    rawScore: Number(r.rawScore.toFixed(6)),
    solved: r.solved,
  };
});

mkdirSync('src/utils/__fixtures__', { recursive: true });
writeFileSync(
  'src/utils/__fixtures__/scoring-v2.json',
  JSON.stringify({ scoringVersion: SCORING_VERSION, fixtures }, null, 2) + '\n'
);
console.log(`wrote ${fixtures.length} fixtures for scoring version ${SCORING_VERSION}`);
