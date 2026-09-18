/**
 * Puzzle Catalog
 *
 * Single source of truth for the puzzle database (`all_puzzles.jsonl`).
 *
 * The file is ~7MB, so it is fetched and parsed exactly once per session and
 * memoized on the module. Every consumer — the main puzzle loader, the index
 * lookup that runs after restoring saved state, the dev panel and the puzzle
 * gallery — shares that single parse.
 *
 * A puzzle's identity is its line number in the JSONL (`index`). That is stable
 * for a given data file and is what the URL's `p` parameter and the dev panel
 * refer to. For puzzles whose index is not known up front (a restored game, a
 * completion recorded before indexes were stored) `cagesSig` gives a canonical
 * content-based identity that can be matched instead.
 */

import { canonicalCagesSig } from './cageSignature';
import { PUZZLE_DATA_FILE } from '../constants/gameConstants';
import { getStoredStats } from './puzzleStats';
import { DIFFICULTY_ORDER } from './difficulty';

// The scoring model owns the names and their order; re-exported so the
// catalog's callers do not need both imports.
export type { DifficultyLevel } from './difficulty';
export { DIFFICULTY_ORDER } from './difficulty';
import type { DifficultyLevel } from './difficulty';

export type CatalogCage = {
  value: number;
  operation: string;
  cells: number[];
};

/** A record exactly as stored on one line of the JSONL. */
export type RawPuzzleRecord = {
  puzzle: {
    size: number;
    cages: CatalogCage[];
    solution: number[][];
    difficulty_operations?: number;
  };
  metadata: {
    size: number;
    actual_difficulty: DifficultyLevel;
    difficulty_score?: number;
    raw_score?: number;
    scoring_version?: number;
    operations_tier?: string;
    operation_count?: number;
    generation_time?: number;
    generated_at?: string;
    generator_version?: string;
  };
};

/** A puzzle plus the derived fields the gallery filters and groups on. */
export type CatalogEntry = {
  /** Line number in the JSONL - the puzzle's stable id. */
  index: number;
  size: number;
  operationsTier: string;
  difficulty: DifficultyLevel;
  /** Numeric difficulty, 0-100. Named tiers are bands of this. */
  score: number;
  /** Canonical content hash, for identifying a puzzle without its index. */
  cagesSig: string;
  record: RawPuzzleRecord;
};

/**
 * Builds a canonical signature for a set of cages.
 *
 * Cell lists and the cage list itself are both sorted, so the signature is
 * independent of the order cages happen to be stored in.
 */
// The signature lives in its own module so the Node generator can use it
export { canonicalCagesSig } from './cageSignature';

const toEntry = (record: RawPuzzleRecord, index: number): CatalogEntry => ({
  index,
  size: record.puzzle.size,
  operationsTier: record.metadata.operations_tier ?? 'all',
  difficulty: record.metadata.actual_difficulty,
  // Older records predate difficulty_score; fall back to the midpoint of the
  // named tier's band so they still sort and group somewhere sensible.
  score: record.metadata.difficulty_score ?? TIER_MIDPOINT[record.metadata.actual_difficulty] ?? 50,
  cagesSig: canonicalCagesSig(record.puzzle.cages),
  record,
});

const TIER_MIDPOINT: Record<DifficultyLevel, number> = {
  easiest: 10,
  easy: 30,
  medium: 50,
  hard: 70,
  expert: 90,
};

let catalogPromise: Promise<CatalogEntry[]> | null = null;

/**
 * Fetches and parses the puzzle database, memoized for the session.
 *
 * Concurrent callers share one in-flight request. A failed load is not cached,
 * so a later call can retry.
 */
