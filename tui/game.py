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
        self.selection = set()  # cells (r, c) targeted for batch operations

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

    # ------------------------------------------------------------------
    # Selection (multiselect for batch operations)
    # ------------------------------------------------------------------

    def toggle_select(self):
        """Add/remove the cursor cell from the multiselect set."""
        cell = self.cursor
        if cell in self.selection:
            self.selection.discard(cell)
        else:
            self.selection.add(cell)

    def clear_selection(self):
        self.selection.clear()

    def _targets(self):
        """Cells a mutation applies to: the selection, or the cursor alone."""
        return sorted(self.selection) if self.selection else [self.cursor]

    # ------------------------------------------------------------------
    # Mutations — apply to every target cell, recording one undo step
    # ------------------------------------------------------------------

    def set_value(self, digit):
        """Place a digit in every target cell. No-op on givens/invalid digits."""
        if not (1 <= digit <= self.size):
            return False
        changed = False
        for r, c in self._targets():
            if (r, c) in self.given or self.grid[r][c] == digit:
                continue
            self.grid[r][c] = digit
            self.pencil[r][c] = set()
            changed = True
        if changed:
            self._push()
        return changed

    def clear(self):
        """Clear value and pencil marks in every target cell. No-op on givens."""
        changed = False
        for r, c in self._targets():
            if (r, c) in self.given:
                continue
            if self.grid[r][c] is None and not self.pencil[r][c]:
                continue
            self.grid[r][c] = None
            self.pencil[r][c] = set()
            changed = True
        if changed:
            self._push()
        return changed

    def toggle_pencil(self, digit):
        """Toggle a candidate across target cells (givens/filled cells skipped).

        If any eligible target lacks the mark, it is added to all of them;
        otherwise it is removed from all — the standard batch fill/clear feel.
        """
        if not (1 <= digit <= self.size):
            return False
        targets = [
            (r, c)
            for r, c in self._targets()
            if (r, c) not in self.given and self.grid[r][c] is None
        ]
        if not targets:
            return False
        add = any(digit not in self.pencil[r][c] for r, c in targets)
        for r, c in targets:
            if add:
                self.pencil[r][c].add(digit)
            else:
                self.pencil[r][c].discard(digit)
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
    # Save / restore
    # ------------------------------------------------------------------

    def to_puzzle(self):
        """Reconstruct the puzzle dict this state was built from."""
        return {
            "size": self.size,
            "solution": self.solution,
            "cages": [
                {"cells": list(c.cells), "operation": c.operation, "value": c.value}
                for c in self.cages
            ],
        }

    def export_progress(self):
        """Serialisable player progress (grid values, pencil marks, cursor)."""
        return {
            "grid": [list(row) for row in self.grid],
            "pencil": [[sorted(marks) for marks in row] for row in self.pencil],
            "cursor": list(self.cursor),
        }

    def import_progress(self, progress):
        """Overlay saved progress and reset undo history to this point."""
        self.grid = [list(row) for row in progress["grid"]]
        self.pencil = [[set(marks) for marks in row] for row in progress["pencil"]]
        self.cursor = tuple(progress["cursor"])
        self._history = [self._snapshot()]
        self._hist_idx = 0

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
