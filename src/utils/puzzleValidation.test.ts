import { describe, expect, it } from 'vitest';
import { puzzleStructureErrors, solutionErrors, validatePuzzle } from './puzzleValidation';
import type { PuzzleDefinition } from '../types/ArithmatrixTypes';

const LATIN_4 = [
  [1, 2, 3, 4],
  [2, 3, 4, 1],
  [3, 4, 1, 2],
  [4, 1, 2, 3],
];

const allSingles = (): PuzzleDefinition => ({
  size: 4,
  cages: Array.from({ length: 16 }, (_, i) => ({
    cells: [i],
    operation: '',
    value: LATIN_4[Math.floor(i / 4)][i % 4],
  })),
});

describe('puzzleStructureErrors', () => {
  it('accepts a well-formed puzzle', () => {
    expect(puzzleStructureErrors(allSingles())).toEqual([]);
  });

  it('reports cells no cage covers', () => {
    const p = allSingles();
    p.cages.pop();
    expect(puzzleStructureErrors(p)).toContain('1 cell(s) belong to no cage');
  });

  it('reports a cell claimed by two cages', () => {
    const p: PuzzleDefinition = {
      size: 2,
      cages: [
        { cells: [0, 1], operation: '+', value: 3 },
        { cells: [1, 3], operation: '+', value: 3 },
        { cells: [2], operation: '', value: 2 },
      ],
    };
    expect(puzzleStructureErrors(p)).toContain('cell 1 is in cage 0 and cage 1');
  });

  it('reports a cage that is not connected', () => {
    const p = allSingles();
    p.cages = p.cages.filter(c => c.cells[0] !== 0 && c.cells[0] !== 15);
    p.cages.push({ cells: [0, 15], operation: '+', value: 4 });
    expect(puzzleStructureErrors(p).some(e => e.includes('not connected'))).toBe(true);
  });

  it('checks operation arity', () => {
    const p = allSingles();
    p.cages[0].operation = '-';
    expect(puzzleStructureErrors(p)).toContain('cage 0 uses - with 1 cells');
  });
});

describe('solutionErrors', () => {
  it('accepts the solution the cages were built from', () => {
    expect(validatePuzzle(allSingles(), LATIN_4)).toEqual([]);
  });

  it('rejects a grid that breaks the Latin-square rule', () => {
    const bad = LATIN_4.map(r => r.slice());
    bad[0][0] = 4;
    const errors = solutionErrors(allSingles(), bad);
    expect(errors.some(e => e.startsWith('row 0'))).toBe(true);
    expect(errors.some(e => e.startsWith('column 0'))).toBe(true);
  });

  it('rejects a grid that misses a cage target', () => {
    const p = allSingles();
    p.cages[0].value = 9;
    expect(solutionErrors(p, LATIN_4).some(e => e.startsWith('cage 0'))).toBe(true);
  });
});
