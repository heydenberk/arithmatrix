# Puzzle generation review: consolidated synthesis

Date: 2026-09-13  
Status: Analysis and proposed plan. No generator, solver, application, or corpus implementation changes are part of this work.

## Recommendation and source scope

Use one shared TypeScript deduction and difficulty engine for generation, hints, and playback, with a Node batch runner. Standardize deterministic, cheapest-first deduction scheduling and keep an independent constraint-search algorithm for proving uniqueness.

Establish safe generation results and consistent ratings first. Then eliminate redundant solving, enforce batch deadlines, and optimize uniqueness search. Evaluate operation-distribution and Latin-square-diversity changes separately so their effects are distinguishable from the implementation migration.

This document reconciles:

- [GENERATION_REVIEW.md](GENERATION_REVIEW.md): fresh-candidate profiling, heuristic pass rates, missing technique metadata, historical generation times, and generation-distribution concerns.
- [PUZZLE_GENERATION_REVIEW_AND_PLAN.md](PUZZLE_GENERATION_REVIEW_AND_PLAN.md): reproduced validity failures, structural validation, browser/backend rating drift, deadlines, and the TypeScript unification direction discussed with the user.

The generation review was updated during this comparison to correct its warm Latin-pool timing conclusion. This synthesis uses that updated conclusion and resolves remaining differences against current source and fresh checks. Concurrent work also produced [GENERATION_SYNTHESIS.md](GENERATION_SYNTHESIS.md); this file uses a separate name to preserve that work. The two original reviews remain the source material for this comparison.

## Comparison at a glance

| Topic | Combined finding | Resolution |
| --- | --- | --- |
| Fallback | Omits technique metadata and can return a non-unique puzzle. | Enforce a complete validated-result contract on every return. |
| Difficulty filter | Rejects suitable easier large-grid candidates. | Disable hard rejection initially; measure any replacement against canonical ratings. |
| Rating parity | Browser and backend levels differed for 30 of 80 sampled records. | Standardize deduction order in a shared TypeScript engine. |
| Uniqueness | A successful batch result is counted twice, and large-grid counting has a substantial tail. | Validate, count once, then score unique candidates without recounting. |
| Cage limit | The 26-letter identifier scheme can truncate permitted partitions. | Use numeric identifiers and enforce structural validation. |
| Batch lifecycle | Weak targeting combines with ignored pending demand and ineffective deadlines. | Use a bounded coordinator with deadlines, cancellation, failure budgets, and checkpoints. |
| Latin pool | Updated reviews agree that warm pooled draws are inexpensive. | Retain pending a Node benchmark; initialization is already lazy in current Python code. |
| Operation policy | Assignment is deterministic, but corpus operation restrictions are respected. | Treat random weights as a quality experiment, not a correctness requirement. |
| Flask API | Missing import breaks the API; the browser currently loads static JSONL. | Fix or retire the auxiliary route deliberately; do not call this a demonstrated browser outage. |
| Corpus rollout | Ratings and metadata need repair without breaking record identities. | Version scoring and artifacts; preserve definitions/order during re-scoring. |

## Confirmed defects and their combined implications

### 1. Fallback validity and metadata must be fixed together

