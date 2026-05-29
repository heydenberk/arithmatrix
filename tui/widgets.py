"""Textual widgets that render GameState via the pure render layer."""

from __future__ import annotations

from rich.text import Text
from textual.widgets import Static

from tui.render import CELL_H, CELL_W, grid_to_lines


class GridWidget(Static):
    """Renders the board and highlights the cursor cell."""

    def __init__(self, game):
        super().__init__()
        self.game = game

    def refresh_grid(self):
        self.update(self._render_text())

    def _render_text(self):
        lines = grid_to_lines(self.game)
        text = Text()
        cr, cc = self.game.cursor
        row_start = cr * (CELL_H + 1) + 1
        col_start = cc * (CELL_W + 1) + 1
        for i, line in enumerate(lines):
            if i > 0:
                text.append("\n")
            in_cursor_rows = row_start <= i < row_start + CELL_H
            if in_cursor_rows:
                text.append(line[:col_start])
                text.append(line[col_start:col_start + CELL_W], style="reverse")
                text.append(line[col_start + CELL_W:])
            else:
                text.append(line)
        return text
