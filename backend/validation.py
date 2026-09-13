"""Structural validation of a puzzle definition.

`count_solutions` is a search over the constraints a puzzle *states*; it says
nothing about whether those constraints describe a well-formed board. Its
cell-to-cage map silently keeps the last cage for an overlapping cell and
treats an uncovered cell as free, so a malformed puzzle can count as "one
solution". This module is the prerequisite check that runs before any solver
is trusted: every cell in exactly one connected cage, sane operations, and a
stored solution that is a Latin square satisfying every cage.

Pure functions on the plain-dict puzzle format; no sibling imports so it can
be used from the generator, the batch runner, the API and the corpus validator
alike.
"""

from typing import Dict, List

VALID_OPERATIONS = ("", "+", "-", "*", "/")


def puzzle_structure_errors(puzzle: dict) -> List[str]:
    """Every structural problem with `puzzle`, as human-readable strings.

    Empty list means the definition is well-formed. Checks the cages only;
    see `solution_errors` for the stored solution.
    """
    errors: List[str] = []
    size = puzzle.get("size")
    if not isinstance(size, int) or size < 1:
        return [f"size must be a positive integer, got {size!r}"]
    cages = puzzle.get("cages")
    if not isinstance(cages, list) or not cages:
        return ["puzzle has no cages"]

    total = size * size
    owner: Dict[int, int] = {}
    for idx, cage in enumerate(cages):
        cells = cage.get("cells")
        if not isinstance(cells, list) or not cells:
            errors.append(f"cage {idx} has no cells")
            continue
        for cell in cells:
            if not isinstance(cell, int) or not 0 <= cell < total:
                errors.append(f"cage {idx} has out-of-range cell {cell!r}")
            elif cell in owner:
                errors.append(f"cell {cell} is in cage {owner[cell]} and cage {idx}")
            else:
                owner[cell] = idx
        if len(set(cells)) != len(cells):
            errors.append(f"cage {idx} lists a cell twice")

        op = cage.get("operation")
        if op not in VALID_OPERATIONS:
            errors.append(f"cage {idx} has unknown operation {op!r}")
        elif op == "" and len(cells) != 1:
            errors.append(f"cage {idx} has no operation but {len(cells)} cells")
        elif op in ("-", "/") and len(cells) != 2:
            errors.append(f"cage {idx} uses {op} with {len(cells)} cells")
        elif op in ("+", "*") and len(cells) < 2:
            errors.append(f"cage {idx} uses {op} with a single cell")

        value = cage.get("value")
        if not isinstance(value, int) or value < 1:
            errors.append(f"cage {idx} has invalid target {value!r}")

        if not _connected(cells, size):
            errors.append(f"cage {idx} is not connected")

    missing = total - len(owner)
    if missing:
        errors.append(f"{missing} cell(s) belong to no cage")
    return errors


def solution_errors(puzzle: dict) -> List[str]:
    """Problems with the stored solution: shape, Latin-square rule, cage targets."""
    errors: List[str] = []
    size = puzzle["size"]
    solution = puzzle.get("solution")
    if (
        not isinstance(solution, list)
        or len(solution) != size
        or any(not isinstance(row, list) or len(row) != size for row in solution)
    ):
        return [f"solution is not a {size}x{size} grid"]

    expected = set(range(1, size + 1))
    for i in range(size):
        if set(solution[i]) != expected:
            errors.append(f"row {i} is not a permutation of 1..{size}")
        if {solution[r][i] for r in range(size)} != expected:
            errors.append(f"column {i} is not a permutation of 1..{size}")

    for idx, cage in enumerate(puzzle["cages"]):
        values = [solution[c // size][c % size] for c in cage["cells"]]
        if not cage_satisfied(cage["operation"], cage["value"], values):
            errors.append(f"cage {idx} ({cage['operation']}{cage['value']}) is not satisfied by {values}")
    return errors


def cage_satisfied(op: str, target: int, values: List[int]) -> bool:
    if op == "":
        return len(values) == 1 and values[0] == target
    if op == "+":
        return sum(values) == target
    if op == "*":
        product = 1
        for v in values:
            product *= v
        return product == target
    if op == "-":
        return len(values) == 2 and abs(values[0] - values[1]) == target
    if op == "/":
        if len(values) != 2:
            return False
        hi, lo = max(values), min(values)
        return lo != 0 and hi == target * lo
    return False


def validate_puzzle(puzzle: dict) -> List[str]:
    """Structure first, then the solution; the solution check needs a sane structure."""
    errors = puzzle_structure_errors(puzzle)
    if errors:
        return errors
    return solution_errors(puzzle)


def _connected(cells: List[int], size: int) -> bool:
    """Orthogonal connectivity of a set of positional indexes."""
    valid = {c for c in cells if isinstance(c, int) and 0 <= c < size * size}
    if len(valid) != len(cells):
        return False
    start = next(iter(valid))
    seen = {start}
    stack = [start]
    while stack:
        cell = stack.pop()
        r, c = divmod(cell, size)
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < size and 0 <= nc < size:
                nxt = nr * size + nc
                if nxt in valid and nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
    return len(seen) == len(valid)