The final fallback at [arithmatrix.py:524](../backend/arithmatrix.py#L524) returns a puzzle even when `stats.is_valid` is false. The unification review reproduced 5×5 and 6×6 easiest requests returning multiple-solution puzzles with default attempt limits, seed `0` for Python and NumPy random generators, and cold pools for those sizes.

The batch runner's extra uniqueness count rejects these results. Direct callers remain exposed. Removing that extra count before fixing every return path would remove a working defense.

The generation review identifies the same branch's missing `techniques_used`. A fresh all-record scan confirms **2,696 of 4,000 records** have empty technique dictionaries:

| Size | Records | Empty techniques |
| --- | ---: | ---: |
| 4×4 | 1,000 | 2 |
| 5×5 | 1,000 | 888 |
| 6×6 | 1,000 | 880 |
| 7×7 | 1,000 | 926 |

The fallback omission, followed by the batch runner defaulting to `{}`, establishes a mechanism for producing these records. The counts alone do not prove the historical path of every record. Specifically, **195 of 200** 7×7 medium records have empty techniques, so the generation review's claim that every such record came from the metadata-dropping fallback is too broad.

A successful result must include valid structure, a valid stored solution, proof of exactly one solution, a completed scoring solve, technique counts, difficulty metadata, and a scoring version. Exhaustion must produce an explicit failure. A closest valid difficulty match may be returned explicitly, but cannot relax validation.

### 2. Structural validation must precede solution counting

[arithmatrix.py:583](../backend/arithmatrix.py#L583) uses `zip(string.ascii_uppercase, partition)`, silently dropping entries after 26 cages. The generation review observed at most 26 in its random sample; that does not prove larger permitted partitions cannot occur.

The unification review reproduced:

- A permitted 7×7 partition containing 22 two-cell cages and five single-cell cages becoming 26 cages covering only 48 of 49 cells.
- An ordinary size-8 candidate covering only 60 of 64 cells. This is one reproduction, not a claim that every 8×8 request fails.

Use numeric cage identifiers. An assertion limiting partitions to 26 prevents silent truncation but retains an unnecessary representation limit.

The existing counter silently overwrites overlapping cage mappings and permits uncovered cells to have only row/column constraints. Controlled missing-cell and contradictory-overlap fixtures were reported as uniquely valid. Therefore [validate_puzzles.py](../scripts/validate_puzzles.py) cannot be the sole correctness oracle for a replacement implementation.

Validate cell ranges, exact disjoint coverage, cage connectivity, operation arity, targets, and the stored solution before solving. Retain known zero/one/multiple-solution fixtures and independent small-case checks when changing the counter.

The unification review's full-corpus structural scan found no coverage or target-arithmetic defects in shipped records. This finding concerns generator and validator guarantees, not demonstrated structural corruption of the current corpus.

### 3. The heuristic is miscalibrated; the reviews measure different populations

The generation review reports pass rates on 40 fresh basic candidates per size/target. The unification review tests already shipped puzzles against their own stored difficulty as the requested target. These answer different questions: candidate pass rate versus rejection of known-rated puzzles. Neither sample should be generalized to all possible candidates or averaged with the other.

A fresh scan reproduced these corpus rejection counts. Each size/difficulty group has 200 records across operation tiers:

| Size | Easiest | Easy | Medium | Hard | Expert |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4×4 | 2/200 | 0/200 | 0/200 | 0/200 | 5/200 |
| 5×5 | 200/200 | 105/200 | 5/200 | 0/200 | 46/200 |
| 6×6 | 200/200 | 200/200 | 59/200 | 0/200 | 0/200 |
| 7×7 | 200/200 | 200/200 | 183/200 | 0/200 | 0/200 |

The heuristic calls **921 of 1,000** shipped 7×7 puzzles expert and **79** hard. The generation review's observation that every sampled 7×7 candidate was expert is not a universal property of the code.

Both reviews justify disabling the current hard rejection rule. This restores opportunities to rate suitable candidates; it does not prove that removing the filter reduces runtime in every bucket, because more candidates may require solving. Measure false rejection, acceptance rates, and accepted-puzzle throughput before introducing a replacement predictor.

### 4. Shared TypeScript must include a consistent deduction policy

The unification review reports **30 of 80 browser ratings** differed from stored backend levels. Python returns to cheap deductions after its first hidden single; TypeScript continues scanning hidden singles. This can charge a higher weight for cells that could now be solved as naked singles. See [solver.py:356](../backend/solver.py#L356) and [solver.ts:626](../src/utils/solver.ts#L626).

For one-based corpus line 401, Python scored about 59 and TypeScript about 81. Matching weights and quantile constants do not guarantee matching ratings when technique scheduling differs. The hidden-single difference is an identified cause, not a proof that it explains every mismatch.

Use Python's restart behavior as a starting policy and implement that policy once in TypeScript. Do not preserve current browser ratings simply because TypeScript becomes canonical. Pin technique counts, raw scores, and deduction order with fixtures in addition to solved-grid tests.

### 5. Batch deadlines and demand need explicit control

The combined source findings in [generate_batch.py](../backend/generate_batch.py#L133) are:

- The no-completions branch skips the deadline check.
- `future.result(timeout=5)` runs after the future is already done.
- Executor context exit waits for outstanding work.
- Remaining demand ignores pending requests for the bucket.
- Repeatedly unsuccessful buckets have no overall failure budget.
- Accepted output is retained in memory until the final non-atomic write.

A completion-driven loop helps responsiveness, but replacing polling with `as_completed` alone does not stop a worker that never completes. The Node coordinator needs a monotonic deadline, bounded pending demand, cancellation, an enforceable worker-stop policy, retry limits, and checkpoint/resume.

Accept a validated candidate into its **actual** size/difficulty/operation bucket whenever that requested bucket needs records. The generation review's proposed restriction to a one-level difference is unnecessary for correctness: requested difficulty guides construction, while canonical measured difficulty determines the destination. Record both values to measure targeting quality.

Do not enqueue an unbounded full bucket to keep workers busy. Schedule fairly using accepted and pending counts, with explicit handling of exhausted or timed-out work.

### 6. The API defect is real but has narrower current reach

The missing `_get_difficulty_range` import breaks the corpus-serving branch. The actual route is `/api/puzzle`, not `/puzzle`. The unification review reproduced HTTP 500 from that route.

Current browser source loads static JSONL through [puzzleCatalog.ts](../src/utils/puzzleCatalog.ts#L103); a fresh source search found no Flask API caller. This is a real defect for API consumers, not evidence that the shipped browser cannot load puzzles. Current code also does not establish the generation review's historical claim that the branch has never worked.

Fix or retire the route during migration. If retained, it needs metadata-based lookup, explicit operation tiers, validated generation results, and consistent supported sizes. The API accepts 3–8 while corpus/batch calibration covers 4–7. NumPy is also missing from the Python requirements despite active imports; declare it while Python remains supported.

## Performance reconciliation

### Count once, then score

A successful batch result is independently counted inside `solve_puzzle` and again in `generate_one_puzzle`. The deduction solver may search for a first solution, but that is **not a third uniqueness proof**. Not every rejected candidate is recounted by the batch runner.

The preferred candidate flow is:

```text
seeded construction
  -> cheap structural and stored-solution validation
  -> independent solution count, capped at two
  -> reject unless unique
  -> canonical score-only solve and completion check
  -> complete metadata
  -> deduplicate and route to actual bucket
  -> checkpoint
  -> complete artifact validation before publication
```

This incorporates the generation review's useful count-first proposal, avoids scoring ambiguous puzzles, and removes duplicate in-job proofs only after validity is guaranteed. Artifact validation remains an intentional separate gate.

### Improve existing partial pruning

The generation review says cage checks are deferred until the last cell. [Current source](../backend/solver.py#L958) checks after every tentative assignment and already prunes partial sums and products. The opportunity is stronger bounds and domains, useful partial subtraction/division pruning, fewer list allocations, forced-value initialization, and choosing the most constrained cell instead of fixed row-major traversal.

Implement these improvements in the shared TypeScript counter while keeping it independent of hint deductions. Follow with caching of immutable cage combinations, reuse of surviving combinations within unchanged states, and precomputed cage/line relationships. Bound caches and invalidate state-dependent entries on placement, elimination, and rollback.

### Separate candidate cost from accepted-corpus cost

The unification review's unprofiled 80-record Python sample reports:

| Size | Difficulty solve median | Independent count median |
| --- | ---: | ---: |
| 4×4 | 0.83 ms | 0.19 ms |
| 5×5 | 2.37 ms | 1.10 ms |
| 6×6 | 7.38 ms | 7.92 ms |
| 7×7 | 34.53 ms | 122.24 ms |

The slowest sampled count took 2.45 seconds. All 80 were unique and solved to their stored grids. These results are retained from the source review, not rerun during synthesis.

The generation review reports a non-unique 7×7 candidate taking about 22.98 seconds for `solve_puzzle` and 22.17 seconds for independent counting. No exact fixture is included, so retain these as attributed observations. Since `solve_puzzle` includes a count, the figures are not disjoint internal stages to add when estimating its cost.

The populations differ: a sample of accepted corpus records cannot characterize every rejected candidate. Conversely, accepted records are not necessarily all cheap to prove. Benchmark both representative valid fixtures and fresh candidate streams.

The generation review says both “16 valid out of 30” and later “16 non-unique out of 30.” That internal discrepancy prevents adopting its exact rejection fraction or deriving a reliable speedup from that fraction.

### Historical corpus timings confirm a substantial tail

A fresh scan of stored `generation_time` produced:

| Bucket | Median seconds | p90 seconds | Maximum seconds |
| --- | ---: | ---: | ---: |
| 4×4, all difficulties | 0.027 | 0.128 | 0.396 |
| 5×5, all difficulties | 0.197 | 0.298 | 0.787 |
| 6×6 easiest | 0.910 | 1.381 | 2.059 |
| 6×6 expert | 1.208 | 2.489 | 15.260 |
| 7×7 easiest | 3.109 | 4.077 | 145.089 |
| 7×7 easy | 3.226 | 5.335 | 12.960 |
| 7×7 medium | 3.466 | 6.262 | 29.247 |
| 7×7 hard | 4.197 | 8.935 | 28.225 |
| 7×7 expert | 6.450 | 23.307 | 110.452 |

Rows aggregate operation tiers; p90 uses nearest rank. These are historical job metadata, not new benchmarks. They include attempts and final verification inside successful jobs, but not queue time or all previously failed jobs. They cannot establish that the entire 145-second maximum was spent in uniqueness search.

### Latin pooling is already lazy and fast when warm

The updated generation review corrects its earlier claim that pooled draws are slower than fresh generation. The remaining claim of eager initialization at import is contradicted by [latin_square.py](../backend/latin_square.py#L59): pools are created on first use for each size. A fresh import left the pool empty.

A fresh comparison, using seed `2468` and the median of three 200-draw batch means, found:

| Size | First pooled draw | Warm pooled mean per draw | Fresh mean per draw |
| --- | ---: | ---: | ---: |
| 4×4 | 243.44 ms | 0.0238 ms | 0.4699 ms |
| 7×7 | 225.39 ms | 0.0249 ms | 1.0918 ms |

Startup cost can recur per worker and matter for short-lived jobs. It is distinct from warm throughput. There is no remaining need to make the current Python pool lazy; it already is. Benchmark the Node construction approach before deciding whether to reproduce or replace pooling there.

Neither review measures the proposed “roughly halve runtime” or “5–20×” counter improvement. Treat those as hypotheses. Measure accepted unique puzzles per second, rejection reasons, cold/warm cost, memory, and p50/p95/p99 generation latency across all 80 configurations before committing to a numerical target.

## Difficulty model and distribution choices

### Methodology

Retain technique-based bottleneck scoring provisionally:

```text
raw score = advanced technique contributions
            + sqrt(routine technique contributions)
```

Use deterministic cheapest-first scheduling. Advanced reasoning and costly failed branches should contribute strongly, while repetitive cheap deductions contribute less. Keep arithmetic effort distinguishable from logical reasoning. A deterministic solver measures work under its strategy; it does not prove that every human must use the same deductions.

The current per-size quantiles define relative bands within calibrated populations. They do not make a score of 60 equivalent in human effort across 4×4 and 7×7. The generation review introduces absolute cross-size scoring as a v1 blocker, but the agreed direction here establishes shared TypeScript scoring, not a new absolute scale. Preserve size-specific bands during migration and evaluate cross-size effort as a separate model/product decision.

Neither review conducted a human difficulty study. Validate later refinements against unaided solve times, completion/abandonment, hint use, and player experience. Version changes to technique scheduling, technique availability, weights, and normalization.

### Execution modes

Use one deduction engine with score-only, playback, and hint/stall interfaces. Generation should not construct descriptions or snapshots. Playback records the same deductions. Hints start from the player's current state and distinguish proven deductions from speculative branch exploration. Trace capture must not change counts or final grids for identical completed solves.

Keep the independent uniqueness counter behind structural validation in the shared package. Unifying implementation language should not make hint soundness the sole authority for publishing a unique puzzle.

### Operations and diversity

Deterministic operation assignment is confirmed, but a fresh corpus scan found **zero operation-tier violations**. An allowed-operation tier does not require every permitted operation in every puzzle. Randomized weights, larger quotients, and product-limit changes are optional distribution experiments; they should not be bundled into the initial port or equated with harder reasoning.

Distinct stored solution grids were:

| Size | Distinct grids out of 1,000 puzzles |
| --- | ---: |
| 4×4 | 367 |
| 5×5 | 965 |
| 6×6 | 1,000 |
| 7×7 | 1,000 |

Repeated solution grids are not identical cage puzzles. One exact duplicate definition exists at zero-based indices **751 and 773**, equivalent to one-based lines **752 and 774**. Both reviews refer to the same pair.

These grid counts do not isolate pool bias. Fresh and pooled code both start from cyclic Latin squares and use row, column, and symbol swaps, staying within that transformation class. Removing pooling alone does not broaden that structural support. A uniform-all-Latin-square comparison also does not isolate the effect of the pool. Measure cage variety, exact duplicates, grid variety, operation mix, and structural diversity separately.

### Other contracts

- The documented single-cell caps are `1, 2, 3, 4`; code returns `2, 2, 4, 5`, and 622 records exceed the documented values. Choose the intended policy explicitly before changing code or documentation.
- The weighted sampler fails on zero-weight remainders, such as only two-cell weights with target three. Reject impossible configurations deliberately.
- Broad exception handling and `None` results hide programming errors among ordinary rejections. Preserve diagnostic details and rejection reasons.
- Align CLI, validator, API, and calibration support; use sizes 4–7 as the migration baseline.
- Retire the unused `KenkenGenerator` and replaced Python implementations after validation of their replacements.

## Unified delivery plan

| Phase | Work | Acceptance criteria |
| --- | --- | --- |
| 1. Contracts and regressions | Capture invalid fallback, missing metadata, cage truncation, malformed definitions, deadlines, and rating drift. Protect any still-used Python path with bounded correctness fixes. | Every success passes structure, arithmetic, uniqueness, scoring completion, and metadata checks; failure and timeout are explicit. |
| 2. Canonical TypeScript | Isolate engine/scoring/presentation, standardize restarts, add score-only mode and scoring versions, retain independent counting, disable the old rejection filter. | Score-only and trace modes agree on grids/counts/scores; hints share rules; rating changes have fixtures and explanations. |
| 3. Node generation and batching | Port construction with numeric cage IDs and explicit seeds. Validate → count once → score. Add bounded pending demand, actual-bucket routing, deadlines, failure budgets, deduplication, and checkpoints. | All 80 configurations fill or report explicit shortfall; stuck/slow workers respect deadline policy; interruption preserves accepted work. |
| 4. Measured optimization | Establish a Node baseline, improve independent counting, then repeated cage calculations and allocations; profile carving/startup before changing them. | Accepted-puzzle throughput and tail latency improve while solution counts and unchanged-version scoring fixtures remain stable. |
| 5. Corpus repair and cutover | Re-score existing definitions, fill technique metadata, fully validate output, publish compatibly, migrate consumers, and retire Python. | Catalog, hints, playback, and generation agree; saved identities survive re-scoring; full output validation gates publication. |
| 6. Quality/calibration experiments | Evaluate operation weights, structural diversity, cage policy, replacement predictors, and human-calibrated cross-size effort. | Distribution and human-outcome effects are measured separately from implementation changes. |

Shared TypeScript modules should not import React, DOM APIs, or Node-only facilities. Worker orchestration and filesystem code remain outside the browser dependency graph. Derive candidate seeds from stable task identifiers; reproducing an entire batch may additionally require deterministic acceptance order.

Do not make a broad Python performance rewrite a prerequisite for the shared engine. Small safety fixes are appropriate while Python remains usable. Likewise, do not defer structural validation or safe fallbacks until an eventual performance phase.

## Corpus identity and publication

The browser uses zero-based JSONL indices for puzzle references, with canonical cage signatures available for matching. Re-scoring must preserve definitions and ordering. Do not delete the existing duplicate or sort records by their new score as part of metadata repair; deduplication applies to newly generated output.

Full regeneration is a separate operation. Before replacing definitions at old indices, define how corpus versions or stable content identifiers preserve old references and statistics. A cache-busting filename can distribute new content, but does not itself preserve identity. This comparison did not independently diagnose stale devices or establish a specific caching incident.

Version the generator, scoring model, and artifact deliberately. Validate complete output, retain a rollback artifact, and publish atomically with compatible consumer cache handling.

## Validation and evidence boundaries

Required checks include complete structure/arithmetic validation, independent uniqueness, technique metadata, operation and bucket rules, deterministic scoring, mode parity, malformed fixtures, independent small cases, no-completion/slow-worker deadlines, retry exhaustion, pending demand, deduplication, checkpoint/resume, and identity-compatible publication. Existing browser tests and the Python corpus validator cover only part of this contract.

This synthesis freshly checked source control flow, all-record technique metadata, heuristic classifications, operation restrictions, duplicate identities, distinct grid counts, historical generation-time metadata, browser loading references, and cold/warm Latin timing. The earlier 80-puzzle solver results and full structural scan are retained with attribution. The 22-second candidate profile was not rerun, full-corpus uniqueness was not exhaustively checked, no human study was performed, and no Node speedup has been measured.

The sources' disagreements are resolved here without treating sample observations, historical metadata, or projected speedups as stronger evidence than they provide.

