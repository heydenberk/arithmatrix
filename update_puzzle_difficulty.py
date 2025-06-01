#!/usr/bin/env python3
"""
Update Puzzle Difficulty Script
==============================

This script:
1. Creates a backup of all_puzzles.jsonl
2. Loads the improved difficulty analysis results
3. Updates the difficulty_operations field in each puzzle with the new scores
4. Preserves all other data unchanged
"""

import json
import shutil
from datetime import datetime
import os


def create_backup(original_file, backup_suffix="_backup"):
    """Create a timestamped backup of the original file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"{original_file}{backup_suffix}_{timestamp}"

    print(f"📁 Creating backup: {backup_filename}")
    shutil.copy2(original_file, backup_filename)
    print(f"✅ Backup created successfully")

    return backup_filename


def load_new_difficulty_scores(
    analysis_file="improved_difficulty_analysis_results.json",
):
    """Load the new difficulty scores from the analysis results."""
    print(f"📊 Loading new difficulty scores from {analysis_file}")

    try:
        with open(analysis_file, "r") as f:
            results = json.load(f)

        # Create a mapping from line number to new difficulty score
        line_to_score = {}

        for result in results["detailed_results"]:
            line_num = result["line_number"]
            new_score = result["new_analysis"]["overall_difficulty_score"]
            line_to_score[line_num] = new_score

        print(f"✅ Loaded {len(line_to_score)} new difficulty scores")
        return line_to_score

    except FileNotFoundError:
        print(f"❌ Analysis file not found: {analysis_file}")
        print("   Run improved_difficulty_analysis.py first to generate the scores")
        return None
    except Exception as e:
        print(f"❌ Error loading analysis results: {e}")
        return None


def update_puzzle_file(input_file, output_file, new_scores):
    """Update the puzzle file with new difficulty scores."""
    print(f"🔄 Updating puzzles from {input_file} to {output_file}")

    updated_count = 0
    unchanged_count = 0
    total_count = 0

    try:
        with open(input_file, "r") as infile, open(output_file, "w") as outfile:
            for line_num, line in enumerate(infile, 1):
                total_count += 1

                try:
                    # Parse the JSON line
                    data = json.loads(line.strip())

                    # Check if we have a new score for this line
                    if line_num in new_scores:
                        # Update the difficulty_operations in the puzzle (not metadata)
                        if (
                            "puzzle" in data
                            and "difficulty_operations" in data["puzzle"]
                        ):
                            old_score = data["puzzle"]["difficulty_operations"]
                            new_score = new_scores[line_num]

                            # Round to 1 decimal place for consistency
                            data["puzzle"]["difficulty_operations"] = round(
                                new_score, 1
                            )
                            updated_count += 1

                            # Optional: Add a comment about the update
                            if "metadata" not in data:
                                data["metadata"] = {}
                            data["metadata"]["difficulty_updated"] = True
                            data["metadata"]["old_difficulty_operations"] = old_score
                            data["metadata"]["new_difficulty_system"] = (
                                "human_aligned_v1"
                            )
                        else:
                            unchanged_count += 1
                    else:
                        unchanged_count += 1

                    # Write the (possibly modified) line
                    outfile.write(json.dumps(data) + "\n")

                    # Progress indicator
                    if total_count % 1000 == 0:
                        print(
                            f"  Processed {total_count} puzzles... ({updated_count} updated)"
                        )

                except json.JSONDecodeError:
                    print(f"  ⚠️  Skipping invalid JSON at line {line_num}")
                    outfile.write(line)  # Write original line if JSON is invalid
                    unchanged_count += 1
                except Exception as e:
                    print(f"  ⚠️  Error processing line {line_num}: {e}")
                    outfile.write(line)  # Write original line if error occurs
                    unchanged_count += 1

        print(f"✅ Update complete!")
        print(f"   Total puzzles: {total_count:,}")
        print(f"   Updated: {updated_count:,}")
        print(f"   Unchanged: {unchanged_count:,}")
        print(f"   Update rate: {updated_count / total_count:.1%}")

        return True

    except Exception as e:
        print(f"❌ Error updating puzzle file: {e}")
        return False


def validate_update(original_file, updated_file, sample_size=10):
    """Validate the update by comparing a sample of puzzles."""
    print(f"\n🔍 Validating update with {sample_size} sample puzzles...")

    try:
        # Read sample lines from both files
        with open(original_file, "r") as orig, open(updated_file, "r") as updated:
            orig_lines = orig.readlines()
            updated_lines = updated.readlines()

        if len(orig_lines) != len(updated_lines):
            print(f"❌ File length mismatch: {len(orig_lines)} vs {len(updated_lines)}")
            return False

        # Check a few sample lines
        import random

        sample_indices = random.sample(
            range(min(len(orig_lines), 1000)), min(sample_size, len(orig_lines))
        )

        print(f"\nSample validation (line: old_score → new_score):")
        for i in sample_indices:
            try:
                orig_data = json.loads(orig_lines[i].strip())
                updated_data = json.loads(updated_lines[i].strip())

                orig_score = orig_data.get("puzzle", {}).get(
                    "difficulty_operations", "N/A"
                )
                updated_score = updated_data.get("puzzle", {}).get(
                    "difficulty_operations", "N/A"
                )

                if orig_score != updated_score:
                    print(f"  Line {i + 1}: {orig_score} → {updated_score}")
                else:
                    print(f"  Line {i + 1}: {orig_score} (unchanged)")

            except Exception as e:
                print(f"  Line {i + 1}: Error validating - {e}")

        print(f"✅ Validation complete")
        return True

    except Exception as e:
        print(f"❌ Error during validation: {e}")
        return False


def main():
    """Main function to orchestrate the update process."""
    print("🚀 KENKEN PUZZLE DIFFICULTY UPDATE")
    print("=" * 50)

    # Configuration
    original_file = "all_puzzles.jsonl"
    temp_file = "all_puzzles_updated.jsonl"
    analysis_file = "improved_difficulty_analysis_results.json"

    # Check if files exist
    if not os.path.exists(original_file):
        print(f"❌ Original file not found: {original_file}")
        return

    if not os.path.exists(analysis_file):
        print(f"❌ Analysis file not found: {analysis_file}")
        print("   Run improved_difficulty_analysis.py first to generate the analysis")
        return

    # Step 1: Create backup
    backup_file = create_backup(original_file)

    # Step 2: Load new difficulty scores
    new_scores = load_new_difficulty_scores(analysis_file)
    if new_scores is None:
        return

    # Step 3: Update the puzzle file
    print(f"\n🔄 Starting update process...")
    success = update_puzzle_file(original_file, temp_file, new_scores)

    if not success:
        print(f"❌ Update failed, keeping original file")
        os.remove(temp_file) if os.path.exists(temp_file) else None
        return

    # Step 4: Validate the update
    if validate_update(original_file, temp_file):
        # Step 5: Replace original with updated version
        print(f"\n🔀 Replacing original file with updated version...")
        shutil.move(temp_file, original_file)
        print(f"✅ Successfully updated {original_file}")
        print(f"📁 Original backed up as: {backup_file}")
    else:
        print(f"❌ Validation failed, keeping original file")
        os.remove(temp_file) if os.path.exists(temp_file) else None

    print(f"\n🎉 Process complete!")


if __name__ == "__main__":
    main()
