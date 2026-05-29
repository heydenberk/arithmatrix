import json
import random
from pathlib import Path

import pytest

from tui import puzzles


def _write_corpus(tmp_path, records):
    p = tmp_path / "all_puzzles.jsonl"
    p.write_text("\n".join(json.dumps(r) for r in records) + "\n")
    return p


def _rec(size, difficulty):
    return {
        "puzzle": {
            "size": size,
            "cages": [{"cells": [0], "operation": "", "value": 1}],
            "solution": [[1]],
        },
        "metadata": {"size": size, "actual_difficulty": difficulty},
    }


def test_load_filters_by_size_and_difficulty(tmp_path):
    path = _write_corpus(
        tmp_path,
        [_rec(4, "easy"), _rec(4, "hard"), _rec(5, "easy")],
    )
    result = puzzles.load_puzzles(4, "easy", path=path)
    assert len(result) == 1
    assert result[0]["size"] == 4


def test_pick_random_is_deterministic_with_seed(tmp_path):
    path = _write_corpus(tmp_path, [_rec(4, "easy"), _rec(4, "easy")])
    a = puzzles.pick_random(4, "easy", rng=random.Random(1), path=path)
    b = puzzles.pick_random(4, "easy", rng=random.Random(1), path=path)
    assert a == b


def test_empty_bucket_returns_none(tmp_path):
    path = _write_corpus(tmp_path, [_rec(4, "easy")])
    assert puzzles.pick_random(7, "expert", path=path) is None


def test_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        puzzles.load_puzzles(4, "easy", path=tmp_path / "nope.jsonl")
