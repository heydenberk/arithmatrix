/**
 * Hints.
 *
 * A hint here is not "the answer to a cell". It is the reasoning a player needs
 * to find the answer themselves, released a piece at a time:
 *
 *   1. which technique applies, and roughly where
 *   2. the cells whose contents drive the deduction
 *   3. the cell the deduction resolves
 *   4. only then, the solver's own account of the move
 *
 * Everything comes from the existing solver trace. Each SolverStep already
 * carries the technique, the cells it resolves (`highlight`) and the cells that
 * justify it (`supportCells`), so the work here is choosing which step to
 * describe and withholding most of it.
 *
 * Two rules keep hints honest:
 *
 * - Only deductive steps are offered. `trial_and_error` is a guess, and on a
 *   puzzle with more than one solution a guess would point at one arbitrary
 *   answer. If the position needs a guess, the hint says so instead.
 * - The player's pencil marks are part of the position. Ignoring them - which
 *   this originally did, on the grounds that marks are notes rather than
 *   constraints - meant the solver restarted from full candidate sets and its
 *   first deduction was usually an elimination the player had already made and
 *   written down. A hint that tells you what you already know is not a hint.
 *
 * An unmarked cell means "not thought about yet", not "no candidates", so those
 * start from the full set. Marks that rule out a cell's actual answer are
 * reported rather than reasoned from.
 */

import { PuzzleDefinition } from '../types/ArithmatrixTypes';
import {
  BranchPoint,
  CellRef,
  SolverStep,
  StallAnalysis,
  TECHNIQUE_LABELS,
  TechniqueId,
  countSolutions,
  solveToStall,
} from './solver';

export type HintLevel = {
  /** Short heading, e.g. "Where to look". */
  title: string;
  body: string;
  /** Cells to highlight as the reasoning's evidence at this level. */
  supportCells: CellRef[];
  /** Cells to highlight as the deduction's target at this level. */
  targetCells: CellRef[];
};

export type Hint = {
  kind:
    | 'deduction'
    | 'contradiction'
    | 'stale-marks'
    /** No forced move, but one cell's alternatives all collapse: still a proof. */
    | 'forced-by-contradiction'
    | 'guess-required'
    | 'solved';
  technique?: TechniqueId;
  techniqueLabel?: string;
  levels: HintLevel[];
};

/**
 * How each technique works, in the player's terms and without naming a cell or
 * a value.
 *
 * The two "singles" are opposite readings of the same board and were the source
 * of real confusion, so they are worded as a deliberate pair: a naked single is
 * a *cell with one value left*, a hidden single is a *value with one cell left*.
 *
 * Each takes the region the solver named, which is empty for deductions that
 * are not about a line. Inferring a region from cell geometry - as this used to
 * - produced "in row 1" for a fact about a single cell, and could even
 * contradict the move itself, since a lone cell sits in a row and a column
 * equally.
 */
const TECHNIQUE_NUDGES: Record<TechniqueId, (region: string) => string> = {
  stipulated: () => 'A cage covering a single cell states that cell’s value outright.',
  naked_single: () =>
    'Somewhere there is a cell with only one value left that can go in it. Between them, the ' +
    'values already placed in its row and its column rule out every other option.',
  hidden_single: region =>
    `Somewhere${region ? ` in ${region}` : ''} there is a value with only one square left ` +
    'that can hold it. Rather than asking what fits a cell, ask where a number can still go.',
  cage_impossible: () =>
    'A cage’s target rules a value out of it completely — no combination reaching that total ' +
    'uses the value at all.',
  cage_single: () => 'A cage’s target leaves only one possible value for one of its cells.',
  cage_locked: () =>
    'A cage’s cells must hold one particular set of values between them, which narrows every ' +
    'cell in it.',
  cage_combinations: () =>
    'Listing the combinations that reach a cage’s target rules a value out of one of its cells.',
  cage_intersection: region =>
    `A cage confines a value to ${region || 'a single row or column'}, so that value can be ` +
    'ruled out of the rest of that line.',
  multi_cage_line_lock: region =>
    `Several cages together confine a set of values to ${region || 'one line'}, which frees ` +
    'up the squares outside them.',
  summation: region =>
    `Compare the total of ${region || 'a row or column'} against the cage targets covering ` +
    'it; the difference pins a cell down.',
  cross_cage_feasibility: () =>
    'Checking neighbouring cages against each other shows a candidate cannot work.',
  trial_and_error: () => 'No forced move is available — this position needs a guess.',
};

