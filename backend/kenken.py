import random
import string
from collections import deque
from typing import Literal

import numpy as np
import json
from flask import current_app as app

from .latin_square import get_latin_square


def weighted_partition_sample(weights, target_sum, max_attempts=10000):
    """
    Returns a list of integers (1-5), sampled based on relative weights,
    such that their total sum equals target_sum.

    Args:
        weights: A list of 5 non-negative numbers as relative weights for [1, 2, 3, 4, 5].
        target_sum: The desired total sum of the selected values.
        max_attempts: Maximum tries before giving up (for performance).

    Returns:
        A list of sampled integers whose sum is target_sum, or None if unsuccessful.
    """
    values = [1, 2, 3, 4, 5]

    # Normalize weights for use with random.choices
    total_weight = sum(weights)
    if total_weight == 0:
        raise ValueError("Weights must not all be zero.")
    probabilities = [w / total_weight for w in weights]

    for _ in range(max_attempts):
        current_sum = 0
        result = []
        # Greedy sampling, might overshoot, so we limit
        while current_sum < target_sum:
            remaining = target_sum - current_sum
            # Only sample from values that won't overshoot the target
            allowed_indices = [i for i, v in enumerate(values) if v <= remaining]
            if not allowed_indices:
                break
            allowed_values = [values[i] for i in allowed_indices]
            allowed_probs = [probabilities[i] for i in allowed_indices]
            norm = sum(allowed_probs)
            adjusted_probs = [p / norm for p in allowed_probs]
            choice = random.choices(allowed_values, weights=adjusted_probs)[0]
            result.append(choice)
            current_sum += choice

        if current_sum == target_sum:
            return result

    return None


def carve_square(square, cage_sizes, max_attempts=100):
    """
    Carve the square into contiguous cages of specified sizes.

    Args:
        square: A numpy array representing the Latin square
        cage_sizes: A dictionary mapping cage letters (A, B, C, ...) to their sizes
        max_attempts: Maximum attempts to find a valid carving

    Returns:
        A numpy array with ASCII uppercase letters marking each cage
    """
    n = square.shape[0]

    # Sort cages by size (largest first) for better placement
    sorted_cages = sorted(cage_sizes.items(), key=lambda x: x[1], reverse=True)

    # Directions for adjacent cells (up, down, left, right)
    directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    def get_neighbors(row, col, used):
        """Get valid neighboring coordinates"""
        neighbors = []
        for dr, dc in directions:
            new_row, new_col = row + dr, col + dc
            if 0 <= new_row < n and 0 <= new_col < n and not used[new_row, new_col]:
                neighbors.append((new_row, new_col))
        return neighbors

    def find_all_unused_cells(used):
        """Find all unused cells"""
        unused = []
        for i in range(n):
            for j in range(n):
                if not used[i, j]:
                    unused.append((i, j))
        return unused

    def try_place_cage(used, start_row, start_col, target_size):
        """Try to place a cage of target_size starting from the given position"""
        if used[start_row, start_col]:
            return None

        # Use a more controlled approach - try different growth patterns
        cage_cells = [(start_row, start_col)]
        used_temp = used.copy()
        used_temp[start_row, start_col] = True

        # Grow the cage one cell at a time, prioritizing shapes that don't fragment the board
        while len(cage_cells) < target_size:
            best_candidates = []

            # Get all possible next cells
            for row, col in cage_cells:
                neighbors = get_neighbors(row, col, used_temp)
                for nr, nc in neighbors:
                    if (nr, nc) not in [cell for cell in cage_cells]:
                        # Count how many unused neighbors this cell would have
                        future_neighbors = len(get_neighbors(nr, nc, used_temp))
                        best_candidates.append((nr, nc, future_neighbors))

            if not best_candidates:
                return None

            # Sort by number of future neighbors (prefer cells that don't isolate others)
            # But also add some randomness to avoid getting stuck in patterns
            best_candidates.sort(key=lambda x: (x[2], random.random()), reverse=True)

            # Take the best candidate
            next_row, next_col, _ = best_candidates[0]
            cage_cells.append((next_row, next_col))
            used_temp[next_row, next_col] = True

        return cage_cells

    def attempt_carving():
        """Attempt to carve the entire square"""
        result = np.full((n, n), "", dtype="U1")
        used = np.zeros((n, n), dtype=bool)

        for cage_letter, size in sorted_cages:
            placed = False
            unused_cells = find_all_unused_cells(used)

            # Shuffle unused cells to add randomness
            random.shuffle(unused_cells)

            for start_row, start_col in unused_cells:
                cage_cells = try_place_cage(used, start_row, start_col, size)

                if cage_cells and len(cage_cells) == size:
                    # Successfully placed the cage
                    for row, col in cage_cells:
                        used[row, col] = True
                        result[row, col] = cage_letter
                    placed = True
                    break

            if not placed:
                return None  # Failed to place this cage

        return result

    # Try multiple times to find a valid carving
    for attempt in range(max_attempts):
        result = attempt_carving()
        if result is not None:
            return result

    raise ValueError(
        f"Could not carve square after {max_attempts} attempts. Try different cage sizes or increase max_attempts."
    )


