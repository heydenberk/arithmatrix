/**
 * The scoring contract.
 *
 * A rating is only worth persisting if the same puzzle always gets the same
 * one, and if the cheap score-only path gives exactly what the trace would.
 * These tests pin both, and pin the actual numbers for a spread of corpus
 * puzzles so an accidental change to the deduction order shows up as a
 * failure here rather than as a quiet drift in the gallery.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SCORING_VERSION,
  assessPuzzle,
  countSolutions,
  scorePuzzle,
  solveWithTrace,
  type TechniqueId,
} from './solver';
import pinned from './__fixtures__/scoring-v2.json';
import type { PuzzleDefinition } from '../types/ArithmatrixTypes';

type Record_ = {
  puzzle: { size: number; cages: PuzzleDefinition['cages']; solution: number[][] };
  metadata: { size: number; actual_difficulty: string };
};

const LINES = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
const recordAt = (index: number): Record_ => JSON.parse(LINES[index]);
const definitionOf = (r: Record_): PuzzleDefinition => ({
  size: r.puzzle.size,
  cages: r.puzzle.cages,
});

const FIXTURES = pinned.fixtures as Array<{
  index: number;
  size: number;
  storedLevel: string;
  techniqueCounts: Record<TechniqueId, number>;
  rawScore: number;
  solved: boolean;
}>;

describe('score mode against trace mode', () => {
  it('reaches the same counts, raw score and final grid on every fixture', () => {
    for (const f of FIXTURES) {
      const puzzle = definitionOf(recordAt(f.index));
      const trace = solveWithTrace(puzzle);
      const score = scorePuzzle(puzzle);
      expect(score.techniqueCounts, `counts for record ${f.index}`).toEqual(trace.techniqueCounts);
      expect(score.rawScore, `raw score for record ${f.index}`).toBeCloseTo(trace.rawScore, 9);
      expect(trace.finalGrid, `grid for record ${f.index}`).toEqual(
        recordAt(f.index).puzzle.solution
      );
    }
  });

  it('produces no steps, so the trace cannot be what is paid for', () => {
    // scorePuzzle exposes no steps; this checks the mode really is wired
    // through by comparing wall time on the biggest fixture
    const big = FIXTURES.filter(f => f.size === 7).slice(0, 3);
    for (const f of big) {
      const puzzle = definitionOf(recordAt(f.index));
      const t0 = performance.now();
      solveWithTrace(puzzle);
      const t1 = performance.now();
      scorePuzzle(puzzle);
      const t2 = performance.now();
      expect(t2 - t1).toBeLessThanOrEqual(t1 - t0 + 5);
    }
  });
});

describe('determinism', () => {
  it('gives the same trace twice', () => {
    for (const f of FIXTURES.slice(0, 8)) {
      const puzzle = definitionOf(recordAt(f.index));
      const a = solveWithTrace(puzzle).steps.map(s => `${s.technique}:${s.description}`);
      const b = solveWithTrace(puzzle).steps.map(s => `${s.technique}:${s.description}`);
      expect(a).toEqual(b);
    }
  });
});

describe(`pinned ratings, scoring version ${SCORING_VERSION}`, () => {
  it('is pinned for the version the code says it is', () => {
    expect(pinned.scoringVersion).toBe(SCORING_VERSION);
  });

  it('rates every fixture exactly as pinned', () => {
    // A failure here is a scoring change. If it was intended, bump
    // SCORING_VERSION and re-run scripts/pin-scoring-fixtures.ts.
    for (const f of FIXTURES) {
      const record = recordAt(f.index);
      const r = scorePuzzle(definitionOf(record), { solution: record.puzzle.solution });
      expect(r.techniqueCounts, `record ${f.index} (${f.size}x${f.size} ${f.storedLevel})`).toEqual(
        f.techniqueCounts
      );
      expect(r.rawScore).toBeCloseTo(f.rawScore, 5);
      expect(r.solved).toBe(true);
      expect(r.scoringVersion).toBe(SCORING_VERSION);
    }
  });
});

describe('assessPuzzle', () => {
  it('rates a corpus puzzle as unique and solved', () => {
    const record = recordAt(FIXTURES[0].index);
    const a = assessPuzzle(definitionOf(record), record.puzzle.solution);
    expect(a.errors).toEqual([]);
    expect(a.unique).toBe(true);
    expect(a.rating?.solved).toBe(true);
    expect(a.rating?.level).toBeDefined();
  });

  it('stops at structure when the definition is malformed', () => {
    const record = recordAt(FIXTURES[0].index);
    const puzzle = definitionOf(record);
    puzzle.cages = puzzle.cages.slice(1); // uncover a cell
    const a = assessPuzzle(puzzle);
    expect(a.errors.length).toBeGreaterThan(0);
    expect(a.rating).toBeNull();
  });

  it('does not rate a puzzle with more than one solution', () => {
    const puzzle: PuzzleDefinition = {
      size: 4,
      cages: [{ cells: Array.from({ length: 16 }, (_, i) => i), operation: '+', value: 40 }],
    };
    expect(countSolutions(puzzle, 2)).toBe(2);
    const a = assessPuzzle(puzzle);
    expect(a.errors).toEqual([]);
    expect(a.unique).toBe(false);
    expect(a.rating).toBeNull();
  });

  it('reports solved=false when the trace disagrees with a supplied solution', () => {
    const record = recordAt(FIXTURES[0].index);
    const wrong = record.puzzle.solution.map(r => r.slice());
    [wrong[0][0], wrong[0][1]] = [wrong[0][1], wrong[0][0]];
    // The solver repairs from the supplied solution, so hand it one that is
    // not the puzzle's: the trace still solves the real puzzle and disagrees
    const r = scorePuzzle(definitionOf(record), { solution: wrong });
    expect(r.solved).toBe(false);
  });
});
