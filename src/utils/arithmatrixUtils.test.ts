/**
 * Tests for puzzle validation and grid geometry.
 *
 * These decide whether a player's solve is accepted, which is the one thing the
 * game cannot get wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  checkWinCondition,
  findConflictingCells,
  generateCageColorMap,
  getBorderClasses,
  getCageInfo,
  validateCageConstraint,
} from './arithmatrixUtils';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';

/**
 * A hand-checked 3x3 puzzle. Solution:
 *   2 3 1
 *   1 2 3
 *   3 1 2
 * Cages: A=(0,0)+(0,1) sum 5, B=(0,2)+(1,2) sum 4, C=(1,0)+(2,0) sum 4,
 *        D=(1,1) single 2, E=(2,1)+(2,2) sum 3
 */
const PUZZLE: PuzzleDefinition = {
  size: 3,
  cages: [
    { cells: [0, 1], operation: '+', value: 5 },
    { cells: [2, 5], operation: '+', value: 4 },
    { cells: [3, 6], operation: '+', value: 4 },
    { cells: [4], operation: '=', value: 2 },
    { cells: [7, 8], operation: '+', value: 3 },
  ],
};

const SOLVED = [
  ['2', '3', '1'],
  ['1', '2', '3'],
  ['3', '1', '2'],
];

describe('checkWinCondition', () => {
  it('accepts a correct solution', () => {
    expect(checkWinCondition(SOLVED, PUZZLE)).toBe(true);
  });

  it('rejects an incomplete grid', () => {
    const partial = SOLVED.map(row => [...row]);
    partial[2][2] = '';
    expect(checkWinCondition(partial, PUZZLE)).toBe(false);
  });

  it('rejects a duplicate within a row', () => {
    // Swap so row 2 reads 3 1 1 - cages still satisfiable-looking, Latin rule broken
    const bad = SOLVED.map(row => [...row]);
    bad[2][2] = '1';
    expect(checkWinCondition(bad, PUZZLE)).toBe(false);
  });

  it('rejects a duplicate within a column', () => {
    const bad = SOLVED.map(row => [...row]);
    bad[1][0] = '2'; // column 0 becomes 2,2,3
    expect(checkWinCondition(bad, PUZZLE)).toBe(false);
  });

  it('rejects a Latin square that violates a cage total', () => {
    // A valid Latin square, but cage A then sums to 4 rather than 5
    const latinButWrongCages = [
      ['1', '3', '2'],
      ['2', '1', '3'],
      ['3', '2', '1'],
    ];
    expect(checkWinCondition(latinButWrongCages, PUZZLE)).toBe(false);
  });
});

describe('validateCageConstraint', () => {
  it('checks addition', () => {
    expect(validateCageConstraint({ cells: [0, 1], operation: '+', value: 5 }, [2, 3])).toBe(true);
    expect(validateCageConstraint({ cells: [0, 1], operation: '+', value: 5 }, [2, 2])).toBe(false);
  });

  it('checks multiplication', () => {
    expect(validateCageConstraint({ cells: [0, 1], operation: '*', value: 6 }, [2, 3])).toBe(true);
    expect(validateCageConstraint({ cells: [0, 1], operation: '*', value: 7 }, [2, 3])).toBe(false);
  });

  it('accepts subtraction in either order', () => {
    const cage = { cells: [0, 1], operation: '-', value: 1 };
    expect(validateCageConstraint(cage, [3, 2])).toBe(true);
    expect(validateCageConstraint(cage, [2, 3])).toBe(true);
  });

  it('accepts division in either order', () => {
    const cage = { cells: [0, 1], operation: '/', value: 2 };
    expect(validateCageConstraint(cage, [4, 2])).toBe(true);
    expect(validateCageConstraint(cage, [2, 4])).toBe(true);
    expect(validateCageConstraint(cage, [3, 2])).toBe(false);
  });

  it('checks a single-cell cage against its value', () => {
    expect(validateCageConstraint({ cells: [4], operation: '=', value: 2 }, [2])).toBe(true);
    expect(validateCageConstraint({ cells: [4], operation: '=', value: 2 }, [3])).toBe(false);
  });
});

describe('findConflictingCells', () => {
  const grid = [
    ['1', '', ''],
    ['', '', ''],
    ['', '2', ''],
  ];

  it('finds a same-row conflict', () => {
    expect(findConflictingCells(0, 2, '1', grid, 3)).toEqual(['0-0']);
  });

  it('finds a same-column conflict', () => {
    expect(findConflictingCells(2, 0, '1', grid, 3)).toEqual(['0-0']);
  });

  it('ignores the cell being tested', () => {
    expect(findConflictingCells(0, 0, '1', grid, 3)).toEqual([]);
  });

  it('reports no conflict for an unused value', () => {
    expect(findConflictingCells(1, 1, '3', grid, 3)).toEqual([]);
  });
});

describe('getBorderClasses', () => {
  it('marks the grid edge as a cage boundary', () => {
    const classes = getBorderClasses(0, 0, PUZZLE);
    expect(classes).toContain('cage-border-top');
    expect(classes).toContain('cage-border-left');
  });

  it('omits a boundary between two cells of the same cage', () => {
    // (0,0) and (0,1) share cage A, so there is no border between them
    expect(getBorderClasses(0, 0, PUZZLE)).not.toContain('cage-border-right');
    expect(getBorderClasses(0, 1, PUZZLE)).not.toContain('cage-border-left');
  });

  it('marks a boundary between different cages', () => {
    // (0,1) is cage A, (0,2) is cage B
    expect(getBorderClasses(0, 1, PUZZLE)).toContain('cage-border-right');
    expect(getBorderClasses(0, 2, PUZZLE)).toContain('cage-border-left');
  });
});

describe('getCageInfo', () => {
  it('labels only the top-left cell of a cage', () => {
    expect(getCageInfo(0, 0, PUZZLE)?.text).toBe('5+');
    expect(getCageInfo(0, 1, PUZZLE)).toBeNull();
  });

  it('shows a single-cell cage as a bare value', () => {
    expect(getCageInfo(1, 1, PUZZLE)?.text).toBe('2');
  });
});

describe('generateCageColorMap', () => {
  it('never gives two adjacent cages the same color', () => {
    const colors = generateCageColorMap(PUZZLE);
    const { size, cages } = PUZZLE;
    const cageOf = (cell: number) => cages.findIndex(c => c.cells.includes(cell));

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const here = cageOf(row * size + col);
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ]) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= size || nc >= size) continue;
          const there = cageOf(nr * size + nc);
          if (here !== there) {
            expect(colors.get(here)).not.toBe(colors.get(there));
          }
        }
      }
    }
  });
});
