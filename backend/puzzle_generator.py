import random
from collections import deque  # Added for BFS


class KenkenGenerator:
    def __init__(
        self,
        size: int,
        operations: list[str] = ["+", "-", "*", "/"],
        difficulty: str = "medium",
    ):  # Added difficulty parameter
        self.size = size
        self.difficulty = difficulty.lower()  # Store difficulty
        self.grid = [[0 for _ in range(size)] for _ in range(size)]
        self.cages = []
        self._raw_cages = []
        self.operations = list(
            set(operations)
        )  # Store the provided list, ensure uniqueness
        # Basic validation: Ensure only valid ops are included?
        valid_ops = {"+", "-", "*", "/"}
        self.operations = [op for op in self.operations if op in valid_ops]
        if not self.operations:
            # Default to add/subtract if empty or invalid list provided
            self.operations = ["+", "-"]
            print(
                "Warning: Invalid or empty operations list provided, defaulting to ['+', '-']"
            )

    def _is_valid(self, row, col, num):
        # Check row and column constraints (Latin square)
        for i in range(self.size):
            if self.grid[row][i] == num or self.grid[i][col] == num:
                return False
        return True

    def _solve_grid(self, row=0, col=0):
        if row == self.size:
            # Reached end of grid, check cage constraints
            return True  # Grid filled successfully according to Latin square rules

        next_row, next_col = (row, col + 1) if col + 1 < self.size else (row + 1, 0)

        # If cell already filled (e.g., by partitioning logic or previous step), skip
        if self.grid[row][col] != 0:
            return self._solve_grid(next_row, next_col)

        nums = list(range(1, self.size + 1))
        random.shuffle(nums)

        for num in nums:
            if self._is_valid(row, col, num):
                self.grid[row][col] = num
                # Optional: Add partial cage validity check here for early pruning
                if self._solve_grid(next_row, next_col):
                    return True
                self.grid[row][col] = 0  # Backtrack

        return False

    def _partition_grid(self):
        self._raw_cages = []
        visited = [[False for _ in range(self.size)] for _ in range(self.size)]
        cell_indices = [(r, c) for r in range(self.size) for c in range(self.size)]
        random.shuffle(cell_indices)

        # --- Adjust cage size parameters based on difficulty ---
        if self.difficulty == "expert":
            max_cage_size = min(self.size, 7)  # Allow very large cages
            min_cage_size = 3  # Force minimum cage size of 3
        elif self.difficulty == "hard":
            max_cage_size = min(self.size, 5)
            min_cage_size = 2  # Force min size 2
        elif self.difficulty == "medium":
            max_cage_size = min(self.size, 4)
            # Bias towards larger cages, min size 2 or 3
            min_cage_size = random.choice([2, 2, 3])
            # Ensure min_cage_size doesn't exceed max_cage_size if max is small
            min_cage_size = min(min_cage_size, max_cage_size)
        else:  # easy
            max_cage_size = min(self.size, 3)
            min_cage_size = 1  # Allow size 1 for easy
        # ---------------------------------------------------------

        for r, c in cell_indices:
            if not visited[r][c]:
                current_cage_cells = []

                # --- Determine target cage size based on difficulty ---
                if max_cage_size <= 0:
                    target_cage_size = 0
                elif min_cage_size >= max_cage_size:
                    target_cage_size = min_cage_size
                else:
                    target_cage_size = random.randint(min_cage_size, max_cage_size)

                # --- Prevent single cell target if difficulty doesn't allow min_cage_size 1 ---
                # If min_cage_size is > 1, but randint picked 1 (e.g., if max_cage_size was 1)
                # or if the loop gets stuck leaving single cells, we might still end up
                # trying to create a size 1 cage. Add an explicit check.
                if target_cage_size == 1 and min_cage_size > 1:
                    # Don't allow creating a size 1 cage if the difficulty minimum is > 1.
                    # Try to force a size 2 cage instead if possible.
                    # This is tricky because the neighbor might already be visited.
                    # Simplest fix: increase target_cage_size if possible, otherwise rely
                    # on the later leftover cell handling to make size 1 cages.
                    target_cage_size = min(
                        2, max_cage_size
                    )  # Try for size 2 if allowed
                    print(
                        f"INFO: Difficulty '{self.difficulty}' wants min size {min_cage_size}, adjusted target from 1 to {target_cage_size}"
                    )
                # ----------------------------------------------------------------------------

                # Handle the actual creation (size 1 vs BFS)
                if target_cage_size <= 1:
                    # Only create size 1 if target is exactly 1 AND min_cage_size allows it
                    if (
                        target_cage_size == 1
                    ):  # We already adjusted if min_cage_size > 1
                        current_cage_cells.append((r, c))
                        visited[r][c] = True
                    # If target is somehow 0 or less, skip
                else:
                    # Use BFS to find a contiguous cage (target_cage_size > 1)
                    q = deque([(r, c)])
                    visited[r][c] = True
                    current_cage_cells.append((r, c))

                    while len(current_cage_cells) < target_cage_size and q:
                        curr_r, curr_c = q.popleft()

                        neighbors = []
                        for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                            nr, nc = curr_r + dr, curr_c + dc
                            if (
                                0 <= nr < self.size
                                and 0 <= nc < self.size
                                and not visited[nr][nc]
                            ):
                                neighbors.append((nr, nc))

                        random.shuffle(neighbors)

                        added_count = 0
                        for nr, nc in neighbors:
                            if len(current_cage_cells) < target_cage_size:
                                visited[nr][nc] = True
                                current_cage_cells.append((nr, nc))
                                q.append((nr, nc))
                                added_count += 1
                            else:
                                break

                if current_cage_cells:
                    self._raw_cages.append(current_cage_cells)

        # Ensure all cells are covered (handle potential leftover single cells)
        leftover_cells = []
        for r in range(self.size):
            for c in range(self.size):
                if not visited[r][c]:
                    leftover_cells.append((r, c))

        if leftover_cells:
            # For expert difficulty, we need to merge leftover cells with existing cages
            # or create larger cages to meet minimum size requirements
            if self.difficulty == "expert" or min_cage_size > 1:
                print(
                    f"Found {len(leftover_cells)} leftover cells for difficulty '{self.difficulty}' (min size {min_cage_size})"
                )

                # Try to merge leftover cells with adjacent existing cages
                for r, c in leftover_cells:
                    merged = False
                    # Find adjacent cages to merge with
                    for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.size and 0 <= nc < self.size:
                            # Find which cage contains this adjacent cell
                            for cage_idx, cage_cells in enumerate(self._raw_cages):
                                if (nr, nc) in cage_cells:
                                    # Merge the leftover cell with this cage
                                    self._raw_cages[cage_idx].append((r, c))
                                    visited[r][c] = True
                                    merged = True
                                    print(
                                        f"  Merged leftover cell ({r},{c}) with cage {cage_idx}"
                                    )
                                    break
                            if merged:
                                break

                    # If we couldn't merge with an adjacent cage, try to group leftover cells together
                    if not merged:
                        # Find other unmerged leftover cells nearby to form a new cage
                        remaining_leftover = [
                            (lr, lc) for lr, lc in leftover_cells if not visited[lr][lc]
                        ]
                        if len(remaining_leftover) >= min_cage_size:
                            # Create a new cage with enough leftover cells
                            new_cage = []
                            q = deque([(r, c)])
                            visited[r][c] = True
                            new_cage.append((r, c))

                            while len(new_cage) < min_cage_size and q:
                                curr_r, curr_c = q.popleft()
                                for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                                    nr, nc = curr_r + dr, curr_c + dc
                                    if (
                                        0 <= nr < self.size
                                        and 0 <= nc < self.size
                                        and not visited[nr][nc]
                                        and (nr, nc) in remaining_leftover
                                    ):
                                        visited[nr][nc] = True
                                        new_cage.append((nr, nc))
                                        q.append((nr, nc))
                                        if len(new_cage) >= min_cage_size:
                                            break

                            if len(new_cage) >= min_cage_size:
                                self._raw_cages.append(new_cage)
                                print(
                                    f"  Created new cage with {len(new_cage)} leftover cells"
                                )
                                merged = True

                    # Last resort: if we still can't merge and it's a single cell,
                    # add it anyway but warn (this should trigger a retry)
                    if not merged and not visited[r][c]:
                        print(
                            f"  WARNING: Could not merge leftover cell ({r},{c}), adding as single cell"
                        )
                        self._raw_cages.append([(r, c)])
                        visited[r][c] = True
            else:
                # For easy difficulty, single cells are OK
                for r, c in leftover_cells:
                    self._raw_cages.append([(r, c)])
                    visited[r][c] = True

    def _assign_operations_and_targets(self):
        self.cages = []
        single_cell_cage_count = 0
        total_cage_count = len(self._raw_cages)

        # --- Difficulty-based Operation Sets & Single Cell Limits ---
        if self.difficulty == "easy":
            allowed_ops_base = {"+", "-"}  # Only + and - for easy
            max_single_cells = total_cage_count // 2  # Allow more single cells for easy
        elif self.difficulty == "medium":
            allowed_ops_base = {"+", "-", "*"}  # Add multiplication
            max_single_cells = total_cage_count // 4  # Fewer single cells
        elif self.difficulty == "hard":
            allowed_ops_base = {"+", "-", "*", "/"}  # Allow all ops
            max_single_cells = max(
                1, total_cage_count // 8
            )  # Very few single cells (at least 1 maybe?)
        else:  # expert
            allowed_ops_base = {"+", "-", "*", "/"}  # Allow all ops
            max_single_cells = 0  # No single cells for expert - maximum challenge
        # -----------------------------------------------------------

        print(
            f"Difficulty '{self.difficulty}': Base Ops = {allowed_ops_base}, Max '=' cages = {max_single_cells}"
        )

        for cage_cells_coords in self._raw_cages:
            cage_values = [self.grid[r][c] for r, c in cage_cells_coords]
            linear_indices = [r * self.size + c for r, c in cage_cells_coords]
            cage_size = len(cage_values)

            op = None
            target = None
            possible_ops = []

            # --- Determine Operation ---
            if cage_size == 1:
                # Single cell cage
                if single_cell_cage_count < max_single_cells:
                    op = "="
                    target = cage_values[0]
                    single_cell_cage_count += 1
                    print(
                        f"  Cage {linear_indices}: Assigning OP='{op}', Target={target} (Count: {single_cell_cage_count}/{max_single_cells})"
                    )
                else:
                    # Limit reached, cannot create this single-cell cage.
                    # For expert difficulty, this should not happen if partitioning worked correctly
                    if self.difficulty == "expert":
                        # Force create the cage anyway to avoid orphan cells
                        print(
                            f"  Cage {linear_indices}: FORCING single cell cage creation for expert (should not happen)"
                        )
                        op = "="
                        target = cage_values[0]
                        single_cell_cage_count += 1
                    else:
                        # Skip adding it to self.cages. This might leave orphan cells.
                        print(
                            f"  Cage {linear_indices}: Skipping single cell cage creation (limit {max_single_cells} reached)"
                        )
                        op = None  # Ensure it's not added
            else:
                # Multi-cell cage
                possible_ops = list(allowed_ops_base)

                # Filter by size constraints
                if cage_size != 2:
                    if "-" in possible_ops:
                        possible_ops.remove("-")
                    if "/" in possible_ops:
                        possible_ops.remove("/")

                random.shuffle(possible_ops)
                print(
                    f"  Cage {linear_indices} (Size {cage_size}): Trying Ops: {possible_ops}"
                )

                for current_op in possible_ops:
                    valid_op_found = False
                    temp_target = None

                    try:
                        if current_op == "+":
                            temp_target = sum(cage_values)
                            valid_op_found = True
                        elif current_op == "*":
                            temp_target = 1
                            for val in cage_values:
                                temp_target *= val
                            valid_op_found = True
                        elif current_op == "-":  # cage_size == 2
                            temp_target = abs(cage_values[0] - cage_values[1])
                            if temp_target != 0:
                                valid_op_found = True
                        elif current_op == "/":  # cage_size == 2
                            v1, v2 = cage_values[0], cage_values[1]
                            if v1 != 0 and v2 != 0 and max(v1, v2) % min(v1, v2) == 0:
                                temp_target = max(v1, v2) // min(v1, v2)
                                valid_op_found = True
                    except Exception as e:
                        print(
                            f"    Error calculating target for op '{current_op}': {e}"
                        )
                        valid_op_found = False  # Treat calculation error as invalid op

                    if valid_op_found:
                        op = current_op
                        target = temp_target
                        print(f"    Assigned OP='{op}', Target={target}")
                        break  # Found a suitable operation
                    else:
                        print(f"    Op '{current_op}' not suitable.")
                        pass  # Continue trying other ops

                # --- Fallback Logic (if no suitable op found in loop) ---
                if op is None:
                    print(
                        f"    No suitable op found from {possible_ops}. Applying fallback..."
                    )
                    # Try '+' first if available in base set
                    if "+" in allowed_ops_base:
                        op = "+"
                        target = sum(cage_values)
                        print(f"    Fallback to OP='{op}', Target={target}")
                    # Then try '*' if available in base set
                    elif "*" in allowed_ops_base:
                        op = "*"
                        target = 1
                        for val in cage_values:
                            target *= val
                        print(f"    Fallback to OP='{op}', Target={target}")
                    else:
                        # Should be very rare
                        print(
                            f"    ERROR: No fallback possible for cage {linear_indices}! Difficulty: {self.difficulty}, Base Ops: {allowed_ops_base}"
                        )
                        op = "?"  # Mark as error cage
                        target = 0

            # --- Append Cage ---
            if op is not None and op != "?":
                self.cages.append(
                    {
                        "value": target,
                        "operation": op,
                        "cells": sorted(linear_indices),
                    }
                )
            elif op == "?":
                # Log error cages but don't add them?
                print(
                    f"ERROR Cage generated: {linear_indices}, Op: ?, Target: {target}"
                )
            # else: op is None (Single cell skipped due to limit)

        # Final check: ensure all cells are covered by the created cages
        covered_cells = set()
        for cage in self.cages:
            covered_cells.update(cage["cells"])
        total_cells = self.size * self.size
        if len(covered_cells) != total_cells:
            print(
                f"WARNING: Not all cells covered by cages! Covered: {len(covered_cells)}/{total_cells}. This generation will likely fail."
            )

    def _check_cage_constraint(self, cage, current_grid):
        op = cage["operation"]
        target = cage["value"]
        cell_indices = cage["cells"]
        values = []
        unfilled_count = 0
        unfilled_indices = []
        for idx in cell_indices:
            r, c = idx // self.size, idx % self.size
            val = current_grid[r][c]
            if val == 0:
                unfilled_count += 1
                unfilled_indices.append(idx)
            else:
                values.append(val)

        # --- Partial Cage Checks (Pruning) ---
        if unfilled_count > 0:
            # These checks return False if the partial cage is already invalid
            if op == "=":
                # A single cell cage should always be filled when checked during solving
                # So if it's somehow unfilled here, it's an error state or impossible.
                # However, the _solve_and_count ensures this cage is checked only when its cell is filled.
                # We should never reach here with unfilled_count > 0 for '='.
                # If we *did*, it would imply impossibility, return False.
                return False  # Safety check
            elif op == "+":
                current_sum = sum(values)
                if current_sum >= target:
                    # Sum already meets or exceeds target with unfilled cells remaining
                    return False
                # Check if the *minimum* possible sum exceeds the target
                # Minimum value for each unfilled cell is 1
                min_possible_sum = current_sum + unfilled_count * 1
                if min_possible_sum > target:
                    return False
                # Check if the *maximum* possible sum is less than the target
                # Maximum value for each unfilled cell is self.size
                # (More advanced: consider remaining available values in rows/cols)
                max_possible_sum = current_sum + unfilled_count * self.size
                if max_possible_sum < target:
                    return False
            elif op == "*":
                # Avoid division by zero if target is 0
                if target == 0:
                    if 0 in values:
                        # If 0 is already present, the product will be 0. Valid IF no other unfilled.
                        # This case is handled by the full cage check later.
                        pass  # Cannot prune yet
                    else:
                        # Need a 0, but none present. Check if a 0 is possible in remaining cells?
                        # This requires checking row/col constraints for 0, which isn't standard KenKen.
                        # Assume standard KenKen (1-N). Target 0 is impossible.
                        # NOTE: Generation *shouldn't* produce target 0 for multiplication normally.
                        return False  # Cannot make 0 with positive integers

                current_prod = 1
                for v in values:
                    if v == 0:
                        return False  # Should not happen with values 1-N
                    current_prod *= v

                if current_prod > target:
                    # Product already exceeds target
                    return False
                if target % current_prod != 0:
                    # Target isn't divisible by current product, impossible
                    return False
                # Check min/max possible product
                min_possible_prod = current_prod * (1**unfilled_count)
                if min_possible_prod > target:
                    return False
                max_possible_prod = current_prod * (self.size**unfilled_count)
                if max_possible_prod < target:
                    return False

            elif op == "-":  # Only for 2 cells
                if len(cell_indices) != 2:
                    return False  # Invalid cage for op
                if unfilled_count == 1:
                    # One cell filled (v1), one empty. Possible values for empty (v2) are v1+target or v1-target
                    v1 = values[0]
                    possible_v2_1 = v1 + target
                    possible_v2_2 = v1 - target
                    # Check if *at least one* possible value is valid (1 to size)
                    # (More advanced: check row/col constraints for v2's position)
                    valid_possible = False
                    if 1 <= possible_v2_1 <= self.size:
                        valid_possible = True
                    if (
                        1 <= possible_v2_2 <= self.size
                        and possible_v2_2 != possible_v2_1
                    ):
                        valid_possible = True
                    if not valid_possible:
                        return False  # Neither outcome is possible
                # If unfilled_count is 0, handled below. If 2, cannot prune yet.

            elif op == "/":  # Only for 2 cells
                if len(cell_indices) != 2:
                    return False
                if unfilled_count == 1:
                    v1 = values[0]
                    # Possible values for v2 are v1*target or v1/target
                    possible_v2_1 = v1 * target
                    possible_v2_2 = None
                    if target != 0 and v1 % target == 0:
                        possible_v2_2 = v1 // target

                    valid_possible = False
                    if 1 <= possible_v2_1 <= self.size:
                        # Check if placing possible_v2_1 is valid WRT v1 (no duplicates in cage)
                        if possible_v2_1 != v1:
                            valid_possible = True
                    if possible_v2_2 is not None and 1 <= possible_v2_2 <= self.size:
                        if possible_v2_2 != v1:
                            valid_possible = True

                    if not valid_possible:
                        return False  # Neither outcome is possible
                # If unfilled_count is 0, handled below. If 2, cannot prune yet.

            # If partially filled and not pruned, it's still potentially valid
            return True
        # --- End Partial Cage Checks ---

        # --- Full Cage Check (original logic) ---
        # If we reach here, unfilled_count is 0 (all_filled is effectively true)
        if op == "=":
            return values[0] == target
        elif op == "+":
            return sum(values) == target
        elif op == "*":
            prod = 1
            for v in values:
                prod *= v
            return prod == target
        elif op == "-":
            if len(values) != 2:
                return False  # Should not happen with valid generation
            return abs(values[0] - values[1]) == target
        elif op == "/":
            if len(values) != 2:
                return False
            v1, v2 = values[0], values[1]
            if v1 == 0 or v2 == 0 or max(v1, v2) % min(v1, v2) != 0:
                return False  # Invalid division
            return max(v1, v2) // min(v1, v2) == target
        elif op == "?":  # Handle the fallback case from generation
            return False  # Treat unknown operation cages as invalid for solving
        else:
            return False  # Unknown operation

    def _count_solutions(self):
        # Create a map from cell index to its cage for quick lookup
        self.cell_to_cage_map = {}
        for i, cage in enumerate(self.cages):
            for cell_idx in cage["cells"]:
                self.cell_to_cage_map[cell_idx] = i

        self.solution_count = 0
        # Create a separate grid for the solver to work on
        solver_grid = [[0 for _ in range(self.size)] for _ in range(self.size)]
        self._solve_and_count(solver_grid, 0, 0)
        return self.solution_count

    def _solve_and_count(self, current_grid, row, col):
        # --- Solution Limit (Optimization) ---
        # If we've already found more than one solution, we can stop early.
        if self.solution_count > 1:
            return
        # -------------------------------------

        if row == self.size:
            # Reached the end of the grid, found a valid solution
            self.solution_count += 1
            # Check if we should stop early
            if self.solution_count > 1:
                return
            return

        next_row, next_col = (row, col + 1) if col + 1 < self.size else (row + 1, 0)

        nums = list(range(1, self.size + 1))
        # No random shuffle needed for solving

        for num in nums:
            # 1. Check Latin Square constraints (row/col uniqueness)
            valid_latin = True
            for i in range(self.size):
                if (i < col and current_grid[row][i] == num) or (
                    i < row and current_grid[i][col] == num
                ):
                    valid_latin = False
                    break
            if not valid_latin:
                continue

            # Place the number tentatively
            current_grid[row][col] = num

            # 2. Check Cage Constraint for the current cell's cage
            cell_index = row * self.size + col
            cage_index = self.cell_to_cage_map.get(cell_index)
            if cage_index is not None:
                cage = self.cages[cage_index]
                if self._check_cage_constraint(cage, current_grid):
                    # If valid so far, recurse
                    self._solve_and_count(current_grid, next_row, next_col)
                    # If we found > 1 solution in the recursive call, return early
                    if self.solution_count > 1:
                        # Backtrack before returning to allow other paths if needed
                        current_grid[row][col] = 0
                        return
                # Else: Cage constraint failed, backtrack (handled below)
            else:
                # Should not happen if cell_to_cage_map is built correctly
                print(
                    f"Error: Cell ({row},{col}) index {cell_index} not found in any cage."
                )
                # Treat as invalid move
                pass

            # Backtrack
            current_grid[row][col] = 0

    def generate(self, max_attempts=100):
        print(f"Generating puzzle: Size={self.size}, Difficulty='{self.difficulty}'")
        attempt = 0
        while attempt < max_attempts:
            attempt += 1
            print(f"Attempt {attempt}/{max_attempts}...")
            # 1. Fill the grid using backtracking (Latin Square property)
            # Reset grid for generation attempt
            self.grid = [[0 for _ in range(self.size)] for _ in range(self.size)]
            if not self._solve_grid():  # _solve_grid now uses self.grid
                print("Failed to generate a valid Latin Square base. Retrying...")
                continue  # Try next attempt

            # 2. Partition the grid into cages based on the filled grid
            self._partition_grid()

            # 3. Assign operations and calculate target values based on the solved grid
            self._assign_operations_and_targets()

            # --- Check Uniqueness ---
            solution_count = self._count_solutions()
            print(f"Found {solution_count} solutions for the generated puzzle.")

            if solution_count == 1:
                print(f"Attempt {attempt + 1}: Generation successful!")
                # Return the puzzle definition AND the solution grid
                return {"size": self.size, "cages": self.cages, "solution": self.grid}
            elif solution_count > 1:
                print(f"Attempt {attempt + 1}: Failed - Multiple solutions found.")
                # Optionally: Try to tweak the puzzle slightly? (Complex)
            else:  # solution_count == 0
                print(
                    f"Attempt {attempt + 1}: Failed - No solution found (logic error?)."
                )
                # This should ideally not happen if _solve_grid succeeded

            print("Retrying generation...")

        # If max_attempts reached without finding a unique puzzle
        print(f"Failed to generate a unique puzzle after {max_attempts} attempts.")
        return None


