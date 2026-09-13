/**
 * worker_threads entry: one task in, one TaskResult out. Errors travel back as
 * results rather than crashing the thread, so the coordinator can tell a
 * rejection from a bug.
 */
import { parentPort } from 'node:worker_threads';
import { generatePuzzle, toRecord } from '../../src/generation/generate';
import { OPERATIONS_TIERS } from '../../src/generation/operations';
import type { Task } from '../../src/generation/coordinator';
import type { TaskResult } from '../../src/generation/bucketPlan';

export function runTask(task: Task): TaskResult {
  const start = performance.now();
  try {
    const outcome = generatePuzzle(task.key.size, {
      difficulty: task.key.difficulty,
      allowed: OPERATIONS_TIERS[task.key.tier],
      seed: task.seed,
      maxCandidates: task.maxCandidates,
      maxCarveAttempts: task.maxCarveAttempts,
      deadlineAt: task.deadlineAt,
    });
    if (outcome.status === 'rejected') return { status: 'rejected', reason: outcome.reason };
    return {
      status: 'ok',
      record: toRecord(outcome.result, task.key.tier, performance.now() - start),
      exact: outcome.exact,
    };
  } catch (error) {
    return {
      status: 'error',
      detail: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
  }
}

parentPort?.on('message', (message: { id: number; task: Task }) => {
  const result = runTask(message.task);
  parentPort?.postMessage({ id: message.id, result });
});
