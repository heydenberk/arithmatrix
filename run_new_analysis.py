#!/usr/bin/env python3

import sys
import os
import time
import random
import statistics
import json
import shutil
from collections import defaultdict

# Fix the import by temporarily modifying the kenken module
# Read the kenken.py file and fix the import
with open("backend/kenken.py", "r") as f:
    kenken_content = f.read()

# Replace relative import with absolute import for standalone execution
fixed_content = kenken_content.replace(
    "from .latin_square import get_latin_square",
    "from latin_square import get_latin_square",
)

# Replace Flask app logging with simple prints
fixed_content = fixed_content.replace(
    "from flask import current_app as app", "# from flask import current_app as app"
)

# Replace all app.logger calls with print statements
fixed_content = fixed_content.replace("app.logger.info(", "print(")
fixed_content = fixed_content.replace("app.logger.error(", 'print("ERROR:", ')

# Write to a temporary file
with open("kenken_temp.py", "w") as f:
    f.write(fixed_content)

# Copy latin_square.py to current directory
if os.path.exists("backend/latin_square.py"):
    shutil.copy("backend/latin_square.py", "latin_square.py")

# Now import from the temporary module
import kenken_temp as kenken


def analyze_size(size, num_puzzles=20, max_attempts_per_puzzle=10):
    """Analyze a specific puzzle size with the new optimized solver."""
    print(f"\n=== Analyzing {size}x{size} puzzles (target: {num_puzzles} puzzles) ===")

    successful_puzzles = []
    failed_attempts = 0
    start_time = time.time()

    for i in range(num_puzzles * max_attempts_per_puzzle):
        try:
            # Generate a basic puzzle
            puzzle = kenken._generate_basic_puzzle(size, max_attempts=100)

            # Measure difficulty with the new solver
            operations = kenken.solve_kenken_puzzle(puzzle)

            successful_puzzles.append(
                {
                    "puzzle_id": len(successful_puzzles),
                    "operations": operations,
                    "generation_attempt": i + 1,
                }
            )

            # Progress indicator
            if len(successful_puzzles) % 5 == 0:
                print(f"  Generated {len(successful_puzzles)} puzzles...")

            # Stop when we have enough
            if len(successful_puzzles) >= num_puzzles:
                break

        except Exception as e:
            failed_attempts += 1
            if failed_attempts % 10 == 0:
                print(f"  Failed attempts: {failed_attempts}")

    total_time = time.time() - start_time

    if not successful_puzzles:
        print(f"  ❌ No successful puzzles generated after {failed_attempts} attempts")
        return None

    # Calculate statistics
    operations_list = [p["operations"] for p in successful_puzzles]

    stats = {
        "size": size,
        "successful_count": len(successful_puzzles),
        "failed_attempts": failed_attempts,
        "total_time": total_time,
        "avg_time_per_puzzle": total_time / len(successful_puzzles),
        "operations": {
            "min": min(operations_list),
            "max": max(operations_list),
            "mean": statistics.mean(operations_list),
            "median": statistics.median(operations_list),
            "stdev": statistics.stdev(operations_list)
            if len(operations_list) > 1
            else 0,
        },
    }

    # Calculate percentiles
    operations_sorted = sorted(operations_list)
    n = len(operations_sorted)

    percentiles = {}
    for p in [5, 10, 20, 25, 40, 50, 60, 75, 80, 90, 95]:
        index = int(p * n / 100)
        if index >= n:
            index = n - 1
        percentiles[p] = operations_sorted[index]

    stats["percentiles"] = percentiles

    # Print results
    print(f"  ✅ Successfully generated {len(successful_puzzles)} puzzles")
    print(f"  ❌ Failed attempts: {failed_attempts}")
    print(
        f"  ⏱️  Total time: {total_time:.1f}s ({stats['avg_time_per_puzzle']:.2f}s per puzzle)"
    )
    print(
        f"  📊 Operations: {stats['operations']['min']:,} - {stats['operations']['max']:,} (median: {stats['operations']['median']:,})"
    )
    print(
        f"  📈 Std dev: {stats['operations']['stdev']:.0f} ({stats['operations']['stdev'] / stats['operations']['mean'] * 100:.1f}% of mean)"
    )

    return stats, successful_puzzles


