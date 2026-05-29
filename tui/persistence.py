"""Persist and restore an in-progress Arithmatrix game (single save slot)."""

from __future__ import annotations

import json
from pathlib import Path

SAVE_PATH = Path.home() / ".arithmatrix" / "save.json"


def _resolve(path):
    return Path(path) if path is not None else SAVE_PATH


def save_game(game, difficulty, path=None):
    """Write the puzzle and the player's current progress to disk."""
    path = _resolve(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "size": game.size,
        "difficulty": difficulty,
        "puzzle": game.to_puzzle(),
        "progress": game.export_progress(),
    }
    path.write_text(json.dumps(data))


def load_save(path=None):
    """Return the saved game dict, or None if absent/unreadable."""
    path = _resolve(path)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def clear_save(path=None):
    """Delete the save file if it exists."""
    path = _resolve(path)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
