#!/usr/bin/env python3

import json
import numpy as np


def calculate_percentiles():
    """Calculate percentiles from updated difficulty scores"""

    # Read all puzzles and extract difficulty scores
    difficulty_scores = []

    print("Reading puzzle data...")
    with open("all_puzzles.jsonl", "r") as f:
        for line_num, line in enumerate(f, 1):
            try:
                data = json.loads(line.strip())
                score = data.get("puzzle", {}).get("difficulty_operations")
                if score is not None:
                    difficulty_scores.append(float(score))
            except json.JSONDecodeError as e:
                print(f"Error parsing line {line_num}: {e}")
                continue

    print(f"Loaded {len(difficulty_scores)} difficulty scores")

    if not difficulty_scores:
        print("No difficulty scores found!")
        return

    # Calculate requested percentiles
    percentiles = [0, 20, 40, 60, 80, 100]
    results = {}

    print("\nPercentile Analysis:")
    print("=" * 50)

    for p in percentiles:
        value = np.percentile(difficulty_scores, p)
        results[p] = value
        print(f"{p:3d}th percentile: {value:8.2f}")

    # Additional statistics
    print("\nAdditional Statistics:")
    print("=" * 50)
    print(f"Mean:              {np.mean(difficulty_scores):8.2f}")
    print(f"Median:            {np.median(difficulty_scores):8.2f}")
    print(f"Standard Dev:      {np.std(difficulty_scores):8.2f}")
    print(f"Min:               {np.min(difficulty_scores):8.2f}")
    print(f"Max:               {np.max(difficulty_scores):8.2f}")
    print(
        f"Range:             {np.max(difficulty_scores) - np.min(difficulty_scores):8.2f}"
    )

    # Show distribution by size
    print("\nDistribution by Puzzle Size:")
    print("=" * 50)

    size_data = {}
    with open("all_puzzles.jsonl", "r") as f:
        for line in f:
            try:
                data = json.loads(line.strip())
                size = data.get("puzzle", {}).get("size", "unknown")
                score = data.get("puzzle", {}).get("difficulty_operations")
                if score is not None:
                    if size not in size_data:
                        size_data[size] = []
                    size_data[size].append(float(score))
            except:
                continue

    for size in sorted(size_data.keys()):
        scores = size_data[size]
        print(
            f"{size}x{size}: {len(scores):4d} puzzles, "
            f"range {np.min(scores):6.1f}-{np.max(scores):6.1f}, "
            f"median {np.median(scores):6.1f}"
        )

    return results


if __name__ == "__main__":
    calculate_percentiles()
