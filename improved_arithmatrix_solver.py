#!/usr/bin/env python3
"""
Improved Arithmatrix Solver based on real-world human solve time analysis.
Provides human-aligned difficulty assessment that correlates with actual solve times.
"""

import json
import time
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
import statistics


class ImprovedArithmatrixSolver:
    """
    Improved solver that provides human-aligned difficulty assessment.

    Based on analysis of 86 real-world puzzle solve records, this solver:
    1. Uses size as the primary difficulty factor (r=0.705 correlation)
    2. Accounts for structural complexity factors that affect humans
    3. Provides difficulty scores that match actual solve times
    4. Considers human cognitive limitations in puzzle solving
    """

    def __init__(self):
        # Real-world median solve times by size (from analysis of 86 puzzles)
        self.base_solve_times = {
            4: 35,  # 4x4: 35 seconds median
            5: 62.5,  # 5x5: 62.5 seconds median
            6: 159,  # 6x6: 159 seconds median
            7: 416,  # 7x7: 416 seconds median
        }

        # Size scaling factors (relative to 4x4)
        self.size_scaling = {
            4: 1.0,  # Base difficulty
            5: 1.8,  # 1.8x harder than 4x4
            6: 4.5,  # 4.5x harder than 4x4
            7: 11.9,  # 11.9x harder than 4x4
        }

        # Human difficulty multipliers for operations
        # Based on correlation analysis showing operations vs solve times
        self.operation_complexity = {
            "": 1.0,  # Single cells (easiest for humans)
            "+": 1.1,  # Addition (simple mental math)
            "-": 1.3,  # Subtraction (more complex mental math)
            "*": 2.0,  # Multiplication (significantly harder)
            "/": 2.5,  # Division (hardest - requires factorization)
        }

        # Cage size complexity (humans struggle with larger cages)
        # Based on analysis showing num_cages correlation with solve time
        self.cage_size_multipliers = {
            1: 1.0,  # Single cell
            2: 1.2,  # Two cells (manageable)
            3: 1.5,  # Three cells (requires more planning)
            4: 2.0,  # Four cells (significantly harder)
            5: 3.0,  # Five cells (very difficult for humans)
        }

        # Difficulty categories based on generated puzzle distribution
        # Updated to provide balanced distribution across all difficulty levels
        self.difficulty_ranges = {
            4: {
                "easiest": (50, 72),
                "easy": (72, 78),
                "medium": (78, 84),
                "hard": (84, 91),
                "expert": (91, 116),
            },
            5: {
                "easiest": (101, 124),
                "easy": (124, 132),
                "medium": (132, 138),
                "hard": (138, 146),
                "expert": (146, 191),
            },
            6: {
                "easiest": (256, 306),
                "easy": (306, 323),
                "medium": (323, 337),
                "hard": (337, 354),
                "expert": (354, 440),
            },
            7: {
                "easiest": (662, 787),
                "easy": (787, 820),
                "medium": (820, 848),
                "hard": (848, 882),
                "expert": (882, 1027),
            },
        }

        # Reset tracking variables
        self.reset_metrics()

    def reset_metrics(self):
        """Reset difficulty tracking metrics."""
        self.operation_count = 0
        self.complexity_points = 0
        self.structural_difficulty = 0
        self.solve_start_time = None

    def analyze_puzzle_difficulty(self, puzzle: Dict) -> Dict:
        """
        Analyze puzzle difficulty using human-centered metrics.

        Args:
            puzzle: Standard Arithmatrix puzzle dictionary

        Returns:
            Dict with comprehensive difficulty analysis
        """
        size = puzzle["size"]
        cages = puzzle["cages"]

        # Base difficulty from size (primary factor - r=0.705 correlation)
        base_difficulty = self.base_solve_times.get(size, size**2 * 10)

        # Calculate structural complexity factors
        complexity_analysis = self._analyze_structural_complexity(cages, size)

        # Apply complexity multipliers to base difficulty
        complexity_multiplier = 1.0 + complexity_analysis["total_complexity_factor"]

        # Final human difficulty score (estimated solve time in seconds)
        human_difficulty_score = base_difficulty * complexity_multiplier

        # Categorize difficulty based on size-specific ranges
        difficulty_category = self._categorize_difficulty(human_difficulty_score, size)

        # Compare with current system
        current_comparison = self._compare_with_current_system(
            puzzle,
            {
                "difficulty_category": difficulty_category,
                "human_difficulty_score": human_difficulty_score,
            },
        )

        return {
            "size": size,
            "base_difficulty": base_difficulty,
            "complexity_analysis": complexity_analysis,
            "complexity_multiplier": complexity_multiplier,
            "human_difficulty_score": human_difficulty_score,
            "estimated_solve_time_seconds": human_difficulty_score,
            "difficulty_category": difficulty_category,
            "size_category": self._get_size_category(size),
            "current_system_comparison": current_comparison,
            "recommendations": self._get_difficulty_recommendations(
                complexity_analysis, size
            ),
            "human_factors": self._identify_human_challenge_factors(cages, size),
        }

    def _analyze_structural_complexity(self, cages: List[Dict], size: int) -> Dict:
        """Analyze structural factors that affect human solving difficulty."""

        # Basic cage statistics
        num_cages = len(cages)
        cage_sizes = [len(cage["cells"]) for cage in cages]
        operations = [cage["operation"] for cage in cages]
        values = [cage["value"] for cage in cages]

        # Operation distribution
        op_counts = {op: operations.count(op) for op in ["+", "-", "*", "/", ""]}

        # Complexity factors
        complexity_factors = {}

        # 1. Operation complexity (weighted by human difficulty)
        operation_complexity = 0
        for op, count in op_counts.items():
            weight = self.operation_complexity[op]
            operation_complexity += count * (weight - 1.0)  # Only add excess difficulty

        complexity_factors["operation_complexity"] = operation_complexity / num_cages

        # 2. Cage size complexity (humans struggle with large cages)
        cage_size_complexity = 0
        for cage_size in cage_sizes:
            multiplier = self.cage_size_multipliers.get(cage_size, 4.0)
            cage_size_complexity += multiplier - 1.0  # Only add excess difficulty

        complexity_factors["cage_size_complexity"] = cage_size_complexity / num_cages

        # 3. Large number complexity (mental math becomes harder)
        large_numbers = sum(1 for v in values if v > size * 2)
        complexity_factors["large_number_complexity"] = large_numbers / num_cages * 0.3

        # 4. Arithmetic complexity (specific operation challenges)
        arithmetic_complexity = 0

        # Division is especially hard for humans (needs factorization)
        division_cages = op_counts["/"]
        arithmetic_complexity += division_cages * 0.5

        # Multiplication with large products is hard
        mult_cages = [cage for cage in cages if cage["operation"] == "*"]
        for cage in mult_cages:
            if cage["value"] > 20:  # Large products are hard to factor
                arithmetic_complexity += 0.3

        complexity_factors["arithmetic_complexity"] = arithmetic_complexity / num_cages

        # 5. Visual complexity (cage distribution affects human perception)
        visual_complexity = 0

        # Many small cages create visual clutter
        small_cages = sum(1 for s in cage_sizes if s == 1)
        if small_cages > size // 2:  # More than half are single cells
            visual_complexity += 0.2

        # Very uneven cage sizes create complexity
        if len(cage_sizes) > 1:
            cage_variance = statistics.variance(cage_sizes)
            if cage_variance > 2.0:  # High variance in cage sizes
                visual_complexity += 0.1

        complexity_factors["visual_complexity"] = visual_complexity

        # Total complexity factor (sum of all factors)
        total_complexity = sum(complexity_factors.values())

        return {
            "cage_statistics": {
                "num_cages": num_cages,
                "avg_cage_size": statistics.mean(cage_sizes),
                "cage_sizes": cage_sizes,
                "operation_counts": op_counts,
            },
            "complexity_factors": complexity_factors,
            "total_complexity_factor": total_complexity,
            "complexity_breakdown": {
                f"Operation difficulty: {complexity_factors['operation_complexity']:.2f}",
                f"Cage size difficulty: {complexity_factors['cage_size_complexity']:.2f}",
                f"Large number penalty: {complexity_factors['large_number_complexity']:.2f}",
                f"Arithmetic complexity: {complexity_factors['arithmetic_complexity']:.2f}",
                f"Visual complexity: {complexity_factors['visual_complexity']:.2f}",
            },
        }

    def _categorize_difficulty(self, score: float, size: int) -> str:
        """Categorize difficulty based on size-specific real-world ranges."""
        if size not in self.difficulty_ranges:
            # For unknown sizes, extrapolate based on scaling
            base_score = score / self.size_scaling.get(size, (size / 4) ** 2)
            return self._categorize_difficulty(base_score, 4)

        ranges = self.difficulty_ranges[size]

        for category, (min_time, max_time) in ranges.items():
            if min_time <= score <= max_time:
                return category

        # Handle edge cases
        if score < ranges["easiest"][0]:
            return "easiest"
        else:
            return "expert"

    def _get_size_category(self, size: int) -> str:
        """Get human-readable size category."""
        if size <= 4:
            return "Small (beginner-friendly)"
        elif size == 5:
            return "Medium (standard)"
        elif size == 6:
            return "Large (challenging)"
        else:
            return "Extra Large (expert level)"

    def _compare_with_current_system(self, puzzle: Dict, analysis: Dict) -> Dict:
        """Compare our analysis with the current difficulty system."""

        # Get current system difficulty if available
        current_ops = puzzle.get("difficulty_operations", 0)
        current_difficulty = puzzle.get("difficultyLevel", "unknown")

        our_difficulty = analysis["difficulty_category"]
        our_score = analysis["human_difficulty_score"]

        # Determine agreement
        agreement = our_difficulty == current_difficulty

        # Calculate score difference (time vs operations - not directly comparable but shows scale)
        score_ratio = our_score / current_ops if current_ops > 0 else None

        return {
            "current_system": {
                "operations": current_ops,
                "difficulty_level": current_difficulty,
            },
            "our_system": {"score": our_score, "difficulty_level": our_difficulty},
            "agreement": agreement,
            "score_ratio": score_ratio,
            "improvement_notes": self._get_improvement_notes(
                current_difficulty, our_difficulty, our_score, current_ops
            ),
        }

    def _get_improvement_notes(
        self, current_diff: str, our_diff: str, our_score: float, current_ops: float
    ) -> List[str]:
        """Generate notes about improvements over current system."""
        notes = []

        if current_diff != our_diff:
            notes.append(
                f"Difficulty reclassified from '{current_diff}' to '{our_diff}' based on human solve times"
            )

        if current_ops > 0:
            notes.append(
                f"Human-centered score ({our_score:.0f}s) vs operation count ({current_ops:.0f})"
            )

        notes.append(
            "Uses size as primary difficulty factor (r=0.705 correlation with solve time)"
        )
        notes.append("Accounts for human cognitive limitations in mental math")
        notes.append("Based on analysis of 86 real-world puzzle completions")

        return notes

    def _get_difficulty_recommendations(
        self, complexity_analysis: Dict, size: int
    ) -> List[str]:
        """Generate recommendations for this puzzle's difficulty."""
        recommendations = []

        complexity_factors = complexity_analysis["complexity_factors"]

        # High operation complexity
        if complexity_factors["operation_complexity"] > 0.5:
            recommendations.append(
                "High operation complexity - consider reducing multiplication/division cages"
            )

        # Large cage issues
        if complexity_factors["cage_size_complexity"] > 0.8:
            recommendations.append(
                "Large cages present - humans struggle with 4+ cell cages"
            )

        # Arithmetic challenges
        if complexity_factors["arithmetic_complexity"] > 0.4:
            recommendations.append(
                "Complex arithmetic - large multiplication/division values"
            )

        # Visual complexity
        if complexity_factors["visual_complexity"] > 0.2:
            recommendations.append(
                "Visual complexity detected - uneven cage distribution"
            )

        # Size-specific recommendations
        if size >= 7:
            recommendations.append(
                "Large puzzle size - expect significant solve time variance"
            )

        if not recommendations:
            recommendations.append("Well-balanced puzzle complexity for human solvers")

        return recommendations

    def _identify_human_challenge_factors(self, cages: List[Dict], size: int) -> Dict:
        """Identify specific factors that make puzzles challenging for humans."""
        challenges = {
            "mental_math_difficulty": [],
            "visual_complexity": [],
            "logical_reasoning": [],
            "memory_load": [],
        }

        # Mental math challenges
        for cage in cages:
            op = cage["operation"]
            value = cage["value"]
            cage_size = len(cage["cells"])

            if op == "*" and value > 20:
                challenges["mental_math_difficulty"].append(
                    f"Large multiplication: {value}"
                )
            elif op == "/" and value > 1:
                challenges["mental_math_difficulty"].append(
                    f"Division requiring factorization: {value}"
                )
            elif cage_size > 3:
                challenges["logical_reasoning"].append(
                    f"Large {op if op else 'single'} cage with {cage_size} cells"
                )

        # Visual complexity
        cage_sizes = [len(cage["cells"]) for cage in cages]
        if statistics.variance(cage_sizes) > 2.0:
            challenges["visual_complexity"].append("Highly varied cage sizes")

        # Memory load
        complex_cages = sum(1 for cage in cages if len(cage["cells"]) > 2)
        if complex_cages > size // 2:
            challenges["memory_load"].append(
                f"{complex_cages} complex cages requiring constraint tracking"
            )

        return challenges

    def solve_with_human_assessment(self, puzzle: Dict) -> Dict:
        """
        Solve puzzle with human-centered difficulty assessment.

        Args:
            puzzle: Standard Arithmatrix puzzle dictionary

        Returns:
            Dict with solving results and human difficulty analysis
        """
        start_time = time.time()

        # Analyze difficulty before solving
        difficulty_analysis = self.analyze_puzzle_difficulty(puzzle)

        # For now, we'll use the existing solver for actual solving
        # In a full implementation, we'd create a human-mimicking solver
        try:
            from backend.arithmatrix import solve_arithmatrix_puzzle

            operation_count = solve_arithmatrix_puzzle(puzzle)
            solved = True
        except Exception as e:
            operation_count = 0
            solved = False

        solve_time = time.time() - start_time

        return {
            "solved": solved,
            "operation_count": operation_count,
            "solve_time_seconds": solve_time,
            "difficulty_analysis": difficulty_analysis,
            "human_prediction": {
                "estimated_solve_time": difficulty_analysis[
                    "estimated_solve_time_seconds"
                ],
                "difficulty_category": difficulty_analysis["difficulty_category"],
                "challenge_factors": difficulty_analysis["human_factors"],
            },
            "system_comparison": {
                "current_ops": operation_count,
                "human_score": difficulty_analysis["human_difficulty_score"],
                "correlation_note": "Human score based on real-world solve time correlation analysis",
            },
        }


