import logging
import random
from collections import deque
from typing import Literal, Optional

import numpy as np
import json

logger = logging.getLogger(__name__)

try:
    from .latin_square import get_latin_square
    from .solver import Deadline, DeadlineExceeded, SolveStats, count_solutions, solve_puzzle
    from .validation import validate_puzzle
except ImportError:
    from latin_square import get_latin_square
    from solver import Deadline, DeadlineExceeded, SolveStats, count_solutions, solve_puzzle
    from validation import validate_puzzle

DIFFICULTY_ORDER = ["easiest", "easy", "medium", "hard", "expert"]

# Which operation symbols a bucket's cages may use. The public tier names are
# part of the corpus format (metadata.operations_tier) and the gallery filter.
OPERATIONS_TIERS = {
    "add": ["+"],
    "add-sub": ["+", "-"],
    "no-div": ["+", "-", "*"],
    "all": ["+", "-", "*", "/"],
}


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
            if norm == 0:
                break  # only zero-weight sizes fit; this attempt cannot finish
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
        cage_sizes: A dictionary mapping cage ids (positive integers) to their sizes
        max_attempts: Maximum attempts to find a valid carving

    Returns:
        A numpy int array with each cell holding its cage id; 0 never appears in
        a successful result because every cage is placed or the carve fails.
        Ids used to be letters, which capped a board at 26 cages and silently
        dropped the rest.
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
        result = np.zeros((n, n), dtype=int)
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

    unique_letters = {int(v) for v in caged_square.flatten()}
    unique_letters.discard(0)  # 0 marks an uncarved cell

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

    unique_letters = {int(v) for v in caged_square.flatten()}
    unique_letters.discard(0)  # 0 marks an uncarved cell

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


def evaluate_candidate(puzzle: dict, deadline: Optional[Deadline] = None) -> Optional[SolveStats]:
    """Accept or reject one candidate; the single place that decides.

    Order is by cost. Structural validation is microseconds. `count_solutions`
    is the expensive step, and it is also the one that rejects most often, so
    it runs before the technique trace rather than after it - the trace of a
    puzzle that turns out to have two solutions is wasted work. The trace then
    runs with uniqueness verification off (it would only repeat the count),
    and acceptance is:

        count_solutions == 1  AND  the trace completed to the stored solution

    `stats.is_valid` and `solution_count` are set from the count so callers
    that read them keep working; with verification off the solver itself
    reports neither.

    Returns the stats on acceptance, None on rejection. `DeadlineExceeded`
    propagates - the caller decides what a deadline means for it.
    """
    errors = validate_puzzle(puzzle)
    if errors:
        logger.warning("Rejected malformed candidate: %s", "; ".join(errors[:3]))
        return None

    if count_solutions(puzzle, 2, deadline=deadline) != 1:
        logger.info("Rejected candidate: not uniquely solvable")
        return None

    stats = solve_puzzle(puzzle, verify_uniqueness=False, deadline=deadline)
    if not stats.solved:
        # The counter says one solution exists but the trace did not reach it.
        # That is a solver defect, not a bad puzzle; surface it rather than
        # quietly counting it as a rejection.
        logger.error("Trace failed to reach the unique solution; solver defect suspected")
        return None

    stats.solution_count = 1
    stats.is_valid = True
    return stats


def _annotate(puzzle: dict, stats: SolveStats) -> dict:
    puzzle["actual_difficulty"] = stats.difficulty_level
    puzzle["difficulty_score"] = stats.difficulty_score
    puzzle["techniques_used"] = {t.name: c for t, c in stats.techniques_used.items()}
    return puzzle