const columnLetter = (col: number) => String.fromCharCode('A'.charCodeAt(0) + col);
const cellName = (cell: CellRef) => `${columnLetter(cell.col)}${cell.row + 1}`;

/**
 * The line a deduction is about, read out of the solver's own description.
 *
 * The solver states it there ("Hidden single in column D: ...") and that is the
 * only authoritative source: deriving it from the highlighted cells gave a
 * region for deductions that have none, and could disagree with the move.
 */
const describeRegion = (step: SolverStep): string => {
  const match = step.description.match(/\bin (row \d+|column [A-Z])\b/);
  // Bare name, no preposition: each nudge reads differently ("in row 4" versus
  // "to row 4"), so the sentence supplies its own.
  return match ? match[1] : '';
};

const listCells = (cells: CellRef[]) => cells.map(cellName).join(', ');

/** Converts the UI's string grid into the solver's numeric one. */
const toNumericGrid = (gridValues: string[][]): number[][] =>
  gridValues.map(row => row.map(cell => (cell === '' ? 0 : parseInt(cell, 10) || 0)));

/**
 * Turns the player's pencil marks into solver candidate sets.
 *
 * A cell the player has marked is taken at their word: those are the values
 * they still consider possible, so the solver should not re-derive eliminations
 * they have already made. A cell with no marks is untouched thinking, not an
 * empty candidate set, so it starts from the full range.
 */
const toStartCandidates = (
  size: number,
  gridValues: string[][],
  pencilMarks: Set<string>[][]
): Set<number>[][] =>
  Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const full = new Set(Array.from({ length: size }, (_, i) => i + 1));
      if (gridValues[row]?.[col]) return full;
      const marks = pencilMarks[row]?.[col];
      if (!marks || marks.size === 0) return full;
      const parsed = new Set<number>();
      for (const mark of marks) {
        const value = parseInt(mark, 10);
        if (value >= 1 && value <= size) parsed.add(value);
      }
      // Marks we could not read at all are worth less than no marks
      return parsed.size > 0 ? parsed : full;
    })
  );

/** The solver labels its pencil-mark and placement fixes with this prefix. */
const isRepairStep = (step: SolverStep) => step.description.startsWith('Repair:');

/**
 * How far to look past the first usable step for one that carries evidence.
 * Small on purpose: a later step is a deeper deduction, and a hint that skips
 * ahead is worse than one that is merely terse.
 */
const EXPLAINABLE_WINDOW = 4;

/**
 * The step worth showing: a real deduction, not a guess, and not aimed at a
 * cell the player has already filled.
 *
 * Among the first few candidates it prefers one with supporting cells, because
 * a step with evidence can be shown and a step without one can only be
 * asserted - which is the difference between a hint and an answer.
 */
const firstDeductiveStep = (steps: SolverStep[], startGrid: number[][]): SolverStep | null => {
  const eligible = steps.filter(
    step =>
      step.technique !== 'trial_and_error' &&
      !isRepairStep(step) &&
      // Nothing to say about a cell that already has a value in it
      step.highlight.some(cell => startGrid[cell.row]?.[cell.col] === 0)
  );
  const explainable = eligible
    .slice(0, EXPLAINABLE_WINDOW)
    .find(step => (step.supportCells?.length ?? 0) > 0);
  return explainable ?? eligible[0] ?? null;
};