def get_cage_values(original_square, caged_square):
    """
    Debug function that returns the numbers in each cage.

    Args:
        original_square: A numpy array with the original numbers
        caged_square: A numpy array with ASCII letters marking each cage

    Returns:
        A dictionary mapping cage letters to lists of numbers in those cages
    """
    cage_values = {}
    n = original_square.shape[0]

    # Get all unique cage letters (excluding empty strings)
    unique_letters = set(caged_square.flatten())
    unique_letters.discard("")  # Remove empty string if present

    # For each cage letter, collect all the numbers in those positions
    for letter in unique_letters:
        values = []
        for i in range(n):
            for j in range(n):
                if caged_square[i, j] == letter:
                    values.append(int(original_square[i, j]))  # Convert to regular int
        cage_values[letter] = sorted(values)  # Sort for consistency

    return cage_values


def assign_operations(cage_values):
    """
    Assign mathematical operations to cages based on their values.

    Args:
        cage_values: Dictionary mapping cage letters to lists of numbers

    Returns:
        Dictionary mapping cage letters to tuples of (operation, target_value)
        where operation is one of '+', '-', '*', '÷'
    """
    cage_operations = {}

    def get_division_candidates(values):
        """Find valid division operations with small integer results"""
        if len(values) != 2:
            return []

        candidates = []
        a, b = values[0], values[1]

        # Check both directions
        if a != 0 and b % a == 0:
            result = b // a
            # Allow results 1-2, and also allow division by 1 if result is 2 or 3
            if 1 <= result <= 2 or (a == 1 and result in [2, 3]):
                candidates.append(("÷", result))

        if b != 0 and a % b == 0:
            result = a // b
            # Allow results 1-2, and also allow division by 1 if result is 2 or 3
            if 1 <= result <= 2 or (b == 1 and result in [2, 3]):
                candidates.append(("÷", result))

        return candidates

    def get_subtraction_candidates(values):
        """Find valid subtraction operations"""
        if len(values) != 2:
            return []

        result = abs(values[1] - values[0])
        if result > 0:  # Avoid 0 results
            return [("-", result)]
        return []

    def get_multiplication_result(values):
        """Calculate multiplication result"""
        result = 1
        for val in values:
            result *= val
        return result

    def get_addition_result(values):
        """Calculate addition result"""
        return sum(values)

    # Process each cage
    for letter, values in cage_values.items():
        assigned = False

        # 1. Handle single-cell cages (no operation, just the value)
        if len(values) == 1:
            cage_operations[letter] = ("", values[0])
            assigned = True

        # 2. Try division first (only for 2-cell cages)
        if len(values) == 2 and not assigned:
            division_candidates = get_division_candidates(values)
            if division_candidates:
                # Pick the first valid division (they're all good)
                cage_operations[letter] = division_candidates[0]
                assigned = True

        # 3. Try subtraction (only for 2-cell cages)
        if len(values) == 2 and not assigned:
            subtraction_candidates = get_subtraction_candidates(values)
            if subtraction_candidates:
                cage_operations[letter] = subtraction_candidates[0]
                assigned = True

        # 4. For larger cages or remaining 2-cell cages, use multiplication or addition
        if not assigned:
            mult_result = get_multiplication_result(values)
            add_result = get_addition_result(values)

            # Prefer multiplication for smaller results (more interesting puzzles)
            # But avoid very large multiplication results
            if len(values) >= 3:
                # For 3+ cells, strongly prefer addition unless multiplication is reasonable
                if mult_result <= 50:  # Reasonable multiplication threshold
                    cage_operations[letter] = ("*", mult_result)
                else:
                    cage_operations[letter] = ("+", add_result)
            else:
                # For 2-cell cages, choose between multiplication and addition
                if mult_result <= 20:  # Smaller threshold for 2-cell cages
                    cage_operations[letter] = ("*", mult_result)
                else:
                    cage_operations[letter] = ("+", add_result)

    return cage_operations


