#!/usr/bin/env python3
"""
Analyze the updated puzzle distribution and create improved difficulty ranges.
"""

import json
import numpy as np
import statistics
from collections import defaultdict


def load_updated_puzzles():
    """Load the updated puzzles."""
    puzzles = []
    with open("all_puzzles.jsonl", "r") as f:
        for line in f:
            puzzles.append(json.loads(line.strip()))
    return puzzles


def analyze_current_distribution():
    """Analyze the current difficulty distribution."""
    puzzles = load_updated_puzzles()

    print("CURRENT DIFFICULTY DISTRIBUTION ANALYSIS")
    print("=" * 60)

    # Group by size
    by_size = defaultdict(list)
    for puzzle in puzzles:
        size = puzzle["puzzle"]["size"]
        score = puzzle["metadata"]["human_analysis"]["human_difficulty_score"]
        difficulty = puzzle["metadata"]["actual_difficulty"]
        by_size[size].append((score, difficulty))

    # Analyze each size
    for size in sorted(by_size.keys()):
        scores = [score for score, _ in by_size[size]]
        difficulties = [diff for _, diff in by_size[size]]

        print(f"\n{size}x{size} PUZZLES ({len(scores)} total):")
        print(f"  Score range: {min(scores):.0f} - {max(scores):.0f} seconds")
        print(f"  Median: {statistics.median(scores):.0f} seconds")
        print(f"  Mean: {statistics.mean(scores):.0f} seconds")
        print(f"  Std dev: {statistics.stdev(scores):.0f} seconds")

        # Show percentiles
        percentiles = [10, 20, 40, 60, 80, 90]
        print("  Percentiles:")
        for p in percentiles:
            value = np.percentile(scores, p)
            print(f"    {p:2d}%: {value:6.0f}s")

        # Current difficulty distribution
        diff_counts = defaultdict(int)
        for diff in difficulties:
            diff_counts[diff] += 1

        print("  Current difficulty distribution:")
        for diff in ["easiest", "easy", "medium", "hard", "expert"]:
            count = diff_counts[diff]
            pct = count / len(difficulties) * 100
            print(f"    {diff:>8}: {count:4d} ({pct:5.1f}%)")


def suggest_new_ranges():
    """Suggest new difficulty ranges based on the actual distribution."""
    puzzles = load_updated_puzzles()

    print("\n" + "=" * 60)
    print("SUGGESTED NEW DIFFICULTY RANGES")
    print("=" * 60)

    # Group by size
    by_size = defaultdict(list)
    for puzzle in puzzles:
        size = puzzle["puzzle"]["size"]
        score = puzzle["metadata"]["human_analysis"]["human_difficulty_score"]
        by_size[size].append(score)

    new_ranges = {}

    for size in sorted(by_size.keys()):
        scores = sorted(by_size[size])
        n = len(scores)

        # Use percentiles to create balanced ranges
        # Aim for roughly: easiest(20%), easy(20%), medium(20%), hard(20%), expert(20%)
        p20 = np.percentile(scores, 20)
        p40 = np.percentile(scores, 40)
        p60 = np.percentile(scores, 60)
        p80 = np.percentile(scores, 80)

        new_ranges[size] = {
            "easiest": (min(scores), p20),
            "easy": (p20, p40),
            "medium": (p40, p60),
            "hard": (p60, p80),
            "expert": (p80, max(scores)),
        }

        print(f"\n{size}x{size} SUGGESTED RANGES:")
        for diff, (min_val, max_val) in new_ranges[size].items():
            print(f"  {diff:>8}: ({min_val:6.0f}, {max_val:6.0f}) seconds")

    return new_ranges


def generate_updated_solver_code(new_ranges):
    """Generate the updated solver code with new ranges."""
    print("\n" + "=" * 60)
    print("UPDATED SOLVER CODE")
    print("=" * 60)

    print("# Replace the difficulty_ranges in ImprovedArithmatrixSolver.__init__:")
    print("self.difficulty_ranges = {")

    for size, ranges in new_ranges.items():
        print(f"    {size}: {{")
        for diff, (min_val, max_val) in ranges.items():
            print(f'        "{diff}": ({min_val:.0f}, {max_val:.0f}),')
        print("    },")

    print("}")


def test_new_ranges(new_ranges):
    """Test how the new ranges would affect the distribution."""
    puzzles = load_updated_puzzles()

    print("\n" + "=" * 60)
    print("TESTING NEW RANGES")
    print("=" * 60)

    def categorize_with_new_ranges(score, size):
        if size not in new_ranges:
            return "unknown"

        ranges = new_ranges[size]
        for category, (min_time, max_time) in ranges.items():
            if min_time <= score <= max_time:
                return category

        if score < ranges["easiest"][0]:
            return "easiest"
        else:
            return "expert"

    # Test the new categorization
    total_changes = 0
    by_size_changes = defaultdict(lambda: defaultdict(int))

    for puzzle in puzzles:
        size = puzzle["puzzle"]["size"]
        score = puzzle["metadata"]["human_analysis"]["human_difficulty_score"]
        old_diff = puzzle["metadata"]["actual_difficulty"]
        new_diff = categorize_with_new_ranges(score, size)

        by_size_changes[size][new_diff] += 1

        if old_diff != new_diff:
            total_changes += 1

    print(
        f"Total puzzles that would change difficulty: {total_changes} ({total_changes / len(puzzles) * 100:.1f}%)"
    )

    print("\nNew distribution by size:")
    for size in sorted(by_size_changes.keys()):
        changes = by_size_changes[size]
        total_size = sum(changes.values())
        print(f"\n{size}x{size} ({total_size} puzzles):")
        for diff in ["easiest", "easy", "medium", "hard", "expert"]:
            count = changes[diff]
            pct = count / total_size * 100
            print(f"  {diff:>8}: {count:4d} ({pct:5.1f}%)")


def main():
    """Main analysis function."""
    print("🔍 DIFFICULTY RANGE ANALYSIS")
    print("Analyzing the current puzzle distribution after human-centered update")

    # Analyze current distribution
    analyze_current_distribution()

    # Suggest new ranges
    new_ranges = suggest_new_ranges()

    # Generate updated code
    generate_updated_solver_code(new_ranges)

    # Test new ranges
    test_new_ranges(new_ranges)

    print(f"\n✅ Analysis complete!")
    print("The new ranges will provide a more balanced difficulty distribution.")


if __name__ == "__main__":
    main()
