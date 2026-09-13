# Puzzle Generation: Synthesis of the Two Reviews

Date: 2026-09-13. Status: analysis and plan only; no generator, solver, app or
corpus changes.

Two independent reviews of the generation pipeline were written on the same day:

- **Review A** - `docs/GENERATION_REVIEW.md`. Narrow scope: defects and
  performance of the Python pipeline as it stands. Evidence is stage profiling of
  fresh candidates and a heuristic pass-rate sweep over every size x target.
- **Review B** - `docs/PUZZLE_GENERATION_REVIEW_AND_PLAN.md`. Broad scope: the
  same pipeline plus its consumers, the two scoring implementations (Python and
  TypeScript), batch lifecycle, corpus validation and test coverage. Recommends a
  shared TypeScript engine and a Node batch runner.

This document reconciles them. Where they disagreed, the disagreement was
re-checked against the code or re-measured before being resolved here.

## 1. Findings both reviews reached independently

These are the highest-confidence items; two different methods arrived at the same
conclusion.

| Finding | A's evidence | B's evidence |
|---|---|---|
| The fast difficulty heuristic (`solver.py:1024`, gate at `arithmatrix.py:480`) rejects the puzzles it should accept | 0% of fresh 7x7 easiest/easy/medium candidates pass; 100% of hard/expert pass (no filtering value either way) | 200/200 of the *shipped* 7x7 easiest and easy records would be rejected if re-submitted with their own difficulty as target |
| The last-resort fallback (`arithmatrix.py:524-530`) returns incomplete metadata | Omits `techniques_used`; root cause of 2696/4000 empty records | Same, plus: it returns even when `stats.is_valid` is false (see 2.1) |
| `app.py:87` imports `_get_difficulty_range`, which does not exist | Static: no such symbol in the backend | Dynamic: `/api/puzzle?size=4&difficulty=medium` returned HTTP 500 |
| Uniqueness search is the dominant cost and is run redundantly | `solve_puzzle` 23.0 s + `count_solutions` 22.2 s on one 7x7 candidate; `solve()` already counts internally, batch counts again | 7x7 uniqueness median 122 ms, max 2.45 s across 80 corpus records; profiling puts the counter's recursion and cage checks at the top |
| `count_solutions` (`solver.py:985-1012`) is a plain backtracker: fixed row-major order, weak partial cage checks | Same reading | Same reading, plus specific pruning proposals |
| `_max_single_cages` docstring says 1/2/3/4, code returns 2/2/4/5 | Docstring vs code | 622 of 4000 corpus records exceed the *documented* cap |
| One exact duplicate puzzle in the corpus | Zero-based lines 751 and 773 | One-based lines 752 and 774 (same pair) |
| `zip(string.ascii_uppercase, partition)` at `arithmatrix.py:583` silently drops cages beyond 26 | Latent under current weights: max seen was exactly 26 in 3000 samples per difficulty | Reachable: a permitted 22x2-cell + 5x1-cell 7x7 partition (27 cages) loses a cell; one 8x8 API request (seed 333) covered only 60 of 64 cells on its first attempt |
| `KenkenGenerator` in `puzzle_generator.py` is dead code | No callers outside its own `__main__` | Same |
| `generate_batch` targeting is weak: <=2 submissions per bucket per pass, sleep-poll, off-target results dumped into `alt_key` buckets | Same reading | Same, plus pending demand is never subtracted from `needed` (`generate_batch.py:145`) |

## 2. Findings unique to one review

### 2.1 Found by B, verified here

- **The fallback can return a non-unique puzzle.** `arithmatrix.py:527-529` sets
  `actual_difficulty = "unknown"` when `stats.is_valid` is false and returns anyway.
  The batch runner's second `count_solutions` is currently the only thing keeping
  these out of the corpus (the corpus has zero `unknown` records, 4000/4000 `v3`).
  This changes the framing of the redundant check: it is redundant *only once the
  fallback is fixed*. A's plan item 1 must be sequenced after that.
