#!/usr/bin/env python3
"""
Human-Centered Arithmatrix Solver
Mimics human solving patterns to provide more accurate difficulty assessment.
"""

import json
import time
from typing import Dict, List, Tuple, Set, Optional
from collections import defaultdict, deque
import copy


class HumanCenteredSolver:
    """
    Solver that mimics human solving patterns for more accurate difficulty assessment.

    Key differences from computer solver:
    1. Prioritizes obvious moves (single cells, simple arithmetic)
    2. Uses human-like constraint propagation
    3. Considers visual/structural complexity
    4. Weights operations by human difficulty
    """

    def __init__(self):
        # Human difficulty weights for different operations
        self.operation_weights = {
            "": 1.0,  # Single cells (easiest)
            "+": 1.2,  # Addition
            "-": 1.5,  # Subtraction (more mental math)
            "*": 2.0,  # Multiplication (harder)
            "/": 2.5,  # Division (hardest)
        }

        # Weights for cage size complexity (humans struggle more with larger cages)
        self.cage_size_weights = {
            1: 1.0,  # Single cell
            2: 1.3,  # Pair
            3: 1.8,  # Triple
            4: 2.5,  # Quad
            5: 3.5,  # Large cage
        }

        # Reset counters for difficulty tracking
        self.reset_difficulty_counters()

    def reset_difficulty_counters(self):
        """Reset all difficulty tracking counters."""
        self.human_operations = 0
        self.cognitive_load_points = 0
        self.backtrack_penalty = 0
        self.arithmetic_complexity = 0
        self.constraint_violations = 0
        self.visual_complexity = 0
        self.time_start = None

    def solve_puzzle(self, puzzle: Dict) -> Dict:
        """
        Solve puzzle using human-centered approach.

        Returns:
            Dict with solve statistics including human-aligned difficulty score
        """
        self.reset_difficulty_counters()
        self.time_start = time.time()

        size = puzzle["size"]
        cages = puzzle["cages"]

        # Initialize grid and cage mappings
        grid = [[0 for _ in range(size)] for _ in range(size)]
        cage_map, cage_cells = self._parse_cages(cages, size)

        # Calculate initial visual complexity
        self.visual_complexity = self._calculate_visual_complexity(cages, size)

        # Human-like solving approach
        solved = self._human_solve_recursive(grid, cage_map, cage_cells, size)

        solve_time = time.time() - self.time_start

        if not solved:
            return {"solved": False, "error": "No solution found"}

        # Calculate human difficulty score
        human_difficulty = self._calculate_human_difficulty_score(size)

        return {
            "solved": True,
            "grid": grid,
            "solve_time": solve_time,
            "human_difficulty_score": human_difficulty,
            "human_operations": self.human_operations,
            "cognitive_load_points": self.cognitive_load_points,
            "backtrack_penalty": self.backtrack_penalty,
            "arithmetic_complexity": self.arithmetic_complexity,
            "constraint_violations": self.constraint_violations,
            "visual_complexity": self.visual_complexity,
            "breakdown": {
                "operation_difficulty": self.arithmetic_complexity,
                "logical_complexity": self.cognitive_load_points,
                "visual_complexity": self.visual_complexity,
                "backtrack_difficulty": self.backtrack_penalty,
            },
        }

    def _parse_cages(self, cages: List[Dict], size: int) -> Tuple[Dict, Dict]:
        """Parse cages into useful data structures."""
        cage_map = {}  # cell_index -> cage_info
        cage_cells = {}  # cage_index -> list of cells

        for i, cage in enumerate(cages):
            cage_info = {
                "cells": cage["cells"],
                "operation": cage["operation"],
                "value": cage["value"],
                "index": i,
                "size": len(cage["cells"]),
            }
            cage_cells[i] = cage["cells"]
            for cell in cage["cells"]:
                cage_map[cell] = cage_info

        return cage_map, cage_cells

    def _calculate_visual_complexity(self, cages: List[Dict], size: int) -> float:
        """Calculate visual complexity that affects human solving."""
        complexity = 0

        # Cage size distribution complexity
        cage_sizes = [len(cage["cells"]) for cage in cages]
        avg_cage_size = sum(cage_sizes) / len(cage_sizes)
        size_variance = sum((s - avg_cage_size) ** 2 for s in cage_sizes) / len(
            cage_sizes
        )
        complexity += size_variance * 10  # Irregular cage sizes are harder

        # Operation mix complexity
        operations = [cage["operation"] for cage in cages]
        op_counts = {op: operations.count(op) for op in ["+", "-", "*", "/", ""]}

        # Penalty for mixed operations (harder to develop patterns)
        non_zero_ops = sum(1 for count in op_counts.values() if count > 0)
        if non_zero_ops > 3:
            complexity += 20  # Many different operations

        # Penalty for complex arithmetic
        for cage in cages:
            if cage["operation"] in ["*", "/"]:
                complexity += 5
            if cage["value"] > size * 3:  # Large numbers
                complexity += 3

        return complexity

    def _human_solve_recursive(
        self, grid: List[List[int]], cage_map: Dict, cage_cells: Dict, size: int
    ) -> bool:
        """
        Recursive solver using human-like strategies.

        Humans typically:
        1. Fill obvious single cells first
        2. Use simple arithmetic before complex
        3. Look for patterns and shortcuts
        4. Avoid excessive backtracking
        """

        # Strategy 1: Fill single-cell cages first (most obvious)
        if self._fill_single_cells(grid, cage_map, size):
            return True

        # Strategy 2: Solve simple arithmetic cages with few possibilities
        if self._solve_simple_cages(grid, cage_map, cage_cells, size):
            return True

        # Strategy 3: Use constraint propagation (what humans do mentally)
        if self._apply_human_constraints(grid, cage_map, cage_cells, size):
            return True

        # Strategy 4: Make educated guesses (with penalty for backtracking)
        return self._human_backtrack(grid, cage_map, cage_cells, size)

    def _fill_single_cells(
        self, grid: List[List[int]], cage_map: Dict, size: int
    ) -> bool:
        """Fill single-cell cages (easiest human task)."""
        filled_any = False

        for row in range(size):
            for col in range(size):
                if grid[row][col] == 0:
                    cell_idx = row * size + col
                    cage_info = cage_map[cell_idx]

                    if cage_info["operation"] == "" and len(cage_info["cells"]) == 1:
                        # Single cell cage - direct assignment
                        value = cage_info["value"]
                        if self._is_valid_placement(grid, row, col, value, size):
                            grid[row][col] = value
                            self.human_operations += 1
                            filled_any = True

        return filled_any

    def _solve_simple_cages(
        self, grid: List[List[int]], cage_map: Dict, cage_cells: Dict, size: int
    ) -> bool:
        """Solve cages with obvious solutions."""
        progress = False

        for cage_idx, cells in cage_cells.items():
            cage_info = list(cage_map.values())[cage_idx]
            if self._is_cage_simple(cage_info, grid, size):
                if self._solve_cage_if_simple(grid, cage_info, size):
                    progress = True

        return progress

    def _is_cage_simple(
        self, cage_info: Dict, grid: List[List[int]], size: int
    ) -> bool:
        """Check if a cage can be solved with simple human reasoning."""
        cells = cage_info["cells"]
        operation = cage_info["operation"]
        target = cage_info["value"]

        # Count filled cells
        filled_count = 0
        empty_cells = []

        for cell in cells:
            row, col = cell // size, cell % size
            if grid[row][col] != 0:
                filled_count += 1
            else:
                empty_cells.append((row, col))

        # Simple cases humans can solve quickly
        if len(cells) == 2 and filled_count == 1:
            # Two-cell cage with one filled
            return True

        if operation == "+" and len(empty_cells) == 1:
            # Addition cage with one empty cell
            return True

        if operation == "" and len(cells) == 1:
            # Single cell
            return True

        return False

    def _solve_cage_if_simple(
        self, grid: List[List[int]], cage_info: Dict, size: int
    ) -> bool:
        """Solve a cage if it's simple enough for human reasoning."""
        cells = cage_info["cells"]
        operation = cage_info["operation"]
        target = cage_info["value"]

        if operation == "":
            # Single cell case
            if len(cells) == 1:
                row, col = cells[0] // size, cells[0] % size
                if grid[row][col] == 0:
                    if self._is_valid_placement(grid, row, col, target, size):
                        grid[row][col] = target
                        self.human_operations += 1
                        return True

        elif len(cells) == 2:
            # Two-cell cage
            filled_cell = None
            empty_cell = None

            for cell in cells:
                row, col = cell // size, cell % size
                if grid[row][col] != 0:
                    filled_cell = (row, col, grid[row][col])
                else:
                    empty_cell = (row, col)

            if filled_cell and empty_cell:
                # Calculate the required value
                required_value = self._calculate_required_value(
                    operation, target, filled_cell[2]
                )

                if required_value and 1 <= required_value <= size:
                    if self._is_valid_placement(
                        grid, empty_cell[0], empty_cell[1], required_value, size
                    ):
                        grid[empty_cell[0]][empty_cell[1]] = required_value
                        self.human_operations += 1
                        self.arithmetic_complexity += self.operation_weights[operation]
                        return True

        return False

    def _calculate_required_value(
        self, operation: str, target: int, known_value: int
    ) -> Optional[int]:
        """Calculate what value is needed to complete a two-cell cage."""
        if operation == "+":
            return target - known_value
        elif operation == "-":
            # Could be either direction
            option1 = known_value - target
            option2 = target + known_value
            # Return the positive option (humans prefer positive results)
            if option1 > 0:
                return option1
            elif option2 > 0:
                return option2
        elif operation == "*":
            if target % known_value == 0:
                return target // known_value
        elif operation == "/":
            # Could be either direction
            option1 = known_value * target
            option2 = known_value // target if known_value % target == 0 else None
            if option1:
                return option1
            elif option2:
                return option2

        return None

    def _apply_human_constraints(
        self, grid: List[List[int]], cage_map: Dict, cage_cells: Dict, size: int
    ) -> bool:
        """Apply constraints the way humans think about them."""
        progress = False

        # Check for cells that can only have one value
        for row in range(size):
            for col in range(size):
                if grid[row][col] == 0:
                    valid_values = self._get_valid_values_human_style(
                        grid, row, col, cage_map, size
                    )

                    if len(valid_values) == 1:
                        grid[row][col] = valid_values[0]
                        self.human_operations += 1
                        self.cognitive_load_points += 2  # Constraint reasoning
                        progress = True
                    elif len(valid_values) == 0:
                        self.constraint_violations += 1

        return progress

    def _get_valid_values_human_style(
        self, grid: List[List[int]], row: int, col: int, cage_map: Dict, size: int
    ) -> List[int]:
        """Get valid values using human-style reasoning."""
        # Start with all possible values
        candidates = list(range(1, size + 1))

        # Remove values already in row
        for c in range(size):
            if grid[row][c] in candidates:
                candidates.remove(grid[row][c])

        # Remove values already in column
        for r in range(size):
            if grid[r][col] in candidates:
                candidates.remove(grid[r][col])

        # Check cage constraints
        cell_idx = row * size + col
        cage_info = cage_map[cell_idx]

        # Filter candidates based on cage arithmetic
        valid_candidates = []
        for candidate in candidates:
            if self._would_cage_be_valid_with_value(
                grid, cage_info, row, col, candidate, size
            ):
                valid_candidates.append(candidate)

        return valid_candidates

    def _would_cage_be_valid_with_value(
        self,
        grid: List[List[int]],
        cage_info: Dict,
        row: int,
        col: int,
        value: int,
        size: int,
    ) -> bool:
        """Check if placing a value would keep the cage valid."""
        # Create temporary grid with the value placed
        temp_grid = [row[:] for row in grid]
        temp_grid[row][col] = value

        return self._is_cage_valid(temp_grid, cage_info, size)

    def _is_cage_valid(self, grid: List[List[int]], cage_info: Dict, size: int) -> bool:
        """Check if a cage is valid with current values."""
        cells = cage_info["cells"]
        operation = cage_info["operation"]
        target = cage_info["value"]

        # Get values in cage
        values = []
        empty_count = 0

        for cell in cells:
            r, c = cell // size, cell % size
            if grid[r][c] != 0:
                values.append(grid[r][c])
            else:
                empty_count += 1

        # If cage is not full, check if it could still be valid
        if empty_count > 0:
            return self._could_cage_be_completed(
                values, operation, target, empty_count, size
            )

        # If cage is full, check exact match
        return self._evaluate_cage_exact(values, operation, target)

    def _could_cage_be_completed(
        self,
        current_values: List[int],
        operation: str,
        target: int,
        empty_count: int,
        size: int,
    ) -> bool:
        """Check if a partially filled cage could potentially be completed."""
        if operation == "":
            return len(current_values) <= 1 and (
                not current_values or current_values[0] == target
            )

        if operation == "+":
            current_sum = sum(current_values)
            remaining_sum = target - current_sum
            # Check if remaining sum is achievable
            min_possible = empty_count * 1
            max_possible = empty_count * size
            return min_possible <= remaining_sum <= max_possible

        elif operation == "*":
            if not current_values:
                return True  # No constraints yet
            current_product = 1
            for v in current_values:
                current_product *= v

            if target % current_product != 0:
                return False  # Can't divide evenly

            remaining_target = target // current_product
            # Check if remaining target is achievable
            return remaining_target >= 1

        # For subtraction and division, be more permissive during partial completion
        return True

    def _evaluate_cage_exact(
        self, values: List[int], operation: str, target: int
    ) -> bool:
        """Evaluate if a complete cage matches its target."""
        if operation == "":
            return len(values) == 1 and values[0] == target

        elif operation == "+":
            return sum(values) == target

        elif operation == "*":
            product = 1
            for v in values:
                product *= v
            return product == target

        elif operation == "-":
            if len(values) == 2:
                return abs(values[0] - values[1]) == target
            return False

        elif operation == "/":
            if len(values) == 2:
                a, b = values[0], values[1]
                return (a // b == target and a % b == 0) or (
                    b // a == target and b % a == 0
                )
            return False

        return False

    def _human_backtrack(
        self, grid: List[List[int]], cage_map: Dict, cage_cells: Dict, size: int
    ) -> bool:
        """Backtracking with human-like preferences and penalties."""

        # Find the "most constrained" cell (humans naturally focus on these)
        best_cell = self._find_most_constrained_cell(grid, cage_map, size)

        if best_cell is None:
            # No empty cells - check if solution is complete
            return self._is_complete_solution(grid, cage_map, cage_cells, size)

        row, col, candidates = best_cell

        # Try candidates in human-preferred order
        candidates = self._sort_candidates_human_style(
            candidates, cage_map, row * size + col
        )

        for candidate in candidates:
            # Place the candidate
            grid[row][col] = candidate
            self.human_operations += 1

            # Recursive solve
            if self._human_solve_recursive(grid, cage_map, cage_cells, size):
                return True

            # Backtrack (with penalty)
            grid[row][col] = 0
            self.backtrack_penalty += 5  # Humans dislike backtracking

        return False

    def _find_most_constrained_cell(
        self, grid: List[List[int]], cage_map: Dict, size: int
    ) -> Optional[Tuple[int, int, List[int]]]:
        """Find the empty cell with fewest valid options (human strategy)."""
        best_cell = None
        min_options = size + 1

        for row in range(size):
            for col in range(size):
                if grid[row][col] == 0:
                    valid_values = self._get_valid_values_human_style(
                        grid, row, col, cage_map, size
                    )

                    if len(valid_values) < min_options:
                        min_options = len(valid_values)
                        best_cell = (row, col, valid_values)

                        if min_options == 1:
                            # Found a cell with only one option - humans would pick this immediately
                            break

        return best_cell

    def _sort_candidates_human_style(
        self, candidates: List[int], cage_map: Dict, cell_idx: int
    ) -> List[int]:
        """Sort candidates in order humans would try them."""
        cage_info = cage_map[cell_idx]

        # Humans prefer smaller numbers first, unless the cage suggests otherwise
        if cage_info["operation"] in ["*", "/"]:
            # For multiplication/division, try factors of the target first
            target = cage_info["value"]
            factors = [c for c in candidates if target % c == 0]
            non_factors = [c for c in candidates if target % c != 0]
            return sorted(factors) + sorted(non_factors)

        # Default: ascending order (humans prefer small numbers)
        return sorted(candidates)

    def _is_complete_solution(
        self, grid: List[List[int]], cage_map: Dict, cage_cells: Dict, size: int
    ) -> bool:
        """Check if the grid is a complete, valid solution."""

        # Check if all cells are filled
        for row in range(size):
            for col in range(size):
                if grid[row][col] == 0:
                    return False

        # Check all cages
        checked_cages = set()
        for cage_idx, cells in cage_cells.items():
            if cage_idx not in checked_cages:
                cage_info = list(cage_map.values())[cage_idx]
                if not self._is_cage_valid(grid, cage_info, size):
                    return False
                checked_cages.add(cage_idx)

        return True

    def _is_valid_placement(
        self, grid: List[List[int]], row: int, col: int, value: int, size: int
    ) -> bool:
        """Check if placing a value at a position is valid (row/column constraints)."""

        # Check row constraint
        for c in range(size):
            if c != col and grid[row][c] == value:
                return False

        # Check column constraint
        for r in range(size):
            if r != row and grid[r][col] == value:
                return False

        return True

    def _calculate_human_difficulty_score(self, size: int) -> float:
        """Calculate a human-aligned difficulty score."""

        # Base score from puzzle size (larger puzzles are inherently harder)
        size_factor = (size - 3) ** 2 * 50  # Quadratic scaling

        # Cognitive load (constraint reasoning)
        cognitive_factor = self.cognitive_load_points * 3

        # Operation complexity (weighted by human difficulty)
        arithmetic_factor = self.arithmetic_complexity * 10

        # Visual complexity (layout difficulty)
        visual_factor = self.visual_complexity * 2

        # Backtracking penalty (humans hate this)
        backtrack_factor = self.backtrack_penalty * 8

        # Constraint violations (indicates puzzle difficulty)
        violation_factor = self.constraint_violations * 15

        # Base operations (raw solve steps)
        operation_factor = self.human_operations * 1.5

        total_score = (
            size_factor
            + cognitive_factor
            + arithmetic_factor
            + visual_factor
            + backtrack_factor
            + violation_factor
            + operation_factor
        )

        return max(1.0, total_score)  # Minimum score of 1


