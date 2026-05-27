import logging
import random
import string
from collections import deque
from typing import Literal

import numpy as np
import json

logger = logging.getLogger(__name__)

try:
    from .latin_square import get_latin_square
    from .solver import solve_puzzle, estimate_difficulty_fast as _estimate_fast, SolveStats
except ImportError:
    from latin_square import get_latin_square
    from solver import solve_puzzle, estimate_difficulty_fast as _estimate_fast, SolveStats


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
        """Try to place a cage of target_size starting from the given position.

        Growth prefers cells with more unused neighbors (so we don't fragment
        the board) AND breaks strict linearity when possible — for cages of
        size 3+ we'd rather have an L/T/blob than a perfect line, since
        non-linear cages create the positional constraints (elbow-style
        intersections, multi-cage line locks) the new solver relies on.
        """
        if used[start_row, start_col]:
            return None

        cage_cells = [(start_row, start_col)]
        used_temp = used.copy()
        used_temp[start_row, start_col] = True

        def is_line_after_add(candidate):
            """1 if adding `candidate` keeps the cage on a single row/col, else 0."""
            rows = {r for r, _ in cage_cells} | {candidate[0]}
            cols = {c for _, c in cage_cells} | {candidate[1]}
            return 1 if (len(rows) == 1 or len(cols) == 1) else 0

        # Grow the cage one cell at a time
        while len(cage_cells) < target_size:
            best_candidates = []
            existing = set(cage_cells)

            for row, col in cage_cells:
                neighbors = get_neighbors(row, col, used_temp)
                for nr, nc in neighbors:
                    if (nr, nc) not in existing:
                        future_neighbors = len(get_neighbors(nr, nc, used_temp))
                        line_penalty = is_line_after_add((nr, nc))
                        best_candidates.append((nr, nc, future_neighbors, line_penalty))

            if not best_candidates:
                return None

            # Primary key: more unused future neighbors (avoid fragmenting board).
            # Secondary key: non-line preferred (break perfect linearity).
            # Tertiary: random jitter so equal-rank candidates rotate.
            best_candidates.sort(
                key=lambda x: (x[2], -x[3], random.random()), reverse=True
            )

            next_row, next_col, _, _ = best_candidates[0]
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


def assign_operations(cage_values, allowed_operations=None):
    """
    Assign mathematical operations to cages based on their values.

    Args:
        cage_values: Dictionary mapping cage letters to lists of numbers
        allowed_operations: Optional list of allowed operations (e.g. ['+', '-']).
            If None, all operations are allowed. '+' is always implicitly allowed
            as the final fallback.

    Returns:
        Dictionary mapping cage letters to tuples of (operation, target_value)
        where operation is one of '+', '-', '*', '÷'
    """
    # Normalize allowed operations
    if allowed_operations is not None:
        allowed = set(allowed_operations)
        # Map frontend symbols to internal symbols
        if '/' in allowed:
            allowed.add('÷')
    else:
        allowed = {'+', '-', '*', '÷', '/'}

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
        if len(values) == 2 and not assigned and ('÷' in allowed or '/' in allowed):
            division_candidates = get_division_candidates(values)
            if division_candidates:
                cage_operations[letter] = division_candidates[0]
                assigned = True

        # 3. Try subtraction (only for 2-cell cages)
        if len(values) == 2 and not assigned and '-' in allowed:
            subtraction_candidates = get_subtraction_candidates(values)
            if subtraction_candidates:
                cage_operations[letter] = subtraction_candidates[0]
                assigned = True

        # 4. For larger cages or remaining 2-cell cages, use multiplication or addition
        if not assigned:
            mult_result = get_multiplication_result(values)
            add_result = get_addition_result(values)

            if '*' in allowed:
                if len(values) >= 3:
                    if mult_result <= 50:
                        cage_operations[letter] = ("*", mult_result)
                    else:
                        cage_operations[letter] = ("+", add_result)
                else:
                    if mult_result <= 20:
                        cage_operations[letter] = ("*", mult_result)
                    else:
                        cage_operations[letter] = ("+", add_result)
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


