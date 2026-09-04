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

import { PUZZLE_DATA_FILE } from '../constants/gameConstants';
import { getStoredStats } from './puzzleStats';

export type DifficultyLevel = 'easiest' | 'easy' | 'medium' | 'hard' | 'expert';

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
export const canonicalCagesSig = (cages: CatalogCage[]): string =>
  cages
    .map(c => `${c.value}/${c.operation}/${[...c.cells].sort((a, b) => a - b).join(',')}`)
    .sort()
    .join('|');

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

export type ScoreBand = {
  /** Lower bound of the band, e.g. 40 for the 40-50 band. */
  start: number;
  label: string;
  /** The named tier this band sits in, for context in the heading. */
  tier: DifficultyLevel;
  entries: CatalogEntry[];
};

/** The named tier a numeric score corresponds to. */
export const tierForScore = (score: number): DifficultyLevel => {
  if (score < 20) return 'easiest';
  if (score < 40) return 'easy';
  if (score < 60) return 'medium';
  if (score < 80) return 'hard';
  return 'expert';
};

/**
 * Groups entries into ascending numeric-difficulty bands, hardest last.
 * Bands with no matching puzzles are omitted.
 */
export const groupByScoreBand = (entries: CatalogEntry[]): ScoreBand[] => {
  const byBand = new Map<number, CatalogEntry[]>();
  for (const entry of entries) {
    const start = scoreBandStart(entry.score);
    const bucket = byBand.get(start);
    if (bucket) {
      bucket.push(entry);
    } else {
      byBand.set(start, [entry]);
    }
  }
  return [...byBand.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, bandEntries]) => ({
      start,
      label: `${start}–${start + SCORE_BAND_SIZE}`,
      tier: tierForScore(start),
      entries: bandEntries.sort((a, b) => a.score - b.score),
    }));
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
