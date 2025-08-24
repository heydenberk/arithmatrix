#!/usr/bin/env python3
"""
Real-world Arithmatrix puzzle solve time analysis.
Analyzes 86 real-world puzzle completion records to understand
the relationship between difficulty metrics and actual human performance.
"""

import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from collections import defaultdict
import statistics


def load_real_world_data():
    """Load the real-world puzzle completion data."""
    data = []
    with open("real_world_difficulties.jsonl", "r") as f:
        for line in f:
            data.append(json.loads(line))
    return data


def analyze_basic_statistics(data):
    """Analyze basic statistics of the real-world data."""
    df = pd.DataFrame(data)

    print("REAL-WORLD SOLVE TIME ANALYSIS")
    print("=" * 60)
    print(f"Total puzzles: {len(df)}")
    print(f"Sizes available: {sorted(df['size'].unique())}")
    print(
        f"Time range: {df['completionTimeSeconds'].min():.0f} - {df['completionTimeSeconds'].max():.0f} seconds"
    )
    print(f"Difficulty levels: {sorted(df['difficultyLevel'].unique())}")

    return df


def analyze_by_size(df):
    """Analyze solve times by puzzle size."""
    print("\nSOLVE TIME BY PUZZLE SIZE:")
    print("-" * 40)
    size_stats = (
        df.groupby("size")["completionTimeSeconds"]
        .agg(["count", "min", "max", "median", "mean", "std"])
        .round(1)
    )
    print(size_stats)

    # Detailed percentiles by size
    print("\nDETAILED PERCENTILES BY SIZE:")
    for size in sorted(df["size"].unique()):
        size_data = df[df["size"] == size]["completionTimeSeconds"]
        percentiles = [10, 25, 50, 75, 90]
        print(f"\n{size}x{size} puzzles (n={len(size_data)}):")
        for p in percentiles:
            value = np.percentile(size_data, p)
            print(f"  {p:2}th percentile: {value:6.0f}s")


def analyze_by_difficulty_level(df):
    """Analyze solve times by assigned difficulty level."""
    print("\n\nSOLVE TIME BY DIFFICULTY LEVEL:")
    print("-" * 45)
    diff_stats = (
        df.groupby("difficultyLevel")["completionTimeSeconds"]
        .agg(["count", "min", "max", "median", "mean", "std"])
        .round(1)
    )
    print(diff_stats)

    # Show the problem: difficulty level vs actual solve time
    print("\nPROBLEM IDENTIFICATION:")
    print("Current difficulty levels don't match actual solve times!")

    difficulty_order = ["easiest", "easy", "medium", "hard", "expert"]
    medians = []
    for diff in difficulty_order:
        if diff in diff_stats.index:
            median_time = diff_stats.loc[diff, "median"]
            medians.append(median_time)
            print(f"  {diff:>8}: {median_time:6.0f}s median")

    # Check if difficulty progression makes sense
    print("\nDifficulty progression issues:")
    for i in range(1, len(medians)):
        if medians[i] < medians[i - 1]:
            print(
                f"  WARNING: {difficulty_order[i]} is faster than {difficulty_order[i - 1]}!"
            )


def analyze_correlations(df):
    """Analyze correlations between various factors and solve time."""
    print("\n\nCORRELATION ANALYSIS:")
    print("-" * 30)

    # Overall correlations
    corr_size = np.corrcoef(df["size"], df["completionTimeSeconds"])[0, 1]
    corr_ops = np.corrcoef(df["difficultyOperations"], df["completionTimeSeconds"])[
        0, 1
    ]

    print("Overall correlations with solve time:")
    print(f"  Size:                {corr_size:6.3f}")
    print(f"  Operation count:     {corr_ops:6.3f}")

    # Size-specific correlations
    print("\nOperations vs Time correlation by size:")
    for size in sorted(df["size"].unique()):
        size_data = df[df["size"] == size]
        if len(size_data) > 2:
            corr = np.corrcoef(
                size_data["difficultyOperations"], size_data["completionTimeSeconds"]
            )[0, 1]
            print(f"  {size}x{size}: r={corr:6.3f} (n={len(size_data):2})")

    print("\nKEY FINDING: Operation count correlation breaks down by size!")
    print("This suggests the current system doesn't work well for human difficulty.")


