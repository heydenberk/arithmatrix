import logging
import random  # Import random for size selection within difficulty
from flask import Flask, jsonify, request
from .puzzle_generator import KenkenGenerator

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


@app.route("/api/hello")
def hello_world():
    return jsonify(message="Hello from Flask!")


@app.route("/api/puzzle")
def get_puzzle():
    app.logger.info(f"Received request for puzzle, args: {request.args}")

    # --- Difficulty Handling ---
    difficulty = request.args.get("difficulty", "medium").lower()
    valid_difficulties = ["easy", "medium", "hard"]
    if difficulty not in valid_difficulties:
        app.logger.warning(f"Invalid difficulty requested: {difficulty}")
        return jsonify(
            {"error": "Invalid difficulty parameter. Must be easy, medium, or hard."}
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
        # Pass determined operations and difficulty to generator
        generator = KenkenGenerator(
            size=size, operations=allowed_operations, difficulty=difficulty
        )
        puzzle_definition = generator.generate()

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
