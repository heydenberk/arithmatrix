from backend.validation import puzzle_structure_errors, solution_errors, validate_puzzle
from tests.backend.fixtures import (
    all_singles_4x4,
    disconnected_4x4,
    one_big_cage_4x4,
    overlapping_2x2,
    uncovered_2x2,
)


def test_well_formed_puzzles_have_no_errors():
    assert validate_puzzle(all_singles_4x4()) == []
    assert validate_puzzle(one_big_cage_4x4()) == []


def test_uncovered_cell_is_reported():
    errors = puzzle_structure_errors(uncovered_2x2())
    assert any("belong to no cage" in e for e in errors)


def test_overlapping_cages_are_reported():
    errors = puzzle_structure_errors(overlapping_2x2())
    assert any("cell 1 is in cage 0 and cage 1" in e for e in errors)


def test_disconnected_cage_is_reported():
    errors = puzzle_structure_errors(disconnected_4x4())
    assert any("not connected" in e for e in errors)


def test_operation_arity_is_checked():
    p = all_singles_4x4()
    p["cages"][0]["operation"] = "-"  # subtraction on a single cell
    assert any("uses - with 1 cells" in e for e in puzzle_structure_errors(p))


def test_solution_must_satisfy_cages_and_latin_rule():
    p = all_singles_4x4()
    p["cages"][0]["value"] = 9
    assert any("cage 0" in e for e in solution_errors(p))
    p = all_singles_4x4()
    p["solution"][0][0] = 4  # duplicate in row 0 and column 0
    errors = solution_errors(p)
    assert any("row 0" in e for e in errors) and any("column 0" in e for e in errors)