def generate_arithmatrix_puzzle(
    size,
    difficulty: Literal["easiest", "easy", "medium", "hard", "expert"] = "medium",
    max_attempts=500,
    max_difficulty_attempts=50,
    allowed_operations=None,
    deadline: Optional[Deadline] = None,
) -> Optional[dict]:
    """
    Generate a uniquely solvable Arithmatrix puzzle of the given size, aiming
    for the given difficulty.

    Every candidate goes through `evaluate_candidate`; nothing is returned that
    has not passed it. When no candidate hits the target difficulty within
    `max_difficulty_attempts`, the accepted candidate closest to the target is
    returned instead, labelled with its *actual* difficulty. When nothing was
    accepted at all, or the deadline passed first, the result is None: an
    explicit failure, never an unvalidated puzzle. (This used to fall through
    to a "last resort" that returned whatever it had, uniqueness or not, and
    without technique metadata - the source of 2696 corpus records with empty
    `techniques_used`.)

    There is no longer a heuristic pre-filter. The one this had rejected every
    easy 6x6 and 7x7 candidate and passed every hard one, so it only ever
    forced requests onto the unsafe path.

    Args:
        size: Grid size
        difficulty: Target difficulty level
        max_attempts: Carving attempts per candidate
        max_difficulty_attempts: Candidates to try before settling for the closest
        allowed_operations: Operation symbols the cages may use, or None for all
        deadline: Optional wall-clock cutoff, honoured inside the solver loops

    Returns:
        The puzzle dict with `actual_difficulty`, `difficulty_score` and
        `techniques_used`, or None.
    """
    target_idx = DIFFICULTY_ORDER.index(difficulty)

    best_puzzle: Optional[dict] = None
    best_distance = float("inf")
    rejected = 0

    for attempt in range(max_difficulty_attempts):
        logger.info(f"Attempt {attempt + 1} of {max_difficulty_attempts}")
        if deadline is not None and deadline.expired():
            logger.info("Deadline reached before a candidate hit the target")
            break
        try:
            puzzle = _generate_basic_puzzle(size, max_attempts, allowed_operations, difficulty)
        except ValueError as e:
            # Carving could not tile this partition; an ordinary re-roll.
            logger.info(f"Carve failed: {e}")
            rejected += 1
            continue

        try:
            stats = evaluate_candidate(puzzle, deadline)
        except DeadlineExceeded:
            logger.info("Deadline reached mid-solve")
            break
        if stats is None:
            rejected += 1
            continue

        _annotate(puzzle, stats)
        logger.info(f"Solved: {stats.difficulty_level} (score: {stats.difficulty_score:.1f})")

        if stats.difficulty_level == difficulty:
            logger.info(f"Found matching puzzle after {attempt + 1} candidates ({rejected} rejected)")
            return puzzle

        distance = abs(DIFFICULTY_ORDER.index(stats.difficulty_level) - target_idx)
        if distance < best_distance:
            best_distance = distance
            best_puzzle = puzzle

    if best_puzzle is not None:
        logger.info(f"Returning closest match: {best_puzzle['actual_difficulty']} (target {difficulty})")
        return best_puzzle

    logger.warning(f"No acceptable {size}x{size} puzzle found for {difficulty} ({rejected} candidates rejected)")
    return None


# Cage-size weights for [1-cell, 2-cell, 3-cell, 4-cell, 5-cell] cages,
# conditioned on target difficulty. Harder difficulties get fewer 1-cell
# gimmes and more 3-5 cell cages, which give the solver positional work
# (intersection/multi-cage line locks/elbow techniques). 5-cell cages stay
# extremely rare regardless — they tend to be visually unwieldy and the
# carver struggles to place them cleanly.
#
# Single-cell (stipulated) cages are kept low everywhere: they're free givens
# that make a puzzle tedious rather than interestingly easy. The actual count
# is also hard-capped (see _max_single_cages) so weight variance can't produce
# a board that's a quarter pre-filled. Easiest puzzles get their ease from
# small, tightly-constrained 2-cell cages, not from freebies.
_CAGE_SIZE_WEIGHTS = {
    "easiest": [8, 34, 16, 6, 1],
    "easy":    [6, 32, 20, 10, 1],
    "medium":  [4, 30, 22, 15, 1],
    "hard":    [3, 25, 26, 18, 2],
    "expert":  [2, 20, 28, 22, 2],
}


def _max_single_cages(size: int) -> int:
    """Hard cap on single-cell (stipulated) cages: ~10% of cells, min 1.

    Yields 2 (4x4), 2 (5x5), 4 (6x6), 5 (7x7) — enough for a gentle foothold,
    far from the ~22% the unconstrained weights used to produce. The shipped
    corpus was generated under this table, so it is the rule; an older
    docstring here claimed 1/2/3/4.
    """
    return max(1, round(0.10 * size * size))


def _generate_basic_puzzle(size, max_attempts=500, allowed_operations=None, difficulty="medium"):
    """Generate a basic Arithmatrix puzzle without difficulty filtering."""
    # Generate Latin square (uses pooled squares with adaptive isotopy for speed)
    square = get_latin_square(size)

    # Generate cage sizes that sum to size^2 and carve them. We re-roll the
    # size partition when either (a) it has too many single-cell cages, or
    # (b) the carver can't fit the specific combo (the harder, 4-cell-heavy
    # distributions occasionally just don't tile).
    total_cells = size * size
    weights = _CAGE_SIZE_WEIGHTS.get(difficulty, _CAGE_SIZE_WEIGHTS["medium"])
    max_singles = _max_single_cages(size)

    last_err: Exception | None = None
    for _ in range(20):
        partition = weighted_partition_sample(weights, total_cells)
        if partition is None:
            continue
        if sum(1 for s in partition if s == 1) > max_singles:
            continue  # too many stipulated cells; re-roll
        cage_sizes = {cage_id: cage_size for cage_id, cage_size in enumerate(partition, start=1)}
        try:
            caged_square = carve_square(square, cage_sizes, max_attempts=max_attempts)
            break
        except ValueError as e:
            last_err = e
            continue
    else:
        raise last_err or ValueError("carve_square failed for all re-rolled cage-size combinations")

    uncovered = int((caged_square == 0).sum())
    if uncovered:
        raise ValueError(f"carve_square left {uncovered} cell(s) without a cage")

    # Get the values in each cage
    cage_values = get_cage_values(square, caged_square)

    # Assign operations to each cage
    cage_operations = assign_operations(cage_values, allowed_operations)

    # Create the final puzzle structure
    puzzle = create_arithmatrix_puzzle(square, caged_square, cage_operations)

    return puzzle


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
