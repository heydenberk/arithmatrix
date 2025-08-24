#!/usr/bin/env python3
"""
Analysis of playthrough data to validate and improve difficulty system.
"""

import json
import matplotlib.pyplot as plt
import numpy as np
from typing import Dict, List, Tuple

# Your playthrough data
PLAYTHROUGH_DATA = {
    "easiest": 532,  # seconds
    "easy": 542,  # seconds
    "medium": 424,  # seconds
    "hard": 399,  # seconds
    "expert": 521,  # seconds
}


def load_difficulty_system():
    """Load the current vigintile difficulty system."""
    with open("vigintile_difficulty_system.json", "r") as f:
        return json.load(f)


def analyze_playthrough_data():
    """Analyze the playthrough data and compare with current system."""

    print("=== PLAYTHROUGH DATA ANALYSIS ===\n")

    # Load current difficulty system
    difficulty_system = load_difficulty_system()

    # Expected difficulty progression (should be monotonically increasing)
    expected_order = ["easiest", "easy", "medium", "hard", "expert"]

    print("Your Playthrough Results (average solve time in seconds):")
    print("-" * 50)
    for level in expected_order:
        time = PLAYTHROUGH_DATA[level]
        print(f"{level:>8}: {time:>6.1f}s")

    # Analyze the progression
    print(f"\n=== ANALYSIS ===")

    # Check if times increase monotonically
    times = [PLAYTHROUGH_DATA[level] for level in expected_order]
    is_monotonic = all(times[i] <= times[i + 1] for i in range(len(times) - 1))

    print(f"Monotonic progression: {'✅' if is_monotonic else '❌'}")

    if not is_monotonic:
        print("\n⚠️  ANOMALIES DETECTED:")
        for i in range(len(times) - 1):
            if times[i] > times[i + 1]:
                print(
                    f"  - {expected_order[i]} ({times[i]:.1f}s) > {expected_order[i + 1]} ({times[i + 1]:.1f}s)"
                )

    # Calculate difficulty gaps
    print(f"\n=== DIFFICULTY GAPS ===")
    for i in range(len(times) - 1):
        current = times[i]
        next_level = times[i + 1]
        gap = next_level - current
        gap_pct = (gap / current) * 100 if current > 0 else 0

        print(
            f"{expected_order[i]} → {expected_order[i + 1]}: {gap:+.1f}s ({gap_pct:+.1f}%)"
        )

    # Find the most challenging jump
    gaps = [times[i + 1] - times[i] for i in range(len(times) - 1)]
    max_gap_idx = gaps.index(max(gaps))
    min_gap_idx = gaps.index(min(gaps))

    print(
        f"\nLargest difficulty jump: {expected_order[max_gap_idx]} → {expected_order[max_gap_idx + 1]} ({gaps[max_gap_idx]:+.1f}s)"
    )
    print(
        f"Smallest difficulty jump: {expected_order[min_gap_idx]} → {expected_order[min_gap_idx + 1]} ({gaps[min_gap_idx]:+.1f}s)"
    )

    return times, expected_order


