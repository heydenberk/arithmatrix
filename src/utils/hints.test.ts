/**
 * Tests for the hint engine.
 *
 * The behaviour worth protecting is what a hint *withholds*: the first level
 * must not name the cell or the value, or the feature is just a reveal button.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeHint, eligibleSteps, stepDifficulty } from './hints';
import { solveToStall, solveWithTrace } from './solver';
import { PuzzleDefinition } from '../types/ArithmatrixTypes';

type Record_ = {
  puzzle: { size: number; cages: PuzzleDefinition['cages']; solution: number[][] };
  metadata: { size: number; actual_difficulty: string };
};

const records = (): Record_[] => {
  const lines = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
  const picked = new Map<string, Record_>();
  for (const line of lines) {
    const record = JSON.parse(line) as Record_;
    const key = `${record.metadata.size}:${record.metadata.actual_difficulty}`;
    if (!picked.has(key)) picked.set(key, record);
  }
  return [...picked.values()];
};

const RECORDS = records();
const emptyGrid = (size: number) => Array.from({ length: size }, () => Array(size).fill(''));
const asStrings = (grid: number[][]) => grid.map(row => row.map(String));

describe('computeHint on a fresh board', () => {
  it.each(
    RECORDS.map(
      r => [`${r.metadata.size}x${r.metadata.size} ${r.metadata.actual_difficulty}`, r] as const
    )
  )('offers a deduction for %s', (_label, record) => {
    const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
    const hint = computeHint(puzzle, emptyGrid(puzzle.size));

    expect(hint).not.toBeNull();
    expect(hint!.kind).toBe('deduction');
    expect(hint!.levels.length).toBeGreaterThanOrEqual(3);
  });

  it('never offers a guess as a hint', () => {
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const hint = computeHint(puzzle, emptyGrid(puzzle.size));
      expect(hint!.technique).not.toBe('trial_and_error');
    }
  });
});

describe('progressive disclosure', () => {
  const record = RECORDS.find(r => r.metadata.size === 5)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
  const hint = computeHint(puzzle, emptyGrid(puzzle.size))!;

  it('reveals no cells at the first level', () => {
    expect(hint.levels[0].targetCells).toEqual([]);
    expect(hint.levels[0].supportCells).toEqual([]);
  });

  it('does not name a cell in the first level text', () => {
    // Cell names look like A1, D3 - the giveaway a reveal button would print
    expect(hint.levels[0].body).not.toMatch(/\b[A-G][1-7]\b/);
  });

  it('does not name the answer in the first level text', () => {
    const last = hint.levels[hint.levels.length - 1];
    // The solver's own wording names the value; level one must not
    expect(last.body).not.toBe(hint.levels[0].body);
    expect(hint.levels[0].body).not.toMatch(/must be \d/);
  });

  it('reveals the target cell only at the "which cell" level', () => {
    const whichCell = hint.levels.find(l => l.title === 'Which cell');
    expect(whichCell).toBeDefined();
    expect(whichCell!.targetCells.length).toBeGreaterThan(0);
    for (const level of hint.levels.slice(0, hint.levels.indexOf(whichCell!))) {
      expect(level.targetCells).toEqual([]);
    }
  });

  it('ends with the solver’s own description', () => {
    const last = hint.levels[hint.levels.length - 1];
    expect(last.title).toBe('The move');
    expect(last.body.length).toBeGreaterThan(0);
  });

  it('discloses monotonically - a level never hides what an earlier one showed', () => {
    let seenSupport = 0;
    let seenTarget = 0;
    for (const level of hint.levels) {
      expect(level.supportCells.length).toBeGreaterThanOrEqual(seenSupport);
      expect(level.targetCells.length).toBeGreaterThanOrEqual(seenTarget);
      seenSupport = level.supportCells.length;
      seenTarget = level.targetCells.length;
    }
  });
});

describe('does not repeat work the player has already done', () => {
  const record = RECORDS.find(r => r.metadata.size === 5)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };

  /**
   * Replays the solver's own trace to build the board a player would have if
   * they had followed it for `steps` moves: their placements, and pencil marks
   * matching the candidates that remain.
   */
  const boardAfter = (steps: number) => {
    const trace = solveWithTrace(puzzle);
    const step = trace.steps[steps - 1];
    const size = puzzle.size;
    const grid = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => (step.grid[r][c] === 0 ? '' : String(step.grid[r][c])))
    );
    const marks = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) =>
        step.grid[r][c] === 0 ? new Set([...step.candidates[r][c]].map(String)) : new Set<string>()
      )
    );
    return { grid, marks, trace };
  };

  it('does not re-suggest an elimination already recorded in pencil marks', () => {
    const { grid, marks, trace } = boardAfter(3);
    const hint = computeHint(puzzle, grid, marks, record.puzzle.solution)!;

    expect(hint.kind).toBe('deduction');
    // The first three steps are already reflected on the board, so the hint
    // must be something later in the chain
    const alreadyDone = trace.steps.slice(0, 3).map(s => s.description);
    expect(alreadyDone).not.toContain(hint.levels[hint.levels.length - 1].body);
  });

  it('never targets a cell the player has already filled', () => {
    for (const steps of [1, 3, 6, 10]) {
      const { grid, marks } = boardAfter(steps);
      const hint = computeHint(puzzle, grid, marks, record.puzzle.solution);
      if (!hint || hint.kind !== 'deduction') continue;
      const targets = hint.levels[hint.levels.length - 1].targetCells;
      for (const cell of targets) {
        expect(
          grid[cell.row][cell.col],
          `hint targeted already-filled cell ${cell.row},${cell.col}`
        ).toBe('');
      }
    }
  });

  it('advances as the player advances', () => {
    // Hints from two different positions should not be the same move
    const early = boardAfter(2);
    const later = boardAfter(8);
    const a = computeHint(puzzle, early.grid, early.marks, record.puzzle.solution)!;
    const b = computeHint(puzzle, later.grid, later.marks, record.puzzle.solution)!;
    if (a.kind === 'deduction' && b.kind === 'deduction') {
      expect(a.levels[a.levels.length - 1].body).not.toBe(b.levels[b.levels.length - 1].body);
    }
  });

  it('flags pencil marks that rule out the answer', () => {
    const size = puzzle.size;
    const grid = emptyGrid(size);
    const marks = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => new Set<string>())
    );
    // Cross off the one value that actually belongs in this cell
    const answer = record.puzzle.solution[2][2];
    marks[2][2] = new Set(
      Array.from({ length: size }, (_, i) => String(i + 1)).filter(v => v !== String(answer))
    );

    const hint = computeHint(puzzle, grid, marks, record.puzzle.solution)!;
    expect(hint.kind).toBe('stale-marks');
    expect(hint.levels[0].targetCells).toEqual([{ row: 2, col: 2 }]);
  });

  it('blames the marks, not a placement, when the cell is empty', () => {
    const size = puzzle.size;
    const marks = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => new Set<string>())
    );
    const answer = record.puzzle.solution[0][0];
    marks[0][0] = new Set(
      Array.from({ length: size }, (_, i) => String(i + 1)).filter(v => v !== String(answer))
    );

    const hint = computeHint(puzzle, emptyGrid(size), marks, record.puzzle.solution)!;
    expect(hint.kind).toBe('stale-marks');
    // The cell is empty, so this is about the notes - not a placed value
    expect(hint.levels[0].title).toBe('Your notes rule out the answer');
    expect(hint.levels[0].body).toMatch(/crossed off/);
  });

  it('treats an unmarked cell as unknown, not as having no candidates', () => {
    // Only one cell marked; the rest empty. Must still find a deduction rather
    // than concluding the puzzle is broken.
    const size = puzzle.size;
    const marks = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => new Set<string>())
    );
    marks[0][0] = new Set(['1', '2']);
    const hint = computeHint(puzzle, emptyGrid(size), marks, record.puzzle.solution)!;
    expect(['deduction', 'stale-marks']).toContain(hint.kind);
  });
});

