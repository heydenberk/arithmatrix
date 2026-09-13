/**
 * Generate one puzzle: Latin square -> cage partition -> carve -> operations,
 * then the acceptance test (assessPuzzle: structure, unique solution, rating).
 * Pure and seeded; the same seed gives the same puzzle on any machine.
 */

import type { Cage, PuzzleDefinition } from '../types/ArithmatrixTypes';
import { DIFFICULTY_ORDER, SCORING_VERSION, type DifficultyLevel } from '../utils/difficulty';
import { assessPuzzle, type ScoreResult } from '../utils/solver';
import { canonicalCagesSig } from '../utils/cageSignature';
import { Deadline, DeadlineExceeded } from '../utils/deadline';
import { carve } from './carve';
import { randomLatinSquare } from './latinSquare';
import { assignOperation, type Operation } from './operations';
import { CAGE_SIZE_WEIGHTS, maxSingleCages, weightedPartition } from './partition';
import { Rng } from './rng';

export const GENERATOR_VERSION = 'v5-ts';

export type GeneratedPuzzle = {
  puzzle: PuzzleDefinition;
  solution: number[][];
  rating: ScoreResult;
  seed: number;
  /** Candidates drawn before this one was accepted, this one included. */
  candidates: number;
};

export type GenerateOptions = {
  difficulty: DifficultyLevel;
  allowed: readonly Operation[];
  seed: number;
  /** Candidates to try before settling for the closest accepted one. */
  maxCandidates?: number;
  /** Carving attempts per candidate. */
  maxCarveAttempts?: number;
  /** Absolute epoch-ms cutoff; null for none. */
  deadlineAt?: number | null;
};

export type GenerateOutcome =
  | { status: 'ok'; result: GeneratedPuzzle; exact: boolean }
  | { status: 'rejected'; reason: 'exhausted' | 'deadline'; candidates: number };

/**
 * One candidate board, before any solving. Null when no partition could be
 * carved - an ordinary re-roll for the caller.
 */
export function buildCandidate(
  size: number,
  difficulty: DifficultyLevel,
  allowed: readonly Operation[],
  rng: Rng,
  maxCarveAttempts = 100
): { puzzle: PuzzleDefinition; solution: number[][] } | null {
  const solution = randomLatinSquare(size, rng);
  const weights = CAGE_SIZE_WEIGHTS[difficulty];
  const singlesCap = maxSingleCages(size);

  let ids: number[][] | null = null;
  let sizes: number[] | null = null;
  for (let roll = 0; roll < 20 && ids === null; roll++) {
    sizes = weightedPartition(weights, size * size, rng);
    if (!sizes) continue;
    if (sizes.filter(s => s === 1).length > singlesCap) continue;
    ids = carve(size, sizes, rng, maxCarveAttempts);
  }
  if (!ids || !sizes) return null;

  const cells = new Map<number, number[]>();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const id = ids[r][c];
      const list = cells.get(id) ?? [];
      list.push(r * size + c);
      cells.set(id, list);
    }
  }
  const cages: Cage[] = [...cells.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, cageCells]) => {
      const values = cageCells.map(i => solution[Math.floor(i / size)][i % size]);
      return { cells: cageCells, ...assignOperation(values, difficulty, allowed, rng) };
    });
  return { puzzle: { size, cages }, solution };
}

/**
 * Keep drawing candidates until one rates at the target difficulty, or the
 * budget runs out and the closest accepted one is returned instead. Nothing
 * comes back that has not passed assessPuzzle.
 */
export function generatePuzzle(size: number, options: GenerateOptions): GenerateOutcome {
  const { difficulty, allowed, seed } = options;
  const maxCandidates = options.maxCandidates ?? 50;
  const deadline = options.deadlineAt != null ? new Deadline(options.deadlineAt) : undefined;
  const rng = new Rng(seed);
  const targetIdx = DIFFICULTY_ORDER.indexOf(difficulty);

  let best: GeneratedPuzzle | null = null;
  let bestDistance = Infinity;
  let candidates = 0;

  for (let attempt = 0; attempt < maxCandidates; attempt++) {
    if (deadline?.expired())
      return best
        ? { status: 'ok', result: best, exact: false }
        : { status: 'rejected', reason: 'deadline', candidates };
    const candidate = buildCandidate(size, difficulty, allowed, rng, options.maxCarveAttempts);
    if (!candidate) continue;
    candidates += 1;

    let assessment;
    try {
      assessment = assessPuzzle(candidate.puzzle, candidate.solution, deadline);
    } catch (error) {
      if (error instanceof DeadlineExceeded) {
        return best
          ? { status: 'ok', result: best, exact: false }
          : { status: 'rejected', reason: 'deadline', candidates };
      }
      throw error;
    }
    if (!assessment.unique || !assessment.rating || !assessment.rating.solved) continue;

    const result: GeneratedPuzzle = {
      puzzle: candidate.puzzle,
      solution: candidate.solution,
      rating: assessment.rating,
      seed,
      candidates,
    };
    if (assessment.rating.level === difficulty) return { status: 'ok', result, exact: true };
    const distance = Math.abs(DIFFICULTY_ORDER.indexOf(assessment.rating.level) - targetIdx);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = result;
    }
  }
  return best
    ? { status: 'ok', result: best, exact: false }
    : { status: 'rejected', reason: 'exhausted', candidates };
}

/** The JSONL record the app loads, in the shape the corpus already uses. */
export type PuzzleRecord = {
  puzzle: { size: number; cages: Cage[]; solution: number[][]; difficulty_operations: number };
  metadata: {
    size: number;
    actual_difficulty: DifficultyLevel;
    difficulty_score: number;
    raw_score: number;
    scoring_version: number;
    techniques_used: Record<string, number>;
    operations_tier: string;
    operation_count: number;
    generation_time: number;
    generated_at: string;
    generator_version: string;
    seed: number;
    candidates: number;
  };
};

export function toRecord(
  result: GeneratedPuzzle,
  tier: string,
  elapsedMs: number,
  now = new Date()
): PuzzleRecord {
  const techniques: Record<string, number> = {};
  for (const [name, count] of Object.entries(result.rating.techniqueCounts)) {
    if (count > 0) techniques[name.toUpperCase()] = count;
  }
  return {
    puzzle: {
      size: result.puzzle.size,
      cages: result.puzzle.cages,
      solution: result.solution,
      difficulty_operations: result.rating.score,
    },
    metadata: {
      size: result.puzzle.size,
      actual_difficulty: result.rating.level,
      difficulty_score: result.rating.score,
      raw_score: result.rating.rawScore,
      scoring_version: SCORING_VERSION,
      techniques_used: techniques,
      operations_tier: tier,
      operation_count: result.puzzle.cages.length,
      generation_time: Math.round(elapsedMs) / 1000,
      generated_at: now.toISOString(),
      generator_version: GENERATOR_VERSION,
      seed: result.seed,
      candidates: result.candidates,
    },
  };
}

export const recordSignature = (record: PuzzleRecord): string =>
  `${record.puzzle.size}|${canonicalCagesSig(record.puzzle.cages)}`;
