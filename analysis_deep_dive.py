#!/usr/bin/env python3
"""
Deep Analysis of Improved Difficulty System Results
==================================================

This script provides detailed analysis of how the new human-aligned difficulty system
compares to the old operation-counting system.
"""

import json
import statistics
from collections import defaultdict, Counter


def load_analysis_results(filename="improved_difficulty_analysis_results.json"):
    """Load the analysis results from JSON file."""
    with open(filename, "r") as f:
        return json.load(f)


def analyze_size_trends(results):
    """Analyze how difficulty scaling differs between old and new systems."""
    print("\n" + "=" * 80)
    print("📏 SIZE SCALING ANALYSIS")
    print("=" * 80)

    print("\nHow difficulty scales with puzzle size:")
    print(
        f"{'Size':<6} {'Old Median Ops':<15} {'New Median Score':<18} {'Old Range':<25} {'New Range'}"
    )
    print("-" * 85)

    for size in sorted(results["by_size"].keys()):
        size_results = results["by_size"][str(size)]

        old_ops = [r["old_operations"] for r in size_results if r["old_operations"] > 0]
        new_scores = [
            r["new_analysis"]["overall_difficulty_score"] for r in size_results
        ]

        if old_ops and new_scores:
            old_median = statistics.median(old_ops)
            new_median = statistics.median(new_scores)
            old_range = f"{min(old_ops):,}-{max(old_ops):,}"
            new_range = f"{min(new_scores):.1f}-{max(new_scores):.1f}"

            print(
                f"{size}x{size:<4} {old_median:<15,.0f} {new_median:<18.1f} {old_range:<25} {new_range}"
            )


def analyze_disagreements(results):
    """Analyze where the old and new systems disagree most."""
    print("\n" + "=" * 80)
    print("🔍 DISAGREEMENT ANALYSIS")
    print("=" * 80)

    # Count disagreement patterns
    disagreement_patterns = defaultdict(int)

    for result in results["detailed_results"]:
        old_diff = result["old_difficulty"]
        new_diff = result["new_analysis"]["estimated_difficulty_level"]

        if old_diff != new_diff:
            pattern = f"{old_diff} → {new_diff}"
            disagreement_patterns[pattern] += 1

    print("\nMost common disagreement patterns:")
    print(f"{'Old → New':<20} {'Count':<8} {'%'}")
    print("-" * 35)

    total_disagreements = sum(disagreement_patterns.values())
    for pattern, count in sorted(
        disagreement_patterns.items(), key=lambda x: x[1], reverse=True
    )[:10]:
        percentage = count / total_disagreements * 100
        print(f"{pattern:<20} {count:<8} {percentage:.1f}%")


def analyze_by_cage_characteristics(results):
    """Analyze how different cage characteristics affect difficulty assessments."""
    print("\n" + "=" * 80)
    print("🏗️  CAGE CHARACTERISTICS ANALYSIS")
    print("=" * 80)

    # Group puzzles by characteristics
    by_avg_cage_size = defaultdict(list)
    by_operation_mix = defaultdict(list)
    by_single_cell_ratio = defaultdict(list)

    for result in results["detailed_results"]:
        # Reconstruct puzzle data for analysis
        size = result["size"]
        old_diff = result["old_difficulty"]
        new_diff = result["new_analysis"]["estimated_difficulty_level"]
        new_score = result["new_analysis"]["overall_difficulty_score"]
        old_ops = result["old_operations"]

        # We need to estimate characteristics from what we have
        # (In a real implementation, we'd store the original puzzle data)

        # For now, use the operation breakdown as a proxy
        op_breakdown = result["new_analysis"]["operation_difficulty_breakdown"]

        # Estimate operation diversity
        op_types = len(op_breakdown)
        by_operation_mix[op_types].append(
            {
                "old_diff": old_diff,
                "new_diff": new_diff,
                "new_score": new_score,
                "old_ops": old_ops,
                "size": size,
            }
        )

    print("\nDifficulty assessment by operation diversity:")
    print(
        f"{'Op Types':<10} {'Count':<8} {'Agreement Rate':<15} {'Avg New Score':<15} {'Avg Old Ops'}"
    )
    print("-" * 70)

    for op_types in sorted(by_operation_mix.keys()):
        group = by_operation_mix[op_types]
        agreements = sum(1 for p in group if p["old_diff"] == p["new_diff"])
        agreement_rate = agreements / len(group)
        avg_new_score = statistics.mean([p["new_score"] for p in group])
        avg_old_ops = statistics.mean([p["old_ops"] for p in group if p["old_ops"] > 0])

        print(
            f"{op_types:<10} {len(group):<8} {agreement_rate:<15.1%} {avg_new_score:<15.1f} {avg_old_ops:,.0f}"
        )


