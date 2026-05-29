from tui.game import GameState
from tui.widgets import GridWidget
from tests.tui.test_game import PUZZLE_4


def _styles(text):
    """All style strings applied to spans in a Rich Text."""
    return [str(span.style) for span in text.spans]


def test_pencil_row_is_italic():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    g.toggle_pencil(2)
    widget = GridWidget(g)
    styles = _styles(widget._render_text())
    assert any("italic" in s for s in styles)


def test_wrong_cells_render_red():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 2)  # solution here is 1
    g.set_value(3)  # wrong
    widget = GridWidget(g)
    widget.wrong = g.wrong_cells()
    assert widget.wrong == {(1, 2)}
    styles = _styles(widget._render_text())
    assert any("red" in s for s in styles)


def test_no_red_when_not_checked():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 2)
    g.set_value(3)  # wrong, but check not run → widget.wrong stays empty
    widget = GridWidget(g)
    styles = _styles(widget._render_text())
    assert not any("red" in s for s in styles)


def test_selected_cells_render_underline():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 2)
    g.toggle_select()
    widget = GridWidget(g)
    styles = _styles(widget._render_text())
    assert any("underline" in s for s in styles)