def analyze_division_possibilities(cage_values):
    """
    Debug function to analyze what division operations are possible.
    """
    print("Division Analysis:")
    division_results = {}

    for letter, values in cage_values.items():
        if len(values) == 2:
            a, b = values[0], values[1]

            # Check both directions
            if a != 0 and b % a == 0:
                result = b // a
                if result not in division_results:
                    division_results[result] = []
                division_results[result].append(f"{letter}: {b}÷{a}={result}")

            if b != 0 and a % b == 0:
                result = a // b
                if result not in division_results:
                    division_results[result] = []
                division_results[result].append(f"{letter}: {a}÷{b}={result}")

    for result in sorted(division_results.keys()):
        print(f"  Division result {result}:")
        for example in division_results[result]:
            print(f"    {example}")

    return division_results


def create_kenken_puzzle(original_square, caged_square, cage_operations):
    """
    Create a structured KenKen puzzle object from the components.

    Args:
        original_square: A numpy array with the original numbers (solution)
        caged_square: A numpy array with ASCII letters marking each cage
        cage_operations: Dictionary mapping cage letters to (operation, target_value) tuples

    Returns:
        A dictionary containing the complete puzzle structure:
        {
            "cages": [
                {
                    "cells": [array of positional indexes],
                    "operation": "one of +, -, *, /",
                    "value": target_value
                }
            ],
            "size": integer,
            "solution": [[row arrays]]
        }
    """
    n = original_square.shape[0]

    # Convert operation symbols
    operation_map = {"": "", "+": "+", "-": "-", "*": "*", "÷": "/"}

    # Get all unique cage letters
    unique_letters = set(caged_square.flatten())
    unique_letters.discard("")  # Remove empty string if present

    cages = []

    # Process each cage
    for letter in sorted(unique_letters):
        # Find all cells belonging to this cage
        cage_cells = []
        for i in range(n):
            for j in range(n):
                if caged_square[i, j] == letter:
                    # Convert to positional index (row * size + col)
                    pos_index = i * n + j
                    cage_cells.append(pos_index)

        # Get operation and value for this cage
        operation_symbol, target_value = cage_operations[letter]

        # Create cage object
        cage = {
            "cells": sorted(cage_cells),  # Sort for consistency
            "operation": operation_map[operation_symbol],
            "value": target_value,
        }
        cages.append(cage)

    # Convert solution to regular Python lists (from numpy)
    solution = original_square.tolist()

    # Create the complete puzzle object
    puzzle = {"cages": cages, "size": n, "solution": solution}

    return puzzle


