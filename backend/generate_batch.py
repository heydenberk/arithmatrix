#!/usr/bin/env python3
"""
Parallel batch puzzle generator for Arithmatrix.

Usage:
    python -m backend.generate_batch --output public/all_puzzles.jsonl
    python -m backend.generate_batch --sizes 4,5 --difficulties easy,medium --count 10
    python -m backend.generate_batch --operations-tiers add,all --workers 4 --max-time 600

Fills one bucket per (size, difficulty, operations tier). Every accepted record
has passed `arithmatrix.evaluate_candidate` inside the worker - structural
validation, a solution count of exactly one, and a technique trace that reached
the stored solution - so nothing is re-verified here.

Time is bounded in two layers. The deadline is handed to every worker, and the
solver loops check it, so a running attempt abandons itself shortly after the
cutoff. Whatever is still running `grace` seconds later is terminated. Total
wall time is therefore at most `max_time + grace` regardless of what the
workers are doing.
"""

import argparse
import json
import logging
import multiprocessing as mp
import os
import queue
import sys
import tempfile
import time
import traceback
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from backend.arithmatrix import DIFFICULTY_ORDER, OPERATIONS_TIERS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# v4: candidates are accepted by count-first evaluation with no heuristic
# pre-filter and no unvalidated fallback; every record carries techniques_used.
GENERATOR_VERSION = "v4"

VALID_SIZES = [4, 5, 6, 7]
VALID_DIFFICULTIES = list(DIFFICULTY_ORDER)

BucketKey = Tuple[int, str, str]


@dataclass(frozen=True)
class Task:
    size: int
    difficulty: str
    tier: str
    max_attempts: int
    max_difficulty_attempts: int
    # Absolute wall-clock cutoff shared with the coordinator, or None
    deadline_at: Optional[float]

    @property
    def key(self) -> BucketKey:
        return (self.size, self.difficulty, self.tier)


def canonical_signature(puzzle: dict) -> str:
    """Identity of a puzzle by its cages alone - the same board carved the same
    way is the same puzzle whatever the record order."""
    parts = sorted(
        f"{c['operation']}{c['value']}:{','.join(map(str, sorted(c['cells'])))}" for c in puzzle["cages"]
    )
    return f"{puzzle['size']}|{'|'.join(parts)}"


def generate_one_puzzle(task: Task) -> dict:
    """Generate one puzzle in a worker process.

    Returns a status dict rather than a bare record or None so the coordinator
    can tell a rejection from a crash: {"status": "ok", "record": ...},
    {"status": "rejected", "reason": ...} or {"status": "error", "detail": ...}.
    Exceptions used to be swallowed into None at debug level, which made a
    programming error look like an unlucky candidate.
    """
    # Suppress noisy per-attempt logging from the inner generator
    logging.getLogger("backend.arithmatrix").setLevel(logging.WARNING)

    # Import inside worker so a spawned process pays the import once, lazily
    from backend.arithmatrix import generate_arithmatrix_puzzle
    from backend.solver import Deadline

    deadline = Deadline(task.deadline_at) if task.deadline_at is not None else None
    start = time.time()
    try:
        puzzle = generate_arithmatrix_puzzle(
            task.size,
            difficulty=task.difficulty,
            max_attempts=task.max_attempts,
            max_difficulty_attempts=task.max_difficulty_attempts,
            allowed_operations=OPERATIONS_TIERS[task.tier],
            deadline=deadline,
        )
    except Exception:
        return {"status": "error", "detail": traceback.format_exc()}

    if puzzle is None:
        reason = "deadline" if deadline is not None and deadline.expired() else "exhausted"
        return {"status": "rejected", "reason": reason}

    elapsed = time.time() - start
    record = {
        "puzzle": {
            "size": puzzle["size"],
            "cages": puzzle["cages"],
            "solution": puzzle["solution"],
            "difficulty_operations": puzzle["difficulty_score"],
        },
        "metadata": {
            "size": puzzle["size"],
            "actual_difficulty": puzzle["actual_difficulty"],
            "difficulty_score": puzzle["difficulty_score"],
            "techniques_used": puzzle["techniques_used"],
            "operations_tier": task.tier,
            "operation_count": len(puzzle["cages"]),
            "generation_time": round(elapsed, 3),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generator_version": GENERATOR_VERSION,
        },
    }
    return {"status": "ok", "record": record}


