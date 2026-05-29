"""Picker and game screens."""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import Screen
from textual.widgets import Button, Footer, Header, Label, RadioButton, RadioSet, Static

from tui import puzzles
from tui.game import GameState
from tui.widgets import GridWidget


class PickerScreen(Screen):
    """Choose grid size and difficulty, then start a game."""

    def compose(self) -> ComposeResult:
        yield Header()
        yield Label("Choose a puzzle", id="picker-title")
        with Horizontal():
            with Vertical():
                yield Label("Size")
                with RadioSet(id="size"):
                    for s in puzzles.SIZES:
                        yield RadioButton(f"{s}x{s}", value=(s == 4))
            with Vertical():
                yield Label("Difficulty")
                with RadioSet(id="difficulty"):
                    for i, d in enumerate(puzzles.DIFFICULTIES):
                        yield RadioButton(d, value=(i == 0))
        yield Button("Play", id="play", variant="primary")
        yield Static("", id="picker-msg")
        yield Footer()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id != "play":
            return
        size = puzzles.SIZES[self.query_one("#size", RadioSet).pressed_index]
        difficulty = puzzles.DIFFICULTIES[
            self.query_one("#difficulty", RadioSet).pressed_index
        ]
        puzzle = puzzles.pick_random(size, difficulty)
        if puzzle is None:
            self.query_one("#picker-msg", Static).update(
                f"No {difficulty} {size}x{size} puzzles found — pick another."
            )
            return
        self.app.push_screen(GameScreen(GameState(puzzle), size, difficulty))


class GameScreen(Screen):
    """Play a single puzzle."""

    BINDINGS = [
        ("up", "move(-1,0)", "Up"),
        ("down", "move(1,0)", "Down"),
        ("left", "move(0,-1)", "Left"),
        ("right", "move(0,1)", "Right"),
        ("backspace", "clear", "Clear"),
        ("p", "toggle_pencil_mode", "Pencil"),
        ("c", "check", "Check"),
        ("u", "undo", "Undo"),
        ("r", "redo", "Redo"),
        ("n", "new_puzzle", "New"),
    ]

    def __init__(self, game, size, difficulty):
        super().__init__()
        self.game = game
        self.puzzle_size = size
        self.difficulty = difficulty
        self.pencil_mode = False
        self.solved = False

    def compose(self) -> ComposeResult:
        yield Header()
        self.grid_widget = GridWidget(self.game)
        yield self.grid_widget
        self.status = Static(id="status")
        yield self.status
        yield Footer()

    def on_mount(self) -> None:
        self._refresh()

    def _refresh(self):
        self.grid_widget.refresh_grid()
        mode = "PENCIL" if self.pencil_mode else "NORMAL"
        self.status.update(
            f"{self.puzzle_size}x{self.puzzle_size} {self.difficulty}  |  mode: {mode}  |  "
            f"1-9 fill · backspace clear · p pencil · c check · u/r undo/redo · n new · q quit"
        )

    def _clear_check(self):
        """Drop any stale 'check' highlight after the board changes."""
        if self.grid_widget.wrong:
            self.grid_widget.wrong = set()

    def action_move(self, dr: int, dc: int) -> None:
        self.game.move(dr, dc)
        self._refresh()

    def on_key(self, event) -> None:
        if event.character and event.character.isdigit() and event.character != "0":
            digit = int(event.character)
            if self.pencil_mode:
                self.game.toggle_pencil(digit)
            else:
                self.game.set_value(digit)
            self._clear_check()
            self._check_solved()
            self._refresh()
            event.stop()
            event.prevent_default()

    def action_clear(self) -> None:
        self.game.clear()
        self._clear_check()
        self._refresh()

    def action_toggle_pencil_mode(self) -> None:
        self.pencil_mode = not self.pencil_mode
        self._refresh()

    def action_check(self) -> None:
        wrong = self.game.wrong_cells()
        self.grid_widget.wrong = wrong
        self._refresh()
        if wrong:
            n = len(wrong)
            self.notify(
                f"{n} incorrect cell{'s' if n != 1 else ''}.",
                title="Check",
                severity="warning",
            )
        else:
            self.notify("No mistakes so far!", title="Check")

    def action_undo(self) -> None:
        self.game.undo()
        self._clear_check()
        self._refresh()

    def action_redo(self) -> None:
        self.game.redo()
        self._clear_check()
        self._refresh()

    def action_new_puzzle(self) -> None:
        self.app.pop_screen()

    def _check_solved(self):
        if not self.solved and self.game.is_solved():
            self.solved = True
            self.app.bell()
            self.notify("Solved! Press 'n' for a new puzzle.", title="Solved!")