def analyze_vigintile_mapping():
    """Analyze how the 5-level system maps to the 20-level vigintile system."""

    print(f"\n=== VIGINTILE MAPPING ANALYSIS ===")

    difficulty_system = load_difficulty_system()

    # Current mapping (based on percentile ranges)
    mapping = {
        "easiest": (0, 20),  # 0-20th percentile
        "easy": (20, 40),  # 20-40th percentile
        "medium": (40, 60),  # 40-60th percentile
        "hard": (60, 80),  # 60-80th percentile
        "expert": (80, 100),  # 80-100th percentile
    }

    print("Current 5-level to 20-level mapping:")
    print("-" * 40)
    for level, (min_p, max_p) in mapping.items():
        vigintiles = list(range(min_p // 5 + 1, max_p // 5 + 1))
        print(f"{level:>8}: {min_p:>3}%-{max_p:<3}% → Vigintiles {vigintiles}")

    # Check if the mapping aligns with your playthrough data
    print(f"\n=== MAPPING VALIDATION ===")

    # Your data suggests medium and hard might be too close
    medium_time = PLAYTHROUGH_DATA["medium"]
    hard_time = PLAYTHROUGH_DATA["hard"]

    if hard_time < medium_time:
        print(
            "⚠️  Your data suggests 'hard' puzzles are actually easier than 'medium' puzzles"
        )
        print("   This could indicate:")
        print("   1. The vigintile ranges need adjustment")
        print("   2. The scoring algorithm doesn't align with human solving patterns")
        print("   3. Sample size is too small for reliable measurement")

    return mapping


def suggest_improvements():
    """Suggest improvements based on the playthrough data."""

    print(f"\n=== SUGGESTED IMPROVEMENTS ===")

    # Based on your data, here are some suggestions:
    suggestions = [
        "1. **Investigate Medium vs Hard Gap**: Your data shows medium (424s) > hard (399s)",
        "   - Consider adjusting the vigintile ranges for these levels",
        "   - Medium: currently 40-60th percentile, maybe try 40-65th",
        "   - Hard: currently 60-80th percentile, maybe try 65-85th",
        "",
        "2. **Expand Expert Range**: Expert (521s) is only slightly harder than easiest (532s)",
        "   - Consider making expert 85-100th percentile instead of 80-100th",
        "   - This would create more separation from hard level",
        "",
        "3. **Validate with More Data**: Consider collecting more playthrough data",
        "   - Multiple sessions per difficulty level",
        "   - Different puzzle sizes",
        "   - Different players if possible",
        "",
        "4. **Time-Based Calibration**: Consider incorporating solve time into difficulty scoring",
        "   - Add a time component to the difficulty algorithm",
        "   - Weight structural complexity vs. solving time",
        "",
        "5. **Difficulty Refinement**: Consider adding intermediate levels",
        "   - Maybe add 'very easy' between easiest and easy",
        "   - Or 'very hard' between hard and expert",
    ]

    for suggestion in suggestions:
        print(suggestion)


def create_visualization():
    """Create a visualization of the playthrough data."""

    try:
        import matplotlib.pyplot as plt

        levels = list(PLAYTHROUGH_DATA.keys())
        times = list(PLAYTHROUGH_DATA.values())

        plt.figure(figsize=(10, 6))

        # Create bar chart
        bars = plt.bar(
            levels, times, color=["#4CAF50", "#8BC34A", "#FFC107", "#FF9800", "#F44336"]
        )

        # Add value labels on bars
        for bar, time in zip(bars, times):
            plt.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 10,
                f"{time:.0f}s",
                ha="center",
                va="bottom",
                fontweight="bold",
            )

        plt.title(
            "Average Solve Time by Difficulty Level", fontsize=16, fontweight="bold"
        )
        plt.xlabel("Difficulty Level", fontsize=12)
        plt.ylabel("Average Solve Time (seconds)", fontsize=12)
        plt.ylim(0, max(times) * 1.15)

        # Add grid
        plt.grid(axis="y", alpha=0.3)

        # Highlight anomalies
        if PLAYTHROUGH_DATA["medium"] > PLAYTHROUGH_DATA["hard"]:
            bars[2].set_color("#FF5722")  # Red for medium
            bars[3].set_color("#FF5722")  # Red for hard
            plt.text(
                2.5,
                max(times) * 1.05,
                "⚠️ Anomaly: Medium > Hard",
                ha="center",
                fontsize=12,
                fontweight="bold",
                color="red",
            )

        plt.tight_layout()
        plt.savefig("playthrough_analysis.png", dpi=300, bbox_inches="tight")
        print(f"\n📊 Visualization saved as 'playthrough_analysis.png'")

    except ImportError:
        print(
            f"\n📊 Install matplotlib to generate visualization: pip install matplotlib"
        )


def main():
    """Main analysis function."""

    print("🎯 ARITHMATRIX DIFFICULTY ANALYSIS")
    print("=" * 50)

    # Run analyses
    times, levels = analyze_playthrough_data()
    mapping = analyze_vigintile_mapping()
    suggest_improvements()
    create_visualization()

    print(f"\n=== SUMMARY ===")
    print(f"Your playthrough data reveals some interesting patterns:")
    print(f"• Easiest and Expert levels are very close in solve time")
    print(f"• Medium puzzles took longer than Hard puzzles (anomaly)")
    print(f"• The difficulty progression isn't perfectly monotonic")
    print(
        f"\nConsider adjusting the vigintile ranges to better align with human performance."
    )


if __name__ == "__main__":
    main()
