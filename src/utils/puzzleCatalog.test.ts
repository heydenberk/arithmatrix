/**
 * Tests for the puzzle catalog.
 *
 * The cage signature is the important part: it identifies a puzzle without its
 * database index, and both saved games and completion history are keyed on it.
 * If it stopped being stable, players would lose progress.
 */

import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_ORDER,
  FULL_DIFFICULTY_RANGE,
  canonicalCagesSig,
  describeDifficultyRange,
  difficultyInRange,
  groupByDifficulty,
  pickRandomEntry,
  scoreBandStart,
  type CatalogEntry,
} from './puzzleCatalog';

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry =>
  ({
    index: 0,
    size: 4,
    operationsTier: 'all',
    difficulty: 'medium',
    score: 50,
    cagesSig: 'sig',
    record: {} as CatalogEntry['record'],
    ...overrides,
  }) as CatalogEntry;

describe('canonicalCagesSig', () => {
  it('is independent of the order cages are listed in', () => {
    const a = canonicalCagesSig([
      { cells: [0, 1], operation: '+', value: 5 },
      { cells: [2, 3], operation: '*', value: 6 },
    ]);
    const b = canonicalCagesSig([
      { cells: [2, 3], operation: '*', value: 6 },
      { cells: [0, 1], operation: '+', value: 5 },
    ]);
    expect(a).toBe(b);
  });

  it('is independent of the order cells are listed in', () => {
    const a = canonicalCagesSig([{ cells: [0, 1, 2], operation: '+', value: 6 }]);
    const b = canonicalCagesSig([{ cells: [2, 0, 1], operation: '+', value: 6 }]);
    expect(a).toBe(b);
  });

  it('distinguishes different targets', () => {
    const a = canonicalCagesSig([{ cells: [0, 1], operation: '+', value: 5 }]);
    const b = canonicalCagesSig([{ cells: [0, 1], operation: '+', value: 6 }]);
    expect(a).not.toBe(b);
  });

  it('distinguishes different operations', () => {
    const a = canonicalCagesSig([{ cells: [0, 1], operation: '+', value: 6 }]);
    const b = canonicalCagesSig([{ cells: [0, 1], operation: '*', value: 6 }]);
    expect(a).not.toBe(b);
  });

  it('distinguishes different cell groupings', () => {
    const a = canonicalCagesSig([{ cells: [0, 1], operation: '+', value: 5 }]);
    const b = canonicalCagesSig([{ cells: [0, 4], operation: '+', value: 5 }]);
    expect(a).not.toBe(b);
  });
});

describe('scoreBandStart', () => {
  it('floors to a ten-point band', () => {
    expect(scoreBandStart(0)).toBe(0);
    expect(scoreBandStart(7.3)).toBe(0);
    expect(scoreBandStart(10)).toBe(10);
    expect(scoreBandStart(49.9)).toBe(40);
  });

  it('keeps a perfect score inside the last band rather than making a new one', () => {
    expect(scoreBandStart(100)).toBe(90);
  });

  it('clamps a negative score', () => {
    expect(scoreBandStart(-5)).toBe(0);
  });
});

