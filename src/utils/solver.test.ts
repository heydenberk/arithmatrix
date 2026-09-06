/**
 * Tests for the solver.
 *
 * The solver is load-bearing twice over: it assigns every puzzle's difficulty
 * score (which the gallery groups by) and it will drive hints. So the headline
 * test is not a hand-made fixture but the real database - the solver must solve
 * actual shipped puzzles and agree with their stored solutions.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TECHNIQUE_WEIGHTS,
  bottleneckRaw,
  countSolutions,
  difficultyLevel,
  normalizeScore,
  solveWithTrace,
  type TechniqueId,
} from './solver';
import { checkWinCondition } from './arithmatrixUtils';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';

type Record_ = {
  puzzle: { size: number; cages: PuzzleDefinition['cages']; solution: number[][] };
  metadata: { size: number; actual_difficulty: string; operations_tier?: string };
};

/**
 * A spread of real puzzles: every size crossed with every difficulty tier, one
 * each, so a regression in any band shows up.
 */
const sampleRecords = (): Record_[] => {
  const lines = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
  const picked = new Map<string, Record_>();
  for (const line of lines) {
    const record = JSON.parse(line) as Record_;
    const key = `${record.metadata.size}:${record.metadata.actual_difficulty}`;
    if (!picked.has(key)) picked.set(key, record);
  }
  return [...picked.values()];
};

const RECORDS = sampleRecords();

describe('solveWithTrace on the real puzzle database', () => {
  it('samples every size and difficulty', () => {
    expect(RECORDS.length).toBe(20); // 4 sizes x 5 difficulties
  });

  it.each(
    RECORDS.map(
      r => [`${r.metadata.size}x${r.metadata.size} ${r.metadata.actual_difficulty}`, r] as const
    )
  )('reaches a genuine solution for %s', (_label, record) => {
    const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
    const result = solveWithTrace(puzzle);

    // The stored solution must itself be one, whatever the solver lands on
    expect(
      checkWinCondition(
        record.puzzle.solution.map(row => row.map(String)),
        puzzle
      )
    ).toBe(true);
    // ...and so must whatever the solver produced
    expect(
      checkWinCondition(
        result.finalGrid.map(row => row.map(String)),
        puzzle
      )
    ).toBe(true);
  });

  it('matches the stored solution whenever the puzzle is uniquely solvable', () => {
    // A puzzle with one solution leaves the solver no room to differ. Puzzles
    // with several are a corpus defect, tracked separately by
    // scripts/validate_puzzles.py.
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      if (countSolutions(puzzle, 2) !== 1) continue;
      expect(solveWithTrace(puzzle).finalGrid).toEqual(record.puzzle.solution);
    }
  });
});

describe('countSolutions', () => {
  it('reports exactly one for a puzzle with a single solution', () => {
    // 2x2: cages force 1 2 / 2 1
    const unique: PuzzleDefinition = {
      size: 2,
      cages: [
        { cells: [0], operation: '=', value: 1 },
        { cells: [1], operation: '=', value: 2 },
        { cells: [2, 3], operation: '+', value: 3 },
      ],
    };
    expect(countSolutions(unique, 2)).toBe(1);
  });

  it('detects more than one solution', () => {
    // No cage pins anything: both 2x2 Latin squares satisfy the single sum cage
    const ambiguous: PuzzleDefinition = {
      size: 2,
      cages: [
        { cells: [0, 1], operation: '+', value: 3 },
        { cells: [2, 3], operation: '+', value: 3 },
      ],
    };
    expect(countSolutions(ambiguous, 2)).toBe(2);
  });

  it('reports zero when the cages cannot be satisfied', () => {
    const impossible: PuzzleDefinition = {
      size: 2,
      cages: [
        { cells: [0, 1], operation: '+', value: 99 },
        { cells: [2, 3], operation: '+', value: 3 },
      ],
    };
    expect(countSolutions(impossible, 2)).toBe(0);
  });

  it('honours the cap', () => {
    const ambiguous: PuzzleDefinition = {
      size: 2,
      cages: [
        { cells: [0, 1], operation: '+', value: 3 },
        { cells: [2, 3], operation: '+', value: 3 },
      ],
    };
    expect(countSolutions(ambiguous, 1)).toBe(1);
  });

  it('agrees with the solver on shipped puzzles it calls unique', () => {
    for (const record of RECORDS.slice(0, 8)) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const result = solveWithTrace(puzzle);
      expect(result.isValid).toBe(countSolutions(puzzle, 2) === 1);
    }
  });
});

