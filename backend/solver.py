"""
Technique-based Arithmatrix solver.

Mirrors `src/utils/solver.ts` so the puzzle generator can rate difficulty
using the same model the UI playback uses. The techniques and their weights
match the TS implementation exactly.

Solving techniques (cheapest to most expensive):
  stipulated              0   single-cell cage → place its value
  naked_single            1   only one candidate at a cell → place
  cage_impossible         2   value never appears in any of a cage's combos
  hidden_single           2   row/col has only one cell that can take a value
  cage_single             3   cage filter forces a specific value at a cell
  cage_locked             3   every surviving combo of a cage is the same multiset
  cage_intersection       4   value v guaranteed in this cage's row/col → eliminate elsewhere
  cage_combinations       5   per-cell positional narrowing within a cage
  multi_cage_line_lock    8   joint analysis of two cages sharing a row/col
  cross_cage_feasibility  10  combo eliminated because it would break another cage
  trial_and_error         15  fallback backtracking

The score is a weighted sum of technique applications, log-compressed and
linearly mapped to 0-100 via size-specific anchors. Difficulty buckets:
  ≤15 easiest, ≤30 easy, ≤50 medium, ≤70 hard, >70 expert.
"""

import math
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Dict, List, Optional, Set, Tuple
import itertools


class Technique(IntEnum):
    """All solving techniques, in approximate difficulty order."""
    STIPULATED = 0
    NAKED_SINGLE = 1
    CAGE_IMPOSSIBLE = 2
    HIDDEN_SINGLE = 3
    CAGE_SINGLE = 4
    CAGE_LOCKED = 5
    CAGE_INTERSECTION = 6
    CAGE_COMBINATIONS = 7
    MULTI_CAGE_LINE_LOCK = 8
    SUMMATION = 9
    CROSS_CAGE_FEASIBILITY = 10
    TRIAL_AND_ERROR = 11


TECHNIQUE_WEIGHTS: Dict[Technique, int] = {
    Technique.STIPULATED: 0,
    Technique.NAKED_SINGLE: 1,
    Technique.CAGE_IMPOSSIBLE: 2,
    Technique.HIDDEN_SINGLE: 2,
    Technique.CAGE_SINGLE: 3,
    Technique.CAGE_LOCKED: 3,
    Technique.CAGE_INTERSECTION: 4,
    Technique.CAGE_COMBINATIONS: 5,
    Technique.MULTI_CAGE_LINE_LOCK: 8,
    Technique.SUMMATION: 9,
    Technique.CROSS_CAGE_FEASIBILITY: 10,
    Technique.TRIAL_AND_ERROR: 15,
}

# Techniques a human experiences as genuine bottlenecks (weight >= 8). These
# drive the difficulty score at full weight; everything cheaper is volume-
# compressed (see SolveStats.raw_score).
def _interp(x: float, x0: float, x1: float, y0: float, y1: float) -> float:
    """Linear interpolation of x in [x0,x1] onto [y0,y1]."""
    if x1 <= x0:
        return y0
    return y0 + (x - x0) / (x1 - x0) * (y1 - y0)


_HARD_TECHNIQUES = frozenset({
    Technique.MULTI_CAGE_LINE_LOCK,
    Technique.SUMMATION,
    Technique.CROSS_CAGE_FEASIBILITY,
    Technique.TRIAL_AND_ERROR,
})

# Per-size raw-score quantile boundaries (q20, q40, q60, q80) that define the
# five difficulty tiers directly: easiest = bottom 20%, easy = 20-40%,
# medium = 40-60%, hard = 60-80%, expert = top 20%. Quantile bucketing is used
# (rather than fixed thresholds on a normalized score) because the bottleneck
# raw_score is bimodal — puzzles either flow with no hard techniques or hit
# walls that need them — so fixed thresholds leave "medium" nearly empty.
# Recompute with scripts/calibrate-quantiles.py after any weight change.
SIZE_QUANTILES: Dict[int, Tuple[float, float, float, float]] = {
    4: (5.9, 7.8, 21.7, 36.8),
    5: (7.9, 8.7, 19.1, 33.0),
    6: (25.1, 40.0, 59.2, 109.6),
    7: (14.0, 29.6, 82.1, 205.8),
}


