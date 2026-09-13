"""Hand-built puzzles with known properties, for the generation tests."""

LATIN_4 = [[1, 2, 3, 4], [2, 3, 4, 1], [3, 4, 1, 2], [4, 1, 2, 3]]


def all_singles_4x4() -> dict:
    """Every cell stipulated: trivially unique, solved by stipulation alone."""
    return {
        "size": 4,
        "solution": [row[:] for row in LATIN_4],
        "cages": [{"cells": [i], "operation": "", "value": LATIN_4[i // 4][i % 4]} for i in range(16)],
    }


def one_big_cage_4x4() -> dict:
    """A single + cage over the whole board: every Latin square satisfies it."""
    return {
        "size": 4,
        "solution": [row[:] for row in LATIN_4],
        "cages": [{"cells": list(range(16)), "operation": "+", "value": 40}],
    }


def uncovered_2x2() -> dict:
    return {"size": 2, "solution": [[1, 2], [2, 1]], "cages": [{"cells": [0], "operation": "", "value": 1}]}


def overlapping_2x2() -> dict:
    return {
        "size": 2,
        "solution": [[1, 2], [2, 1]],
        "cages": [
            {"cells": [0, 1], "operation": "+", "value": 3},
            {"cells": [1, 3], "operation": "+", "value": 3},
            {"cells": [2], "operation": "", "value": 2},
        ],
    }


def disconnected_4x4() -> dict:
    p = all_singles_4x4()
    # Replace the two corner singles with one + cage spanning them
    p["cages"] = [c for c in p["cages"] if c["cells"] not in ([0], [15])]
    p["cages"].append({"cells": [0, 15], "operation": "+", "value": LATIN_4[0][0] + LATIN_4[3][3]})
    return p