def analyze_extreme_cases(results):
    """Analyze the most extreme disagreements between systems."""
    print("\n" + "=" * 80)
    print("🚨 EXTREME DISAGREEMENT CASES")
    print("=" * 80)

    # Define difficulty ordering
    difficulty_order = {"easiest": 0, "easy": 1, "medium": 2, "hard": 3, "expert": 4}

    extreme_cases = []

    for result in results["detailed_results"]:
        old_diff = result["old_difficulty"]
        new_diff = result["new_analysis"]["estimated_difficulty_level"]

        if old_diff in difficulty_order and new_diff in difficulty_order:
            old_level = difficulty_order[old_diff]
            new_level = difficulty_order[new_diff]
            disagreement_magnitude = abs(old_level - new_level)

            if disagreement_magnitude >= 2:  # 2+ levels of disagreement
                extreme_cases.append(
                    {
                        "result": result,
                        "disagreement": disagreement_magnitude,
                        "old_level": old_level,
                        "new_level": new_level,
                    }
                )

    extreme_cases.sort(key=lambda x: x["disagreement"], reverse=True)

    print(f"\nFound {len(extreme_cases)} cases with 2+ levels of disagreement:")
    print(
        f"{'Size':<6} {'Old':<8} {'New':<8} {'Old Ops':<12} {'New Score':<12} {'Confidence'}"
    )
    print("-" * 65)

    for case in extreme_cases[:20]:  # Show top 20
        result = case["result"]
        analysis = result["new_analysis"]

        print(
            f"{result['size']}x{result['size']:<4} "
            f"{result['old_difficulty']:<8} "
            f"{analysis['estimated_difficulty_level']:<8} "
            f"{result['old_operations']:<12,} "
            f"{analysis['overall_difficulty_score']:<12.1f} "
            f"{analysis['confidence_score']:.2f}"
        )


def analyze_correlation_breakdown(results):
    """Analyze correlation between old and new systems by different factors."""
    print("\n" + "=" * 80)
    print("📊 CORRELATION BREAKDOWN ANALYSIS")
    print("=" * 80)

    print("\nCorrelation between old operations and new score components:")
    print(f"{'Component':<25} {'4x4':<8} {'5x5':<8} {'6x6':<8} {'7x7':<8}")
    print("-" * 60)

    components = [
        "overall_difficulty_score",
        "cage_complexity_score",
        "constraint_density_score",
        "arithmetic_difficulty_score",
        "structural_complexity_score",
        "logical_complexity_score",
    ]

    for component in components:
        correlations = []
        for size in [4, 5, 6, 7]:
            if str(size) in results["by_size"]:
                size_results = results["by_size"][str(size)]
                old_ops = [
                    r["old_operations"] for r in size_results if r["old_operations"] > 0
                ]
                new_scores = [r["new_analysis"][component] for r in size_results]

                if len(old_ops) > 1 and len(new_scores) > 1:
                    try:
                        corr = statistics.correlation(old_ops, new_scores)
                        correlations.append(f"{corr:.3f}")
                    except:
                        correlations.append("N/A")
                else:
                    correlations.append("N/A")
            else:
                correlations.append("N/A")

        component_name = component.replace("_", " ").title()[:24]
        print(
            f"{component_name:<25} {correlations[0]:<8} {correlations[1]:<8} {correlations[2]:<8} {correlations[3]:<8}"
        )


