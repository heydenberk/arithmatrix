/**
 * The shipped corpus, checked whole.
 *
 * Every record the app can serve must be well-formed, have exactly one
 * solution, carry the stored solution, and be labelled by the current scoring
 * model. This used to be a 20-record sample plus a Python script nobody ran
 * in CI; the uniqueness search is now fast enough to do all of it here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countSolutions } from './solver';
import { SCORING_VERSION, difficultyLevel, normalizeScore } from './difficulty';
import { validatePuzzle } from './puzzleValidation';
import type { Cage } from '../types/ArithmatrixTypes';

type Record_ = {
  puzzle: { size: number; cages: Cage[]; solution: number[][]; difficulty_operations?: number };
  metadata: {
    size: number;
    actual_difficulty: string;
    difficulty_score?: number;
    raw_score?: number;
    scoring_version?: number;
    operations_tier?: string;
    techniques_used?: Record<string, number>;
  };
};

const RECORDS: Record_[] = readFileSync('public/all_puzzles.jsonl', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line));

const bySize = (size: number) => RECORDS.filter(r => r.puzzle.size === size);

describe('the shipped corpus', () => {
  it('has records', () => {
    expect(RECORDS.length).toBeGreaterThan(0);
  });

  for (const size of [4, 5, 6, 7]) {
    it(`${size}x${size}: every record is well-formed and uniquely solvable`, () => {
      for (const [i, record] of bySize(size).entries()) {
        const puzzle = { size: record.puzzle.size, cages: record.puzzle.cages };
        expect(validatePuzzle(puzzle, record.puzzle.solution), `record ${i}`).toEqual([]);
        expect(countSolutions(puzzle, 2), `record ${i}`).toBe(1);
      }
    });
  }

  it('is labelled by the current scoring model, consistently', () => {
    for (const [i, record] of RECORDS.entries()) {
      const m = record.metadata;
      expect(m.scoring_version, `record ${i}`).toBe(SCORING_VERSION);
      expect(m.raw_score, `record ${i}`).toBeTypeOf('number');
      expect(m.actual_difficulty, `record ${i}`).toBe(difficultyLevel(m.raw_score!, m.size));
      expect(m.difficulty_score, `record ${i}`).toBeCloseTo(normalizeScore(m.raw_score!), 6);
      expect(record.puzzle.difficulty_operations, `record ${i}`).toBe(m.difficulty_score);
      expect(Object.keys(m.techniques_used ?? {}).length, `record ${i}`).toBeGreaterThan(0);
    }
  });

  it('keeps every size x band x tier bucket populated', () => {
    const counts = new Map<string, number>();
    for (const r of RECORDS) {
      const key = `${r.puzzle.size}:${r.metadata.actual_difficulty}:${r.metadata.operations_tier ?? 'all'}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const size of [4, 5, 6, 7]) {
      for (const band of ['easiest', 'easy', 'medium', 'hard', 'expert']) {
        for (const tier of ['add', 'add-sub', 'no-div', 'all']) {
          expect(
            counts.get(`${size}:${band}:${tier}`) ?? 0,
            `${size} ${band} ${tier}`
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
