#!/usr/bin/env python3

import sys
import os
import time
import json
import shutil
import glob
from datetime import datetime
from collections import defaultdict

# Fix the import by temporarily modifying the kenken module
# Use process ID to avoid conflicts in parallel execution
process_id = os.getpid()
temp_kenken_file = f"kenken_temp_{process_id}.py"
temp_latin_file = f"latin_square_{process_id}.py"

with open("backend/kenken.py", "r") as f:
    kenken_content = f.read()

# Replace relative import with absolute import for standalone execution
fixed_content = kenken_content.replace(
    "from .latin_square import get_latin_square",
    f"from latin_square_{process_id} import get_latin_square",
)

# Replace Flask app logging with minimal output
fixed_content = fixed_content.replace(
    "from flask import current_app as app", "# from flask import current_app as app"
)

# Replace all app.logger calls with pass statements to minimize output
import re

fixed_content = re.sub(r"app\.logger\.info\([^)]*\)", "pass", fixed_content)
fixed_content = re.sub(r"app\.logger\.error\([^)]*\)", "pass", fixed_content)

# Write to a temporary file with process ID
with open(temp_kenken_file, "w") as f:
    f.write(fixed_content)

# Copy latin_square.py to current directory with process ID
if os.path.exists("backend/latin_square.py"):
    shutil.copy("backend/latin_square.py", temp_latin_file)

# Now import from the temporary module
sys.path.insert(0, os.getcwd())
kenken_module = __import__(f"kenken_temp_{process_id}")
kenken = kenken_module


class BatchPuzzleGenerator:
    """Generate KenKen puzzles in batch and save to a single JSONL file."""

    def __init__(self, output_file="puzzles.jsonl"):
        self.output_file = output_file
        self.difficulty_levels = ["easiest", "easy", "medium", "hard", "expert"]
        self.stats = defaultdict(lambda: defaultdict(int))

        # Initialize single JSONL file
        self.file_handle = open(output_file, "a", encoding="utf-8")

    def classify_difficulty(self, size, operations):
        """Classify a puzzle's difficulty based on its operation count."""
        # Get the difficulty ranges for this size
        ranges = {}
        for difficulty in self.difficulty_levels:
            min_ops, max_ops = kenken._get_difficulty_range(size, difficulty)
            ranges[difficulty] = (min_ops, max_ops)

        # Find which range the operations fall into
        for difficulty in self.difficulty_levels:
            min_ops, max_ops = ranges[difficulty]
            if min_ops <= operations <= max_ops:
                return difficulty

        # If it doesn't fit exactly, find the closest range
        best_difficulty = "medium"
        best_distance = float("inf")

        for difficulty in self.difficulty_levels:
            min_ops, max_ops = ranges[difficulty]
            if operations < min_ops:
                distance = min_ops - operations
            elif operations > max_ops:
                distance = operations - max_ops
            else:
                distance = 0

            if distance < best_distance:
                best_distance = distance
                best_difficulty = difficulty

        return best_difficulty

    def generate_puzzle_with_metadata(self, size):
        """Generate a single puzzle with full metadata."""
        start_time = time.time()

        try:
            # Generate a random puzzle
            puzzle = kenken._generate_basic_puzzle(size, max_attempts=100)
            operations = kenken.solve_kenken_puzzle(puzzle)
            puzzle["difficulty_operations"] = operations

            generation_time = time.time() - start_time

            # Classify the actual difficulty
            actual_difficulty = self.classify_difficulty(size, operations)

            # Add metadata
            puzzle_data = {
                "puzzle": puzzle,
                "metadata": {
                    "size": size,
                    "actual_difficulty": actual_difficulty,
                    "operation_count": operations,
                    "generation_time": round(generation_time, 3),
                    "generated_at": datetime.now().isoformat(),
                    "generator_version": "optimized_v2",
                },
            }

            return puzzle_data

        except Exception as e:
            return None

    def save_puzzle(self, puzzle_data):
        """Save a puzzle to the JSONL file."""
        json_line = json.dumps(puzzle_data, separators=(",", ":"))
        self.file_handle.write(json_line + "\n")
        self.file_handle.flush()  # Ensure immediate write

    def generate_batch(self, size_config):
        """Generate a batch of puzzles according to the size configuration."""
        print(f"\n=== BATCH GENERATION STARTED ===")
        print(f"Output file: {self.output_file}")
        print(f"Configuration: {size_config}")

        total_requested = sum(size_config.values())
        total_generated = 0
        total_failed = 0

        start_time = time.time()

        for size, target_count in size_config.items():
            print(f"\n--- Generating {target_count} puzzles of size {size}x{size} ---")

            generated_count = 0
            attempt_count = 0
            max_attempts = target_count * 3  # Allow some failures

            while generated_count < target_count and attempt_count < max_attempts:
                attempt_count += 1

                result = self.generate_puzzle_with_metadata(size)

                if result is not None:
                    # Success - save the puzzle
                    self.save_puzzle(result)

                    # Update stats
                    difficulty = result["metadata"]["actual_difficulty"]
                    self.stats[size][difficulty] += 1
                    self.stats["total"]["generated"] += 1

                    generated_count += 1
                    total_generated += 1

                    # Progress indicator
                    if generated_count % 5 == 0 or generated_count == target_count:
                        print(f"    Generated {generated_count}/{target_count}")
                else:
                    # Failed
                    self.stats["total"]["failed"] += 1
                    total_failed += 1

                    if total_failed % 10 == 0:
                        print(f"    Failed attempts: {total_failed}")

            if generated_count < target_count:
                print(f"    ⚠️  Only generated {generated_count}/{target_count} puzzles")

        total_time = time.time() - start_time

        # Final summary
        print(f"\n=== BATCH GENERATION COMPLETE ===")
        print(f"Total time: {total_time:.1f}s")
        print(
            f"Generated: {total_generated}/{total_requested} puzzles ({total_generated / total_requested * 100:.1f}%)"
        )
        print(f"Failed: {total_failed} attempts")
        print(f"Average time per puzzle: {total_time / max(1, total_generated):.2f}s")

        # Show distribution by difficulty
        print(f"\n📊 DIFFICULTY DISTRIBUTION:")
        for difficulty in self.difficulty_levels:
            count = sum(
                self.stats[size].get(difficulty, 0) for size in size_config.keys()
            )
            print(f"  {difficulty:>8}: {count:3d} puzzles")

        # Show distribution by size
        print(f"\n📏 SIZE DISTRIBUTION:")
        for size in sorted(size_config.keys()):
            total_for_size = sum(self.stats[size].values())
            print(f"  {size}x{size}: {total_for_size:3d} puzzles")

    def close(self):
        """Close the file handle."""
        self.file_handle.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def create_default_config():
    """Create a default configuration for batch generation."""
    return {
        4: 100,  # 100 4x4 puzzles
        5: 75,  # 75 5x5 puzzles
        6: 50,  # 50 6x6 puzzles
        7: 25,  # 25 7x7 puzzles
    }


