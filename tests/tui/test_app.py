import pytest

from tui.app import ArithmatrixApp


@pytest.mark.asyncio
async def test_picker_to_game_and_fill():
    app = ArithmatrixApp()
    async with app.run_test() as pilot:
        await pilot.click("#play")
        await pilot.pause()
        screen = app.screen
        game = screen.game
        # Pin to a known-editable cell so the fill is deterministic
        # regardless of which random puzzle was drawn.
        r, c = game._first_editable()
        game.cursor = (r, c)
        await pilot.press("2")
        await pilot.pause()
        assert game.grid[r][c] == 2  # digit landed in an editable cell
        await pilot.press("p")
        assert screen.pencil_mode is True


@pytest.mark.asyncio
async def test_quit_saves_and_resume_restores(tmp_path, monkeypatch):
    from tui import persistence

    save_path = tmp_path / "save.json"
    monkeypatch.setattr(persistence, "SAVE_PATH", save_path)

    # Play a move, then quit — should write a save.
    app = ArithmatrixApp()
    async with app.run_test() as pilot:
        await pilot.click("#play")
        await pilot.pause()
        game = app.screen.game
        r, c = game._first_editable()
        game.cursor = (r, c)
        await pilot.press("2")
        await pilot.pause()
        await pilot.press("q")  # triggers save + exit

    data = persistence.load_save(path=save_path)
    assert data is not None
    assert data["progress"]["grid"][r][c] == 2

    # Relaunch: picker offers Resume and restores the board.
    app2 = ArithmatrixApp()
    async with app2.run_test() as pilot:
        await pilot.pause()
        app2.screen.query_one("#resume")  # raises if the resume row is missing
        await pilot.click("#resume")
        await pilot.pause()
        assert app2.screen.game.grid[r][c] == 2
