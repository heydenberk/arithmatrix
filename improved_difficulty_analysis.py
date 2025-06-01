#!/usr/bin/env python3
"""
Improved KenKen Difficulty Analysis - Phase 1
=============================================

This module implements a more human-aligned difficulty analysis system for KenKen puzzles,
replacing the operation-counting approach with metrics based on:

1. Logical solving techniques required
2. Puzzle structure complexity
3. Constraint interaction density
4. Weighted combination of factors

The goal is to create difficulty ratings that better reflect actual human solving experience.
"""

import json
import math
import statistics
from dataclasses import dataclass
from typing import Dict, List, Tuple, Any
from collections import Counter, defaultdict


@dataclass
class PuzzleDifficultyAnalysis:
    """Comprehensive difficulty analysis for a KenKen puzzle."""

    # Core metrics
    cage_complexity_score: float
    constraint_density_score: float
    arithmetic_difficulty_score: float
    structural_complexity_score: float

    # Derived scores
    logical_complexity_score: float
    overall_difficulty_score: float

    # Breakdown details
    cage_operation_counts: Dict[str, int]
    large_cage_penalty: float
    single_cell_bonus: float
    operation_difficulty_breakdown: Dict[str, float]

    # Human-readable difficulty
    estimated_difficulty_level: str
    confidence_score: float


