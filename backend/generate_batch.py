#!/usr/bin/env python3
"""
Parallel batch puzzle generator for Arithmatrix.

Usage:
    python -m backend.generate_batch --output public/all_puzzles.jsonl
    python -m backend.generate_batch --sizes 4,5 --difficulties easy,medium --count 10
    python -m backend.generate_batch --operations-tiers add,all --workers 4
"""

import argparse
import json
import logging
import multiprocessing as mp
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

GENERATOR_VERSION = "v3"

# Operation tier definitions
OPERATIONS_TIERS = {
    "add": ["+"],
    "add-sub": ["+", "-"],
    "no-div": ["+", "-", "*"],
    "all": ["+", "-", "*", "/"],
}

VALID_SIZES = [4, 5, 6, 7]
VALID_DIFFICULTIES = ["easiest", "easy", "medium", "hard", "expert"]


def generate_one_puzzle(args):
    """Generate a single puzzle. Designed to run in a worker process."""
    size, difficulty, allowed_operations, operations_tier, max_attempts, max_difficulty_attempts = args

    # Suppress noisy per-attempt logging from the inner generator
    logging.getLogger("backend.arithmatrix").setLevel(logging.WARNING)

    # Import inside worker to avoid pickling issues
    from backend.arithmatrix import generate_arithmatrix_puzzle
    from backend.solver import count_solutions

    start = time.time()
    try:
        puzzle = generate_arithmatrix_puzzle(
            size,
            difficulty=difficulty,
            max_attempts=max_attempts,
            max_difficulty_attempts=max_difficulty_attempts,
            allowed_operations=allowed_operations,
        )

        if puzzle is None:
            return None

        # Belt and braces: a puzzle with more than one solution must never
        # reach the corpus. generate_arithmatrix_puzzle already rejects them,
        # but it has a last-resort path that returns a puzzle unvalidated, and
        # 45% of the previous corpus got in through a uniqueness check that
        # only ever proved "solvable at all".
        if count_solutions(puzzle, 2) != 1:
            logger.debug(f"Discarded non-unique {size}x{size} {difficulty} puzzle")
            return None

        elapsed = time.time() - start

        # Get difficulty score from the puzzle (already set by generate_arithmatrix_puzzle)
        difficulty_score = puzzle.get("difficulty_score", 0)
        actual_difficulty = puzzle.get("actual_difficulty", "unknown")
        techniques_used = puzzle.get("techniques_used", {})

        # Build the JSONL record in the format the frontend expects
        record = {
            "puzzle": {
                "size": puzzle["size"],
                "cages": puzzle["cages"],
                "solution": puzzle["solution"],
                "difficulty_operations": difficulty_score,
            },
            "metadata": {
                "size": puzzle["size"],
                "actual_difficulty": actual_difficulty,
                "difficulty_score": difficulty_score,
                "techniques_used": techniques_used,
                "operations_tier": operations_tier,
                "operation_count": len(puzzle["cages"]),
                "generation_time": round(elapsed, 3),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "generator_version": GENERATOR_VERSION,
            },
        }

        return record

    except Exception as e:
        logger.debug(f"Generation failed for {size}x{size} {difficulty} {operations_tier}: {e}")
        return None


