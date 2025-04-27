#!/usr/bin/env python3
"""
Human Difficulty Analyzer for Arithmatrix puzzles.
Analyzes real-world solve time data to create better difficulty estimation.
"""

import json
import statistics
import numpy as np
from typing import Dict, List, Tuple, Any
from collections import defaultdict
import matplotlib.pyplot as plt


class HumanDifficultyAnalyzer:
    """Analyzes real-world solve time data to understand human difficulty patterns."""

    def __init__(self, data_file: str = "real_world_difficulties.jsonl"):
        self.data_file = data_file
        self.puzzles = []
        self.load_data()

    def load_data(self):
        """Load real-world puzzle solve data."""
        print(f"Loading real-world difficulty data from {self.data_file}...")

        with open(self.data_file, "r") as f:
            for line in f:
                try:
                    puzzle_data = json.loads(line.strip())
                    self.puzzles.append(puzzle_data)
                except json.JSONDecodeError:
                    continue

        print(f"Loaded {len(self.puzzles)} puzzle solve records")

    def analyze_basic_patterns(self):
        """Analyze basic patterns in the solve time data."""
        print("\n" + "=" * 80)
        print("BASIC PATTERN ANALYSIS")
        print("=" * 80)

        # Group by size and difficulty
        by_size = defaultdict(list)
        by_difficulty = defaultdict(list)
        by_size_difficulty = defaultdict(lambda: defaultdict(list))

        for puzzle in self.puzzles:
            size = puzzle["size"]
            difficulty = puzzle["difficultyLevel"]
            time_sec = puzzle["completionTimeSeconds"]
            ops = puzzle["difficultyOperations"]

            by_size[size].append(time_sec)
            by_difficulty[difficulty].append(time_sec)
            by_size_difficulty[size][difficulty].append(time_sec)

        # Analyze by size
        print("\n📏 SOLVE TIME BY SIZE:")
        print("Size | Count | Min Time | Median Time | Max Time | Range")
        print("-----|-------|----------|-------------|----------|-------")

        for size in sorted(by_size.keys()):
            times = by_size[size]
            if len(times) > 0:
                min_time = min(times)
                median_time = statistics.median(times)
                max_time = max(times)
                range_time = max_time - min_time

                print(
                    f" {size}x{size} |  {len(times):3d}  |  {min_time:6.0f}s  |   {median_time:8.0f}s   |  {max_time:6.0f}s  | {range_time:6.0f}s"
                )

        # Analyze by difficulty
        print("\n🎯 SOLVE TIME BY DIFFICULTY LEVEL:")
        print("Difficulty | Count | Min Time | Median Time | Max Time | Range")
        print("-----------|-------|----------|-------------|----------|-------")

        for difficulty in ["easiest", "easy", "medium", "hard", "expert"]:
            if difficulty in by_difficulty:
                times = by_difficulty[difficulty]
                if len(times) > 0:
                    min_time = min(times)
                    median_time = statistics.median(times)
                    max_time = max(times)
                    range_time = max_time - min_time

                    print(
                        f" {difficulty:>9} |  {len(times):3d}  |  {min_time:6.0f}s  |   {median_time:8.0f}s   |  {max_time:6.0f}s  | {range_time:6.0f}s"
                    )

        # Check for monotonic difficulty progression
        print("\n⚠️  DIFFICULTY PROGRESSION ANALYSIS:")
        difficulty_medians = []
        for difficulty in ["easiest", "easy", "medium", "hard", "expert"]:
            if difficulty in by_difficulty and len(by_difficulty[difficulty]) > 0:
                median = statistics.median(by_difficulty[difficulty])
                difficulty_medians.append((difficulty, median))

        is_monotonic = all(
            difficulty_medians[i][1] <= difficulty_medians[i + 1][1]
            for i in range(len(difficulty_medians) - 1)
        )

        print(f"Monotonic progression: {'✅ YES' if is_monotonic else '❌ NO'}")

        if not is_monotonic:
            print("Issues found:")
            for i in range(len(difficulty_medians) - 1):
                curr_diff, curr_time = difficulty_medians[i]
                next_diff, next_time = difficulty_medians[i + 1]
                if curr_time > next_time:
                    print(
                        f"  • {curr_diff} ({curr_time:.0f}s) > {next_diff} ({next_time:.0f}s)"
                    )

        return by_size, by_difficulty, by_size_difficulty

    def analyze_operations_vs_time(self):
        """Analyze the correlation between operation count and solve time."""
        print("\n" + "=" * 80)
        print("OPERATIONS vs SOLVE TIME ANALYSIS")
        print("=" * 80)

        # Extract operations and times
        operations = []
        times = []
        sizes = []
        difficulties = []

        for puzzle in self.puzzles:
            operations.append(puzzle["difficultyOperations"])
            times.append(puzzle["completionTimeSeconds"])
            sizes.append(puzzle["size"])
            difficulties.append(puzzle["difficultyLevel"])

        # Calculate correlation
        correlation = np.corrcoef(operations, times)[0, 1]
        print(
            f"Overall correlation between operations and solve time: {correlation:.3f}"
        )

        # Analyze by size
        print(f"\nCorrelation by puzzle size:")
        for size in sorted(set(sizes)):
            size_ops = [op for i, op in enumerate(operations) if sizes[i] == size]
            size_times = [t for i, t in enumerate(times) if sizes[i] == size]

            if len(size_ops) > 2:
                size_corr = np.corrcoef(size_ops, size_times)[0, 1]
                print(f"  {size}x{size}: {size_corr:.3f} (n={len(size_ops)})")

        # Show current difficulty ranges vs actual times
        print(f"\nCURRENT DIFFICULTY RANGES vs ACTUAL SOLVE TIMES:")
        print("Difficulty | Op Range | Actual Time Range")
        print("-----------|----------|------------------")

        for difficulty in ["easiest", "easy", "medium", "hard", "expert"]:
            diff_ops = [
                op for i, op in enumerate(operations) if difficulties[i] == difficulty
            ]
            diff_times = [
                t for i, t in enumerate(times) if difficulties[i] == difficulty
            ]

            if diff_ops:
                op_range = f"{min(diff_ops):.1f}-{max(diff_ops):.1f}"
                time_range = f"{min(diff_times):.0f}-{max(diff_times):.0f}s"
                print(f" {difficulty:>9} | {op_range:>8} | {time_range:>16}")

        return operations, times, sizes, difficulties

    def identify_difficulty_factors(self):
        """Identify factors that contribute to human difficulty beyond operation count."""
        print("\n" + "=" * 80)
        print("DIFFICULTY FACTOR ANALYSIS")
        print("=" * 80)

        # Analyze puzzle structure factors
        factors = []

        for puzzle in self.puzzles:
            cages = puzzle["puzzle"]["cages"]
            size = puzzle["size"]
            time_sec = puzzle["completionTimeSeconds"]

            # Calculate various factors
            num_cages = len(cages)
            cage_sizes = [len(cage["cells"]) for cage in cages]
            operations = [cage["operation"] for cage in cages]
            values = [cage["value"] for cage in cages]

            # Factor 1: Average cage size
            avg_cage_size = statistics.mean(cage_sizes)

            # Factor 2: Cage size variance
            cage_size_variance = (
                statistics.variance(cage_sizes) if len(cage_sizes) > 1 else 0
            )

            # Factor 3: Operation distribution
            op_counts = {op: operations.count(op) for op in ["+", "-", "*", "/", ""]}
            multiplication_ratio = op_counts["*"] / num_cages
            division_ratio = op_counts["/"] / num_cages
            single_cell_ratio = op_counts[""] / num_cages

            # Factor 4: Value complexity
            large_values = sum(1 for v in values if v > size * 2)
            large_value_ratio = large_values / num_cages

            # Factor 5: Cage density (cells per cage)
            cage_density = (size * size) / num_cages

            factors.append(
                {
                    "time": time_sec,
                    "size": size,
                    "num_cages": num_cages,
                    "avg_cage_size": avg_cage_size,
                    "cage_size_variance": cage_size_variance,
                    "multiplication_ratio": multiplication_ratio,
                    "division_ratio": division_ratio,
                    "single_cell_ratio": single_cell_ratio,
                    "large_value_ratio": large_value_ratio,
                    "cage_density": cage_density,
                    "difficulty_ops": puzzle["difficultyOperations"],
                    "difficulty_level": puzzle["difficultyLevel"],
                }
            )

        # Calculate correlations with solve time
        print("Correlation with solve time:")
        factor_names = [
            "num_cages",
            "avg_cage_size",
            "cage_size_variance",
            "multiplication_ratio",
            "division_ratio",
            "single_cell_ratio",
            "large_value_ratio",
            "cage_density",
            "difficulty_ops",
        ]

        for factor_name in factor_names:
            factor_values = [f[factor_name] for f in factors]
            times = [f["time"] for f in factors]

            if len(set(factor_values)) > 1:  # Avoid constant values
                correlation = np.corrcoef(factor_values, times)[0, 1]
                print(f"  {factor_name:>18}: {correlation:>6.3f}")

        return factors

    def create_human_difficulty_model(self, factors):
        """Create a new difficulty model based on human solve patterns."""
        print("\n" + "=" * 80)
        print("HUMAN DIFFICULTY MODEL CREATION")
        print("=" * 80)

        # Find factors that best predict human solve time
        from sklearn.linear_model import LinearRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import cross_val_score

        # Prepare features
        feature_names = [
            "size",
            "num_cages",
            "avg_cage_size",
            "cage_size_variance",
            "multiplication_ratio",
            "division_ratio",
            "single_cell_ratio",
            "large_value_ratio",
            "cage_density",
        ]

        X = []
        y = []

        for f in factors:
            features = [f[name] for name in feature_names]
            X.append(features)
            y.append(f["time"])

        X = np.array(X)
        y = np.array(y)

        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Train model
        model = LinearRegression()
        model.fit(X_scaled, y)

        # Evaluate model
        cv_scores = cross_val_score(model, X_scaled, y, cv=5)

        print(f"Linear regression model:")
        print(
            f"  Cross-validation R²: {np.mean(cv_scores):.3f} ± {np.std(cv_scores):.3f}"
        )

        # Show feature importance
        print(f"\nFeature importance (coefficients):")
        for i, name in enumerate(feature_names):
            coef = model.coef_[i]
            print(f"  {name:>18}: {coef:>8.3f}")

        # Create a simpler model for practical use
        print(f"\nSimplified human difficulty formula:")
        print(
            f"Human Difficulty Score = base_time + size_factor * size + cage_factor * cage_complexity"
        )

        # Calculate size effect
        size_times = defaultdict(list)
        for f in factors:
            size_times[f["size"]].append(f["time"])

        size_medians = {
            size: statistics.median(times) for size, times in size_times.items()
        }
        print(f"\nMedian solve time by size:")
        for size in sorted(size_medians.keys()):
            print(f"  {size}x{size}: {size_medians[size]:.0f}s")

        return model, scaler, feature_names, size_medians

    def create_visualization(self, by_size, by_difficulty):
        """Create visualizations of the analysis."""
        print(f"\n📊 Creating visualizations...")

        # Create figure with subplots
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 12))

        # Plot 1: Solve time by size
        sizes = sorted(by_size.keys())
        size_medians = [statistics.median(by_size[size]) for size in sizes]
        size_mins = [min(by_size[size]) for size in sizes]
        size_maxs = [max(by_size[size]) for size in sizes]

        ax1.bar(sizes, size_medians, alpha=0.7, color="skyblue", label="Median")
        ax1.errorbar(
            sizes,
            size_medians,
            yerr=[
                np.array(size_medians) - np.array(size_mins),
                np.array(size_maxs) - np.array(size_medians),
            ],
            fmt="o",
            color="red",
            capsize=5,
            label="Min/Max",
        )
        ax1.set_title("Solve Time by Puzzle Size")
        ax1.set_xlabel("Puzzle Size")
        ax1.set_ylabel("Solve Time (seconds)")
        ax1.legend()
        ax1.grid(True, alpha=0.3)

        # Plot 2: Solve time by difficulty
        difficulties = ["easiest", "easy", "medium", "hard", "expert"]
        diff_medians = [
            statistics.median(by_difficulty[d]) if d in by_difficulty else 0
            for d in difficulties
        ]

        colors = ["#4CAF50", "#8BC34A", "#FFC107", "#FF9800", "#F44336"]
        bars = ax2.bar(difficulties, diff_medians, color=colors, alpha=0.7)
        ax2.set_title("Solve Time by Difficulty Level")
        ax2.set_xlabel("Difficulty Level")
        ax2.set_ylabel("Solve Time (seconds)")
        ax2.tick_params(axis="x", rotation=45)

        # Add value labels on bars
        for bar, median in zip(bars, diff_medians):
            if median > 0:
                ax2.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 10,
                    f"{median:.0f}s",
                    ha="center",
                    va="bottom",
                    fontweight="bold",
                )

        # Plot 3: Current difficulty system vs actual times
        operations = [p["difficultyOperations"] for p in self.puzzles]
        times = [p["completionTimeSeconds"] for p in self.puzzles]
        sizes = [p["size"] for p in self.puzzles]

        size_colors = {4: "red", 5: "blue", 6: "green", 7: "orange"}
        for size in sorted(set(sizes)):
            size_ops = [op for i, op in enumerate(operations) if sizes[i] == size]
            size_times = [t for i, t in enumerate(times) if sizes[i] == size]
            ax3.scatter(
                size_ops,
                size_times,
                alpha=0.6,
                color=size_colors.get(size, "gray"),
                label=f"{size}x{size}",
            )

        ax3.set_title("Operations vs Solve Time")
        ax3.set_xlabel("Difficulty Operations")
        ax3.set_ylabel("Solve Time (seconds)")
        ax3.legend()
        ax3.grid(True, alpha=0.3)

        # Plot 4: Difficulty level distribution
        difficulty_counts = defaultdict(int)
        for p in self.puzzles:
            difficulty_counts[p["difficultyLevel"]] += 1

        ax4.pie(
            [difficulty_counts[d] for d in difficulties],
            labels=difficulties,
            colors=colors,
            autopct="%1.1f%%",
        )
        ax4.set_title("Distribution of Difficulty Levels in Dataset")

        plt.tight_layout()
        plt.savefig("human_difficulty_analysis.png", dpi=300, bbox_inches="tight")
        print(f"Visualization saved as 'human_difficulty_analysis.png'")

        plt.close()

    def run_full_analysis(self):
        """Run the complete analysis pipeline."""
        print("🧠 HUMAN DIFFICULTY ANALYSIS FOR ARITHMATRIX PUZZLES")
        print("=" * 80)

        # Basic pattern analysis
        by_size, by_difficulty, by_size_difficulty = self.analyze_basic_patterns()

        # Operations vs time analysis
        operations, times, sizes, difficulties = self.analyze_operations_vs_time()

        # Factor analysis
        factors = self.identify_difficulty_factors()

        # Create human difficulty model
        model, scaler, feature_names, size_medians = self.create_human_difficulty_model(
            factors
        )

        # Create visualizations
        self.create_visualization(by_size, by_difficulty)

        # Generate recommendations
        self.generate_recommendations(by_size, by_difficulty, factors, size_medians)

        return {
            "by_size": by_size,
            "by_difficulty": by_difficulty,
            "factors": factors,
            "model": model,
            "scaler": scaler,
            "feature_names": feature_names,
            "size_medians": size_medians,
        }

    def generate_recommendations(self, by_size, by_difficulty, factors, size_medians):
        """Generate recommendations for improving the difficulty system."""
        print(f"\n" + "=" * 80)
        print("RECOMMENDATIONS FOR IMPROVED DIFFICULTY SYSTEM")
        print("=" * 80)

        print("1. 🎯 DIFFICULTY LEVEL ADJUSTMENTS:")

        # Analyze current difficulty issues
        difficulty_order = ["easiest", "easy", "medium", "hard", "expert"]
        difficulty_medians = {}

        for diff in difficulty_order:
            if diff in by_difficulty and len(by_difficulty[diff]) > 0:
                difficulty_medians[diff] = statistics.median(by_difficulty[diff])

        print("\n   Current median solve times:")
        for diff in difficulty_order:
            if diff in difficulty_medians:
                print(f"     {diff:>8}: {difficulty_medians[diff]:>6.0f}s")

        # Suggest new ranges based on actual data
        print(f"\n   Suggested new difficulty ranges (based on actual solve times):")

        all_times = []
        for times in by_difficulty.values():
            all_times.extend(times)

        if all_times:
            all_times.sort()
            n = len(all_times)

            percentiles = {
                "easiest": (0, 20),
                "easy": (20, 40),
                "medium": (40, 60),
                "hard": (60, 80),
                "expert": (80, 100),
            }

            for diff, (min_p, max_p) in percentiles.items():
                min_idx = int(min_p * n / 100)
                max_idx = int(max_p * n / 100) - 1
                if max_idx >= n:
                    max_idx = n - 1

                min_time = all_times[min_idx]
                max_time = all_times[max_idx]

                print(f"     {diff:>8}: {min_time:>4.0f}s - {max_time:<4.0f}s")

        print(f"\n2. 📏 SIZE-BASED ADJUSTMENTS:")
        print(f"   Current data shows different difficulty scaling by size:")

        for size in sorted(size_medians.keys()):
            median_time = size_medians[size]
            print(f"     {size}x{size}: {median_time:>6.0f}s median solve time")

        print(f"\n3. 🔢 OPERATION COUNT CORRELATION:")

        # Find correlation between operations and time by size
        for size in sorted(set(s for s in size_medians.keys())):
            size_factors = [f for f in factors if f["size"] == size]
            if len(size_factors) > 2:
                ops = [f["difficulty_ops"] for f in size_factors]
                times = [f["time"] for f in size_factors]
                corr = np.corrcoef(ops, times)[0, 1]
                print(f"     {size}x{size}: correlation = {corr:.3f}")

        print(f"\n4. 🧩 STRUCTURAL FACTORS:")
        print(f"   Consider incorporating these factors into difficulty calculation:")

        # Show top correlating factors
        factor_names = [
            "multiplication_ratio",
            "division_ratio",
            "cage_size_variance",
            "large_value_ratio",
        ]

        for factor_name in factor_names:
            factor_values = [f[factor_name] for f in factors]
            times = [f["time"] for f in factors]

            if len(set(factor_values)) > 1:
                correlation = np.corrcoef(factor_values, times)[0, 1]
                if abs(correlation) > 0.1:  # Only show meaningful correlations
                    print(f"     {factor_name}: correlation = {correlation:.3f}")

        print(f"\n5. 🎮 HUMAN-CENTERED SOLVER:")
        print(f"   Create a new solving algorithm that mimics human solving patterns:")
        print(f"   - Prioritize single-cell cages first")
        print(f"   - Handle simple arithmetic operations before complex ones")
        print(f"   - Consider cage connectivity and visual grouping")
        print(f"   - Weight multiplication/division higher than addition/subtraction")
        print(f"   - Account for number size and complexity")


if __name__ == "__main__":
    analyzer = HumanDifficultyAnalyzer()
    results = analyzer.run_full_analysis()
