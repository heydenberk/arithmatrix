import random
import time

import pytest

from backend import arithmatrix
from backend.arithmatrix import (
    _max_single_cages,
    carve_square,
    evaluate_candidate,
    generate_arithmatrix_puzzle,
    weighted_partition_sample,
)
from backend.latin_square import get_latin_square
from backend.solver import Deadline, DeadlineExceeded, count_solutions, solve_puzzle
from backend.validation import validate_puzzle
from tests.backend.fixtures import all_singles_4x4, one_big_cage_4x4, uncovered_2x2


@pytest.fixture(autouse=True)
def _seed():
    random.seed(12345)


# --- acceptance ------------------------------------------------------------ #


def test_solve_without_verification_reports_solved_but_not_valid():
    stats = solve_puzzle(all_singles_4x4(), verify_uniqueness=False)
    assert stats.solved is True
    assert stats.is_valid is False and stats.solution_count == 0


def test_evaluate_candidate_accepts_a_unique_puzzle_and_marks_it_valid():
    stats = evaluate_candidate(all_singles_4x4())
    assert stats is not None
    assert stats.is_valid and stats.solution_count == 1 and stats.solved


def test_evaluate_candidate_rejects_non_unique_and_malformed():
    assert evaluate_candidate(one_big_cage_4x4()) is None
    assert evaluate_candidate(uncovered_2x2()) is None


def test_generator_returns_none_rather_than_an_unvalidated_puzzle(monkeypatch):
    # Every candidate is non-unique; the old code fell through to a fallback
    # that returned one anyway with actual_difficulty="unknown".
    monkeypatch.setattr(arithmatrix, "_generate_basic_puzzle", lambda *a, **k: one_big_cage_4x4())
    assert generate_arithmatrix_puzzle(4, "easiest", max_difficulty_attempts=5) is None


def test_generator_returns_closest_accepted_match_with_full_metadata(monkeypatch):
    monkeypatch.setattr(arithmatrix, "_generate_basic_puzzle", lambda *a, **k: all_singles_4x4())
    puzzle = generate_arithmatrix_puzzle(4, "expert", max_difficulty_attempts=3)
    assert puzzle is not None
    assert puzzle["actual_difficulty"] == "easiest"  # labelled with what it is
    assert isinstance(puzzle["techniques_used"], dict) and puzzle["techniques_used"]
    assert "difficulty_score" in puzzle


@pytest.mark.parametrize("size,difficulty", [(4, "easiest"), (5, "medium"), (6, "easy")])
def test_generated_puzzles_are_well_formed_unique_and_annotated(size, difficulty):
    # Enough candidates that a run of unlucky non-unique carvings cannot make
    # this None; what is asserted is the contract of whatever comes back
    puzzle = generate_arithmatrix_puzzle(size, difficulty, max_difficulty_attempts=20)
    assert puzzle is not None
    assert validate_puzzle(puzzle) == []
    assert count_solutions(puzzle, 2) == 1
    assert puzzle["actual_difficulty"] in arithmatrix.DIFFICULTY_ORDER
    assert puzzle["techniques_used"]


def test_allowed_operations_are_respected():
    puzzle = generate_arithmatrix_puzzle(5, "medium", allowed_operations=["+"], max_difficulty_attempts=3)
    assert puzzle is not None
    assert {c["operation"] for c in puzzle["cages"]} <= {"", "+"}


# --- deadlines ------------------------------------------------------------- #


def test_expired_deadline_returns_none_immediately():
    t = time.time()
    assert generate_arithmatrix_puzzle(7, "expert", deadline=Deadline(time.time() - 1)) is None
    assert time.time() - t < 0.5


def test_count_solutions_raises_from_inside_the_search():
    # A wide-open 7x7 with no cap to stop at: every Latin square is a solution,
    # so without the cutoff the search would enumerate all ~6e11 of them
    size = 7
    cages = []
    for r in range(size):
        cages.append({"cells": [r * size + c for c in range(size)], "operation": "+", "value": 28})
    puzzle = {"size": size, "cages": cages}
    t = time.time()
    with pytest.raises(DeadlineExceeded):
        count_solutions(puzzle, cap=10**9, deadline=Deadline(time.time() + 0.1, every=64))
    assert time.time() - t < 2.0


# --- structure ------------------------------------------------------------- #


def test_carving_supports_more_than_26_cages():
    square = get_latin_square(6)
    caged = carve_square(square, {i: 1 for i in range(1, 37)})
    assert int((caged == 0).sum()) == 0
    assert int(caged.max()) == 36


def test_single_cell_cap_table():
    assert {n: _max_single_cages(n) for n in (4, 5, 6, 7)} == {4: 2, 5: 2, 6: 4, 7: 5}


def test_partition_sampler_handles_zero_weight_remainder():
    assert weighted_partition_sample([0, 1, 0, 0, 0], 3) is None
    assert sum(weighted_partition_sample([1, 1, 1, 1, 1], 16)) == 16


def test_heuristic_prefilter_is_gone():
    assert not hasattr(arithmatrix, "estimate_difficulty_fast")
    from backend import solver

    assert not hasattr(solver, "estimate_difficulty_fast")