def run_comprehensive_analysis():
    """Run the new analysis across multiple puzzle sizes."""
    print("=== NEW KENKEN DIFFICULTY ANALYSIS (OPTIMIZED SOLVER) ===")
    print("Analyzing puzzle generation with the optimized solver...")

    # Analyze different sizes with varying sample sizes
    size_configs = {
        4: {"num_puzzles": 30, "max_attempts_per_puzzle": 5},  # Should be fast
        5: {"num_puzzles": 25, "max_attempts_per_puzzle": 8},  # Moderate
        6: {"num_puzzles": 20, "max_attempts_per_puzzle": 10},  # Slower
        7: {"num_puzzles": 15, "max_attempts_per_puzzle": 15},  # Much slower
    }

    all_results = {}
    all_puzzle_data = {}

    for size, config in size_configs.items():
        result = analyze_size(size, **config)
        if result:
            stats, puzzles = result
            all_results[size] = stats
            all_puzzle_data[size] = puzzles
        else:
            print(f"Skipping {size}x{size} due to generation failures")

    # Summary analysis
    print(f"\n" + "=" * 60)
    print("SUMMARY OF NEW ANALYSIS")
    print("=" * 60)

    # Show scaling patterns
    print("\n📊 OPERATION COUNT SCALING:")
    print("Size | Count |    Min     |   Median   |    Max     |   Ratio")
    print("-----|-------|------------|------------|------------|--------")

    prev_median = None
    for size in sorted(all_results.keys()):
        stats = all_results[size]
        ops = stats["operations"]
        ratio = f"{ops['median'] / prev_median:.1f}x" if prev_median else "---"
        prev_median = ops["median"]

        print(
            f" {size}x{size} |  {stats['successful_count']:2d}   | {ops['min']:10,} | {ops['median']:10,} | {ops['max']:10,} | {ratio:>6}"
        )

    # Show percentile ranges for difficulty levels
    print(f"\n🎯 DIFFICULTY LEVEL RANGES (New Data):")
    difficulty_ranges = {
        "easiest": (0, 20),
        "easy": (20, 40),
        "medium": (40, 60),
        "hard": (60, 80),
        "expert": (80, 100),
    }

    for size in sorted(all_results.keys()):
        print(f"\n{size}x{size} puzzles:")
        stats = all_results[size]
        percentiles = stats["percentiles"]

        for level, (min_p, max_p) in difficulty_ranges.items():
            # Get closest percentiles we have
            min_ops = percentiles.get(min_p, percentiles.get(20 if min_p == 20 else 10))
            max_ops = percentiles.get(max_p, percentiles.get(80 if max_p == 80 else 90))

            print(f"  {level:>8}: {min_ops:>8,} - {max_ops:<10,} operations")

    # Derive new exponential formula
    print(f"\n📈 EXPONENTIAL SCALING ANALYSIS:")

    sizes = sorted(all_results.keys())
    medians = [all_results[size]["operations"]["median"] for size in sizes]

    # Try to fit exponential: y = a * b^x
    if len(sizes) >= 3:
        import math

        # Log-linear regression
        log_medians = [math.log(m) for m in medians]

        # Simple linear regression on log scale
        n = len(sizes)
        sum_x = sum(sizes)
        sum_y = sum(log_medians)
        sum_xy = sum(x * y for x, y in zip(sizes, log_medians))
        sum_x2 = sum(x * x for x in sizes)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        intercept = (sum_y - slope * sum_x) / n

        # Convert back to exponential form: y = a * b^x
        a = math.exp(intercept)
        b = math.exp(slope)

        print(f"  New formula: Operations ≈ {a:.3f} × {b:.2f}^size")
        print(f"  (Previous formula was: Operations ≈ 0.004 × 14^size)")

        # Show fit quality
        print(f"\n  Formula validation:")
        for size, actual_median in zip(sizes, medians):
            predicted = a * (b**size)
            error = abs(predicted - actual_median) / actual_median * 100
            print(
                f"    {size}x{size}: predicted {predicted:,.0f}, actual {actual_median:,} ({error:.1f}% error)"
            )

    # Performance analysis
    print(f"\n⚡ GENERATION PERFORMANCE:")
    for size in sorted(all_results.keys()):
        stats = all_results[size]
        success_rate = (
            stats["successful_count"]
            / (stats["successful_count"] + stats["failed_attempts"])
            * 100
        )
        print(
            f"  {size}x{size}: {stats['avg_time_per_puzzle']:.2f}s per puzzle, {success_rate:.1f}% success rate"
        )

    # Save data for future use
    output_data = {
        "analysis_timestamp": time.time(),
        "solver_version": "optimized_v2",
        "statistics": all_results,
        "raw_puzzles": all_puzzle_data,
    }

    with open("new_difficulty_analysis.json", "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"\n💾 Data saved to 'new_difficulty_analysis.json'")

    return all_results


def generate_new_percentile_system(results):
    """Generate the new percentile-based difficulty system."""
    print(f"\n" + "=" * 60)
    print("GENERATING NEW PERCENTILE SYSTEM")
    print("=" * 60)

    # Extract percentile data for each size
    empirical_percentiles = {}
    for size, stats in results.items():
        percentiles = stats["percentiles"]
        # Convert to the format we need (0, 20, 40, 60, 80, 100)
        empirical_percentiles[size] = {
            0: stats["operations"]["min"],
            20: percentiles.get(20, percentiles.get(25)),
            40: percentiles.get(40, percentiles.get(50)),
            60: percentiles.get(60, percentiles.get(50)),
            80: percentiles.get(80, percentiles.get(75)),
            100: stats["operations"]["max"],
        }

    print("\nEmpirical percentile data (new solver):")
    for size in sorted(empirical_percentiles.keys()):
        print(f"  {size}: {empirical_percentiles[size]}")

    # Generate updated code
    print(f"\n📝 UPDATED PERCENTILE SYSTEM CODE:")
    print("```python")
    print("# Updated empirical percentile data (optimized solver)")
    print("empirical_percentiles = {")
    for size in sorted(empirical_percentiles.keys()):
        print(f"    {size}: {empirical_percentiles[size]},")
    print("}")
    print("```")

    return empirical_percentiles


if __name__ == "__main__":
    try:
        # Run the comprehensive analysis
        results = run_comprehensive_analysis()

        if results:
            # Generate new percentile system
            new_percentiles = generate_new_percentile_system(results)

            print(
                f"\n🎉 Analysis complete! The new data shows the impact of solver optimizations."
            )
            print(f"   Use this data to update the percentile-based difficulty system.")
        else:
            print(f"\n❌ Analysis failed - no successful results obtained")

    except KeyboardInterrupt:
        print(f"\n🛑 Analysis interrupted by user")
    except Exception as e:
        print(f"\n💥 Analysis failed with error: {e}")
        import traceback

        traceback.print_exc()
    finally:
        # Clean up temporary files
        for temp_file in ["kenken_temp.py", "latin_square.py", "__pycache__"]:
            if os.path.exists(temp_file):
                if os.path.isdir(temp_file):
                    shutil.rmtree(temp_file)
                else:
                    os.remove(temp_file)
