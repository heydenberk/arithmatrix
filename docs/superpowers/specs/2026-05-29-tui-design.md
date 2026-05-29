# Arithmatrix TUI — Design

**Date:** 2026-05-29
**Status:** Approved

## Goal

A terminal UI for the Arithmatrix (KenKen) puzzle game, built in Python with
[Textual]. It reuses the existing `backend/` code (puzzle data format, solver,
validation) as much as possible. The end goal is **full parity** with the web
game; the **first milestone** ships: puzzle picker, fill/clear, pencil marks,
undo/redo (plus the grid navigation, rendering, and win detection those imply).

## Stack

- **Python 3.11 + Textual** — maximizes reuse of `backend/` (solver, puzzle
  loading already in Python) and gives a modern, styled TUI.

## Architecture — three clean layers

```
tui/
├── __init__.py
├── __main__.py    # `python -m tui` entry point
├── puzzles.py     # load public/all_puzzles.jsonl, filter by size+difficulty, pick random
├── game.py        # GameState: PURE logic — grid, pencil marks, cursor, undo/redo, win check
├── widgets.py     # Textual widgets: GridWidget (cage rendering), status bar
├── screens.py     # PickerScreen (size+difficulty) and GameScreen
├── app.py         # ArithmatrixApp: key bindings, wiring
└── requirements.txt  # textual, pytest
```

**Layer responsibilities:**

- **`game.py` — pure Python, no Textual import.** Holds the board, pencil marks,
  a cursor, and an undo/redo history. This is the unit-testable core (TDD here).
- **`puzzles.py`** reads the same `public/all_puzzles.jsonl`, filters by `size` +
  `metadata.actual_difficulty`, returns a random puzzle dict. Later reuses
  `backend.solver` for check/hint/solve features.
- **Textual layer** (`widgets` / `screens` / `app`) only renders state and
  translates keys into `game.py` calls. The hard part (rules/undo) stays
  testable without a terminal, and rendering is swappable.

## Puzzle data format (existing)

Each line of `public/all_puzzles.jsonl`:

```json
{
  "puzzle": {
    "size": 4,
    "cages": [{"cells": [9, 13], "operation": "+", "value": 4}, ...],
    "solution": [[1,4,3,2], ...]
  },
  "metadata": {"size": 4, "actual_difficulty": "easiest", ...}
}
```

- `cells` are **row-major indices** (`cell = r*size + c`).
- A cage with a single cell and `operation: ""` is a **given** (locked).
- `metadata.actual_difficulty` ∈ {easiest, easy, medium, hard, expert}.

## GameState (pure logic)

- `grid: list[list[int | None]]` — `size × size`
- `pencil: list[list[set[int]]]`
- `cursor: (row, col)`
- `given: set[(row, col)]` — single-cell cages, pre-filled and **locked**
  (cannot be edited or cleared); rendered as plain numbers like the web app.
- `cage_of: dict[(row,col) -> cage]` and the cage label (target + operation)
  anchored at the cage's minimum-index cell.
- **Undo/redo:** an index into a list of board snapshots `(grid, pencil)`.
  Every mutation truncates any redo tail and pushes a new snapshot.

**API:** `set_value(d)`, `clear()`, `toggle_pencil(d)`, `move(dr, dc)`,
`undo()`, `redo()`, `is_solved()`.

**`is_solved()`** — all cells filled **and** every row/col is a `1..n`
permutation **and** every cage satisfies its operation. Pure validation; this
same routine powers the future "check errors" feature, so nothing is throwaway.

## Rendering (GridWidget)

- **Borders only** (no background tints). Heavy box-drawing characters
  (`┃ ━ ┏ ┓ ...`) mark **cage** boundaries; cells inside the same cage share a
  light/blank seam. Exact junction characters are computed per-edge from the
  cage map.
- Each cell shows: cage **target+operation** in the top-left (dim), the entered
  **value** centered (bright), and **pencil marks** along the bottom (small, dim).
- **Cursor** cell is reverse-video.
- Single-cell cages render as a plain given number.

Cell anatomy:

```
┏━━━━━━━┓
┃4+     ┃   cage target+operation (top-left, dim)
┃   3   ┃   entered value (bright, centered)
┃ ¹²³   ┃   pencil-mark candidates (small, dim)
┗━━━━━━━┛
```

## Key bindings (arrows only + action letters)

| Key            | Action                          |
| -------------- | ------------------------------- |
| Arrow keys     | Move cursor                     |
| `1`–`9`        | Fill value (or pencil mark)     |
| `Backspace`    | Clear cell                      |
| `p`            | Toggle pencil mode              |
| `u`            | Undo                            |
| `r`            | Redo                            |
| `n`            | New puzzle (back to picker)     |
| `q`            | Quit                            |

A status bar shows size, difficulty, and whether pencil mode is active.

## Data flow

1. App launches → **`PickerScreen`** (choose size 4–7 + difficulty).
2. On select → `puzzles.load_random(size, difficulty)` → build `GameState`.
3. Push **`GameScreen`** → renders `GridWidget(game)` + status bar.
4. Key events → `GameState` mutations → widget refresh.
5. After each fill, `is_solved()` → win modal offering a new puzzle.

## Error handling

- No puzzle matches a size+difficulty (rare buckets): the picker shows a message
  and lets the user choose again.
- Missing `all_puzzles.jsonl`: exit with a clear message.

## Testing (TDD)

- **`pytest` on `game.py`:** fill/clear, locked givens reject edits, pencil
  toggle, undo/redo (including redo-tail truncation), win detection against real
  puzzle solutions from the corpus.
- **`pytest` on `puzzles.py`:** load + filter by size/difficulty, random pick,
  missing-file and empty-bucket handling.
- **Textual `pilot` smoke test:** key → state wiring on the GameScreen.

## Run

```bash
pip install -r tui/requirements.txt
python -m tui            # or: npm run tui
```

## Future (full parity, not in first milestone)

- Timer with pause/resume.
- Check-for-errors (reuse `is_solved` validation), reveal cell, auto-solve
  (reuse `backend.solver`).
- Auto-save to disk.

[Textual]: https://textual.textualize.io/