def generate_kenken_puzzle(
    size,
    difficulty: Literal["easiest", "easy", "medium", "hard", "expert"] = "medium",
    max_attempts=500,
    max_difficulty_attempts=20,
):
    """
    Generate a complete KenKen puzzle of the specified size and difficulty.

    Args:
        size: The size of the square (e.g., 7 for a 7x7 puzzle)
        difficulty: Difficulty level based on percentiles - "easiest", "easy", "medium", "hard", "expert"
        max_attempts: Maximum attempts for carving the square into cages
        max_difficulty_attempts: Maximum attempts to find a puzzle in the target difficulty range

    Returns:
        A dictionary containing the complete puzzle structure:
        {
            "cages": [
                {
                    "cells": [array of positional indexes],
                    "operation": "one of +, -, *, /",
                    "value": target_value
                }
            ],
            "size": integer,
            "solution": [[row arrays]],
            "difficulty_operations": integer,  # Actual difficulty found
            "target_difficulty_range": (min, max)  # Target range for this difficulty
        }
    """
    # Get target difficulty range for this size and difficulty level
    target_min, target_max = _get_difficulty_range(size, difficulty)

    best_puzzle = None
    best_difference = float("inf")

    for attempt in range(max_difficulty_attempts):
        app.logger.info(f"Attempt {attempt} of {max_difficulty_attempts}")
        try:
            # Generate a basic puzzle
            app.logger.info(f"Generating basic puzzle for size {size}")
            puzzle = _generate_basic_puzzle(size, max_attempts)

            # Measure its difficulty
            app.logger.info(f"Solving puzzle for size {size}")
            actual_difficulty = solve_kenken_puzzle(puzzle)
            app.logger.info(f"Actual difficulty: {actual_difficulty}")

            # Check if it's in our target range
            app.logger.info(
                f"Checking if puzzle is in target range: {target_min} <= {actual_difficulty} <= {target_max}"
            )
            if target_min <= actual_difficulty <= target_max:
                # Perfect match - add metadata and return
                puzzle["difficulty_operations"] = actual_difficulty
                puzzle["target_difficulty_range"] = (target_min, target_max)
                return puzzle

            # Track the best attempt so far
            app.logger.info(f"Tracking best attempt so far: {best_difference}")
            if target_min <= actual_difficulty:
                difference = actual_difficulty - target_max
            else:
                difference = target_min - actual_difficulty

            app.logger.info(f"Difference: {difference}")
            if difference < best_difference:
                best_difference = difference
                best_puzzle = puzzle
                best_puzzle["difficulty_operations"] = actual_difficulty
                best_puzzle["target_difficulty_range"] = (target_min, target_max)
                app.logger.info(f"New best puzzle: {best_puzzle}")

        except Exception as e:
            app.logger.error(f"Error in attempt {attempt}: {e}")
            # Skip failed generations (multiple solutions, carving failures, etc.)
            continue

    if best_puzzle is not None:
        # Return the closest match we found
        return best_puzzle
    else:
        # If we couldn't generate anything, fall back to basic generation
        puzzle = _generate_basic_puzzle(size, max_attempts)
        actual_difficulty = solve_kenken_puzzle(puzzle)
        puzzle["difficulty_operations"] = actual_difficulty
        puzzle["target_difficulty_range"] = (target_min, target_max)
        return puzzle


def _generate_basic_puzzle(size, max_attempts=500):
    """Generate a basic KenKen puzzle without difficulty filtering."""
    # Generate Latin square
    square = get_latin_square(size, max_steps=1000)

    # Generate cage sizes that sum to size^2
    total_cells = size * size
    cage_sizes = dict(
        zip(
            string.ascii_uppercase,
            weighted_partition_sample([5, 20, 5, 7, 1], total_cells),
        )
    )

    # Carve the square into cages
    caged_square = carve_square(square, cage_sizes, max_attempts=max_attempts)

    # Get the values in each cage
    cage_values = get_cage_values(square, caged_square)

    # Assign operations to each cage
    cage_operations = assign_operations(cage_values)

    # Create the final puzzle structure
    puzzle = create_kenken_puzzle(square, caged_square, cage_operations)

    return puzzle


def _get_difficulty_range(size, difficulty_level):
    """
    Get the operation count range for a given difficulty level and puzzle size.

    Args:
        size: Puzzle size (4, 5, 6, 7, etc.)
        difficulty_level: One of 'easiest', 'easy', 'medium', 'hard', 'expert'

    Returns:
        (min_operations, max_operations) tuple
    """
    # Updated empirical percentile data from human-aligned difficulty system
    empirical_percentiles = {
        4: {0: 10, 20: 16, 40: 18, 60: 20, 80: 22, 100: 29},
        5: {0: 16, 20: 24, 40: 26, 60: 28, 80: 30, 100: 40},
        6: {0: 28, 20: 35, 40: 37, 60: 39, 80: 42, 100: 55},
        7: {0: 38, 20: 47, 40: 50, 60: 52, 80: 55, 100: 65},
    }

    # Difficulty level to percentile mapping
    difficulty_ranges = {
        "easiest": (0, 20),
        "easy": (20, 40),
        "medium": (40, 60),
        "hard": (60, 80),
        "expert": (80, 100),
    }

    if difficulty_level not in difficulty_ranges:
        raise ValueError(
            f"Invalid difficulty level: {difficulty_level}. Must be one of {list(difficulty_ranges.keys())}"
        )

    min_percentile, max_percentile = difficulty_ranges[difficulty_level]

    if size in empirical_percentiles:
        # Use empirical data
        percentiles = empirical_percentiles[size]
        min_ops = percentiles[min_percentile]
        max_ops = percentiles[max_percentile]
    else:
        # Extrapolate for larger sizes using our exponential formula
        percentiles = _estimate_percentiles_for_size(size)
        min_ops = percentiles[min_percentile]
        max_ops = percentiles[max_percentile]

    return int(min_ops), int(max_ops)