@dataclass
class BucketPlan:
    """Bookkeeping for the buckets: what is accepted, what is in flight, what
    was rejected and why. Pure state so the scheduling rules are testable
    without a process pool.
    """

    keys: List[BucketKey]
    count_per_bucket: int
    accepted: Dict[BucketKey, List[dict]] = field(init=False)
    pending: Counter = field(init=False, default_factory=Counter)
    rejections: Dict[BucketKey, Counter] = field(init=False)
    errors: List[Tuple[BucketKey, str]] = field(init=False, default_factory=list)
    signatures: set = field(init=False, default_factory=set)
    duplicates: int = 0

    def __post_init__(self):
        self.accepted = {k: [] for k in self.keys}
        self.rejections = {k: Counter() for k in self.keys}

    def demand(self, key: BucketKey) -> int:
        """Records still wanted for a bucket, net of work already in flight.
        Submitting against accepted-only demand kept full buckets busy."""
        return max(0, self.count_per_bucket - len(self.accepted[key]) - self.pending[key])

    def complete(self) -> bool:
        return all(len(v) >= self.count_per_bucket for v in self.accepted.values())

    def next_submissions(self, capacity: int) -> List[BucketKey]:
        """Round-robin across buckets with demand, one task per bucket per
        round, until `capacity` tasks are chosen or demand runs out."""
        chosen: List[BucketKey] = []
        extra: Counter = Counter()
        while len(chosen) < capacity:
            progressed = False
            for key in self.keys:
                if len(chosen) >= capacity:
                    break
                if self.demand(key) - extra[key] > 0:
                    chosen.append(key)
                    extra[key] += 1
                    progressed = True
            if not progressed:
                break
        return chosen

    def record(self, key: BucketKey, result: dict) -> Optional[BucketKey]:
        """Fold one worker result in. Returns the bucket that accepted the
        record, or None."""
        status = result.get("status")
        if status == "error":
            self.errors.append((key, result.get("detail", "")))
            return None
        if status != "ok":
            self.rejections[key][result.get("reason", "unknown")] += 1
            return None

        record = result["record"]
        sig = canonical_signature(record["puzzle"])
        if sig in self.signatures:
            self.duplicates += 1
            self.rejections[key]["duplicate"] += 1
            return None

        actual = record["metadata"]["actual_difficulty"]
        size, difficulty, tier = key
        target: Optional[BucketKey] = None
        if actual == difficulty and len(self.accepted[key]) < self.count_per_bucket:
            target = key
        else:
            # A near miss is still a good puzzle for the neighbouring bucket,
            # but only the neighbouring one: routing anything anywhere is how
            # buckets filled with puzzles nobody asked for.
            alt = (size, actual, tier)
            if (
                alt in self.accepted
                and abs(DIFFICULTY_ORDER.index(actual) - DIFFICULTY_ORDER.index(difficulty)) <= 1
                and len(self.accepted[alt]) < self.count_per_bucket
            ):
                target = alt
        if target is None:
            self.rejections[key][f"off-target:{actual}"] += 1
            return None

        self.signatures.add(sig)
        self.accepted[target].append(record)
        return target

    def records(self) -> List[dict]:
        out: List[dict] = []
        for key in self.keys:
            out.extend(self.accepted[key])
        return out

    def shortfall(self) -> Dict[BucketKey, int]:
        return {
            k: self.count_per_bucket - len(v) for k, v in self.accepted.items() if len(v) < self.count_per_bucket
        }


