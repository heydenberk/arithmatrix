"""Pure game logic for the Arithmatrix TUI — no Textual dependency."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass


@dataclass(frozen=True)
class Cage:
    cells: tuple  # row-major cell indices (cell = row * size + col)
    operation: str  # "", "+", "-", "*", "/"
    value: int

    @property
    def anchor(self):
        """Top-left-most cell index; where the cage label is drawn."""
        return min(self.cells)

    def label(self):
        """Label text for the anchor cell (empty for single-cell givens)."""
        if self.operation == "":
            return ""
        return f"{self.value}{self.operation}"


def cage_satisfied(operation, target, values):
    """True if ``values`` satisfy a cage with the given operation/target."""
    if operation == "":
        return len(values) == 1 and values[0] == target
    if operation == "+":
        return sum(values) == target
    if operation == "-":
        return len(values) == 2 and abs(values[0] - values[1]) == target
    if operation == "*":
        product = 1
        for v in values:
            product *= v
        return product == target
    if operation == "/":
        if len(values) != 2:
            return False
        a, b = values
        return (a and b % a == 0 and b // a == target) or (
            b and a % b == 0 and a // b == target
        )
    return False


class GameState:
    """Mutable board state. Coordinates are (row, col); cells are row-major."""

    def __init__(self, puzzle):
        self.size = puzzle["size"]
        self.solution = puzzle["solution"]
        self.cages = [
            Cage(tuple(c["cells"]), c["operation"], c["value"])
            for c in puzzle["cages"]
        ]

        n = self.size
        self.grid = [[None] * n for _ in range(n)]
        self.pencil = [[set() for _ in range(n)] for _ in range(n)]

        self.cage_of = {}
        for cage in self.cages:
            for cell in cage.cells:
                self.cage_of[(cell // n, cell % n)] = cage

        self.given = set()
        for cage in self.cages:
            if cage.operation == "" and len(cage.cells) == 1:
                r, c = divmod(cage.cells[0], n)
                self.grid[r][c] = cage.value
                self.given.add((r, c))

        self.cursor = self._first_editable()

        self._history = [self._snapshot()]
        self._hist_idx = 0

    def _first_editable(self):
        for r in range(self.size):
            for c in range(self.size):
                if (r, c) not in self.given:
                    return (r, c)
        return (0, 0)

    def move(self, dr, dc):
        r, c = self.cursor
        self.cursor = (
            max(0, min(self.size - 1, r + dr)),
            max(0, min(self.size - 1, c + dc)),
        )

    def set_value(self, digit):
        """Place a digit in the cursor cell. No-op on givens or invalid digits."""
        r, c = self.cursor
        if (r, c) in self.given or not (1 <= digit <= self.size):
            return False
        if self.grid[r][c] == digit:
            return False  # no change
        self.grid[r][c] = digit
        self.pencil[r][c] = set()
        self._push()
        return True

    def clear(self):
        """Clear the cursor cell's value and pencil marks. No-op on givens."""
        r, c = self.cursor
        if (r, c) in self.given:
            return False
        if self.grid[r][c] is None and not self.pencil[r][c]:
            return False  # nothing to clear
        self.grid[r][c] = None
        self.pencil[r][c] = set()
        self._push()
        return True

    def toggle_pencil(self, digit):
        """Toggle a pencil-mark candidate. No-op on givens or filled cells."""
        r, c = self.cursor
        if (r, c) in self.given or self.grid[r][c] is not None:
            return False
        if not (1 <= digit <= self.size):
            return False
        marks = self.pencil[r][c]
        if digit in marks:
            marks.discard(digit)
        else:
            marks.add(digit)
        self._push()
        return True

    def undo(self):
        if self._hist_idx == 0:
            return False
        self._hist_idx -= 1
        self._restore()
        return True

    def redo(self):
        if self._hist_idx >= len(self._history) - 1:
            return False
        self._hist_idx += 1
        self._restore()
        return True

    def is_solved(self):
        n = self.size
        full = {*range(1, n + 1)}
        for row in self.grid:
            if any(v is None for v in row):
                return False
        for i in range(n):
            if set(self.grid[i]) != full:
                return False
            if {self.grid[r][i] for r in range(n)} != full:
                return False
        for cage in self.cages:
            values = [self.grid[cell // n][cell % n] for cell in cage.cells]
            if not cage_satisfied(cage.operation, cage.value, values):
                return False
        return True

    def wrong_cells(self):
        """Filled cells whose value differs from the puzzle's unique solution."""
        n = self.size
        return {
            (r, c)
            for r in range(n)
            for c in range(n)
            if self.grid[r][c] is not None
            and self.grid[r][c] != self.solution[r][c]
        }

    # ------------------------------------------------------------------
    # Private history helpers
    # ------------------------------------------------------------------

    def _snapshot(self):
        return (deepcopy(self.grid), deepcopy(self.pencil))

    def _push(self):
        del self._history[self._hist_idx + 1:]  # drop redo tail
        self._history.append(self._snapshot())
        self._hist_idx += 1

    def _restore(self):
        grid, pencil = self._history[self._hist_idx]
        self.grid = deepcopy(grid)
        self.pencil = deepcopy(pencil)


def cage_edges(cage_of, size):
    """For each (row, col), which of its 4 edges is a cage boundary.

    Grid borders always count as boundaries.
    """
    edges = {}
    for r in range(size):
        for c in range(size):
            mine = cage_of[(r, c)]

            def boundary(rr, cc):
                if not (0 <= rr < size and 0 <= cc < size):
                    return True
                return cage_of[(rr, cc)] is not mine

            edges[(r, c)] = {
                "top": boundary(r - 1, c),
                "bottom": boundary(r + 1, c),
                "left": boundary(r, c - 1),
                "right": boundary(r, c + 1),
            }
    return edges
