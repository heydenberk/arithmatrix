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
