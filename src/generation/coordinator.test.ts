import { describe, expect, it } from 'vitest';
import { inProcessRunner, runBatch, taskSeed, type Runner, type Task } from './coordinator';
import type { BucketKey, TaskResult } from './bucketPlan';
import { generatePuzzle, toRecord } from './generate';
import { OPERATIONS_TIERS } from './operations';

const KEYS: BucketKey[] = [
  { size: 4, difficulty: 'easiest', tier: 'all' },
  { size: 4, difficulty: 'easy', tier: 'all' },
];

const realTask = (task: Task): TaskResult => {
  const out = generatePuzzle(task.key.size, {
    difficulty: task.key.difficulty,
    allowed: OPERATIONS_TIERS[task.key.tier],
    seed: task.seed,
    maxCandidates: task.maxCandidates,
    deadlineAt: task.deadlineAt,
  });
  return out.status === 'ok'
    ? { status: 'ok', record: toRecord(out.result, task.key.tier, 1), exact: out.exact }
    : { status: 'rejected', reason: out.reason };
};

describe('taskSeed', () => {
  it('depends on the task identity, not on anything else', () => {
    expect(taskSeed(1, KEYS[0], 0)).toBe(taskSeed(1, KEYS[0], 0));
    expect(taskSeed(1, KEYS[0], 0)).not.toBe(taskSeed(1, KEYS[0], 1));
    expect(taskSeed(1, KEYS[0], 0)).not.toBe(taskSeed(1, KEYS[1], 0));
    expect(taskSeed(1, KEYS[0], 0)).not.toBe(taskSeed(2, KEYS[0], 0));
  });
});

describe('runBatch', () => {
  it('fills every bucket with real puzzles and checkpoints along the way', async () => {
    const checkpoints: number[] = [];
    const outcome = await runBatch({
      keys: KEYS,
      countPerBucket: 2,
      runner: inProcessRunner(realTask, 2),
      runSeed: 99,
      maxCandidates: 10,
      onCheckpoint: records => checkpoints.push(records.length),
      checkpointEvery: 1,
    });
    expect(outcome.plan.shortfall().size).toBe(0);
    expect(outcome.plan.records()).toHaveLength(4);
    expect(outcome.timedOut).toBe(false);
    expect(checkpoints.length).toBeGreaterThanOrEqual(4);
  });

  it('returns within maxTime + grace when tasks never finish, and terminates them', async () => {
    let terminated = false;
    const runner: Runner = {
      capacity: 2,
      run: () => new Promise(() => {}),
      terminate: async () => {
        terminated = true;
      },
    };
    const t = performance.now();
    const outcome = await runBatch({
      keys: KEYS,
      countPerBucket: 1,
      runner,
      runSeed: 1,
      maxTimeMs: 300,
      graceMs: 300,
    });
    expect(performance.now() - t).toBeLessThan(2500);
    expect(outcome.timedOut).toBe(true);
    expect(outcome.terminated).toBe(2);
    expect(terminated).toBe(true);
    expect(outcome.plan.shortfall().size).toBe(2);
  });

  it('produces the same puzzles whatever order the runner finishes in', async () => {
    const run = async (delayFor: (task: Task) => number) => {
      const runner: Runner = {
        capacity: 4,
        run: task =>
          new Promise(resolve => setTimeout(() => resolve(realTask(task)), delayFor(task))),
        terminate: async () => {},
      };
      const outcome = await runBatch({
        keys: KEYS,
        countPerBucket: 2,
        runner,
        runSeed: 5,
        maxCandidates: 10,
      });
      return outcome.plan
        .records()
        .map(r => `${r.metadata.actual_difficulty}:${r.metadata.seed}`)
        .sort();
    };
    const forward = await run(t => t.attempt * 5);
    const reversed = await run(t => 20 - t.attempt * 5);
    expect(reversed).toEqual(forward);
  });

  it('turns a runner failure into an error result rather than a crash', async () => {
    const runner = inProcessRunner(() => {
      throw new Error('kaboom');
    }, 1);
    const outcome = await runBatch({
      keys: KEYS.slice(0, 1),
      countPerBucket: 1,
      runner,
      runSeed: 1,
      maxTimeMs: 500,
      graceMs: 100,
    });
    expect(outcome.plan.errors.length).toBeGreaterThan(0);
    expect(outcome.plan.errors[0].detail).toContain('kaboom');
  });
});