# Example usage (for testing)
if __name__ == "__main__":
    # Example: Generate an "easy" 4x4 (only add/subtract)
    print("\nGenerating Easy 4x4:")
    generator_easy = KenkenGenerator(size=4, operations=["+", "-"], difficulty="easy")
    puzzle_easy = generator_easy.generate()
    if puzzle_easy:
        import json

        print(json.dumps(puzzle_easy, indent=2))

    # Example: Generate a "medium" 4x4 (all ops, default difficulty)
    print("\nGenerating Medium 4x4:")
    generator_medium = KenkenGenerator(size=4)
    puzzle_medium = generator_medium.generate()
    if puzzle_medium:
        import json

        print(json.dumps(puzzle_medium, indent=2))

    # Example: Generate a "hard" 6x6 (all ops)
    print("\nGenerating Hard 6x6:")
    generator_hard = KenkenGenerator(size=6, difficulty="hard")
    puzzle_hard = generator_hard.generate()
    if puzzle_hard:
        import json

        print(json.dumps(puzzle_hard, indent=2))

    # Example: Generate an "expert" 6x6 (all ops, largest cages, no single cells)
    print("\nGenerating Expert 6x6:")
    generator_expert = KenkenGenerator(size=6, difficulty="expert")
    puzzle_expert = generator_expert.generate()
    if puzzle_expert:
        import json

        print(json.dumps(puzzle_expert, indent=2))
