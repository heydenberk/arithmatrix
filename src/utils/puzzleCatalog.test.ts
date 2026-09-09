/**
 * Tests for the puzzle catalog.
 *
 * The cage signature is the important part: it identifies a puzzle without its
 * database index, and both saved games and completion history are keyed on it.
 * If it stopped being stable, players would lose progress.
 */

import { describe, expect, it } from 'vitest';
import {
  canonicalCagesSig,
  groupByScoreBand,
  pickRandomEntry,
  scoreBandStart,
  tierForScore,
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

describe('tierForScore', () => {
  it('matches the bands the gallery groups by', () => {
    expect(tierForScore(0)).toBe('easiest');
    expect(tierForScore(19.9)).toBe('easiest');
    expect(tierForScore(20)).toBe('easy');
    expect(tierForScore(40)).toBe('medium');
    expect(tierForScore(60)).toBe('hard');
    expect(tierForScore(80)).toBe('expert');
    expect(tierForScore(100)).toBe('expert');
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

describe('groupByScoreBand', () => {
  it('orders bands from easiest to hardest', () => {
    const bands = groupByScoreBand([
      entry({ index: 1, score: 85 }),
      entry({ index: 2, score: 15 }),
      entry({ index: 3, score: 45 }),
    ]);
    expect(bands.map(b => b.start)).toEqual([10, 40, 80]);
  });

  it('omits bands with no puzzles', () => {
    const bands = groupByScoreBand([
      entry({ index: 1, score: 15 }),
      entry({ index: 2, score: 95 }),
    ]);
    expect(bands).toHaveLength(2);
  });

  it('labels a band with its range and tier', () => {
    const [band] = groupByScoreBand([entry({ score: 45 })]);
    expect(band.label).toBe('40–50');
    expect(band.tier).toBe('medium');
  });

  it('sorts entries within a band by score', () => {
    const [band] = groupByScoreBand([
      entry({ index: 1, score: 48 }),
      entry({ index: 2, score: 41 }),
      entry({ index: 3, score: 45 }),
    ]);
    expect(band.entries.map(e => e.index)).toEqual([2, 3, 1]);
  });

  it('keeps every entry it was given', () => {
    const entries = [10, 25, 25, 60, 99].map((score, i) => entry({ index: i, score }));
    const bands = groupByScoreBand(entries);
    expect(bands.reduce((n, b) => n + b.entries.length, 0)).toBe(entries.length);
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
