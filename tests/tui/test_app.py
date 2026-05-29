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
        game.cursor = (1, 1)
        await pilot.press("2")
        await pilot.pause()
        assert game.grid[1][1] == 2
        await pilot.press("p")
        assert screen.pencil_mode is True