const buildLevels = (step: SolverStep, pencilMarks?: Set<string>[][]): HintLevel[] => {
  const target = step.highlight;
  const support = step.supportCells ?? [];
  const region = describeRegion(step);

  const levels: HintLevel[] = [
    {
      title: 'Where to look',
      // The plain description leads; the technique's name is surfaced by the
      // panel as a label, so the sentence does not open with solver jargon.
      body: TECHNIQUE_NUDGES[step.technique](region),
      supportCells: [],
      targetCells: [],
    },
  ];

  // The evidence, when the step has evidence distinct from its target
  if (support.length > 0) {
    levels.push({
      title: 'What it follows from',
      body:
        support.length === 1
          ? `Work from ${cellName(support[0])}. That alone settles another cell nearby.`
          : `Work from ${listCells(support)}. Together these are enough to settle another cell nearby.`,
      supportCells: support,
      targetCells: [],
    });
  }

  levels.push({
    title: 'Which cell',
    body:
      target.length === 1
        ? `${cellName(target[0])} can be settled from here.`
        : `${listCells(target)} can be narrowed from here.`,
    supportCells: support,
    targetCells: target,
  });

  /*
   * Bridge to what the player is actually looking at.
   *
   * "Naked single at F7" against a cell showing two pencil marks reads as a
   * contradiction, because the solver is describing its own candidate set and
   * the player is describing theirs. Naming their marks makes the step land as
   * "cross one of these off" rather than "you are wrong about this cell".
   */
  const single = target.length === 1 ? target[0] : null;
  const marks = single ? pencilMarks?.[single.row]?.[single.col] : undefined;
  if (single && marks && marks.size > 1) {
    const listed = [...marks]
      .map(Number)
      .sort((a, b) => a - b)
      .join(', ');
    levels.push({
      title: 'Against your notes',
      body: `You have ${listed} pencilled at ${cellName(single)}. This leaves exactly one of them standing.`,
      supportCells: support,
      targetCells: target,
    });
  }

  levels.push({
    // The solver's own wording, which names the value
    title: 'The move',
    body: step.description,
    supportCells: support,
    targetCells: target,
  });

  return levels;
};

/**
 * Ranks branch points by what they cost a player, cheapest first.
 *
 * A point where logic alone refutes every option but one is not a branch at
 * all - it is a proof - so those come first. After that fewer options is
 * better (a two-way choice is half the work of a four-way), and among equals
 * the one whose wrong turn shows up soonest, since that is the one you can
 * back out of cheaply.
 */
const branchCost = (point: BranchPoint): number[] => [
  point.forced === undefined ? 1 : 0,
  point.options.length,
  point.shallowestRefutation ?? Number.MAX_SAFE_INTEGER,
];

/** Lexicographic: earlier entries in the cost vector dominate later ones. */
const compareCost = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

const byCost = (points: BranchPoint[]): BranchPoint[] =>
  [...points].sort((a, b) => compareCost(branchCost(a), branchCost(b)));

/**
 * "3 deductions" / "1 deduction".
 *
 * Branch depth counts recorded inferences, and most of those are eliminations
 * rather than placements, so calling them moves would overstate what the
 * player would actually have to undo.
 */
const deductions = (n: number) => `${n} deduction${n === 1 ? '' : 's'}`;

/*
 * Branch points to settle by exhaustive search, and how long to spend on it.
 *
 * Search answers "is this value possible" exactly where propagation only
 * guesses, and on a stalled board it is fast - single-digit milliseconds,
 * because most of the grid is already filled. But an early stall on a 7x7 is a
 * much bigger search, and this runs while somebody waits, so both the number
 * of cells tried and the wall clock are capped. Falling out of the budget
 * costs the player nothing worse than the advice they would have had anyway.
 */
const EXACT_BRANCH_POINTS = 2;
const EXACT_BUDGET_MS = 300;

type ExactResult = { viable: number[]; complete: boolean };

/** Which of a cell's candidates actually admit a solution. */
const testExactly = (
  puzzleDefinition: PuzzleDefinition,
  grid: number[][],
  point: BranchPoint,
  deadline: number
): ExactResult => {
  const viable: number[] = [];
  for (const option of point.options) {
    if (Date.now() > deadline) return { viable, complete: false };
    const trial = grid.map(row => row.slice());
    trial[point.cell.row][point.cell.col] = option.value;
    if (countSolutions(puzzleDefinition, 1, trial) > 0) viable.push(option.value);
  }
  return { viable, complete: true };
};

/**
 * The hint for a position that deduction cannot finish.
 *
 * "You need to guess" is true but useless on its own: when the solver stalls,
 * some cells are a two-way choice that collapses in three moves and others are
 * a five-way choice that runs for twenty, and a player told only to guess is
 * as likely to pick the worst as the best. So this costs the branches out and
 * names the cheapest.
 *
 * Two better outcomes are checked for first. If propagation alone kills every
 * option but one, the survivor is proved by ordinary reasoning and there is
 * nothing to guess. Failing that, exhaustive search can still settle the cell -
 * the value is forced, just not by any argument short enough to see - and
 * saying so beats sending the player down a branch that cannot work.
 */