def create_quick_config():
    """Create a quick test configuration."""
    return {
        4: 15,  # 15 4x4 puzzles
        5: 9,  # 9 5x5 puzzles
        6: 4,  # 4 6x6 puzzles
        7: 2,  # 2 7x7 puzzles
    }


def main():
    """Main function to run the batch generator."""
    import argparse

    parser = argparse.ArgumentParser(description="Generate KenKen puzzles in batch")
    parser.add_argument(
        "--config",
        choices=["default", "quick", "custom"],
        default="quick",
        help="Configuration preset to use",
    )
    parser.add_argument(
        "--output-file", default="puzzles.jsonl", help="Output JSONL file for puzzles"
    )
    parser.add_argument(
        "--custom-config", help="Path to JSON file with custom configuration"
    )

    args = parser.parse_args()

    # Load configuration
    if args.config == "default":
        config = create_default_config()
    elif args.config == "quick":
        config = create_quick_config()
    elif args.config == "custom":
        if not args.custom_config:
            print("Error: --custom-config required when using --config custom")
            return 1

        with open(args.custom_config, "r") as f:
            config_raw = json.load(f)
            # Convert string keys to integers for puzzle sizes
            config = {int(k): v for k, v in config_raw.items()}

    print("🧩 KenKen Batch Puzzle Generator")
    print("=" * 50)

    try:
        with BatchPuzzleGenerator(args.output_file) as generator:
            generator.generate_batch(config)

        print(f"\n✅ Puzzles saved to {args.output_file}")
        print(f"   All puzzles with operation counts included in single JSONL file")

        return 0

    except KeyboardInterrupt:
        print(f"\n🛑 Generation interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Generation failed: {e}")
        import traceback

        traceback.print_exc()
        return 1
    finally:
        # Clean up temporary files with process ID
        process_id = os.getpid()
        temp_files = [
            f"kenken_temp_{process_id}.py",
            f"latin_square_{process_id}.py",
            f"__pycache__/kenken_temp_{process_id}.cpython-*.pyc",
            f"__pycache__/latin_square_{process_id}.cpython-*.pyc",
        ]

        for temp_pattern in temp_files:
            # Handle glob patterns for .pyc files
            if "*" in temp_pattern:
                import glob

                for temp_file in glob.glob(temp_pattern):
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
            else:
                if os.path.exists(temp_pattern):
                    os.remove(temp_pattern)


if __name__ == "__main__":
    sys.exit(main())