def solve_with_human_centered_approach(puzzle: Dict) -> Dict:
    """
    Convenience function to solve a puzzle with human-centered approach.

    Args:
        puzzle: Standard Arithmatrix puzzle dictionary

    Returns:
        Dict with solve results including human difficulty score
    """
    solver = HumanCenteredSolver()
    return solver.solve_puzzle(puzzle)


def analyze_puzzle_difficulty(puzzle: Dict) -> Dict:
    """
    Analyze puzzle difficulty using human-centered metrics.

    Args:
        puzzle: Standard Arithmatrix puzzle dictionary

    Returns:
        Dict with detailed difficulty analysis
    """
    result = solve_with_human_centered_approach(puzzle)

    if not result["solved"]:
        return result

    # Add additional analysis
    analysis = {
        "human_difficulty_score": result["human_difficulty_score"],
        "estimated_solve_time": result["human_difficulty_score"] / 10,  # Rough estimate
        "difficulty_category": _categorize_difficulty(result["human_difficulty_score"]),
        "complexity_breakdown": result["breakdown"],
        "solving_stats": {
            "total_operations": result["human_operations"],
            "backtrack_steps": result["backtrack_penalty"] // 5,
            "constraint_reasoning": result["cognitive_load_points"],
            "arithmetic_complexity": result["arithmetic_complexity"],
        },
    }

    return analysis