describe('hint wording', () => {
  /** Every deduction hint reachable by walking a few puzzles' traces. */
  const collectHints = (limit = 60) => {
    const lines = readFileSync('public/all_puzzles.jsonl', 'utf8').trim().split('\n');
    const out: { technique: string; first: string; last: string }[] = [];
    for (const line of lines.slice(0, 120)) {
      const r = JSON.parse(line) as Record_;
      const puzzle: PuzzleDefinition = { size: r.puzzle.size, cages: r.puzzle.cages };
      const trace = solveWithTrace(puzzle);
      for (let i = 0; i < Math.min(trace.steps.length, 10); i++) {
        const step = trace.steps[i];
        const size = puzzle.size;
        const grid = Array.from({ length: size }, (_, rr) =>
          Array.from({ length: size }, (_, cc) =>
            step.grid[rr][cc] === 0 ? '' : String(step.grid[rr][cc])
          )
        );
        const marks = Array.from({ length: size }, (_, rr) =>
          Array.from({ length: size }, (_, cc) =>
            step.grid[rr][cc] === 0
              ? new Set([...step.candidates[rr][cc]].map(String))
              : new Set<string>()
          )
        );
        /*
         * Bank the cells the marks already settle. Left in place the hint
         * would - rightly - tell the player to fill those in before offering
         * anything new, and we would collect no technique wording at all.
         */
        for (let rr = 0; rr < size; rr++) {
          for (let cc = 0; cc < size; cc++) {
            if (grid[rr][cc] === '' && marks[rr][cc].size === 1) {
              grid[rr][cc] = [...marks[rr][cc]][0];
              marks[rr][cc] = new Set<string>();
            }
          }
        }
        const hint = computeHint(puzzle, grid, marks, r.puzzle.solution);
        if (!hint || hint.kind !== 'deduction' || !hint.technique) continue;
        out.push({
          technique: hint.technique,
          first: hint.levels[0].body,
          last: hint.levels[hint.levels.length - 1].body,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  };

  const HINTS = collectHints();
  const REGION = /\b(row \d+|column [A-G])\b/;

  it('collects a range of techniques to check', () => {
    expect(HINTS.length).toBeGreaterThan(20);
    expect(new Set(HINTS.map(h => h.technique)).size).toBeGreaterThan(3);
  });

  it('never names a region in the nudge that the actual move contradicts', () => {
    for (const hint of HINTS) {
      const claimed = hint.first.match(REGION);
      if (!claimed) continue;
      expect(hint.last, `nudge said "${claimed[0]}" but the move was: ${hint.last}`).toContain(
        claimed[0]
      );
    }
  });

  it('does not claim a row or column for a cell-based deduction', () => {
    // A naked single is a fact about one cell, not about a line. Saying "in
    // row 4" points the player at the wrong kind of search.
    for (const hint of HINTS.filter(h => h.technique === 'naked_single')) {
      expect(hint.first).not.toMatch(REGION);
    }
  });

  it('does not claim a row or column for a cage-based deduction', () => {
    const cageOnly = ['cage_impossible', 'cage_single', 'cage_combinations', 'stipulated'];
    for (const hint of HINTS.filter(h => cageOnly.includes(h.technique))) {
      expect(hint.first, `${hint.technique}: ${hint.first}`).not.toMatch(REGION);
    }
  });

  it('distinguishes a cell with one value from a value with one cell', () => {
    // The two singles are opposite readings of the board and the wording has to
    // make that unmistakable.
    const naked = HINTS.find(h => h.technique === 'naked_single');
    const hidden = HINTS.find(h => h.technique === 'hidden_single');
    if (naked) expect(naked.first).toMatch(/cell/i);
    if (hidden) expect(hidden.first).toMatch(/value|number/i);
    if (naked && hidden) expect(naked.first).not.toBe(hidden.first);
  });

  it('reads naturally where a region is named', () => {
    // "a single line in row 4" - the region has to replace the generic phrase,
    // not sit after it.
    for (const hint of HINTS) {
      // Catches every shape of doubled preposition: "to in row 4", "of in
      // column D", "a single line in row 4".
      expect(hint.first, hint.first).not.toMatch(/\b(to|of|in|inside)\s+in\s+(row|column)\b/);
      expect(hint.first, hint.first).not.toMatch(/\bline in (row|column)\b/);
      expect(hint.first, hint.first).not.toMatch(/\b(row|column) in (row|column)\b/);
      expect(hint.first, hint.first).not.toMatch(/\s{2,}/);
    }
  });

  it('keeps the nudge free of cell names and values', () => {
    for (const hint of HINTS) {
      expect(hint.first, hint.first).not.toMatch(/\b[A-G][1-7]\b/);
    }
  });
});

describe('computeHint mid-game', () => {
  const record = RECORDS.find(r => r.metadata.size === 4)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };

  it('reports a contradiction when a placed value cannot be right', () => {
    const grid = emptyGrid(puzzle.size);
    // Two of the same value in one row is unsatisfiable
    grid[0][0] = '1';
    grid[0][1] = '1';

    const hint = computeHint(puzzle, grid)!;
    expect(hint.kind).toBe('contradiction');
    expect(hint.levels[0].body).toMatch(/wrong/i);
  });

  it('reports a contradiction for a value that breaks a cage', () => {
    // Take the solution and change one cell to something else valid for the
    // Latin square but wrong for its cage
    const grid = asStrings(record.puzzle.solution);
    const size = puzzle.size;
    const original = record.puzzle.solution[0][0];
    const replacement = original === size ? original - 1 : original + 1;
    grid[0][0] = String(replacement);
    // Clear the conflicting peer so the break is the cage, not the Latin rule
    for (let c = 1; c < size; c++) if (grid[0][c] === String(replacement)) grid[0][c] = '';
    for (let r = 1; r < size; r++) if (grid[r][0] === String(replacement)) grid[r][0] = '';

    const hint = computeHint(puzzle, grid)!;
    expect(hint.kind).toBe('contradiction');
  });

  it('reports nothing left to do on a full board', () => {
    const hint = computeHint(puzzle, asStrings(record.puzzle.solution))!;
    expect(hint.kind).toBe('solved');
  });

  it('offers a deduction from a partially filled board', () => {
    const grid = emptyGrid(puzzle.size);
    // Seed the first row correctly
    record.puzzle.solution[0].forEach((v, c) => {
      grid[0][c] = String(v);
    });
    const hint = computeHint(puzzle, grid)!;
    expect(hint.kind).toBe('deduction');
  });

  it('returns null without a puzzle', () => {
    expect(computeHint(null as unknown as PuzzleDefinition, [])).toBeNull();
  });
});

describe('a position the solver can only finish by guessing', () => {
  /*
   * The board a player sees once they have marked up as far as logic goes:
   * the solver's own state from immediately before its first guess.
   *
   * Everything the solver records after that point is a consequence of the
   * guess, and looks identical to an ordinary deduction. The engine used to
   * hand those back as forced moves - on 7x7 experts, for most hints - which
   * is why they could never be explained.
   */
  const preGuessPositions = () => {
    const out = [];
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      const guess = trace.steps.findIndex(step => step.technique === 'trial_and_error');
      if (guess <= 0) continue;
      const before = trace.steps[guess - 1];
      out.push({
        key: `${record.metadata.size}x${record.metadata.size} ${record.metadata.actual_difficulty}`,
        puzzle,
        solution: record.puzzle.solution,
        grid: before.grid.map(row => row.map(v => (v === 0 ? '' : String(v)))),
        marks: before.candidates.map((row, r) =>
          row.map((set, c) =>
            before.grid[r][c] === 0 ? new Set([...set].map(String)) : new Set<string>()
          )
        ),
      });
    }
    return out;
  };

  const POSITIONS = preGuessPositions();

  it('finds such positions in the corpus to test against', () => {
    // The old test for this asserted only that the hint's own technique was not
    // trial_and_error, which is true by construction and could never fail.
    expect(POSITIONS.length).toBeGreaterThan(0);
  });

  it('never dresses a consequence of the guess up as a deduction', () => {
    for (const position of POSITIONS) {
      const hint = computeHint(position.puzzle, position.grid, position.marks, position.solution);
      const last = hint!.levels[hint!.levels.length - 1].body;
      // Either honest advice on where to branch, or a cell that search can
      // settle - but never a technique, because there is no technique left
      expect(
        ['guess-required', 'forced-by-contradiction'],
        `${position.key} offered: ${last}`
      ).toContain(hint!.kind);
    }
  });

  it('points at a cell that is actually still empty', () => {
    for (const position of POSITIONS) {
      const hint = computeHint(position.puzzle, position.grid, position.marks, position.solution)!;
      const last = hint.levels[hint.levels.length - 1];
      for (const cell of last.targetCells) {
        expect(position.grid[cell.row][cell.col], `${position.key} pointed at a filled cell`).toBe(
          ''
        );
      }
    }
  });

  it('is right whenever it claims a cell is fixed', () => {
    // The whole value of the forced-by-contradiction case is that it is sound:
    // it comes from an exhaustive check, so a wrong answer here would be worse
    // than no hint at all.
    let checked = 0;
    for (const position of POSITIONS) {
      const hint = computeHint(position.puzzle, position.grid, position.marks, position.solution)!;
      if (hint.kind !== 'forced-by-contradiction') continue;
      const last = hint.levels[hint.levels.length - 1];
      const claimed = last.body.match(/must be (\d)/);
      expect(claimed, `no value named in: ${last.body}`).toBeTruthy();
      const cell = last.targetCells[0];
      expect(Number(claimed![1]), `${position.key} at ${cell.row},${cell.col}`).toBe(
        position.solution[cell.row][cell.col]
      );
      checked++;
    }
    expect(checked, 'no forced-by-contradiction hints to check').toBeGreaterThan(0);
  });

  it('advises on where to branch rather than just saying to guess', () => {
    for (const position of POSITIONS) {
      const hint = computeHint(position.puzzle, position.grid, position.marks, position.solution)!;
      if (hint.kind !== 'guess-required') continue;
      // A bare "you need to guess" is the thing this replaced
      const named = hint.levels.some(level => level.targetCells.length > 0);
      expect(named, `no branch point offered: ${hint.levels.map(l => l.body).join(' ')}`).toBe(
        true
      );
    }
  });

  it('withholds the cell and the value at the first level, like every other hint', () => {
    // The stall hints are built by hand rather than by buildLevels, so the
    // disclosure rules have to be checked here too
    for (const position of POSITIONS) {
      const hint = computeHint(position.puzzle, position.grid, position.marks, position.solution)!;
      const first = hint.levels[0];
      expect(first.targetCells).toEqual([]);
      expect(first.supportCells).toEqual([]);
      expect(first.body, first.body).not.toMatch(/\b[A-G][1-7]\b/);
      expect(first.body, first.body).not.toMatch(/must be \d/);
    }
  });

  it('names the branch cell before it names the answer', () => {
    for (const position of POSITIONS) {
      const hint = computeHint(position.puzzle, position.grid, position.marks, position.solution)!;
      if (hint.kind !== 'forced-by-contradiction') continue;
      const answerAt = hint.levels.findIndex(level => /must be \d/.test(level.body));
      const branchAt = hint.levels.findIndex(level => level.targetCells.length > 0);
      expect(answerAt).toBeGreaterThan(0);
      expect(branchAt).toBeLessThan(answerAt);
    }
  });

  it('answers fast enough to sit behind a button', () => {
    for (const position of POSITIONS) {
      const started = Date.now();
      computeHint(position.puzzle, position.grid, position.marks, position.solution);
      const elapsed = Date.now() - started;
      expect(elapsed, `${position.key} took ${elapsed}ms`).toBeLessThan(2000);
    }
  });
});

describe('evidence behind a hint', () => {
  it('never claims placed values rule something out without naming them', () => {
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const step of trace.steps) {
        if (!step.description.includes('already placed in')) continue;
        expect(step.supportCells?.length ?? 0, step.description).toBeGreaterThan(0);
      }
    }
  });

  it('gives singles cells to point at, so the hint can show its working', () => {
    let singles = 0;
    let withEvidence = 0;
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const step of trace.steps) {
        if (step.technique !== 'naked_single' && step.technique !== 'hidden_single') continue;
        singles++;
        if ((step.supportCells?.length ?? 0) > 0) withEvidence++;
      }
    }
    expect(singles).toBeGreaterThan(20);
    // Before this change it was exactly zero for every single, at every size
    expect(withEvidence / singles).toBeGreaterThan(0.9);
  });

  it('names the marks still standing on the cell it is about', () => {
    for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      // A player who has pencilled everything in and eliminated nothing
      const marks = Array.from({ length: size }, () =>
        Array.from(
          { length: size },
          () => new Set(Array.from({ length: size }, (_, i) => String(i + 1)))
        )
      );
      const hint = computeHint(puzzle, emptyGrid(size), marks, record.puzzle.solution);
      if (hint?.kind !== 'deduction') continue;
      const single = hint.levels[hint.levels.length - 1];
      const bridge = hint.levels.find(level => level.title === 'Against your notes');
      if (single.targetCells.length !== 1) continue;
      expect(bridge, `no bridge for ${hint.technique}`).toBeTruthy();
      expect(bridge!.body).toMatch(/pencilled at [A-G]\d/);
    }
  });
});

