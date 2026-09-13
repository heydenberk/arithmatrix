# Puzzle generation review and TypeScript unification plan

Date: 2026-09-13  
Status: Analysis and proposed implementation plan. No generator, solver, application, or corpus changes have been made as part of this review.

## Recommendation

Use a shared TypeScript engine for puzzle solving, in-app hints, playback, and difficulty scoring, and move batch generation to a Node runner. Standardize deterministic deduction order before treating the current browser scores as authoritative. Retain a separate algorithm for proving uniqueness inside the shared package.

The earlier recommendation to prefer the Python solver concerned its deduction order, especially restarting after the first hidden single. It was not a recommendation to retain Python as the implementation language. The desired behavior should be implemented in the shared TypeScript engine.

Correctness, difficulty consistency, and reliable batch execution should precede performance tuning. The largest measured large-grid cost is uniqueness search; the existing difficulty heuristic also discards many suitable puzzles before they can be scored.

## Scope and current architecture

The review covered the active generation path, its consumers, the two scoring implementations, corpus validation, and relevant test coverage.

| Component | Current responsibility |
| --- | --- |
| [`backend/arithmatrix.py`](../backend/arithmatrix.py) | Cage partitioning, carving, operations, candidate generation, difficulty filtering, and fallback selection |
| [`backend/latin_square.py`](../backend/latin_square.py) | Latin-square construction and per-size pools |
| [`backend/solver.py`](../backend/solver.py) | Technique-based scoring and independent solution counting |
| [`backend/generate_batch.py`](../backend/generate_batch.py) | Worker processes, difficulty/operation buckets, and JSONL output |
| [`backend/app.py`](../backend/app.py) | Corpus lookup and on-demand generation API |
| [`src/utils/solver.ts`](../src/utils/solver.ts) | Browser solving, scoring, playback, hint deductions, and independent solution counting |
| [`src/utils/puzzleCatalog.ts`](../src/utils/puzzleCatalog.ts) | Corpus loading, difficulty metadata, and puzzle identity |
| [`scripts/validate_puzzles.py`](../scripts/validate_puzzles.py) | Corpus uniqueness validation |

[`backend/puzzle_generator.py`](../backend/puzzle_generator.py) contains an older `KenkenGenerator`. Repository searches found no active callers outside that file's examples. It should not be the focus of optimization or become another implementation to maintain.

The active Python flow is:

1. Obtain a Latin square.
2. Sample cage sizes and carve connected cages.
3. Assign operations and targets from the known solution.
4. Optionally reject the candidate using a structural difficulty heuristic.
5. Run the technique solver and independent uniqueness counter.
6. Return an exact difficulty match, the closest valid match, or a final fallback.
7. In batch generation, check uniqueness again, place the result in a bucket, and eventually write JSONL.

## High-priority defects

### 1. Final fallback can return a non-unique puzzle

