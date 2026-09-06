/**
 * Tests for the hint engine.
 *
 * The behaviour worth protecting is what a hint *withholds*: the first level
 * must not name the cell or the value, or the feature is just a reveal button.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeHint } from './hints';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';

type Record_ = {
  puzzle: { size: number; cages: PuzzleDefinition['cages']; solution: number[][] };
  metadata: { size: number; actual_difficulty: string };
};

const records = (): Record_[] => {
  const lines = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
  const picked = new Map<string, Record_>();
  for (const line of lines) {
    const record = JSON.parse(line) as Record_;
    const key = `${record.metadata.size}:${record.metadata.actual_difficulty}`;
    if (!picked.has(key)) picked.set(key, record);
  }
  return [...picked.values()];
};

const RECORDS = records();
const emptyGrid = (size: number) => Array.from({ length: size }, () => Array(size).fill(''));
const asStrings = (grid: number[][]) => grid.map(row => row.map(String));

describe('computeHint on a fresh board', () => {
  it.each(
    RECORDS.map(
      r => [`${r.metadata.size}x${r.metadata.size} ${r.metadata.actual_difficulty}`, r] as const
    )
  )('offers a deduction for %s', (_label, record) => {
    const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
    const hint = computeHint(puzzle, emptyGrid(puzzle.size));

    expect(hint).not.toBeNull();
    expect(hint!.kind).toBe('deduction');
    expect(hint!.levels.length).toBeGreaterThanOrEqual(3);
  });

  it('never offers a guess as a hint', () => {
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const hint = computeHint(puzzle, emptyGrid(puzzle.size));
      expect(hint!.technique).not.toBe('trial_and_error');
    }
  });
});

describe('progressive disclosure', () => {
  const record = RECORDS.find(r => r.metadata.size === 5)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
  const hint = computeHint(puzzle, emptyGrid(puzzle.size))!;

  it('reveals no cells at the first level', () => {
    expect(hint.levels[0].targetCells).toEqual([]);
    expect(hint.levels[0].supportCells).toEqual([]);
  });

  it('does not name a cell in the first level text', () => {
    // Cell names look like A1, D3 - the giveaway a reveal button would print
    expect(hint.levels[0].body).not.toMatch(/\b[A-G][1-7]\b/);
  });

  it('does not name the answer in the first level text', () => {
    const last = hint.levels[hint.levels.length - 1];
    // The solver's own wording names the value; level one must not
    expect(last.body).not.toBe(hint.levels[0].body);
    expect(hint.levels[0].body).not.toMatch(/must be \d/);
  });

  it('reveals the target cell only at the "which cell" level', () => {
    const whichCell = hint.levels.find(l => l.title === 'Which cell');
    expect(whichCell).toBeDefined();
    expect(whichCell!.targetCells.length).toBeGreaterThan(0);
    for (const level of hint.levels.slice(0, hint.levels.indexOf(whichCell!))) {
      expect(level.targetCells).toEqual([]);
    }
  });

  it('ends with the solver’s own description', () => {
    const last = hint.levels[hint.levels.length - 1];
    expect(last.title).toBe('The move');
    expect(last.body.length).toBeGreaterThan(0);
  });

  it('discloses monotonically - a level never hides what an earlier one showed', () => {
    let seenSupport = 0;
    let seenTarget = 0;
    for (const level of hint.levels) {
      expect(level.supportCells.length).toBeGreaterThanOrEqual(seenSupport);
      expect(level.targetCells.length).toBeGreaterThanOrEqual(seenTarget);
      seenSupport = level.supportCells.length;
      seenTarget = level.targetCells.length;
    }
  });
});

describe('computeHint mid-game', () => {
  const record = RECORDS.find(r => r.metadata.size === 4)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };

  it('reports a contradiction when a placed value cannot be right', () => {
    const grid = emptyGrid(puzzle.size);
    // Two of the same value in one row is unsatisfiable
    grid[0][0] = '1';
    grid[0][1] = '1';

    const hint = computeHint(puzzle, grid)!;
    expect(hint.kind).toBe('contradiction');
    expect(hint.levels[0].body).toMatch(/wrong/i);
  });

  it('reports a contradiction for a value that breaks a cage', () => {
    // Take the solution and change one cell to something else valid for the
    // Latin square but wrong for its cage
    const grid = asStrings(record.puzzle.solution);
    const size = puzzle.size;
    const original = record.puzzle.solution[0][0];
    const replacement = original === size ? original - 1 : original + 1;
    grid[0][0] = String(replacement);
    // Clear the conflicting peer so the break is the cage, not the Latin rule
    for (let c = 1; c < size; c++) if (grid[0][c] === String(replacement)) grid[0][c] = '';
    for (let r = 1; r < size; r++) if (grid[r][0] === String(replacement)) grid[r][0] = '';

    const hint = computeHint(puzzle, grid)!;
    expect(hint.kind).toBe('contradiction');
  });

  it('reports nothing left to do on a full board', () => {
    const hint = computeHint(puzzle, asStrings(record.puzzle.solution))!;
    expect(hint.kind).toBe('solved');
  });

  it('offers a deduction from a partially filled board', () => {
    const grid = emptyGrid(puzzle.size);
    // Seed the first row correctly
    record.puzzle.solution[0].forEach((v, c) => {
      grid[0][c] = String(v);
    });
    const hint = computeHint(puzzle, grid)!;
    expect(hint.kind).toBe('deduction');
  });

  it('returns null without a puzzle', () => {
    expect(computeHint(null as unknown as PuzzleDefinition, [])).toBeNull();
  });
});
