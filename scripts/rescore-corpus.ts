/**
 * Re-score the shipped corpus in place under the current engine.
 *
 *   npx tsx scripts/rescore-corpus.ts [public/all_puzzles.jsonl]
 *
 * Every record is validated (structure, exactly one solution, trace reaches
 * the stored solution) and its metadata rewritten: actual_difficulty (band
 * within its size), difficulty_score (cross-size 0-100), raw_score,
 * scoring_version, techniques_used. Record order is preserved and nothing is
 * added or removed - the browser uses the line index as a puzzle's identity
 * (decision 5). Writes atomically; prints the band migration matrix. Exits 1
 * if any record fails validation, without writing.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { assessPuzzle } from '../src/utils/solver';
import { DIFFICULTY_ORDER, SCORING_VERSION } from '../src/utils/difficulty';
import { CALIBRATION_SCORING_VERSION } from '../src/utils/scoringCalibration';

if (CALIBRATION_SCORING_VERSION !== SCORING_VERSION) {
  console.error(
    `calibration is for scoring v${CALIBRATION_SCORING_VERSION}, engine is v${SCORING_VERSION}; run calibrate-scoring first`
  );
  process.exit(1);
}

const path = process.argv[2] ?? 'public/all_puzzles.jsonl';
const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
const out: string[] = [];
const matrix = new Map<string, number>();
const failures: string[] = [];
let i = 0;

for (const line of lines) {
  const record = JSON.parse(line);
  const puzzle = { size: record.puzzle.size, cages: record.puzzle.cages };
  const a = assessPuzzle(puzzle, record.puzzle.solution);
  if (a.errors.length || !a.unique || !a.rating?.solved) {
    failures.push(
      `line ${i}: ${a.errors.join('; ') || (a.unique ? 'trace did not reach the solution' : `${a.solutionCount} solutions`)}`
    );
  } else {
    const techniques: Record<string, number> = {};
    for (const [name, count] of Object.entries(a.rating.techniqueCounts))
      if (count > 0) techniques[name.toUpperCase()] = count;
    const from = record.metadata.actual_difficulty;
    const to = a.rating.level;
    matrix.set(
      `${record.puzzle.size}:${from}->${to}`,
      (matrix.get(`${record.puzzle.size}:${from}->${to}`) ?? 0) + 1
    );
    record.puzzle.difficulty_operations = a.rating.score;
    record.metadata = {
      ...record.metadata,
      actual_difficulty: to,
      difficulty_score: a.rating.score,
      raw_score: a.rating.rawScore,
      scoring_version: SCORING_VERSION,
      techniques_used: techniques,
      rescored_at: new Date().toISOString(),
    };
  }
  out.push(JSON.stringify(record));
  if (++i % 500 === 0) console.error(`${i}/${lines.length}`);
}

if (failures.length) {
  console.error(
    `${failures.length} record(s) failed validation; nothing written:\n${failures.slice(0, 10).join('\n')}`
  );
  process.exit(1);
}

const tmp = `${path}.${process.pid}.tmp`;
writeFileSync(tmp, out.join('\n') + '\n');
renameSync(tmp, path);

console.error(`\nband migration (size: from -> to, count); unchanged rows omitted`);
let unchanged = 0;
for (const size of [4, 5, 6, 7]) {
  for (const from of DIFFICULTY_ORDER) {
    for (const to of DIFFICULTY_ORDER) {
      const n = matrix.get(`${size}:${from}->${to}`) ?? 0;
      if (!n) continue;
      if (from === to) unchanged += n;
      else console.error(`  ${size}x${size} ${from.padEnd(7)} -> ${to.padEnd(7)} ${n}`);
    }
  }
}
console.error(`unchanged: ${unchanged}/${lines.length}; wrote ${lines.length} records to ${path}`);