describe('solveWithTrace steps', () => {
  const record = RECORDS.find(r => r.metadata.size === 5)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
  const result = solveWithTrace(puzzle);

  it('produces a non-empty trace', () => {
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('keeps every referenced cell inside the grid', () => {
    for (const step of result.steps) {
      for (const cell of [...step.highlight, ...(step.supportCells ?? [])]) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(puzzle.size);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(puzzle.size);
      }
    }
  });

  it('gives every step a description, which hints will surface verbatim', () => {
    for (const step of result.steps) {
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it('accumulates score monotonically', () => {
    let previous = -1;
    for (const step of result.steps) {
      expect(step.cumulativeScore).toBeGreaterThanOrEqual(previous);
      previous = step.cumulativeScore;
    }
  });
});

describe('solveWithTrace from a partial grid', () => {
  it('finishes a puzzle seeded with most of its solution', () => {
    const record = RECORDS.find(r => r.metadata.size === 4)!;
    const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };

    // Seed everything but the last row, the way a hint request mid-game would
    const startGrid = record.puzzle.solution.map((row, r) =>
      r < puzzle.size - 1 ? [...row] : row.map(() => 0)
    );

    const result = solveWithTrace(puzzle, { startGrid });
    expect(result.isValid).toBe(true);
    expect(result.finalGrid).toEqual(record.puzzle.solution);
  });

  it('returns no steps when the grid is already solved', () => {
    const record = RECORDS.find(r => r.metadata.size === 4)!;
    const result = solveWithTrace(
      { size: record.puzzle.size, cages: record.puzzle.cages },
      { startGrid: record.puzzle.solution.map(row => [...row]) }
    );
    expect(result.steps).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });
});

describe('difficultyLevel', () => {
  it('bands scores the way the gallery groups them', () => {
    expect(difficultyLevel(0)).toBe('easiest');
    expect(difficultyLevel(19.9)).toBe('easiest');
    expect(difficultyLevel(20)).toBe('easy');
    expect(difficultyLevel(39.9)).toBe('easy');
    expect(difficultyLevel(40)).toBe('medium');
    expect(difficultyLevel(59.9)).toBe('medium');
    expect(difficultyLevel(60)).toBe('hard');
    expect(difficultyLevel(79.9)).toBe('hard');
    expect(difficultyLevel(80)).toBe('expert');
    expect(difficultyLevel(100)).toBe('expert');
  });
});

describe('normalizeScore', () => {
  it('maps nothing to zero', () => {
    expect(normalizeScore(0, 6)).toBe(0);
    expect(normalizeScore(-5, 6)).toBe(0);
  });

  it('increases with raw score', () => {
    const scores = [1, 5, 10, 25, 50, 100, 400].map(raw => normalizeScore(raw, 6));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it('never exceeds 100', () => {
    expect(normalizeScore(100000, 4)).toBeLessThanOrEqual(100);
    expect(normalizeScore(100000, 7)).toBeLessThanOrEqual(100);
  });

  it('falls back to the 7x7 curve for an unknown size', () => {
    expect(normalizeScore(50, 9)).toBe(normalizeScore(50, 7));
  });
});

describe('bottleneckRaw', () => {
  const empty = (): Record<TechniqueId, number> =>
    Object.fromEntries(Object.keys(TECHNIQUE_WEIGHTS).map(t => [t, 0])) as Record<
      TechniqueId,
      number
    >;

  it('is zero with no techniques used', () => {
    expect(bottleneckRaw(empty())).toBe(0);
  });

  it('compresses bulk cheap work so volume cannot dominate', () => {
    const few = empty();
    few.naked_single = 10;
    const many = empty();
    many.naked_single = 40;

    // Four times the work should be far less than four times the score
    expect(bottleneckRaw(many)).toBeLessThan(bottleneckRaw(few) * 4);
  });

  it('counts a hard technique at full weight', () => {
    const cheap = empty();
    cheap.naked_single = 1;
    const hard = empty();
    hard.trial_and_error = 1;

    expect(bottleneckRaw(hard)).toBeGreaterThan(bottleneckRaw(cheap));
    expect(bottleneckRaw(hard)).toBeCloseTo(TECHNIQUE_WEIGHTS.trial_and_error, 5);
  });
});