describe('the board has to be sound before a hint is worth anything', () => {
  const record = RECORDS.find(r => r.metadata.size === 5)!;
  const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
  const size = puzzle.size;
  const solution = record.puzzle.solution;
  const noMarks = () =>
    Array.from({ length: size }, () => Array.from({ length: size }, () => new Set<string>()));
  const wrongValueFor = (row: number, col: number) => String((solution[row][col] % size) + 1);

  it('names every wrong value rather than saying to undo and hope', () => {
    const grid = emptyGrid(size);
    grid[1][1] = wrongValueFor(1, 1);
    grid[3][2] = wrongValueFor(3, 2);

    const hint = computeHint(puzzle, grid, noMarks(), solution)!;
    expect(hint.kind).toBe('contradiction');
    expect(hint.levels[0].targetCells).toEqual(
      expect.arrayContaining([
        { row: 1, col: 1 },
        { row: 3, col: 2 },
      ])
    );
    expect(hint.levels[0].body).toMatch(/B2/);
    expect(hint.levels[0].body).toMatch(/C4/);
  });

  it('reports every cell whose notes rule out its answer, not just the first', () => {
    const marks = noMarks();
    const cross = (row: number, col: number) => {
      marks[row][col] = new Set(
        Array.from({ length: size }, (_, i) => String(i + 1)).filter(
          v => v !== String(solution[row][col])
        )
      );
    };
    cross(0, 0);
    cross(2, 3);
    cross(4, 1);

    const hint = computeHint(puzzle, emptyGrid(size), marks, solution)!;
    expect(hint.kind).toBe('stale-marks');
    expect(hint.levels[0].targetCells).toHaveLength(3);
    expect(hint.levels[0].body).toMatch(/crossed off/);
  });

  it('hands back work the player has already done before offering more', () => {
    const marks = noMarks();
    marks[0][0] = new Set([String(solution[0][0])]);
    marks[2][2] = new Set([String(solution[2][2])]);

    const hint = computeHint(puzzle, emptyGrid(size), marks, solution)!;
    expect(hint.kind).toBe('unclaimed');
    expect(hint.levels[0].targetCells).toEqual([
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]);
    expect(hint.levels[0].body).toMatch(/A1/);
    expect(hint.levels[0].body).toMatch(/C3/);
  });

  it('does not mistake a cell the player has already filled for unclaimed work', () => {
    const grid = emptyGrid(size);
    grid[0][0] = String(solution[0][0]);
    const marks = noMarks();
    // A leftover mark on a filled cell is not outstanding work
    marks[0][0] = new Set([String(solution[0][0])]);

    const hint = computeHint(puzzle, grid, marks, solution)!;
    expect(hint.kind).not.toBe('unclaimed');
  });

  it('puts a wrong value ahead of bad notes, and bad notes ahead of unclaimed work', () => {
    // All three problems at once: the most damaging one has to win
    const grid = emptyGrid(size);
    grid[1][1] = wrongValueFor(1, 1);
    const marks = noMarks();
    marks[0][0] = new Set(
      Array.from({ length: size }, (_, i) => String(i + 1)).filter(
        v => v !== String(solution[0][0])
      )
    );
    marks[2][2] = new Set([String(solution[2][2])]);

    expect(computeHint(puzzle, grid, marks, solution)!.kind).toBe('contradiction');

    // Fix the placement: the notes are next
    grid[1][1] = '';
    expect(computeHint(puzzle, grid, marks, solution)!.kind).toBe('stale-marks');

    // Fix the notes: the unbanked cell is next
    marks[0][0] = new Set<string>();
    expect(computeHint(puzzle, grid, marks, solution)!.kind).toBe('unclaimed');

    // Bank it, and a real hint finally arrives
    marks[2][2] = new Set<string>();
    expect(computeHint(puzzle, grid, marks, solution)!.kind).toBe('deduction');
  });
});

