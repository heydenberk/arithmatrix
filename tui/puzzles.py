"""Load and filter Arithmatrix puzzles from the shared JSONL corpus."""

from __future__ import annotations

import json
import random as _random
from pathlib import Path

# public/all_puzzles.jsonl lives two levels up from this file (repo root).
DEFAULT_PATH = Path(__file__).resolve().parent.parent / "public" / "all_puzzles.jsonl"

DIFFICULTIES = ["easiest", "easy", "medium", "hard", "expert"]
SIZES = [4, 5, 6, 7]


def load_puzzles(size, difficulty, path=DEFAULT_PATH):
    """Return all puzzle dicts matching ``size`` and ``difficulty``.

    Each returned dict is the inner ``puzzle`` object (size, cages, solution).
    Raises FileNotFoundError if the corpus file is missing.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Puzzle database not found: {path}")
    matches = []
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            meta = record.get("metadata", {})
            if meta.get("size") == size and meta.get("actual_difficulty") == difficulty:
                matches.append(record["puzzle"])
    return matches


def pick_random(size, difficulty, rng=None, path=DEFAULT_PATH):
    """Return one random matching puzzle, or None if the bucket is empty."""
    matches = load_puzzles(size, difficulty, path=path)
    if not matches:
        return None
    rng = rng or _random
    return rng.choice(matches)
