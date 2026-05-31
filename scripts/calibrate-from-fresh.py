"""
Calibrate size anchors from FRESHLY generated puzzles under the current
generation settings (single-cell cap, difficulty-conditioned weights).

Unlike calibrate-anchors.py (which scores the existing corpus), this generates
untargeted puzzles directly so the anchors reflect the *achievable* raw-score
range under the current generator — necessary after the single-cell cap, which
shifts the whole distribution.

For each size we generate puzzles across all five difficulty weight-profiles
and pool them, so the sample spans the full easy-leaning..hard-leaning range
of cage structures. Anchors: low = log2(p10), high = log2(p90).

Run:  python3 scripts/calibrate-from-fresh.py [per_profile]
"""

import math
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "backend"))

from arithmatrix import _generate_basic_puzzle, _CAGE_SIZE_WEIGHTS  # noqa: E402
from solver import solve_puzzle  # noqa: E402
from latin_square import warm_up_pool  # noqa: E402

PER_PROFILE = int(sys.argv[1]) if len(sys.argv) > 1 else 120
SIZES = [4, 5, 6, 7]
PROFILES = list(_CAGE_SIZE_WEIGHTS.keys())


def percentile(values, pct):
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
    warm_up_pool(SIZES)
    by_size = defaultdict(list)

    for size in SIZES:
        for profile in PROFILES:
            got = 0
            attempts = 0
            while got < PER_PROFILE and attempts < PER_PROFILE * 3:
                attempts += 1
                try:
                    p = _generate_basic_puzzle(size, difficulty=profile)
                except Exception:
                    continue
                stats = solve_puzzle(p)
                if not stats.is_valid:
                    continue
                by_size[size].append(stats.raw_score)
                got += 1
            print(f"  {size}x{size} {profile:8}: {got} puzzles", file=sys.stderr)

    print("\n=== Achievable raw-score distribution per size (capped givens) ===")
    print(f"{'size':>5}  {'n':>5}  {'p5':>5}  {'p10':>5}  {'p50':>5}  {'p90':>5}  {'p95':>5}  {'max':>6}")
    new_anchors = {}
    for size in SIZES:
        vals = by_size[size]
        p5 = percentile(vals, 5)
        p10 = percentile(vals, 10)
        p50 = percentile(vals, 50)
        p90 = percentile(vals, 90)
        p95 = percentile(vals, 95)
        print(f"{size:>5}  {len(vals):>5}  {p5:>5.0f}  {p10:>5.0f}  {p50:>5.0f}  {p90:>5.0f}  {p95:>5.0f}  {max(vals):>6.0f}")
        new_anchors[size] = (round(math.log2(max(1, p10)), 2), round(math.log2(max(1, p90)), 2))

    print("\n=== Expected bucket distribution under proposed anchors ===")
    for size in SIZES:
        low, high = new_anchors[size]
        buckets = {"easiest": 0, "easy": 0, "medium": 0, "hard": 0, "expert": 0}
        for raw in by_size[size]:
            log_raw = math.log2(max(1, raw)) if raw > 0 else 0
            score = 10 + (log_raw - low) / (high - low) * 80 if raw > 0 else 0
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
        pct = {k: f"{v*100/n:.0f}%" for k, v in buckets.items()}
        print(f"  {size}x{size}: {pct}")

    print("\n=== Paste into backend/solver.py SIZE_ANCHORS ===")
    print("SIZE_ANCHORS: Dict[int, Tuple[float, float]] = {")
    for size in SIZES:
        low, high = new_anchors[size]
        print(f"    {size}: ({low}, {high}),")
    print("}")
    print("\n=== TS (src/utils/solver.ts) ===")
    for size in SIZES:
        low, high = new_anchors[size]
        print(f"  {size}: [{low}, {high}],")


if __name__ == "__main__":
    main()