def _estimate_percentiles_for_size(size):
    """Estimate percentile values for sizes not in our empirical data."""
    # Use our updated exponential formula: Operations ≈ 0.007 × 10.73^n (median estimate)
    median_estimate = 0.007 * (10.73**size)

    # Estimate variance based on observed pattern: variance grows with size
    # For 7x7, range was about 586K, median was 94K, so range/median ≈ 6.3
    # Much lower variance than the old solver!
    variance_ratio = 4 * (1.8 ** (size - 4))  # Growing variance

    min_estimate = max(1, median_estimate / variance_ratio)
    max_estimate = median_estimate * variance_ratio

    # Estimate percentiles assuming log-normal-ish distribution
    return {
        0: min_estimate,
        20: min_estimate + (median_estimate - min_estimate) * 0.3,
        40: min_estimate + (median_estimate - min_estimate) * 0.7,
        60: median_estimate + (max_estimate - median_estimate) * 0.2,
        80: median_estimate + (max_estimate - median_estimate) * 0.6,
        100: max_estimate,
    }


def solve_kenken_puzzle(puzzle):
    """
    Solve a KenKen puzzle and return the difficulty measured by number of operations.

    Args:
        puzzle: A dictionary containing the puzzle structure with cages, size, and solution

    Returns:
        int: The difficulty score (number of operations required to solve)

    Raises:
        ValueError: If the puzzle has no solution or more than one solution
    """
    size = puzzle["size"]
    cages = puzzle["cages"]

    # Initialize empty grid
    grid = [[0 for _ in range(size)] for _ in range(size)]

    # Parse cages into more useful format
    cage_map = {}  # cell_index -> cage_info
    cage_cells = {}  # cage_index -> list of cells
    for i, cage in enumerate(cages):
        cage_info = {
            "cells": cage["cells"],
            "operation": cage["operation"],
            "value": cage["value"],
            "index": i,
        }
        cage_cells[i] = cage["cells"]
        for cell in cage["cells"]:
            cage_map[cell] = cage_info

    operation_count = 0
    solutions_found = 0

    def pos_to_coords(pos):
        """Convert positional index to (row, col)"""
        return pos // size, pos % size

    def coords_to_pos(row, col):
        """Convert (row, col) to positional index"""
        return row * size + col

    def get_valid_numbers(grid, row, col):
        """Get list of valid numbers for a cell based on row/column constraints"""
        used_in_row = set(grid[row])
        used_in_col = set(grid[r][col] for r in range(size))
        used = used_in_row | used_in_col
        used.discard(0)  # Remove empty cells
        return [num for num in range(1, size + 1) if num not in used]

    def evaluate_cage_operation(values, operation):
        """Evaluate the result of the cage operation"""
        if not values:
            return None

        if operation == "":
            if len(values) == 1:
                return values[0]
            return None

        if operation == "+":
            return sum(values)
        elif operation == "-":
            if len(values) == 2:
                return abs(values[0] - values[1])
            return None
        elif operation == "*":
            result = 1
            for v in values:
                result *= v
            return result
        elif operation == "/":
            if len(values) != 2:
                return None
            a, b = values[0], values[1]
            if a != 0 and b % a == 0:
                return b // a
            elif b != 0 and a % b == 0:
                return a // b
            else:
                return None
        return None

    def is_cage_valid(cage_info, grid):
        """Check if current cage state is valid (complete or potentially valid)"""
        # Get current values in cage
        values = []
        empty_cells = 0

        for cell in cage_info["cells"]:
            row, col = pos_to_coords(cell)
            if grid[row][col] == 0:
                empty_cells += 1
            else:
                values.append(grid[row][col])

        # If cage is empty, it's potentially valid
        if not values:
            return True

        # If cage is complete, check exact match
        if empty_cells == 0:
            expected = cage_info["value"]
            actual = evaluate_cage_operation(values, cage_info["operation"])
            return actual is not None and actual == expected

        # If cage is partial, check if it could be valid
        if cage_info["operation"] == "":
            # For single-cell cages, the value must match exactly
            if len(cage_info["cells"]) == 1 and len(values) == 1:
                return values[0] == cage_info["value"]
            return len(cage_info["cells"]) == 1
        elif cage_info["operation"] == "+":
            # Current sum shouldn't exceed target
            return sum(values) <= cage_info["value"]
        elif cage_info["operation"] == "*":
            # Current product shouldn't exceed target
            product = 1
            for v in values:
                product *= v
            return product <= cage_info["value"]
        elif cage_info["operation"] == "-":
            # For subtraction, we need exactly 2 values
            if len(cage_info["cells"]) != 2:
                return False
            if len(values) == 1:
                # One value is set, check if the other can work
                remaining = cage_info["value"]
                set_value = values[0]
                # Other value could be set_value + remaining or set_value - remaining
                other1 = set_value + remaining
                other2 = set_value - remaining
                return (1 <= other1 <= size) or (1 <= other2 <= size)
            return True
        elif cage_info["operation"] == "/":
            # For division, we need exactly 2 values
            if len(cage_info["cells"]) != 2:
                return False
            if len(values) == 1:
                # One value is set, check if the other can work
                target = cage_info["value"]
                set_value = values[0]
                # Other value could be set_value * target or set_value / target
                other1 = set_value * target
                other2 = (
                    set_value // target
                    if target != 0 and set_value % target == 0
                    else 0
                )
                return (1 <= other1 <= size) or (
                    1 <= other2 <= size and other2 * target == set_value
                )
            return True

        return True

    def find_best_empty_cell(grid):
        """Find the empty cell with the fewest valid options (Most Constrained Variable heuristic)"""
        best_cell = None
        min_options = size + 1

        for row in range(size):
            for col in range(size):
                if grid[row][col] == 0:
                    valid_nums = get_valid_numbers(grid, row, col)
                    if len(valid_nums) < min_options:
                        min_options = len(valid_nums)
                        best_cell = (row, col, valid_nums)
                        if min_options == 1:  # Can't get better than this
                            return best_cell

        return best_cell

    def solve_recursive(grid, max_solutions=2):
        """Recursive backtracking solver that can count solutions and solve simultaneously"""
        nonlocal operation_count, solutions_found
        operation_count += 1

        # Find next empty cell with fewest options
        cell_info = find_best_empty_cell(grid)
        if cell_info is None:
            # Grid is complete, verify all cages are valid
            valid = True
            checked_cages = set()
            for cage_info in cage_map.values():
                if cage_info["index"] not in checked_cages:
                    if not is_cage_valid(cage_info, grid):
                        valid = False
                        break
                    checked_cages.add(cage_info["index"])

            if valid:
                solutions_found += 1
                return (
                    solutions_found < max_solutions
                )  # Continue searching if we need more solutions
            return True  # Continue searching

        row, col, valid_nums = cell_info

        # If no valid numbers, this path is invalid
        if not valid_nums:
            return True  # Continue searching

        # Try each valid number
        for num in valid_nums:
            # Place the number
            grid[row][col] = num

            # Check if this placement keeps the affected cage valid
            pos = coords_to_pos(row, col)
            cage_info = cage_map[pos]

            if is_cage_valid(cage_info, grid):
                # Recursively solve
                should_continue = solve_recursive(grid, max_solutions)
                if not should_continue:  # Found enough solutions
                    grid[row][col] = 0  # Backtrack
                    return False

            # Backtrack
            grid[row][col] = 0

        return True  # Continue searching

    # Solve once, counting solutions and measuring difficulty
    solve_recursive(grid)

    if solutions_found == 0:
        raise ValueError("Puzzle has no valid solution")
    elif solutions_found > 1:
        raise ValueError(
            f"Puzzle has {solutions_found} solutions, but should have exactly one"
        )

    return operation_count


