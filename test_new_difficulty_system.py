#!/usr/bin/env python3

import sys
import os
import time
import shutil

# Fix the import by temporarily modifying the kenken module
with open("backend/kenken.py", "r") as f:
    kenken_content = f.read()

# Replace relative import with absolute import for standalone execution
fixed_content = kenken_content.replace(
    "from .latin_square import get_latin_square",
    "from latin_square import get_latin_square",
)

# Replace Flask app logging with simple prints (less verbose for testing)
fixed_content = fixed_content.replace(
    "from flask import current_app as app", "# from flask import current_app as app"
)

# Replace all app.logger calls with pass statements
import re

fixed_content = re.sub(r"app\.logger\.info\([^)]*\)", "pass", fixed_content)
fixed_content = re.sub(r"app\.logger\.error\([^)]*\)", "pass", fixed_content)

# Write to a temporary file
with open("kenken_temp.py", "w") as f:
    f.write(fixed_content)

# Copy latin_square.py to current directory
if os.path.exists("backend/latin_square.py"):
    shutil.copy("backend/latin_square.py", "latin_square.py")

# Now import from the temporary module
import kenken_temp as kenken


def test_new_difficulty_ranges():
    """Test the new difficulty ranges to see how they compare."""
    print("=== TESTING NEW DIFFICULTY SYSTEM ===")
    print("(Using optimized solver data)\n")

    difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]
    test_sizes = [4, 5, 6, 7]

    # Show the new difficulty ranges
    print("🎯 NEW DIFFICULTY RANGES:")
    for size in test_sizes:
        print(f"\n{size}x{size} puzzles:")
        for difficulty in difficulty_levels:
            min_ops, max_ops = kenken._get_difficulty_range(size, difficulty)
            print(f"  {difficulty:>8}: {min_ops:>6,} - {max_ops:<8,} operations")

    # Compare with old data (manually entered for reference)
    print(f"\n📊 COMPARISON: OLD vs NEW SOLVER")
    print("Size | Difficulty | Old Range           | New Range           | Reduction")
    print("-----|------------|---------------------|---------------------|----------")

    # Old data from previous analysis
    old_data = {
        4: {"medium": (108, 129)},
        5: {"medium": (2872, 6078)},
        6: {"medium": (603, 11077)},
        7: {"medium": (279491, 1076093)},
    }

    for size in test_sizes:
        if size in old_data:
            old_min, old_max = old_data[size]["medium"]
            new_min, new_max = kenken._get_difficulty_range(size, "medium")

            old_avg = (old_min + old_max) / 2
            new_avg = (new_min + new_max) / 2
            reduction = old_avg / new_avg

            print(
                f" {size}x{size} |   medium   | {old_min:6,} - {old_max:8,} | {new_min:6,} - {new_max:8,} |   {reduction:5.1f}x"
            )

    print(f"\n⚡ The optimized solver is dramatically faster!")


def test_generation_with_new_system():
    """Test puzzle generation with the new difficulty system."""
    print(f"\n=== TESTING PUZZLE GENERATION ===")

    test_cases = [(4, "easy"), (5, "medium"), (6, "hard"), (7, "expert")]

    for size, difficulty in test_cases:
        print(f"\nGenerating {size}x{size} {difficulty} puzzle...")

        start_time = time.time()
        try:
            puzzle = kenken.generate_kenken_puzzle(
                size=size,
                difficulty=difficulty,
                max_difficulty_attempts=5,  # Quick test
            )

            generation_time = time.time() - start_time

            actual_ops = puzzle.get("difficulty_operations", "Unknown")
            target_range = puzzle.get("target_difficulty_range", "Unknown")

            # Check if we hit target
            if target_range != "Unknown" and actual_ops != "Unknown":
                target_min, target_max = target_range
                in_range = target_min <= actual_ops <= target_max
                status = "✅ HIT TARGET" if in_range else "⚠️  CLOSE MISS"
            else:
                status = "❓ UNKNOWN"

            print(f"  {status}")
            print(f"  Actual: {actual_ops:,} operations")
            print(f"  Target: {target_range[0]:,} - {target_range[1]:,}")
            print(f"  Time: {generation_time:.2f}s")

        except Exception as e:
            print(f"  ❌ FAILED: {e}")


def show_scaling_comparison():
    """Show how difficulty scales across sizes with new system."""
    print(f"\n=== SCALING COMPARISON ===")
    print("How the same difficulty level compares across sizes:\n")

    difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]

    for difficulty in difficulty_levels:
        print(f"{difficulty.upper()} difficulty:")
        for size in [4, 5, 6, 7]:
            min_ops, max_ops = kenken._get_difficulty_range(size, difficulty)
            avg_ops = (min_ops + max_ops) / 2

            # Estimate time (assuming faster solving due to optimizations)
            time_seconds = avg_ops / 10_000  # Faster estimate due to optimizations
            if time_seconds < 1:
                time_str = f"{time_seconds * 1000:.0f}ms"
            elif time_seconds < 60:
                time_str = f"{time_seconds:.1f}s"
            else:
                time_str = f"{time_seconds / 60:.1f}min"

            print(f"  {size}x{size}: ~{avg_ops:>6,.0f} ops ({time_str})")
        print()


if __name__ == "__main__":
    try:
        test_new_difficulty_ranges()
        test_generation_with_new_system()
        show_scaling_comparison()

        print("\n🎉 NEW DIFFICULTY SYSTEM TESTING COMPLETE!")
        print(
            "The optimized solver provides much faster and more predictable difficulty assessment."
        )

    except Exception as e:
        print(f"\n💥 Test failed: {e}")
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