describe('a hint is the easiest move on the board', () => {
  /*
   * Every step considered is derived from the player's position independently
   * of the others, which is what makes choosing between them safe. The trace
   * cannot be reordered the same way: its steps form a chain, and picking a
   * later one hands over a conclusion whose premises are not yet on the board.
   */
  it('never offers a harder deduction when an easier one is available', () => {
    let checked = 0;
    for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const i of [0, 2, 5, 9, 14]) {
        const step = trace.steps[i];
        if (!step) continue;
        const grid = step.grid.map(row => row.map(v => (v === 0 ? '' : String(v))));
        const marks = step.candidates.map((row, r) =>
          row.map((set, c) =>
            step.grid[r][c] === 0 ? new Set([...set].map(String)) : new Set<string>()
          )
        );
        const hint = computeHint(puzzle, grid, marks, record.puzzle.solution);
        if (hint?.kind !== 'deduction') continue;

        const startGrid = step.grid;
        const startCandidates = step.candidates.map(row => row.map(set => new Set(set)));
        const { availableSteps } = solveToStall(puzzle, {
          startGrid,
          startCandidates,
          solution: record.puzzle.solution,
        });
        // Once: it re-runs every technique, so calling it per comparison
        // turned this from seconds into a timeout on slower machines
        // The same set the selector chooses from: steps another step
        // strictly contains are not on offer, however cheap they look
        const available = eligibleSteps(availableSteps(), startGrid);
        const shown = hint.levels[hint.levels.length - 1].body;
        const chosen = available.find(s => s.description === shown);
        expect(chosen, `hint not among the available steps: ${shown}`).toBeTruthy();

        const mine = stepDifficulty(chosen!, startGrid, size);
        for (const other of available) {
          expect(
            stepDifficulty(other, startGrid, size),
            `${other.description} is easier than the one shown: ${shown}`
          ).toBeGreaterThanOrEqual(mine);
        }
        checked++;
      }
    }
    expect(checked, 'no deduction hints found to check').toBeGreaterThan(5);
  });

  it('never offers a weaker version of a move that is also available', () => {
    /*
     * A cage read two ways gives two strengths of the same move: its abstract
     * arithmetic ruled 6 out of a 4-cell 11+ cage, while the same cage against
     * the board's candidates ruled out 4, 5 and 6 in the same place. The
     * weaker one scores as easier - it is the same cage and the same argument,
     * so taking it just leaves more of the board undone.
     */
    let checked = 0;
    for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const i of [0, 3, 8]) {
        const step = trace.steps[i];
        if (!step) continue;
        const startGrid = step.grid;
        const { availableSteps } = solveToStall(puzzle, {
          startGrid,
          startCandidates: step.candidates.map(row => row.map(set => new Set(set))),
          solution: record.puzzle.solution,
        });
        const offered = eligibleSteps(availableSteps(), startGrid);
        for (const a of offered) {
          for (const b of offered) {
            if (a === b) continue;
            const inA = new Set(
              a.changes.eliminated.flatMap(c => c.values.map(v => `${c.row}:${c.col}:${v}`))
            );
            const inB = new Set(
              b.changes.eliminated.flatMap(c => c.values.map(v => `${c.row}:${c.col}:${v}`))
            );
            if (inA.size === 0 || inA.size >= inB.size) continue;
            const contained = [...inA].every(x => inB.has(x));
            expect(contained, `${a.description} is contained by ${b.description}`).toBe(false);
          }
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('prefers a nearly-filled cage over a hidden single down an open line', () => {
    // The case that prompted this: an 8+ cage with two of three cells placed
    // is arithmetic on numbers you can see; a hidden single is a line search
    const record = RECORDS.find(r => r.metadata.size === 7)!;
    const size = record.puzzle.size;
    const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
    const grid = emptyGrid(size);
    const trivialCage = puzzle.cages.find(
      cage => cage.cells.length === 3 && cage.operation === '+'
    );
    if (!trivialCage) return;
    // Fill all but one cell of it from the solution
    const flat = trivialCage.cells;
    for (const idx of flat.slice(1)) {
      grid[Math.floor(idx / size)][idx % size] = String(
        record.puzzle.solution[Math.floor(idx / size)][idx % size]
      );
    }
    const hint = computeHint(puzzle, grid, undefined, record.puzzle.solution)!;
    const target = hint.levels[hint.levels.length - 1].targetCells[0];
    if (!target) return;
    // Whatever it picks, nothing easier may remain
    const startGrid = grid.map(row => row.map(v => (v === '' ? 0 : Number(v))));
    const { availableSteps } = solveToStall(puzzle, {
      startGrid,
      solution: record.puzzle.solution,
    });
    const available = eligibleSteps(availableSteps(), startGrid);
    const shown = hint.levels[hint.levels.length - 1].body;
    const chosen = available.find(s => s.description === shown)!;
    for (const other of available) {
      expect(stepDifficulty(other, startGrid, size)).toBeGreaterThanOrEqual(
        stepDifficulty(chosen, startGrid, size)
      );
    }
  });
});

describe('descriptions name the board the way the board is labelled', () => {
  it('never refers to a column by number', () => {
    // Columns are lettered on the grid, so "cols 5,6,7" sent the player
    // hunting for a column 5
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const { steps } = solveToStall(puzzle, { solution: record.puzzle.solution });
      for (const step of steps) {
        expect(step.description, step.description).not.toMatch(/\bcolumns?\s+\d/i);
        expect(step.description, step.description).not.toMatch(/\brows?\/cols?\b/i);
      }
    }
  });
});