def create_arithmatrix_puzzle(original_square, caged_square, cage_operations):
    """
    Create a structured Arithmatrix puzzle object from the components.

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


def generate_arithmatrix_puzzle(
    size,
    difficulty: Literal["easiest", "easy", "medium", "hard", "expert"] = "medium",
    max_attempts=500,
    max_difficulty_attempts=50,
    use_heuristic=True,
    allowed_operations=None,
):
    """
    Generate a complete Arithmatrix puzzle of the specified size and difficulty.

    Uses a technique-based solver to measure difficulty:
    - easiest: Solvable with naked singles only
    - easy: Needs hidden singles
    - medium: Needs basic cage arithmetic
    - hard: Needs advanced cage reasoning
    - expert: Requires trial and error (backtracking)

    Args:
        size: The size of the square (e.g., 7 for a 7x7 puzzle)
        difficulty: Target difficulty level
        max_attempts: Maximum attempts for carving the square into cages
        max_difficulty_attempts: Maximum attempts to find a puzzle at target difficulty

    Returns:
        A dictionary containing the complete puzzle structure with difficulty metadata
    """
    # Difficulty level ordering for "close match" logic
    difficulty_order = ["easiest", "easy", "medium", "hard", "expert"]
    target_idx = difficulty_order.index(difficulty)

    best_puzzle = None
    best_distance = float("inf")
    heuristic_filtered = 0

    for attempt in range(max_difficulty_attempts):
        logger.info(f"Attempt {attempt + 1} of {max_difficulty_attempts}")
        try:
            # Generate a basic puzzle (cage-size distribution depends on target difficulty)
            puzzle = _generate_basic_puzzle(size, max_attempts, allowed_operations, difficulty)

            # Use heuristic for initial filtering
            if use_heuristic:
                est_level, est_score = _estimate_fast(puzzle)
                est_idx = difficulty_order.index(est_level)

                # Skip if estimate is more than 1 level away from target
                if abs(est_idx - target_idx) > 1:
                    heuristic_filtered += 1
                    logger.info(f"Filtered by heuristic: {est_level} (target: {difficulty})")
                    continue

            # Full solve to get actual difficulty
            stats = solve_puzzle(puzzle)

            if not stats.is_valid:
                logger.info("Invalid puzzle (no unique solution)")
                continue

            actual_level = stats.difficulty_level
            actual_score = stats.difficulty_score
            actual_idx = difficulty_order.index(actual_level)

            logger.info(f"Solved: {actual_level} (score: {actual_score:.1f})")

            # Add difficulty metadata
            puzzle["actual_difficulty"] = actual_level
            puzzle["difficulty_score"] = actual_score
            puzzle["techniques_used"] = {t.name: c for t, c in stats.techniques_used.items()}

            # Check for exact match
            if actual_level == difficulty:
                logger.info(f"Found matching puzzle! (filtered {heuristic_filtered} by heuristic)")
                return puzzle

            # Track closest match
            distance = abs(actual_idx - target_idx)
            if distance < best_distance:
                best_distance = distance
                best_puzzle = puzzle

        except Exception as e:
            logger.error(f"Error in attempt {attempt}: {e}")
            continue

    # Return best match or generate one more
    if best_puzzle is not None:
        logger.info(f"Returning closest match: {best_puzzle.get('actual_difficulty')}")
        return best_puzzle

    # Last resort: return any valid puzzle
    logger.info("Falling back to basic generation")
    puzzle = _generate_basic_puzzle(size, max_attempts, allowed_operations, difficulty)
    stats = solve_puzzle(puzzle)
    puzzle["actual_difficulty"] = stats.difficulty_level if stats.is_valid else "unknown"
    puzzle["difficulty_score"] = stats.difficulty_score
    return puzzle


# Cage-size weights for [1-cell, 2-cell, 3-cell, 4-cell, 5-cell] cages,
# conditioned on target difficulty. Harder difficulties get fewer 1-cell
# gimmes and more 3-5 cell cages, which give the solver positional work
# (intersection/multi-cage line locks/elbow techniques). 5-cell cages stay
# extremely rare regardless — they tend to be visually unwieldy and the
# carver struggles to place them cleanly.
_CAGE_SIZE_WEIGHTS = {
    "easiest": [20, 30, 12, 6, 1],
    "easy":    [15, 30, 18, 10, 1],
    "medium":  [10, 30, 20, 15, 1],
    "hard":    [6,  28, 25, 18, 2],
    "expert":  [4,  22, 28, 22, 2],
}


def _generate_basic_puzzle(size, max_attempts=500, allowed_operations=None, difficulty="medium"):
    """Generate a basic Arithmatrix puzzle without difficulty filtering."""
    # Generate Latin square (uses pooled squares with adaptive isotopy for speed)
    square = get_latin_square(size)

    # Generate cage sizes that sum to size^2 and carve them — if a specific
    # cage-size combo turns out to be un-carvable (the harder difficulties
    # produce 4-cell-heavy distributions that occasionally just don't fit),
    # re-roll the sizes a few times before giving up.
    total_cells = size * size
    weights = _CAGE_SIZE_WEIGHTS.get(difficulty, _CAGE_SIZE_WEIGHTS["medium"])

    last_err: Exception | None = None
    for _ in range(8):
        cage_sizes = dict(
            zip(
                string.ascii_uppercase,
                weighted_partition_sample(weights, total_cells),
            )
        )
        try:
            caged_square = carve_square(square, cage_sizes, max_attempts=max_attempts)
            break
        except ValueError as e:
            last_err = e
            continue
    else:
        raise last_err or ValueError("carve_square failed for all re-rolled cage-size combinations")

    # Get the values in each cage
    cage_values = get_cage_values(square, caged_square)

    # Assign operations to each cage
    cage_operations = assign_operations(cage_values, allowed_operations)

    # Create the final puzzle structure
    puzzle = create_arithmatrix_puzzle(square, caged_square, cage_operations)

    return puzzle


def estimate_difficulty_fast(puzzle):
    """
    Estimate puzzle difficulty using cage structure heuristics.
    Much faster than full solve - use for initial filtering.

    Returns:
        tuple: (difficulty_level, score) where level is one of
               'easiest', 'easy', 'medium', 'hard', 'expert'
    """
    return _estimate_fast(puzzle)


def solve_arithmatrix_puzzle(puzzle):
    """
    Solve a puzzle and verify it has exactly one solution.

    Uses the new technique-based solver which is much faster.

    Args:
        puzzle: A dictionary containing the puzzle structure

    Returns:
        SolveStats: Statistics about the solve including difficulty

    Raises:
        ValueError: If the puzzle has no solution or more than one solution
    """
    stats = solve_puzzle(puzzle)

    if stats.solution_count == 0:
        raise ValueError("Puzzle has no valid solution")
    elif stats.solution_count > 1:
        raise ValueError(
            f"Puzzle has {stats.solution_count} solutions, but should have exactly one"
        )

    return stats


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
    # Generate a 5x5 Arithmatrix puzzle for easier testing
    puzzle = generate_arithmatrix_puzzle(5)

    print("Generated Arithmatrix Puzzle:")
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
        difficulty = solve_arithmatrix_puzzle(puzzle)
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
            small_puzzle = generate_arithmatrix_puzzle(size)
            difficulty = solve_arithmatrix_puzzle(small_puzzle)
            print(f"{size}x{size} puzzle difficulty: {difficulty}")
        except Exception as e:
            print(f"{size}x{size} puzzle failed: {e}")
