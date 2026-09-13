/**
 * Tests for the solve-time analysis.
 *
 * The point of the feature is that the numbers mean something, so what is
 * worth protecting is what gets left out and how sizes are kept apart.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getStoredStats, migrateScores, solveTimeStats } from './puzzleStats';
import { SCORING_VERSION } from './difficulty';
import { canonicalCagesSig } from './cageSignature';

const KEY = 'arithmatrix_puzzle_stats';

type Entry = {
  size: number;
  difficultyOperations?: number;
  completionTimeSeconds: number;
  conduct?: { unaided: boolean; clean: boolean };
  scoringVersion?: number;
  puzzleIndex?: number;
  cages?: { cells: number[]; operation: string; value: number }[];
};

const store = (entries: Entry[]) =>
  localStorage.setItem(
    KEY,
    JSON.stringify(
      entries.map(({ cages, ...e }, i) => ({
        id: `p${i}`,
        completedAt: new Date().toISOString(),
        difficultyLevel: 'medium',
        puzzle: { size: e.size, cages: cages ?? [] },
        // Current model unless a test says otherwise
        scoringVersion: SCORING_VERSION,
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
      versionExcluded: 0,
    });
  });

  it('leaves out scores from another scoring model and says how many', () => {
    store([
      { size: 4, difficultyOperations: 25, completionTimeSeconds: 60, conduct: UNAIDED },
      {
        size: 4,
        difficultyOperations: 25,
        completionTimeSeconds: 5,
        conduct: UNAIDED,
        scoringVersion: 1,
      },
      {
        size: 4,
        difficultyOperations: 25,
        completionTimeSeconds: 5,
        conduct: UNAIDED,
        scoringVersion: undefined,
      },
    ]);
    const stats = solveTimeStats();
    expect(stats.included).toBe(1);
    expect(stats.versionExcluded).toBe(2);
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

describe('migrateScores', () => {
  const cagesA = [{ cells: [0, 1, 2, 3], operation: '+', value: 10 }];
  const cagesB = [{ cells: [0, 1, 2, 3], operation: '*', value: 24 }];
  const sources = [
    { index: 0, size: 2, cagesSig: canonicalCagesSig(cagesA), score: 42 },
    { index: 1, size: 2, cagesSig: canonicalCagesSig(cagesB), score: 77 },
  ];

  it('re-keys by cage signature and stamps the version', () => {
    store([
      {
        size: 2,
        difficultyOperations: 10,
        completionTimeSeconds: 1,
        cages: cagesA,
        scoringVersion: undefined,
      },
    ]);
    expect(migrateScores(sources)).toBe(1);
    const [entry] = getStoredStats();
    expect(entry.difficultyOperations).toBe(42);
    expect(entry.scoringVersion).toBe(SCORING_VERSION);
    expect(entry.puzzleIndex).toBe(0);
  });

  it('does not trust an index that names a different puzzle', () => {
    // A save from an older corpus: index 1 there was puzzle A, here it is B
    store([
      {
        size: 2,
        difficultyOperations: 10,
        completionTimeSeconds: 1,
        cages: cagesA,
        puzzleIndex: 1,
        scoringVersion: undefined,
      },
    ]);
    migrateScores(sources);
    const [entry] = getStoredStats();
    expect(entry.difficultyOperations).toBe(42);
    expect(entry.puzzleIndex).toBe(0);
  });

  it('leaves an entry it cannot match alone, still excluded from the chart', () => {
    store([
      {
        size: 2,
        difficultyOperations: 10,
        completionTimeSeconds: 1,
        conduct: UNAIDED,
        cages: [{ cells: [0, 1, 2, 3], operation: '+', value: 99 }],
        scoringVersion: undefined,
      },
    ]);
    expect(migrateScores(sources)).toBe(0);
    expect(getStoredStats()[0].difficultyOperations).toBe(10);
    expect(solveTimeStats().versionExcluded).toBe(1);
  });

  it('is a no-op for entries already on the current model', () => {
    store([{ size: 2, difficultyOperations: 10, completionTimeSeconds: 1, cages: cagesA }]);
    expect(migrateScores(sources)).toBe(0);
    expect(getStoredStats()[0].difficultyOperations).toBe(10);
  });
});