def verify_solution(puzzle):
    """
    Verify that the provided solution is valid for the puzzle.

    Args:
        puzzle: A dictionary containing the puzzle structure

    Returns:
        bool: True if the solution is valid, False otherwise
    """
    size = puzzle["size"]
    solution = puzzle["solution"]
    cages = puzzle["cages"]

    # Check Latin square constraints
    for i in range(size):
        row_values = set(solution[i])
        col_values = set(solution[j][i] for j in range(size))

        if len(row_values) != size or row_values != set(range(1, size + 1)):
            print(f"Row {i} constraint violated: {solution[i]}")
            return False
        if len(col_values) != size or col_values != set(range(1, size + 1)):
            print(
                f"Column {i} constraint violated: {[solution[j][i] for j in range(size)]}"
            )
            return False

    # Check cage constraints
    for cage in cages:
        cage_values = []
        for cell in cage["cells"]:
            row = cell // size
            col = cell % size
            cage_values.append(solution[row][col])

        operation = cage["operation"]
        expected = cage["value"]

        if operation == "":
            if len(cage_values) != 1 or cage_values[0] != expected:
                print(
                    f"Single cell cage constraint violated: {cage_values} should be {expected}"
                )
                return False
        elif operation == "+":
            if sum(cage_values) != expected:
                print(
                    f"Addition cage constraint violated: {cage_values} sum should be {expected}, got {sum(cage_values)}"
                )
                return False
        elif operation == "-":
            if (
                len(cage_values) != 2
                or abs(cage_values[0] - cage_values[1]) != expected
            ):
                print(
                    f"Subtraction cage constraint violated: {cage_values} difference should be {expected}, got {abs(cage_values[0] - cage_values[1])}"
                )
                return False
        elif operation == "*":
            product = 1
            for v in cage_values:
                product *= v
            if product != expected:
                print(
                    f"Multiplication cage constraint violated: {cage_values} product should be {expected}, got {product}"
                )
                return False
        elif operation == "/":
            if len(cage_values) != 2:
                print(
                    f"Division cage constraint violated: {cage_values} should have exactly 2 values"
                )
                return False
            a, b = cage_values[0], cage_values[1]
            if a != 0 and b % a == 0 and b // a == expected:
                continue
            elif b != 0 and a % b == 0 and a // b == expected:
                continue
            else:
                print(
                    f"Division cage constraint violated: {cage_values} should divide to {expected}"
                )
                return False

    return True


