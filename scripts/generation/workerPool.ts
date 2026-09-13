/**
 * A Runner over worker_threads. Each worker boots through worker-bootstrap.mjs,
 * which registers tsx and loads worker.ts; terminate() kills them, which is the coercive half of the time
 * bound (the cooperative half is the deadline inside each task).
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { Runner, Task } from '../../src/generation/coordinator';
import type { TaskResult } from '../../src/generation/bucketPlan';

export function workerPoolRunner(workers: number): Runner {
  const workerUrl = new URL('./worker-bootstrap.mjs', import.meta.url);
  const idle: Worker[] = [];
  const all: Worker[] = [];
  const waiting: ((w: Worker) => void)[] = [];
  let nextId = 0;
  let terminated = false;

  for (let i = 0; i < workers; i++) {
    const w = new Worker(fileURLToPath(workerUrl));
    all.push(w);
    idle.push(w);
  }

  const acquire = (): Promise<Worker> =>
    idle.length > 0 ? Promise.resolve(idle.pop()!) : new Promise(resolve => waiting.push(resolve));
  const release = (w: Worker) => {
    const next = waiting.shift();
    if (next) next(w);
    else idle.push(w);
  };

  return {
    capacity: workers,
    async run(task: Task): Promise<TaskResult> {
      if (terminated) return { status: 'error', detail: 'pool terminated' };
      const w = await acquire();
      const id = nextId++;
      return new Promise<TaskResult>(resolve => {
        const onMessage = (message: { id: number; result: TaskResult }) => {
          if (message.id !== id) return;
          cleanup();
          release(w);
          resolve(message.result);
        };
        const onError = (error: Error) => {
          cleanup();
          release(w);
          resolve({ status: 'error', detail: `worker error: ${error.stack ?? error.message}` });
        };
        const onExit = () => {
          cleanup();
          resolve({ status: 'error', detail: 'worker exited' });
        };
        const cleanup = () => {
          w.off('message', onMessage);
          w.off('error', onError);
          w.off('exit', onExit);
        };
        w.on('message', onMessage);
        w.on('error', onError);
        w.on('exit', onExit);
        w.postMessage({ id, task });
      });
    },
    async terminate() {
      terminated = true;
      await Promise.all(all.map(w => w.terminate()));
    },
  };
}