- **Batch deadlines do not stop work.** `generate_batch.py:159-215`: when no future
  is done, the loop `sleep`s and `continue`s *before* reaching the `max_time` check,
  so a stuck worker set never times out; `future.result(timeout=5)` runs only after
  `done()` is true so the timeout bounds nothing; and leaving the executor
  context waits for every outstanding future rather than cancelling.
- **Pending work is not counted as demand.** `needed = count_per_bucket -
  len(results)` ignores futures already in flight for that bucket, so full buckets
  keep receiving work whose output is thrown away.
- **NumPy is not in `backend/requirements.txt`** (Flask and python-dotenv only) while
  `arithmatrix.py` and `latin_square.py` import it.

### 2.2 Found by B, not re-verified here, taken as reported

- **Python and TypeScript disagree on difficulty for 30 of 80 sampled puzzles**,
  e.g. corpus line 1501: Python medium/40.0, browser expert/87.2. One identified
  cause: Python restarts the cheap-technique cascade after the first hidden single;
  TypeScript keeps scanning for hidden singles and charges the higher weight for
  cells a naked single would have handled. This is the single most consequential
  finding in either review, because the app's hint engine, Times tab and gallery
  labels all sit on the TypeScript side while the stored ratings come from Python.
- `weighted_partition_sample` raises `ZeroDivisionError` on an all-zero-weight
  remainder (helper contract; not reachable with the built-in profiles).
- The `count_solutions` cell-to-cage map silently overwrites overlapping cages and
  treats uncovered cells as unconstrained, so it cannot substitute for structural
  validation (demonstrated with constructed 2x2 fixtures).
- Broad `except Exception` in the generator loop and `None`-swallowing in workers
  make programming errors look like ordinary rejections.

### 2.3 Found by A, verified here

- **Heuristic pass-rate matrix on fresh candidates** (40 per cell). B measured the
  filter against corpus survivors; A measured it against what the generator
  actually produces, which is the stronger form of the evidence since survivors
  are biased toward whatever the filter let through:

  | size | easiest | easy | medium | hard | expert |
  |------|---------|------|--------|------|--------|
  | 4x4  | 15%     | 85%  | 100%   | 98%  | 52%    |
  | 5x5  | 0%      | 15%  | 52%    | 100% | 98%    |
  | 6x6  | 0%      | 0%   | 8%     | 100% | 100%   |
  | 7x7  | 0%      | 0%   | 0%     | 100% | 100%   |

- **`assign_operations` is deterministic** (`arithmatrix.py:223+`): fixed priority
  division > subtraction > multiplication > addition; division only for quotients
  1-2 (2-3 when a cell is 1). The operation mix is a function of the Latin square,
  not a design choice, and the op-tier filter can only remove ops, never shape them.
- **Candidate-level timing vs corpus-level timing.** A's 22 s uniqueness search
  was on a rejected 7x7 candidate; B's 2.45 s max was on accepted corpus records.
  Both are right. Accepted puzzles are the ones that were cheap to prove; the
  generation budget is spent on the candidates that were not. Corpus
  `generation_time` bears this out: 7x7 expert p50 6.5 s, p90 23.6 s, max 110 s;
  7x7 easiest max 145 s. Any benchmark for this work has to be measured on
  candidates, not on the corpus.

### 2.4 Where A was wrong

A originally reported the Latin-square pool as slower than fresh generation
(1.2 ms vs 0.65 ms). Re-measured: warm `get_latin_square` is 0.025 ms for every
size, fresh is 0.5-1.1 ms. B's figure was correct and A's document has been
corrected. The pool already initialises lazily on first use. What survives of the
finding: under `spawn` each worker process pays ~220 ms per size on its first
draw (once per worker, negligible over a long batch), and 4x4 draws are mildly
biased (394 distinct squares from 1000 draws vs ~475 expected uniform; only 576
exist). Low priority.

## 3. The strategic disagreement

