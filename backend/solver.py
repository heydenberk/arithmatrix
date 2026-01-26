"""
Technique-based Arithmatrix solver with human-correlated difficulty scoring.

Solving techniques (in order of difficulty):
1. Naked Single: Cell has only one valid candidate (row/col constraint)
2. Hidden Single: Number can only go in one cell in a row/column
3. Cage Single: Cage arithmetic leaves only one possibility for a cell
4. Cage Combinations: Enumerate valid value combinations for a cage
5. Intersection: Cage values constrained to specific row/col
6. Trial and Error: Backtracking when logic fails

Difficulty is scored based on which techniques are required to solve.
"""

from dataclasses import dataclass, field
from enum import IntEnum
from typing import List, Set, Dict, Tuple, Optional
import itertools


class Technique(IntEnum):
    """Solving techniques in order of difficulty."""
    NAKED_SINGLE = 1      # Only one number fits in cell
    HIDDEN_SINGLE = 2     # Number can only go in one place in row/col
    CAGE_SINGLE = 3       # Cage arithmetic forces a value
    CAGE_COMBINATIONS = 4 # Enumerate cage possibilities
    INTERSECTION = 5      # Cage constrains row/col
    TRIAL_AND_ERROR = 6   # Backtracking required


@dataclass
class SolveStats:
    """Statistics from solving a puzzle."""
    techniques_used: Dict[Technique, int] = field(default_factory=dict)
    solution_count: int = 0
    is_valid: bool = False

    def record(self, technique: Technique):
        self.techniques_used[technique] = self.techniques_used.get(technique, 0) + 1

    @property
    def max_technique(self) -> Optional[Technique]:
        if not self.techniques_used:
            return None
        return max(self.techniques_used.keys())

    @property
    def difficulty_score(self) -> float:
        """
        Calculate human-correlated difficulty score.

        Returns a score from 0-100 based on:
        - Which techniques were required (weighted heavily)
        - How often harder techniques were needed
        """
        if not self.techniques_used:
            return 0.0

        # Base score from hardest technique needed
        max_tech = self.max_technique
        base_scores = {
            Technique.NAKED_SINGLE: 10,
            Technique.HIDDEN_SINGLE: 25,
            Technique.CAGE_SINGLE: 40,
            Technique.CAGE_COMBINATIONS: 55,
            Technique.INTERSECTION: 70,
            Technique.TRIAL_AND_ERROR: 85,
        }
        score = base_scores.get(max_tech, 50)

        # Add points for frequency of harder techniques
        for tech, count in self.techniques_used.items():
            if tech >= Technique.CAGE_COMBINATIONS:
                score += min(count * 2, 10)  # Cap at +10 per technique

        return min(100, score)

    @property
    def difficulty_level(self) -> str:
        """Map score to difficulty level."""
        score = self.difficulty_score
        if score <= 15:
            return "easiest"
        elif score <= 30:
            return "easy"
        elif score <= 50:
            return "medium"
        elif score <= 70:
            return "hard"
        else:
            return "expert"


