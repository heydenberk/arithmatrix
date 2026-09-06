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
 * - The player's pencil marks are ignored. They are notes, not constraints;
 *   deducing from them would make hints depend on the player's bookkeeping and
 *   could dead-end on a stray mark.
 */

import { PuzzleDefinition } from '../types/ArithmatrixTypes';
import {
  CellRef,
  SolverStep,
  TECHNIQUE_LABELS,
  TechniqueId,
  countSolutions,
  solveWithTrace,
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
  kind: 'deduction' | 'contradiction' | 'guess-required' | 'solved';
  technique?: TechniqueId;
  techniqueLabel?: string;
  levels: HintLevel[];
};

/**
 * How each technique works, in the player's terms and without naming a cell or
 * a value. This is the whole point of the feature: enough to know what kind of
 * look to take, not enough to skip the thinking.
 */
const TECHNIQUE_NUDGES: Record<TechniqueId, string> = {
  stipulated: 'A cage covering a single cell states that cell’s value outright.',
  naked_single:
    'One empty cell has just a single candidate left once its row and column are taken into account.',
  hidden_single:
    'Somewhere in a row or column, one value has only a single square left that can hold it.',
  cage_impossible:
    'A cage’s target rules some values out of it entirely — no combination that reaches the target uses them.',
  cage_single: 'A cage’s target leaves only one possible value for one of its cells.',
  cage_locked:
    'A cage’s cells must together hold one particular set of values, which narrows each of them.',
  cage_combinations:
    'Writing out the combinations that reach a cage’s target rules a value out of one of its cells.',
  cage_intersection:
    'A cage confines a value to a single row or column, so that value can be eliminated from the rest of that line.',
  multi_cage_line_lock:
    'Several cages taken together confine a set of values inside one line, freeing up the rest.',
  summation:
    'Compare the total of a row or column against the cage targets covering it; the difference pins a cell down.',
  cross_cage_feasibility:
    'Checking neighbouring cages against each other shows a candidate cannot work.',
  trial_and_error: 'No forced move is available — this position needs a guess.',
};

const columnLetter = (col: number) => String.fromCharCode('A'.charCodeAt(0) + col);
const cellName = (cell: CellRef) => `${columnLetter(cell.col)}${cell.row + 1}`;

/**
 * Names the region a deduction lives in without naming its cells, so level one
 * can say "in row 4" while still keeping the target hidden.
 */
const describeRegion = (cells: CellRef[]): string => {
  if (cells.length === 0) return '';
  const rows = new Set(cells.map(c => c.row));
  const cols = new Set(cells.map(c => c.col));
  if (rows.size === 1) return ` in row ${[...rows][0] + 1}`;
  if (cols.size === 1) return ` in column ${columnLetter([...cols][0])}`;
  return '';
};

const listCells = (cells: CellRef[]) => cells.map(cellName).join(', ');

/** Converts the UI's string grid into the solver's numeric one. */
const toNumericGrid = (gridValues: string[][]): number[][] =>
  gridValues.map(row => row.map(cell => (cell === '' ? 0 : parseInt(cell, 10) || 0)));

/** The first step worth showing: a real deduction, not a guess. */
const firstDeductiveStep = (steps: SolverStep[]): SolverStep | null =>
  steps.find(step => step.technique !== 'trial_and_error') ?? null;

const buildLevels = (step: SolverStep): HintLevel[] => {
  const target = step.highlight;
  const support = step.supportCells ?? [];
  const label = TECHNIQUE_LABELS[step.technique];
  const region = describeRegion(support.length > 0 ? support : target);

  const levels: HintLevel[] = [
    {
      title: 'Where to look',
      body: `${label}${region}. ${TECHNIQUE_NUDGES[step.technique]}`,
      supportCells: [],
      targetCells: [],
    },
  ];

  // The evidence, when the step has evidence distinct from its target
  if (support.length > 0) {
    levels.push({
      title: 'What it follows from',
      body: `Work from ${listCells(support)}. Together these are enough to settle another cell nearby.`,
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
 * Works out the next hint for a position.
 *
 * `gridValues` is the player's board as the UI holds it; empty strings are
 * empty cells. Returns null only if the puzzle itself is missing.
 */
export const computeHint = (
  puzzleDefinition: PuzzleDefinition,
  gridValues: string[][]
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

  const result = solveWithTrace(puzzleDefinition, { startGrid });
  const step = firstDeductiveStep(result.steps);

  if (!step) {
    return {
      kind: 'guess-required',
      levels: [
        {
          title: 'No forced move',
          body: TECHNIQUE_NUDGES.trial_and_error,
          supportCells: [],
          targetCells: [],
        },
      ],
    };
  }

  return {
    kind: 'deduction',
    technique: step.technique,
    techniqueLabel: TECHNIQUE_LABELS[step.technique],
    levels: buildLevels(step),
  };
};
