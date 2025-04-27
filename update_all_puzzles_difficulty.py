#!/usr/bin/env python3
"""
Update all puzzles in all_puzzles.jsonl with the new human-centered difficulty system.
Uses the improved human-centered solver to recalculate difficulty levels.
"""

import json
import time
from datetime import datetime
from improved_arithmatrix_solver import (
    ImprovedArithmatrixSolver,
    analyze_puzzle_difficulty,
)


def load_puzzles(filename):
    """Load puzzles from JSONL file."""
    puzzles = []
    with open(filename, "r") as f:
        for line_num, line in enumerate(f, 1):
            try:
                puzzle_data = json.loads(line.strip())
                puzzles.append(puzzle_data)
            except json.JSONDecodeError as e:
                print(f"Error parsing line {line_num}: {e}")
                continue
    return puzzles


def update_puzzle_difficulty(puzzle_data):
    """Update a single puzzle's difficulty using the new human-centered system."""
    try:
        puzzle = puzzle_data["puzzle"]

        # Analyze with the new human-centered system
        analysis = analyze_puzzle_difficulty(puzzle)

        # Update the puzzle data
        puzzle_data["puzzle"]["difficulty_operations"] = analysis[
            "human_difficulty_score"
        ]

        # Update metadata
        if "metadata" not in puzzle_data:
            puzzle_data["metadata"] = {}

        # Store old values for comparison
        old_difficulty = puzzle_data["metadata"].get("actual_difficulty", "unknown")
        old_operations = puzzle_data["puzzle"].get("difficulty_operations", 0)

        # Update with new values
        puzzle_data["metadata"]["actual_difficulty"] = analysis["difficulty_category"]
        puzzle_data["metadata"]["old_difficulty"] = old_difficulty
        puzzle_data["metadata"]["old_difficulty_operations"] = old_operations
        puzzle_data["metadata"]["new_difficulty_system"] = "human_centered_v2"
        puzzle_data["metadata"]["difficulty_updated_at"] = datetime.now().isoformat()

        # Add detailed analysis
        puzzle_data["metadata"]["human_analysis"] = {
            "base_difficulty_seconds": analysis["base_difficulty"],
            "complexity_multiplier": analysis["complexity_multiplier"],
            "complexity_factors": analysis["complexity_analysis"]["complexity_factors"],
            "human_difficulty_score": analysis["human_difficulty_score"],
            "estimated_solve_time_seconds": analysis["estimated_solve_time_seconds"],
            "size_category": analysis["size_category"],
            "recommendations": analysis["recommendations"],
        }

        return puzzle_data, True

    except Exception as e:
        print(f"Error updating puzzle: {e}")
        return puzzle_data, False


def update_all_puzzles(input_file, output_file):
    """Update all puzzles and save to output file."""
    print(f"🔄 Updating difficulty levels in {input_file}...")
    print(f"📊 Using new human-centered difficulty system")

    # Load puzzles
    print("📖 Loading puzzles...")
    puzzles = load_puzzles(input_file)
    print(f"✅ Loaded {len(puzzles)} puzzles")

    # Update puzzles
    updated_puzzles = []
    success_count = 0
    error_count = 0

    # Track difficulty changes
    difficulty_changes = {"easiest": 0, "easy": 0, "medium": 0, "hard": 0, "expert": 0}

    start_time = time.time()

    for i, puzzle_data in enumerate(puzzles):
        if (i + 1) % 500 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed
            remaining = (len(puzzles) - i - 1) / rate
            print(
                f"⏳ Progress: {i + 1}/{len(puzzles)} ({(i + 1) / len(puzzles) * 100:.1f}%) "
                f"- {rate:.1f} puzzles/sec - ETA: {remaining:.0f}s"
            )

        updated_puzzle, success = update_puzzle_difficulty(puzzle_data)
        updated_puzzles.append(updated_puzzle)

        if success:
            success_count += 1
            new_difficulty = updated_puzzle["metadata"]["actual_difficulty"]
            if new_difficulty in difficulty_changes:
                difficulty_changes[new_difficulty] += 1
        else:
            error_count += 1

    # Save updated puzzles
    print(f"💾 Saving updated puzzles to {output_file}...")
    with open(output_file, "w") as f:
        for puzzle_data in updated_puzzles:
            f.write(json.dumps(puzzle_data) + "\n")

    # Print summary
    total_time = time.time() - start_time
    print(f"\n✅ UPDATE COMPLETE!")
    print(f"📊 SUMMARY:")
    print(f"   Total puzzles: {len(puzzles)}")
    print(f"   Successfully updated: {success_count}")
    print(f"   Errors: {error_count}")
    print(f"   Processing time: {total_time:.1f} seconds")
    print(f"   Rate: {len(puzzles) / total_time:.1f} puzzles/second")

    print(f"\n🎯 NEW DIFFICULTY DISTRIBUTION:")
    for difficulty, count in difficulty_changes.items():
        percentage = (count / success_count * 100) if success_count > 0 else 0
        print(f"   {difficulty:>8}: {count:4d} puzzles ({percentage:5.1f}%)")

    # Show some examples of changes
    print(f"\n📝 EXAMPLE CHANGES:")
    examples_shown = 0
    for puzzle_data in updated_puzzles[:20]:  # Check first 20
        if "old_difficulty" in puzzle_data["metadata"]:
            old_diff = puzzle_data["metadata"]["old_difficulty"]
            new_diff = puzzle_data["metadata"]["actual_difficulty"]
            if old_diff != new_diff and examples_shown < 5:
                size = puzzle_data["puzzle"]["size"]
                old_ops = puzzle_data["metadata"]["old_difficulty_operations"]
                new_score = puzzle_data["metadata"]["human_analysis"][
                    "human_difficulty_score"
                ]
                print(
                    f"   {size}x{size}: {old_diff} → {new_diff} "
                    f"(ops: {old_ops:.1f} → score: {new_score:.1f})"
                )
                examples_shown += 1

    return success_count, error_count


def main():
    """Main function."""
    input_file = "all_puzzles.jsonl"
    output_file = "all_puzzles.jsonl"  # Overwrite the original (backup exists)

    print("🧠 ARITHMATRIX PUZZLE DIFFICULTY UPDATER")
    print("=" * 60)
    print("Using new human-centered difficulty analysis system")
    print("Based on real-world solve time data analysis")
    print("=" * 60)

    # Confirm backup exists
    try:
        with open("all_puzzles.jsonl_backup_20250601_082419", "r") as f:
            backup_lines = sum(1 for _ in f)
        print(f"✅ Backup confirmed: {backup_lines} puzzles in backup file")
    except FileNotFoundError:
        print("⚠️  No backup found, but user confirmed it's okay to proceed")

    # Update puzzles
    success_count, error_count = update_all_puzzles(input_file, output_file)

    if error_count > 0:
        print(f"\n⚠️  {error_count} puzzles had errors during update")

    print(f"\n🎉 All done! Updated {success_count} puzzles with new difficulty system.")


if __name__ == "__main__":
    main()
