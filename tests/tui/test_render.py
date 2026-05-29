from tui.game import GameState, cage_edges
from tui.render import grid_to_lines
from tests.tui.test_game import PUZZLE_4

CELL_W = 7
CELL_H = 3


def test_cage_edges_grid_boundaries():
    g = GameState(PUZZLE_4)
    edges = cage_edges(g.cage_of, g.size)
    assert edges[(0, 0)]["top"] is True
    assert edges[(0, 0)]["left"] is True
    # cells 4 and 5 share the 9+ cage → no boundary between them
    assert edges[(1, 0)]["right"] is False


def test_grid_dimensions_and_uniform_width():
    g = GameState(PUZZLE_4)
    lines = grid_to_lines(g)
    assert len(lines) == g.size * (CELL_H + 1) + 1
    widths = {len(line) for line in lines}
    assert len(widths) == 1
    assert lines[0].count("━") > 0


def test_value_and_label_present():
    g = GameState(PUZZLE_4)
    text = "\n".join(grid_to_lines(g))
    assert "9+" in text
    assert "1" in text


def test_pencil_marks_render():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    g.toggle_pencil(2)
    g.toggle_pencil(4)
    text = "\n".join(grid_to_lines(g))
    assert "24" in text