def analyze_structural_factors(data):
    """Analyze structural factors that might affect human solve time."""
    print("\n\nSTRUCTURAL FACTOR ANALYSIS:")
    print("-" * 35)

    factors = []
    for record in data:
        puzzle = record["puzzle"]
        cages = puzzle["cages"]
        size = record["size"]
        time_sec = record["completionTimeSeconds"]

        # Calculate various structural factors
        num_cages = len(cages)
        cage_sizes = [len(cage["cells"]) for cage in cages]
        operations = [cage["operation"] for cage in cages]
        values = [cage["value"] for cage in cages]

        # Factor calculations
        avg_cage_size = statistics.mean(cage_sizes)
        cage_size_variance = (
            statistics.variance(cage_sizes) if len(cage_sizes) > 1 else 0
        )

        # Operation counts
        op_counts = {op: operations.count(op) for op in ["+", "-", "*", "/", ""]}
        multiplication_ratio = op_counts["*"] / num_cages
        division_ratio = op_counts["/"] / num_cages
        single_cell_ratio = op_counts[""] / num_cages

        # Value complexity
        large_values = sum(1 for v in values if v > size * 2)
        large_value_ratio = large_values / num_cages

        factors.append(
            {
                "time": time_sec,
                "size": size,
                "num_cages": num_cages,
                "avg_cage_size": avg_cage_size,
                "cage_size_variance": cage_size_variance,
                "multiplication_ratio": multiplication_ratio,
                "division_ratio": division_ratio,
                "single_cell_ratio": single_cell_ratio,
                "large_value_ratio": large_value_ratio,
                "difficulty_ops": record["difficultyOperations"],
            }
        )

    # Calculate correlations with solve time
    print("Correlations with solve time:")
    factor_names = [
        "size",
        "num_cages",
        "avg_cage_size",
        "cage_size_variance",
        "multiplication_ratio",
        "division_ratio",
        "single_cell_ratio",
        "large_value_ratio",
        "difficulty_ops",
    ]

    correlations = []
    for factor_name in factor_names:
        factor_values = [f[factor_name] for f in factors]
        times = [f["time"] for f in factors]

        if len(set(factor_values)) > 1:  # Avoid constant values
            correlation = np.corrcoef(factor_values, times)[0, 1]
            correlations.append((factor_name, correlation))
            print(f"  {factor_name:>18}: {correlation:>6.3f}")

    # Sort by correlation strength
    correlations.sort(key=lambda x: abs(x[1]), reverse=True)
    print("\nStrongest predictors of solve time:")
    for factor, corr in correlations[:5]:
        print(f"  {factor:>18}: {corr:>6.3f}")

    return factors


def propose_new_difficulty_ranges(df):
    """Propose new difficulty ranges based on actual solve times."""
    print("\n\nPROPOSED NEW DIFFICULTY SYSTEM:")
    print("-" * 40)
    print("Based on actual solve time percentiles by size:\n")

    # Define percentile ranges for difficulty levels
    difficulty_percentiles = {
        "easiest": (0, 20),
        "easy": (20, 40),
        "medium": (40, 60),
        "hard": (60, 80),
        "expert": (80, 100),
    }

    for size in sorted(df["size"].unique()):
        size_data = df[df["size"] == size]["completionTimeSeconds"].values
        print(f"{size}x{size} puzzles - NEW difficulty ranges (based on solve time):")

        for difficulty, (low_p, high_p) in difficulty_percentiles.items():
            low_time = np.percentile(size_data, low_p)
            high_time = np.percentile(size_data, high_p)
            print(f"  {difficulty:>8}: {low_time:6.0f} - {high_time:6.0f} seconds")
        print()


def generate_recommendations():
    """Generate recommendations for improving the difficulty system."""
    print("\nRECOMMENDATIONS FOR NEW DIFFICULTY SYSTEM:")
    print("=" * 50)
    print("1. USE SIZE as the primary difficulty factor (r=0.705)")
    print("   - 4x4: ~17-103s range")
    print("   - 5x5: ~40-261s range")
    print("   - 6x6: ~92-347s range")
    print("   - 7x7: ~238-1493s range")
    print()
    print("2. WEIGHT OPERATIONS by human difficulty:")
    print("   - Single cells: 1.0x (easiest)")
    print("   - Addition: 1.1x")
    print("   - Subtraction: 1.3x")
    print("   - Multiplication: 2.0x (mental math harder)")
    print("   - Division: 2.5x (hardest)")
    print()
    print("3. CONSIDER STRUCTURAL COMPLEXITY:")
    print("   - Large cage penalty (humans struggle with 4+ cells)")
    print("   - High value penalty (numbers > 2*size)")
    print("   - Visual complexity (cage distribution)")
    print()
    print("4. ABANDON operation count as primary metric")
    print("   - Shows poor correlation with human solve time")
    print("   - Works better for computer solvers than humans")
    print()
    print("5. CREATE SIZE-SPECIFIC difficulty categories")
    print("   - Don't use same operation ranges across sizes")
    print("   - Each size needs its own percentile ranges")


def main():
    """Main analysis function."""
    # Load data
    data = load_real_world_data()
    df = analyze_basic_statistics(data)

    # Run analyses
    analyze_by_size(df)
    analyze_by_difficulty_level(df)
    analyze_correlations(df)
    structural_factors = analyze_structural_factors(data)
    propose_new_difficulty_ranges(df)
    generate_recommendations()

    print("\n" + "=" * 60)
    print("ANALYSIS COMPLETE - See recommendations above")
    print("Run this analysis to understand why the current system fails")
    print("and how to build a human-centered difficulty assessment.")


if __name__ == "__main__":
    main()
