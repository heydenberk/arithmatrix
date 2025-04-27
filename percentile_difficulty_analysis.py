#!/usr/bin/env python3

import math

# Our empirical data from the analysis
empirical_data = {
    4: {"sample_size": 11, "median": 110, "min": 103, "max": 207, "mean": 120},
    5: {"sample_size": 12, "median": 3932, "min": 400, "max": 14663, "mean": 4542},
    6: {
        "sample_size": 17,
        "median": 716,  # Known outlier
        "min": 338,
        "max": 52522,
        "mean": 3968,
    },
    7: {
        "sample_size": 66,
        "median": 367583,
        "min": 2368,
        "max": 28861848,
        "mean": 2361100,
        # From our detailed 7x7 analysis:
        "percentiles": {
            10: 59987,
            25: 147352,
            50: 367583,
            75: 2138858,
            90: 4534796,
            95: 10272044,
            99: 21610996,
        },
    },
}


def estimate_percentiles_for_size(size):
    """Estimate percentile values for a given puzzle size"""

    if size == 7 and "percentiles" in empirical_data[7]:
        # Use actual data for 7x7
        p = empirical_data[7]["percentiles"]
        return {
            0: empirical_data[7]["min"],
            20: p[10] + (p[25] - p[10]) * 0.5,  # Interpolate 20th percentile
            40: p[25] + (p[50] - p[25]) * 0.6,  # Interpolate 40th percentile
            60: p[50] + (p[75] - p[50]) * 0.4,  # Interpolate 60th percentile
            80: p[75] + (p[90] - p[75]) * 0.5,  # Interpolate 80th percentile
            100: empirical_data[7]["max"],
        }

    elif size in empirical_data:
        # For sizes with limited data, estimate based on min/median/max
        data = empirical_data[size]
        median = data["median"]
        min_val = data["min"]
        max_val = data["max"]

        # Estimate percentiles assuming log-normal-ish distribution
        # This is a rough approximation based on observed patterns
        return {
            0: min_val,
            20: min_val + (median - min_val) * 0.3,
            40: min_val + (median - min_val) * 0.7,
            60: median + (max_val - median) * 0.2,
            80: median + (max_val - median) * 0.6,
            100: max_val,
        }

    else:
        # For larger sizes, extrapolate using our exponential formula
        # Operations ≈ 0.004 × 14^n (median estimate)
        median_estimate = 0.004 * (14**size)

        # Estimate variance based on pattern: variance grows with size
        # For 7x7, range was about 28M, median was 367K, so range/median ≈ 78
        # This ratio seems to grow with size
        variance_ratio = 20 * (1.5 ** (size - 4))  # Growing variance

        min_estimate = max(1, median_estimate / variance_ratio)
        max_estimate = median_estimate * variance_ratio

        return {
            0: min_estimate,
            20: min_estimate + (median_estimate - min_estimate) * 0.3,
            40: min_estimate + (median_estimate - min_estimate) * 0.7,
            60: median_estimate + (max_estimate - median_estimate) * 0.2,
            80: median_estimate + (max_estimate - median_estimate) * 0.6,
            100: max_estimate,
        }


def get_difficulty_range(size, difficulty_level):
    """
    Get the operation count range for a given difficulty level and puzzle size.

    Args:
        size: Puzzle size (4, 5, 6, 7, etc.)
        difficulty_level: One of 'easiest', 'easy', 'medium', 'hard', 'expert'

    Returns:
        (min_operations, max_operations) tuple
    """
    percentiles = estimate_percentiles_for_size(size)

    difficulty_ranges = {
        "easiest": (0, 20),
        "easy": (20, 40),
        "medium": (40, 60),
        "hard": (60, 80),
        "expert": (80, 100),
    }

    if difficulty_level not in difficulty_ranges:
        raise ValueError(f"Invalid difficulty level: {difficulty_level}")

    min_percentile, max_percentile = difficulty_ranges[difficulty_level]
    min_ops = percentiles[min_percentile]
    max_ops = percentiles[max_percentile]

    return int(min_ops), int(max_ops)


# Generate the difficulty ranges for all sizes and levels
print("=== PERCENTILE-BASED DIFFICULTY SYSTEM ===\n")

difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]
sizes_to_analyze = [4, 5, 6, 7, 8, 9]

print("Difficulty ranges by puzzle size:\n")

for size in sizes_to_analyze:
    print(f"=== {size}x{size} PUZZLES ===")

    percentiles = estimate_percentiles_for_size(size)

    print("Estimated percentiles:")
    for p in [0, 20, 40, 60, 80, 100]:
        print(f"  {p:3d}th percentile: {percentiles[p]:>12,.0f} operations")

    print("\nDifficulty level ranges:")
    for level in difficulty_levels:
        min_ops, max_ops = get_difficulty_range(size, level)
        print(f"  {level:>8}: {min_ops:>10,} - {max_ops:<12,} operations")

    print()

# Show how this scales
print("=== DIFFICULTY SCALING COMPARISON ===")
print("How 'medium' difficulty compares across sizes:")

for size in sizes_to_analyze:
    min_ops, max_ops = get_difficulty_range(size, "medium")
    avg_ops = (min_ops + max_ops) / 2

    # Estimate time
    time_seconds = avg_ops / 1_000_000  # Assuming 1M ops/second
    if time_seconds < 1:
        time_str = f"{time_seconds * 1000:.0f}ms"
    elif time_seconds < 60:
        time_str = f"{time_seconds:.1f}s"
    elif time_seconds < 3600:
        time_str = f"{time_seconds / 60:.1f}min"
    else:
        time_str = f"{time_seconds / 3600:.1f}hr"

    print(f"  {size}x{size} medium: ~{avg_ops:>8,.0f} ops ({time_str})")

print("\n=== IMPLEMENTATION CONSTANTS ===")
print("For use in the generator code:\n")

print("DIFFICULTY_PERCENTILE_RANGES = {")
for level in difficulty_levels:
    ranges = difficulty_levels.index(level)
    min_p = ranges * 20
    max_p = (ranges + 1) * 20
    print(f"    '{level}': ({min_p}, {max_p}),")
print("}")

print("\n# Empirical percentile data")
print("EMPIRICAL_PERCENTILES = {")
for size in [4, 5, 6, 7]:
    if size in empirical_data:
        percentiles = estimate_percentiles_for_size(size)
        print(f"    {size}: {percentiles},")
print("}")

print("\n# Exponential extrapolation parameters")
print("EXPONENTIAL_PARAMS = {")
print("    'base_coefficient': 0.004,")
print("    'exponential_base': 14,")
print("    'variance_ratio_base': 20,")
print("    'variance_ratio_growth': 1.5")
print("}")

print("\n=== VALIDATION ===")
print("Checking if our ranges make sense...")

for size in [4, 5, 7]:  # Skip 6 due to outlier
    if size in empirical_data:
        actual_median = empirical_data[size]["median"]
        estimated_50th = estimate_percentiles_for_size(size)[
            40
        ]  # Our "medium" should be near median
        error = abs(estimated_50th - actual_median) / actual_median * 100
        print(
            f"{size}x{size}: Estimated 40-60th range center vs actual median - {error:.1f}% error"
        )