describe('groupByDifficulty', () => {
  it('orders groups from easiest to hardest, whatever order they arrive in', () => {
    const groups = groupByDifficulty([
      entry({ index: 1, difficulty: 'expert' }),
      entry({ index: 2, difficulty: 'easiest' }),
      entry({ index: 3, difficulty: 'medium' }),
    ]);
    expect(groups.map(g => g.difficulty)).toEqual(['easiest', 'medium', 'expert']);
  });

  it('omits difficulties with no puzzles', () => {
    const groups = groupByDifficulty([
      entry({ index: 1, difficulty: 'easy' }),
      entry({ index: 2, difficulty: 'hard' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('sorts entries within a group by score', () => {
    const [group] = groupByDifficulty([
      entry({ index: 1, difficulty: 'medium', score: 48 }),
      entry({ index: 2, difficulty: 'medium', score: 41 }),
      entry({ index: 3, difficulty: 'medium', score: 45 }),
    ]);
    expect(group.entries.map(e => e.index)).toEqual([2, 3, 1]);
  });

  it('groups by the named band, not by the number', () => {
    // The score is one cross-size scale, so a 4x4 expert scores below a 7x7
    // easiest. Grouping on the number would file them the wrong way round.
    const groups = groupByDifficulty([
      entry({ index: 1, size: 4, difficulty: 'expert', score: 18 }),
      entry({ index: 2, size: 7, difficulty: 'easiest', score: 62 }),
    ]);
    expect(groups.map(g => g.difficulty)).toEqual(['easiest', 'expert']);
    expect(groups[0].entries[0].index).toBe(2);
  });

  it('keeps every entry it was given', () => {
    const entries = (['easiest', 'easy', 'easy', 'hard', 'expert'] as const).map((difficulty, i) =>
      entry({ index: i, difficulty })
    );
    const groups = groupByDifficulty(entries);
    expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(entries.length);
  });
});

describe('difficultyInRange', () => {
  it('includes both ends of the range', () => {
    expect(difficultyInRange('easy', [1, 3])).toBe(true);
    expect(difficultyInRange('hard', [1, 3])).toBe(true);
    expect(difficultyInRange('medium', [1, 3])).toBe(true);
  });

  it('excludes what falls outside it', () => {
    expect(difficultyInRange('easiest', [1, 3])).toBe(false);
    expect(difficultyInRange('expert', [1, 3])).toBe(false);
  });

  it('admits exactly one difficulty when both handles meet', () => {
    const only = DIFFICULTY_ORDER.filter(d => difficultyInRange(d, [2, 2]));
    expect(only).toEqual(['medium']);
  });

  it('admits everything at the full range, so the gallery opens unfiltered', () => {
    expect(DIFFICULTY_ORDER.every(d => difficultyInRange(d, FULL_DIFFICULTY_RANGE))).toBe(true);
  });
});

describe('describeDifficultyRange', () => {
  it('names a single difficulty on its own', () => {
    expect(describeDifficultyRange([3, 3])).toBe('hard');
  });

  it('names both ends of a wider range', () => {
    expect(describeDifficultyRange([1, 3])).toBe('easy – hard');
    expect(describeDifficultyRange(FULL_DIFFICULTY_RANGE)).toBe('easiest – expert');
  });
});

describe('pickRandomEntry', () => {
  const pool = [1, 2, 3, 4, 5].map(index => entry({ index }));

  it('returns null for an empty set, so an empty filter cannot start a game', () => {
    expect(pickRandomEntry([])).toBeNull();
  });

  it('only ever returns a puzzle from the set it was given', () => {
    const indexes = new Set(Array.from({ length: 200 }, () => pickRandomEntry(pool)!.index));
    expect([...indexes].every(i => i >= 1 && i <= 5)).toBe(true);
  });

  it('can reach every puzzle in the set', () => {
    const seen = new Set(Array.from({ length: 500 }, () => pickRandomEntry(pool)!.index));
    expect(seen.size).toBe(pool.length);
  });

  it('never hands back the puzzle already being played', () => {
    const seen = new Set(Array.from({ length: 300 }, () => pickRandomEntry(pool, 3)!.index));
    expect(seen.has(3)).toBe(false);
    expect(seen.size).toBe(pool.length - 1);
  });

  // Refusing would leave the button dead on a filter with exactly one match
  it('returns the only match even when it is the current puzzle', () => {
    const single = [entry({ index: 7 })];
    expect(pickRandomEntry(single, 7)?.index).toBe(7);
  });

  it('ignores a current puzzle that is outside the filtered set', () => {
    const seen = new Set(Array.from({ length: 300 }, () => pickRandomEntry(pool, 99)!.index));
    expect(seen.size).toBe(pool.length);
  });
});