def analyze_puzzle_difficulty(puzzle: Dict) -> Dict:
    """
    Analyze puzzle difficulty using human-centered metrics.

    Args:
        puzzle: Standard Arithmatrix puzzle dictionary

    Returns:
        Dict with detailed difficulty analysis
    """
    solver = ImprovedArithmatrixSolver()
    return solver.analyze_puzzle_difficulty(puzzle)


def solve_with_human_assessment(puzzle: Dict) -> Dict:
    """
    Solve puzzle with human-centered difficulty assessment.

    Args:
        puzzle: Standard Arithmatrix puzzle dictionary

    Returns:
        Dict with solving results and human difficulty analysis
    """
    solver = ImprovedArithmatrixSolver()
    return solver.solve_with_human_assessment(puzzle)


def main():
    """Demonstration of the improved solver."""
    print("IMPROVED ARITHMATRIX SOLVER")
    print("=" * 50)
    print(
        "Human-centered difficulty assessment based on real-world solve time analysis"
    )
    print(
        "Analyzes 86 puzzle completion records to provide accurate difficulty prediction"
    )
    print("\nKey improvements:")
    print("• Size as primary difficulty factor (r=0.705 correlation)")
    print("• Operation complexity weighting for human mental math")
    print("• Structural complexity analysis (cage sizes, visual layout)")
    print("• Size-specific difficulty categories based on real solve times")
    print("• Accounts for human cognitive limitations")

    # Example usage with a sample puzzle
    sample_puzzle = {
        "size": 4,
        "cages": [
            {"cells": [0, 1], "operation": "+", "value": 5},
            {"cells": [2], "operation": "", "value": 3},
            {"cells": [3, 7], "operation": "*", "value": 12},
            {"cells": [4, 8], "operation": "-", "value": 2},
            {"cells": [5, 6], "operation": "/", "value": 2},
            {"cells": [9, 10, 13], "operation": "+", "value": 8},
            {"cells": [11], "operation": "", "value": 1},
            {"cells": [12], "operation": "", "value": 2},
            {"cells": [14, 15], "operation": "-", "value": 1},
        ],
        "difficulty_operations": 18.5,
        "difficultyLevel": "medium",
    }

    print(f"\n" + "=" * 50)
    print("SAMPLE ANALYSIS:")
    print("=" * 50)

    analysis = analyze_puzzle_difficulty(sample_puzzle)

    print(f"Puzzle size: {analysis['size']}x{analysis['size']}")
    print(f"Base difficulty: {analysis['base_difficulty']:.0f} seconds")
    print(f"Complexity multiplier: {analysis['complexity_multiplier']:.2f}x")
    print(f"Human difficulty score: {analysis['human_difficulty_score']:.0f} seconds")
    print(f"Difficulty category: {analysis['difficulty_category']}")
    print(f"Size category: {analysis['size_category']}")

    print(f"\nComplexity breakdown:")
    for factor in analysis["complexity_analysis"]["complexity_breakdown"]:
        print(f"  • {factor}")

    print(f"\nCurrent system comparison:")
    comp = analysis["current_system_comparison"]
    print(
        f"  Current: {comp['current_system']['difficulty_level']} ({comp['current_system']['operations']} ops)"
    )
    print(
        f"  Our system: {comp['our_system']['difficulty_level']} ({comp['our_system']['score']:.0f}s)"
    )
    print(f"  Agreement: {comp['agreement']}")

    print(f"\nRecommendations:")
    for rec in analysis["recommendations"]:
        print(f"  • {rec}")


if __name__ == "__main__":
    main()