**Location:** [`backend/arithmatrix.py`, final fallback around line 524](../backend/arithmatrix.py#L524).

The ordinary candidate loop rejects a puzzle when `stats.is_valid` is false. The final fallback performs another solve but returns the puzzle regardless of that result, assigning `actual_difficulty = "unknown"` when validation fails.

This is reachable with normal parameters. In the review, with Python's `random` and NumPy's random generator both seeded to `0` and a cold Latin-square pool for the requested size:

| Request | Attempt limits | Returned difficulty | Solutions counted, capped at two |
| --- | --- | --- | --- |
| 5×5, easiest | Defaults | unknown | 2 |
| 6×6, easiest | Defaults | unknown | 2 |
| 7×7, easiest | Defaults | easiest | 1 |

All three results followed the final fallback and lacked `techniques_used`. The 7×7 example illustrates that the same path can return a valid puzzle with incomplete metadata.

A controlled ambiguous candidate also demonstrated that the generator can reject a candidate for non-uniqueness during its main loop and then return an ambiguous candidate through the final fallback.

**Impact:** The batch runner's extra uniqueness check protects its output from this particular defect, but direct generator callers remain exposed. Invalid fallback work also consumes generation time before the batch runner discards it.

**Planned correction:** Every successful generator return must have complete metadata and satisfy structural, arithmetic, and uniqueness requirements. Exhaustion should return an explicit failure. A closest valid difficulty match may be supported, but must be explicitly represented and must satisfy the same validity guarantees.

### 2. Partitions with more than 26 cages are silently truncated

**Locations:** [`backend/arithmatrix.py:583`](../backend/arithmatrix.py#L583), [`backend/solver.py:948`](../backend/solver.py#L948).

The generator builds its cage-size mapping with:

```python
cage_sizes = dict(zip(string.ascii_uppercase, partition))
```

`zip` drops entries after the 26 available letters. The carver then places only those cages and does not require all cells to be covered before returning.

Reproductions:

- A controlled, permitted 7×7 partition of 22 two-cell cages and five single-cell cages has 27 cages totaling 49 cells. It became 26 cages covering only 48 cells.
- An ordinary 8×8 easiest candidate, generated with seed `333`, covered only 60 of 64 cells on the first attempt. The API currently accepts size 8 even though the batch runner supports only sizes 4–7.

The uniqueness counter does not replace structural validation. Its cell-to-cage map silently overwrites overlaps, and cells without a cage are treated as unconstrained beyond row/column rules. Controlled fixtures demonstrated both:

- A 2×2 puzzle with three uncovered cells reported one solution and `is_valid = True`.
- A 2×2 puzzle containing contradictory overlapping cages also reported one solution and `is_valid = True`, because the conflicting mapping was overwritten.

**Planned correction:** Use numeric cage identifiers without an alphabet limit. Validate that every cell occurs in exactly one connected cage, all indices are in range, and operation arity and target values are valid. Verify the stored solution against every cage and Latin-square constraint. Reject malformed definitions before counting solutions.

No coverage or overlap defect was found in the shipped 4,000-record corpus during this review; these reproductions establish defects in the generation and validation code.

### 3. The difficulty heuristic rejects appropriate candidates

**Locations:** [`backend/arithmatrix.py:475`](../backend/arithmatrix.py#L475), [`backend/solver.py:1024`](../backend/solver.py#L1024).

The fast heuristic estimates difficulty from cage structure using an older hand-tuned formula and thresholds. The final scorer uses technique counts and size-specific quantile boundaries. The generator rejects candidates whose estimated level is more than one level from the requested difficulty.

Applying that rejection rule to the shipped puzzles, treating each stored difficulty as the requested target, produced the following results. Each entry is rejected records out of 200 records for that size and difficulty, aggregated across operation tiers.

| Size | Easiest | Easy | Medium | Hard | Expert |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4×4 | 2/200 | 0/200 | 0/200 | 0/200 | 5/200 |
| 5×5 | 200/200 | 105/200 | 5/200 | 0/200 | 46/200 |
| 6×6 | 200/200 | 200/200 | 59/200 | 0/200 | 0/200 |
| 7×7 | 200/200 | 200/200 | 183/200 | 0/200 | 0/200 |

**Impact:** Suitable candidates are repeatedly discarded. Requests are pushed toward the final fallback, and batch jobs spend work on candidates they later discard or assign to another difficulty bucket. These are measured rejection rates on the existing corpus, not a claim that every future candidate in these bands must be rejected.

**Planned correction:** Disable heuristic-based rejection initially. Reintroduce a filter only after measuring its false-rejection rate against the canonical scorer for every size, difficulty, and operation tier. A heuristic may guide candidate selection without making it impossible for a candidate to receive a full rating.

### 4. Python and TypeScript produce different difficulty ratings

**Locations:** [`backend/solver.py:356`](../backend/solver.py#L356), [`src/utils/solver.ts:626`](../src/utils/solver.ts#L626).

An 80-puzzle browser sample selected the first record in each size × difficulty × operation-tier bucket. TypeScript assigned a different difficulty than the stored backend rating to **30 of 80 puzzles**. All 80 passed the browser uniqueness check.

Selected examples were also scored directly with Python:

| Corpus line, one-based | Stored/Python level | Python score | Browser level | Browser score |
| --- | --- | ---: | --- | ---: |
| 1 | easiest | 19.60 | easy | 37.12 |
| 401 | medium | 59.14 | expert | 81.33 |
| 1501 | medium | 40.00 | expert | 87.17 |

One concrete cause is hidden-single scheduling. Python stops after the first hidden single and returns to the easy-technique cascade. TypeScript continues scanning for hidden singles. It can therefore charge a higher hidden-single weight for a cell that could now be handled by a cheaper naked single.

Different technique order can also change later deductions and branching. The hidden-single difference is an established source of drift; this review did not prove it explains every mismatch.

**Planned correction:** Make deduction order deterministic and shared. Implement the desired restart behavior in TypeScript, then use the same engine for generation, hints, and playback. Add fixtures that compare technique counts and raw scores as well as final solutions. Identical weights and normalization constants alone do not establish parity.

### 5. Batch deadlines do not reliably stop work

**Location:** [`backend/generate_batch.py:159`](../backend/generate_batch.py#L159).

Three control-flow problems interact:

1. If no future is complete, the loop sleeps and continues before checking `max_time`.
2. `future.result(timeout=5)` is called only after `future.done()` is true, so that timeout does not bound generation.
3. Breaking out of the loop exits the executor context, which waits for outstanding work. Queued and running work are not explicitly stopped.

A controlled clock/executor reproduction set `max_time = 0.1` and supplied futures that never completed. The loop was still waiting after one simulated second and had to be stopped by the reproduction's guard.

There is also no overall failure budget for a bucket that continually fails to produce accepted records. Per-call attempt limits do not bound an indefinitely resubmitted batch.

**Planned correction:** Check elapsed time independently of completions. Use a monotonic deadline, stop new submissions, and propagate cancellation into long searches. Give the Node coordinator an enforceable policy for workers that exceed their deadline. Bound failures per bucket and report incomplete output explicitly.

### 6. The API fails when the shipped corpus is loaded

**Location:** [`backend/app.py:87`](../backend/app.py#L87).

The corpus lookup path imports `_get_difficulty_range`, which no longer exists in `arithmatrix.py`. A normal request to `/api/puzzle?size=4&difficulty=medium` returned HTTP 500 during the review.

The route also computes `allowed_operations` without forwarding it to generation. Its difficulty-based operation policy is inconsistent with the explicit operation tiers used by the corpus.

**Planned correction:** Use current difficulty metadata for lookup, make operation-tier handling explicit, and align supported sizes. Repair this route while it remains in use, or replace its responsibilities as part of the Node migration. Direct generation must use the same validated-result contract as batch generation.

## Additional defects and maintenance concerns

### Single-cell caps disagree with the documented rule

[`_max_single_cages`](../backend/arithmatrix.py#L554) documents caps of `1, 2, 3, 4` for sizes 4–7, but `round(0.10 * size * size)` produces `2, 2, 4, 5`.

| Size | Documented cap | Actual cap | Corpus records exceeding documented cap |
| --- | ---: | ---: | ---: |
| 4×4 | 1 | 2 | 311 |
| 5×5 | 2 | 2 | 0 |
| 6×6 | 3 | 4 | 174 |
| 7×7 | 4 | 5 | 137 |

That is **622 of 4,000 records** exceeding the documented limits. Decide the intended product rule explicitly, encode it directly, and test each supported size. If the documented values are intended, use an explicit table or a suitable floor-based rule rather than rounding.

### Batch scheduling ignores work already pending for a bucket

[`submit_work`](../backend/generate_batch.py#L139) calculates demand from accepted records alone. It does not subtract pending requests for that bucket. Repeated submissions can exceed the remaining demand, consume worker capacity, and produce records that are discarded after a bucket fills.

Track accepted and pending counts separately, submit against remaining demand, and schedule fairly across buckets. Continue routing valid results to other requested difficulty buckets when useful.

### No deduplication, checkpointing, or resumable output

The batch runner retains accepted records in memory and writes the destination only at the end. Interruption can lose completed work; the default destination is the shipped corpus, and writing it is not atomic.

The corpus contains one exact duplicate puzzle at one-based lines **752 and 774**, both in the 4×4 hard/all bucket. A canonical signature that sorts cages and their cell lists identified the duplicate.

Deduplicate newly accepted records, persist resumable checkpoints, and validate a completed artifact before atomic publication. Existing duplicate records should not be silently removed during re-scoring because record order participates in puzzle identity.

### NumPy is absent from backend installation requirements

[`backend/requirements.txt`](../backend/requirements.txt) lists Flask and python-dotenv, but the active generator imports NumPy. A clean installation using only this manifest does not declare all required dependencies. This was established from the imports and manifest; a fresh environment was not installed during the review.

Correct the manifest if the Python implementation remains usable during migration. Retire it when its responsibilities have been replaced and validated.

### Weighted partition sampling has an unsupported zero-weight remainder

[`weighted_partition_sample`](../backend/arithmatrix.py#L20) divides by the weight of choices that fit the remaining space without handling that weight being zero. A request with weights `[0, 1, 0, 0, 0]` and target sum `3` raised `ZeroDivisionError`.

Current built-in profiles give single-cell cages positive weight, so this is a helper-contract defect rather than a reproduced default-profile failure. Validate impossible inputs and return a deliberate failure instead of a division error.

### Error reporting and configuration boundaries need tightening

The generator catches broad exceptions and retries. Batch workers convert exceptions into `None` and log them at debug level. This can make a programming error resemble an ordinary candidate rejection and allow repeated failures without a useful diagnosis.

Use explicit failure reasons for expected rejection, preserve unexpected error details, and record per-bucket rejection counts. Validate positive worker counts and appropriate attempt/count limits. Make grid support consistent: the corpus and batch runner cover 4–7, while the API accepts 3–8 and scoring falls back to 7×7 calibration outside its configured sizes.

### Legacy generator and test coverage

The unused `KenkenGenerator` independently defines operation policies, can skip single-cell cages after reaching a limit, and contains verbose per-attempt logging. Retiring it is preferable to expanding a third generation/scoring path.

The Python tests found in `tests/` cover the terminal application, not the active backend generator. The browser solver's main corpus sample covers 20 size/difficulty combinations, without crossing operation tiers. Its stored-score label check verifies metadata consistency, not equality between recomputed TypeScript scores and Python scores.

The deployment workflow runs browser tests but does not invoke the full Python corpus validator. The validator itself checks uniqueness, so it should be extended or supplemented with structural and metadata validation.

## Performance evidence

### Benchmark method and limits

- Read all 4,000 shipped records for structural checks, duplicates, and heuristic comparisons.
- For Python timings, select one random record from every size × difficulty × operation-tier bucket using selection seed `1024`: 80 records, 20 per size.
- Time difficulty solving separately from independent uniqueness counting. The difficulty measurement includes solver construction and runs with uniqueness checking disabled.
- Use `cProfile` separately to identify expensive functions. The timings below are from the subsequent unprofiled run, not profiler-inflated timings.
- The browser rating comparison uses a different 80-record sample: the first record in each bucket.
- Measurements are local observations, not production throughput guarantees or a complete corpus uniqueness audit.

### Unprofiled Python timings

| Grid | Difficulty solve median | Difficulty solve maximum | Uniqueness median | Uniqueness maximum |
| --- | ---: | ---: | ---: | ---: |
| 4×4 | 0.83 ms | 1.27 ms | 0.19 ms | 0.78 ms |
| 5×5 | 2.37 ms | 13.22 ms | 1.10 ms | 5.71 ms |
| 6×6 | 7.38 ms | 74.90 ms | 7.92 ms | 29.09 ms |
| 7×7 | 34.53 ms | 971.11 ms | 122.24 ms | 2,451.19 ms |

All 80 sampled puzzles had exactly one solution. Each Python difficulty solve completed with a valid grid matching the stored solution. The Python sample's recomputed difficulty levels matched stored levels.

Large-grid uniqueness search has a substantial tail. Improving average small-grid operations will not address a 7×7 candidate that spends seconds proving uniqueness, especially when successful batch output repeats that proof.

### Profiling findings

The principal costs were:

- Independent solution counting: recursive traversal and repeated cage checks.
- Joint cage line-lock analysis.
- Repeated surviving-combination filtering.
- Cage intersection analysis and multi-line summation.
- Backtracking through difficult candidates.

The counter already uses row/column bit masks, but visits cells in fixed row-major order. Its partial sum check only tests that the current sum is below the target, and its partial product check tests divisibility. Both leave opportunities for stronger bounds and domain-aware pruning.

Cold Latin-square pool initialization took approximately 229–338 ms per supported size in the measured process. Warm retrieval averaged approximately **0.025–0.026 ms**. Pools are process-local, so startup work can recur across workers, but warm Latin-square retrieval is a low optimization priority relative to solving.

### Optimization priorities

1. **Avoid wasted candidates and jobs.** Correct heuristic rejection and pending-job accounting before optimizing arithmetic loops. Measure accepted records per second, including failures and duplicates.
2. **Improve independent uniqueness search.** Initialize forced values, maintain incremental cage sums/products, tighten remaining-value bounds, prune subtraction/division partners, and select a cell with the fewest viable candidates. Preserve independence from human-style deductions.
3. **Avoid duplicate uniqueness proofs.** Once successful generation returns a trustworthy validation result tied to the immutable puzzle definition, reuse it in the batch pipeline. Do not remove the current extra check while the fallback remains unsafe. Keep independent artifact validation before publication.
4. **Separate scoring from presentation work.** Generation should not build hint descriptions, playback snapshots, or full step histories. Preserve the same deductions and technique counts in all modes.
5. **Cache repeated solver work.** Cache immutable cage combinations using size, operation, target, and positional row/column conflicts. Reuse surviving combinations within an unchanged solver state and precompute cage/line relationships. Invalidate state-dependent caches on eliminations, placements, and rollback; bound cache memory.
6. **Profile carving and startup after the above.** Reduce repeated full-board scans, temporary copies, and failed carving retries if they remain material. A port should preserve required cage connectivity and distribution rather than reproduce every implementation detail.

No numerical speedup is promised before measuring the shared TypeScript implementation. These priorities follow observed costs in the current Python path.

## Difficulty methodology

### Use technique-based scoring with deterministic ordering

A technique-based solver is the stronger basis for difficulty because it measures the reasoning used to solve the puzzle. Cage size and operation counts provide structural clues, but do not establish which deductions a player will need.

The canonical engine should reconsider cheaper techniques after progress and use stable traversal and tie-breaking. Python's restart after the first hidden single is a better starting behavior than the current TypeScript scan. Neither current implementation should be assumed to implement the final scheduling policy perfectly in every detail.

The score measures work under the chosen deterministic solver strategy. It does not prove that every human, or every possible solution strategy, must use exactly those techniques.

### Retain bottleneck weighting provisionally

The current raw score adds advanced-technique contributions at full weight and square-root compresses cheaper technique contributions:

```text
raw score = advanced technique contributions
            + sqrt(routine technique contributions)
```

This is a reasonable starting model: repeated routine deductions should not dominate a puzzle requiring difficult reasoning. The current advanced group includes multi-cage line locks, summation, cross-cage feasibility, and trial and error.

Further calibration should assess whether repeated advanced applications represent separate bottlenecks or repeated work on the same bottleneck. Branching difficulty should account for the cost and depth of exploring and rejecting alternatives, not merely the presence of a guess.

### Distinguish reasoning difficulty from arithmetic effort

A tedious multiplication is not automatically a logically difficult deduction. Keep logical difficulty as the principal rating; track arithmetic effort separately if it helps explain player experience.

### Understand what quantile bands mean

The current size-specific raw-score quantiles map into five named bands and a 0–100 display score. They are useful for maintaining populated difficulty categories within a size, but express relative position in the calibrated puzzle population.

A score of 60 on a 4×4 puzzle does not establish the same solve time or effort as 60 on a 7×7 puzzle. Quantile cutoffs should be checked across operation tiers, since changing the sampled population can change the interpretation of the bands.

The old fast heuristic uses a different scale and should not be compared to the canonical quantile levels as if they were calibrated equivalents.

### Validate against human experience

Use unaided solve times, completion/abandonment rates, and hint use to validate predictive quality, accounting for player experience and grid size. Existing solve-time statistics may provide a starting point; this review did not analyze player data or establish that either current implementation predicts human difficulty better.

Adopt explicit scoring versions. Changing deduction order, adding a technique, changing weights, or changing quantile anchors can alter ratings without changing the puzzle itself.

## Shared TypeScript architecture

The target is one shared deduction implementation with environment-specific callers.

| Layer | Responsibility |
| --- | --- |
| Shared puzzle model and validator | Canonical operations, supported sizes, cage coverage/connectivity, target arithmetic, stored-solution validation |
| Shared deduction engine | Candidate state, technique implementations, deterministic scheduling, technique counts, and branching behavior |
| Shared difficulty model | Raw scoring, size-specific normalization, named bands, and scoring version |
| Independent uniqueness counter | Prove zero, one, or multiple solutions without relying on hint/deduction soundness |
| Browser adapters | Current-position hints, available deductions, playback traces, and presentation |
| Node generation workers | Seeded Latin squares, cage construction, operation assignment, validation, and scoring |
| Node batch coordinator | Bucket scheduling, deadlines, worker lifecycle, deduplication, checkpoints, and artifact publication |

The shared engine should be usable without React, DOM APIs, filesystem access, or Node-only imports. Node worker and output code should remain outside the browser dependency graph.

### Execution modes

- **Scoring:** Run the canonical solve and accumulate statistics without building descriptions or grid snapshots.
- **Playback:** Execute the same deductions and capture full steps for display.
- **Hints:** Start from the player's position and expose deductions or stall analysis. Keep speculative branch exploration distinguishable from proven deductions so hints do not present guesses as established answers.

These modes should share candidate updates and deduction scheduling. Presentation choices must not silently change the scoring path. For the same starting state and completed solving policy, turning trace capture on or off should preserve the solved grid and technique counts.

Existing `solveToStall`, `solveWithTrace`, and the muted lookahead mechanism provide starting points. A dedicated score-only mode must still avoid eagerly constructing descriptions before a recording hook decides to discard them.

### Independence of uniqueness validation

Unifying the language and package does not mean relying on the deduction trace as the proof of uniqueness. The counter should remain a separate search over the puzzle constraints, capped at two for the ordinary uniqueness question.

This keeps a defect in a hint technique from being the sole authority for publishing a supposedly unique puzzle. Structural validation remains a separate prerequisite for both solvers.

### Node generation and deterministic workers

Port generation to a Node batch runner with workers for CPU-intensive tasks. Use an explicit seeded random source and record the seed with each accepted puzzle. Derive task seeds from stable task identifiers so worker completion order does not make failures impossible to reproduce.

The public operation tiers remain `add`, `add-sub`, `no-div`, and `all`. Retain the current corpus format where compatibility requires it, adding scoring/validation metadata deliberately.

After differential validation and consumer migration, retire the Python generation/scoring implementations and the unused legacy generator. This avoids maintaining a permanent second source of deduction and difficulty rules.

## Implementation sequence and acceptance criteria

### Phase 1: Capture regressions and establish a validation contract

1. Convert the reproduced failures into targeted fixtures and tests.
2. Define supported sizes, operation semantics, single-cell caps, and expected behavior on attempt exhaustion.
3. Add structural and stored-solution validation.
4. Require complete, valid, uniquely solvable results on every successful return.
5. Fix the 26-cage truncation and remove acceptance of invalid fallbacks.
6. Repair API lookup and declared dependencies while the Python path remains active, or cover their replacement in the migration cutover.

**Acceptance:** Malformed, ambiguous, and unsatisfiable puzzles cannot be returned as successful generation results. A 27-cage partition retains all cages and cells. Exhaustion is explicit. An active API returns valid results or a deliberate failure rather than the missing-import error.

### Phase 2: Make TypeScript the canonical solver and scorer

1. Isolate the shared engine from browser presentation and environment-specific code.
2. Standardize cheapest-first restart behavior and deterministic traversal.
3. Provide scoring, playback, and hint/stall interfaces over shared deductions.
4. Retain the independent uniqueness counter behind structural validation.
5. Add fixed scoring fixtures and mode-parity checks.
6. Disable the current structural rejection heuristic; measure a replacement only after canonical scoring is established.
7. Assign an explicit scoring version and document expected rating changes.

**Acceptance:** Scoring and playback agree on technique counts and raw scores for identical initial states. Known browser/backend discrepancies are explained by the chosen policy, and future changes are detected by fixtures. Hints use the same deduction rules without presenting branch-only conclusions as proven.

### Phase 3: Port generation and reliable batching to Node

1. Port Latin-square generation, cage sampling/carving, and operation assignment using deterministic seeds and numeric cage identifiers.
2. Use the canonical TypeScript scorer and independent validation contract.
3. Track pending work per bucket, route useful alternate-difficulty results, and enforce retry budgets.
4. Enforce job and batch deadlines even when workers produce no completed results.
5. Deduplicate accepted records and persist resumable checkpoints.
6. Validate finished output and publish atomically.

**Acceptance:** The runner supports all 80 configurations: four sizes × five difficulties × four operation tiers. Tests establish completion or explicit shortfall, bounded deadline overrun, preservation of completed work, and no silent publication of incomplete or invalid output. A known seed reproduces the same candidate independent of worker completion order.

### Phase 4: Optimize measured costs

1. Establish a Node baseline including cold startup, warm generation, rejection rates, and tail latency.
2. Optimize independent uniqueness search first.
3. Reuse trusted validation results within generation to avoid duplicate searches.
4. Cache repeated combination and cage/line calculations while preserving deduction order.
5. Optimize carving and Latin-square setup only if the new profile justifies it.

**Acceptance:** Compare accepted unique puzzles per second and p50/p95/p99 generation times across configurations. Correctness-preserving optimizations retain solution counts and scoring results. Intentional scoring changes receive a new version and separate evaluation.

### Phase 5: Re-score the corpus, migrate consumers, and retire Python

1. Run the canonical engine over the existing corpus and report score/level changes.
2. Validate every record structurally and prove uniqueness before publishing the replacement artifact.
3. Preserve existing record order and puzzle identities during re-scoring.
4. Update browser and any active API consumers to the shared implementation or generated artifact.
5. Remove replaced Python code and obsolete configuration after the new pipeline passes the acceptance checks.
6. Use player outcomes to refine the scoring model in subsequent explicitly versioned updates.

**Acceptance:** Catalog, hints, playback, and generation use consistent scoring rules. Existing saved-game and statistics identities remain stable through re-scoring. Full corpus checks gate publication, and one maintained implementation owns deduction behavior.

## Validation plan

| Area | Required checks |
| --- | --- |
| Structure | Missing cells, overlaps, duplicate indices, out-of-range indices, disconnected cages, invalid operations/arity, and more than 26 cages |
| Arithmetic | Valid Latin squares; stored solutions satisfy every target; repeated cage values are permitted only where row/column constraints allow them |
| Uniqueness | Known zero/one/multiple-solution fixtures; cap behavior; independent comparisons on supported small cases and corpus samples |
| Generation contracts | No invalid fallback; complete metadata; explicit exhaustion; supported sizes and operation tiers; intended single-cell caps |
| Difficulty | Hidden-single restart fixtures; deterministic counts; fixed raw/normalized scores; explicit scoring version |
| Execution modes | Scoring/trace parity; hints from current positions; speculative conclusions kept distinct from proven deductions |
| Heuristic | False-rejection and acceptance rates by size, difficulty, and operation tier before enabling rejection |
| Batch lifecycle | Workers that never complete; slow workers; deadline enforcement; pending demand; bounded failures; deduplication; checkpoint/resume |
| Output | Full structural/uniqueness validation; metadata consistency; atomic publication; stable record identities |
| Performance | Cold/warm runs, accepted puzzles per second, per-stage timings, tail latency, memory, and rejection reasons |

The browser currently uses the JSONL record index as a puzzle identity, with a canonical cage signature available for matching. One-based line numbers used for evidence in this document differ from those zero-based browser indices. Re-scoring should update metadata in place without sorting or deleting records. Deduplication of future generation is separate from any deliberate migration of existing duplicate records.

## Evidence boundaries

- All 4,000 shipped records passed the review's checks for complete/disjoint cage coverage, cage connectivity, Latin-square solutions, and target arithmetic.
- One exact duplicate record was found.
- All 80 puzzles in the timed Python sample were uniquely solvable and solved to the stored grid.
- All 80 puzzles in the separate browser sample passed its uniqueness check; 30 received a different level from their stored backend rating.
- Full-corpus uniqueness was not exhaustively checked in this review.
- No human difficulty study was performed, and no performance gain from the proposed TypeScript architecture has been measured yet.
- Reproductions used read-only corpus inspection, transient in-memory probes, and local timing/profiling. Controlled inputs were identified separately from ordinary generation requests.
- This document records findings and the revised plan. Implementation and corpus migration remain future work.
