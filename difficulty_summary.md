# KenKen Puzzle Difficulty Analysis Results

## Summary of 100+ Puzzles Generated and Solved

### Key Findings

1. **Difficulty scales exponentially with puzzle size**
2. **7x7 puzzles are extremely computationally intensive**
3. **High failure rate** due to multiple solutions and carving difficulties
4. **Operation counts vary dramatically** within the same size category

---

## Detailed Results by Size

### 4x4 Puzzles (20 attempted, 11 successful)

- **Success Rate**: 55%
- **Operation Range**: 103 - 207
- **Median**: 110 operations
- **Difficulty Level**: Consistently EASY (all in 50-499 range)

### 5x5 Puzzles (20 attempted, 12 successful)

- **Success Rate**: 60%
- **Operation Range**: 400 - 14,663
- **Median**: 3,932 operations
- **Difficulty Level**: Mostly MEDIUM to HARD

### 6x6 Puzzles (20 attempted, 17 successful)

- **Success Rate**: 85%
- **Operation Range**: 338 - 52,522
- **Median**: 716 operations
- **Difficulty Level**: Mixed EASY to HARD, with one outlier in VERY HARD

### 7x7 Puzzles (100 attempted, 66 successful)

- **Success Rate**: 66%
- **Operation Range**: 2,368 - 28,861,848
- **Median**: 367,583 operations
- **Difficulty Level**: ALL puzzles are EXPERT level (>2000 operations)

---

## Difficulty Distribution for 7x7 Puzzles

```
Percentiles:
10th: 59,987 operations
25th: 147,352 operations
50th: 367,583 operations
75th: 2,138,858 operations
90th: 4,534,796 operations
95th: 10,272,044 operations
99th: 21,610,996 operations
```

### Distribution Bins for 7x7:

- **2,000-4,999 operations**: 1 puzzle (1.5%)
- **5,000+ operations**: 65 puzzles (98.5%)

---

## Generation Challenges

### Common Failure Modes:

1. **Multiple Solutions** (~60% of failures)

   - Puzzles that don't have a unique solution
   - More common in smaller sizes

2. **Carving Failures** (~40% of failures)
   - Unable to divide the grid into contiguous cages
   - Timeout after 500 attempts

### Performance Notes:

- **4x4**: ~0.1s per puzzle
- **5x5**: ~0.02s per puzzle
- **6x6**: ~0.4s per puzzle
- **7x7**: ~2.3s per puzzle (successful only)

---

## Implications

### For Puzzle Generation:

1. **7x7 puzzles are computationally expensive** - generating 100 took ~4 minutes
2. **High variance in difficulty** - same size can produce vastly different solving times
3. **Quality vs Quantity tradeoff** - ~34% failure rate suggests need for better generation algorithms

### For Difficulty Classification:

The current difficulty categories seem inadequate for 7x7 puzzles:

- **Easy (< 100 ops)**: Only suitable for 4x4
- **Medium (100-499 ops)**: Suitable for 4x4 and some 5x5/6x6
- **Hard (500-1999 ops)**: Rare even in 6x6
- **Expert (≥ 2000 ops)**: All 7x7 puzzles

### Recommended Difficulty Scaling:

For 7x7 puzzles, suggest new categories:

- **Expert Easy**: 2,000 - 50,000 operations
- **Expert Medium**: 50,000 - 500,000 operations
- **Expert Hard**: 500,000 - 5,000,000 operations
- **Expert Extreme**: 5,000,000+ operations

---

## Technical Observations

1. **Backtracking complexity grows exponentially** with grid size
2. **Cage structure significantly impacts** solving difficulty
3. **Multiple solution detection** is a significant computational bottleneck
4. **Generation randomness** creates high variance in difficulty within same size
