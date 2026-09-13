/**
 * Drive a BucketPlan to completion against a pool of task runners.
 *
 * Time is bounded in two layers. Every task carries the deadline, and the
 * engine's loops check it, so a running attempt abandons itself shortly after
 * the cutoff. Whatever has not come back `graceMs` later is terminated. Total
 * wall time is therefore at most maxTimeMs + graceMs, whatever the runners do.
 *
 * IO-free: checkpoints and progress are callbacks, and the runner is injected,
 * so this runs in a test with an in-process runner as readily as under
 * worker_threads.
 */

import { OPERATIONS_TIERS } from './operations';
import { DIFFICULTY_ORDER } from '../utils/difficulty';
import { BucketPlan, bucketId, type BucketKey, type TaskResult } from './bucketPlan';
import type { PuzzleRecord } from './generate';
import { mixSeed } from './rng';

export type Task = {
  key: BucketKey;
  attempt: number;
  seed: number;
  maxCandidates: number;
  maxCarveAttempts: number;
  deadlineAt: number | null;
};

export type Runner = {
  /** Concurrent tasks the runner will take. */
  readonly capacity: number;
  run(task: Task): Promise<TaskResult>;
  /** Stop everything still running; resolves when it has. */
  terminate(): Promise<void>;
};

export type BatchOptions = {
  keys: BucketKey[];
  countPerBucket: number;
  runner: Runner;
  runSeed: number;
  maxCandidates?: number;
  maxCarveAttempts?: number;
  maxTimeMs?: number | null;
  graceMs?: number;
  resume?: PuzzleRecord[];
  /** Called after every `checkpointEvery` acceptances with everything so far. */
  onCheckpoint?: (records: PuzzleRecord[]) => void;
  checkpointEvery?: number;
  onProgress?: (message: string) => void;
  now?: () => number;
};

export type BatchOutcome = {
  plan: BucketPlan;
  timedOut: boolean;
  terminated: number;
  elapsedMs: number;
};

/** A task's seed from its stable identity, never from when or where it ran. */
export function taskSeed(runSeed: number, key: BucketKey, attempt: number): number {
  return mixSeed(
    runSeed,
    key.size,
    DIFFICULTY_ORDER.indexOf(key.difficulty),
    Object.keys(OPERATIONS_TIERS).indexOf(key.tier),
    attempt
  );
}

export async function runBatch(options: BatchOptions): Promise<BatchOutcome> {
  const now = options.now ?? (() => Date.now());
  const start = now();
  const deadlineAt = options.maxTimeMs != null ? start + options.maxTimeMs : null;
  const graceMs = options.graceMs ?? 5000;
  const plan = new BucketPlan(options.keys, options.countPerBucket, options.resume ?? []);
  const log = options.onProgress ?? (() => {});
  const checkpointEvery = options.checkpointEvery ?? 25;

  type Settled = { key: BucketKey; result: TaskResult };
  const inFlight = new Set<Promise<void>>();
  // Settled results queue here rather than being read off a Promise.race:
  // two tasks that finish in the same tick would otherwise leave one result
  // unread, its bucket's pending count never decremented, and the bucket
  // permanently one short
  const settled: Settled[] = [];
  let wake: (() => void) | null = null;
  let accepted = 0;
  let sinceCheckpoint = 0;
  let timedOut = false;

  const submit = () => {
    for (const key of plan.nextSubmissions(options.runner.capacity - inFlight.size)) {
      const attempt = plan.submitted(key);
      const task: Task = {
        key,
        attempt,
        seed: taskSeed(options.runSeed, key, attempt),
        maxCandidates: options.maxCandidates ?? 50,
        maxCarveAttempts: options.maxCarveAttempts ?? 100,
        deadlineAt,
      };
      const promise: Promise<void> = options.runner
        .run(task)
        .then(
          result => ({ key, result }),
          (error: unknown) => ({
            key,
            result: { status: 'error' as const, detail: `runner rejected: ${String(error)}` },
          })
        )
        .then(outcome => {
          settled.push(outcome);
          inFlight.delete(promise);
          wake?.();
        });
      inFlight.add(promise);
    }
  };

  const fold = ({ key, result }: Settled) => {
    const target = plan.record(key, result);
    if (target === null) return;
    accepted += 1;
    sinceCheckpoint += 1;
    const total = options.keys.length * options.countPerBucket;
    if (accepted % 10 === 0 || plan.acceptedCount() === total) {
      const full = options.keys.filter(
        k => plan.accepted.get(bucketId(k))!.length >= options.countPerBucket
      ).length;
      const rate = accepted / Math.max(1e-9, (now() - start) / 1000);
      log(
        `Progress: ${plan.acceptedCount()}/${total} puzzles (${full}/${options.keys.length} buckets full) [${rate.toFixed(2)}/s]`
      );
    }
    if (options.onCheckpoint && sinceCheckpoint >= checkpointEvery) {
      sinceCheckpoint = 0;
      options.onCheckpoint(plan.records());
    }
  };

  /** Wait, bounded, until at least one task has settled, then fold in every
   *  settled result. False when the wait timed out with nothing to fold. */
  const drain = async (timeoutMs: number): Promise<boolean> => {
    if (settled.length === 0 && inFlight.size > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>(resolve => {
        wake = resolve;
        timer = setTimeout(resolve, Math.max(0, timeoutMs));
      });
      wake = null;
      clearTimeout(timer);
    }
    if (settled.length === 0) return false;
    while (settled.length > 0) fold(settled.shift()!);
    return true;
  };

  submit();
  while (inFlight.size > 0) {
    let wait = 1000;
    if (deadlineAt !== null) {
      const remaining = deadlineAt - now();
      if (remaining <= 0) {
        timedOut = true;
        log(`Time limit reached; no further submissions`);
        break;
      }
      wait = Math.min(1000, remaining);
    }
    if (!(await drain(wait))) continue;
    if (plan.complete()) break;
    submit();
  }

  let terminated = 0;
  if (inFlight.size > 0) {
    // Cooperative phase: the tasks see the same deadline and stop themselves
    const graceUntil = now() + graceMs;
    while (inFlight.size > 0 && now() < graceUntil) {
      await drain(Math.min(250, graceUntil - now()));
    }
    if (inFlight.size > 0) {
      terminated = inFlight.size;
      log(`${terminated} task(s) still running after ${graceMs}ms grace; terminating`);
      await options.runner.terminate();
      inFlight.clear();
    }
  }
  await options.runner.terminate();

  return { plan, timedOut, terminated, elapsedMs: now() - start };
}

/** Runs tasks on the calling thread, for tests and single-worker use. */
export function inProcessRunner(
  fn: (task: Task) => TaskResult | Promise<TaskResult>,
  capacity = 1
): Runner {
  return {
    capacity,
    run: async task => fn(task),
    terminate: async () => {},
  };
}
