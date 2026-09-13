# Puzzle Generation Review

Analysis of the backend generation pipeline for defects and performance, 2026-09-13.
No code was changed as part of this review; this is the findings and the plan.

## Scope and method

Read `backend/arithmatrix.py`, `backend/latin_square.py`, `backend/puzzle_generator.py`,
`backend/generate_batch.py`, and the relevant parts of `backend/solver.py` and
`backend/app.py`. Profiled each pipeline stage in isolation, measured the heuristic
filter across every size x target, and cross-checked against the shipped corpus
metadata in `public/all_puzzles.jsonl`.

Caveats:

- The frontend never calls the Flask API (no `/api` references in `src/`), so
  `app.py` defects are latent.
- Timings are single-machine Python; useful for ratios rather than absolutes.

### Pipeline as it stands

```
latin_square pool -> weighted_partition_sample -> carve_square -> assign_operations
  -> estimate_difficulty_fast filter -> solve_puzzle (which runs count_solutions)
  -> generate_batch runs count_solutions again
```

### Stage profile, one 7x7 expert candidate

| stage                | time        |
|----------------------|-------------|
| partition            | 0.06 ms     |
| carve                | 38.9 ms     |
| estimate (heuristic) | 0.09 ms     |
| `solve_puzzle`       | 22,976 ms   |
| `count_solutions`    | 22,167 ms   |

That candidate was non-unique. Of 30 expert candidates: 16 valid, 7 hit target,
56.5 s total solving. End-to-end `generate_arithmatrix_puzzle(7, 'expert')` over
three runs: 828 ms, 2236 ms, 10777 ms.

### Corpus `generation_time` (seconds), per size x difficulty

| bucket        | p50  | p90  | max   |
|---------------|------|------|-------|
| 4x4 (all)     | ~0.0 | ~0.2 | 0.4   |
| 5x5 (all)     | 0.2  | 0.3  | 0.8   |
| 6x6 easiest   | 0.9  | 1.4  | 2.1   |
| 6x6 expert    | 1.2  | 2.5  | 15.3  |
| 7x7 easiest   | 3.1  | 4.1  | 145.1 |
| 7x7 easy      | 3.2  | 5.4  | 13.0  |
| 7x7 medium    | 3.5  | 6.3  | 29.2  |
| 7x7 hard      | 4.2  | 9.1  | 28.2  |
| 7x7 expert    | 6.5  | 23.6 | 110.5 |

## Defects, by severity

### 1. Fallback path drops `techniques_used`

`backend/arithmatrix.py:524-530`. The "last resort" branch sets `actual_difficulty`
and `difficulty_score` but never `techniques_used`, unlike the main loop at `:502`.
This is the root cause of the 2696/4000 corpus records with empty technique data.
On its own a minor omission, but defect 2 forces most buckets down this path.

### 2. `estimate_difficulty_fast` makes many buckets unreachable

`backend/solver.py:1066`: `base = {4: 40, 5: 50, 6: 60, 7: 70}`, so a 7x7 starts at
70 ("hard") before any adjustment. The filter at `arithmatrix.py:480` rejects
anything more than one level from target.

Measured pass rate, 40 basic puzzles per cell:

| size | easiest | easy | medium | hard | expert |
|------|---------|------|--------|------|--------|
| 4x4  | 15%     | 85%  | 100%   | 98%  | 52%    |
| 5x5  | **0%**  | 15%  | 52%    | 100% | 98%    |
| 6x6  | **0%**  | **0%** | 8%   | 100% | 100%   |
| 7x7  | **0%**  | **0%** | **0%** | 100% | 100% |

For 7x7 the heuristic rates 100% of candidates "expert": it passes everything for
hard/expert (zero filtering value) and rejects everything for easiest/easy/medium.
Every 7x7 easiest/easy/medium puzzle in the corpus came from the fallback,
unfiltered, with no technique data. The filter only ever does harm.

### 3. `backend/app.py:87` imports a function that does not exist

`from .arithmatrix import _get_difficulty_range` - no such symbol anywhere in the
backend. Any `GET /puzzle` with `ALL_PUZZLES` loaded raises `ImportError` inside the
`try` and falls through to the generic handler. Latent because the app does not use
the API, but the "serve from database" branch has never worked.

### 4. Uniqueness is verified two to three times per candidate

`solve()` at `solver.py:926` already calls `count_solutions(puzzle, 2)`;
`generate_batch.py:72` calls it again on the result. On a non-unique candidate
(16/30 in the profile) the deduction trace at `solver.py:918-922` also runs its own
`_backtrack(1)` to complete a grid that is then thrown away. Roughly 2x the
necessary work on the hottest path.

### 5. `count_solutions` is a naive backtracker

