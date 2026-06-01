"""
Compute per-size quantile boundaries (q20/q40/q60/q80) of the bottleneck
raw_score from freshly generated capped puzzles. These define the difficulty
tiers directly: easiest = bottom 20%, easy = 20-40%, medium = 40-60%,
hard = 60-80%, expert = top 20%.

Robust to the bimodal distribution the bottleneck score produces (where fixed
score thresholds leave the "medium" tier nearly empty).

Run:  python3 scripts/calibrate-quantiles.py [per_profile]
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

PER_PROFILE = int(sys.argv[1]) if len(sys.argv) > 1 else 150
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
        print(f"  {size}x{size}: {len(by_size[size])} puzzles", file=sys.stderr)

    quantiles = {}
    print("\n=== Per-size raw-score quantile boundaries ===")
    print(f"{'size':>5}  {'q20':>7}  {'q40':>7}  {'q60':>7}  {'q80':>7}")
    for size in SIZES:
        vals = by_size[size]
        q = tuple(round(percentile(vals, p), 1) for p in (20, 40, 60, 80))
        quantiles[size] = q
        print(f"{size:>5}  " + "  ".join(f"{x:>7.1f}" for x in q))

    print("\n=== Paste into backend/solver.py SIZE_QUANTILES ===")
    print("SIZE_QUANTILES: Dict[int, Tuple[float, float, float, float]] = {")
    for size in SIZES:
        print(f"    {size}: {quantiles[size]},")
    print("}")
    print("\n=== TS (src/utils/solver.ts) ===")
    for size in SIZES:
        print(f"  {size}: [{', '.join(str(x) for x in quantiles[size])}],")


if __name__ == "__main__":
    main()