describe('the move a hint offers to apply', () => {
  /*
   * Apply writes to the player's board, so a wrong action is worse than a
   * confusing sentence: it damages a position they cannot easily audit. These
   * check the two ways that could happen - placing a value that is not the
   * answer, or striking the answer out of a cell's notes.
   */
  const positions = () => {
    const out: {
      key: string;
      puzzle: PuzzleDefinition;
      grid: string[][];
      marks: Set<string>[][];
      solution: number[][];
    }[] = [];
    for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const i of [0, 2, 5, 9]) {
        const step = trace.steps[i];
        if (!step) continue;
        const grid = step.grid.map(row => row.map(v => (v === 0 ? '' : String(v))));
        const marks = step.candidates.map((row, r) =>
          row.map((set, c) =>
            step.grid[r][c] === 0 ? new Set([...set].map(String)) : new Set<string>()
          )
        );
        out.push({
          key: `${size}x${size} ${record.metadata.actual_difficulty} @${i}`,
          puzzle,
          grid,
          marks,
          solution: record.puzzle.solution,
        });
      }
    }
    return out;
  };

  const POSITIONS = positions();

  it('only ever places the value that actually belongs there', () => {
    let placements = 0;
    for (const p of POSITIONS) {
      const hint = computeHint(p.puzzle, p.grid, p.marks, p.solution);
      for (const cell of hint?.action?.place ?? []) {
        if (cell.value === '') continue; // clearing a wrong entry
        expect(Number(cell.value), `${p.key} at ${cell.row},${cell.col}`).toBe(
          p.solution[cell.row][cell.col]
        );
        placements++;
      }
    }
    expect(placements).toBeGreaterThan(5);
  });

  it('never strikes a cell’s own answer out of its notes', () => {
    let eliminations = 0;
    for (const p of POSITIONS) {
      const hint = computeHint(p.puzzle, p.grid, p.marks, p.solution);
      for (const cell of hint?.action?.eliminate ?? []) {
        expect(cell.values, `${p.key} at ${cell.row},${cell.col}`).not.toContain(
          p.solution[cell.row][cell.col]
        );
        eliminations += cell.values.length;
      }
    }
    expect(eliminations).toBeGreaterThan(5);
  });

  it('only clears cells that really do hold a wrong value', () => {
    const record = RECORDS.find(r => r.metadata.size === 5)!;
    const size = record.puzzle.size;
    const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
    const grid = emptyGrid(size);
    grid[1][1] = String((record.puzzle.solution[1][1] % size) + 1);

    const hint = computeHint(puzzle, grid, undefined, record.puzzle.solution)!;
    expect(hint.action?.place).toEqual([{ row: 1, col: 1, value: '' }]);
  });

  it('offers nothing to apply where nothing is forced', () => {
    for (const record of RECORDS) {
      const puzzle: PuzzleDefinition = { size: record.puzzle.size, cages: record.puzzle.cages };
      const full = asStrings(record.puzzle.solution);
      expect(computeHint(puzzle, full, undefined, record.puzzle.solution)!.action).toBeUndefined();
    }
  });

  it('gives every deduction something to apply', () => {
    for (const p of POSITIONS) {
      const hint = computeHint(p.puzzle, p.grid, p.marks, p.solution);
      if (hint?.kind !== 'deduction') continue;
      expect(hint.action, `${p.key}: ${hint.levels[hint.levels.length - 1].body}`).toBeTruthy();
    }
  });
});

