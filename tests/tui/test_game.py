from tui.game import Cage, GameState, cage_satisfied

# 4x4 puzzle (first row of public/all_puzzles.jsonl), solution known unique.
PUZZLE_4 = {
    "size": 4,
    "cages": [
        {"cells": [9, 13], "operation": "+", "value": 4},
        {"cells": [0], "operation": "", "value": 1},
        {"cells": [15], "operation": "", "value": 1},
        {"cells": [6, 10, 11], "operation": "+", "value": 8},
        {"cells": [2], "operation": "", "value": 3},
        {"cells": [8, 12], "operation": "+", "value": 6},
        {"cells": [1, 4, 5], "operation": "+", "value": 9},
        {"cells": [3], "operation": "", "value": 2},
        {"cells": [7], "operation": "", "value": 4},
        {"cells": [14], "operation": "", "value": 2},
    ],
    "solution": [[1, 4, 3, 2], [3, 2, 1, 4], [2, 1, 4, 3], [4, 3, 2, 1]],
}


def test_givens_prefilled_and_locked():
    g = GameState(PUZZLE_4)
    assert (0, 0) in g.given
    assert g.grid[0][0] == 1
    g.cursor = (0, 0)
    assert g.set_value(5) is False
    assert g.grid[0][0] == 1
    assert g.clear() is False


def test_set_and_clear_normal_cell():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    assert g.set_value(2) is True
    assert g.grid[1][1] == 2
    assert g.clear() is True
    assert g.grid[1][1] is None


def test_move_clamps_to_grid():
    g = GameState(PUZZLE_4)
    g.cursor = (0, 0)
    g.move(-1, -1)
    assert g.cursor == (0, 0)
    g.cursor = (3, 3)
    g.move(1, 1)
    assert g.cursor == (3, 3)
    g.cursor = (0, 0)
    g.move(1, 0)
    assert g.cursor == (1, 0)


def test_cage_lookup_and_label():
    g = GameState(PUZZLE_4)
    cage = g.cage_of[(1, 1)]
    assert isinstance(cage, Cage)
    assert cage.label() == "9+"
    assert g.cage_of[(0, 0)].label() == ""


def test_pencil_toggle_and_block_on_filled():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    assert g.toggle_pencil(3) is True
    assert g.pencil[1][1] == {3}
    assert g.toggle_pencil(3) is True
    assert g.pencil[1][1] == set()
    g.set_value(2)
    assert g.toggle_pencil(4) is False


def test_undo_redo_roundtrip():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    g.set_value(2)
    g.cursor = (1, 2)
    g.set_value(1)
    assert g.undo() is True
    assert g.grid[1][2] is None
    assert g.grid[1][1] == 2
    assert g.redo() is True
    assert g.grid[1][2] == 1


def test_new_mutation_truncates_redo_tail():
    g = GameState(PUZZLE_4)
    g.cursor = (1, 1)
    g.set_value(2)
    g.undo()
    g.set_value(3)
    assert g.redo() is False
    assert g.grid[1][1] == 3


def test_undo_at_start_is_noop():
    g = GameState(PUZZLE_4)
    assert g.undo() is False


def _fill_with_solution(g):
    for r in range(g.size):
        for c in range(g.size):
            g.cursor = (r, c)
            if (r, c) not in g.given:
                g.set_value(g.solution[r][c])


def test_unsolved_when_empty():
    g = GameState(PUZZLE_4)
    assert g.is_solved() is False


def test_solved_with_correct_solution():
    g = GameState(PUZZLE_4)
    _fill_with_solution(g)
    assert g.is_solved() is True


def test_not_solved_with_wrong_but_full_grid():
    g = GameState(PUZZLE_4)
    _fill_with_solution(g)
    g.cursor = (1, 1)
    g.set_value(1 if g.grid[1][1] != 1 else 4)
    assert g.is_solved() is False


def test_cage_satisfied_single():
    assert cage_satisfied("", 3, [3]) is True
    assert cage_satisfied("", 3, [4]) is False
    assert cage_satisfied("", 3, [3, 3]) is False  # wrong arity


def test_cage_satisfied_addition():
    assert cage_satisfied("+", 8, [3, 5]) is True
    assert cage_satisfied("+", 8, [2, 2, 4]) is True
    assert cage_satisfied("+", 8, [3, 4]) is False


def test_cage_satisfied_subtraction():
    assert cage_satisfied("-", 2, [5, 3]) is True
    assert cage_satisfied("-", 2, [3, 5]) is True  # order-independent
    assert cage_satisfied("-", 2, [5, 2]) is False
    assert cage_satisfied("-", 2, [5, 3, 1]) is False  # wrong arity


def test_cage_satisfied_multiplication():
    assert cage_satisfied("*", 24, [2, 3, 4]) is True
    assert cage_satisfied("*", 12, [3, 4]) is True
    assert cage_satisfied("*", 12, [3, 3]) is False


def test_cage_satisfied_division():
    assert cage_satisfied("/", 3, [6, 2]) is True
    assert cage_satisfied("/", 3, [2, 6]) is True  # order-independent
    assert cage_satisfied("/", 2, [6, 2]) is False
    assert cage_satisfied("/", 3, [6, 4]) is False  # not divisible
    assert cage_satisfied("/", 3, [6, 2, 1]) is False  # wrong arity


def test_cage_satisfied_unknown_op():
    assert cage_satisfied("?", 1, [1]) is False


def test_wrong_cells_flags_only_mismatches():
    g = GameState(PUZZLE_4)
    # Empty board (only givens, which are correct) → no wrong cells.
    assert g.wrong_cells() == set()
    # Enter a correct value at (1,1) (solution is 2) → still none.
    g.cursor = (1, 1)
    g.set_value(2)
    assert g.wrong_cells() == set()
    # Enter a wrong value at (1,2) (solution is 1) → flagged.
    g.cursor = (1, 2)
    g.set_value(3)
    assert g.wrong_cells() == {(1, 2)}
    # Clearing it removes the flag.
    g.clear()
    assert g.wrong_cells() == set()
