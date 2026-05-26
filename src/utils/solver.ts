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
  | 'naked_single'
  | 'hidden_single'
  | 'cage_single'
  | 'cage_intersection'
  | 'cage_combinations'
  | 'multi_cage_line_lock'
  | 'cross_cage_feasibility'
  | 'trial_and_error';

export const TECHNIQUE_WEIGHTS: Record<TechniqueId, number> = {
  naked_single: 1,
  hidden_single: 2,
  cage_single: 3,
  cage_intersection: 4,
  cage_combinations: 5,
  multi_cage_line_lock: 8,
  cross_cage_feasibility: 10,
  trial_and_error: 15,
};

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  naked_single: 'Naked single',
  hidden_single: 'Hidden single',
  cage_single: 'Cage single',
  cage_intersection: 'Cage intersection',
  cage_combinations: 'Cage combinations',
  multi_cage_line_lock: 'Multi-cage lock',
  cross_cage_feasibility: 'Cross-cage feasibility',
  trial_and_error: 'Trial and error',
};

export type CellRef = { row: number; col: number };

export type SolverStep = {
  technique: TechniqueId;
  description: string;
  // Cells to visually emphasize on this step
  highlight: CellRef[];
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

// ANCHOR points for log-normalized score, copied from backend/solver.py
const SIZE_ANCHORS: Record<number, [number, number]> = {
  4: [5.5, 7.8],
  5: [6.5, 8.3],
  6: [7.15, 11.0],
  7: [8.0, 16.0],
};

const colLetter = (col: number) => String.fromCharCode('A'.charCodeAt(0) + col);
const cellLabel = (row: number, col: number) => `${colLetter(col)}${row + 1}`;
const cellList = (cells: CellRef[]) => cells.map(c => cellLabel(c.row, c.col)).join(', ');

/**
 * Normalize raw weighted score to 0-100 difficulty score using size-specific anchors.
 * Mirrors SolveStats.difficulty_score in backend/solver.py.
 */
export function normalizeScore(rawScore: number, size: number): number {
  if (rawScore <= 0) return 0;
  const logRaw = Math.log2(Math.max(1, rawScore));
  const [low, high] = SIZE_ANCHORS[size] ?? [6.0, 12.0];
  const score = 10 + ((logRaw - low) / (high - low)) * 80;
  return Math.min(100, Math.max(0, score));
}

export function difficultyLevel(score: number): 'easiest' | 'easy' | 'medium' | 'hard' | 'expert' {
  if (score <= 15) return 'easiest';
  if (score <= 30) return 'easy';
  if (score <= 50) return 'medium';
  if (score <= 70) return 'hard';
  return 'expert';
}

type CageInfo = {
  index: number;
  cells: CellRef[];
  operation: string;
  value: number;
  combinations: number[][]; // each combo aligns positionally with `cells`
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

  constructor(puzzle: PuzzleDefinition, startGrid?: number[][]) {
    this.size = puzzle.size;
    this.steps = [];
    this.counts = {
      naked_single: 0,
      hidden_single: 0,
      cage_single: 0,
      cage_intersection: 0,
      cage_combinations: 0,
      multi_cage_line_lock: 0,
      cross_cage_feasibility: 0,
      trial_and_error: 0,
    };
    this.rawScore = 0;

    // Build cages with cell coords and precomputed combinations
    this.cages = puzzle.cages.map((cage, index) => ({
      index,
      cells: cage.cells.map(idx => ({
        row: Math.floor(idx / this.size),
        col: idx % this.size,
      })),
      operation: cage.operation,
      value: cage.value,
      combinations: precomputeCageCombinations(cage, this.size),
    }));

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

    // Initialize candidates from grid state
    this.candidates = [];
    for (let r = 0; r < this.size; r++) {
      const row: Set<number>[] = [];
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] !== 0) {
          row.push(new Set());
        } else {
          row.push(new Set(range1(this.size)));
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
    highlight: CellRef[]
  ) {
    const delta = TECHNIQUE_WEIGHTS[technique];
    this.rawScore += delta;
    this.counts[technique] += 1;
    this.steps.push({
      technique,
      description,
      highlight,
      grid: this.snapshotGrid(),
      candidates: this.snapshotCandidates(),
      scoreDelta: delta,
      cumulativeScore: this.rawScore,
      cumulativeCounts: { ...this.counts },
    });

    // Whenever a deduction narrows a cell down to a single candidate, the
    // naked single should fire immediately as the next step (rather than
    // waiting for the next iteration of the logic loop). We skip the cascade
    // for naked_single itself to avoid recursion — applyNakedSingles already
    // sweeps all cells in one pass and will be re-driven by cascadeNakedSingles
    // on the next caller's recordStep.
    if (technique !== 'naked_single') {
      this.cascadeNakedSingles();
    }
  }

  private cascadeNakedSingles() {
    // Loop until stable — each placement can cascade row/col eliminations that
    // create more naked singles elsewhere.
    while (this.applyNakedSingles()) {
      /* keep going */
    }
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
        for (let c = 0; c < this.size; c++) if (this.grid[r][c] === num) { alreadyPlaced = true; break; }
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
        for (let r = 0; r < this.size; r++) if (this.grid[r][c] === num) { alreadyPlaced = true; break; }
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
    let progress = false;
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
                const where = orientation === 'row' ? `row ${line + 1}` : `column ${colLetter(line)}`;
                const cellList = eliminations.map(e => cellLabel(e.row, e.col)).join(', ');
                this.recordStep(
                  'multi_cage_line_lock',
                  `Multi-cage lock in ${where}: the ${cageHeader(A.cage)} and ${cageHeader(B.cage)} cages together must contain ${v}, eliminating ${v} from ${cellList}.`,
                  eliminations
                );
                progress = true;
              }
            }
          }
        }
      }
    }
    return progress;
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
  private applyCrossCageFeasibility(): boolean {
    let progress = false;
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

      // Translate the narrowed combo set into candidate eliminations on cageA's cells
      cageA.cells.forEach((cell, pos) => {
        if (this.grid[cell.row][cell.col] !== 0) return;
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
            [cell]
          );
          progress = true;
        }
      });
    }

    return progress;
  }

  private applyCageConstraints(): boolean {
    let progress = false;

    for (const cage of this.cages) {
      const emptyCells = cage.cells.filter(({ row, col }) => this.grid[row][col] === 0);
      if (emptyCells.length === 0) continue;

      // Filter combos by placed values and current candidates
      const placed: Array<{ pos: number; value: number }> = [];
      cage.cells.forEach((cell, pos) => {
        if (this.grid[cell.row][cell.col] !== 0) {
          placed.push({ pos, value: this.grid[cell.row][cell.col] });
        }
      });

      const placedPositions = new Set(placed.map(p => p.pos));
      const filtered = cage.combinations.filter(combo => {
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

      if (filtered.length === 0) continue; // dead branch; backtracker handles

      // For each empty cell, see what values are still possible across surviving combos
      cage.cells.forEach((cell, pos) => {
        if (this.grid[cell.row][cell.col] !== 0) return;
        const possibleValues = new Set<number>();
        for (const combo of filtered) possibleValues.add(combo[pos]);

        if (possibleValues.size === 1) {
          const value = [...possibleValues][0];
          if (this.candidates[cell.row][cell.col].has(value)) {
            this.place(cell.row, cell.col, value);
            this.recordStep(
              'cage_single',
              `Cage single at ${cellLabel(cell.row, cell.col)}: the ${cageHeader(cage)} cage forces ${value}.`,
              [{ row: cell.row, col: cell.col }]
            );
            progress = true;
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
              [{ row: cell.row, col: cell.col }]
            );
            progress = true;
          }
        }
      });
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
    // First: drop in every stipulated value (single-cell cages like "4="). These
    // are part of the puzzle definition and should always be placed before any
    // deductive reasoning starts.
    this.placeStipulatedCages();

    // Intersection runs before general cage filtering — line cages like a
    // vertical 6- expose immediate column-wide eliminations that should be
    // visible up front, before we start eliminating non-viable values from
    // within the cage cells themselves.
    this.applyCageIntersection();

    // Initial cage-constraint pass to prune candidates
    this.applyCageConstraints();

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
      rawScore: this.rawScore,
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
        'cage_single',
        `Stipulated: ${cellLabel(row, col)} must be ${cage.value} (single-cell cage).`,
        [{ row, col }]
      );
    }
  }

  private runLogicLoop() {
    while (true) {
      let progress = false;
      if (this.applyNakedSingles()) progress = true;
      if (this.applyHiddenSingles()) progress = true;
      // Intersection runs before general cage filtering — it produces stronger
      // deductions and tightens candidates that the next applyCageConstraints
      // pass can then use.
      if (this.applyCageIntersection()) progress = true;
      if (this.applyMultiCageLineLock()) progress = true;
      if (this.applyCageConstraints()) progress = true;
      // Cross-cage feasibility is the most expensive — only attempted when
      // simpler techniques have stalled.
      if (!progress) {
        if (this.applyCrossCageFeasibility()) progress = true;
      }
      if (!progress) break;
      if (!this.isValid()) return;
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
      // Snapshot state before trying — only needed if this branch fails
      const savedGrid = this.snapshotGrid();
      const savedCandidates = this.snapshotCandidates();
      const savedSteps = this.steps.length;
      const savedCounts = { ...this.counts };
      const savedRaw = this.rawScore;

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

      // Failed branch: restore grid + candidates (the next iteration starts fresh).
      // Truncate steps & restore counts so dead-end exploration doesn't pollute
      // the trace or inflate the score.
      this.grid = savedGrid;
      this.candidates = savedCandidates;
      this.steps.length = savedSteps;
      this.counts = savedCounts;
      this.rawScore = savedRaw;
      // Charge the cost of the guess itself (the user had to consider it),
      // recorded as a single trial_and_error step describing the dead end.
      this.counts.trial_and_error += 1;
      this.rawScore += TECHNIQUE_WEIGHTS.trial_and_error;
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

function enumerateWithReplacement(
  size: number,
  k: number,
  cb: (combo: number[]) => void
) {
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
  startGrid?: number[][]
): SolverResult {
  const solver = new Solver(puzzle, startGrid);
  return solver.solve();
}
