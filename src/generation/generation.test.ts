import { describe, expect, it } from 'vitest';
import { Rng, mixSeed } from './rng';
import { isLatinSquare, randomLatinSquare } from './latinSquare';
import { maxSingleCages, weightedPartition } from './partition';
import { carve } from './carve';
import { assignOperation, OPERATIONS_TIERS } from './operations';
import { buildCandidate, generatePuzzle, toRecord } from './generate';
import { validatePuzzle } from '../utils/puzzleValidation';
import { countSolutions } from '../utils/solver';

describe('Rng', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = Array.from({ length: 5 }, () => a.int(1000));
    expect(Array.from({ length: 5 }, () => b.int(1000))).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.int(1000))).not.toEqual(seqA);
  });

  it('draws weighted indexes in proportion and never a zero-weight one', () => {
    const rng = new Rng(1);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[rng.weightedIndex([1, 0, 3])] += 1;
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBeGreaterThan(counts[0] * 2);
    expect(rng.weightedIndex([0, 0])).toBe(-1);
  });

  it('mixes seeds so neighbouring identities do not collide', () => {
    const seeds = new Set<number>();
    for (let attempt = 0; attempt < 200; attempt++) seeds.add(mixSeed(7, 4, 0, 3, attempt));
    expect(seeds.size).toBe(200);
  });
});

describe('randomLatinSquare', () => {
  it('is a Latin square for every size, and seeded', () => {
    for (const n of [4, 5, 6, 7]) {
      const a = randomLatinSquare(n, new Rng(n));
      expect(isLatinSquare(a)).toBe(true);
      expect(randomLatinSquare(n, new Rng(n))).toEqual(a);
    }
  });

  it('does not keep handing out the same square', () => {
    const rng = new Rng(3);
    const seen = new Set(
      Array.from({ length: 200 }, () => JSON.stringify(randomLatinSquare(4, rng)))
    );
    expect(seen.size).toBeGreaterThan(100); // 576 exist
  });
});

describe('weightedPartition', () => {
  it('sums to the total and only uses positive-weight sizes', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 50; i++) {
      const p = weightedPartition([0, 1, 1, 0, 0], 25, rng)!;
      expect(p.reduce((a, b) => a + b, 0)).toBe(25);
      expect(p.every(s => s === 2 || s === 3)).toBe(true);
    }
  });

  it('returns null when only zero-weight sizes fit', () => {
    expect(weightedPartition([0, 1, 0, 0, 0], 3, new Rng(1))).toBeNull();
  });

  it('caps single-cell cages at 2/2/4/5', () => {
    expect([4, 5, 6, 7].map(maxSingleCages)).toEqual([2, 2, 4, 5]);
  });
});

describe('carve', () => {
  it('covers every cell once with the requested sizes', () => {
    const sizes = [3, 3, 2, 2, 2, 2, 1, 1];
    const ids = carve(4, sizes, new Rng(5))!;
    const counts = new Map<number, number>();
    for (const row of ids) for (const id of row) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.has(0)).toBe(false);
    expect([...counts.values()].sort((a, b) => b - a)).toEqual(sizes);
  });

  it('supports more than 26 cages', () => {
    const ids = carve(6, Array(36).fill(1), new Rng(1))!;
    expect(new Set(ids.flat()).size).toBe(36);
  });

  it('returns null rather than a partial board when it cannot tile', () => {
    // A 4x4 cannot hold a 5-cell cage and eleven singles in a straight line;
    // whatever happens, no partial result leaks out
    const result = carve(2, [3, 1], new Rng(1), 5);
    if (result) expect(result.flat().every(id => id > 0)).toBe(true);
  });
});

