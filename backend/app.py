import json
import logging
import os
import random  # Import random for size selection within difficulty
from flask import Flask, jsonify, request
from .kenken import generate_kenken_puzzle

app = Flask(__name__)

# --- Explicit Logger Configuration ---
if not app.debug:  # Only configure if not in debug mode (debug usually handles this)
    # In production, you might want more sophisticated logging
    # For development, let's ensure INFO messages are shown
    pass  # Keep debug mode's default handler if debug=True
else:
    # Explicitly configure for debug mode just in case defaults aren't working
    log_handler = logging.StreamHandler()  # Output to stderr
    log_handler.setLevel(logging.INFO)
    app.logger.addHandler(log_handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info("Flask logger configured for DEBUG level.")
# -------------------------------------

PUZZLES_FILE = "all_puzzles.jsonl"

ALL_PUZZLES = []
if os.path.exists(PUZZLES_FILE):
    with open(PUZZLES_FILE, "r") as f:
        for line in f:
            ALL_PUZZLES.append(json.loads(line))


@app.route("/api/puzzle")
def get_puzzle():
    app.logger.info(f"Received request for puzzle, args: {request.args}")

    # --- Difficulty Handling ---
    difficulty = request.args.get("difficulty", "medium").lower()
    valid_difficulties = ["easiest", "easy", "medium", "hard", "expert"]
    if difficulty not in valid_difficulties:
        app.logger.warning(f"Invalid difficulty requested: {difficulty}")
        return jsonify(
            {
                "error": "Invalid difficulty parameter. Must be easiest, easy, medium, hard, or expert."
            }
        ), 400
    app.logger.info(f"Validated difficulty: {difficulty}")

    # Determine operations based on difficulty
    include_mul_div = difficulty in ["medium", "hard"]
    allowed_operations = ["+", "-"]
    if include_mul_div:
        allowed_operations.extend(["*", "/"])
    app.logger.info(f"Difficulty '{difficulty}' -> Operations: {allowed_operations}")
    # --------------------------

    # --- Size Handling ---
    size = 4  # Default size
    try:
        size_str = request.args.get("size", "4")  # Still accept size parameter
        size = int(size_str)
        # Adjust max size based on difficulty? Maybe later. For now, keep range.
        if not 3 <= size <= 8:
            app.logger.warning(f"Invalid size requested: {size_str}")
            raise ValueError("Size out of range (3-8)")
        app.logger.info(f"Validated size: {size}")
    except (ValueError, TypeError):
        return jsonify(
            {
                "error": "Invalid or missing size parameter. Must be integer between 3 and 8."
            }
        ), 400
    # --------------------------

    # --- Generation ---
    try:
        app.logger.info(
            f"Attempting generation for size {size}, difficulty '{difficulty}'..."
        )
        if ALL_PUZZLES:
            app.logger.info(f"Found {len(ALL_PUZZLES)} puzzles in database.")

            # Get difficulty range for the requested size and difficulty
            from .kenken import _get_difficulty_range

            min_score, max_score = _get_difficulty_range(size, difficulty)
            app.logger.info(
                f"Target difficulty range for {size}x{size} {difficulty}: {min_score} - {max_score}"
            )

            # Filter puzzles by size and difficulty score range
            matching_puzzles = [
                puzzle
                for puzzle in ALL_PUZZLES
                if puzzle["puzzle"]["size"] == size
                and min_score <= puzzle["puzzle"]["difficulty_operations"] <= max_score
            ]

            if matching_puzzles:
                app.logger.info(
                    f"Found {len(matching_puzzles)} matching puzzles for {size}x{size} {difficulty}"
                )
                puzzle_definition = random.choice(matching_puzzles)["puzzle"]
            else:
                app.logger.warning(
                    f"No puzzles found for {size}x{size} {difficulty} in range {min_score}-{max_score}"
                )
                # Fall back to generating a new puzzle
                puzzle_definition = generate_kenken_puzzle(
                    size, difficulty=difficulty, max_attempts=500
                )
        else:
            app.logger.info("No puzzles found in database, generating new puzzle.")
            puzzle_definition = generate_kenken_puzzle(
                size, difficulty=difficulty, max_attempts=500
            )

        if puzzle_definition is None:
            app.logger.error(
                f"Generation returned None for size {size}, difficulty '{difficulty}'."
            )
            return jsonify(
                {"error": "Failed to generate puzzle for the requested settings."}
            ), 500

        # Add difficulty and actual size info to response? Maybe not necessary for client?
        # Let's keep the response format simple for now.
        generated_size = puzzle_definition.get("size", "Unknown")
        app.logger.info(
            f"Successfully generated puzzle. Returning size: {generated_size}"
        )
        return jsonify(puzzle_definition)

    except Exception as e:
        app.logger.exception(
            f"Exception during puzzle generation for size {size}, difficulty '{difficulty}': {e}"
        )
        return jsonify(
            {"error": "An internal error occurred during puzzle generation."}
        ), 500
    # -----------------


if __name__ == "__main__":
    # Logger should be configured above before run
    app.run(debug=True, port=5001)
