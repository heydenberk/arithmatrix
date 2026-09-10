/**
 * Tests for the solve-time analysis.
 *
 * The point of the feature is that the numbers mean something, so what is
 * worth protecting is what gets left out and how sizes are kept apart.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { solveTimeStats } from './puzzleStats';

const KEY = 'arithmatrix_puzzle_stats';

type Entry = {
  size: number;
  difficultyOperations?: number;
  completionTimeSeconds: number;
  conduct?: { unaided: boolean; clean: boolean };
};

const store = (entries: Entry[]) =>
  localStorage.setItem(
    KEY,
    JSON.stringify(
      entries.map((e, i) => ({
        id: `p${i}`,
        completedAt: new Date().toISOString(),
        difficultyLevel: 'medium',
        puzzle: { size: e.size, cages: [] },
        ...e,
      }))
    )
  );

const UNAIDED = { unaided: true, clean: true };
const AIDED = { unaided: false, clean: true };

beforeEach(() => localStorage.clear());

describe('solveTimeStats', () => {
  it('reports nothing from an empty history', () => {
    expect(solveTimeStats()).toEqual({
      buckets: [],
      included: 0,
      aidedExcluded: 0,
      unknownExcluded: 0,
    });
  });

  it('leaves out aided solves and says how many', () => {
    store([
      { size: 4, difficultyOperations: 25, completionTimeSeconds: 60, conduct: UNAIDED },
      { size: 4, difficultyOperations: 25, completionTimeSeconds: 5, conduct: AIDED },
    ]);
    const stats = solveTimeStats();
    expect(stats.included).toBe(1);
    expect(stats.aidedExcluded).toBe(1);
    // The 5s aided solve would have halved the median
    expect(stats.buckets[0].medianSeconds).toBe(60);
  });

  it('counts solves from before conduct was recorded separately', () => {
    store([
      { size: 4, difficultyOperations: 25, completionTimeSeconds: 60 },
      { size: 4, difficultyOperations: 25, completionTimeSeconds: 40, conduct: UNAIDED },
    ]);
    const stats = solveTimeStats();
    expect(stats.unknownExcluded).toBe(1);
    expect(stats.included).toBe(1);
  });

  it('never pools sizes, since the score is normalised within one', () => {
    // A 4x4 at 95 and a 7x7 at 95 are both "hard for their size", not equal
    store([
      { size: 4, difficultyOperations: 95, completionTimeSeconds: 90, conduct: UNAIDED },
      { size: 7, difficultyOperations: 95, completionTimeSeconds: 1200, conduct: UNAIDED },
    ]);
    const stats = solveTimeStats();
    expect(stats.buckets).toHaveLength(2);
    expect(stats.buckets.map(b => b.size)).toEqual([4, 7]);
    expect(stats.buckets.map(b => b.medianSeconds)).toEqual([90, 1200]);
  });

  it('groups into the same difficulty bands the gallery uses', () => {
    store([
      { size: 5, difficultyOperations: 21, completionTimeSeconds: 100, conduct: UNAIDED },
      { size: 5, difficultyOperations: 29, completionTimeSeconds: 200, conduct: UNAIDED },
      { size: 5, difficultyOperations: 31, completionTimeSeconds: 400, conduct: UNAIDED },
    ]);
    const stats = solveTimeStats();
    expect(stats.buckets.map(b => b.bandStart)).toEqual([20, 30]);
    expect(stats.buckets[0]).toMatchObject({ count: 2, medianSeconds: 150, bestSeconds: 100 });
    expect(stats.buckets[1]).toMatchObject({ count: 1, medianSeconds: 400 });
  });

  it('takes the middle value of an odd run rather than averaging', () => {
    store(
      [10, 20, 400].map(t => ({
        size: 6,
        difficultyOperations: 45,
        completionTimeSeconds: t,
        conduct: UNAIDED,
      }))
    );
    // The median resists one slow solve in a way the mean would not
    expect(solveTimeStats().buckets[0].medianSeconds).toBe(20);
  });

  it('ignores an entry with no difficulty score rather than bucketing it at zero', () => {
    store([{ size: 4, completionTimeSeconds: 60, conduct: UNAIDED }]);
    const stats = solveTimeStats();
    expect(stats.buckets).toHaveLength(0);
    expect(stats.unknownExcluded).toBe(1);
  });
});
