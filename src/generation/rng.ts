/**
 * A small seeded PRNG so every generated puzzle can be reproduced from the
 * seed recorded with it, independent of which worker ran it or when.
 *
 * SplitMix32: adequate statistical quality for shuffling and weighted picks,
 * and it fits in a few lines that behave identically on every JS engine.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** In-place Fisher-Yates. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Index drawn in proportion to `weights`; -1 if they sum to nothing. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Two distinct indexes in [0, n), n >= 2. */
  pair(n: number): [number, number] {
    const a = this.int(n);
    let b = this.int(n - 1);
    if (b >= a) b += 1;
    return [a, b];
  }
}

/**
 * Mix several integers into one 32-bit seed. Used to derive a task's seed
 * from the run seed and the task's stable identity, so completion order
 * cannot change which puzzle a task produces.
 */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    let p = part >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= p & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      p >>>= 8;
    }
  }
  return h >>> 0;
}
