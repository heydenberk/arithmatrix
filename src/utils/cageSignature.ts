/**
 * A puzzle's identity by its cages alone: the same board carved the same way
 * is the same puzzle whatever order the record lists it in. Used as the key
 * for saved games, for deduplicating generated puzzles, and for re-keying
 * persisted scores after a corpus re-score.
 *
 * Its own module because the generator runs under Node, where the catalog's
 * Vite-only imports (import.meta.env) are not available.
 */

export type SignedCage = { cells: number[]; operation: string; value: number };

export const canonicalCagesSig = (cages: SignedCage[]): string =>
  cages
    .map(c => `${c.value}/${c.operation}/${[...c.cells].sort((a, b) => a - b).join(',')}`)
    .sort()
    .join('|');