@dataclass
class SolveStats:
    """Statistics from solving a puzzle."""
    techniques_used: Dict[Technique, int] = field(default_factory=dict)
    solution_count: int = 0
    is_valid: bool = False
    size: int = 0

    def record(self, technique: Technique):
        self.techniques_used[technique] = self.techniques_used.get(technique, 0) + 1

    @property
    def max_technique(self) -> Optional[Technique]:
        if not self.techniques_used:
            return None
        return max(self.techniques_used.keys())

    @property
    def raw_score(self) -> float:
        """Bottleneck-aware difficulty magnitude.

        Human-felt difficulty tracks the BOTTLENECKS (how often you need the
        hard techniques), not the total volume of deductions. A puzzle that
        "unzips" into a long cascade of cheap deductions (e.g. 93 naked
        singles) plays easy despite a huge raw count.

        So: hard techniques (weight >= 8 — multi-cage line lock, summation,
        cross-cage feasibility, trial-and-error) count at full weight, while
        the cheaper bulk is square-root compressed so its volume can't
        dominate. See the difficulty-volume-vs-bottleneck validation note.
        """
        hard = 0
        cheap = 0
        for t, c in self.techniques_used.items():
            contribution = TECHNIQUE_WEIGHTS.get(t, 0) * c
            if t in _HARD_TECHNIQUES:
                hard += contribution
            else:
                cheap += contribution
        return hard + math.sqrt(cheap)

    @property
    def difficulty_score(self) -> float:
        """0–100 display score (matches src/utils/solver.ts).

        Piecewise-linear interpolation of raw_score through the per-size
        quantile boundaries, so the tier cutoffs land at exactly 20/40/60/80.
        Below q20 maps into [0,20]; above q80 extrapolates from the q60→q80
        slope toward 100.
        """
        raw = self.raw_score
        q = SIZE_QUANTILES.get(self.size, SIZE_QUANTILES[7])
        q20, q40, q60, q80 = q
        # Control points: (raw, score). Anchor 0→0; quantiles→20/40/60/80.
        if raw <= 0:
            return 0.0
        if raw < q20:
            return _interp(raw, 0, q20, 0, 20)
        if raw < q40:
            return _interp(raw, q20, q40, 20, 40)
        if raw < q60:
            return _interp(raw, q40, q60, 40, 60)
        if raw < q80:
            return _interp(raw, q60, q80, 60, 80)
        # Beyond q80: extrapolate using the q60→q80 slope, clamp to 100.
        span = max(1e-9, q80 - q60)
        score = 80 + (raw - q80) / span * 20
        return min(100.0, score)

    @property
    def difficulty_level(self) -> str:
        raw = self.raw_score
        q20, q40, q60, q80 = SIZE_QUANTILES.get(self.size, SIZE_QUANTILES[7])
        if raw < q20:
            return "easiest"
        if raw < q40:
            return "easy"
        if raw < q60:
            return "medium"
        if raw < q80:
            return "hard"
        return "expert"


# --------------------------------------------------------------------------- #
# Cage data structures                                                        #
# --------------------------------------------------------------------------- #