def run_batch(
    sizes,
    difficulties,
    operations_tiers,
    count_per_bucket,
    workers,
    output_path,
    max_attempts,
    max_difficulty_attempts,
    max_time: Optional[float] = None,
    grace: float = 5.0,
    worker: Callable[[Task], dict] = generate_one_puzzle,
) -> BucketPlan:
    """Generate puzzles in parallel, filling each bucket to the target count.

    Returns the plan so callers can inspect the shortfall; the records are
    also written to `output_path` atomically.
    """
    keys: List[BucketKey] = [
        (size, difficulty, tier) for size in sizes for difficulty in difficulties for tier in operations_tiers
    ]
    plan = BucketPlan(keys, count_per_bucket)
    start_time = time.time()
    deadline_at = start_time + max_time if max_time else None

    logger.info(
        f"Generating {len(keys) * count_per_bucket} puzzles across {len(keys)} buckets ({count_per_bucket} each)"
    )
    logger.info(f"Sizes: {sizes}, Difficulties: {difficulties}, Tiers: {list(operations_tiers)}")
    logger.info(f"Workers: {workers}" + (f", time limit {max_time}s (+{grace}s grace)" if max_time else ""))

    results: "queue.Queue[Tuple[BucketKey, dict]]" = queue.Queue()
    in_flight = 0
    capacity = workers * 2
    accepted_total = 0
    timed_out = False

    pool = mp.Pool(processes=workers)
    try:

        def submit() -> None:
            nonlocal in_flight
            for key in plan.next_submissions(capacity - in_flight):
                size, difficulty, tier = key
                task = Task(size, difficulty, tier, max_attempts, max_difficulty_attempts, deadline_at)
                pool.apply_async(
                    worker,
                    (task,),
                    callback=lambda res, key=key: results.put((key, res)),
                    error_callback=lambda exc, key=key: results.put(
                        (key, {"status": "error", "detail": f"worker raised {exc!r}"})
                    ),
                )
                plan.pending[key] += 1
                in_flight += 1

        def drain_one(timeout: float) -> bool:
            """Wait, bounded, for one result and fold it in. False on timeout."""
            nonlocal in_flight, accepted_total
            try:
                key, res = results.get(timeout=timeout)
            except queue.Empty:
                return False
            in_flight -= 1
            plan.pending[key] -= 1
            if plan.record(key, res) is not None:
                accepted_total += 1
                total_target = len(keys) * count_per_bucket
                if accepted_total % 10 == 0 or accepted_total == total_target:
                    filled = sum(1 for v in plan.accepted.values() if len(v) >= count_per_bucket)
                    elapsed = time.time() - start_time
                    logger.info(
                        f"Progress: {accepted_total}/{total_target} puzzles "
                        f"({filled}/{len(keys)} buckets full) [{accepted_total / max(elapsed, 1e-9):.2f}/s]"
                    )
            return True

        submit()
        while in_flight > 0:
            if deadline_at is not None:
                remaining = deadline_at - time.time()
                if remaining <= 0:
                    timed_out = True
                    logger.warning(f"Time limit of {max_time}s reached; stopping submissions")
                    break
                wait = min(1.0, remaining)
            else:
                wait = 1.0
            # Bounded wait: wake on a result or after `wait`, then re-check the clock
            if not drain_one(wait):
                continue
            if plan.complete():
                break
            submit()

        if in_flight > 0:
            # Cooperative phase: workers see the same deadline and abandon their
            # current attempt on their own. Give them `grace` seconds to do so.
            grace_until = time.time() + grace
            while in_flight > 0 and time.time() < grace_until:
                drain_one(min(0.25, max(0.0, grace_until - time.time())) or 0.01)
            if in_flight > 0:
                logger.warning(f"{in_flight} worker task(s) still running after {grace}s grace; terminating")
                pool.terminate()
            else:
                pool.close()
        else:
            pool.close()
    except BaseException:
        pool.terminate()
        raise
    finally:
        pool.join()

    elapsed = time.time() - start_time
    logger.info(f"Generation {'stopped at the time limit' if timed_out else 'complete'} in {elapsed:.1f}s")

    for key in keys:
        size, difficulty, tier = key
        n = len(plan.accepted[key])
        status = "OK" if n >= count_per_bucket else "SHORT"
        rej = ", ".join(f"{r}={c}" for r, c in plan.rejections[key].most_common(4))
        logger.info(f"  {size}x{size} {difficulty:8s} {tier:8s}: {n}/{count_per_bucket} [{status}]" + (f"  rejected: {rej}" if rej else ""))
    if plan.duplicates:
        logger.info(f"Duplicates discarded: {plan.duplicates}")
    if plan.errors:
        logger.warning(f"{len(plan.errors)} worker error(s); first:\n{plan.errors[0][1]}")

    write_records_atomically(plan.records(), output_path)
    return plan


def write_records_atomically(records: List[dict], output_path) -> None:
    """Write next to the destination, then rename, so an interrupted run can
    never leave a half-written corpus at the path the app ships."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=output_path.parent, prefix=output_path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            for record in records:
                f.write(json.dumps(record) + "\n")
        os.replace(tmp, output_path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    logger.info(f"Wrote {len(records)} puzzles to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Batch generate Arithmatrix puzzles")
    parser.add_argument("--sizes", default="4,5,6,7", help="Comma-separated grid sizes (default: 4,5,6,7)")
    parser.add_argument(
        "--difficulties",
        default=",".join(VALID_DIFFICULTIES),
        help="Comma-separated difficulties (default: all)",
    )
    parser.add_argument(
        "--operations-tiers",
        default="all",
        help="Comma-separated operation tiers: add, add-sub, no-div, all (default: all)",
    )
    parser.add_argument("--count", type=int, default=50, help="Puzzles per bucket (default: 50)")
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
    parser.add_argument("--max-attempts", type=int, default=500, help="Max cage carving attempts per puzzle (default: 500)")
    parser.add_argument(
        "--max-difficulty-attempts", type=int, default=50, help="Max candidates per task to hit target difficulty (default: 50)"
    )
    parser.add_argument(
        "--max-time", type=float, default=None, help="Stop submitting work after this many seconds (default: unlimited)"
    )
    parser.add_argument(
        "--grace", type=float, default=5.0, help="Seconds after --max-time before running work is terminated (default: 5)"
    )

    args = parser.parse_args()

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

    if args.count < 1 or args.workers < 1 or args.max_attempts < 1 or args.max_difficulty_attempts < 1:
        parser.error("--count, --workers, --max-attempts and --max-difficulty-attempts must be positive")

    plan = run_batch(
        sizes=sizes,
        difficulties=difficulties,
        operations_tiers=tiers,
        count_per_bucket=args.count,
        workers=args.workers,
        output_path=args.output,
        max_attempts=args.max_attempts,
        max_difficulty_attempts=args.max_difficulty_attempts,
        max_time=args.max_time,
        grace=args.grace,
    )
    if plan.shortfall():
        sys.exit(2)


if __name__ == "__main__":
    main()
