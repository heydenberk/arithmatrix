import json
import time

import pytest

from backend.generate_batch import BucketPlan, Task, canonical_signature, run_batch
from tests.backend.fixtures import all_singles_4x4


def _ok(actual="easiest", puzzle=None):
    puzzle = puzzle or all_singles_4x4()
    return {
        "status": "ok",
        "record": {
            "puzzle": {"size": puzzle["size"], "cages": puzzle["cages"], "solution": puzzle["solution"]},
            "metadata": {"actual_difficulty": actual, "operations_tier": "all", "size": puzzle["size"]},
        },
    }


KEYS = [(4, "easiest", "all"), (4, "easy", "all"), (4, "hard", "all")]


def test_demand_subtracts_pending_work():
    plan = BucketPlan(KEYS, count_per_bucket=2)
    assert plan.demand(KEYS[0]) == 2
    plan.pending[KEYS[0]] = 2
    assert plan.demand(KEYS[0]) == 0
    assert plan.next_submissions(10) == [KEYS[1], KEYS[2], KEYS[1], KEYS[2]]


def test_submissions_round_robin_and_respect_capacity():
    plan = BucketPlan(KEYS, count_per_bucket=3)
    assert plan.next_submissions(4) == [KEYS[0], KEYS[1], KEYS[2], KEYS[0]]


def test_duplicates_are_discarded():
    plan = BucketPlan(KEYS, count_per_bucket=5)
    assert plan.record(KEYS[0], _ok()) == KEYS[0]
    assert plan.record(KEYS[0], _ok()) is None
    assert plan.duplicates == 1 and len(plan.accepted[KEYS[0]]) == 1


def test_off_target_routes_only_to_the_neighbouring_bucket():
    plan = BucketPlan(KEYS, count_per_bucket=5)
    # Asked for easiest, got easy: one level away, accepted into easy
    assert plan.record(KEYS[0], _ok(actual="easy")) == KEYS[1]
    # Asked for easiest, got hard: two levels away, dropped even though hard wants records
    p = all_singles_4x4()
    p["cages"][0]["value"] = 99  # different signature
    assert plan.record(KEYS[0], _ok(actual="hard", puzzle=p)) is None
    assert plan.rejections[KEYS[0]]["off-target:hard"] == 1


def test_errors_and_rejections_are_kept_apart():
    plan = BucketPlan(KEYS, count_per_bucket=1)
    plan.record(KEYS[0], {"status": "error", "detail": "Traceback..."})
    plan.record(KEYS[0], {"status": "rejected", "reason": "exhausted"})
    assert len(plan.errors) == 1
    assert plan.rejections[KEYS[0]]["exhausted"] == 1


def test_canonical_signature_ignores_cage_and_cell_order():
    a = all_singles_4x4()
    b = all_singles_4x4()
    b["cages"].reverse()
    assert canonical_signature(a) == canonical_signature(b)


# --- process pool ---------------------------------------------------------- #


def sleep_forever(task: Task) -> dict:
    time.sleep(3600)
    return {"status": "rejected", "reason": "unreachable"}


def instant_easiest(task: Task) -> dict:
    # Unique per call so dedupe does not swallow them
    p = all_singles_4x4()
    p["cages"][0]["value"] = p["cages"][0]["value"]  # keep valid
    res = _ok(actual=task.difficulty, puzzle=p)
    res["record"]["metadata"]["nonce"] = time.time_ns()
    # Make the signature unique by appending a cage marker in the value space
    res["record"]["puzzle"]["cages"] = [dict(c) for c in p["cages"]]
    res["record"]["puzzle"]["cages"][-1] = dict(res["record"]["puzzle"]["cages"][-1], value=time.time_ns() % 10_000_000)
    return res


def test_run_batch_returns_within_max_time_plus_grace_when_workers_never_finish(tmp_path):
    t = time.time()
    plan = run_batch(
        sizes=[4],
        difficulties=["easiest"],
        operations_tiers=["all"],
        count_per_bucket=1,
        workers=1,
        output_path=tmp_path / "out.jsonl",
        max_attempts=1,
        max_difficulty_attempts=1,
        max_time=1.0,
        grace=1.0,
        worker=sleep_forever,
    )
    elapsed = time.time() - t
    assert elapsed < 8.0, f"took {elapsed:.1f}s"
    assert plan.shortfall() == {(4, "easiest", "all"): 1}
    assert (tmp_path / "out.jsonl").exists()


def test_run_batch_fills_buckets_and_writes_atomically(tmp_path):
    out = tmp_path / "out.jsonl"
    plan = run_batch(
        sizes=[4],
        difficulties=["easiest", "easy"],
        operations_tiers=["all"],
        count_per_bucket=2,
        workers=2,
        output_path=out,
        max_attempts=1,
        max_difficulty_attempts=1,
        max_time=30.0,
        worker=instant_easiest,
    )
    assert plan.shortfall() == {}
    lines = out.read_text().splitlines()
    assert len(lines) == 4
    assert all(json.loads(line)["metadata"]["actual_difficulty"] in ("easiest", "easy") for line in lines)
    assert not list(tmp_path.glob("*.tmp"))