if __name__ == "__main__":
    # Generate a 5x5 KenKen puzzle for easier testing
    puzzle = generate_kenken_puzzle(5)

    print("Generated KenKen Puzzle:")
    print(json.dumps(puzzle, indent=2))

    # Optional: Show some debug information
    print(f"\nPuzzle Size: {puzzle['size']}x{puzzle['size']}")
    print(f"Number of Cages: {len(puzzle['cages'])}")

    # Count operations
    operations = {}
    for cage in puzzle["cages"]:
        op = cage["operation"]
        operations[op] = operations.get(op, 0) + 1

    print("Operation Distribution:")
    for op, count in sorted(operations.items()):
        op_name = op if op else "none"
        print(f"  {op_name}: {count} cages")

    # First verify the provided solution is valid
    print("\nVerifying generated solution:")
    if verify_solution(puzzle):
        print("Generated solution is valid!")
    else:
        print("Generated solution is INVALID!")

    # Test the solver
    print("\nTesting Solver:")
    try:
        difficulty = solve_kenken_puzzle(puzzle)
        print(f"Puzzle solved successfully!")
        print(f"Difficulty score (operations required): {difficulty}")

        # Categorize difficulty
        if difficulty < 100:
            difficulty_level = "Easy"
        elif difficulty < 500:
            difficulty_level = "Medium"
        elif difficulty < 2000:
            difficulty_level = "Hard"
        else:
            difficulty_level = "Expert"

        print(f"Difficulty level: {difficulty_level}")

    except ValueError as e:
        print(f"Solver error: {e}")

    # Test with multiple smaller puzzles to show difficulty range
    print("\nTesting different puzzle sizes:")
    for size in [4, 5, 6]:
        try:
            small_puzzle = generate_kenken_puzzle(size)
            difficulty = solve_kenken_puzzle(small_puzzle)
            print(f"{size}x{size} puzzle difficulty: {difficulty}")
        except Exception as e:
            print(f"{size}x{size} puzzle failed: {e}")
