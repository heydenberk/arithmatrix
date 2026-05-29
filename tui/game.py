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
        self.grid[r][c] = digit
        self.pencil[r][c] = set()
        return True

    def clear(self):
        """Clear the cursor cell's value and pencil marks. No-op on givens."""
        r, c = self.cursor
        if (r, c) in self.given:
            return False
        self.grid[r][c] = None
        self.pencil[r][c] = set()
        return True