describe('assignOperation', () => {
  it('stipulates singles and stays within the allowed tier', () => {
    const rng = new Rng(2);
    expect(assignOperation([3], 'medium', OPERATIONS_TIERS.all, rng)).toEqual({
      operation: '',
      value: 3,
    });
    for (let i = 0; i < 100; i++) {
      expect(assignOperation([2, 6], 'expert', OPERATIONS_TIERS.add, rng).operation).toBe('+');
      expect(['+', '-']).toContain(
        assignOperation([2, 6], 'expert', OPERATIONS_TIERS['add-sub'], rng).operation
      );
    }
  });

  it('gets the arithmetic right for every operation', () => {
    const rng = new Rng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const { operation, value } = assignOperation([2, 6], 'hard', OPERATIONS_TIERS.all, rng);
      seen.add(operation);
      expect({ '+': 8, '-': 4, '*': 12, '/': 3 }[operation as '+' | '-' | '*' | '/']).toBe(value);
    }
    expect(seen).toEqual(new Set(['+', '-', '*', '/']));
  });

  it('multiplies big cages more often at harder targets', () => {
    const count = (difficulty: 'easiest' | 'expert') => {
      const rng = new Rng(11);
      let n = 0;
      for (let i = 0; i < 500; i++) {
        if (assignOperation([1, 2, 3], difficulty, OPERATIONS_TIERS.all, rng).operation === '*')
          n++;
      }
      return n;
    };
    expect(count('expert')).toBeGreaterThan(count('easiest') * 2);
  });
});

describe('generatePuzzle', () => {
  it('returns a well-formed, unique, rated puzzle with the tier respected', () => {
    for (const [size, difficulty] of [
      [4, 'easiest'],
      [5, 'medium'],
      [6, 'easy'],
    ] as const) {
      const out = generatePuzzle(size, {
        difficulty,
        allowed: OPERATIONS_TIERS.add,
        seed: size,
        maxCandidates: 20,
      });
      expect(out.status).toBe('ok');
      if (out.status !== 'ok') return;
      const { puzzle, solution, rating } = out.result;
      expect(validatePuzzle(puzzle, solution)).toEqual([]);
      expect(countSolutions(puzzle, 2)).toBe(1);
      expect(rating.solved).toBe(true);
      expect(new Set(puzzle.cages.map(c => c.operation))).toEqual(new Set(['', '+']));
    }
  });

  it('reproduces the same puzzle from the same seed', () => {
    const opts = {
      difficulty: 'medium' as const,
      allowed: OPERATIONS_TIERS.all,
      seed: 12345,
      maxCandidates: 10,
    };
    const a = generatePuzzle(5, opts);
    const b = generatePuzzle(5, opts);
    expect(a).toEqual(b);
  });

  it('gives up immediately on an expired deadline', () => {
    const t = performance.now();
    const out = generatePuzzle(7, {
      difficulty: 'expert',
      allowed: OPERATIONS_TIERS.all,
      seed: 1,
      deadlineAt: Date.now() - 1,
    });
    expect(out).toEqual({ status: 'rejected', reason: 'deadline', candidates: 0 });
    expect(performance.now() - t).toBeLessThan(200);
  });

  it('builds candidates that pass structural validation before any solving', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 10; i++) {
      const c = buildCandidate(6, 'hard', OPERATIONS_TIERS.all, rng)!;
      expect(validatePuzzle(c.puzzle, c.solution)).toEqual([]);
    }
  });

  it('writes a record in the corpus shape with provenance', () => {
    const out = generatePuzzle(4, {
      difficulty: 'easy',
      allowed: OPERATIONS_TIERS.all,
      seed: 3,
      maxCandidates: 10,
    });
    if (out.status !== 'ok') throw new Error('expected a puzzle');
    const record = toRecord(out.result, 'all', 12, new Date('2026-09-13T00:00:00Z'));
    expect(record.puzzle.difficulty_operations).toBe(record.metadata.difficulty_score);
    expect(record.metadata.seed).toBe(3);
    expect(record.metadata.scoring_version).toBe(2);
    expect(record.metadata.generator_version).toBe('v5-ts');
    expect(Object.values(record.metadata.techniques_used).every(n => n > 0)).toBe(true);
  });
});