`solver.py:985-1012`: fixed row-major cell order, row/col bitmasks only, cage check
deferred until the cage's last cell in scan order, `cage_satisfied` rebuilds a value
list per call. This is why 22 s on a 7x7 is possible and why the corpus tail reaches
145 s.

### 6. Latin-square pool: per-worker startup cost and mild 4x4 bias

Warm `get_latin_square` costs 0.025 ms for any size versus 0.5-1.1 ms for a fresh
square, so the pool does pay for itself per draw (an earlier measurement in this
review that said otherwise was wrong). The remaining costs are structural: with
`spawn` as the multiprocessing start method (confirmed on this platform), each
worker builds its own pool (~220 ms per size) at import, and the pool holds 500
squares while a 4x4 has only 576 in total.

Corpus effect: the 1000 4x4 puzzles share 367 distinct solution grids; 1000 pooled
draws produce 394 distinct squares where a uniform draw would give ~475. A mild
bias, not a diversity problem. There is one exact duplicate puzzle (zero-based
lines 751 and 773). 6x6 and 7x7 are 1000/1000 distinct.

### 7. `assign_operations` is deterministic

`arithmatrix.py:223+`: priority division > subtraction > multiplication > addition;
division only when the quotient is 1-2 (or 2-3 when a cell is 1). Given the same
cage values you always get the same operation, so the op mix is dictated by the
Latin square rather than by design, and small quotients dominate.

### 8. `generate_batch` targeting is weak

Submits at most 2 tasks per bucket per pass, polls with `sleep(0.05)` (`:168`), and
drops off-target results into whatever `alt_key` bucket has room (`:202-204`).
Combined with defect 2, hard buckets fill with whatever lands rather than what was
asked for.

### 9. Minor

- `backend/puzzle_generator.py` (`KenkenGenerator`) is dead code, referenced only
  from its own `__main__`.
- `_max_single_cages` docstring (`arithmatrix.py:557`) claims 1/2/3/4 for sizes
  4-7 but the function returns 2/2/4/5.
- `zip(string.ascii_uppercase, partition)` at `arithmatrix.py:583` would silently
  truncate a partition with more than 26 cages. Measured over 3000 samples per
  difficulty the max was exactly 26, so this is a latent edge, not a live bug.

## Performance plan, in order of payoff

1. **Restructure the per-candidate pipeline around cost.** Cheap stages first, the
   expensive one once: generate -> `count_solutions(puzzle, 2)` once -> reject
   non-unique -> `solve(verify_uniqueness=False)` for the trace and score. Removes
   the duplicate count and skips the trace on the ~50% of candidates that are
   non-unique. Expected to roughly halve wall time with no behaviour change.

2. **Make `count_solutions` smarter.** MRV cell ordering (fewest legal values from
   the bitmasks), partial cage feasibility as cells fill (running sum/product
   bounds, not only at the last cell), per-cage value tuples precomputed once. This
   is the 22 s stage; 5-20x is realistic and cuts the 100 s+ tail.

3. **Delete the heuristic filter**, or replace it with something calibrated on the
   corpus (a small regression on gimme ratio / cage sizes / op mix against actual
   `difficulty_score`, validated per size). Deleting it strictly improves outcomes:
   hard/expert lose nothing, easy buckets get real filtering instead of the fallback.

4. **Fix the fallback** to record `techniques_used`, and make it rare by relying on
   the main loop's best-distance candidate.

5. **Make the pool lazy per process** (it is fast once warm; the cost is the
   eager per-worker init) and dedupe on canonical cage signature in
   `generate_batch`.

6. **Randomise `assign_operations`** with difficulty-conditioned weights: easier
   tiers favour + and small x; harder tiers allow larger quotients and 3-cell x.
   Makes the op-tier filter meaningful and stops values dictating ops.

7. **`generate_batch`:** submit a full work queue per bucket, use `as_completed`
   instead of sleep-polling, accept off-target results only within one level and
   only when the bucket is genuinely short.

8. **Housekeeping:** delete `puzzle_generator.py`, fix or remove the `app.py:87`
   database branch, fix the `_max_single_cages` docstring, assert
   `len(partition) <= 26`.

## Suggested sequencing

- Items 1, 4 and 8 are small, safe and independent: one PR.
- Item 2 is the real performance work. It needs a benchmark harness (the stage
  profile script from this review) plus `scripts/validate_puzzles.py` as the
  correctness oracle.
- Items 3, 5 and 6 change the distribution of generated puzzles, so they belong
  with a corpus regeneration. That lines up with the outstanding v1 blockers:
  absolute cross-size `difficulty_score`, technique metadata for every record, and
  a cache-busting corpus filename.