def _precompute_combinations(cage: dict, size: int) -> List[Tuple[int, ...]]:
    """Enumerate all valid value tuples for this cage.

    Respects the row/column uniqueness constraint: any two cells in the cage
    that share a row or column must hold different values. So a 3-in-a-row
    28× cage cannot use (2, 2, 7); an L-shaped 28× cage can use the (6, 7, 6)
    combo only if the two 6s sit in non-shared rows AND non-shared columns.
    """
    n_cells = len(cage["cells"])
    op = cage["operation"]
    target = cage["value"]

    coords = [(c // size, c % size) for c in cage["cells"]]
    conflicts: List[Tuple[int, int]] = []
    for i in range(n_cells):
        for j in range(i + 1, n_cells):
            if coords[i][0] == coords[j][0] or coords[i][1] == coords[j][1]:
                conflicts.append((i, j))

    def violates_uniqueness(combo: Tuple[int, ...]) -> bool:
        return any(combo[i] == combo[j] for i, j in conflicts)

    results: Set[Tuple[int, ...]] = set()

    if op == "" or n_cells == 1:
        results.add((target,))
    elif op == "+":
        for base in itertools.combinations_with_replacement(range(1, size + 1), n_cells):
            if sum(base) == target:
                for perm in set(itertools.permutations(base)):
                    if not violates_uniqueness(perm):
                        results.add(perm)
    elif op == "*":
        for base in itertools.combinations_with_replacement(range(1, size + 1), n_cells):
            p = 1
            for v in base:
                p *= v
            if p == target:
                for perm in set(itertools.permutations(base)):
                    if not violates_uniqueness(perm):
                        results.add(perm)
    elif op == "-":
        for a in range(1, size + 1):
            for b in range(1, size + 1):
                if abs(a - b) == target:
                    combo = (a, b)
                    if not violates_uniqueness(combo):
                        results.add(combo)
    elif op in ("/", "÷"):
        for a in range(1, size + 1):
            for b in range(1, size + 1):
                if (b != 0 and a == b * target) or (a != 0 and b == a * target):
                    combo = (a, b)
                    if not violates_uniqueness(combo):
                        results.add(combo)

    return list(results)


# --------------------------------------------------------------------------- #
# Solver                                                                      #
# --------------------------------------------------------------------------- #


class ArithmatrixSolver:
    """Technique-based solver matching src/utils/solver.ts."""

    def __init__(self, puzzle: dict):
        self.puzzle: dict = puzzle
        self.size: int = puzzle["size"]
        self.cages: List[dict] = puzzle["cages"]

        # Cage cells as (row, col)
        self.cage_cells: List[List[Tuple[int, int]]] = [
            [(c // self.size, c % self.size) for c in cage["cells"]] for cage in self.cages
        ]
        # Precomputed combinations per cage (with uniqueness filter applied)
        self.cage_combos: List[List[Tuple[int, ...]]] = [
            _precompute_combinations(cage, self.size) for cage in self.cages
        ]
        # Ever-possible value sets per cell position within each cage —
        # the union of combo[pos] across all combos. Independent of state,
        # so used by cage_impossible to identify candidates that never
        # appear no matter what.
        self.cage_ever_possible: List[List[Set[int]]] = []
        for combos in self.cage_combos:
            if combos:
                per_pos = [set() for _ in range(len(combos[0]))]
                for combo in combos:
                    for pos, v in enumerate(combo):
                        per_pos[pos].add(v)
                self.cage_ever_possible.append(per_pos)
            else:
                self.cage_ever_possible.append([])

        self.grid: List[List[int]] = [[0] * self.size for _ in range(self.size)]
        self.candidates: List[List[Set[int]]] = [
            [set(range(1, self.size + 1)) for _ in range(self.size)] for _ in range(self.size)
        ]

        self.stats = SolveStats(size=self.size)

    # ----- core helpers ---------------------------------------------------- #

    def _record(self, technique: Technique):
        """Record a technique application. For non-easy techniques, also cascade
        naked + hidden singles so cheaper deductions fire immediately."""
        self.stats.record(technique)
        if technique not in (Technique.NAKED_SINGLE, Technique.HIDDEN_SINGLE):
            self._cascade_easy_techniques()

    def _cascade_easy_techniques(self) -> bool:
        """Repeat naked + hidden singles until neither finds anything."""
        any_progress = False
        while True:
            progress = False
            if self._apply_naked_singles():
                progress = True
            if self._apply_hidden_singles():
                progress = True
            if not progress:
                return any_progress
            any_progress = True

    def _eliminate_from_row_col(self, row: int, col: int, value: int):
        for i in range(self.size):
            self.candidates[row][i].discard(value)
            self.candidates[i][col].discard(value)

    def _place(self, row: int, col: int, value: int):
        self.grid[row][col] = value
        self.candidates[row][col] = set()
        self._eliminate_from_row_col(row, col, value)

    def _surviving_combos(self, cage_idx: int) -> List[Tuple[int, ...]]:
        cells = self.cage_cells[cage_idx]
        placed: List[Tuple[int, int]] = []  # (pos, value)
        for pos, (r, c) in enumerate(cells):
            if self.grid[r][c] != 0:
                placed.append((pos, self.grid[r][c]))
        placed_positions = {p for p, _ in placed}

        out: List[Tuple[int, ...]] = []
        for combo in self.cage_combos[cage_idx]:
            if any(combo[p] != v for p, v in placed):
                continue
            ok = True
            for pos in range(len(cells)):
                if pos in placed_positions:
                    continue
                r, c = cells[pos]
                if combo[pos] not in self.candidates[r][c]:
                    ok = False
                    break
            if ok:
                out.append(combo)
        return out

    # ----- techniques ------------------------------------------------------ #

    def _apply_naked_singles(self) -> bool:
        progress = False
        for r in range(self.size):
            for c in range(self.size):
                if self.grid[r][c] == 0 and len(self.candidates[r][c]) == 1:
                    v = next(iter(self.candidates[r][c]))
                    self._place(r, c, v)
                    self._record(Technique.NAKED_SINGLE)
                    progress = True
        return progress

    def _apply_hidden_singles(self) -> bool:
        # Rows
        for r in range(self.size):
            for num in range(1, self.size + 1):
                if any(self.grid[r][c] == num for c in range(self.size)):
                    continue
                possible = [c for c in range(self.size)
                            if self.grid[r][c] == 0 and num in self.candidates[r][c]]
                if len(possible) == 1:
                    c = possible[0]
                    self._place(r, c, num)
                    self._record(Technique.HIDDEN_SINGLE)
                    return True  # stop on first progress; outer loop will re-run
        # Columns
        for c in range(self.size):
            for num in range(1, self.size + 1):
                if any(self.grid[r][c] == num for r in range(self.size)):
                    continue
                possible = [r for r in range(self.size)
                            if self.grid[r][c] == 0 and num in self.candidates[r][c]]
                if len(possible) == 1:
                    r = possible[0]
                    self._place(r, c, num)
                    self._record(Technique.HIDDEN_SINGLE)
                    return True
        return False

    def _place_stipulated_cages(self):
        for idx, cage in enumerate(self.cages):
            if len(cage["cells"]) != 1:
                continue
            r, c = self.cage_cells[idx][0]
            if self.grid[r][c] != 0:
                continue
            self._place(r, c, cage["value"])
            self._record(Technique.STIPULATED)

    def _apply_cage_impossible(self) -> bool:
        """Remove candidates that don't appear in ANY combo of their cage."""
        ordered = sorted(range(len(self.cages)),
                         key=lambda i: len(self.cage_combos[i]))
        for idx in ordered:
            cells = self.cage_cells[idx]
            ever = self.cage_ever_possible[idx]
            if not ever:
                continue
            for pos, (r, c) in enumerate(cells):
                if self.grid[r][c] != 0:
                    continue
                allowed = ever[pos]
                to_remove = [v for v in self.candidates[r][c] if v not in allowed]
                if to_remove:
                    for v in to_remove:
                        self.candidates[r][c].discard(v)
                    self._record(Technique.CAGE_IMPOSSIBLE)
                    return True
        return False

    def _apply_cage_locked(self) -> bool:
        """When every surviving combo of a cage is the SAME multiset, narrow
        each cell of the cage to those values in one deduction."""
        ordered = sorted(range(len(self.cages)),
                         key=lambda i: len(self.cage_combos[i]))
        for idx in ordered:
            cells = self.cage_cells[idx]
            if all(self.grid[r][c] != 0 for r, c in cells):
                continue
            combos = self._surviving_combos(idx)
            if not combos:
                continue
            first_sorted = tuple(sorted(combos[0]))
            if any(tuple(sorted(c)) != first_sorted for c in combos[1:]):
                continue
            multiset = set(combos[0])
            removed_any = False
            for r, c in cells:
                if self.grid[r][c] != 0:
                    continue
                to_remove = [v for v in self.candidates[r][c] if v not in multiset]
                if to_remove:
                    for v in to_remove:
                        self.candidates[r][c].discard(v)
                    removed_any = True
            if removed_any:
                self._record(Technique.CAGE_LOCKED)
                return True
        return False

    def _narrow_cage(self, idx: int) -> bool:
        cells = self.cage_cells[idx]
        if all(self.grid[r][c] != 0 for r, c in cells):
            return False
        combos = self._surviving_combos(idx)
        if not combos:
            return False
        for pos, (r, c) in enumerate(cells):
            if self.grid[r][c] != 0:
                continue
            possible = {combo[pos] for combo in combos}
            if len(possible) == 1:
                v = next(iter(possible))
                if v in self.candidates[r][c]:
                    self._place(r, c, v)
                    self._record(Technique.CAGE_SINGLE)
                    return True
            else:
                to_remove = [v for v in self.candidates[r][c] if v not in possible]
                if to_remove:
                    for v in to_remove:
                        self.candidates[r][c].discard(v)
                    self._record(Technique.CAGE_COMBINATIONS)
                    return True
        return False

    def _intersect_cage(self, idx: int) -> bool:
        cells = self.cage_cells[idx]
        if all(self.grid[r][c] != 0 for r, c in cells):
            return False
        combos = self._surviving_combos(idx)
        if not combos:
            return False
        rows = {r for r, _ in cells}
        cols = {c for _, c in cells}
        for v in range(1, self.size + 1):
            for line_row in rows:
                min_count = min(
                    sum(1 for pos, (r, _) in enumerate(cells) if r == line_row and combo[pos] == v)
                    for combo in combos
                )
                if min_count < 1:
                    continue
                in_cage = {(r, c) for r, c in cells if r == line_row}
                eliminated = False
                for c in range(self.size):
                    if (line_row, c) in in_cage:
                        continue
                    if self.grid[line_row][c] == 0 and v in self.candidates[line_row][c]:
                        self.candidates[line_row][c].discard(v)
                        eliminated = True
                if eliminated:
                    self._record(Technique.CAGE_INTERSECTION)
                    return True
            for line_col in cols:
                min_count = min(
                    sum(1 for pos, (_, c) in enumerate(cells) if c == line_col and combo[pos] == v)
                    for combo in combos
                )
                if min_count < 1:
                    continue
                in_cage = {(r, c) for r, c in cells if c == line_col}
                eliminated = False
                for r in range(self.size):
                    if (r, line_col) in in_cage:
                        continue
                    if self.grid[r][line_col] == 0 and v in self.candidates[r][line_col]:
                        self.candidates[r][line_col].discard(v)
                        eliminated = True
                if eliminated:
                    self._record(Technique.CAGE_INTERSECTION)
                    return True
        return False

    def _process_cages_by_strength(self) -> bool:
        """For each cage (sorted by fewest combos first), do narrow + intersect.
        Stops on first cage that makes progress so cheaper techniques re-run."""
        ordered = sorted(range(len(self.cages)),
                         key=lambda i: len(self.cage_combos[i]))
        for idx in ordered:
            if self._narrow_cage(idx):
                return True
            if self._intersect_cage(idx):
                return True
        return False

    def _apply_multi_cage_line_lock(self) -> bool:
        """Joint analysis of pairs of cages sharing a row or column."""
        MAX_JOINT_COMBOS = 2000
        for orientation in ("row", "col"):
            for line in range(self.size):
                pieces: List[Tuple[int, List[int]]] = []  # (cage_idx, line_positions)
                for idx, cells in enumerate(self.cage_cells):
                    line_positions = [
                        pos for pos, (r, c) in enumerate(cells)
                        if (r if orientation == "row" else c) == line
                    ]
                    if line_positions:
                        pieces.append((idx, line_positions))
                if len(pieces) < 2:
                    continue
                line_cells = [
                    (line, i) if orientation == "row" else (i, line)
                    for i in range(self.size)
                ]
                for a_i in range(len(pieces)):
                    for b_i in range(a_i + 1, len(pieces)):
                        idx_a, pos_a = pieces[a_i]
                        idx_b, pos_b = pieces[b_i]
                        combos_a = self._surviving_combos(idx_a)
                        combos_b = self._surviving_combos(idx_b)
                        if not combos_a or not combos_b:
                            continue
                        if len(combos_a) * len(combos_b) > MAX_JOINT_COMBOS:
                            continue
                        cells_a = [self.cage_cells[idx_a][p] for p in pos_a]
                        cells_b = [self.cage_cells[idx_b][p] for p in pos_b]
                        joint = set(cells_a) | set(cells_b)
                        joint_sets: List[List[int]] = []
                        for ca in combos_a:
                            vals_a = [ca[p] for p in pos_a]
                            for cb in combos_b:
                                vals_b = [cb[p] for p in pos_b]
                                all_vals = vals_a + vals_b
                                if len(set(all_vals)) != len(all_vals):
                                    continue
                                joint_sets.append(all_vals)
                        if not joint_sets:
                            continue
                        for v in range(1, self.size + 1):
                            min_count = min(s.count(v) for s in joint_sets)
                            if min_count < 1:
                                continue
                            eliminated = False
                            for cell in line_cells:
                                if cell in joint:
                                    continue
                                r, c = cell
                                if self.grid[r][c] == 0 and v in self.candidates[r][c]:
                                    self.candidates[r][c].discard(v)
                                    eliminated = True
                            if eliminated:
                                self._record(Technique.MULTI_CAGE_LINE_LOCK)
                                return True
        return False

    def _cage_known_subset_sum(self, cage_idx: int, subset: frozenset, orientation: str) -> Optional[int]:
        """How much does this cage contribute to cells whose row (or col) is
        in `subset`? Returns None if undeterminable from current state.

        Three cases the contribution can be derived:
          - all in-subset cells already placed → sum them directly
          - cage's total sum is known (addition/stipulated, or cage-locked
            with one multiset) AND
              - cage fully in subset → contribution = cage total
              - cage partially in subset BUT every out-of-subset cell already
                placed → contribution = cage total − sum(placed out cells)
        """
        cage = self.cages[cage_idx]
        cells = self.cage_cells[cage_idx]

        def in_sub(rc):
            return (rc[0] in subset) if orientation == "row" else (rc[1] in subset)

        cells_in = [pos for pos, rc in enumerate(cells) if in_sub(rc)]
        if not cells_in:
            return None
        cells_out = [pos for pos in range(len(cells)) if pos not in cells_in]

        if all(self.grid[cells[p][0]][cells[p][1]] != 0 for p in cells_in):
            return sum(self.grid[cells[p][0]][cells[p][1]] for p in cells_in)

        op = cage["operation"]
        if op == "" or op == "+":
            cage_total: Optional[int] = cage["value"]
        else:
            survivors = self._surviving_combos(cage_idx)
            if not survivors:
                return None
            sums = {sum(combo) for combo in survivors}
            cage_total = sums.pop() if len(sums) == 1 else None
        if cage_total is None:
            return None

        if not cells_out:
            return cage_total

        if not all(self.grid[cells[p][0]][cells[p][1]] != 0 for p in cells_out):
            return None
        out_sum = sum(self.grid[cells[p][0]][cells[p][1]] for p in cells_out)
        return cage_total - out_sum

    def _apply_summation(self) -> bool:
        """Innie/outie technique extended to multi-line subsets.

        Each row (or column) must sum to T₁ = size·(size+1)/2 = 28 at size 7.
        For any subset S of K rows, the cells in those rows must sum to K·T₁.

        For each subset S of size 1, 2, or 3:
          - compute known_sum = Σ cage contributions to cells in S
          - find cells in S not covered by any contributing cage
          - residual = K·T₁ − known_sum − (already-placed uncovered cells)

        If exactly one empty uncovered cell remains, its value = residual.
        If exactly two remain, narrow their candidates to pairs summing to
        residual.
        """
        per_line_target = self.size * (self.size + 1) // 2

        for orientation in ("row", "col"):
            for subset_size in (1, 2, 3):
                for subset_tuple in itertools.combinations(range(self.size), subset_size):
                    subset = frozenset(subset_tuple)
                    target = subset_size * per_line_target

                    subset_cells = [
                        (r, c) for r in range(self.size) for c in range(self.size)
                        if ((r in subset) if orientation == "row" else (c in subset))
                    ]
                    covered: set = set()
                    known_sum = 0
                    for cage_idx in range(len(self.cages)):
                        contrib = self._cage_known_subset_sum(cage_idx, subset, orientation)
                        if contrib is None:
                            continue
                        known_sum += contrib
                        for rc in self.cage_cells[cage_idx]:
                            if (rc[0] in subset) if orientation == "row" else (rc[1] in subset):
                                covered.add(rc)

                    uncovered = [rc for rc in subset_cells if rc not in covered]
                    placed_uncovered_sum = sum(
                        self.grid[r][c] for r, c in uncovered if self.grid[r][c] != 0
                    )
                    empty_uncovered = [(r, c) for r, c in uncovered if self.grid[r][c] == 0]
                    residual = target - known_sum - placed_uncovered_sum

                    if len(empty_uncovered) == 1:
                        r, c = empty_uncovered[0]
                        v = residual
                        if 1 <= v <= self.size and v in self.candidates[r][c]:
                            self._place(r, c, v)
                            self._record(Technique.SUMMATION)
                            return True

                    elif len(empty_uncovered) == 2:
                        (r1, c1), (r2, c2) = empty_uncovered
                        same_line = (r1 == r2) or (c1 == c2)
                        new1: set = set()
                        new2: set = set()
                        for v in self.candidates[r1][c1]:
                            u = residual - v
                            if u < 1 or u > self.size:
                                continue
                            if u not in self.candidates[r2][c2]:
                                continue
                            if same_line and v == u:
                                continue
                            new1.add(v)
                            new2.add(u)
                        if not new1 or not new2:
                            continue
                        if new1 != self.candidates[r1][c1] or new2 != self.candidates[r2][c2]:
                            self.candidates[r1][c1] = new1
                            self.candidates[r2][c2] = new2
                            self._record(Technique.SUMMATION)
                            return True

        return False

    def _apply_cross_cage_feasibility(self) -> bool:
        """Eliminate a combo if applying it would leave another cage with no
        viable combinations. Expensive — only run when simpler techniques stall."""
        MAX_COMBOS = 200
        for idx_a in range(len(self.cages)):
            cells_a = self.cage_cells[idx_a]
            if all(self.grid[r][c] != 0 for r, c in cells_a):
                continue
            survivors_a = self._surviving_combos(idx_a)
            if len(survivors_a) <= 1 or len(survivors_a) > MAX_COMBOS:
                continue
            cage_a_rowcols = {("r", r) for r, _ in cells_a} | {("c", c) for _, c in cells_a}
            intersecting = [
                idx_b for idx_b in range(len(self.cages))
                if idx_b != idx_a
                and any(("r", r) in cage_a_rowcols or ("c", c) in cage_a_rowcols
                        for r, c in self.cage_cells[idx_b])
            ]
            if not intersecting:
                continue

            feasible: List[Tuple[int, ...]] = []
            for combo_a in survivors_a:
                temp_grid = [row[:] for row in self.grid]
                temp_cands = [[set(s) for s in row] for row in self.candidates]
                for pos, (r, c) in enumerate(cells_a):
                    if temp_grid[r][c] != 0:
                        continue
                    v = combo_a[pos]
                    temp_grid[r][c] = v
                    temp_cands[r][c] = set()
                    for i in range(self.size):
                        temp_cands[r][i].discard(v)
                        temp_cands[i][c].discard(v)
                still_ok = True
                for idx_b in intersecting:
                    cells_b = self.cage_cells[idx_b]
                    placed_b = []
                    for pos, (r, c) in enumerate(cells_b):
                        if temp_grid[r][c] != 0:
                            placed_b.append((pos, temp_grid[r][c]))
                    placed_pos = {p for p, _ in placed_b}
                    has_viable = False
                    for combo_b in self.cage_combos[idx_b]:
                        if any(combo_b[p] != v for p, v in placed_b):
                            continue
                        ok = True
                        for pos in range(len(cells_b)):
                            if pos in placed_pos:
                                continue
                            r, c = cells_b[pos]
                            if combo_b[pos] not in temp_cands[r][c]:
                                ok = False
                                break
                        if ok:
                            has_viable = True
                            break
                    if not has_viable:
                        still_ok = False
                        break
                if still_ok:
                    feasible.append(combo_a)

            if not feasible or len(feasible) == len(survivors_a):
                continue
            for pos, (r, c) in enumerate(cells_a):
                if self.grid[r][c] != 0:
                    continue
                still_possible = {f[pos] for f in feasible}
                to_remove = [v for v in self.candidates[r][c] if v not in still_possible]
                if to_remove:
                    for v in to_remove:
                        self.candidates[r][c].discard(v)
                    self._record(Technique.CROSS_CAGE_FEASIBILITY)
                    return True
        return False

    # ----- driver loop ----------------------------------------------------- #

    def _is_complete(self) -> bool:
        return all(self.grid[r][c] != 0 for r in range(self.size) for c in range(self.size))

    def _is_valid(self) -> bool:
        for r in range(self.size):
            for c in range(self.size):
                if self.grid[r][c] == 0 and len(self.candidates[r][c]) == 0:
                    return False
        return True

    def _verify_solution(self) -> bool:
        for i in range(self.size):
            row_vals = {self.grid[i][j] for j in range(self.size)}
            col_vals = {self.grid[j][i] for j in range(self.size)}
            if row_vals != set(range(1, self.size + 1)):
                return False
            if col_vals != set(range(1, self.size + 1)):
                return False
        for idx, cage in enumerate(self.cages):
            vals = [self.grid[r][c] for r, c in self.cage_cells[idx]]
            op = cage["operation"]
            target = cage["value"]
            if op == "":
                if vals[0] != target:
                    return False
            elif op == "+":
                if sum(vals) != target:
                    return False
            elif op == "*":
                prod = 1
                for v in vals:
                    prod *= v
                if prod != target:
                    return False
            elif op == "-":
                if abs(vals[0] - vals[1]) != target:
                    return False
            elif op in ("/", "÷"):
                a, b = vals
                if not ((b != 0 and a == b * target) or (a != 0 and b == a * target)):
                    return False
        return True

    def _run_logic_loop(self):
        """Easiest-first restart. After any successful technique we go back
        to the top — cheaper techniques re-run before any more expensive one."""
        while True:
            if self._cascade_easy_techniques():
                continue
            if self._apply_cage_impossible():
                continue
            if self._apply_cage_locked():
                continue
            if self._process_cages_by_strength():
                continue
            if self._apply_multi_cage_line_lock():
                continue
            if self._apply_summation():
                continue
            if self._apply_cross_cage_feasibility():
                continue
            break

    def _backtrack(self, remaining: int) -> int:
        if remaining <= 0:
            return 0
        self._run_logic_loop()
        if self._is_complete():
            return 1 if self._verify_solution() else 0
        if not self._is_valid():
            return 0

        # MRV: pick empty cell with fewest candidates
        best: Optional[Tuple[int, int, int]] = None
        for r in range(self.size):
            for c in range(self.size):
                if self.grid[r][c] == 0:
                    n = len(self.candidates[r][c])
                    if best is None or n < best[2]:
                        best = (r, c, n)
        if best is None:
            return 0
        row, col, _ = best
        tries = sorted(self.candidates[row][col])

        found = 0
        for value in tries:
            # Snapshot grid + candidates only — counts from this branch stay
            # on failure so dead-end depth contributes to difficulty.
            saved_grid = [r[:] for r in self.grid]
            saved_cands = [[set(s) for s in r] for r in self.candidates]

            self._place(row, col, value)
            self._record(Technique.TRIAL_AND_ERROR)

            found += self._backtrack(remaining - found)
            if found >= remaining:
                return found

            # Failed branch — restore grid + candidates so the next value
            # starts clean, but keep the technique counts that accumulated
            # during the exploration. Charge one more T&E for the back-out.
            self.grid = saved_grid
            self.candidates = saved_cands
            self.stats.record(Technique.TRIAL_AND_ERROR)
        return found

    def solve(self, verify_uniqueness: bool = True) -> SolveStats:
        """Solve, returning stats.

        `verify_uniqueness` decides whether `solution_count` / `is_valid` mean
        anything. This used to take a `max_solutions` argument defaulting to 1,
        so backtracking returned as soon as it found the *first* solution and
        `is_valid = solution_count == 1` reported "uniquely solvable" having
        only established "solvable at all". Generation accepted puzzles on that
        signal, which is how 45% of the shipped corpus ended up with more than
        one solution. Uniqueness is now answered by `count_solutions`,
        independently of the deduction trace.
        """
        self.stats = SolveStats(size=self.size)
        self.grid = [[0] * self.size for _ in range(self.size)]
        self.candidates = [
            [set(range(1, self.size + 1)) for _ in range(self.size)] for _ in range(self.size)
        ]

        self._place_stipulated_cages()
        self._run_logic_loop()

        # Finish the grid for the trace when deduction alone stalls; one branch
        # only, since the trace should end at the first solution.
        if not self._is_complete() and self._is_valid():
            self._backtrack(1)

        solution_count = count_solutions(self.puzzle, 2) if verify_uniqueness else 0
        self.stats.solution_count = solution_count
        self.stats.is_valid = verify_uniqueness and solution_count == 1
        return self.stats


# --------------------------------------------------------------------------- #
# Convenience API (preserved for callers)                                     #
# --------------------------------------------------------------------------- #


def count_solutions(puzzle: dict, cap: int = 2) -> int:
    """Count a puzzle's solutions, stopping at `cap`.

    Deliberately independent of the traced solver: plain backtracking over
    row/column and cage feasibility, no techniques involved. Uniqueness is what
    makes a puzzle fair, and it should not rest on every deduction in the
    technique set being provably sound. Mirrors countSolutions in
    src/utils/solver.ts.
    """
    size = puzzle["size"]
    cages = puzzle["cages"]
    cage_of = {}
    for cage in cages:
        for cell in cage["cells"]:
            cage_of[cell] = cage

    grid = [[0] * size for _ in range(size)]
    row_mask = [0] * size
    col_mask = [0] * size
    found = 0

    def cage_satisfied(cage) -> bool:
        values = [grid[c // size][c % size] for c in cage["cells"]]
        values = [v for v in values if v]
        complete = len(values) == len(cage["cells"])
        op = cage["operation"]
        target = cage["value"]

        if len(cage["cells"]) == 1 or op in ("=", ""):
            return not complete or values[0] == target
        if op == "+":
            total = sum(values)
            # every remaining cell contributes at least 1
            return total == target if complete else total < target
        if op == "*":
            product = 1
            for v in values:
                product *= v
            return product == target if complete else target % product == 0
        if op == "-":
            return not complete or (len(values) == 2 and abs(values[0] - values[1]) == target)
        if op == "/":
            if not complete:
                return True
            if len(values) != 2:
                return False
            hi, lo = max(values), min(values)
            return lo != 0 and hi == target * lo
        return not complete or values[0] == target

    def recurse(pos: int) -> None:
        nonlocal found
        if found >= cap:
            return
        if pos == size * size:
            found += 1
            return
        row, col = divmod(pos, size)
        cage = cage_of.get(pos)
        for value in range(1, size + 1):
            bit = 1 << value
            if row_mask[row] & bit or col_mask[col] & bit:
                continue
            grid[row][col] = value
            row_mask[row] |= bit
            col_mask[col] |= bit
            if cage is None or cage_satisfied(cage):
                recurse(pos + 1)
            grid[row][col] = 0
            row_mask[row] &= ~bit
            col_mask[col] &= ~bit
            if found >= cap:
                return

    recurse(0)
    return found


def solve_puzzle(puzzle: dict) -> SolveStats:
    return ArithmatrixSolver(puzzle).solve()


def get_difficulty(puzzle: dict) -> Tuple[str, float]:
    stats = solve_puzzle(puzzle)
    return stats.difficulty_level, stats.difficulty_score


def estimate_difficulty_fast(puzzle: dict) -> Tuple[str, float]:
    """Fast heuristic without running the full solver.

    Used by the generator to filter candidate puzzles before paying the cost
    of a full solve. Hand-tuned approximation — should not be relied on as a
    final difficulty rating; that's what `solve_puzzle` is for.
    """
    size = puzzle["size"]
    cages = puzzle["cages"]

    single_cells = sum(1 for c in cages if len(c["cells"]) == 1)
    two_cells = sum(1 for c in cages if len(c["cells"]) == 2)
    large_cells = sum(1 for c in cages if len(c["cells"]) >= 4)

    total_combos = 0
    for cage in cages:
        n_cells = len(cage["cells"])
        op = cage["operation"]
        target = cage["value"]
        if n_cells == 1:
            total_combos += 1
        elif op == "+":
            total_combos += _count_addition_combos(n_cells, target, size)
        elif op == "*":
            total_combos += _count_multiplication_combos(n_cells, target, size)
        elif op == "-":
            total_combos += sum(
                1 for a in range(1, size + 1) for b in range(1, size + 1)
                if abs(a - b) == target
            )
        elif op in ("/", "÷"):
            total_combos += sum(
                1 for a in range(1, size + 1) for b in range(1, size + 1)
                if (b != 0 and a == b * target) or (a != 0 and b == a * target)
            )

    n_cages = max(1, len(cages))
    gimme_ratio = single_cells / n_cages
    constraint_ratio = (single_cells + two_cells) / n_cages
    non_single_cages = max(1, n_cages - single_cells)
    avg_combos = (total_combos - single_cells) / non_single_cages

    base = {4: 40, 5: 50, 6: 60, 7: 70}.get(size, 60)
    score = base - (gimme_ratio * 40)
    score += large_cells * 8
    if avg_combos > 10:
        score += min(15, (avg_combos - 10) * 1.5)
    elif avg_combos < 5:
        score -= (5 - avg_combos) * 3
    if constraint_ratio < 0.5:
        score += 10
    score = max(0.0, min(100.0, score))

    if score <= 15:
        level = "easiest"
    elif score <= 30:
        level = "easy"
    elif score <= 50:
        level = "medium"
    elif score <= 70:
        level = "hard"
    else:
        level = "expert"
    return level, score


def _count_addition_combos(n_cells: int, target: int, size: int) -> int:
    count = 0
    if n_cells <= 3:
        for combo in itertools.combinations_with_replacement(range(1, size + 1), n_cells):
            if sum(combo) == target:
                count += len(set(itertools.permutations(combo)))
    else:
        count = max(1, target // n_cells)
    return count


def _count_multiplication_combos(n_cells: int, target: int, size: int) -> int:
    count = 0
    if n_cells <= 3:
        for combo in itertools.combinations_with_replacement(range(1, size + 1), n_cells):
            p = 1
            for v in combo:
                p *= v
            if p == target:
                count += len(set(itertools.permutations(combo)))
    else:
        count = 3
    return count


if __name__ == "__main__":
    import json
    import sys
    import time

    sys.path.insert(0, ".")
    from arithmatrix import _generate_basic_puzzle
    from latin_square import warm_up_pool

    warm_up_pool()
    print("=== New Python solver smoke test ===\n")

    for size in [4, 5, 6, 7]:
        for diff in ["easiest", "easy", "medium", "hard", "expert"]:
            ok = 0
            times = []
            stats_dist = {"easiest": 0, "easy": 0, "medium": 0, "hard": 0, "expert": 0}
            for _ in range(5):
                try:
                    puzzle = _generate_basic_puzzle(size, max_attempts=200, difficulty=diff)
                except Exception:
                    continue
                t0 = time.time()
                stats = solve_puzzle(puzzle)
                times.append((time.time() - t0) * 1000)
                if stats.is_valid:
                    ok += 1
                    stats_dist[stats.difficulty_level] += 1
            avg = sum(times) / max(1, len(times))
            print(f"{size}x{size} target={diff:8} ok={ok}/5  avg={avg:6.1f}ms  observed: {stats_dist}")