def generate_recommendations(results):
    """Generate recommendations based on the analysis."""
    print("\n" + "=" * 80)
    print("💡 RECOMMENDATIONS")
    print("=" * 80)

    total_analyzed = results["total_analyzed"]
    agreement_rate = results["comparison_stats"]["agreement_rate"]["overall"]

    print(f"\nBased on analysis of {total_analyzed:,} puzzles:")

    print(f"\n1. 📉 POOR OVERALL AGREEMENT ({agreement_rate:.1%})")
    print(
        f"   - The new system disagrees with the old system {(1 - agreement_rate):.1%} of the time"
    )
    print(f"   - This suggests the operation-counting approach has fundamental issues")

    # Analyze the direction of disagreements
    downgrades = 0  # New system rates as easier
    upgrades = 0  # New system rates as harder

    difficulty_order = {"easiest": 0, "easy": 1, "medium": 2, "hard": 3, "expert": 4}

    for result in results["detailed_results"]:
        old_diff = result["old_difficulty"]
        new_diff = result["new_analysis"]["estimated_difficulty_level"]

        if old_diff in difficulty_order and new_diff in difficulty_order:
            old_level = difficulty_order[old_diff]
            new_level = difficulty_order[new_diff]

            if new_level < old_level:
                downgrades += 1
            elif new_level > old_level:
                upgrades += 1

    print(f"\n2. 📊 DISAGREEMENT PATTERNS")
    print(
        f"   - New system rates {downgrades:,} puzzles as EASIER ({downgrades / total_analyzed:.1%})"
    )
    print(
        f"   - New system rates {upgrades:,} puzzles as HARDER ({upgrades / total_analyzed:.1%})"
    )

    # Check correlation by size
    size_correlations = []
    for size in [4, 5, 6, 7]:
        if str(size) in results["comparison_stats"]["size_analysis"]:
            corr = results["comparison_stats"]["size_analysis"][str(size)][
                "correlation"
            ]
            size_correlations.append((size, corr))

    print(f"\n3. 📉 CORRELATION DETERIORATES WITH SIZE")
    for size, corr in size_correlations:
        quality = "Strong" if abs(corr) > 0.3 else "Weak" if abs(corr) > 0.1 else "None"
        print(f"   - {size}x{size}: {corr:.3f} ({quality} correlation)")

    print(f"\n4. 🎯 RECOMMENDED ACTIONS")
    print(f"   a) CALIBRATE NEW THRESHOLDS: Current thresholds may be too low")
    print(f"   b) VALIDATE WITH HUMAN SOLVERS: Test actual solving difficulty")
    print(f"   c) REFINE WEIGHTS: Adjust component weights based on human feedback")
    print(f"   d) SIZE-SPECIFIC MODELS: Different models for different puzzle sizes")
    print(
        f"   e) HYBRID APPROACH: Combine structure analysis with limited operation counting"
    )


def main():
    """Run the complete deep analysis."""
    print("🔬 DEEP ANALYSIS OF KENKEN DIFFICULTY SYSTEMS")
    print("Loading analysis results...")

    try:
        results = load_analysis_results()

        analyze_size_trends(results)
        analyze_disagreements(results)
        analyze_by_cage_characteristics(results)
        analyze_extreme_cases(results)
        analyze_correlation_breakdown(results)
        generate_recommendations(results)

        print(f"\n✅ Deep analysis complete!")

    except FileNotFoundError:
        print(
            "❌ Analysis results file not found. Run improved_difficulty_analysis.py first."
        )
    except Exception as e:
        print(f"❌ Error during analysis: {e}")


if __name__ == "__main__":
    main()
