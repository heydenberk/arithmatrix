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
    by_tier: dict = collections.defaultdict(list)
    keep = []

    for index, line in enumerate(lines):
        record = json.loads(line)
        key = (record["metadata"]["size"], record["metadata"]["actual_difficulty"])
        totals[key] += 1
        by_tier[key].append(record["metadata"].get("difficulty_score", 0.0))
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

    # Tier health: a tier is only meaningful if its scores sit in its own band
    # and above the tier below it.
    print("\nsize  difficulty   n     score min/median/max")
    order = ["easiest", "easy", "medium", "hard", "expert"]
    for size in sorted({k[0] for k in totals}):
        previous_median = None
        for difficulty in order:
            scores = sorted(by_tier.get((size, difficulty), []))
            if not scores:
                print(f"  {size}x{size} {difficulty:8s}  {0:4d}   (none)")
                continue
            median = scores[len(scores) // 2]
            flag = ""
            if previous_median is not None and median < previous_median:
                flag = "  <- out of order"
            previous_median = median
            print(
                f"  {size}x{size} {difficulty:8s}  {len(scores):4d}   "
                f"{scores[0]:5.1f} / {median:5.1f} / {scores[-1]:5.1f}{flag}"
            )

    if args.write_clean:
        Path(args.write_clean).write_text("\n".join(keep) + "\n")
        print(f"wrote {len(keep)} uniquely-solvable puzzles to {args.write_clean}")

    return 1 if total_bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
