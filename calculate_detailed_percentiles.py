#!/usr/bin/env python3

import json
import numpy as np


def calculate_detailed_percentiles():
    """Calculate detailed percentiles for each puzzle size separately"""

    # Read all puzzles and group by size
    size_data = {}

    print("Reading puzzle data...")
    with open("all_puzzles.jsonl", "r") as f:
        for line_num, line in enumerate(f, 1):
            try:
                data = json.loads(line.strip())
                size = data.get("puzzle", {}).get("size")
                score = data.get("puzzle", {}).get("difficulty_operations")
                if size is not None and score is not None:
                    if size not in size_data:
                        size_data[size] = []
                    size_data[size].append(float(score))
            except json.JSONDecodeError as e:
                print(f"Error parsing line {line_num}: {e}")
                continue

    print(f"Loaded data for sizes: {sorted(size_data.keys())}")

    # Calculate vigintiles (20th percentiles) for each size
    percentiles_to_calculate = [0, 20, 40, 60, 80, 100]
    size_percentiles = {}

    print("\nDetailed Percentile Analysis by Size:")
    print("=" * 60)

    for size in sorted(size_data.keys()):
        scores = size_data[size]
        print(f"\n{size}x{size} Puzzles ({len(scores)} puzzles):")
        print("-" * 40)

        percentiles = {}
        for p in percentiles_to_calculate:
            value = np.percentile(scores, p)
            percentiles[p] = round(value, 1)
            print(f"{p:3d}th percentile: {value:8.1f}")

        size_percentiles[size] = percentiles

        # Additional stats
        print(f"Mean:              {np.mean(scores):8.1f}")
        print(f"Median:            {np.median(scores):8.1f}")
        print(f"Std Dev:           {np.std(scores):8.1f}")
        print(f"Range:             {np.max(scores) - np.min(scores):8.1f}")

    # Generate the empirical_percentiles dictionary for the backend
    print("\n" + "=" * 60)
    print("UPDATED EMPIRICAL_PERCENTILES FOR BACKEND:")
    print("=" * 60)
    print("empirical_percentiles = {")
    for size in sorted(size_percentiles.keys()):
        percentiles = size_percentiles[size]
        print(
            f"    {size}: {{0: {percentiles[0]:.0f}, 20: {percentiles[20]:.0f}, 40: {percentiles[40]:.0f}, 60: {percentiles[60]:.0f}, 80: {percentiles[80]:.0f}, 100: {percentiles[100]:.0f}}},"
        )
    print("}")

    # Show difficulty mappings
    print("\n" + "=" * 60)
    print("DIFFICULTY LEVEL MAPPINGS (Vigintiles):")
    print("=" * 60)

    difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]
    level_ranges = [(0, 20), (20, 40), (40, 60), (60, 80), (80, 100)]

    for size in sorted(size_percentiles.keys()):
        print(f"\n{size}x{size} Puzzles:")
        percentiles = size_percentiles[size]
        for i, level in enumerate(difficulty_levels):
            min_p, max_p = level_ranges[i]
            min_score = percentiles[min_p]
            max_score = percentiles[max_p]
            print(f"  {level:>8}: {min_score:6.1f} - {max_score:6.1f}")

    return size_percentiles


if __name__ == "__main__":
    calculate_detailed_percentiles()
