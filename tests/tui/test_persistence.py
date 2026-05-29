from tui import persistence
from tui.game import GameState
from tests.tui.test_game import PUZZLE_4


def test_save_load_clear_roundtrip(tmp_path):
    save_path = tmp_path / "save.json"
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    g.set_value(2)
    g.cursor = (2, 2)
    g.toggle_pencil(3)
    g.toggle_pencil(4)

    persistence.save_game(g, "easy", path=save_path)
    assert save_path.exists()

    data = persistence.load_save(path=save_path)
    assert data["size"] == 4
    assert data["difficulty"] == "easy"

    # Rebuild from the save and verify progress restored exactly.
    restored = GameState(data["puzzle"])
    restored.import_progress(data["progress"])
    assert restored.grid == g.grid
    assert restored.pencil == g.pencil
    assert restored.cursor == g.cursor

    persistence.clear_save(path=save_path)
    assert persistence.load_save(path=save_path) is None


def test_load_missing_returns_none(tmp_path):
    assert persistence.load_save(path=tmp_path / "nope.json") is None


def test_load_corrupt_returns_none(tmp_path):
    p = tmp_path / "save.json"
    p.write_text("{not valid json")
    assert persistence.load_save(path=p) is None