A proposes incremental fixes to the Python pipeline: reorder the per-candidate
stages, rewrite `count_solutions`, delete the heuristic, randomise operations, fix
the batch loop. B proposes making `src/utils/solver.ts` the single canonical engine
for scoring, hints, playback and generation, porting cage construction and the
batch coordinator to Node, and retiring Python.

**Resolution: B's direction, with A's cheap fixes folded into B's Phase 1.**
The reasons:

1. **The drift finding decides it.** Two engines already disagree on 30/80 ratings
   and the app is built on the TypeScript one. Every hour spent making the Python
   scorer faster is an hour spent on the engine that produces the labels the app
   disagrees with. The corpus has to be re-scored with whichever engine the app
   uses; that engine should also be the one that generates.
2. **Most of the port already exists.** `solver.ts` is 2326 lines with
   `countSolutions`, `solveToStall`, `solveWithTrace` and the full technique set;
   `tsx` is already a dependency and `scripts/` already holds TypeScript analysis
   tools. What remains is `latin_square.py` (158 lines), partition/carve/ops
   (~400 lines of `arithmatrix.py`) and a batch coordinator (~330 lines).
3. **A's performance items are not lost, they move.** Count-first candidate
   ordering, MRV and incremental cage bounds in the counter, and lazy pool init
   are all language-neutral and belong in the Node worker (B's Phase 4).
4. **A's correctness items are cheap enough to do in Python now**, because Python
   remains the only generator until Phase 3 lands, and any corpus top-up before
   then should not go through the broken fallback.

The one place B's caution overrides A's plan: do **not** remove the batch runner's
second `count_solutions` until every generator return is guaranteed unique
(Section 2.1). Count-first ordering achieves both at once - every return has
passed the counter by construction - so it is the preferred form of the fix.

## 4. Reconciled defect list, by severity

| # | Defect | Location | Source | Verified |
|---|---|---|---|---|
| 1 | Fallback returns non-unique puzzles and incomplete metadata | `arithmatrix.py:524-530` | A+B | yes |
| 2 | Heuristic filter makes easy buckets unreachable at 6x6/7x7, filters nothing at hard/expert | `solver.py:1066`, `arithmatrix.py:480` | A+B | yes |
| 3 | Python/TypeScript difficulty drift, 30/80 | `solver.py:356`, `solver.ts:626` | B | as reported |
| 4 | Redundant uniqueness proofs; trace completes grids that are then discarded | `solver.py:918-926`, `generate_batch.py:72` | A+B | yes |
| 5 | Batch deadline unenforceable; pending demand ignored; no cancellation | `generate_batch.py:145,159-215` | B | yes |
| 6 | `count_solutions` naive ordering and pruning | `solver.py:985-1012` | A+B | yes |
| 7 | `app.py:87` missing import; op policy not forwarded; sizes 3-8 accepted | `app.py:78-96` | A+B | yes |
| 8 | 26-cage truncation; no structural validation before counting | `arithmatrix.py:583` | A+B | yes |
| 9 | Deterministic `assign_operations` | `arithmatrix.py:223+` | A | yes |
| 10 | Single-cell cap docstring vs code (2/2/4/5) | `arithmatrix.py:554-560` | A+B | yes |
| 11 | No dedupe, no checkpointing, non-atomic write to the shipped corpus path | `generate_batch.py` | B | yes (by reading) |
| 12 | NumPy missing from requirements | `backend/requirements.txt` | B | yes |
| 13 | Dead `KenkenGenerator`; broad exception swallowing; zero-weight partition edge | various | A+B | yes / as reported |

## 5. Unified plan

### Phase 0 - Python triage (small, ships independently)

Keeps the existing generator safe to run for any corpus top-up before the port.

1. Fallback: never return a puzzle that has not passed the acceptance test
   below; always record `techniques_used`; make exhaustion an explicit failure.
   (A item 4, B Phase 1.4-1.5)
2. Reorder per-candidate stages to count-first: carve -> `count_solutions(…, 2)` ->
   reject unless exactly 1 -> `solve(verify_uniqueness=False)` for the trace and
   score. **Acceptance = (`count_solutions` returned 1) AND (the trace completed
   to a grid equal to the stored solution).** `solve(verify_uniqueness=False)`
   deliberately reports `is_valid=False` and `solution_count=0` even for a unique
   puzzle, so every existing `if not stats.is_valid` gate (`arithmatrix.py:489`,
   the fallback, `generate_batch.generate_one_puzzle`) must be rewritten against
   the separate count result; left as-is they would reject every candidate. This
   removes one of the two full uniqueness searches per candidate - about 2x on the
   one profiled 7x7 candidate, unmeasured in aggregate - and makes the batch
   runner's second count redundant by construction. (A item 1, B Phase 4.3,
   sequenced per Section 3)
