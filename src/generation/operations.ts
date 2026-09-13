/**
 * Assign an operation and target to each cage, from the solution values.
 *
 * Drawn at random with difficulty-conditioned weights, among the operations
 * the tier allows and the values permit. The Python generator chose
 * deterministically - division if the quotient was tiny, else subtraction,
 * else a product under a cap, else addition - so the operation mix was a
 * function of the Latin square rather than a design choice, and a tier
 * filter could only remove operations, never shape them.
 */

import type { Cage } from '../types/ArithmatrixTypes';
import type { DifficultyLevel } from '../utils/difficulty';
import type { Rng } from './rng';

export type Operation = '+' | '-' | '*' | '/';

/** The public operation tiers; names are part of the corpus format. */
export const OPERATIONS_TIERS: Record<string, readonly Operation[]> = {
  add: ['+'],
  'add-sub': ['+', '-'],
  'no-div': ['+', '-', '*'],
  all: ['+', '-', '*', '/'],
};

/** Weights for a 2-cell cage: [+, -, *, /]. Easier targets lean on addition;
 *  harder ones spread out so a cage's operation tells the player less. */
const PAIR_WEIGHTS: Record<DifficultyLevel, [number, number, number, number]> = {
  easiest: [50, 30, 15, 5],
  easy: [40, 30, 20, 10],
  medium: [30, 30, 20, 20],
  hard: [25, 25, 25, 25],
  expert: [20, 20, 30, 30],
};

/** Probability (percent) that a 3+ cell cage multiplies rather than adds. */
const PRODUCT_CHANCE: Record<DifficultyLevel, number> = {
  easiest: 15,
  easy: 25,
  medium: 35,
  hard: 45,
  expert: 50,
};

/** Largest product an easy cage may ask for; big products are arithmetic
 *  drudgery, not reasoning, so the gentle tiers keep them small. */
const PRODUCT_CAP: Record<DifficultyLevel, number> = {
  easiest: 60,
  easy: 60,
  medium: 200,
  hard: Infinity,
  expert: Infinity,
};

export function assignOperation(
  values: readonly number[],
  difficulty: DifficultyLevel,
  allowed: readonly Operation[],
  rng: Rng
): Pick<Cage, 'operation' | 'value'> {
  if (values.length === 1) return { operation: '', value: values[0] };

  const sum = values.reduce((a, b) => a + b, 0);
  const product = values.reduce((a, b) => a * b, 1);

  if (values.length === 2) {
    const [a, b] = values;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    const options: { op: Operation; value: number }[] = [];
    const weights: number[] = [];
    const [wAdd, wSub, wMul, wDiv] = PAIR_WEIGHTS[difficulty];
    if (allowed.includes('+')) {
      options.push({ op: '+', value: sum });
      weights.push(wAdd);
    }
    // Two cells of one cage share a row or column, so they differ
    if (allowed.includes('-') && hi !== lo) {
      options.push({ op: '-', value: hi - lo });
      weights.push(wSub);
    }
    if (allowed.includes('*')) {
      options.push({ op: '*', value: product });
      weights.push(wMul);
    }
    if (allowed.includes('/') && lo !== 0 && hi % lo === 0) {
      options.push({ op: '/', value: hi / lo });
      weights.push(wDiv);
    }
    if (options.length === 0) return { operation: '+', value: sum };
    const chosen = options[rng.weightedIndex(weights)];
    return { operation: chosen.op, value: chosen.value };
  }

  const canMultiply = allowed.includes('*') && product <= PRODUCT_CAP[difficulty];
  if (canMultiply && (!allowed.includes('+') || rng.int(100) < PRODUCT_CHANCE[difficulty])) {
    return { operation: '*', value: product };
  }
  return { operation: '+', value: sum };
}
