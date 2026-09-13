/**
 * Bookkeeping for a batch: what each bucket has accepted, what is in flight,
 * what was rejected and why. Pure state, so the scheduling rules are testable
 * without a worker pool. Mirrors backend/generate_batch.BucketPlan.
 */

import { DIFFICULTY_ORDER, type DifficultyLevel } from '../utils/difficulty';
import { recordSignature, type PuzzleRecord } from './generate';

export type BucketKey = { size: number; difficulty: DifficultyLevel; tier: string };
export const bucketId = (k: BucketKey): string => `${k.size}:${k.difficulty}:${k.tier}`;

export type TaskResult =
  | { status: 'ok'; record: PuzzleRecord; exact: boolean }
  | { status: 'rejected'; reason: string }
  | { status: 'error'; detail: string };

export class BucketPlan {
  readonly keys: BucketKey[];
  readonly accepted = new Map<string, PuzzleRecord[]>();
  readonly pending = new Map<string, number>();
  readonly rejections = new Map<string, Map<string, number>>();
  readonly errors: { bucket: string; detail: string }[] = [];
  /** Next attempt number per bucket; part of every task's seed. */
  readonly attempts = new Map<string, number>();
  private readonly signatures = new Set<string>();
  duplicates = 0;

  constructor(
    keys: BucketKey[],
    readonly countPerBucket: number,
    resume: PuzzleRecord[] = []
  ) {
    this.keys = keys;
    for (const key of keys) {
      const id = bucketId(key);
      this.accepted.set(id, []);
      this.pending.set(id, 0);
      this.rejections.set(id, new Map());
      this.attempts.set(id, 0);
    }
    // Records from a checkpoint count as accepted, in their own buckets
    for (const record of resume) {
      const id = bucketId({
        size: record.puzzle.size,
        difficulty: record.metadata.actual_difficulty,
        tier: record.metadata.operations_tier,
      });
      const list = this.accepted.get(id);
      if (!list || list.length >= countPerBucket) continue;
      const sig = recordSignature(record);
      if (this.signatures.has(sig)) continue;
      this.signatures.add(sig);
      list.push(record);
    }
  }

  /** Records still wanted for a bucket, net of work already in flight. */
  demand(id: string): number {
    return Math.max(0, this.countPerBucket - this.accepted.get(id)!.length - this.pending.get(id)!);
  }

  complete(): boolean {
    return this.keys.every(k => this.accepted.get(bucketId(k))!.length >= this.countPerBucket);
  }

  /** Round-robin across buckets with demand, up to `capacity` tasks. */
  nextSubmissions(capacity: number): BucketKey[] {
    const chosen: BucketKey[] = [];
    const extra = new Map<string, number>();
    while (chosen.length < capacity) {
      let progressed = false;
      for (const key of this.keys) {
        if (chosen.length >= capacity) break;
        const id = bucketId(key);
        if (this.demand(id) - (extra.get(id) ?? 0) > 0) {
          chosen.push(key);
          extra.set(id, (extra.get(id) ?? 0) + 1);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return chosen;
  }

  /** Marks a task submitted and returns its attempt number. */
  submitted(key: BucketKey): number {
    const id = bucketId(key);
    this.pending.set(id, this.pending.get(id)! + 1);
    const attempt = this.attempts.get(id)!;
    this.attempts.set(id, attempt + 1);
    return attempt;
  }

  /** Folds one result in; returns the bucket that accepted it, or null. */
  record(key: BucketKey, result: TaskResult): string | null {
    const id = bucketId(key);
    this.pending.set(id, Math.max(0, this.pending.get(id)! - 1));
    if (result.status === 'error') {
      this.errors.push({ bucket: id, detail: result.detail });
      return null;
    }
    if (result.status === 'rejected') {
      this.reject(id, result.reason);
      return null;
    }
    const { record } = result;
    const sig = recordSignature(record);
    if (this.signatures.has(sig)) {
      this.duplicates += 1;
      this.reject(id, 'duplicate');
      return null;
    }
    const actual = record.metadata.actual_difficulty;
    let target: string | null = null;
    if (actual === key.difficulty && this.accepted.get(id)!.length < this.countPerBucket) {
      target = id;
    } else {
      // A near miss is a good puzzle for the neighbouring bucket, and only
      // that one: routing anything anywhere is how buckets filled with
      // puzzles nobody asked for
      const alt = bucketId({ ...key, difficulty: actual });
      const distance = Math.abs(
        DIFFICULTY_ORDER.indexOf(actual) - DIFFICULTY_ORDER.indexOf(key.difficulty)
      );
      if (
        this.accepted.has(alt) &&
        distance <= 1 &&
        this.accepted.get(alt)!.length < this.countPerBucket
      ) {
        target = alt;
      }
    }
    if (target === null) {
      this.reject(id, `off-target:${actual}`);
      return null;
    }
    this.signatures.add(sig);
    this.accepted.get(target)!.push(record);
    return target;
  }

  private reject(id: string, reason: string) {
    const map = this.rejections.get(id)!;
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }

  records(): PuzzleRecord[] {
    return this.keys.flatMap(k => this.accepted.get(bucketId(k))!);
  }

  acceptedCount(): number {
    return this.records().length;
  }

  shortfall(): Map<string, number> {
    const out = new Map<string, number>();
    for (const key of this.keys) {
      const id = bucketId(key);
      const n = this.accepted.get(id)!.length;
      if (n < this.countPerBucket) out.set(id, this.countPerBucket - n);
    }
    return out;
  }
}