3. Delete the heuristic gate. Both reviews agree; no replacement until a
   candidate-level false-rejection measurement exists. (A item 3, B Phase 2.6)
4. Batch loop: monotonic deadline checked every iteration; **bounded waits**
   (`as_completed(..., timeout=)` or `wait(..., timeout=)` with the deadline
   remainder, never an unbounded wait); subtract pending from demand; on exit
   `shutdown(cancel_futures=True)` for queued work **and** a deadline passed into
   `generate_one_puzzle` so running attempts stop themselves - cancelling a
   running future does not stop it. A deadline checked only between attempts is
   not enough either: a single `count_solutions` or `solve` call can run for
   tens of seconds (Section 2.3) and neither loop checks the clock today
   (`grep deadline backend/` finds nothing). So the bound has two layers:
   **cooperative** - the deadline is threaded into `count_solutions.recurse`
   and `_run_logic_loop`/`_backtrack`, checked every N nodes, raising a
   `Deadline` exception that the attempt loop treats as a rejection; and
   **coercive** - after the deadline the coordinator waits a fixed grace period
   (proposed 5 s), then terminates worker processes that are still running
   (`ProcessPoolExecutor` has no kill; use `multiprocessing.Pool.terminate()` or
   track worker PIDs) and reports the bucket shortfall. Total wall time is
   therefore bounded by `max_time + grace`, independent of worker behaviour.
   Dedupe on canonical cage signature. Tests: (a) a stub worker that sleeps
   forever - control returns within `max_time + grace`, completed records are
   preserved; (b) a real 7x7 expert attempt started 1 s before the deadline -
   the cooperative check aborts it and the run finishes without reaching the
   grace period. (A item 7, B 5 + maintenance items)
5. Housekeeping: numeric cage ids with an explicit coverage assertion, add NumPy
   to requirements, fix or delete the `app.py` database branch, fix the
   `_max_single_cages` docstring (see decision 2), delete `puzzle_generator.py`.

### Phase 1 - Canonical TypeScript engine (B Phase 2)

*Status (2026-09-13): shipped.* `src/utils/difficulty.ts` holds the model
(weights, `bottleneckRaw`, quantiles, `normalizeScore`, `difficultyLevel`,
`SCORING_VERSION = 2`); `src/utils/puzzleValidation.ts` mirrors
`backend/validation.py`; `solver.ts` re-exports both. The engine already had
no React or DOM imports, so the split is by concern, not by runtime.
Scheduling is now cheapest-first restart after every single deduction
(decision 3): naked and hidden singles return after one placement,
`processCagesByStrength` after one cage, and `recordStep` no longer re-runs the
cheap techniques from inside a dearer one. `SolveOptions.mode: 'score'` skips
per-step snapshots and the worked cage explanations; `scorePuzzle()` and
`assessPuzzle()` (structure -> count -> rate, mirroring
`evaluate_candidate`) are the new entry points. `SolverResult` carries
`solved` and `scoringVersion`. Fixtures: `src/utils/__fixtures__/scoring-v2.json`
pins counts and raw score for one corpus puzzle per size x band
(`scripts/pin-scoring-fixtures.ts` regenerates it); `solver.parity.test.ts`
holds score mode to trace mode and both to the pins. Measured on every fifth
corpus record (800): 76% keep their stored band under version 2, 177 read
easier, 13 harder - the expected direction, since the change charges the
cheaper technique; score mode is 1.6x faster than the trace; parity failures 0.
All 83 hint tests pass unchanged.