describe('cells are listed the way they are read', () => {
  const cellsIn = (text: string) => text.match(/\b[A-G][1-7]\b/g) ?? [];
  const isSorted = (names: string[]) => {
    const key = (n: string) => Number(n.slice(1)) * 10 + (n.charCodeAt(0) - 65);
    return names.every((n, i) => i === 0 || key(names[i - 1]) <= key(n));
  };

  it('never lists them in the order the solver happened to reach them', () => {
    // "Work from A3, A4, A1, A2" - the same four cells a player scans in order
    let checked = 0;
    for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const i of [0, 1, 3, 6, 10]) {
        const step = trace.steps[i];
        if (!step) continue;
        const grid = step.grid.map(row => row.map(v => (v === 0 ? '' : String(v))));
        const marks = step.candidates.map((row, r) =>
          row.map((set, c) =>
            step.grid[r][c] === 0 ? new Set([...set].map(String)) : new Set<string>()
          )
        );
        const hint = computeHint(puzzle, grid, marks, record.puzzle.solution);
        for (const level of hint?.levels ?? []) {
          // Only the engine's own prose; the last level is the solver's wording
          if (level.title === 'The move') continue;
          const names = cellsIn(level.body);
          if (names.length < 2) continue;
          expect(isSorted(names), `${level.title}: ${level.body}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked, 'no multi-cell lists found to check').toBeGreaterThan(3);
  });
});

describe('a hint says what the step actually did', () => {
  const stepPositions = () => {
    const out: {
      key: string;
      puzzle: PuzzleDefinition;
      grid: string[][];
      marks: Set<string>[][];
      solution: number[][];
    }[] = [];
    for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (const i of [0, 1, 2, 3, 4, 6, 8, 11, 15, 20, 26]) {
        const step = trace.steps[i];
        if (!step) continue;
        out.push({
          key: `${size}x${size} @${i}`,
          puzzle,
          grid: step.grid.map(row => row.map(v => (v === 0 ? '' : String(v)))),
          marks: step.candidates.map((row, r) =>
            row.map((set, c) =>
              step.grid[r][c] === 0 ? new Set([...set].map(String)) : new Set<string>()
            )
          ),
          solution: record.puzzle.solution,
        });
      }
    }
    return out;
  };

  const POSITIONS = stepPositions();

  it('never claims a cell is settled when it is only narrowed', () => {
    /*
     * A cage_combinations step routinely strikes two of four candidates and
     * leaves two standing. Saying it "leaves exactly one of them standing" or
     * that the cell "can be settled" was simply false.
     */
    let narrowing = 0;
    for (const p of POSITIONS) {
      const hint = computeHint(p.puzzle, p.grid, p.marks, p.solution);
      if (hint?.kind !== 'deduction' || hint.action?.place) continue;
      narrowing++;
      for (const level of hint.levels) {
        if (level.title === 'The move') continue;
        expect(level.body, `${p.key}: ${level.body}`).not.toMatch(/can be settled/);
        expect(level.body, `${p.key}: ${level.body}`).not.toMatch(/exactly one of them standing/);
      }
    }
    expect(narrowing, 'no narrowing hints found to check').toBeGreaterThan(3);
  });

  it('lights the whole line when the nudge tells you to search one', () => {
    let regional = 0;
    for (const p of POSITIONS) {
      const hint = computeHint(p.puzzle, p.grid, p.marks, p.solution);
      if (hint?.kind !== 'deduction') continue;
      // Any preposition: "in row 4", "confines a value to row 1"
      const named = hint.levels[0].body.match(/\b(row \d+|column [A-G])\b/);
      if (!named) {
        // Nothing named, nothing to light
        expect(hint.levels[0].regionCells).toEqual([]);
        continue;
      }
      regional++;
      const cells = hint.levels[0].regionCells;
      expect(cells.length, `${p.key}: ${named[0]}`).toBe(p.puzzle.size);
      // A single line: all one row, or all one column
      const rows = new Set(cells.map(c => c.row));
      const cols = new Set(cells.map(c => c.col));
      expect(rows.size === 1 || cols.size === 1).toBe(true);
    }
    expect(regional, 'no region-based hints found to check').toBeGreaterThan(0);
  });

  it('shows the arithmetic behind a cage elimination', () => {
    /*
     * Its own scan: cage_combinations is common overall but lands at
     * different points in each puzzle, so fixed sample indices miss it.
     */
    let explained = 0;
    outer: for (const record of RECORDS) {
      const size = record.puzzle.size;
      const puzzle: PuzzleDefinition = { size, cages: record.puzzle.cages };
      const trace = solveWithTrace(puzzle, { solution: record.puzzle.solution });
      for (let i = 0; i < Math.min(trace.steps.length, 24); i++) {
        const step = trace.steps[i];
        const grid = step.grid.map(row => row.map(v => (v === 0 ? '' : String(v))));
        const marks = step.candidates.map((row, r) =>
          row.map((set, c) =>
            step.grid[r][c] === 0 ? new Set([...set].map(String)) : new Set<string>()
          )
        );
        const hint = computeHint(puzzle, grid, marks, record.puzzle.solution);
        if (hint?.technique !== 'cage_combinations') continue;
        const move = hint.levels[hint.levels.length - 1].body;
        // Beyond the bare conclusion: what the rest of the cage would have to do
        expect(move, `${size}x${size} @${i}`).toMatch(/can total|would need|nothing reaches/);
        if (++explained >= 5) break outer;
      }
    }
    expect(explained, 'no cage_combinations hints found to check').toBeGreaterThan(0);
  });
});
