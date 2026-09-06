/**
 * Technique-based Arithmatrix solver, ported from backend/solver.py.
 *
 * Produces a step-by-step trace of how the puzzle would be solved by a
 * human-like solver, with plain-language commentary for each step.
 *
 * The trace is collected up front (synchronous solve) and then played back
 * by the UI at user-controlled speed.
 */

import type { PuzzleDefinition } from '../types/ArithmatrixTypes';

export type TechniqueId =
  | 'stipulated'
  | 'naked_single'
  | 'cage_impossible'
  | 'hidden_single'
  | 'cage_single'
  | 'cage_locked'
  | 'cage_intersection'
  | 'cage_combinations'
  | 'multi_cage_line_lock'
  | 'summation'
  | 'cross_cage_feasibility'
  | 'trial_and_error';

export const TECHNIQUE_WEIGHTS: Record<TechniqueId, number> = {
  stipulated: 0,
  naked_single: 1,
  cage_impossible: 2,
  hidden_single: 2,
  cage_single: 3,
  cage_locked: 3,
  cage_intersection: 4,
  cage_combinations: 5,
  multi_cage_line_lock: 8,
  summation: 9,
  cross_cage_feasibility: 10,
  trial_and_error: 15,
};

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  stipulated: 'Stipulated',
  naked_single: 'Naked single',
  cage_impossible: 'Math impossible',
  hidden_single: 'Hidden single',
  cage_single: 'Cage single',
  cage_locked: 'Cage locked',
  cage_intersection: 'Cage intersection',
  cage_combinations: 'Cage combinations',
  multi_cage_line_lock: 'Multi-cage lock',
  summation: 'Summation',
  cross_cage_feasibility: 'Cross-cage feasibility',
  trial_and_error: 'Trial and error',
};

export type CellRef = { row: number; col: number };

export type SolverStep = {
  technique: TechniqueId;
  description: string;
  // Primary cells: the ones being placed or having candidates removed
  highlight: CellRef[];
  // Supporting cells: the cells whose state drives the deduction (e.g. the
  // cage cells that lock a value into a line). Rendered with a softer highlight
  // so the user can see *why* the change is happening.
  supportCells?: CellRef[];
  // Full snapshot AFTER applying this step
  grid: number[][];
  candidates: Set<number>[][];
  // Score weight contributed by this step
  scoreDelta: number;
  // Running totals after this step
  cumulativeScore: number;
  cumulativeCounts: Record<TechniqueId, number>;
};

export type SolverResult = {
  steps: SolverStep[];
  finalGrid: number[][];
  techniqueCounts: Record<TechniqueId, number>;
  rawScore: number;
  solutionCount: number;
  isValid: boolean;
};

// Techniques a human experiences as genuine bottlenecks (weight >= 8). They
// drive difficulty at full weight; cheaper techniques are volume-compressed
// (see bottleneckRaw). Mirrors _HARD_TECHNIQUES in backend/solver.py.
const HARD_TECHNIQUES: ReadonlySet<TechniqueId> = new Set<TechniqueId>([
  'multi_cage_line_lock',
  'summation',
  'cross_cage_feasibility',
  'trial_and_error',
]);

/**
 * Bottleneck-aware raw difficulty magnitude: hard techniques at full weight,
 * cheaper bulk square-root compressed so a long cascade of cheap deductions
 * (e.g. many naked singles) can't dominate. Mirrors SolveStats.raw_score.
 */
export function bottleneckRaw(counts: Record<TechniqueId, number>): number {
  let hard = 0;
  let cheap = 0;
  for (const t of Object.keys(counts) as TechniqueId[]) {
    const contribution = TECHNIQUE_WEIGHTS[t] * counts[t];
    if (HARD_TECHNIQUES.has(t)) hard += contribution;
    else cheap += contribution;
  }
  return hard + Math.sqrt(cheap);
}

// Per-size raw-score quantile boundaries (q20, q40, q60, q80) defining the
// five tiers: easiest = bottom 20% … expert = top 20%. Quantile bucketing is
// used because the bottleneck raw is bimodal (flows vs hits-walls), so fixed
// thresholds would leave "medium" nearly empty. Mirrors SIZE_QUANTILES in
// backend/solver.py; recompute with scripts/calibrate-quantiles.py.
const SIZE_QUANTILES: Record<number, [number, number, number, number]> = {
  4: [5.9, 7.8, 21.7, 36.8],
  5: [7.9, 8.7, 19.1, 33.0],
  6: [25.1, 40.0, 59.2, 109.6],
  7: [14.0, 29.6, 82.1, 205.8],
};

const colLetter = (col: number) => String.fromCharCode('A'.charCodeAt(0) + col);
const cellLabel = (row: number, col: number) => `${colLetter(col)}${row + 1}`;

function interp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 <= x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Map a bottleneck raw score to a 0-100 display score by piecewise-linear
 * interpolation through the per-size quantile boundaries, so the tier cutoffs
 * land at exactly 20/40/60/80. Mirrors SolveStats.difficulty_score.
 */
export function normalizeScore(rawScore: number, size: number): number {
  if (rawScore <= 0) return 0;
  const [q20, q40, q60, q80] = SIZE_QUANTILES[size] ?? SIZE_QUANTILES[7];
  if (rawScore < q20) return interp(rawScore, 0, q20, 0, 20);
  if (rawScore < q40) return interp(rawScore, q20, q40, 20, 40);
  if (rawScore < q60) return interp(rawScore, q40, q60, 40, 60);
  if (rawScore < q80) return interp(rawScore, q60, q80, 60, 80);
  const span = Math.max(1e-9, q80 - q60);
  return Math.min(100, 80 + ((rawScore - q80) / span) * 20);
}

export function difficultyLevel(score: number): 'easiest' | 'easy' | 'medium' | 'hard' | 'expert' {
  if (score < 20) return 'easiest';
  if (score < 40) return 'easy';
  if (score < 60) return 'medium';
  if (score < 80) return 'hard';
  return 'expert';
}

type CageInfo = {
  index: number;
  cells: CellRef[];
  operation: string;
  value: number;
  combinations: number[][]; // each combo aligns positionally with `cells`
  // For each cell position, the set of values that could appear there in
  // *any* combination — independent of row/column state. Used to spot
  // mathematically impossible candidates cheaply (e.g. a 3÷ cell can never
  // be 4, 5, or 7).
  everPossiblePerPos: Set<number>[];
};

export type SolveOptions = {
  /** Cells the user has already placed. 0 means empty. */
  startGrid?: number[][];
  /** Pencil marks per cell. If provided, the solver starts from these
   *  candidate sets instead of the full {1..size} default. */
  startCandidates?: Set<number>[][];
  /** Known solution. When provided alongside startCandidates, the solver
   *  detects user pencil-mark sets that don't contain the solution value
   *  for a cell (which would make the puzzle unsolvable from here) and
   *  restores those candidates, emitting a step describing the fix. */
  solution?: number[][];
};

