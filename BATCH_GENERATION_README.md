# KenKen Batch Puzzle Generator

A comprehensive system for generating KenKen puzzles in batch and saving them with operation counts to a single JSONL file.

## Quick Start

```bash
# Generate a quick test batch (30 puzzles)
python batch_puzzle_generator.py --config quick

# Generate a larger batch (250 puzzles)
python batch_puzzle_generator.py --config default

# Analyze the generated puzzles
python inspect_puzzles.py

# View a specific puzzle
python inspect_puzzles.py --show-puzzle 0 --show-solution
```

## Features

### ✨ Random Puzzle Generation

- Generates random puzzles of specified sizes
- Automatically measures and classifies difficulty based on operation count
- Includes operation count and difficulty metadata for each puzzle

### 📊 Comprehensive Metadata

Each puzzle includes:

- Original puzzle data (cages, size, solution)
- Generation metadata (time, operation count, difficulty)
- Timestamps and version information

### 🎯 Configurable Generation

- Multiple preset configurations (quick, default)
- Custom configuration via JSON files
- Specify number of puzzles per size

### 📈 Progress Tracking

- Real-time generation progress
- Success/failure statistics
- Performance metrics

## Usage

### Basic Commands

```bash
# Quick test (30 puzzles)
python batch_puzzle_generator.py --config quick

# Full batch (400+ puzzles)
python batch_puzzle_generator.py --config default

# Custom configuration
python batch_puzzle_generator.py --config custom --custom-config my_config.json

# Custom output file
python batch_puzzle_generator.py --output-file my_puzzles.jsonl
```

### Configuration Options

#### Quick Configuration

- **4x4**: 15 puzzles
- **5x5**: 9 puzzles
- **6x6**: 4 puzzles
- **7x7**: 2 puzzles
- **Total**: 30 puzzles

#### Default Configuration

- **4x4**: 100 puzzles
- **5x5**: 75 puzzles
- **6x6**: 50 puzzles
- **7x7**: 25 puzzles
- **Total**: 250 puzzles

#### Custom Configuration Format

```json
{
  "4": 50,
  "5": 30,
  "6": 20,
  "7": 10
}
```

## Output Format

### Single File Output

All puzzles are saved to a single JSONL file (default: `puzzles.jsonl`) with complete metadata including operation counts.

### JSONL Format

Each line contains a complete puzzle with metadata:

```json
{
  "puzzle": {
    "cages": [
      { "cells": [0, 1], "operation": "/", "value": 2 },
      { "cells": [2, 6], "operation": "-", "value": 1 }
    ],
    "size": 4,
    "solution": [
      [1, 2, 3, 4],
      [2, 3, 4, 1],
      [3, 4, 1, 2],
      [4, 1, 2, 3]
    ],
    "difficulty_operations": 129,
    "target_difficulty_range": [91, 151]
  },
  "metadata": {
    "size": 4,
    "target_difficulty": "medium",
    "actual_difficulty": "medium",
    "operation_count": 129,
    "generation_time": 0.291,
    "generated_at": "2025-05-31T15:09:03.424198",
    "generator_version": "optimized_v2"
  }
}
```

## Analysis Tools

### Batch Analysis

```bash
python inspect_puzzles.py
```

Shows:

- Total puzzle count
- Difficulty distribution with operation ranges
- Size distribution with breakdowns
- Generation performance metrics

### Individual Puzzle Inspection

```bash
# Show puzzle details
python inspect_puzzles.py --show-puzzle 0

# Include solution
python inspect_puzzles.py --show-puzzle 0 --show-solution

# Show different puzzles
python inspect_puzzles.py --show-puzzle 5 --show-solution
```

## Difficulty System

### Operation Count Ranges (Optimized Solver)

| Size | Easiest      | Easy          | Medium         | Hard            | Expert          |
| ---- | ------------ | ------------- | -------------- | --------------- | --------------- |
| 4x4  | 33-48        | 48-91         | 91-151         | 151-215         | 215-350         |
| 5x5  | 84-365       | 365-428       | 428-687        | 687-962         | 962-1,633       |
| 6x6  | 867-1,578    | 1,578-9,917   | 9,917-23,319   | 23,319-45,667   | 45,667-134,535  |
| 7x7  | 7,497-49,819 | 49,819-69,529 | 69,529-117,554 | 117,554-455,452 | 455,452-593,983 |

### Performance Expectations

| Size | Generation Time | Success Rate |
| ---- | --------------- | ------------ |
| 4x4  | ~0.1-0.5s       | ~60%         |
| 5x5  | ~0.02-0.2s      | ~65%         |
| 6x6  | ~0.5-2s         | ~85%         |
| 7x7  | ~2-10s          | ~80%         |

## Implementation Details

### Generation Process

1. **Target Selection**: Choose target difficulty for puzzle
2. **Generation**: Create puzzle using optimized generator
3. **Measurement**: Solve puzzle to count operations
4. **Classification**: Determine actual difficulty based on operation count
5. **Storage**: Save to appropriate JSONL file

### Difficulty Classification

- Puzzles are classified based on their actual operation count
- Uses percentile ranges from empirical analysis
- Falls back to closest range if exact match not found

### Error Handling

- Continues generation on individual puzzle failures
- Tracks failure rates and reasons
- Provides fallback strategies for difficult targets

## Example Usage Scenarios

### Research & Analysis

```bash
# Generate large dataset
python batch_puzzle_generator.py --config default --output-file research_data.jsonl

# Analyze patterns
python inspect_puzzles.py --batch-file research_data.jsonl
```

### Game Development

```bash
# Generate balanced puzzle set
python batch_puzzle_generator.py --config custom --custom-config game_config.json

# Extract specific puzzles
head -10 puzzles.jsonl > sample_puzzles.jsonl
```

### Performance Testing

```bash
# Quick verification
python batch_puzzle_generator.py --config quick

# Check generation performance
python inspect_puzzles.py | grep "GENERATION PERFORMANCE" -A 5
```

## Troubleshooting

### Common Issues

1. **Low Success Rates**

   - 7x7 expert puzzles may have lower success rates
   - Increase `max_difficulty_attempts` in generator for better targeting

2. **Generation Times**

   - 7x7 puzzles take significantly longer
   - Consider smaller batch sizes for 7x7 expert

3. **Difficulty Misclassification**
   - Some puzzles may end up in different difficulty files than targeted
   - This is normal due to generation variance

### Performance Tips

1. **Optimize for Speed**

   - Use smaller batch sizes for testing
   - Focus on 4x4-6x6 for faster generation

2. **Optimize for Quality**
   - Increase attempts for better difficulty targeting
   - Use larger sample sizes for more representative data

## Technical Notes

- Uses optimized solver with MCV heuristic and constraint propagation
- Operation counts are 5-8x lower than previous solver versions
- Percentile-based difficulty ensures consistent relative difficulty across sizes
- JSONL format allows streaming processing and easy data manipulation

## Files Created

- `batch_puzzle_generator.py` - Main generation script
- `inspect_puzzles.py` - Analysis and inspection utility
- `sample_config.json` - Example custom configuration
- Generated puzzle files (easiest.jsonl, easy.jsonl, etc.)

This system provides a complete solution for bulk KenKen puzzle generation with automatic difficulty classification and comprehensive analysis tools.
