/**
 * Carve a board into connected cages of given sizes. Ported from
 * backend/arithmatrix.py's carve_square with numeric cage ids (letters capped
 * a board at 26 cages and silently dropped the rest).
 *
 * Returns an n x n array of cage ids (1-based) or null when no attempt tiled
 * the board. Growth prefers cells with more free neighbours, so the board does
 * not fragment, and breaks straight lines when it can, since L- and T-shaped
 * cages are what give the solver positional work.
 */

import type { Rng } from './rng';

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function carve(
  n: number,
  cageSizes: readonly number[],
  rng: Rng,
  maxAttempts = 100
): number[][] | null {
  const order = cageSizes.map((size, i) => ({ id: i + 1, size })).sort((a, b) => b.size - a.size);

  const freeNeighbours = (used: boolean[][], r: number, c: number): [number, number][] => {
    const out: [number, number][] = [];
    for (const [dr, dc] of DIRECTIONS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && !used[nr][nc]) out.push([nr, nc]);
    }
    return out;
  };

  const growCage = (
    used: boolean[][],
    r0: number,
    c0: number,
    size: number
  ): [number, number][] | null => {
    const cells: [number, number][] = [[r0, c0]];
    const temp = used.map(row => row.slice());
    temp[r0][c0] = true;
    while (cells.length < size) {
      const candidates: { r: number; c: number; future: number; line: number; jitter: number }[] =
        [];
      const seen = new Set<number>();
      for (const [r, c] of cells) {
        for (const [nr, nc] of freeNeighbours(temp, r, c)) {
          const key = nr * n + nc;
          if (seen.has(key)) continue;
          seen.add(key);
          const rows = new Set(cells.map(([rr]) => rr));
          const cols = new Set(cells.map(([, cc]) => cc));
          rows.add(nr);
          cols.add(nc);
          candidates.push({
            r: nr,
            c: nc,
            future: freeNeighbours(temp, nr, nc).length,
            line: rows.size === 1 || cols.size === 1 ? 1 : 0,
            jitter: rng.next(),
          });
        }
      }
      if (candidates.length === 0) return null;
      // Most free neighbours first, non-line preferred, then random among equals
      candidates.sort((a, b) => b.future - a.future || a.line - b.line || b.jitter - a.jitter);
      const { r, c } = candidates[0];
      cells.push([r, c]);
      temp[r][c] = true;
    }
    return cells;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const used: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
    let ok = true;
    for (const { id, size } of order) {
      const starts: [number, number][] = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!used[r][c]) starts.push([r, c]);
      rng.shuffle(starts);
      let placed = false;
      for (const [r, c] of starts) {
        const cells = growCage(used, r, c, size);
        if (cells && cells.length === size) {
          for (const [cr, cc] of cells) {
            used[cr][cc] = true;
            result[cr][cc] = id;
          }
          placed = true;
          break;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return result;
  }
  return null;
}