class Solver {
  size: number;
  cages: CageInfo[];
  cellToCage: Map<string, CageInfo>;
  grid: number[][];
  candidates: Set<number>[][];
  steps: SolverStep[];
  counts: Record<TechniqueId, number>;
  rawScore: number;
  solution: number[][] | null;

  constructor(puzzle: PuzzleDefinition, options: SolveOptions = {}) {
    const startGrid = options.startGrid;
    const startCandidates = options.startCandidates;
    this.solution = options.solution ?? null;
    this.size = puzzle.size;
    this.steps = [];
    this.counts = {
      stipulated: 0,
      naked_single: 0,
      cage_impossible: 0,
      hidden_single: 0,
      cage_single: 0,
      cage_locked: 0,
      cage_intersection: 0,
      cage_combinations: 0,
      multi_cage_line_lock: 0,
      summation: 0,
      cross_cage_feasibility: 0,
      trial_and_error: 0,
    };
    this.rawScore = 0;

    // Build cages with cell coords and precomputed combinations
    this.cages = puzzle.cages.map((cage, index) => {
      const combos = precomputeCageCombinations(cage, this.size);
      const everPossiblePerPos = cage.cells.map((_, pos) => {
        const s = new Set<number>();
        for (const combo of combos) s.add(combo[pos]);
        return s;
      });
      return {
        index,
        cells: cage.cells.map(idx => ({
          row: Math.floor(idx / this.size),
          col: idx % this.size,
        })),
        operation: cage.operation,
        value: cage.value,
        combinations: combos,
        everPossiblePerPos,
      };
    });

    this.cellToCage = new Map();
    for (const cage of this.cages) {
      for (const c of cage.cells) {
        this.cellToCage.set(cellKey(c.row, c.col), cage);
      }
    }

    // Initialize grid: zero everywhere, or use provided start grid
    this.grid = [];
    for (let r = 0; r < this.size; r++) {
      const row: number[] = [];
      for (let c = 0; c < this.size; c++) {
        row.push(startGrid?.[r]?.[c] ?? 0);
      }
      this.grid.push(row);
    }

    // Initialize candidates: start from user pencil marks if provided,
    // else default to {1..size} for empty cells.
    this.candidates = [];
    for (let r = 0; r < this.size; r++) {
      const row: Set<number>[] = [];
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] !== 0) {
          row.push(new Set());
        } else {
          const userMarks = startCandidates?.[r]?.[c];
          if (userMarks && userMarks.size > 0) {
            row.push(new Set(userMarks));
          } else {
            row.push(new Set(range1(this.size)));
          }
        }
      }
      this.candidates.push(row);
    }
    // Eliminate candidates conflicting with already-placed values
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const v = this.grid[r][c];
        if (v !== 0) {
          this.eliminateFromRowCol(r, c, v);
        }
      }
    }
  }

  /**
   * If the user has eliminated the actual solution value from a cell's
   * candidates (or wrongly placed a different value there), restore the
   * correct candidate / fix the placement and emit a step describing what
   * was changed. Returns true if any fixes were applied.
   *
   * Without this, starting from invalid user state would either crash the
   * solver or force it into trial-and-error from a hopeless state.
   */
  private repairFromSolution(): boolean {
    if (!this.solution) return false;
    let fixed = false;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const correct = this.solution[r][c];
        const placed = this.grid[r][c];
        if (placed !== 0 && placed !== correct) {
          // User placed the wrong value here. Clear it and restore candidates.
          this.grid[r][c] = 0;
          this.candidates[r][c] = new Set(range1(this.size));
          // Re-eliminate from row/col based on other still-placed values
          for (let i = 0; i < this.size; i++) {
            if (this.grid[r][i] !== 0) this.candidates[r][c].delete(this.grid[r][i]);
            if (this.grid[i][c] !== 0) this.candidates[r][c].delete(this.grid[i][c]);
          }
          this.recordStep(
            'stipulated',
            `Repair: ${cellLabel(r, c)} had ${placed} placed, but the solution is ${correct}. Cleared the wrong placement.`,
            [{ row: r, col: c }]
          );
          fixed = true;
        } else if (placed === 0 && !this.candidates[r][c].has(correct)) {
          // User's pencil marks eliminated the correct value. Restore it.
          this.candidates[r][c].add(correct);
          this.recordStep(
            'stipulated',
            `Repair: restored ${correct} to ${cellLabel(r, c)} candidates — you had it eliminated, but it's the solution there.`,
            [{ row: r, col: c }]
          );
          fixed = true;
        }
      }
    }
    return fixed;
  }

  private eliminateFromRowCol(row: number, col: number, value: number) {
    for (let i = 0; i < this.size; i++) {
      this.candidates[row][i].delete(value);
      this.candidates[i][col].delete(value);
    }
  }

  private place(row: number, col: number, value: number) {
    this.grid[row][col] = value;
    this.candidates[row][col] = new Set();
    this.eliminateFromRowCol(row, col, value);
  }

  private snapshotGrid(): number[][] {
    return this.grid.map(row => row.slice());
  }

  private snapshotCandidates(): Set<number>[][] {
    return this.candidates.map(row => row.map(s => new Set(s)));
  }

  private recordStep(
    technique: TechniqueId,
    description: string,
    highlight: CellRef[],
    supportCells?: CellRef[]
  ) {
    const delta = TECHNIQUE_WEIGHTS[technique];
    this.counts[technique] += 1;
    this.rawScore = bottleneckRaw(this.counts);
    this.steps.push({
      technique,
      description,
      highlight,
      supportCells,
      grid: this.snapshotGrid(),
      candidates: this.snapshotCandidates(),
      scoreDelta: delta,
      cumulativeScore: this.rawScore,
      cumulativeCounts: { ...this.counts },
    });

    // Whenever a complex deduction narrows things, the cheapest follow-up
    // techniques (naked + hidden singles) should fire immediately as the next
    // steps. We skip the cascade for naked_single and hidden_single themselves
    // to avoid recursion — those are exhaustively driven by the cascade itself.
    if (technique !== 'naked_single' && technique !== 'hidden_single') {
      this.cascadeEasyTechniques();
    }
  }

  /**
   * Run naked + hidden singles until neither can find another deduction. This
   * is the "go back to the easiest thing" cascade that runs after every more
   * advanced deduction. Returns true if anything was placed.
   */
  private cascadeEasyTechniques(): boolean {
    let any = false;
    while (true) {
      let did = false;
      if (this.applyNakedSingles()) did = true;
      if (this.applyHiddenSingles()) did = true;
      if (!did) break;
      any = true;
    }
    return any;
  }

  // ---------- Techniques ----------

  private applyNakedSingles(): boolean {
    let progress = false;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 1) {
          const v = [...this.candidates[r][c]][0];
          this.place(r, c, v);
          this.recordStep(
            'naked_single',
            `Naked single at ${cellLabel(r, c)}: only ${v} is possible (row + column eliminate the rest).`,
            [{ row: r, col: c }]
          );
          progress = true;
        }
      }
    }
    return progress;
  }

  private applyHiddenSingles(): boolean {
    let progress = false;
    // Rows
    for (let r = 0; r < this.size; r++) {
      for (let num = 1; num <= this.size; num++) {
        let alreadyPlaced = false;
        for (let c = 0; c < this.size; c++)
          if (this.grid[r][c] === num) {
            alreadyPlaced = true;
            break;
          }
        if (alreadyPlaced) continue;
        const possible: number[] = [];
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(num)) possible.push(c);
        }
        if (possible.length === 1) {
          const col = possible[0];
          this.place(r, col, num);
          this.recordStep(
            'hidden_single',
            `Hidden single in row ${r + 1}: ${num} can only go at ${cellLabel(r, col)}.`,
            [{ row: r, col }]
          );
          progress = true;
        }
      }
    }
    // Columns
    for (let c = 0; c < this.size; c++) {
      for (let num = 1; num <= this.size; num++) {
        let alreadyPlaced = false;
        for (let r = 0; r < this.size; r++)
          if (this.grid[r][c] === num) {
            alreadyPlaced = true;
            break;
          }
        if (alreadyPlaced) continue;
        const possible: number[] = [];
        for (let r = 0; r < this.size; r++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(num)) possible.push(r);
        }
        if (possible.length === 1) {
          const row = possible[0];
          this.place(row, c, num);
          this.recordStep(
            'hidden_single',
            `Hidden single in column ${colLetter(c)}: ${num} can only go at ${cellLabel(row, c)}.`,
            [{ row, col: c }]
          );
          progress = true;
        }
      }
    }
    return progress;
  }

  /**
   * Compute the combinations that are still viable for a cage given the current
   * grid + candidate state. Matches the filter in applyCageConstraints.
   */
  private survivingCombos(cage: CageInfo): number[][] {
    const placed: Array<{ pos: number; value: number }> = [];
    cage.cells.forEach((cell, pos) => {
      if (this.grid[cell.row][cell.col] !== 0) {
        placed.push({ pos, value: this.grid[cell.row][cell.col] });
      }
    });
    const placedPositions = new Set(placed.map(p => p.pos));
    return cage.combinations.filter(combo => {
      for (const { pos, value } of placed) {
        if (combo[pos] !== value) return false;
      }
      for (let pos = 0; pos < cage.cells.length; pos++) {
        if (placedPositions.has(pos)) continue;
        const { row, col } = cage.cells[pos];
        if (!this.candidates[row][col].has(combo[pos])) return false;
      }
      return true;
    });
  }

  /**
   * Cage intersection ("pointing pairs" for KenKen).
   *
   * If every surviving combination of a cage forces value v to appear in at
   * least one cell in row R (or column C) of the cage, then v must end up in
   * the cage within that line — so v can be eliminated from every non-cage
   * cell in line R.
   *
   * Easy case: 6- vertical cage at size 7. Combos are (1,7) and (7,1); every
   * combo places one 1 and one 7 in the shared column, so 1 and 7 can be
   * eliminated from every other cell in that column.
   *
   * Hard case (elbow): 252× cage with cells in an L. Uniqueness rules force
   * the two 6s in (6,7,6) into the two non-adjacent corners — locking 6 into
   * both rows AND both columns the cage touches.
   */
  private applyCageIntersection(): boolean {
    let progress = false;

    for (const cage of this.cages) {
      // Nothing to do if all cells are placed
      if (cage.cells.every(({ row, col }) => this.grid[row][col] !== 0)) continue;

      const survivors = this.survivingCombos(cage);
      if (survivors.length === 0) continue;

      const rowsTouched = new Set(cage.cells.map(c => c.row));
      const colsTouched = new Set(cage.cells.map(c => c.col));

      for (let v = 1; v <= this.size; v++) {
        // For each row/col the cage touches, find the minimum number of times
        // v appears in cage cells of that line across all surviving combos.
        // If min >= 1, v is guaranteed to appear in that line within the cage.
        const minVPerRow = new Map<number, number>();
        const minVPerCol = new Map<number, number>();

        for (const r of rowsTouched) {
          let min = Infinity;
          for (const combo of survivors) {
            let count = 0;
            cage.cells.forEach((cell, pos) => {
              if (cell.row === r && combo[pos] === v) count++;
            });
            if (count < min) min = count;
          }
          minVPerRow.set(r, min === Infinity ? 0 : min);
        }
        for (const c of colsTouched) {
          let min = Infinity;
          for (const combo of survivors) {
            let count = 0;
            cage.cells.forEach((cell, pos) => {
              if (cell.col === c && combo[pos] === v) count++;
            });
            if (count < min) min = count;
          }
          minVPerCol.set(c, min === Infinity ? 0 : min);
        }

        // Eliminate v from non-cage cells in each constrained row
        for (const [r, min] of minVPerRow.entries()) {
          if (min < 1) continue;
          const eliminations: CellRef[] = [];
          for (let c = 0; c < this.size; c++) {
            const inCage = cage.cells.some(cell => cell.row === r && cell.col === c);
            if (inCage) continue;
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
              this.candidates[r][c].delete(v);
              eliminations.push({ row: r, col: c });
            }
          }
          if (eliminations.length > 0) {
            const cellList = eliminations.map(e => cellLabel(e.row, e.col)).join(', ');
            this.recordStep(
              'cage_intersection',
              `Cage intersection: the ${cageHeader(cage)} cage must contain ${v} in row ${r + 1}, eliminating ${v} from ${cellList}.`,
              eliminations
            );
            progress = true;
          }
        }

        // Eliminate v from non-cage cells in each constrained column
        for (const [c, min] of minVPerCol.entries()) {
          if (min < 1) continue;
          const eliminations: CellRef[] = [];
          for (let r = 0; r < this.size; r++) {
            const inCage = cage.cells.some(cell => cell.row === r && cell.col === c);
            if (inCage) continue;
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
              this.candidates[r][c].delete(v);
              eliminations.push({ row: r, col: c });
            }
          }
          if (eliminations.length > 0) {
            const cellListStr = eliminations.map(e => cellLabel(e.row, e.col)).join(', ');
            this.recordStep(
              'cage_intersection',
              `Cage intersection: the ${cageHeader(cage)} cage must contain ${v} in column ${colLetter(c)}, eliminating ${v} from ${cellListStr}.`,
              eliminations
            );
            progress = true;
          }
        }
      }
    }

    return progress;
  }

  /**
   * Multi-cage line lock.
   *
   * Considers pairs of cages with cells in the same row or column. Enumerates
   * compatible joint combinations of those pairs (combinations whose values
   * don't duplicate within the shared line). If across every valid joint
   * combination a particular value v is guaranteed to appear in the cages'
   * line cells, v can be eliminated from every non-cage cell in that line.
   *
   * Example: a 4-wide row containing a 6+ pair and a 2- pair. 6+ in two
   * cells must be {2,4}; 2- in two cells could be {1,3} or {2,4}. The only
   * joint combos that avoid duplicating values are (6+ = {2,4}) × (2- =
   * {1,3}), so 1, 2, 3, 4 are all locked into those four cells.
   *
   * Caps: only considers pairs (not triples+), and only when the joint
   * candidate count of each cage is small enough to enumerate cheaply.
   */
  private applyMultiCageLineLock(): boolean {
    const MAX_JOINT_COMBOS = 2000; // hard cap on cartesian-product size per pair

    for (const orientation of ['row', 'col'] as const) {
      for (let line = 0; line < this.size; line++) {
        // Find cages whose cells include this line, and the cage-cell indices
        // that fall in the line
        const pieces: Array<{ cage: CageInfo; lineIndices: number[] }> = [];
        for (const cage of this.cages) {
          const indices: number[] = [];
          cage.cells.forEach((cell, idx) => {
            if (orientation === 'row' ? cell.row === line : cell.col === line) {
              indices.push(idx);
            }
          });
          if (indices.length > 0) pieces.push({ cage, lineIndices: indices });
        }
        if (pieces.length < 2) continue;

        // Cells of the line, for naming non-cage cells later
        const lineCells: CellRef[] = [];
        for (let i = 0; i < this.size; i++) {
          lineCells.push(orientation === 'row' ? { row: line, col: i } : { row: i, col: line });
        }

        for (let a = 0; a < pieces.length; a++) {
          for (let b = a + 1; b < pieces.length; b++) {
            const A = pieces[a];
            const B = pieces[b];
            const combosA = this.survivingCombos(A.cage);
            const combosB = this.survivingCombos(B.cage);
            if (combosA.length === 0 || combosB.length === 0) continue;
            if (combosA.length * combosB.length > MAX_JOINT_COMBOS) continue;

            // Joint cells (in the line) from both cages
            const cellsA = A.lineIndices.map(i => A.cage.cells[i]);
            const cellsB = B.lineIndices.map(i => B.cage.cells[i]);
            const jointCells = [...cellsA, ...cellsB];
            const jointKey = new Set(jointCells.map(c => `${c.row}-${c.col}`));

            // Enumerate valid joint combos: the values placed in the line by
            // these two cages must all be distinct from each other.
            const jointValueSets: number[][] = [];
            for (const cA of combosA) {
              const valsA = A.lineIndices.map(i => cA[i]);
              for (const cB of combosB) {
                const valsB = B.lineIndices.map(i => cB[i]);
                const all = [...valsA, ...valsB];
                if (new Set(all).size !== all.length) continue;
                jointValueSets.push(all);
              }
            }
            if (jointValueSets.length === 0) continue;

            // For each value v, find the minimum count across joint combos.
            // If min >= 1, v is guaranteed in the joint cells — eliminate from
            // the rest of the line.
            for (let v = 1; v <= this.size; v++) {
              let minCount = Infinity;
              for (const set of jointValueSets) {
                let c = 0;
                for (const x of set) if (x === v) c++;
                if (c < minCount) minCount = c;
                if (minCount === 0) break;
              }
              if (minCount < 1) continue;

              const eliminations: CellRef[] = [];
              for (const lc of lineCells) {
                if (jointKey.has(`${lc.row}-${lc.col}`)) continue;
                if (this.grid[lc.row][lc.col] === 0 && this.candidates[lc.row][lc.col].has(v)) {
                  this.candidates[lc.row][lc.col].delete(v);
                  eliminations.push(lc);
                }
              }
              if (eliminations.length > 0) {
                const where =
                  orientation === 'row' ? `row ${line + 1}` : `column ${colLetter(line)}`;
                const cellList = eliminations.map(e => cellLabel(e.row, e.col)).join(', ');
                this.recordStep(
                  'multi_cage_line_lock',
                  `Multi-cage lock in ${where}: the ${cageHeader(A.cage)} and ${cageHeader(B.cage)} cages together must contain ${v}, eliminating ${v} from ${cellList}.`,
                  eliminations,
                  jointCells // support: the cage cells that lock v into this line
                );
                return true; // restart from easiest
              }
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Cross-cage feasibility check.
   *
   * For each cage's surviving combination, simulate placing those values
   * (just their effect on row/column candidates) and check whether every
   * OTHER cage still has at least one surviving combination. If a combo
   * would break some other cage entirely, it can't be the correct
   * combination for this cage — eliminate the values from this cage's
   * cells that are only present in such infeasible combinations.
   *
   * Example: a 4- cage in a column with a 3÷ cage. 4-'s combo (2,6) would
   * use up the 2 and 6 that the column's 3÷ needs (3÷ requires either
   * {1,3} or {2,6}; if {1,3} is already eliminated elsewhere, this combo
   * would leave 3÷ with nothing).
   */
  /**
   * Summation (innie/outie).
   *
   * Each row (or column) in the puzzle must sum to T₁ = size·(size+1)/2.
   * For any subset S of K rows, the cells in those rows must sum to K·T₁.
   * When the contributing cages' total sums account for all but K cells in
   * S, the residual sum is known — K=1 places the cell, K=2 narrows pairs.
   *
   * A cage's contribution to S is known when its total sum is known
   * (addition / stipulated / cage-locked-to-one-multiset) AND either the
   * cage is fully inside S, or every cage cell outside S is already placed.
   *
   * Example: a row of 7 with a 4-cell 11+ and a 2-cell 42× covers 6 cells
   * (sum 11 + sum 13 = 24), leaving 28-24 = 4 for the seventh cell.
   */
  private applySummation(): boolean {
    const perLineTarget = (this.size * (this.size + 1)) / 2;

    const cageKnownSubsetSum = (
      cageIdx: number,
      subset: Set<number>,
      orientation: 'row' | 'col'
    ): number | null => {
      const cage = this.cages[cageIdx];
      const inSubset = (cell: CellRef) =>
        orientation === 'row' ? subset.has(cell.row) : subset.has(cell.col);

      const cellsIn = cage.cells.filter(inSubset);
      if (cellsIn.length === 0) return null;
      const cellsOut = cage.cells.filter(c => !inSubset(c));

      if (cellsIn.every(c => this.grid[c.row][c.col] !== 0)) {
        let s = 0;
        for (const c of cellsIn) s += this.grid[c.row][c.col];
        return s;
      }

      let cageTotal: number | null = null;
      if (cage.operation === '' || cage.operation === '+') {
        cageTotal = cage.value;
      } else {
        const survivors = this.survivingCombos(cage);
        if (survivors.length === 0) return null;
        const sums = new Set<number>();
        for (const combo of survivors) {
          let s = 0;
          for (const v of combo) s += v;
          sums.add(s);
        }
        if (sums.size === 1) cageTotal = sums.values().next().value as number;
      }
      if (cageTotal === null) return null;

      if (cellsOut.length === 0) return cageTotal;
      if (!cellsOut.every(c => this.grid[c.row][c.col] !== 0)) return null;
      let outSum = 0;
      for (const c of cellsOut) outSum += this.grid[c.row][c.col];
      return cageTotal - outSum;
    };

    for (const orientation of ['row', 'col'] as const) {
      for (let subsetSize = 1; subsetSize <= 3; subsetSize++) {
        const combos = combinationsOfRange(this.size, subsetSize);
        for (const subsetArr of combos) {
          const subset = new Set(subsetArr);
          const target = subsetSize * perLineTarget;

          const subsetCells: CellRef[] = [];
          for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
              if (orientation === 'row' ? subset.has(r) : subset.has(c)) {
                subsetCells.push({ row: r, col: c });
              }
            }
          }

          const covered = new Set<string>();
          let knownSum = 0;
          for (let cageIdx = 0; cageIdx < this.cages.length; cageIdx++) {
            const contrib = cageKnownSubsetSum(cageIdx, subset, orientation);
            if (contrib === null) continue;
            knownSum += contrib;
            for (const c of this.cages[cageIdx].cells) {
              if (orientation === 'row' ? subset.has(c.row) : subset.has(c.col)) {
                covered.add(`${c.row}-${c.col}`);
              }
            }
          }

          const uncovered = subsetCells.filter(c => !covered.has(`${c.row}-${c.col}`));
          let placedUncoveredSum = 0;
          const emptyUncovered: CellRef[] = [];
          for (const cell of uncovered) {
            if (this.grid[cell.row][cell.col] !== 0) {
              placedUncoveredSum += this.grid[cell.row][cell.col];
            } else {
              emptyUncovered.push(cell);
            }
          }
          const residual = target - knownSum - placedUncoveredSum;

          if (emptyUncovered.length === 1) {
            const { row, col } = emptyUncovered[0];
            if (residual >= 1 && residual <= this.size && this.candidates[row][col].has(residual)) {
              this.place(row, col, residual);
              this.recordStep(
                'summation',
                `Summation: rows/cols ${[...subset]
                  .sort()
                  .map(i => i + 1)
                  .join(
                    ','
                  )} (${orientation}) sum to ${target}; cage totals cover ${knownSum + placedUncoveredSum}, so ${cellLabel(row, col)} must be ${residual}.`,
                [{ row, col }]
              );
              return true;
            }
          } else if (emptyUncovered.length === 2) {
            const [a, b] = emptyUncovered;
            const sameLine = a.row === b.row || a.col === b.col;
            const new1 = new Set<number>();
            const new2 = new Set<number>();
            for (const v of this.candidates[a.row][a.col]) {
              const u = residual - v;
              if (u < 1 || u > this.size) continue;
              if (!this.candidates[b.row][b.col].has(u)) continue;
              if (sameLine && v === u) continue;
              new1.add(v);
              new2.add(u);
            }
            if (new1.size === 0 || new2.size === 0) continue;
            const changed1 = !setsEqual(new1, this.candidates[a.row][a.col]);
            const changed2 = !setsEqual(new2, this.candidates[b.row][b.col]);
            if (changed1 || changed2) {
              this.candidates[a.row][a.col] = new1;
              this.candidates[b.row][b.col] = new2;
              this.recordStep(
                'summation',
                `Summation: rows/cols ${[...subset]
                  .sort()
                  .map(i => i + 1)
                  .join(
                    ','
                  )} (${orientation}) need ${residual} across ${cellLabel(a.row, a.col)} and ${cellLabel(b.row, b.col)}.`,
                [a, b]
              );
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  private applyCrossCageFeasibility(): boolean {
    const MAX_COMBOS_TO_CHECK = 200; // skip cages with too many combos

    for (const cageA of this.cages) {
      if (cageA.cells.every(c => this.grid[c.row][c.col] !== 0)) continue;

      const survivorsA = this.survivingCombos(cageA);
      if (survivorsA.length <= 1) continue; // nothing to narrow
      if (survivorsA.length > MAX_COMBOS_TO_CHECK) continue;

      // Find cages that share at least one row or column with cageA
      const intersectingCages: CageInfo[] = [];
      const cageARowCols = new Set<string>();
      cageA.cells.forEach(c => {
        cageARowCols.add(`r${c.row}`);
        cageARowCols.add(`c${c.col}`);
      });
      for (const cageB of this.cages) {
        if (cageB === cageA) continue;
        if (cageB.cells.some(c => cageARowCols.has(`r${c.row}`) || cageARowCols.has(`c${c.col}`))) {
          intersectingCages.push(cageB);
        }
      }
      if (intersectingCages.length === 0) continue;

      const feasible: number[][] = [];
      for (const comboA of survivorsA) {
        // Build temp candidate state with comboA placed
        const tempGrid = this.grid.map(r => r.slice());
        const tempCands = this.candidates.map(row => row.map(s => new Set(s)));
        let earlyFail = false;
        cageA.cells.forEach((cell, pos) => {
          if (tempGrid[cell.row][cell.col] !== 0) return;
          const v = comboA[pos];
          tempGrid[cell.row][cell.col] = v;
          tempCands[cell.row][cell.col] = new Set();
          for (let i = 0; i < this.size; i++) {
            tempCands[cell.row][i].delete(v);
            tempCands[i][cell.col].delete(v);
          }
        });
        // Check each intersecting cage still has at least one viable combo
        for (const cageB of intersectingCages) {
          const placedB: Array<{ pos: number; value: number }> = [];
          cageB.cells.forEach((cell, pos) => {
            if (tempGrid[cell.row][cell.col] !== 0) {
              placedB.push({ pos, value: tempGrid[cell.row][cell.col] });
            }
          });
          const placedPos = new Set(placedB.map(p => p.pos));
          const stillViable = cageB.combinations.some(combo => {
            for (const { pos, value } of placedB) {
              if (combo[pos] !== value) return false;
            }
            for (let pos = 0; pos < cageB.cells.length; pos++) {
              if (placedPos.has(pos)) continue;
              const { row, col } = cageB.cells[pos];
              if (!tempCands[row][col].has(combo[pos])) return false;
            }
            return true;
          });
          if (!stillViable) {
            earlyFail = true;
            break;
          }
        }
        if (!earlyFail) feasible.push(comboA);
      }

      if (feasible.length === 0 || feasible.length === survivorsA.length) continue;

      // The cells of the intersecting cages drove the deduction — collect them
      // for support highlighting.
      const supportCells: CellRef[] = intersectingCages.flatMap(c => c.cells);

      // Translate the narrowed combo set into candidate eliminations on cageA's cells
      for (let pos = 0; pos < cageA.cells.length; pos++) {
        const cell = cageA.cells[pos];
        if (this.grid[cell.row][cell.col] !== 0) continue;
        const stillPossible = new Set(feasible.map(c => c[pos]));
        const toRemove: number[] = [];
        for (const v of this.candidates[cell.row][cell.col]) {
          if (!stillPossible.has(v)) toRemove.push(v);
        }
        if (toRemove.length > 0) {
          toRemove.forEach(v => this.candidates[cell.row][cell.col].delete(v));
          this.recordStep(
            'cross_cage_feasibility',
            `Cross-cage feasibility: ${toRemove.sort((a, b) => a - b).join(', ')} at ${cellLabel(cell.row, cell.col)} would leave another cage with no valid combinations.`,
            [cell],
            supportCells
          );
          return true; // restart from easiest
        }
      }
    }

    return false;
  }

  /** Narrow + place from this single cage's surviving combinations. */
  private narrowCage(cage: CageInfo): boolean {
    if (cage.cells.every(({ row, col }) => this.grid[row][col] !== 0)) return false;

    const filtered = this.survivingCombos(cage);
    if (filtered.length === 0) return false;

    // Other cells of the cage drive the deduction — highlight them as support.
    for (const cell of cage.cells) {
      if (this.grid[cell.row][cell.col] !== 0) continue;
      const possibleValues = new Set<number>();
      for (const combo of filtered) {
        const pos = cage.cells.indexOf(cell);
        possibleValues.add(combo[pos]);
      }

      const supportCells = cage.cells.filter(c => c.row !== cell.row || c.col !== cell.col);

      if (possibleValues.size === 1) {
        const value = [...possibleValues][0];
        if (this.candidates[cell.row][cell.col].has(value)) {
          this.place(cell.row, cell.col, value);
          this.recordStep(
            'cage_single',
            `Cage single at ${cellLabel(cell.row, cell.col)}: the ${cageHeader(cage)} cage forces ${value}.`,
            [{ row: cell.row, col: cell.col }],
            supportCells
          );
          return true; // restart from easiest
        }
      } else {
        const toRemove: number[] = [];
        for (const v of this.candidates[cell.row][cell.col]) {
          if (!possibleValues.has(v)) toRemove.push(v);
        }
        if (toRemove.length > 0) {
          toRemove.forEach(v => this.candidates[cell.row][cell.col].delete(v));
          this.recordStep(
            'cage_combinations',
            `Cage combinations: the ${cageHeader(cage)} cage rules out ${toRemove.sort((a, b) => a - b).join(', ')} at ${cellLabel(cell.row, cell.col)}.`,
            [{ row: cell.row, col: cell.col }],
            supportCells
          );
          return true; // restart from easiest
        }
      }
    }

    return false;
  }

  /** Run cage_intersection for a single cage. Returns on first progress. */
  private intersectCage(cage: CageInfo): boolean {
    if (cage.cells.every(({ row, col }) => this.grid[row][col] !== 0)) return false;

    const survivors = this.survivingCombos(cage);
    if (survivors.length === 0) return false;

    const rowsTouched = new Set(cage.cells.map(c => c.row));
    const colsTouched = new Set(cage.cells.map(c => c.col));

    for (let v = 1; v <= this.size; v++) {
      for (const r of rowsTouched) {
        let min = Infinity;
        for (const combo of survivors) {
          let count = 0;
          cage.cells.forEach((cell, pos) => {
            if (cell.row === r && combo[pos] === v) count++;
          });
          if (count < min) min = count;
        }
        if (min < 1) continue;
        const eliminations: CellRef[] = [];
        for (let c = 0; c < this.size; c++) {
          const inCage = cage.cells.some(cell => cell.row === r && cell.col === c);
          if (inCage) continue;
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
            this.candidates[r][c].delete(v);
            eliminations.push({ row: r, col: c });
          }
        }
        if (eliminations.length > 0) {
          const cellList = eliminations.map(e => cellLabel(e.row, e.col)).join(', ');
          // Support = the cage's cells in this row (the cells that lock v into the line)
          const supportCells = cage.cells.filter(c => c.row === r);
          this.recordStep(
            'cage_intersection',
            `Cage intersection: the ${cageHeader(cage)} cage must contain ${v} in row ${r + 1}, eliminating ${v} from ${cellList}.`,
            eliminations,
            supportCells
          );
          return true;
        }
      }
      for (const c of colsTouched) {
        let min = Infinity;
        for (const combo of survivors) {
          let count = 0;
          cage.cells.forEach((cell, pos) => {
            if (cell.col === c && combo[pos] === v) count++;
          });
          if (count < min) min = count;
        }
        if (min < 1) continue;
        const eliminations: CellRef[] = [];
        for (let r = 0; r < this.size; r++) {
          const inCage = cage.cells.some(cell => cell.row === r && cell.col === c);
          if (inCage) continue;
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
            this.candidates[r][c].delete(v);
            eliminations.push({ row: r, col: c });
          }
        }
        if (eliminations.length > 0) {
          const cellList = eliminations.map(e => cellLabel(e.row, e.col)).join(', ');
          const supportCells = cage.cells.filter(cc => cc.col === c);
          this.recordStep(
            'cage_intersection',
            `Cage intersection: the ${cageHeader(cage)} cage must contain ${v} in column ${colLetter(c)}, eliminating ${v} from ${cellList}.`,
            eliminations,
            supportCells
          );
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Process cages in order of constraint strength (fewest surviving combos first).
   * For each cage, do the full narrow + intersect deduction before moving on to
   * the next cage. This means tightly-constrained cages like a 2-cell 6- (only
   * 2 combos: (1,7), (7,1)) get fully resolved before any work is done on
   * weakly-constrained cages like a 2-cell 4- (6 combos).
   */
  private processCagesByStrength(): boolean {
    const ordered = [...this.cages].sort(
      (a, b) => this.survivingCombos(a).length - this.survivingCombos(b).length
    );
    let progress = false;
    for (const cage of ordered) {
      if (this.narrowCage(cage)) progress = true;
      if (this.intersectCage(cage)) progress = true;
    }
    return progress;
  }

  /** Legacy wrappers (unused but kept for clarity in case external callers exist). */
  private applyCageConstraints(): boolean {
    let progress = false;
    for (const cage of this.cages) {
      if (this.narrowCage(cage)) progress = true;
    }
    return progress;
  }

  private isValid(): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 0) return false;
      }
    }
    return true;
  }

  private isComplete(): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === 0) return false;
      }
    }
    return true;
  }

  private verifySolution(): boolean {
    // rows + cols unique
    for (let i = 0; i < this.size; i++) {
      const rowSet = new Set<number>();
      const colSet = new Set<number>();
      for (let j = 0; j < this.size; j++) {
        rowSet.add(this.grid[i][j]);
        colSet.add(this.grid[j][i]);
      }
      if (rowSet.size !== this.size || colSet.size !== this.size) return false;
    }
    // cage constraints
    for (const cage of this.cages) {
      const vals = cage.cells.map(({ row, col }) => this.grid[row][col]);
      if (!cageSatisfied(cage.operation, cage.value, vals)) return false;
    }
    return true;
  }

  // ---------- Main solve ----------

  /**
   * Solve the puzzle and produce the trace. For UI playback we want the trace
   * to end as soon as the first solution is found — past that point we'd just
   * be exploring dead-end branches looking for a second solution.
   */
  solve(maxSolutions = 1): SolverResult {
    // Before anything else: if the user handed us invalid pencil marks or a
    // wrong placement, fix it and tell them what we changed. Without this the
    // logic loop would dead-end immediately.
    this.repairFromSolution();

    // First: drop in every stipulated value (single-cell cages like "4="). These
    // are part of the puzzle definition and should always be placed before any
    // deductive reasoning starts.
    this.placeStipulatedCages();

    // Run logic loop, then fall through to backtracking if stuck
    this.runLogicLoop();

    let solutionCount = 0;
    if (this.isComplete()) {
      solutionCount = this.verifySolution() ? 1 : 0;
    } else if (this.isValid()) {
      solutionCount = this.backtrack(maxSolutions);
    }

    return {
      steps: this.steps,
      finalGrid: this.snapshotGrid(),
      techniqueCounts: { ...this.counts },
      rawScore: bottleneckRaw(this.counts),
      solutionCount,
      isValid: solutionCount === 1,
    };
  }

  private placeStipulatedCages() {
    for (const cage of this.cages) {
      if (cage.cells.length !== 1) continue;
      const { row, col } = cage.cells[0];
      if (this.grid[row][col] !== 0) continue;
      this.place(row, col, cage.value);
      this.recordStep(
        'stipulated',
        `Stipulated: ${cellLabel(row, col)} must be ${cage.value} (single-cell cage).`,
        [{ row, col }]
      );
    }
  }

  /**
   * Cage locked: when every surviving combination is a permutation of the
   * SAME multiset, the cage's value-set is determined even if the per-cell
   * placement isn't. Narrow each cage cell to those values in one deduction.
   *
   * Examples: a 2-cell 6- has combos (1,7) and (7,1) — same multiset {1,7},
   * cells narrow to {1,7}. An 18+ cage with 3 stacked cells at size 7 has
   * combos that are permutations of {5,6,7} — cells narrow to {5,6,7}.
   *
   * Distinct from cage_combinations (weight 5), which handles per-cell
   * positional analysis when there are multiple multisets.
   */
  private applyCageLockedAcrossCages(): boolean {
    const ordered = [...this.cages].sort((a, b) => a.combinations.length - b.combinations.length);
    for (const cage of ordered) {
      if (cage.cells.every(({ row, col }) => this.grid[row][col] !== 0)) continue;
      const filtered = this.survivingCombos(cage);
      if (filtered.length === 0) continue;

      // Check if every surviving combo is a permutation of the same multiset.
      const firstKey = [...filtered[0]].sort((a, b) => a - b).join(',');
      let oneMultiset = true;
      for (let i = 1; i < filtered.length; i++) {
        const key = [...filtered[i]].sort((a, b) => a - b).join(',');
        if (key !== firstKey) {
          oneMultiset = false;
          break;
        }
      }
      if (!oneMultiset) continue;

      const multiset = new Set(filtered[0]);
      const eliminations: CellRef[] = [];
      for (const cell of cage.cells) {
        if (this.grid[cell.row][cell.col] !== 0) continue;
        const cands = this.candidates[cell.row][cell.col];
        const toRemove: number[] = [];
        for (const v of cands) {
          if (!multiset.has(v)) toRemove.push(v);
        }
        if (toRemove.length > 0) {
          toRemove.forEach(v => cands.delete(v));
          eliminations.push(cell);
        }
      }
      if (eliminations.length === 0) continue;

      const multisetStr = [...multiset].sort((a, b) => a - b).join(', ');
      const cellList = eliminations.map(c => cellLabel(c.row, c.col)).join(', ');
      this.recordStep(
        'cage_locked',
        `Cage locked: the ${cageHeader(cage)} cage must contain exactly {${multisetStr}}, narrowing ${cellList}.`,
        eliminations,
        cage.cells
      );
      return true;
    }
    return false;
  }

  /**
   * Eliminate candidates that are mathematically impossible — values that
   * never appear in any of the cage's combinations regardless of row/column
   * state. A 3÷ cage's cells can never be 4, 5, or 7; a 9× cage's cells can
   * never be 5 or 7. Very cheap and should fire before any state-aware
   * deductions.
   *
   * Stops on first progress so the cheaper cascades can re-run between every
   * elimination. Cages with fewer combinations (= tighter constraints) are
   * processed first.
   */
  private applyCageImpossibleAcrossCages(): boolean {
    const ordered = [...this.cages].sort((a, b) => a.combinations.length - b.combinations.length);
    for (const cage of ordered) {
      if (cage.cells.every(({ row, col }) => this.grid[row][col] !== 0)) continue;
      for (let pos = 0; pos < cage.cells.length; pos++) {
        const cell = cage.cells[pos];
        if (this.grid[cell.row][cell.col] !== 0) continue;
        const everPossible = cage.everPossiblePerPos[pos];
        const cellCandidates = this.candidates[cell.row][cell.col];
        const toRemove: number[] = [];
        for (const v of cellCandidates) {
          if (!everPossible.has(v)) toRemove.push(v);
        }
        if (toRemove.length > 0) {
          toRemove.forEach(v => cellCandidates.delete(v));
          this.recordStep(
            'cage_impossible',
            `Math impossible: ${toRemove.sort((a, b) => a - b).join(', ')} can never appear in the ${cageHeader(cage)} cage at ${cellLabel(cell.row, cell.col)}.`,
            [cell],
            cage.cells.filter(c => c.row !== cell.row || c.col !== cell.col)
          );
          return true;
        }
      }
    }
    return false;
  }

  private runLogicLoop() {
    // "Always do the easiest thing that makes progress, then restart from the
    // top." After every step in a more expensive technique, we go back to the
    // cheapest techniques — a single deduction in one technique can unlock new
    // work in cheaper techniques that should be done first.
    outer: while (true) {
      // Easy techniques are exhaustive cascades; complex techniques stop on
      // first progress so we re-check the cheap ones between every deduction.
      if (this.cascadeEasyTechniques()) continue outer;
      // Math-impossible eliminations are cheap (depend only on the cage's
      // arithmetic, not on row/col state) — fire them before processing
      // cages in depth.
      if (this.applyCageImpossibleAcrossCages()) continue outer;
      // Cage locked: every surviving combo is the same multiset. One
      // deduction narrows all cage cells. Cheaper than per-cell combinations.
      if (this.applyCageLockedAcrossCages()) continue outer;
      if (this.processCagesByStrength()) continue outer;
      if (this.applyMultiCageLineLock()) continue outer;
      if (this.applySummation()) continue outer;
      if (this.applyCrossCageFeasibility()) continue outer;
      break;
    }
  }

  private backtrack(remaining: number): number {
    if (remaining <= 0) return 0;

    // First, push the logic loop as far as we can
    this.runLogicLoop();
    if (this.isComplete()) return this.verifySolution() ? 1 : 0;
    if (!this.isValid()) return 0;

    // MRV: pick the empty cell with the fewest candidates
    let best: { row: number; col: number; n: number } | null = null;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === 0) {
          const n = this.candidates[r][c].size;
          if (best === null || n < best.n) best = { row: r, col: c, n };
        }
      }
    }
    if (best === null) return 0;

    const { row, col } = best;
    const tries = [...this.candidates[row][col]].sort((a, b) => a - b);

    let found = 0;
    for (const value of tries) {
      // Snapshot grid + candidates only — counts and trace steps from this
      // branch are kept on failure so dead-end exploration contributes to
      // difficulty (a deep contradiction is harder than an immediate one).
      const savedGrid = this.snapshotGrid();
      const savedCandidates = this.snapshotCandidates();

      this.place(row, col, value);
      this.recordStep(
        'trial_and_error',
        `Trial and error: trying ${value} at ${cellLabel(row, col)} (${tries.length} options).`,
        [{ row, col }]
      );

      found += this.backtrack(remaining - found);

      if (found >= remaining) {
        // Success — leave state as the solved grid so finalGrid reflects it.
        return found;
      }

      // Failed branch — restore grid + candidates so the next value starts
      // clean. Keep counts/score/steps as-is so the work the solver did
      // while exploring this dead end is reflected in difficulty.
      this.grid = savedGrid;
      this.candidates = savedCandidates;
      this.recordStep(
        'trial_and_error',
        `Trial and error: ${value} at ${cellLabel(row, col)} led to a dead end; backing out.`,
        [{ row, col }]
      );
    }

    return found;
  }
}