const stallHint = (puzzleDefinition: PuzzleDefinition, stall: StallAnalysis): Hint => {
  const grid = stall.grid;
  const ranked = byCost(stall.branchPoints());
  const branch = ranked[0];

  if (!branch) {
    return {
      kind: 'guess-required',
      levels: [
        {
          title: 'No forced move',
          body:
            'Nothing here can be settled by reasoning alone. From this position the puzzle has ' +
            'to be finished by picking a value and following it through — set a checkpoint ' +
            'first so you can back out if the branch dies.',
          supportCells: [],
          targetCells: [],
        },
      ],
    };
  }

  // Best case: the alternatives die under ordinary propagation, so this is a
  // deduction the player could have made and the hint can teach it
  if (branch.forced !== undefined) {
    const others = branch.options.filter(option => option.value !== branch.forced);
    const worst = Math.max(...others.map(option => option.depth));
    return {
      kind: 'forced-by-contradiction',
      levels: [
        {
          title: 'No forced move — but not a guess either',
          body:
            'Nothing can be read straight off the board here. One cell can still be settled ' +
            'though: take each value it could hold in turn and follow the consequences, and all ' +
            'but one of them leave some cell with nothing to put in it.',
          supportCells: [],
          targetCells: [],
        },
        {
          title: 'Which cell',
          body:
            `${cellName(branch.cell)} is the one to test — ${branch.options.length} candidates, ` +
            `fewer than anywhere else. ${others.length === 1 ? 'The other collapses' : `${others.length} of them collapse`} ` +
            `within ${deductions(worst)}, so this is quick to check by hand.`,
          supportCells: [],
          targetCells: [branch.cell],
        },
        {
          title: 'The move',
          body: `${cellName(branch.cell)} must be ${branch.forced} — every other value there runs a cell out of options.`,
          supportCells: [],
          targetCells: [branch.cell],
        },
      ],
    };
  }

  /*
   * Second best: search settles it even though no technique does. Only the few
   * cheapest cells are tried, and only while the clock allows.
   */
  const deadline = Date.now() + EXACT_BUDGET_MS;
  for (const point of ranked.slice(0, EXACT_BRANCH_POINTS)) {
    const { viable, complete } = testExactly(puzzleDefinition, grid, point, deadline);
    if (!complete || viable.length !== 1) continue;
    const dead = point.options.filter(option => option.value !== viable[0]);
    const survives = Math.max(...dead.map(option => option.depth));
    /*
     * The answer is known, but it goes last. What the player can use first is
     * the advice: which cell is cheapest to branch on, and how expensive being
     * wrong will be. Only if they keep asking do they get the value - the same
     * bargain every other hint makes.
     */
    return {
      kind: 'forced-by-contradiction',
      levels: [
        {
          title: 'No forced move',
          body:
            'Nothing can be read off the board from here — the rest of this one has to be found ' +
            'by assuming a value and following it out. Some cells are far cheaper to test than ' +
            'others, so it is worth picking the branch rather than taking the first that looks ' +
            'interesting.',
          supportCells: [],
          targetCells: [],
        },
        {
          title: 'Where to branch',
          body:
            `${cellName(point.cell)} is the cheapest place, with ${point.options.length} ` +
            `candidates and nothing on the board narrower. Set a checkpoint before you commit: ` +
            `a wrong choice here keeps looking fine for about ${deductions(survives)} before the ` +
            'branch runs dry, which is exactly why nothing points at it.',
          supportCells: [],
          targetCells: [point.cell],
        },
        {
          title: 'Or skip the search',
          body: `${cellName(point.cell)} must be ${viable[0]} — no completed grid exists with anything else there.`,
          supportCells: [],
          targetCells: [point.cell],
        },
      ],
    };
  }

  /*
   * A genuine branch. The useful advice is where it is cheapest and how long
   * before a wrong turn shows itself: the difference between undoing three
   * moves and undoing twenty.
   */
  const shallowestStall = Math.min(...branch.options.map(option => option.depth));
  const payoff =
    branch.shallowestRefutation === undefined
      ? `Either choice carries you about ${deductions(shallowestStall)} further before things stall ` +
        'again, so keep the checkpoint until you are sure.'
      : `A wrong choice runs a cell out of options within ${deductions(branch.shallowestRefutation)}, ` +
        'so you will not have far to back up.';

  return {
    kind: 'guess-required',
    levels: [
      {
        title: 'No forced move',
        body:
          'Nothing here can be settled by reasoning alone, so the rest has to be found by ' +
          'assuming a value and following it through. Some cells are far cheaper to try than ' +
          'others — look for the one with the fewest candidates left.',
        supportCells: [],
        targetCells: [],
      },
      {
        title: 'Where to branch',
        body:
          `${cellName(branch.cell)} is the cheapest place to do it, with ${branch.options.length} ` +
          `candidates and nothing on the board narrower. ${payoff}`,
        supportCells: [],
        targetCells: [branch.cell],
      },
      {
        title: 'The move',
        body:
          `Set a checkpoint, then put one of ${branch.options.map(o => o.value).join(' or ')} in ` +
          `${cellName(branch.cell)} and carry on. If it collapses, revert and the other stands.`,
        supportCells: [],
        targetCells: [branch.cell],
      },
    ],
  };
};

