#!/usr/bin/env python3
"""
Checks every shipped puzzle for the property that makes a puzzle fair: exactly
one solution.

    python3 scripts/validate_puzzles.py [path] [--write-clean out.jsonl]

Puzzles used to be accepted on a broken signal - the solver's `solve()` took a
`max_solutions` argument defaulting to 1, so backtracking stopped at the first
solution and then reported "uniquely solvable". Anything solvable at all
passed. This re-checks the corpus with an independent counter.

Exits non-zero if any puzzle has other than one solution, so it can gate a
release.
"""

import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.solver import count_solutions  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="public/all_puzzles.jsonl")
    parser.add_argument(
        "--write-clean",
        metavar="OUT",
        help="write only the uniquely-solvable puzzles to OUT",
    )
    args = parser.parse_args()

    lines = Path(args.path).read_text().strip().split("\n")
    totals: collections.Counter = collections.Counter()
    bad: collections.Counter = collections.Counter()
    keep = []

    for index, line in enumerate(lines):
        record = json.loads(line)
        key = (record["metadata"]["size"], record["metadata"]["actual_difficulty"])
        totals[key] += 1
        count = count_solutions(record["puzzle"], 2)
        if count == 1:
            keep.append(line)
        else:
            bad[key] += 1
            print(f"  line {index}: {key[0]}x{key[0]} {key[1]} has {count}+ solutions")

    print("\nsize  difficulty   bad / total")
    for key in sorted(totals):
        print(f"  {key[0]}x{key[0]} {key[1]:8s}  {bad[key]:4d} / {totals[key]:4d}")

    total_bad = sum(bad.values())
    total = sum(totals.values())
    print(f"\n{total_bad} of {total} puzzles are not uniquely solvable ({100 * total_bad / total:.1f}%)")

    if args.write_clean:
        Path(args.write_clean).write_text("\n".join(keep) + "\n")
        print(f"wrote {len(keep)} uniquely-solvable puzzles to {args.write_clean}")

    return 1 if total_bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
