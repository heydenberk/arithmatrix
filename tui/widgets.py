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
        self.wrong = set()  # (row, col) cells flagged incorrect by a "check"

    def refresh_grid(self):
        self.update(self._render_text())

    def _cell_style(self, r, c, sub, cursor, selection):
        """Rich style for one cell's content span on sub-row ``sub`` (0=label,
        1=value, 2=pencil)."""
        parts = []
        if sub == 2:  # pencil-mark candidates
            parts.append("italic")
        if cursor == (r, c):
            parts.append("reverse")
        if (r, c) in selection:
            parts.append("underline")
        if (r, c) in self.wrong:
            parts.append("red")
        return " ".join(parts)

    def _render_text(self):
        lines = grid_to_lines(self.game)
        size = self.game.size
        cursor = self.game.cursor
        selection = self.game.selection
        text = Text()
        for i, line in enumerate(lines):
            if i > 0:
                text.append("\n")
            block_pos = i % (CELL_H + 1)
            if block_pos == 0:  # border row — no per-cell styling
                text.append(line)
                continue
            r = i // (CELL_H + 1)
            sub = block_pos - 1
            pos = 0
            for c in range(size):
                start = c * (CELL_W + 1) + 1
                text.append(line[pos:start])  # leading separator/border
                end = start + CELL_W
                style = self._cell_style(r, c, sub, cursor, selection)
                text.append(line[start:end], style=style)
                pos = end
            text.append(line[pos:])  # trailing separator
        return text