def run_batch(sizes, difficulties, operations_tiers, count_per_bucket, workers, output_path,
              max_attempts, max_difficulty_attempts, max_time=None):
    """Generate puzzles in parallel, filling each bucket to the target count."""

    # Build the set of buckets we need to fill
    buckets = {}
    for size in sizes:
        for difficulty in difficulties:
            for tier_name in operations_tiers:
                key = (size, difficulty, tier_name)
                buckets[key] = []

    total_target = len(buckets) * count_per_bucket
    total_generated = 0
    start_time = time.time()

    logger.info(f"Generating {total_target} puzzles across {len(buckets)} buckets ({count_per_bucket} each)")
    logger.info(f"Sizes: {sizes}, Difficulties: {difficulties}, Tiers: {list(operations_tiers)}")
    logger.info(f"Workers: {workers}")
    if max_time:
        logger.info(f"Time limit: {max_time}s")

    # Keep submitting work until all buckets are full
    with ProcessPoolExecutor(max_workers=workers) as executor:
        # Submit initial batch of work
        pending_futures = {}
        batch_size = workers * 4  # Keep workers busy

        def submit_work():
            """Submit work for unfilled buckets."""
            submitted = 0
            for key, results in buckets.items():
                if len(results) >= count_per_bucket:
                    continue
                needed = count_per_bucket - len(results)
                size, difficulty, tier_name = key
                allowed_ops = OPERATIONS_TIERS[tier_name]
                for _ in range(min(needed, 2)):  # Submit a couple per bucket
                    if len(pending_futures) >= batch_size:
                        return submitted
                    args = (size, difficulty, allowed_ops, tier_name, max_attempts, max_difficulty_attempts)
                    future = executor.submit(generate_one_puzzle, args)
                    pending_futures[future] = key
                    submitted += 1
            return submitted

        submit_work()

        while pending_futures:
            # Wait for any future to complete
            done_futures = []
            for future in list(pending_futures.keys()):
                if future.done():
                    done_futures.append(future)

            if not done_futures:
                # Brief sleep to avoid busy-waiting
                time.sleep(0.05)
                continue

            for future in done_futures:
                key = pending_futures.pop(future)
                size, difficulty, tier_name = key

                try:
                    result = future.result(timeout=5)
                except Exception as e:
                    logger.debug(f"Worker error for {key}: {e}")
                    continue

                if result is None:
                    continue

                actual = result["metadata"]["actual_difficulty"]

                # Check if this puzzle matches the target bucket
                if actual == difficulty and len(buckets[key]) < count_per_bucket:
                    buckets[key].append(result)
                    total_generated += 1

                    if total_generated % 10 == 0 or total_generated == total_target:
                        filled = sum(1 for v in buckets.values() if len(v) >= count_per_bucket)
                        elapsed = time.time() - start_time
                        rate = total_generated / elapsed if elapsed > 0 else 0
                        logger.info(
                            f"Progress: {total_generated}/{total_target} puzzles "
                            f"({filled}/{len(buckets)} buckets full) "
                            f"[{rate:.1f}/s]"
                        )
                else:
                    # Check if it fits a different bucket that needs filling
                    alt_key = (size, actual, tier_name)
                    if alt_key in buckets and len(buckets[alt_key]) < count_per_bucket:
                        buckets[alt_key].append(result)
                        total_generated += 1

            # Check if we're done
            all_full = all(len(v) >= count_per_bucket for v in buckets.values())
            if all_full:
                break

            # Check time limit
            if max_time and (time.time() - start_time) > max_time:
                logger.warning(f"Time limit of {max_time}s reached, stopping")
                break

            # Submit more work
            submit_work()

    elapsed = time.time() - start_time
    logger.info(f"Generation complete in {elapsed:.1f}s")

    # Report bucket status
    for key, results in sorted(buckets.items()):
        size, difficulty, tier_name = key
        status = "OK" if len(results) >= count_per_bucket else "SHORT"
        logger.info(f"  {size}x{size} {difficulty:8s} {tier_name:8s}: {len(results)}/{count_per_bucket} [{status}]")

    # Write output
    all_puzzles = []
    for results in buckets.values():
        all_puzzles.extend(results)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        for puzzle in all_puzzles:
            f.write(json.dumps(puzzle) + "\n")

    logger.info(f"Wrote {len(all_puzzles)} puzzles to {output_path}")
    return all_puzzles


def main():
    parser = argparse.ArgumentParser(description="Batch generate Arithmatrix puzzles")
    parser.add_argument(
        "--sizes",
        default="4,5,6,7",
        help="Comma-separated grid sizes (default: 4,5,6,7)",
    )
    parser.add_argument(
        "--difficulties",
        default="easiest,easy,medium,hard,expert",
        help="Comma-separated difficulties (default: all)",
    )
    parser.add_argument(
        "--operations-tiers",
        default="all",
        help="Comma-separated operation tiers: add, add-sub, no-div, all (default: all)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=50,
        help="Puzzles per bucket (default: 50)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=max(1, mp.cpu_count() - 1),
        help=f"Worker processes (default: {max(1, mp.cpu_count() - 1)})",
    )
    parser.add_argument(
        "--output",
        default="public/all_puzzles.jsonl",
        help="Output JSONL file path (default: public/all_puzzles.jsonl)",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=500,
        help="Max cage carving attempts per puzzle (default: 500)",
    )
    parser.add_argument(
        "--max-difficulty-attempts",
        type=int,
        default=50,
        help="Max attempts to hit target difficulty (default: 50)",
    )
    parser.add_argument(
        "--max-time",
        type=int,
        default=None,
        help="Maximum total generation time in seconds (default: unlimited)",
    )

    args = parser.parse_args()

    # Parse arguments
    sizes = [int(s) for s in args.sizes.split(",")]
    for s in sizes:
        if s not in VALID_SIZES:
            parser.error(f"Invalid size: {s}. Must be one of {VALID_SIZES}")

    difficulties = [d.strip() for d in args.difficulties.split(",")]
    for d in difficulties:
        if d not in VALID_DIFFICULTIES:
            parser.error(f"Invalid difficulty: {d}. Must be one of {VALID_DIFFICULTIES}")

    tiers = [t.strip() for t in args.operations_tiers.split(",")]
    for t in tiers:
        if t not in OPERATIONS_TIERS:
            parser.error(f"Invalid operations tier: {t}. Must be one of {list(OPERATIONS_TIERS.keys())}")

    run_batch(
        sizes=sizes,
        difficulties=difficulties,
        operations_tiers=tiers,
        count_per_bucket=args.count,
        workers=args.workers,
        output_path=args.output,
        max_attempts=args.max_attempts,
        max_difficulty_attempts=args.max_difficulty_attempts,
        max_time=args.max_time,
    )


if __name__ == "__main__":
    main()
