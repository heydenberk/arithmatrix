#!/usr/bin/env python3

import sys
import os
import time

# Read the kenken.py file and fix the import
with open("backend/kenken.py", "r") as f:
    kenken_content = f.read()

# Replace relative import with absolute import
fixed_content = kenken_content.replace(
    "from .latin_square import get_latin_square",
    "from latin_square import get_latin_square",
)

# Write to a temporary file
with open("kenken_temp.py", "w") as f:
    f.write(fixed_content)

# Copy latin_square.py to current directory
import shutil

shutil.copy("backend/latin_square.py", "latin_square.py")

# Now import from the temporary module
sys.path.insert(0, ".")
import kenken_temp as kenken


def test_difficulty_levels():
    """Test the new difficulty-based generator across different levels and sizes."""
    print("=== TESTING PERCENTILE-BASED DIFFICULTY GENERATOR ===\n")

    difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]
    test_sizes = [4, 5, 6, 7]

    results = {}

    for size in test_sizes:
        print(f"=== Testing {size}x{size} puzzles ===")
        results[size] = {}

        for difficulty in difficulty_levels:
            print(f"  Testing {difficulty} difficulty...")

            start_time = time.time()
            try:
                # Generate puzzle with target difficulty
                puzzle = kenken.generate_kenken_puzzle(
                    size=size,
                    difficulty=difficulty,
                    max_difficulty_attempts=10,  # Reduced for faster testing
                )

                generation_time = time.time() - start_time

                # Extract results
                actual_ops = puzzle.get("difficulty_operations", "Unknown")
                target_range = puzzle.get("target_difficulty_range", "Unknown")

                # Check if we hit the target
                if target_range != "Unknown" and actual_ops != "Unknown":
                    target_min, target_max = target_range
                    in_range = target_min <= actual_ops <= target_max
                    if in_range:
                        status = "✓ HIT TARGET"
                    else:
                        if actual_ops < target_min:
                            diff = target_min - actual_ops
                            status = f"✗ Too easy by {diff:,} ops"
                        else:
                            diff = actual_ops - target_max
                            status = f"✗ Too hard by {diff:,} ops"
                else:
                    status = "? Unknown"

                results[size][difficulty] = {
                    "success": True,
                    "operations": actual_ops,
                    "target_range": target_range,
                    "generation_time": generation_time,
                    "status": status,
                }

                print(f"    {status}")
                print(f"    Operations: {actual_ops:,}")
                print(f"    Target: {target_range[0]:,} - {target_range[1]:,}")
                print(f"    Time: {generation_time:.2f}s")

            except Exception as e:
                results[size][difficulty] = {
                    "success": False,
                    "error": str(e),
                    "generation_time": time.time() - start_time,
                }
                print(f"    ✗ FAILED: {e}")

        print()

    # Summary analysis
    print("=== SUMMARY ANALYSIS ===")

    total_tests = 0
    successful_tests = 0
    hit_target_tests = 0

    for size in test_sizes:
        for difficulty in difficulty_levels:
            total_tests += 1
            result = results[size][difficulty]

            if result["success"]:
                successful_tests += 1
                if "HIT TARGET" in result["status"]:
                    hit_target_tests += 1

    print(f"Total tests: {total_tests}")
    print(
        f"Successful generations: {successful_tests}/{total_tests} ({successful_tests / total_tests * 100:.1f}%)"
    )
    print(
        f"Hit target difficulty: {hit_target_tests}/{successful_tests} ({hit_target_tests / successful_tests * 100:.1f}% of successful)"
    )

    # Performance analysis
    print(f"\n=== PERFORMANCE BY SIZE ===")
    for size in test_sizes:
        times = []
        successes = 0
        for difficulty in difficulty_levels:
            result = results[size][difficulty]
            times.append(result["generation_time"])
            if result["success"]:
                successes += 1

        avg_time = sum(times) / len(times)
        print(
            f"{size}x{size}: {successes}/{len(difficulty_levels)} success, avg {avg_time:.2f}s per attempt"
        )

    # Show actual difficulty distributions
    print(f"\n=== ACTUAL DIFFICULTY DISTRIBUTIONS ===")
    for size in test_sizes:
        print(f"{size}x{size} actual operations:")
        size_ops = []
        for difficulty in difficulty_levels:
            result = results[size][difficulty]
            if result["success"] and isinstance(result["operations"], int):
                size_ops.append((difficulty, result["operations"]))

        size_ops.sort(key=lambda x: x[1])  # Sort by operations
        for difficulty, ops in size_ops:
            print(f"  {difficulty:>8}: {ops:>8,} operations")
        print()

    return results


def test_specific_case():
    """Test a specific case in detail."""
    print("=== DETAILED TEST: 5x5 MEDIUM DIFFICULTY ===")

    try:
        puzzle = kenken.generate_kenken_puzzle(
            size=5, difficulty="medium", max_difficulty_attempts=5
        )

        print(f"Successfully generated 5x5 medium puzzle:")
        print(f"  Actual difficulty: {puzzle['difficulty_operations']:,} operations")
        print(
            f"  Target range: {puzzle['target_difficulty_range'][0]:,} - {puzzle['target_difficulty_range'][1]:,}"
        )
        print(f"  Number of cages: {len(puzzle['cages'])}")

        # Show operation distribution
        operations = {}
        for cage in puzzle["cages"]:
            op = cage["operation"] if cage["operation"] else "none"
            operations[op] = operations.get(op, 0) + 1

        print(f"  Operation distribution:")
        for op, count in sorted(operations.items()):
            print(f"    {op}: {count} cages")

        # Verify solution
        is_valid = kenken.verify_solution(puzzle)
        print(f"  Solution valid: {is_valid}")

    except Exception as e:
        print(f"Failed to generate test puzzle: {e}")


if __name__ == "__main__":
    try:
        # Run basic functionality test
        test_specific_case()
        print("\n" + "=" * 60 + "\n")

        # Run comprehensive test
        test_difficulty_levels()

    finally:
        # Clean up temporary files
        for temp_file in ["kenken_temp.py", "latin_square.py"]:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        # Also clean up any pycache
        if os.path.exists("__pycache__"):
            shutil.rmtree("__pycache__")