// ---------- Helpers ----------

function range1(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push(i);
  return out;
}

function cellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

function cageHeader(cage: CageInfo): string {
  const opSym = cage.operation === '' ? '=' : cage.operation;
  return `${cage.value}${opSym}`;
}

function cageSatisfied(op: string, target: number, values: number[]): boolean {
  if (op === '') return values[0] === target;
  if (op === '+') return values.reduce((a, b) => a + b, 0) === target;
  if (op === '*') return values.reduce((a, b) => a * b, 1) === target;
  if (op === '-') return Math.abs(values[0] - values[1]) === target;
  if (op === '/') {
    const [a, b] = values;
    return (b !== 0 && a === b * target) || (a !== 0 && b === a * target);
  }
  return false;
}

/**
 * Enumerate every valid combination of values for this cage, ordered to match
 * the cage.cells array positionally.
 *
 * Honors the row/column uniqueness constraint of the puzzle: any two cells in
 * the cage that share a row or column must hold different values. E.g. a
 * 3-in-a-row cage of 28× cannot be (2, 2, 7); an L-shaped 28× cage may use 2
 * twice only if those two 2s sit in different rows AND different columns.
 */
function precomputeCageCombinations(
  cage: PuzzleDefinition['cages'][number],
  size: number
): number[][] {
  const n = cage.cells.length;
  const target = cage.value;
  const op = cage.operation;

  // Build the list of cage-internal cell-pair conflicts (same row or column).
  // Any such pair must end up with different values in any valid combo.
  const coords = cage.cells.map(idx => ({ row: Math.floor(idx / size), col: idx % size }));
  const conflicts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (coords[i].row === coords[j].row || coords[i].col === coords[j].col) {
        conflicts.push([i, j]);
      }
    }
  }
  const violatesUniqueness = (combo: number[]) => {
    for (const [i, j] of conflicts) if (combo[i] === combo[j]) return true;
    return false;
  };

  const result = new Set<string>();
  const add = (combo: number[]) => {
    if (!violatesUniqueness(combo)) result.add(combo.join(','));
  };

  if (op === '' || n === 1) {
    add([target]);
  } else if (op === '+') {
    enumerateWithReplacement(size, n, combo => {
      if (combo.reduce((a, b) => a + b, 0) === target) {
        for (const perm of permutations(combo)) add(perm);
      }
    });
  } else if (op === '*') {
    enumerateWithReplacement(size, n, combo => {
      let p = 1;
      for (const v of combo) p *= v;
      if (p === target) {
        for (const perm of permutations(combo)) add(perm);
      }
    });
  } else if (op === '-') {
    for (let a = 1; a <= size; a++) {
      for (let b = 1; b <= size; b++) {
        if (Math.abs(a - b) === target) add([a, b]);
      }
    }
  } else if (op === '/') {
    for (let a = 1; a <= size; a++) {
      for (let b = 1; b <= size; b++) {
        if ((b !== 0 && a === b * target) || (a !== 0 && b === a * target)) {
          add([a, b]);
        }
      }
    }
  }

  return [...result].map(s => s.split(',').map(Number));
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function combinationsOfRange(n: number, k: number): number[][] {
  const out: number[][] = [];
  const combo: number[] = [];
  const recurse = (start: number) => {
    if (combo.length === k) {
      out.push(combo.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      recurse(i + 1);
      combo.pop();
    }
  };
  recurse(0);
  return out;
}

function enumerateWithReplacement(size: number, k: number, cb: (combo: number[]) => void) {
  const combo: number[] = [];
  const recurse = (start: number) => {
    if (combo.length === k) {
      cb(combo);
      return;
    }
    for (let v = start; v <= size; v++) {
      combo.push(v);
      recurse(v);
      combo.pop();
    }
  };
  recurse(1);
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const perm of permutations(rest)) {
      const result = [arr[i], ...perm];
      const key = result.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(result);
      }
    }
  }
  return out;
}

// ---------- Public entry point ----------

export function solveWithTrace(
  puzzle: PuzzleDefinition,
  startGridOrOptions?: number[][] | SolveOptions
): SolverResult {
  // Backwards-compat: a bare number[][] is the old `startGrid` arg.
  const options: SolveOptions = Array.isArray(startGridOrOptions)
    ? { startGrid: startGridOrOptions }
    : (startGridOrOptions ?? {});
  const solver = new Solver(puzzle, options);
  return solver.solve();
}
