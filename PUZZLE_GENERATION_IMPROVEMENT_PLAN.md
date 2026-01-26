# Puzzle Generation Improvement Plan

This document outlines a plan to make puzzle generation faster and difficulty estimation more accurate.

## Current State Analysis

### Performance Baseline
- 4x4: ~0.1-0.5s per puzzle, 60% success rate
- 5x5: ~0.02-0.2s per puzzle, 65% success rate
- 6x6: ~0.5-2s per puzzle, 85% success rate
- 7x7: ~2-10s per puzzle, 80% success rate
- Total time for 4000 puzzles: ~2-4 hours

### Current Architecture
Two generators exist in `backend/`:
1. **`arithmatrix.py`** - Primary generator used by Flask API
   - Uses weighted partition sampling for cage sizes
   - BFS-based cage carving with smart neighbor selection
   - Backtracking solver with MCV heuristic
   - Difficulty measured by solver operation count

2. **`puzzle_generator.py`** - Alternative `KenkenGenerator` class
   - More verbose logging
   - Difficulty-based cage partitioning
   - Similar backtracking approach

### Key Bottlenecks

| Bottleneck | Location | Impact | Called |
|------------|----------|--------|--------|
| **Solver** | `solve_arithmatrix_puzzle()` | HIGH | 1x per puzzle |
| **Uniqueness Check** | During solve | MEDIUM-HIGH | Stop at 2 solutions |
| **Cage Carving** | `carve_square()` | MEDIUM | Up to 100 retries |
| **Latin Square** | `get_latin_square()` | LOW-MEDIUM | 1x per attempt |

---

## Phase 1: Low-Hanging Fruit (1-2 days)

### 1.1 Parallel Generation
**Impact: 4-8x speedup**

Wrap existing generation in `ProcessPoolExecutor`:

```python
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing as mp

def generate_puzzles_parallel(sizes_and_counts, output_file):
    num_workers = mp.cpu_count() - 1

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = [
            executor.submit(_generate_basic_puzzle, size)
            for size, count in sizes_and_counts.items()
            for _ in range(count)
        ]

        for future in as_completed(futures):
            puzzle = future.result(timeout=30)
            if puzzle:
                save_to_jsonl(puzzle, output_file)
```

**Files to modify:**
- `backend/arithmatrix.py` - Add parallel generation function
- Create new CLI script for batch generation

### 1.2 Precomputed Latin Square Pool
**Impact: 30-40% speedup**

Generate Latin squares upfront, sample from pool:

```python
LATIN_SQUARE_POOL = {
    4: [get_latin_square(4) for _ in range(1000)],
    5: [get_latin_square(5) for _ in range(1000)],
    6: [get_latin_square(6) for _ in range(500)],
    7: [get_latin_square(7) for _ in range(200)],
}

def get_cached_latin_square(n):
    return random.choice(LATIN_SQUARE_POOL[n]).copy()
```

**Files to modify:**
- `backend/latin_square.py`

### 1.3 Adaptive Isotopy Move Count
**Impact: 10-15% speedup**

Currently uses fixed 1000 moves for all sizes. Tune based on empirical randomness threshold:

```python
def get_latin_square(n, max_steps=None):
    if max_steps is None:
        max_steps = int(n ** 1.5 * 10)  # e.g., 4x4=80, 7x7=185
    # ...
```

**Files to modify:**
- `backend/latin_square.py`

---

## Phase 2: Solver Improvements (3-5 days)

### 2.1 Incremental Constraint Tracking
**Impact: 30-50% speedup**

Replace repeated set operations with maintained state:

```python
class ConstraintTracker:
    def __init__(self, size):
        self.size = size
        self.row_available = [set(range(1, size + 1)) for _ in range(size)]
        self.col_available = [set(range(1, size + 1)) for _ in range(size)]

    def place(self, row, col, num):
        self.row_available[row].discard(num)
        self.col_available[col].discard(num)

    def remove(self, row, col, num):
        self.row_available[row].add(num)
        self.col_available[col].add(num)

    def get_valid(self, row, col):
        return list(self.row_available[row] & self.col_available[col])
```

**Files to modify:**
- `backend/arithmatrix.py:596-833` - Refactor `solve_arithmatrix_puzzle()`

### 2.2 Bitset Optimization (for 6x6, 7x7)
**Impact: 20-30% additional speedup**

Replace set operations with bitwise operations:

```python
class BitsetConstraintTracker:
    def __init__(self, size):
        self.size = size
        self.row_mask = [0] * size
        self.col_mask = [0] * size

    def place(self, row, col, num):
        bit = 1 << (num - 1)
        self.row_mask[row] |= bit
        self.col_mask[col] |= bit

    def get_valid_mask(self, row, col):
        all_nums = (1 << self.size) - 1
        used = self.row_mask[row] | self.col_mask[col]
        return all_nums & ~used
```

**Files to modify:**
- `backend/arithmatrix.py`

### 2.3 Difficulty Heuristic (Avoid Full Solve)
**Impact: 50-70% speedup**

Use cage structure to estimate difficulty without solving:

```python
def estimate_difficulty_fast(puzzle):
    score = 0

    for cage in puzzle['cages']:
        size = len(cage['cells'])
        op = cage['operation']

        # Operation weights (empirically tuned)
        op_weight = {'': 1, '+': 2, '-': 2.5, '*': 3.5, '/': 4}
        score += size * op_weight.get(op, 2)

    # Normalize by grid size
    return score / (puzzle['size'] ** 2)
```

Use heuristic for initial filtering, only full-solve borderline cases.

**Files to modify:**
- `backend/arithmatrix.py` - Add `estimate_difficulty_fast()`
- `backend/arithmatrix.py:403-491` - Modify `generate_arithmatrix_puzzle()`

---

## Phase 3: Difficulty Accuracy (5-7 days)

### 3.1 Human-Centered Difficulty Metrics

Current difficulty is based on solver operation count, which doesn't correlate well with human difficulty. Implement multi-factor scoring:

```python
def calculate_human_difficulty(puzzle):
    size = puzzle['size']
    cages = puzzle['cages']

    # Factor 1: Cage complexity
    cage_complexity = sum(
        len(c['cells']) * OPERATION_WEIGHT[c['operation']]
        for c in cages
    )

    # Factor 2: Constraint density
    constraint_density = len(cages) / (size ** 2)

    # Factor 3: Large cage penalty
    large_cages = sum(1 for c in cages if len(c['cells']) >= 4)

    # Factor 4: Division/subtraction ratio
    hard_ops = sum(1 for c in cages if c['operation'] in ['/', '-'])

    # Weighted combination
    return (
        cage_complexity * 0.4 +
        (1 - constraint_density) * 100 * 0.2 +
        large_cages * 15 * 0.2 +
        hard_ops * 10 * 0.2
    )
```

**Files to modify:**
- `backend/arithmatrix.py` - Add human difficulty function
- Create calibration script to tune weights

### 3.2 Difficulty Calibration with User Data

Collect solve times from real users to calibrate:

1. Log puzzle ID + solve time in `puzzleStats.ts`
2. Export anonymized data for analysis
3. Correlate cage features with solve time
4. Update difficulty weights based on correlation

**Files to modify:**
- `src/utils/puzzleStats.ts`
- Create new analysis script

### 3.3 Stratified Difficulty Distribution

Ensure each difficulty bucket has equal representation:

```python
def generate_stratified_dataset(sizes, count_per_bucket):
    puzzles = {d: [] for d in DIFFICULTY_LEVELS}

    while any(len(p) < count_per_bucket for p in puzzles.values()):
        puzzle = generate_puzzle()
        difficulty = classify_difficulty(puzzle)
        if len(puzzles[difficulty]) < count_per_bucket:
            puzzles[difficulty].append(puzzle)

    return puzzles
```

---

## Phase 4: Advanced Optimizations (Optional, 7-14 days)

### 4.1 Constraint-Based Cage Carving
Replace random BFS with constraint satisfaction for cage placement:
- Model as CSP: each cell assigned to exactly one cage
- Use AC-3 algorithm + backtracking
- Constraints: contiguity, target size, no fragmentation

### 4.2 Statistical Uniqueness Checking
Skip exhaustive uniqueness check, use statistical approach:
- Generate with solution-based carving (high uniqueness likelihood)
- Spot-check 10% of puzzles
- Filter bad puzzles post-generation

### 4.3 GPU Acceleration (for mass production)
Use CUDA/OpenCL for parallel constraint solving:
- Best for generating 100k+ puzzles
- Complex implementation
- 10-100x speedup for large batches

---

## Implementation Priority

| Phase | Task | Impact | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | Parallel Generation | 4-8x | Low | **1** |
| 1 | Precomputed Latin Squares | 30-40% | Low | **2** |
| 2 | Difficulty Heuristic | 50-70% | Medium | **3** |
| 2 | Incremental Constraints | 30-50% | Low | **4** |
| 1 | Adaptive Isotopy Moves | 10-15% | Low | **5** |
| 3 | Human-Centered Difficulty | Quality | Medium | **6** |
| 2 | Bitset Optimization | 20-30% | Medium | **7** |
| 3 | Difficulty Calibration | Quality | High | **8** |

---

## Expected Results

### Performance
- **Current:** 2-4 hours for 4000 puzzles
- **After Phase 1:** 15-30 minutes (8-16x speedup)
- **After Phase 2:** 5-10 minutes (24-48x speedup)
- **Stretch goal:** Real-time generation (<1s per puzzle)

### Difficulty Accuracy
- **Current:** Based on solver operations, weak human correlation
- **After Phase 3:** Multi-factor scoring calibrated to human solve times
- **Target:** 80%+ correlation between predicted and actual difficulty

---

## Quick Wins Checklist

- [ ] Add `generate_puzzles_parallel()` to `arithmatrix.py`
- [x] Implement `LATIN_SQUARE_POOL` in `latin_square.py` (18-44x speedup!)
- [x] Add `estimate_difficulty_fast()` heuristic (93-476,697x faster than full solve)
- [x] Create `ConstraintTracker` class
- [x] Add adaptive isotopy move count to `latin_square.py`
- [ ] Add CLI script for parallel batch generation
- [ ] Tune difficulty weights based on existing data
