"""
Re-fit the size-specific normalization anchors for the new solver based on
the empirical raw-score distribution across the existing 4000 puzzles.

Strategy: anchors are (low, high) in log2(raw_score) space. We pick
  low  = log2(p10 raw)   so 10% of puzzles fall below score 10 (easiest)
  high = log2(p90 raw)   so 10% of puzzles fall above score 90 (expert)

Run with:  python3 scripts/calibrate-anchors.py
"""

import json
import math
import os
import sys
from collections import defaultdict

# Make backend/ importable
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "backend"))

from solver import solve_puzzle, SIZE_ANCHORS  # noqa: E402


def percentile(values, pct):
    """Inclusive linear-interpolation percentile (numpy-free)."""
    if not values:
        return 0.0
    values = sorted(values)
    k = (len(values) - 1) * (pct / 100)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(values[int(k)])
    return values[f] + (values[c] - values[f]) * (k - f)


def main():
    path = os.path.join(ROOT, "public/all_puzzles.jsonl")
    with open(path) as f:
        lines = f.readlines()

    by_size = defaultdict(list)
    for i, line in enumerate(lines):
        rec = json.loads(line)
        stats = solve_puzzle(rec["puzzle"])
        by_size[rec["puzzle"]["size"]].append(stats.raw_score)
        if (i + 1) % 200 == 0:
            print(f"  scored {i + 1}/{len(lines)}", file=sys.stderr)

    print("\n=== Empirical raw-score distribution per size ===")
    print(f"{'size':>5}  {'n':>4}  {'p10':>5}  {'p25':>5}  {'p50':>5}  {'p75':>5}  {'p90':>5}  {'max':>5}")
    new_anchors = {}
    for size in sorted(by_size.keys()):
        vals = by_size[size]
        p10 = percentile(vals, 10)
        p25 = percentile(vals, 25)
        p50 = percentile(vals, 50)
        p75 = percentile(vals, 75)
        p90 = percentile(vals, 90)
        pmax = max(vals)
        print(f"{size:>5}  {len(vals):>4}  {p10:>5.0f}  {p25:>5.0f}  {p50:>5.0f}  {p75:>5.0f}  {p90:>5.0f}  {pmax:>5.0f}")
        new_anchors[size] = (round(math.log2(max(1, p10)), 2), round(math.log2(max(1, p90)), 2))

    print("\n=== Current vs proposed anchors (log2 space) ===")
    print(f"{'size':>5}  {'current':>16}  {'proposed':>16}")
    for size in sorted(by_size.keys()):
        cur = SIZE_ANCHORS.get(size, (6.0, 12.0))
        new = new_anchors[size]
        print(f"{size:>5}  {str(cur):>16}  {str(new):>16}")

    print("\n=== Expected new-anchor bucket distribution ===")
    for size in sorted(by_size.keys()):
        low, high = new_anchors[size]
        buckets = {"easiest": 0, "easy": 0, "medium": 0, "hard": 0, "expert": 0}
        for raw in by_size[size]:
            if raw <= 0:
                score = 0.0
            else:
                log_raw = math.log2(max(1, raw))
                score = 10 + (log_raw - low) / (high - low) * 80
                score = min(100, max(0, score))
            if score <= 15:
                buckets["easiest"] += 1
            elif score <= 30:
                buckets["easy"] += 1
            elif score <= 50:
                buckets["medium"] += 1
            elif score <= 70:
                buckets["hard"] += 1
            else:
                buckets["expert"] += 1
        n = sum(buckets.values())
        pct = {k: f"{v*100/n:.1f}%" for k, v in buckets.items()}
        print(f"  {size}x{size}: {pct}")

    print("\n=== Python code to paste into backend/solver.py SIZE_ANCHORS ===")
    print("SIZE_ANCHORS: Dict[int, Tuple[float, float]] = {")
    for size in sorted(new_anchors.keys()):
        low, high = new_anchors[size]
        print(f"    {size}: ({low}, {high}),")
    print("}")


if __name__ == "__main__":
    main()