export const loadCatalog = (): Promise<CatalogEntry[]> => {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const response = await fetch(PUZZLE_DATA_FILE);
      if (!response.ok) {
        throw new Error(`Failed to load puzzle data: HTTP ${response.status}`);
      }
      const text = await response.text();
      const entries: CatalogEntry[] = [];
      const lines = text.trim().split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        try {
          entries.push(toEntry(JSON.parse(line) as RawPuzzleRecord, i));
        } catch (parseError) {
          console.warn(`Skipping unparseable puzzle on line ${i}:`, parseError);
        }
      }
      return entries;
    })().catch(error => {
      // Let the next caller retry rather than caching the rejection forever.
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
};

/** Width of each numeric-difficulty group in the gallery. */
export const SCORE_BAND_SIZE = 10;

/** The lower bound of the score band a puzzle falls into. */
export const scoreBandStart = (score: number): number => {
  const clamped = Math.max(0, Math.min(99.999, score));
  return Math.floor(clamped / SCORE_BAND_SIZE) * SCORE_BAND_SIZE;
};

/**
 * An inclusive span of named difficulties, as indexes into DIFFICULTY_ORDER.
 * `[0, 4]` is everything; `[2, 2]` is medium alone.
 */
export type DifficultyRange = [number, number];

export const FULL_DIFFICULTY_RANGE: DifficultyRange = [0, DIFFICULTY_ORDER.length - 1];

/**
 * Whether a difficulty falls inside the range.
 *
 * On the named band rather than the 0-100 score, because the band is assigned
 * within a size: every size has all five, so a range always has puzzles in it.
 * A range over the score would be empty for a 4x4 above about 30, that being
 * as hard as a 4x4 gets on a scale shared with 7x7s.
 */
export const difficultyInRange = (difficulty: DifficultyLevel, range: DifficultyRange): boolean => {
  const rank = DIFFICULTY_ORDER.indexOf(difficulty);
  return rank >= range[0] && rank <= range[1];
};

/** "medium" for a single-band range, "easy – hard" for a wider one. */
export const describeDifficultyRange = ([low, high]: DifficultyRange): string =>
  low === high ? DIFFICULTY_ORDER[low] : `${DIFFICULTY_ORDER[low]} – ${DIFFICULTY_ORDER[high]}`;

export type DifficultyGroup = {
  difficulty: DifficultyLevel;
  entries: CatalogEntry[];
};

/**
 * Groups entries by named difficulty, easiest first, hardest last, each group
 * ordered by score. Difficulties with no matching puzzles are omitted.
 *
 * The gallery used to section by 10-point bands of the numeric score. That
 * stopped working when the score became one cross-size scale: a 4x4 is a small
 * puzzle by that measure whatever its band, so 781 of the thousand 4x4s landed
 * in "10-20" and the gallery was one endless section. The named band is
 * assigned within a size, so there are always five of them and they are always
 * populated. The number still rides on each tile, and sorts within a group.
 */
export const groupByDifficulty = (entries: CatalogEntry[]): DifficultyGroup[] => {
  const byDifficulty = new Map<DifficultyLevel, CatalogEntry[]>();
  for (const entry of entries) {
    const bucket = byDifficulty.get(entry.difficulty);
    if (bucket) bucket.push(entry);
    else byDifficulty.set(entry.difficulty, [entry]);
  }
  return DIFFICULTY_ORDER.filter(difficulty => byDifficulty.has(difficulty)).map(difficulty => ({
    difficulty,
    entries: byDifficulty.get(difficulty)!.sort((a, b) => a.score - b.score),
  }));
};

/**
 * A random puzzle out of an already-filtered set.
 *
 * The gallery's shuffle draws from exactly what the filters are showing, so
 * "random" means random within the size, operations and hide-completed choices
 * the player has made rather than random across the whole database.
 *
 * `excludeIndex` keeps it from handing back the puzzle already on the board,
 * which reads as a button that did nothing - unless that is the only puzzle the
 * filters match, in which case it is the honest answer.
 */
export const pickRandomEntry = (
  entries: CatalogEntry[],
  excludeIndex?: number | null
): CatalogEntry | null => {
  const pool = entries.length > 1 ? entries.filter(e => e.index !== excludeIndex) : entries;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
};

/**
 * Signatures of every puzzle the player has completed.
 *
 * Matching on signature rather than index means completions recorded before
 * puzzle indexes were stored still register as solved.
 */
export const completedSignatures = (): Set<string> => {
  const signatures = new Set<string>();
  for (const stat of getStoredStats()) {
    if (stat.puzzle?.cages) {
      signatures.add(canonicalCagesSig(stat.puzzle.cages));
    }
  }
  return signatures;
};