1. Split `solver.ts` into engine / difficulty model / presentation adapters so
   the engine runs without React, DOM or Node-only imports.
2. Settle the deduction scheduling policy (decision 3 below), implement it once,
   add fixtures that pin technique counts and raw scores, not just final grids.
3. Add a score-only mode that skips description and snapshot construction; assert
   parity with the trace mode on counts and grid.
4. Keep `countSolutions` as a separate proof, behind structural validation.
5. Introduce an explicit scoring version in metadata.

### Phase 2 - Node generation and batch (B Phase 3)

*Status (2026-09-13): shipped.* `src/generation/` holds the pure, seeded
pipeline - `rng.ts` (SplitMix32 + `mixSeed`), `latinSquare.ts` (isotopy
moves, no pool), `partition.ts` (weights and the 2/2/4/5 singles cap as an
explicit table: JS `Math.round(2.5)` is 3 where Python's is 2), `carve.ts`
(numeric ids), `operations.ts` (randomised, difficulty-conditioned: pair
weights for + - * /, product chance and product cap by tier), `generate.ts`
(`generatePuzzle` -> `assessPuzzle`; nothing returned that has not passed it),
`bucketPlan.ts` and `coordinator.ts` (IO-free; runner injected). Node-only
code is under `scripts/generation/` (worker via a tsx bootstrap, worker pool)
and `scripts/generate-batch.ts` (`npm run generate:batch`): pending accounting,
near-miss routing one level only, dedupe by cage signature, deadline in every
task plus a grace period then `worker.terminate()`, checkpoint to
`<output>.partial.jsonl` with `--resume`, atomic publish, exit code 2 on
shortfall. Every record carries `seed`, `candidates`, `raw_score`,
`scoring_version` and `generator_version: "v5-ts"`; a task's seed is
`mixSeed(runSeed, size, difficulty, tier, attempt)` so completion order cannot
change the puzzle (tested by running the same batch with reversed runner
delays). `src/utils/cageSignature.ts` was split out of `puzzleCatalog.ts`,
whose Vite-only `import.meta.env` import made it unusable under Node; the
engine gained `src/utils/deadline.ts`, honoured inside `countSolutions` and the
logic loop. Measured: 24 buckets x 2 across all four sizes in 7.6 s on 4
workers; an 8 s limit on a 7x7 expert bucket returned in 8 s wall with the
straggler stopping itself inside the grace period. The Python generator is
still present for Phase 4's re-score comparison and is retired after it.

1. Port Latin squares (lazy per-worker pool), partition, carve, and a
   *randomised, difficulty-conditioned* `assignOperations` (A item 6).
2. Seeded workers; record the seed on every accepted puzzle.
3. Coordinator with per-bucket pending accounting, retry budgets, deadlines,
   dedupe, checkpoints, atomic publication.
4. Acceptance: all 80 (size x difficulty x tier) buckets fill or report explicit
   shortfall; a seed reproduces a candidate independent of worker order.

### Phase 3 - Optimise on candidates (A items 2, 5; B Phase 4)

*Status (2026-09-13): shipped.* `scripts/bench-generation.ts` times the
acceptance path on fresh seeded candidates, not corpus survivors.
`countSolutions` now picks the cell with the fewest legal values at every
node and prunes on running cage state - sum bounds for +, divisibility and a
size^remaining bound for *, the two specific partner values for - and / once
one cell is placed. `src/utils/countSolutions.test.ts` holds it to the previous
backtracker's counts on corpus puzzles, fresh unique and non-unique
candidates, partial and wrong grids, and the cap. 7x7 candidates: p50 6.0 ->
0.3 ms, p95 166 -> 4.5 ms, max 180 -> 16 ms; accepted puzzles/s 20.6 -> 49.1.
The rating trace is now the dominant cost (7x7 p95 ~100 ms) and is left alone:
all 80 buckets fill in about 3 s, so items 3.3-3.4 (combination caching,
carving) are not justified by the profile.

1. Benchmark harness that times *fresh candidates*, not corpus records, reporting
   accepted-unique-puzzles/second and p50/p95/p99 per bucket.
2. `countSolutions`: MRV cell choice, incremental cage sums/products with bounds,
   subtraction/division partner pruning, precomputed per-cage value tuples.
3. Cache immutable cage combinations; reuse surviving combinations within an
   unchanged state.
4. Carving and startup only if the new profile says so.

### Phase 4 - Re-score, migrate, retire (B Phase 5)

1. Re-score the corpus with the canonical engine, in place, preserving record
   order (the browser uses index as identity; saved games use cage signature).
   1b. Replace `normalizeScore` with the cross-size absolute mapping (decision 6):
   fit the mapping on the full re-scored raw-score distribution across all four
   sizes, log-compress above the cross-size q80 so the top 20% occupy 80-100
   without saturating, and keep `difficultyLevel` band assignment per size via
   the existing quantile table (re-derived from the new raw scores). Store raw
   score, normalised score, band and scoring version on every record.
   1c. **Migrate every consumer that derives the band from the number.** Once
   the number is cross-size and the band is per-size, `score -> name` is no longer
   a function. Today three call sites do exactly that: `tierForScore` in
   `src/utils/puzzleCatalog.ts:151` (fixed 20/40/60/80 cutoffs, used to label
   gallery sections at `:179`), `difficultyLevel(normalizeScore(...))` in
   `src/components/SolverPlayback.tsx:166-167`, and the same pair in
   `src/components/DevPanel.tsx:139-140`. Under the new model a 4x4 expert would
   label itself "easiest". Changes: the band comes from record metadata
   (`actual_difficulty`) or from `difficultyLevel(raw, size)`, never from the
   normalised number; `tierForScore` is deleted; gallery sections keep numeric
   `10-20` style labels and, because one numeric section can now hold several
   named bands, show the band per entry (chip) rather than per section.
   Two different things are displayed and must not be conflated: the puzzle's
   **difficulty** is a static label from metadata, shown in the gallery and dev
   panel; the playback header shows the **cumulative rating of the trace so
   far**, which starts from the player's current board (`SolverPlayback.tsx:59`)
   and grows step by step, so it need not equal whole-puzzle difficulty even
   with identical scoring logic. Regression checks: (i) for every corpus record
   the gallery and dev-panel band equals `metadata.actual_difficulty`; (ii) for
   a playback started from an **empty board** and run to completion, the final
   cumulative raw score and band equal the record's stored raw score and band -
   this is the scoring/trace parity check from Phase 1.3, applied end to end.
   No parity is asserted for partial-board playback or intermediate steps.
2. Full structural + uniqueness validation gates publication; wire
   `validate_puzzles.py` (or its TypeScript successor) into CI - currently the
   workflow runs only browser tests.
   2b. **Migrate persisted scores on the device.** The score does not live only
   in the corpus. The loader copies `metadata.difficulty_score` into
   `puzzle.difficulty_operations` (identical for all 4000 records), which is then
   (i) stored on every `SavedGame.puzzleDefinition`, so a game resumed after the
   upgrade still carries an old-scale number and would complete under it; and
   (ii) snapshotted into `CompletedPuzzleStats.difficultyOperations`
   (`puzzleStats.ts:107`), which the Times tab groups by fixed 10-point bands
   (`puzzleStats.ts:284-289`) with no scoring version. Left alone, historical and
   new times land in the same buckets while meaning different things. Rules:
   every persisted score gets a `scoringVersion`; records without one are the
   old version. On upgrade, entries are re-keyed to a corpus record **by
   canonical cage signature** (`canonicalCagesSig`, computable for every entry
   since `CompletedPuzzleStats.puzzle` and `SavedGame.puzzleDefinition` both
   carry the cages). `puzzleIndex` is only an accelerator: an index lookup is
   accepted only if the record at that index has the same size and signature;
   otherwise fall back to a signature search. This matters because devices may
   still hold the pre-`cb8fc36` corpus via the 30-day CacheFirst entry, and all
   4000 indices in that corpus point at different puzzles from today's -
   preserving today's order protects nothing for those saves. Entries that match
   no record are kept but excluded from the Times aggregation (a new
   `versionExcluded` count alongside `aidedExcluded`/`unknownExcluded`). Saved
   games take the new score at load from the record they resolve to, not from
   the stored definition. Checks: a saved game from the old corpus resumed after
   the upgrade completes with the new score and version; an entry whose
   `puzzleIndex` exists but identifies a different puzzle is re-keyed by
   signature, not by index; a Times bucket never mixes versions.
3. Ship with a cache-busting corpus filename (the `puzzle-data-cache` CacheFirst
   entry is why devices still hold the pre-`cb8fc36` corpus).
4. Remove Python generation and scoring.

This phase closes both standing v1 blockers. Item 3 closes the stranded stale
corpus. Re-scoring alone would **not** close the other: `normalizeScore` in
`solver.ts:217-225` is per-size quantile normalisation with `Math.min(100, …)`
saturation, and re-scoring under that model keeps both properties. It is item
1b, the calibration change per decision 6, that closes it.

## 6. Decisions (taken 2026-09-13)

1. **Direction: TypeScript/Node.** `src/utils/solver.ts` becomes the single engine
   for scoring, hints and generation; cage construction and the batch runner move
   to Node. Python receives only the Phase 0 safety fixes and is retired after the
   corpus is re-scored.
2. **Single-cell cap: keep the code's 2/2/4/5.** The shipped corpus already
   conforms to it. Fix the docstring; port the table verbatim.
3. **Deduction scheduling: cheapest-first restart.** Exact definition: techniques
   are tried in a fixed cheapest-to-dearest order; after **every successful
   deduction - a placement or a candidate elimination** - control returns to the
   cheapest technique. Traversal is deterministic (row-major cells, ascending
   values, cages in definition order) and ties between simultaneously available
   deductions resolve by technique order then traversal order. This is close to
   but not identical to Python's `_run_logic_loop` (`solver.py:836`), which
   restarts after each technique *call* that made progress: `_apply_hidden_singles`
   returns on the first placement, but `_apply_naked_singles` places every naked
   single in one full scan before returning. The canonical engine should restart
   after each single deduction. Ratings change, so this ships with a
   scoring-version bump and the Phase 4 re-score. Hint ordering in `eligibleSteps`
   is affected only indirectly and should be checked against the existing
   `hints.test.ts` fixtures.
4. **Heuristic pre-filter: delete, no replacement.** Every candidate gets the full
   count-first solve. Nobody re-adds the old formula.
5. **Corpus identity: preserve record order, keep the duplicate pair.** Metadata is
   updated in place so every existing index stays valid. Deduplication applies to
   newly generated puzzles only.
6. **Difficulty calibration: cross-size absolute scale.** One raw-score-to-0-100
   mapping shared by all sizes, log-compressed at the top so expert puzzles spread
   out instead of pinning at 100. The named bands (easiest..expert) stay per-size
   so every (size, difficulty, tier) bucket stays populated and the gallery filter
   is unchanged. Consequence to accept: 4x4 puzzles will read low on the number.
   Specified as Phase 4 items 1b (model), 1c (display consumers) and 2b (persisted
   scores); ships under the same scoring-version bump as the scheduling change.

## 7. Evidence boundaries

- A's timings are single-machine CPython on fresh candidates; B's are on 80
  corpus records. Neither is a throughput guarantee.
- The 30/80 drift figure, the 2x2 validation fixtures and the `ZeroDivisionError`
  are B's reproductions, not re-run here.
- No human difficulty data was analysed by either review; the Times tab now
  collects unaided solve times and is the natural input for later calibration.
- No speedup from the TypeScript engine has been measured. Node is usually faster
  than CPython on this kind of loop, but Phase 3.1 exists to find out.