class ArithmatrixSolver:
    """
    Technique-based solver that tracks which methods are needed.
    """

    def __init__(self, puzzle: dict):
        self.size = puzzle["size"]
        self.cages = puzzle["cages"]

        # Initialize grid and candidates
        self.grid = [[0] * self.size for _ in range(self.size)]
        self.candidates = [[set(range(1, self.size + 1)) for _ in range(self.size)]
                          for _ in range(self.size)]

        # Build cage map
        self.cell_to_cage: Dict[Tuple[int, int], dict] = {}
        for cage in self.cages:
            cage_info = {
                "cells": [(c // self.size, c % self.size) for c in cage["cells"]],
                "operation": cage["operation"],
                "value": cage["value"],
            }
            for cell_idx in cage["cells"]:
                row, col = cell_idx // self.size, cell_idx % self.size
                self.cell_to_cage[(row, col)] = cage_info

        # Precompute valid combinations for each cage
        self._precompute_cage_combinations()

        self.stats = SolveStats()

    def _precompute_cage_combinations(self):
        """Compute all valid value combinations for each cage."""
        self.cage_combinations: Dict[int, List[Tuple[int, ...]]] = {}

        for i, cage in enumerate(self.cages):
            cells = [(c // self.size, c % self.size) for c in cage["cells"]]
            op = cage["operation"]
            target = cage["value"]
            n_cells = len(cells)

            valid_combos = []

            if op == "":
                # Single cell - just the value
                valid_combos = [(target,)]
            elif op == "+":
                # Addition - find all combinations that sum to target
                for combo in itertools.combinations_with_replacement(range(1, self.size + 1), n_cells):
                    if sum(combo) == target:
                        # Add all permutations
                        for perm in set(itertools.permutations(combo)):
                            valid_combos.append(perm)
            elif op == "*":
                # Multiplication - find all combinations that multiply to target
                for combo in itertools.combinations_with_replacement(range(1, self.size + 1), n_cells):
                    prod = 1
                    for v in combo:
                        prod *= v
                    if prod == target:
                        for perm in set(itertools.permutations(combo)):
                            valid_combos.append(perm)
            elif op == "-":
                # Subtraction (2 cells only)
                for a in range(1, self.size + 1):
                    for b in range(1, self.size + 1):
                        if abs(a - b) == target:
                            valid_combos.append((a, b))
            elif op == "/":
                # Division (2 cells only)
                for a in range(1, self.size + 1):
                    for b in range(1, self.size + 1):
                        if b != 0 and a == b * target:
                            valid_combos.append((a, b))
                        if a != 0 and b == a * target:
                            valid_combos.append((a, b))

            self.cage_combinations[i] = list(set(valid_combos))

    def _get_cage_index(self, row: int, col: int) -> int:
        """Get the cage index for a cell."""
        for i, cage in enumerate(self.cages):
            if row * self.size + col in cage["cells"]:
                return i
        return -1

    def _place(self, row: int, col: int, value: int):
        """Place a value and update candidates."""
        self.grid[row][col] = value
        self.candidates[row][col] = set()

        # Remove from row and column candidates
        for i in range(self.size):
            self.candidates[row][i].discard(value)
            self.candidates[i][col].discard(value)

    def _unplace(self, row: int, col: int, value: int):
        """Remove a value (for backtracking)."""
        self.grid[row][col] = 0
        # Rebuild candidates for this cell
        self.candidates[row][col] = set(range(1, self.size + 1))
        for i in range(self.size):
            if self.grid[row][i] != 0:
                self.candidates[row][col].discard(self.grid[row][i])
            if self.grid[i][col] != 0:
                self.candidates[row][col].discard(self.grid[i][col])

    def _apply_naked_singles(self) -> bool:
        """Find cells with only one candidate. Returns True if progress made."""
        progress = False
        for row in range(self.size):
            for col in range(self.size):
                if self.grid[row][col] == 0 and len(self.candidates[row][col]) == 1:
                    value = next(iter(self.candidates[row][col]))
                    self._place(row, col, value)
                    self.stats.record(Technique.NAKED_SINGLE)
                    progress = True
        return progress

    def _apply_hidden_singles(self) -> bool:
        """Find numbers that can only go in one place in a row/col."""
        progress = False

        # Check rows
        for row in range(self.size):
            for num in range(1, self.size + 1):
                if any(self.grid[row][c] == num for c in range(self.size)):
                    continue  # Already placed

                possible_cols = [c for c in range(self.size)
                               if self.grid[row][c] == 0 and num in self.candidates[row][c]]

                if len(possible_cols) == 1:
                    col = possible_cols[0]
                    self._place(row, col, num)
                    self.stats.record(Technique.HIDDEN_SINGLE)
                    progress = True

        # Check columns
        for col in range(self.size):
            for num in range(1, self.size + 1):
                if any(self.grid[r][col] == num for r in range(self.size)):
                    continue

                possible_rows = [r for r in range(self.size)
                               if self.grid[r][col] == 0 and num in self.candidates[r][col]]

                if len(possible_rows) == 1:
                    row = possible_rows[0]
                    self._place(row, col, num)
                    self.stats.record(Technique.HIDDEN_SINGLE)
                    progress = True

        return progress

    def _apply_cage_constraints(self) -> bool:
        """Use cage arithmetic to eliminate candidates."""
        progress = False

        for cage_idx, cage in enumerate(self.cages):
            cells = [(c // self.size, c % self.size) for c in cage["cells"]]
            empty_cells = [(r, c) for r, c in cells if self.grid[r][c] == 0]

            if not empty_cells:
                continue

            # Get valid combinations for this cage
            valid_combos = self.cage_combinations[cage_idx]

            # Filter combinations based on already-placed values
            placed_values = []
            placed_positions = []
            for i, (r, c) in enumerate(cells):
                if self.grid[r][c] != 0:
                    placed_values.append((i, self.grid[r][c]))
                    placed_positions.append(i)

            # Filter to combos that match placed values
            filtered_combos = []
            for combo in valid_combos:
                matches = True
                for pos, val in placed_values:
                    if combo[pos] != val:
                        matches = False
                        break
                if matches:
                    # Also check row/col constraints for empty cells
                    valid = True
                    for i, (r, c) in enumerate(cells):
                        if i not in placed_positions:
                            if combo[i] not in self.candidates[r][c]:
                                valid = False
                                break
                    if valid:
                        filtered_combos.append(combo)

            if not filtered_combos:
                continue  # No valid combos - puzzle is invalid

            # For each empty cell, find which values are possible
            for i, (r, c) in enumerate(cells):
                if self.grid[r][c] != 0:
                    continue

                possible_values = set(combo[i] for combo in filtered_combos)

                # If only one value possible, place it
                if len(possible_values) == 1:
                    value = next(iter(possible_values))
                    if value in self.candidates[r][c]:
                        self._place(r, c, value)
                        self.stats.record(Technique.CAGE_SINGLE)
                        progress = True
                else:
                    # Eliminate impossible values
                    to_remove = self.candidates[r][c] - possible_values
                    if to_remove:
                        self.candidates[r][c] -= to_remove
                        self.stats.record(Technique.CAGE_COMBINATIONS)
                        progress = True

        return progress

    def _is_valid(self) -> bool:
        """Check if current state is valid (no empty candidates for empty cells)."""
        for row in range(self.size):
            for col in range(self.size):
                if self.grid[row][col] == 0 and len(self.candidates[row][col]) == 0:
                    return False
        return True

    def _is_complete(self) -> bool:
        """Check if puzzle is fully solved."""
        return all(self.grid[r][c] != 0 for r in range(self.size) for c in range(self.size))

    def _verify_solution(self) -> bool:
        """Verify the solution satisfies all constraints."""
        # Check rows and columns
        for i in range(self.size):
            row_vals = [self.grid[i][j] for j in range(self.size)]
            col_vals = [self.grid[j][i] for j in range(self.size)]
            if set(row_vals) != set(range(1, self.size + 1)):
                return False
            if set(col_vals) != set(range(1, self.size + 1)):
                return False

        # Check cages
        for cage in self.cages:
            cells = [(c // self.size, c % self.size) for c in cage["cells"]]
            values = [self.grid[r][c] for r, c in cells]
            op = cage["operation"]
            target = cage["value"]

            if op == "":
                if values[0] != target:
                    return False
            elif op == "+":
                if sum(values) != target:
                    return False
            elif op == "*":
                prod = 1
                for v in values:
                    prod *= v
                if prod != target:
                    return False
            elif op == "-":
                if abs(values[0] - values[1]) != target:
                    return False
            elif op == "/":
                a, b = values
                if not ((b != 0 and a == b * target) or (a != 0 and b == a * target)):
                    return False

        return True

    def _solve_with_backtracking(self, max_solutions: int = 2) -> int:
        """
        Backtracking solver for when logic techniques aren't enough.
        Returns number of solutions found (up to max_solutions).
        """
        # First apply all logic techniques
        while True:
            progress = False
            progress = self._apply_naked_singles() or progress
            progress = self._apply_hidden_singles() or progress
            progress = self._apply_cage_constraints() or progress

            if not progress:
                break

            if not self._is_valid():
                return 0

        if self._is_complete():
            return 1 if self._verify_solution() else 0

        if not self._is_valid():
            return 0

        # Find cell with fewest candidates (MRV heuristic)
        min_candidates = self.size + 1
        best_cell = None
        for row in range(self.size):
            for col in range(self.size):
                if self.grid[row][col] == 0:
                    n = len(self.candidates[row][col])
                    if n < min_candidates:
                        min_candidates = n
                        best_cell = (row, col)

        if best_cell is None:
            return 0

        row, col = best_cell
        solutions = 0

        # Record that we needed trial and error
        self.stats.record(Technique.TRIAL_AND_ERROR)

        # Save state
        saved_grid = [row[:] for row in self.grid]
        saved_candidates = [[cell.copy() for cell in row] for row in self.candidates]

        for value in list(self.candidates[row][col]):
            # Restore state
            self.grid = [r[:] for r in saved_grid]
            self.candidates = [[c.copy() for c in r] for r in saved_candidates]

            # Try this value
            self._place(row, col, value)

            solutions += self._solve_with_backtracking(max_solutions - solutions)

            if solutions >= max_solutions:
                break

        # Restore state
        self.grid = saved_grid
        self.candidates = saved_candidates

        return solutions

    def solve(self, count_solutions: bool = True) -> SolveStats:
        """
        Solve the puzzle and return statistics.

        Args:
            count_solutions: If True, verify exactly one solution exists

        Returns:
            SolveStats with technique usage and difficulty score
        """
        self.stats = SolveStats()

        # Reset grid
        self.grid = [[0] * self.size for _ in range(self.size)]
        self.candidates = [[set(range(1, self.size + 1)) for _ in range(self.size)]
                          for _ in range(self.size)]

        # Apply initial cage constraints to reduce candidates
        self._apply_cage_constraints()

        # Try to solve with logic techniques first
        while True:
            progress = False
            progress = self._apply_naked_singles() or progress
            progress = self._apply_hidden_singles() or progress
            progress = self._apply_cage_constraints() or progress

            if not progress:
                break

            if not self._is_valid():
                self.stats.is_valid = False
                return self.stats

        # If not complete, need backtracking
        if not self._is_complete():
            solution_count = self._solve_with_backtracking(max_solutions=2 if count_solutions else 1)
            self.stats.solution_count = solution_count
            self.stats.is_valid = solution_count == 1
        else:
            if self._verify_solution():
                self.stats.solution_count = 1
                self.stats.is_valid = True
            else:
                self.stats.is_valid = False

        return self.stats


def solve_puzzle(puzzle: dict) -> SolveStats:
    """Convenience function to solve a puzzle and get stats."""
    solver = ArithmatrixSolver(puzzle)
    return solver.solve()


def get_difficulty(puzzle: dict) -> Tuple[str, float]:
    """Get difficulty level and score for a puzzle."""
    stats = solve_puzzle(puzzle)
    return stats.difficulty_level, stats.difficulty_score


def estimate_difficulty_fast(puzzle: dict) -> Tuple[str, float]:
    """
    Fast difficulty estimation without solving.

    Key insight: puzzles that require backtracking (trial-and-error) are hard/expert.
    Puzzles solvable with logic alone are easier.

    Factors that predict need for backtracking:
    - Few single-cell cages (gimmes give free starting points)
    - Large cages (more ambiguity)
    - Many combinations per cage
    - Low constraint density

    Returns (difficulty_level, score)
    """
    size = puzzle["size"]
    cages = puzzle["cages"]
    total_cells = size * size

    # Count cage types
    single_cells = sum(1 for c in cages if len(c["cells"]) == 1)
    two_cells = sum(1 for c in cages if len(c["cells"]) == 2)
    three_cells = sum(1 for c in cages if len(c["cells"]) == 3)
    large_cells = sum(1 for c in cages if len(c["cells"]) >= 4)

    # Calculate total combinations across all cages
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
            total_combos += sum(1 for a in range(1, size+1) for b in range(1, size+1)
                               if abs(a-b) == target)
        elif op == "/":
            total_combos += sum(1 for a in range(1, size+1) for b in range(1, size+1)
                               if (b != 0 and a == b * target) or (a != 0 and b == a * target))

    # Gimme ratio - more gimmes = easier
    gimme_ratio = single_cells / len(cages)

    # Constraint ratio - more 2-cell cages = more constraints = easier
    constraint_ratio = (single_cells + two_cells) / len(cages)

    # Average combinations per cage (excluding singles)
    non_single_cages = len(cages) - single_cells
    avg_combos = (total_combos - single_cells) / max(1, non_single_cages)

    # Build score (0-100)
    # Base score from grid size
    base = {4: 40, 5: 50, 6: 60, 7: 70}.get(size, 60)

    # Adjust for gimmes (each gimme reduces difficulty)
    score = base - (gimme_ratio * 40)

    # Adjust for large cages (each large cage adds difficulty)
    score += large_cells * 8

    # Adjust for average combinations
    if avg_combos > 10:
        score += min(15, (avg_combos - 10) * 1.5)
    elif avg_combos < 5:
        score -= (5 - avg_combos) * 3

    # Low constraint ratio = harder
    if constraint_ratio < 0.5:
        score += 10

    # Clamp
    score = max(0, min(100, score))

    # Map to level
    if score <= 20:
        level = "easiest"
    elif score <= 35:
        level = "easy"
    elif score <= 50:
        level = "medium"
    elif score <= 70:
        level = "hard"
    else:
        level = "expert"

    return level, score


def _count_addition_combos(n_cells: int, target: int, size: int) -> int:
    """Count valid addition combinations."""
    count = 0
    # Use itertools for small cases
    if n_cells <= 3:
        for combo in itertools.combinations_with_replacement(range(1, size + 1), n_cells):
            if sum(combo) == target:
                count += len(set(itertools.permutations(combo)))
    else:
        # Estimate for larger cages
        count = max(1, target // n_cells)  # Rough estimate
    return count


def _count_multiplication_combos(n_cells: int, target: int, size: int) -> int:
    """Count valid multiplication combinations."""
    count = 0
    if n_cells <= 3:
        for combo in itertools.combinations_with_replacement(range(1, size + 1), n_cells):
            prod = 1
            for v in combo:
                prod *= v
            if prod == target:
                count += len(set(itertools.permutations(combo)))
    else:
        # Estimate
        count = max(1, 3)
    return count


if __name__ == "__main__":
    import sys
    import time
    sys.path.insert(0, ".")

    from arithmatrix import _generate_basic_puzzle
    from latin_square import warm_up_pool

    warm_up_pool()

    print("=== Technique-Based Solver Test ===\n")

    for size in [4, 5, 6, 7]:
        print(f"{size}x{size} puzzles:")

        solve_times = []
        estimate_times = []
        valid = 0
        solved_difficulties = {level: 0 for level in ["easiest", "easy", "medium", "hard", "expert"]}
        estimated_difficulties = {level: 0 for level in ["easiest", "easy", "medium", "hard", "expert"]}

        for _ in range(20):
            try:
                puzzle = _generate_basic_puzzle(size, max_attempts=100)
            except ValueError:
                continue

            # Fast estimate
            start = time.time()
            est_level, est_score = estimate_difficulty_fast(puzzle)
            estimate_times.append(time.time() - start)
            estimated_difficulties[est_level] += 1

            # Full solve
            start = time.time()
            stats = solve_puzzle(puzzle)
            solve_times.append(time.time() - start)

            if stats.is_valid:
                valid += 1
                solved_difficulties[stats.difficulty_level] += 1

        if solve_times:
            avg_solve = sum(solve_times) / len(solve_times) * 1000
            avg_estimate = sum(estimate_times) / len(estimate_times) * 1000
            print(f"  Solve time:    {avg_solve:.1f}ms avg")
            print(f"  Estimate time: {avg_estimate:.3f}ms avg ({avg_solve/avg_estimate:.0f}x faster)")
            print(f"  Valid puzzles: {valid}/{len(solve_times)}")
            print(f"  Solved dist:   {dict((k,v) for k,v in solved_difficulties.items() if v > 0)}")
            print(f"  Estimate dist: {dict((k,v) for k,v in estimated_difficulties.items() if v > 0)}")
        print()
