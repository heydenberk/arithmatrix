/**
 * A wall-clock cutoff checked from inside the expensive loops. Mirrors
 * backend/solver.py's Deadline.
 *
 * A single countSolutions on a loose 7x7 can run for seconds, so a deadline
 * checked only between attempts leaves a batch runner unable to stop on time.
 * The loops call check() often; the clock is read once every `every` calls.
 */

export class DeadlineExceeded extends Error {
  constructor() {
    super('deadline exceeded');
    this.name = 'DeadlineExceeded';
  }
}

export class Deadline {
  private ticks = 0;

  constructor(
    /** Epoch milliseconds, so it can be handed to a worker unchanged. */
    readonly at: number,
    private readonly every = 512
  ) {}

  static after(ms: number): Deadline {
    return new Deadline(Date.now() + ms);
  }

  expired(): boolean {
    return Date.now() >= this.at;
  }

  /** Cheap: reads the clock once per `every` calls. */
  check(): void {
    if (++this.ticks < this.every) return;
    this.ticks = 0;
    if (Date.now() >= this.at) throw new DeadlineExceeded();
  }

  checkNow(): void {
    if (Date.now() >= this.at) throw new DeadlineExceeded();
  }
}
