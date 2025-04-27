#!/usr/bin/env python3

import json
import os
import argparse
from collections import defaultdict
from datetime import datetime


def load_puzzles_from_jsonl(filepath):
    """Load all puzzles from a JSONL file."""
    puzzles = []
    if not os.path.exists(filepath):
        return puzzles

    with open(filepath, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if line:
                try:
                    puzzle_data = json.loads(line)
                    puzzles.append(puzzle_data)
                except json.JSONDecodeError as e:
                    print(
                        f"Warning: Invalid JSON on line {line_num} in {filepath}: {e}"
                    )

    return puzzles


def analyze_batch_file(batch_file):
    """Analyze all puzzles in a JSONL file."""
    difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]

    print(f"🧩 KenKen Batch Analysis")
    print(f"File: {batch_file}")
    print("=" * 50)

    puzzles = load_puzzles_from_jsonl(batch_file)
    total_puzzles = len(puzzles)

    difficulty_stats = {
        difficulty: {
            "count": 0,
            "operation_counts": [],
            "generation_times": [],
            "sizes": [],
        }
        for difficulty in difficulty_levels
    }
    size_stats = defaultdict(lambda: defaultdict(int))
    operation_stats = defaultdict(list)
    generation_times = []

    # Process all puzzles
    for puzzle in puzzles:
        difficulty = puzzle["metadata"]["actual_difficulty"]
        size = puzzle["metadata"]["size"]
        operation_count = puzzle["metadata"]["operation_count"]
        generation_time = puzzle["metadata"]["generation_time"]

        difficulty_stats[difficulty]["count"] += 1
        difficulty_stats[difficulty]["operation_counts"].append(operation_count)
        difficulty_stats[difficulty]["generation_times"].append(generation_time)
        difficulty_stats[difficulty]["sizes"].append(size)

        size_stats[size][difficulty] += 1
        operation_stats[size].append(operation_count)
        generation_times.append(generation_time)

    # Print summary
    print(f"📊 SUMMARY")
    print(f"Total puzzles: {total_puzzles}")
    print()

    # Difficulty distribution
    print(f"🎯 DIFFICULTY DISTRIBUTION")
    for difficulty in difficulty_levels:
        stats = difficulty_stats[difficulty]
        count = stats["count"]
        if count > 0:
            min_ops = min(stats["operation_counts"])
            max_ops = max(stats["operation_counts"])
            avg_ops = sum(stats["operation_counts"]) / count
            avg_time = sum(stats["generation_times"]) / count

            print(
                f"  {difficulty:>8}: {count:3d} puzzles | {min_ops:>6,}-{max_ops:<6,} ops (avg: {avg_ops:>6,.0f}) | {avg_time:.2f}s avg"
            )
        else:
            print(f"  {difficulty:>8}: {count:3d} puzzles")
    print()

    # Size distribution
    print(f"📏 SIZE DISTRIBUTION")
    for size in sorted(size_stats.keys()):
        total_for_size = sum(size_stats[size].values())
        ops_for_size = operation_stats[size]

        if ops_for_size:
            min_ops = min(ops_for_size)
            max_ops = max(ops_for_size)
            avg_ops = sum(ops_for_size) / len(ops_for_size)

            print(
                f"  {size}x{size}: {total_for_size:3d} puzzles | {min_ops:>6,}-{max_ops:<6,} ops (avg: {avg_ops:>6,.0f})"
            )

            # Show difficulty breakdown for this size
            for difficulty in difficulty_levels:
                if size_stats[size][difficulty] > 0:
                    print(f"        {difficulty}: {size_stats[size][difficulty]}")
        else:
            print(f"  {size}x{size}: {total_for_size:3d} puzzles")
        print()

    # Performance stats
    if generation_times:
        avg_time = sum(generation_times) / len(generation_times)
        min_time = min(generation_times)
        max_time = max(generation_times)
        print(f"⚡ GENERATION PERFORMANCE")
        print(f"  Average time: {avg_time:.2f}s")
        print(f"  Range: {min_time:.2f}s - {max_time:.2f}s")
        print(f"  Total time: {sum(generation_times):.1f}s")


def display_puzzle(puzzle_data, show_solution=False):
    """Display a single puzzle in a readable format."""
    puzzle = puzzle_data["puzzle"]
    metadata = puzzle_data["metadata"]

    print(
        f"🧩 {metadata['size']}x{metadata['size']} {metadata['actual_difficulty'].upper()} Puzzle"
    )
    print(f"   Operations: {metadata['operation_count']:,}")
    print(f"   Generated: {metadata['generated_at']}")
    print(f"   Time: {metadata['generation_time']:.3f}s")
    print()

    # Display cages
    print("📋 CAGES:")
    for i, cage in enumerate(puzzle["cages"]):
        operation = cage["operation"] if cage["operation"] else "single"
        print(f"  Cage {i + 1}: {cage['value']} ({operation}) - cells {cage['cells']}")

    if show_solution:
        print(f"\n🔓 SOLUTION:")
        solution = puzzle["solution"]
        for row in solution:
            print("  " + " ".join(f"{num:2d}" for num in row))


def main():
    parser = argparse.ArgumentParser(description="Inspect generated KenKen puzzles")
    parser.add_argument(
        "--batch-file", default="puzzles.jsonl", help="JSONL file containing puzzles"
    )
    parser.add_argument(
        "--show-puzzle",
        help="Show details of a specific puzzle (format: index, e.g., 0, 5, 10)",
    )
    parser.add_argument(
        "--show-solution",
        action="store_true",
        help="Include solution when showing puzzle details",
    )

    args = parser.parse_args()

    if not os.path.exists(args.batch_file):
        print(f"Error: File {args.batch_file} not found")
        return 1

    if args.show_puzzle:
        # Show specific puzzle
        try:
            index = int(args.show_puzzle)
            puzzles = load_puzzles_from_jsonl(args.batch_file)

            if 0 <= index < len(puzzles):
                display_puzzle(puzzles[index], args.show_solution)
            else:
                print(
                    f"Error: Index {index} out of range for puzzles (0-{len(puzzles) - 1})"
                )
                return 1

        except ValueError:
            print("Error: Invalid format for --show-puzzle. Use index (e.g., 0, 5, 10)")
            return 1
    else:
        # Show batch analysis
        analyze_batch_file(args.batch_file)

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