def _categorize_difficulty(score: float) -> str:
    """Categorize difficulty score into human-friendly levels."""
    if score < 100:
        return "very_easy"
    elif score < 250:
        return "easy"
    elif score < 500:
        return "medium"
    elif score < 1000:
        return "hard"
    elif score < 2000:
        return "very_hard"
    else:
        return "expert"


if __name__ == "__main__":
    # Example usage
    sample_puzzle = {
        "size": 4,
        "cages": [
            {"cells": [0, 1], "operation": "+", "value": 5},
            {"cells": [2], "operation": "", "value": 3},
            {"cells": [3, 7], "operation": "*", "value": 6},
            {"cells": [4, 8], "operation": "-", "value": 1},
            {"cells": [5, 6, 9], "operation": "+", "value": 8},
            {"cells": [10, 11], "operation": "/", "value": 2},
            {"cells": [12, 13, 14], "operation": "*", "value": 12},
            {"cells": [15], "operation": "", "value": 1},
        ],
    }

    print("🧠 Testing Human-Centered Solver")
    print("=" * 50)

    result = analyze_puzzle_difficulty(sample_puzzle)

    if result.get("difficulty_category"):
        print(f"Difficulty Category: {result['difficulty_category']}")
        print(f"Human Difficulty Score: {result['human_difficulty_score']:.1f}")
        print(f"Estimated Solve Time: {result['estimated_solve_time']:.1f} seconds")
        print("\nComplexity Breakdown:")
        for factor, value in result["complexity_breakdown"].items():
            print(f"  {factor}: {value:.1f}")
    else:
        print("Failed to solve puzzle")
