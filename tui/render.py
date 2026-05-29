"""Pure text rendering of an Arithmatrix board (heavy cage borders only)."""

from __future__ import annotations

from tui.game import cage_edges

CELL_W = 7  # interior width of a cell (fits up to 7 pencil marks / a "999/" label)
CELL_H = 3  # interior height: label row, value row, pencil row

# Junction glyph keyed by (up, down, left, right) booleans — heavy box set.
_JUNCTIONS = {
    (False, False, False, False): " ",
    (True, False, False, False): "╹",
    (False, True, False, False): "╻",
    (False, False, True, False): "╸",
    (False, False, False, True): "╺",
    (True, True, False, False): "┃",
    (False, False, True, True): "━",
    (False, True, False, True): "┏",
    (False, True, True, False): "┓",
    (True, False, False, True): "┗",
    (True, False, True, False): "┛",
    (True, True, False, True): "┣",
    (True, True, True, False): "┫",
    (False, True, True, True): "┳",
    (True, False, True, True): "┻",
    (True, True, True, True): "╋",
}


def _hseg(edges, size, R, C):
    """Is the horizontal border segment over cell-column C, at border-row R, heavy?"""
    if R == 0:
        return edges[(0, C)]["top"]
    if R == size:
        return edges[(size - 1, C)]["bottom"]
    return edges[(R, C)]["top"]


def _vseg(edges, size, R, C):
    """Is the vertical border segment over cell-row R, at border-col C, heavy?"""
    if C == 0:
        return edges[(R, 0)]["left"]
    if C == size:
        return edges[(R, size - 1)]["right"]
    return edges[(R, C)]["left"]


def _junction(edges, size, Rp, Cp):
    up = Rp > 0 and _vseg(edges, size, Rp - 1, Cp)
    down = Rp < size and _vseg(edges, size, Rp, Cp)
    left = Cp > 0 and _hseg(edges, size, Rp, Cp - 1)
    right = Cp < size and _hseg(edges, size, Rp, Cp)
    return _JUNCTIONS[(up, down, left, right)]


def _cell_lines(state, r, c):
    """The 3 interior content strings (width CELL_W) for cell (r, c)."""
    cage = state.cage_of[(r, c)]
    label = cage.label() if cage.anchor == r * state.size + c else ""
    value = state.grid[r][c]
    value_str = str(value) if value is not None else ""
    marks = "".join(str(d) for d in sorted(state.pencil[r][c]))
    return [
        label.ljust(CELL_W)[:CELL_W],
        value_str.center(CELL_W)[:CELL_W],
        marks.ljust(CELL_W)[:CELL_W],
    ]


def grid_to_lines(state):
    """Render the board to a list of equal-width plain-text lines."""
    size = state.size
    edges = cage_edges(state.cage_of, size)

    def border_row(Rp):
        chars = []
        for Cp in range(size + 1):
            chars.append(_junction(edges, size, Rp, Cp))
            if Cp < size:
                seg = "━" if _hseg(edges, size, Rp, Cp) else " "
                chars.append(seg * CELL_W)
        return "".join(chars)

    lines = []
    for R in range(size):
        lines.append(border_row(R))
        cell_contents = [_cell_lines(state, R, c) for c in range(size)]
        for row in range(CELL_H):
            chars = []
            for C in range(size + 1):
                vsep = "┃" if _vseg(edges, size, R, C) else " "
                chars.append(vsep)
                if C < size:
                    chars.append(cell_contents[C][row])
            lines.append("".join(chars))
    lines.append(border_row(size))
    return lines