/**
 * Works out the next hint for a position.
 *
 * `gridValues` is the player's board as the UI holds it; empty strings are
 * empty cells. `pencilMarks` are their notes, which the hint reasons from so it
 * never repeats an elimination they have already made. `solution` lets marks
 * that rule out a cell's answer be reported rather than reasoned from.
 *
 * Returns null only if the puzzle itself is missing.
 */
export const computeHint = (
  puzzleDefinition: PuzzleDefinition,
  gridValues: string[][],
  pencilMarks?: Set<string>[][],
  solution?: number[][]
): Hint | null => {
  if (!puzzleDefinition || gridValues.length === 0) return null;

  const startGrid = toNumericGrid(gridValues);

  const complete = startGrid.every(row => row.every(value => value !== 0));
  if (complete) {
    return {
      kind: 'solved',
      levels: [
        {
          title: 'Nothing left',
          body: 'Every cell is filled.',
          supportCells: [],
          targetCells: [],
        },
      ],
    };
  }

  /*
   * A wrong entry is the most useful thing a hint can report, and the solver
   * would otherwise dead-end trying to reason from it.
   */
  if (countSolutions(puzzleDefinition, 1, startGrid) === 0) {
    return {
      kind: 'contradiction',
      levels: [
        {
          title: 'Something is off',
          body:
            'No solution remains from this position, so one of the values already on the board ' +
            'must be wrong. Try undoing your most recent entries.',
          supportCells: [],
          targetCells: [],
        },
      ],
    };
  }

  const startCandidates = pencilMarks
    ? toStartCandidates(puzzleDefinition.size, gridValues, pencilMarks)
    : undefined;

  /*
   * Deduction only. The old call solved all the way through, backtracking past
   * the stall, and every step that produced was discarded - a hint may not
   * report anything found inside a guessed branch.
   */
  const stall = solveToStall(puzzleDefinition, { startGrid, startCandidates, solution });

  /*
   * The solver repairs a position it cannot reason from - a pencil mark that
   * rules out a cell's answer - and says so. That is worth surfacing directly:
   * it is the difference between "here is your next move" and "your notes have
   * a mistake in them".
   */
  const repair = stall.steps.find(isRepairStep);
  if (repair) {
    const cell = repair.highlight[0];
    /*
     * Which kind of repair it was, read off the player's own board rather than
     * the solver's wording: a cell that holds a value had a bad placement, an
     * empty one had its answer crossed off in the marks. Both of the solver's
     * repair messages contain the word "had", so matching on the text got this
     * backwards.
     */
    const misplaced = startGrid[cell.row]?.[cell.col] !== 0;
    return {
      kind: 'stale-marks',
      levels: [
        {
          title: misplaced ? 'A value looks wrong' : 'Your notes rule out the answer',
          body: misplaced
            ? `The value in ${cellName(cell)} cannot be right. Clearing it will let the rest fall into place.`
            : `${cellName(cell)} has its answer crossed off in your pencil marks, so nothing can be deduced from there. Worth re-checking that cell.`,
          supportCells: [],
          targetCells: [cell],
        },
      ],
    };
  }

  const step = firstDeductiveStep(stall.steps, startGrid);

  if (!step) return stallHint(puzzleDefinition, stall);

  return {
    kind: 'deduction',
    technique: step.technique,
    techniqueLabel: TECHNIQUE_LABELS[step.technique],
    levels: buildLevels(step, pencilMarks),
  };
};
