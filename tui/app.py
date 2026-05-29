"""ArithmatrixApp — top-level Textual application."""

from __future__ import annotations

from textual.app import App

from tui.screens import PickerScreen


class ArithmatrixApp(App):
    TITLE = "Arithmatrix"
    BINDINGS = [("q", "quit", "Quit")]
    CSS = """
    GridWidget { width: auto; height: auto; padding: 1 2; }
    #status { color: $text-muted; padding: 0 2; }
    #picker-title { padding: 1 2; text-style: bold; }
    """

    def on_mount(self) -> None:
        self.push_screen(PickerScreen())