class ImprovedDifficultyAnalyzer:
    """Analyzer that evaluates KenKen puzzles using human-aligned metrics."""

    # Weights for different operations based on human solving difficulty
    OPERATION_WEIGHTS = {
        "": 1.0,  # Single cell - easiest
        "+": 2.0,  # Addition - easy mental math
        "-": 3.5,  # Subtraction - requires trial/error for larger cages
        "*": 4.0,  # Multiplication - harder mental math
        "/": 5.5,  # Division - hardest, requires factorization
    }

    # Penalty multipliers for cage sizes
    CAGE_SIZE_MULTIPLIERS = {
        1: 0.5,  # Single cells are easier
        2: 1.0,  # Standard difficulty
        3: 1.8,  # Noticeably harder
        4: 3.2,  # Significantly harder
        5: 5.0,  # Very difficult
        6: 8.0,  # Extremely difficult
    }

    # Difficulty level thresholds (calibrated)
    DIFFICULTY_THRESHOLDS = {
        "easiest": (0, 15),
        "easy": (15, 30),
        "medium": (30, 50),
        "hard": (50, 75),
        "expert": (75, 999),
    }

    def analyze_puzzle(self, puzzle: Dict[str, Any]) -> PuzzleDifficultyAnalysis:
        """
        Perform comprehensive difficulty analysis on a KenKen puzzle.

        Args:
            puzzle: Dictionary containing puzzle data with 'cages', 'size', etc.

        Returns:
            PuzzleDifficultyAnalysis object with detailed metrics
        """
        size = puzzle["size"]
        cages = puzzle["cages"]

        # 1. Analyze cage complexity
        cage_complexity = self._analyze_cage_complexity(cages)

        # 2. Calculate constraint density
        constraint_density = self._calculate_constraint_density(cages, size)

        # 3. Evaluate arithmetic difficulty
        arithmetic_difficulty = self._evaluate_arithmetic_difficulty(cages)

        # 4. Assess structural complexity
        structural_complexity = self._assess_structural_complexity(cages, size)

        # 5. Calculate logical complexity (techniques required)
        logical_complexity = self._estimate_logical_complexity(cages, size)

        # 6. Compute overall difficulty score
        overall_score = self._compute_overall_score(
            cage_complexity,
            constraint_density,
            arithmetic_difficulty,
            structural_complexity,
            logical_complexity,
            size,
        )

        # 7. Determine difficulty level and confidence
        difficulty_level, confidence = self._classify_difficulty(overall_score, size)

        # 8. Generate detailed breakdown
        operation_counts = Counter(cage["operation"] for cage in cages)
        large_cage_penalty = sum(
            self.CAGE_SIZE_MULTIPLIERS.get(len(cage["cells"]), 10)
            for cage in cages
            if len(cage["cells"]) > 3
        )
        single_cell_bonus = sum(1 for cage in cages if len(cage["cells"]) == 1) * -2

        operation_breakdown = {}
        for op, count in operation_counts.items():
            op_display = "single_cell" if op == "" else op
            avg_cage_size = statistics.mean(
                [len(cage["cells"]) for cage in cages if cage["operation"] == op]
            )
            operation_breakdown[op_display] = (
                count * self.OPERATION_WEIGHTS[op] * avg_cage_size
            )

        return PuzzleDifficultyAnalysis(
            cage_complexity_score=cage_complexity,
            constraint_density_score=constraint_density,
            arithmetic_difficulty_score=arithmetic_difficulty,
            structural_complexity_score=structural_complexity,
            logical_complexity_score=logical_complexity,
            overall_difficulty_score=overall_score,
            cage_operation_counts=dict(operation_counts),
            large_cage_penalty=large_cage_penalty,
            single_cell_bonus=single_cell_bonus,
            operation_difficulty_breakdown=operation_breakdown,
            estimated_difficulty_level=difficulty_level,
            confidence_score=confidence,
        )

    def _analyze_cage_complexity(self, cages: List[Dict]) -> float:
        """Calculate complexity score based on cage operations and sizes."""
        total_complexity = 0

        for cage in cages:
            operation = cage["operation"]
            cage_size = len(cage["cells"])

            # Base complexity from operation type
            base_complexity = self.OPERATION_WEIGHTS[operation]

            # Multiply by cage size difficulty
            size_multiplier = self.CAGE_SIZE_MULTIPLIERS.get(cage_size, cage_size * 2)

            cage_complexity = base_complexity * size_multiplier

            # Additional complexity for specific operation/size combinations
            if operation == "/" and cage_size != 2:
                cage_complexity *= 2  # Division only makes sense with 2 cells
            elif operation == "-" and cage_size > 2:
                cage_complexity *= 1.5  # Subtraction harder with more cells
            elif operation == "*" and cage_size > 3:
                cage_complexity *= 1.3  # Large multiplication cages are tricky

            total_complexity += cage_complexity

        return total_complexity

    def _calculate_constraint_density(self, cages: List[Dict], size: int) -> float:
        """Calculate how constrained each cell is on average."""
        total_cells = size * size

        # Count constraints per cell (row + column + cage)
        cell_constraints = defaultdict(int)

        for cage in cages:
            constraint_strength = self.OPERATION_WEIGHTS[cage["operation"]]
            cage_size = len(cage["cells"])

            # Larger cages create more complex constraints
            adjusted_strength = constraint_strength * math.log(cage_size + 1)

            for cell in cage["cells"]:
                cell_constraints[cell] += adjusted_strength

        # Each cell also has row/column constraints
        for cell in range(total_cells):
            cell_constraints[cell] += size * 0.5  # Row + column constraint weight

        avg_constraint_density = sum(cell_constraints.values()) / total_cells

        # Normalize by puzzle size (larger puzzles naturally have more constraints)
        normalized_density = avg_constraint_density / (size**1.5)

        return normalized_density

    def _evaluate_arithmetic_difficulty(self, cages: List[Dict]) -> float:
        """Evaluate the mental math difficulty of cage operations."""
        arithmetic_score = 0

        for cage in cages:
            operation = cage["operation"]
            target_value = cage["value"]
            cage_size = len(cage["cells"])

            if operation == "":
                continue  # Single cells have no arithmetic

            # Base difficulty from operation type
            base_difficulty = self.OPERATION_WEIGHTS[operation] - 1

            # Adjust based on target value complexity
            if operation == "*":
                # Factor complexity (harder for numbers with many factors)
                factor_complexity = len(self._get_factors(target_value))
                arithmetic_score += base_difficulty * factor_complexity * 0.3
            elif operation == "/":
                # Division difficulty based on whether result is obvious
                if target_value <= cage_size:
                    arithmetic_score += base_difficulty * 0.8
                else:
                    arithmetic_score += base_difficulty * 1.5
            elif operation in ["+", "-"]:
                # Addition/subtraction difficulty based on target size relative to cage
                expected_sum = cage_size * (cage_size + 1) / 2  # Rough estimate
                if target_value > expected_sum * 1.5:
                    arithmetic_score += base_difficulty * 1.3
                else:
                    arithmetic_score += base_difficulty

        return arithmetic_score

    def _assess_structural_complexity(self, cages: List[Dict], size: int) -> float:
        """Assess how the cage structure affects solving difficulty."""
        # 1. Cage size distribution
        cage_sizes = [len(cage["cells"]) for cage in cages]
        size_variance = statistics.variance(cage_sizes) if len(cage_sizes) > 1 else 0

        # 2. Operation distribution balance
        operations = [cage["operation"] for cage in cages]
        operation_counts = Counter(operations)
        operation_balance = 1.0 / len(operation_counts) if operation_counts else 1.0

        # 3. Spatial distribution of cage types
        # (This is simplified - could be enhanced with actual spatial analysis)
        spatial_complexity = len(cage_sizes) / (size * size) * 10

        # 4. Single cell frequency (too many makes puzzle easier)
        single_cell_ratio = operation_counts.get("", 0) / len(cages)
        single_cell_penalty = max(0, single_cell_ratio - 0.3) * 5

        structural_score = (
            size_variance
            + (1 - operation_balance) * 3
            + spatial_complexity
            - single_cell_penalty
        )

        return max(0, structural_score)

    def _estimate_logical_complexity(self, cages: List[Dict], size: int) -> float:
        """Estimate what solving techniques are likely required."""
        # This is a heuristic-based estimate of logical complexity

        complexity_score = 0

        # 1. Constraint propagation complexity
        avg_cage_size = statistics.mean([len(cage["cells"]) for cage in cages])
        if avg_cage_size > 3:
            complexity_score += 3  # Requires advanced constraint reasoning
        elif avg_cage_size > 2:
            complexity_score += 1.5

        # 2. Need for guess-and-check (estimated)
        large_cages = sum(1 for cage in cages if len(cage["cells"]) > 4)
        complex_operations = sum(1 for cage in cages if cage["operation"] in ["*", "/"])

        if large_cages > 0 and complex_operations > size / 2:
            complexity_score += 5  # Likely requires trial and error
        elif large_cages > 0 or complex_operations > size:
            complexity_score += 2

        # 3. Hidden singles vs naked singles ratio
        single_cells = sum(1 for cage in cages if len(cage["cells"]) == 1)
        if single_cells < size / 3:
            complexity_score += 2  # Fewer obvious starting points

        # 4. Mathematical reasoning complexity
        division_cages = sum(1 for cage in cages if cage["operation"] == "/")
        multiplication_cages = sum(1 for cage in cages if cage["operation"] == "*")

        math_complexity = (
            (division_cages * 1.5 + multiplication_cages * 1.0) / len(cages) * 5
        )
        complexity_score += math_complexity

        return complexity_score

    def _compute_overall_score(
        self,
        cage_complexity: float,
        constraint_density: float,
        arithmetic_difficulty: float,
        structural_complexity: float,
        logical_complexity: float,
        size: int,
    ) -> float:
        """Combine all metrics into overall difficulty score."""

        # Weighted combination (these weights are tunable)
        weights = {
            "cage_complexity": 0.3,
            "constraint_density": 0.2,
            "arithmetic_difficulty": 0.2,
            "structural_complexity": 0.1,
            "logical_complexity": 0.2,
        }

        raw_score = (
            cage_complexity * weights["cage_complexity"]
            + constraint_density * weights["constraint_density"]
            + arithmetic_difficulty * weights["arithmetic_difficulty"]
            + structural_complexity * weights["structural_complexity"]
            + logical_complexity * weights["logical_complexity"]
        )

        # Size-based adjustment (larger puzzles are inherently harder)
        size_multiplier = 1.0 + (size - 4) * 0.1  # 4x4 = 1.0, 5x5 = 1.1, etc.

        final_score = raw_score * size_multiplier

        return final_score

    def _classify_difficulty(self, score: float, size: int) -> Tuple[str, float]:
        """Classify overall score into difficulty level with confidence."""

        # Adjust thresholds slightly based on size
        size_adjustment = (
            size - 4
        ) * 2  # Larger puzzles get slightly higher thresholds

        for level, (min_thresh, max_thresh) in self.DIFFICULTY_THRESHOLDS.items():
            adjusted_min = min_thresh + size_adjustment
            adjusted_max = max_thresh + size_adjustment

            if adjusted_min <= score < adjusted_max:
                # Calculate confidence based on distance from threshold boundaries
                mid_point = (adjusted_min + adjusted_max) / 2
                distance_from_boundary = min(
                    abs(score - adjusted_min), abs(score - adjusted_max)
                )
                max_distance = (adjusted_max - adjusted_min) / 2
                confidence = distance_from_boundary / max_distance

                return level, confidence

        # If score is above all thresholds
        return "expert", 0.8

    def _get_factors(self, n: int) -> List[int]:
        """Get all factors of a number (for multiplication complexity)."""
        factors = []
        for i in range(1, int(n**0.5) + 1):
            if n % i == 0:
                factors.append(i)
                if i != n // i:
                    factors.append(n // i)
        return sorted(factors)


def analyze_puzzle_file(filename: str, max_puzzles: int = None) -> Dict[str, Any]:
    """
    Analyze all puzzles in a JSONL file using the improved difficulty system.

    Args:
        filename: Path to JSONL file containing puzzles
        max_puzzles: Maximum number of puzzles to analyze (None for all)

    Returns:
        Dictionary containing analysis results and statistics
    """
    analyzer = ImprovedDifficultyAnalyzer()
    results = {
        "total_analyzed": 0,
        "by_size": defaultdict(list),
        "by_old_difficulty": defaultdict(list),
        "by_new_difficulty": defaultdict(list),
        "comparison_stats": {},
        "detailed_results": [],
    }

    print(f"🔍 Analyzing puzzles from {filename}...")

    try:
        with open(filename, "r") as f:
            for line_num, line in enumerate(f, 1):
                if max_puzzles and results["total_analyzed"] >= max_puzzles:
                    break

                try:
                    data = json.loads(line.strip())
                    puzzle = data["puzzle"]
                    metadata = data.get("metadata", {})

                    # Perform new analysis
                    analysis = analyzer.analyze_puzzle(puzzle)

                    # Extract old difficulty info
                    old_difficulty = metadata.get("actual_difficulty", "unknown")
                    old_operations = puzzle.get("difficulty_operations", 0)

                    # Store results
                    result = {
                        "line_number": line_num,
                        "size": puzzle["size"],
                        "old_difficulty": old_difficulty,
                        "old_operations": old_operations,
                        "new_analysis": analysis,
                        "metadata": metadata,
                    }

                    results["detailed_results"].append(result)
                    results["by_size"][puzzle["size"]].append(result)
                    results["by_old_difficulty"][old_difficulty].append(result)
                    results["by_new_difficulty"][
                        analysis.estimated_difficulty_level
                    ].append(result)
                    results["total_analyzed"] += 1

                    # Progress indicator
                    if results["total_analyzed"] % 100 == 0:
                        print(f"  Processed {results['total_analyzed']} puzzles...")

                except json.JSONDecodeError:
                    print(f"  ⚠️  Skipping invalid JSON at line {line_num}")
                    continue
                except Exception as e:
                    print(f"  ⚠️  Error processing line {line_num}: {e}")
                    continue

    except FileNotFoundError:
        print(f"❌ File not found: {filename}")
        return results
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return results

    print(f"✅ Analysis complete! Processed {results['total_analyzed']} puzzles.")

    # Generate comparison statistics
    results["comparison_stats"] = _generate_comparison_stats(results)

    return results


def _generate_comparison_stats(results: Dict[str, Any]) -> Dict[str, Any]:
    """Generate statistics comparing old vs new difficulty systems."""
    stats = {
        "agreement_rate": {},
        "difficulty_distribution": {},
        "size_analysis": {},
        "operation_correlation": {},
    }

    # Calculate agreement rates
    total = results["total_analyzed"]
    if total == 0:
        return stats

    agreements = 0
    for result in results["detailed_results"]:
        if (
            result["old_difficulty"]
            == result["new_analysis"].estimated_difficulty_level
        ):
            agreements += 1

    stats["agreement_rate"]["overall"] = agreements / total

    # Agreement by size
    for size, size_results in results["by_size"].items():
        size_agreements = sum(
            1
            for r in size_results
            if r["old_difficulty"] == r["new_analysis"].estimated_difficulty_level
        )
        stats["agreement_rate"][f"size_{size}"] = size_agreements / len(size_results)

    # Difficulty distribution comparison
    old_dist = {
        level: len(puzzles) for level, puzzles in results["by_old_difficulty"].items()
    }
    new_dist = {
        level: len(puzzles) for level, puzzles in results["by_new_difficulty"].items()
    }

    stats["difficulty_distribution"] = {"old_system": old_dist, "new_system": new_dist}

    # Size-based analysis
    for size, size_results in results["by_size"].items():
        if not size_results:
            continue

        old_ops = [r["old_operations"] for r in size_results if r["old_operations"] > 0]
        new_scores = [r["new_analysis"].overall_difficulty_score for r in size_results]

        if old_ops and new_scores:
            # Calculate correlation coefficient (simplified)
            correlation = (
                statistics.correlation(old_ops, new_scores) if len(old_ops) > 1 else 0
            )

            stats["size_analysis"][size] = {
                "count": len(size_results),
                "old_ops_range": (min(old_ops), max(old_ops)) if old_ops else (0, 0),
                "new_score_range": (min(new_scores), max(new_scores)),
                "correlation": correlation,
            }

    return stats


def print_analysis_summary(results: Dict[str, Any]):
    """Print a comprehensive summary of the analysis results."""
    print("\n" + "=" * 70)
    print("🎯 IMPROVED KENKEN DIFFICULTY ANALYSIS RESULTS")
    print("=" * 70)

    total = results["total_analyzed"]
    if total == 0:
        print("❌ No puzzles were successfully analyzed.")
        return

    print(f"\n📊 OVERALL STATISTICS")
    print(f"   Total puzzles analyzed: {total:,}")
    print(f"   Puzzle sizes: {sorted(results['by_size'].keys())}")

    # Agreement analysis
    agreement_rate = results["comparison_stats"]["agreement_rate"]["overall"]
    print(f"\n🎯 DIFFICULTY SYSTEM COMPARISON")
    print(f"   Overall agreement rate: {agreement_rate:.1%}")

    print(f"\n   Agreement by size:")
    for size in sorted(results["by_size"].keys()):
        if f"size_{size}" in results["comparison_stats"]["agreement_rate"]:
            rate = results["comparison_stats"]["agreement_rate"][f"size_{size}"]
            count = len(results["by_size"][size])
            print(f"     {size}x{size}: {rate:.1%} ({count} puzzles)")

    # Difficulty distribution
    print(f"\n📈 DIFFICULTY DISTRIBUTION COMPARISON")
    old_dist = results["comparison_stats"]["difficulty_distribution"]["old_system"]
    new_dist = results["comparison_stats"]["difficulty_distribution"]["new_system"]

    all_levels = sorted(set(old_dist.keys()) | set(new_dist.keys()))
    print(f"   {'Level':<10} {'Old System':<12} {'New System':<12} {'Difference'}")
    print(f"   {'-' * 10} {'-' * 12} {'-' * 12} {'-' * 10}")

    for level in all_levels:
        old_count = old_dist.get(level, 0)
        new_count = new_dist.get(level, 0)
        diff = new_count - old_count
        diff_str = f"{diff:+d}" if diff != 0 else "0"
        print(f"   {level:<10} {old_count:<12} {new_count:<12} {diff_str}")

    # Size analysis
    print(f"\n🔍 SIZE-BASED ANALYSIS")
    for size in sorted(results["by_size"].keys()):
        if size in results["comparison_stats"]["size_analysis"]:
            analysis = results["comparison_stats"]["size_analysis"][size]
            correlation = analysis["correlation"]
            old_range = analysis["old_ops_range"]
            new_range = analysis["new_score_range"]

            print(f"\n   {size}x{size} puzzles ({analysis['count']} total):")
            print(f"     Old operation range: {old_range[0]:,} - {old_range[1]:,}")
            print(f"     New difficulty range: {new_range[0]:.1f} - {new_range[1]:.1f}")
            print(f"     Correlation coefficient: {correlation:.3f}")

    # Sample detailed results
    print(f"\n🔬 SAMPLE DETAILED RESULTS")
    sample_sizes = [4, 5, 6, 7]
    for size in sample_sizes:
        if size in results["by_size"] and results["by_size"][size]:
            sample = results["by_size"][size][0]  # First puzzle of this size
            analysis = sample["new_analysis"]

            print(f"\n   Sample {size}x{size} puzzle:")
            print(
                f"     Old: {sample['old_difficulty']} ({sample['old_operations']:,} ops)"
            )
            print(
                f"     New: {analysis.estimated_difficulty_level} ({analysis.overall_difficulty_score:.1f} score)"
            )
            print(f"     Confidence: {analysis.confidence_score:.2f}")
            print(
                f"     Breakdown: cage={analysis.cage_complexity_score:.1f}, "
                f"constraint={analysis.constraint_density_score:.1f}, "
                f"arithmetic={analysis.arithmetic_difficulty_score:.1f}"
            )


if __name__ == "__main__":
    # Analyze all puzzles in the main dataset
    results = analyze_puzzle_file(
        "all_puzzles.jsonl", max_puzzles=5000
    )  # Increase limit to get more sizes
    print_analysis_summary(results)

    # Save detailed results
    output_filename = "improved_difficulty_analysis_results.json"
    with open(output_filename, "w") as f:
        # Convert dataclass objects to dictionaries for JSON serialization
        serializable_results = results.copy()
        for result in serializable_results["detailed_results"]:
            analysis = result["new_analysis"]
            result["new_analysis"] = {
                "cage_complexity_score": analysis.cage_complexity_score,
                "constraint_density_score": analysis.constraint_density_score,
                "arithmetic_difficulty_score": analysis.arithmetic_difficulty_score,
                "structural_complexity_score": analysis.structural_complexity_score,
                "logical_complexity_score": analysis.logical_complexity_score,
                "overall_difficulty_score": analysis.overall_difficulty_score,
                "estimated_difficulty_level": analysis.estimated_difficulty_level,
                "confidence_score": analysis.confidence_score,
                "cage_operation_counts": analysis.cage_operation_counts,
                "operation_difficulty_breakdown": analysis.operation_difficulty_breakdown,
            }

        json.dump(serializable_results, f, indent=2)

    print(f"\n💾 Detailed results saved to: {output_filename}")
