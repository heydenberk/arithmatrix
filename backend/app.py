import json
import logging
import os
import random
from flask import Flask, jsonify, request
from .arithmatrix import DIFFICULTY_ORDER, OPERATIONS_TIERS, generate_arithmatrix_puzzle
from .solver import Deadline

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

# The corpus the frontend ships. There used to be a second, older copy at the
# repo root - from a previous difficulty system, without difficulty_score or
# operations_tier - and this served that one.
PUZZLES_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "all_puzzles.jsonl")

ALL_PUZZLES = []
if os.path.exists(PUZZLES_FILE):
    with open(PUZZLES_FILE, "r") as f:
        for line in f:
            ALL_PUZZLES.append(json.loads(line))


VALID_SIZES = (4, 5, 6, 7)
VALID_DIFFICULTIES = tuple(DIFFICULTY_ORDER)

# On-demand generation has to answer within a request; a 7x7 expert can take
# far longer than this, in which case the client gets an explicit failure.
GENERATION_BUDGET_SECONDS = 20.0


@app.route("/api/puzzle")
def get_puzzle():
    """A puzzle for (size, difficulty, tier): from the shipped corpus when it
    has one, generated on demand otherwise.

    Lookup is by `metadata.actual_difficulty` and `metadata.operations_tier`,
    the fields the corpus actually carries. This used to import a
    `_get_difficulty_range` helper that no longer existed and filter on a score
    range, so every request with the corpus loaded returned HTTP 500.
    """
    app.logger.info(f"Received request for puzzle, args: {request.args}")

    difficulty = request.args.get("difficulty", "medium").lower()
    if difficulty not in VALID_DIFFICULTIES:
        return jsonify({"error": f"Invalid difficulty parameter. Must be one of {', '.join(VALID_DIFFICULTIES)}."}), 400

    tier = request.args.get("tier", "all").lower()
    if tier not in OPERATIONS_TIERS:
        return jsonify({"error": f"Invalid tier parameter. Must be one of {', '.join(OPERATIONS_TIERS)}."}), 400

    try:
        size = int(request.args.get("size", "4"))
    except (ValueError, TypeError):
        size = 0
    if size not in VALID_SIZES:
        return jsonify({"error": f"Invalid or missing size parameter. Must be one of {', '.join(map(str, VALID_SIZES))}."}), 400

    matching = [
        record
        for record in ALL_PUZZLES
        if record["puzzle"]["size"] == size
        and record["metadata"].get("actual_difficulty") == difficulty
        and record["metadata"].get("operations_tier", "all") == tier
    ]
    if matching:
        app.logger.info(f"Serving one of {len(matching)} corpus puzzles for {size}x{size} {difficulty} {tier}")
        return jsonify(random.choice(matching)["puzzle"])

    app.logger.info(f"No corpus puzzle for {size}x{size} {difficulty} {tier}; generating")
    try:
        puzzle = generate_arithmatrix_puzzle(
            size,
            difficulty=difficulty,
            allowed_operations=OPERATIONS_TIERS[tier],
            deadline=Deadline.after(GENERATION_BUDGET_SECONDS),
        )
    except Exception as e:
        app.logger.exception(f"Exception during puzzle generation for {size}x{size} {difficulty}: {e}")
        return jsonify({"error": "An internal error occurred during puzzle generation."}), 500

    if puzzle is None:
        app.logger.error(f"Generation produced nothing for {size}x{size} {difficulty} {tier} within budget")
        return jsonify({"error": "Could not generate a puzzle for the requested settings in time."}), 503
    return jsonify(puzzle)


if __name__ == "__main__":
    # Logger should be configured above before run
    app.run(debug=True, port=5001)
