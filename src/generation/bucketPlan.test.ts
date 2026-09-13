import { describe, expect, it } from 'vitest';
import { BucketPlan, bucketId, type BucketKey, type TaskResult } from './bucketPlan';
import type { PuzzleRecord } from './generate';

const KEYS: BucketKey[] = [
  { size: 4, difficulty: 'easiest', tier: 'all' },
  { size: 4, difficulty: 'easy', tier: 'all' },
  { size: 4, difficulty: 'hard', tier: 'all' },
];
const [EASIEST, EASY, HARD] = KEYS.map(bucketId);

let nonce = 0;
const record = (
  actual: PuzzleRecord['metadata']['actual_difficulty'] = 'easiest',
  unique = true
): PuzzleRecord => ({
  puzzle: {
    size: 4,
    cages: [{ cells: [0], operation: '', value: unique ? ++nonce : 1 }],
    solution: [],
    difficulty_operations: 10,
  },
  metadata: {
    size: 4,
    actual_difficulty: actual,
    difficulty_score: 10,
    raw_score: 5,
    scoring_version: 2,
    techniques_used: {},
    operations_tier: 'all',
    operation_count: 1,
    generation_time: 0,
    generated_at: '',
    generator_version: 'test',
    seed: 0,
    candidates: 1,
  },
});
const ok = (
  actual: PuzzleRecord['metadata']['actual_difficulty'] = 'easiest',
  unique = true
): TaskResult => ({
  status: 'ok',
  record: record(actual, unique),
  exact: true,
});

describe('BucketPlan', () => {
  it('nets pending work out of demand', () => {
    const plan = new BucketPlan(KEYS, 2);
    expect(plan.demand(EASIEST)).toBe(2);
    plan.submitted(KEYS[0]);
    plan.submitted(KEYS[0]);
    expect(plan.demand(EASIEST)).toBe(0);
    expect(plan.nextSubmissions(10).map(bucketId)).toEqual([EASY, HARD, EASY, HARD]);
  });

  it('round-robins and respects capacity', () => {
    const plan = new BucketPlan(KEYS, 3);
    expect(plan.nextSubmissions(4).map(bucketId)).toEqual([EASIEST, EASY, HARD, EASIEST]);
  });

  it('numbers attempts per bucket so seeds are stable', () => {
    const plan = new BucketPlan(KEYS, 3);
    expect(plan.submitted(KEYS[0])).toBe(0);
    expect(plan.submitted(KEYS[1])).toBe(0);
    expect(plan.submitted(KEYS[0])).toBe(1);
  });

  it('discards duplicates by cage signature', () => {
    const plan = new BucketPlan(KEYS, 5);
    plan.submitted(KEYS[0]);
    plan.submitted(KEYS[0]);
    expect(plan.record(KEYS[0], ok('easiest', false))).toBe(EASIEST);
    expect(plan.record(KEYS[0], ok('easiest', false))).toBeNull();
    expect(plan.duplicates).toBe(1);
  });

  it('routes a near miss to the neighbouring bucket only', () => {
    const plan = new BucketPlan(KEYS, 5);
    plan.submitted(KEYS[0]);
    expect(plan.record(KEYS[0], ok('easy'))).toBe(EASY);
    plan.submitted(KEYS[0]);
    expect(plan.record(KEYS[0], ok('hard'))).toBeNull();
    expect(plan.rejections.get(EASIEST)!.get('off-target:hard')).toBe(1);
  });

  it('keeps errors apart from rejections and decrements pending either way', () => {
    const plan = new BucketPlan(KEYS, 1);
    plan.submitted(KEYS[0]);
    plan.submitted(KEYS[0]);
    plan.record(KEYS[0], { status: 'error', detail: 'boom' });
    plan.record(KEYS[0], { status: 'rejected', reason: 'exhausted' });
    expect(plan.errors).toHaveLength(1);
    expect(plan.rejections.get(EASIEST)!.get('exhausted')).toBe(1);
    expect(plan.pending.get(EASIEST)).toBe(0);
  });

  it('resumes from checkpointed records, deduplicated and capped', () => {
    const a = record('easy');
    const plan = new BucketPlan(KEYS, 1, [a, a, record('easy'), record('hard')]);
    expect(plan.accepted.get(EASY)).toHaveLength(1);
    expect(plan.accepted.get(HARD)).toHaveLength(1);
    expect(plan.shortfall()).toEqual(new Map([[EASIEST, 1]]));
  });
});
