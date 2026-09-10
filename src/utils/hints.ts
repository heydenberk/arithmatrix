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
  TECHNIQUE_WEIGHTS,
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
  /**
   * The whole line a deduction is about, lit from the first level.
   *
   * "Somewhere in row 4 there is a value with only one square left" is an
   * instruction to search a line, so the line is worth showing - and unlike a
   * target it gives nothing away, which is why it is separate from the cells
   * above rather than folded into them.
   */
  regionCells: CellRef[];
};

/**
 * The move a hint describes, in a form the board can carry out.
 *
 * Structural rather than parsed back out of the description: the solver
 * already reports exactly what each step changed, so Apply does what the step
 * did rather than what its sentence appears to say.
 */
export type HintAction = {
  /** Button label, naming the move. */
  label: string;
  /** Values to write in. An empty string clears the cell. */
  place?: { row: number; col: number; value: string }[];
  /** Candidates to strike from the player's pencil marks. */
  eliminate?: { row: number; col: number; values: number[] }[];
  /** Cells whose marks should be wiped so they can be redone. */
  clearMarks?: CellRef[];
};

export type Hint = {
  kind:
    | 'deduction'
    | 'contradiction'
    | 'stale-marks'
    /** The player's own notes already settle cells they have not filled in. */
    | 'unclaimed'
    /** No forced move, but one cell's alternatives all collapse: still a proof. */
    | 'forced-by-contradiction'
    | 'guess-required'
    | 'solved';
  technique?: TechniqueId;
  techniqueLabel?: string;
  levels: HintLevel[];
  /**
   * Offered at the last level only. Absent where there is nothing to carry
   * out - a position needing a guess, or a finished board.
   */
  action?: HintAction;
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

/**
 * Reading order: down the rows, left to right within each.
 *
 * The solver emits cells in whatever order its loops reached them, which
 * produced lists like "A3, A4, A1, A2" - the same four cells a player would
 * scan top to bottom.
 */
const inReadingOrder = (cells: CellRef[]): CellRef[] =>
  [...cells].sort((a, b) => a.row - b.row || a.col - b.col);

/** The cells of the line a step names, for lighting it up. */
const regionCellsOf = (step: SolverStep, size: number): CellRef[] => {
  const match = step.description.match(/\bin (row (\d+)|column ([A-Z]))\b/);
  if (!match) return [];
  if (match[2]) {
    const row = parseInt(match[2], 10) - 1;
    if (row < 0 || row >= size) return [];
    return Array.from({ length: size }, (_, col) => ({ row, col }));
  }
  const col = match[3].charCodeAt(0) - 'A'.charCodeAt(0);
  if (col < 0 || col >= size) return [];
  return Array.from({ length: size }, (_, row) => ({ row, col }));
};

const listCells = (cells: CellRef[]) => listNames(cells);

/** Every cell the predicate accepts, in reading order. */
const cellsWhere = (size: number, accept: (row: number, col: number) => boolean): CellRef[] => {
  const cells: CellRef[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (accept(row, col)) cells.push({ row, col });
    }
  }
  return cells;
};

/** "B7", "B7 and D3", "B7, D3 and F1" - for prose rather than a bare list. */
const listNames = (cells: CellRef[]): string => {
  const names = inReadingOrder(cells).map(cellName);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/*
 * How many cells to name before the sentence becomes a list nobody reads. The
 * rest are still highlighted on the board, which is the part that matters.
 */
const MAX_NAMED_CELLS = 4;

const namedOrCounted = (cells: CellRef[]): string => {
  const ordered = inReadingOrder(cells);
  return ordered.length > MAX_NAMED_CELLS
    ? `${listNames(ordered.slice(0, MAX_NAMED_CELLS))} and ${ordered.length - MAX_NAMED_CELLS} more`
    : listNames(ordered);
};

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
 * How much unresolved board a deduction asks the player to hold in their head.
 *
 * The cells it reasons over - the rest of its cage, or the line it searches -
 * counted by how many are still empty. A cage single whose other two cells are
 * already filled rests on nothing: it is arithmetic on numbers you can see. A
 * hidden single in a row rests on every empty cell in that row, because you
 * have to know what cannot go in each of them.
 */
export const unknownsBehind = (step: SolverStep, grid: number[][], size: number): number => {
  const seen = new Set<string>();
  let unknown = 0;
  for (const cell of [...(step.supportCells ?? []), ...regionCellsOf(step, size)]) {
    const key = `${cell.row}-${cell.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (grid[cell.row]?.[cell.col] === 0) unknown++;
  }
  return unknown;
};

/**
 * How hard a deduction is to see: its technique's weight plus the unresolved
 * cells it rests on.
 *
 * Added rather than ranked in tiers. Unknowns alone is fooled by any technique
 * that does not report its supporting cells - summation reports none, and so
 * scored as free despite being the hardest thing in the set. Weight alone
 * cannot see that a cage single with one cell left is easier than a hidden
 * single down a row of four blanks. The sum is right about both, and degrades
 * to weight where there is nothing to measure.
 */
export const stepDifficulty = (step: SolverStep, grid: number[][], size: number): number =>
  TECHNIQUE_WEIGHTS[step.technique] + unknownsBehind(step, grid, size);

/**
 * What a step does, as a set of atoms, so two steps can be compared.
 *
 * A placement counts as eliminating every other candidate the player had in
 * that cell, because it does: writing 4 into a cell marked 4/5/6 settles the
 * 5 and the 6 as surely as striking them off would. Without that, "the 17+
 * cage must contain {2,4,7}, narrowing D2" and "the 17+ cage forces 4 at D2"
 * looked like unrelated moves and the narrowing - which is the same deduction
 * stopping one step short - could win on being marginally cheaper.
 */
const stepSignature = (step: SolverStep, marks: Set<number>[][] | undefined): Set<string> => {
  const atoms = new Set<string>();
  for (const c of step.changes.placed) {
    atoms.add(`p:${c.row}:${c.col}:${c.value}`);
    for (const v of marks?.[c.row]?.[c.col] ?? []) {
      if (v !== c.value) atoms.add(`e:${c.row}:${c.col}:${v}`);
    }
  }
  for (const c of step.changes.eliminated) {
    for (const v of c.values) atoms.add(`e:${c.row}:${c.col}:${v}`);
  }
  return atoms;
};

const isSubsetOf = (a: Set<string>, b: Set<string>) => [...a].every(x => b.has(x));

/**
 * Discards steps another available step strictly contains.
 *
 * The same cage read two ways gives two different-strength moves: its abstract
 * arithmetic says 6 can never sit at F3, while the same cage against the
 * candidates on the board rules out 4, 5 and 6 there. Offering the weaker one
 * is a worse hint for the same reading - it is the same cage, the same
 * argument, and less of the board resolved.
 *
 * Only a strict subset is dropped, so two steps that do exactly the same thing
 * both survive and the difficulty ranking chooses between them.
 */
const dropDominated = (steps: SolverStep[], marks: Set<number>[][] | undefined): SolverStep[] => {
  const seen = new Set<string>();
  const unique = steps.filter(step => {
    if (seen.has(step.description)) return false;
    seen.add(step.description);
    return true;
  });
  const signatures = unique.map(step => stepSignature(step, marks));
  return unique.filter((_, i) =>
    signatures.every(
      (other, j) =>
        i === j || !(signatures[i].size < other.size && isSubsetOf(signatures[i], other))
    )
  );
};

/**
 * The step worth showing: the easiest real deduction available right now.
 *
 * Every step here was derived from the player's position independently of the
 * others, which is what makes choosing between them safe. Ordering the *trace*
 * this way would not be: its steps form a chain, and picking a later one hands
 * over a conclusion whose premises are not on the board yet - that is how
 * "the 14+ cage rules out 2 at D4" once got offered ahead of the summation
 * that made it true.
 *
 * Easiest means fewest unknowns to consider first, technique weight second.
 * Weight alone would rank a hidden single (2) above a cage single (3), even
 * when the cage has one cell left and the row has four.
 */
export const eligibleSteps = (
  steps: SolverStep[],
  startGrid: number[][],
  startCandidates?: Set<number>[][]
): SolverStep[] =>
  dropDominated(
    steps.filter(
      step =>
        step.technique !== 'trial_and_error' &&
        !isRepairStep(step) &&
        // Nothing to say about a cell that already has a value in it
        step.highlight.some(cell => startGrid[cell.row]?.[cell.col] === 0)
    ),
    startCandidates
  );

const easiestDeductiveStep = (
  steps: SolverStep[],
  startGrid: number[][],
  size: number,
  startCandidates?: Set<number>[][]
): SolverStep | null => {
  const eligible = eligibleSteps(steps, startGrid, startCandidates);
  if (eligible.length === 0) return null;
  /*
   * Weight plus unknowns, added rather than ranked in tiers.
   *
   * Unknowns alone is fooled by any technique that does not report its
   * supporting cells - summation reports none, and so scored as free despite
   * being the hardest thing in the set. Weight alone cannot see that a cage
   * single with one cell left is easier than a hidden single down a row of
   * four blanks. The sum is right about both, and degrades to weight where
   * there is nothing to measure.
   */
  /*
   * Difficulty first, then a placement over an elimination. Among moves that
   * are equally hard to see, writing a number in is more progress than
   * striking one off, and it is what the player came for.
   */
  const rank = (step: SolverStep): [number, number] => [
    stepDifficulty(step, startGrid, size),
    step.changes.placed.length > 0 ? 0 : 1,
  ];
  return eligible.reduce((best, step) => {
    const [d, p] = rank(step);
    const [bd, bp] = rank(best);
    return d < bd || (d === bd && p < bp) ? step : best;
  });
};

/**
 * The move a deductive step makes, ready to apply.
 *
 * A step that places a value is offered as a placement and its incidental
 * candidate tidying ignored - entering a value on the board does that anyway.
 * Everything else is an elimination, which is the whole of what those
 * techniques do.
 */
const actionForStep = (step: SolverStep): HintAction | undefined => {
  const { placed, eliminated } = step.changes;

  if (placed.length > 0) {
    return {
      label:
        placed.length === 1
          ? `Place ${placed[0].value} at ${cellName(placed[0])}`
          : `Place ${placed.length} values`,
      place: placed.map(p => ({ row: p.row, col: p.col, value: String(p.value) })),
    };
  }

  if (eliminated.length > 0) {
    const values = [...new Set(eliminated.flatMap(e => e.values))].sort((a, b) => a - b);
    const listed =
      values.length <= 1
        ? String(values[0] ?? '')
        : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
    return {
      label:
        eliminated.length === 1
          ? `Rule out ${listed} at ${cellName(eliminated[0])}`
          : `Rule out ${listed} across ${eliminated.length} cells`,
      eliminate: eliminated,
    };
  }

  return undefined;
};

const buildLevels = (
  step: SolverStep,
  size: number,
  pencilMarks?: Set<string>[][]
): HintLevel[] => {
  const target = step.highlight;
  const support = step.supportCells ?? [];
  const region = describeRegion(step);
  /*
   * Light the line only when the nudge actually sends the player to search
   * one. Several descriptions mention a line in passing - a naked single now
   * says its row and column rule the rest out - and lighting a row off the
   * back of that would be arbitrary, since the same sentence names a column
   * too. Asking the nudge whether it used the region keeps the highlight and
   * the wording from drifting apart.
   */
  const nudge = TECHNIQUE_NUDGES[step.technique];
  const regionCells = region !== '' && nudge(region) !== nudge('') ? regionCellsOf(step, size) : [];

  const levels: HintLevel[] = [
    {
      title: 'Where to look',
      // The plain description leads; the technique's name is surfaced by the
      // panel as a label, so the sentence does not open with solver jargon.
      body: TECHNIQUE_NUDGES[step.technique](region),
      supportCells: [],
      targetCells: [],
      regionCells,
    },
  ];

  // The evidence, when the step has evidence distinct from its target
  if (support.length > 0) {
    levels.push({
      title: 'What it follows from',
      /*
       * Capped. A technique whose evidence is a whole neighbourhood of cages
       * once produced "Work from C1, D1, E1, F1, C2, D2..." for twenty-nine
       * cells - a paragraph nobody reads, when the highlight already shows
       * exactly which squares are meant.
       */
      body: `Work from ${namedOrCounted(support)}. ${
        step.changes.placed.length > 0
          ? support.length === 1
            ? 'That alone settles another cell nearby.'
            : 'Together these are enough to settle another cell nearby.'
          : 'What those can hold between them limits what fits elsewhere.'
      }`,
      supportCells: support,
      targetCells: [],
      regionCells,
    });
  }

  levels.push({
    title: 'Which cell',
    // Settled or merely narrowed - branching on the cell count got this wrong
    // for a one-cell elimination, which narrows but does not settle
    body: `${listCells(target)} can be ${step.changes.placed.length > 0 ? 'settled' : 'narrowed'} from here.`,
    supportCells: support,
    targetCells: target,
    regionCells,
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
    /*
     * Whether this settles the cell or only narrows it. Saying "leaves exactly
     * one standing" of an elimination was simply wrong - a cage_combinations
     * step routinely strikes two of four candidates and leaves two.
     */
    const settles = step.changes.placed.some(
      cell => cell.row === single.row && cell.col === single.col
    );
    const struck = step.changes.eliminated.find(
      cell => cell.row === single.row && cell.col === single.col
    );
    const count = struck?.values.length ?? 0;
    levels.push({
      title: 'Against your notes',
      body: settles
        ? `You have ${listed} pencilled at ${cellName(single)}. This leaves exactly one of them standing.`
        : `You have ${listed} pencilled at ${cellName(single)}. ${count === 1 ? 'One of them can be struck off' : `${count} of them can be struck off`}.`,
      supportCells: support,
      targetCells: target,
      regionCells,
    });
  }

  levels.push({
    // The solver's own wording, which names the value
    title: 'The move',
    body: step.description,
    supportCells: support,
    targetCells: target,
    regionCells,
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
          regionCells: [],
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
          regionCells: [],
        },
        {
          title: 'Which cell',
          body:
            `${cellName(branch.cell)} is the one to test — ${branch.options.length} candidates, ` +
            `fewer than anywhere else. ${others.length === 1 ? 'The other collapses' : `${others.length} of them collapse`} ` +
            `within ${deductions(worst)}, so this is quick to check by hand.`,
          supportCells: [],
          targetCells: [branch.cell],
          regionCells: [],
        },
        {
          title: 'The move',
          body: `${cellName(branch.cell)} must be ${branch.forced} — every other value there runs a cell out of options.`,
          supportCells: [],
          targetCells: [branch.cell],
          regionCells: [],
        },
      ],
      action: {
        label: `Place ${branch.forced} at ${cellName(branch.cell)}`,
        place: [{ row: branch.cell.row, col: branch.cell.col, value: String(branch.forced) }],
      },
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
          regionCells: [],
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
          regionCells: [],
        },
        {
          title: 'Or skip the search',
          body: `${cellName(point.cell)} must be ${viable[0]} — no completed grid exists with anything else there.`,
          supportCells: [],
          targetCells: [point.cell],
          regionCells: [],
        },
      ],
      action: {
        label: `Place ${viable[0]} at ${cellName(point.cell)}`,
        place: [{ row: point.cell.row, col: point.cell.col, value: String(viable[0]) }],
      },
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
        regionCells: [],
      },
      {
        title: 'Where to branch',
        body:
          `${cellName(branch.cell)} is the cheapest place to do it, with ${branch.options.length} ` +
          `candidates and nothing on the board narrower. ${payoff}`,
        supportCells: [],
        targetCells: [branch.cell],
        regionCells: [],
      },
      {
        title: 'The move',
        body:
          `Set a checkpoint, then put one of ${branch.options.map(o => o.value).join(' or ')} in ` +
          `${cellName(branch.cell)} and carry on. If it collapses, revert and the other stands.`,
        supportCells: [],
        targetCells: [branch.cell],
        regionCells: [],
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
          regionCells: [],
        },
      ],
    };
  }

  /*
   * Before anything else: is the board sound?
   *
   * A hint built on a wrong entry is worse than no hint, because every
   * deduction it offers rests on the mistake. Knowing the solution lets us
   * name the offending cells outright rather than telling the player to undo
   * and guess which move it was.
   */
  const wrongCells = solution
    ? cellsWhere(
        puzzleDefinition.size,
        (row, col) => startGrid[row][col] !== 0 && startGrid[row][col] !== solution[row]?.[col]
      )
    : [];

  if (wrongCells.length > 0) {
    const one = wrongCells.length === 1;
    return {
      kind: 'contradiction',
      levels: [
        {
          title: one ? 'A value is wrong' : `${wrongCells.length} values are wrong`,
          body:
            `${namedOrCounted(wrongCells)} ${one ? 'has a value' : 'have values'} that cannot be ` +
            `right — no finished grid has ${one ? 'it' : 'them'} there. Clear ` +
            `${one ? 'it' : 'them'} before going on, or anything you work out next will be built ` +
            'on the mistake.',
          supportCells: [],
          targetCells: wrongCells,
          regionCells: [],
        },
      ],
      action: {
        label: one ? 'Clear it' : `Clear all ${wrongCells.length}`,
        place: wrongCells.map(cell => ({ row: cell.row, col: cell.col, value: '' })),
      },
    };
  }

  // Without the solution we can still tell that something is wrong, just not what
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
          regionCells: [],
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
   * Marks that rule out the cell's own answer.
   *
   * Read straight off the board rather than from the solver's repair steps,
   * which only ever reported the first one it tripped over. The solver still
   * repairs internally so it can keep reasoning; this is about telling the
   * player, and they want all of them at once.
   *
   * There is no companion branch for a misplaced *value* here: a wrong
   * placement always leaves the puzzle unsolvable, so it is caught above and
   * named there.
   */
  const staleCells =
    solution && pencilMarks
      ? cellsWhere(puzzleDefinition.size, (row, col) => {
          if (startGrid[row][col] !== 0) return false;
          const marks = pencilMarks[row]?.[col];
          const answer = solution[row]?.[col];
          return !!marks && marks.size > 0 && answer !== undefined && !marks.has(String(answer));
        })
      : [];

  if (staleCells.length > 0) {
    const one = staleCells.length === 1;
    return {
      kind: 'stale-marks',
      levels: [
        {
          title: one ? 'Your notes rule out the answer' : 'Your notes rule out some answers',
          body:
            `${namedOrCounted(staleCells)} ${one ? 'has its answer' : 'have their answers'} ` +
            `crossed off in your pencil marks, so nothing can be deduced ` +
            `${one ? 'from there' : 'from those cells'}. Worth re-checking ` +
            `${one ? 'that cell' : 'them'} before going further.`,
          supportCells: [],
          targetCells: staleCells,
          regionCells: [],
        },
      ],
      /*
       * Wipes the notes rather than putting the missing value back, which
       * would hand over the answer - the level above deliberately does not
       * name it. An unmarked cell reads as "not thought about yet", which is
       * where the player actually is.
       */
      action: {
        label: one ? 'Clear those notes' : `Clear the notes on all ${staleCells.length}`,
        clearMarks: staleCells,
      },
    };
  }

  /*
   * Work the player has already done but not banked.
   *
   * A cell their own marks have narrowed to one value is settled - they proved
   * it, they just have not written it in. Offering a fresh deduction on top of
   * that is answering a question they have not got to yet. Safe to trust the
   * mark because the stale check above has established that every cell's marks
   * still contain its answer.
   */
  const unclaimed = pencilMarks
    ? cellsWhere(
        puzzleDefinition.size,
        (row, col) => startGrid[row][col] === 0 && pencilMarks[row]?.[col]?.size === 1
      )
    : [];

  if (unclaimed.length > 0) {
    const one = unclaimed.length === 1;
    return {
      kind: 'unclaimed',
      levels: [
        {
          title: one
            ? 'One cell is already settled'
            : `${unclaimed.length} cells are already settled`,
          body:
            `${namedOrCounted(unclaimed)} ${one ? 'is' : 'are'} down to a single candidate in ` +
            `your own notes, so ${one ? 'it is' : 'they are'} yours to take before anything new. ` +
            `The autofill button will put ${one ? 'it' : 'them'} in for you.`,
          supportCells: [],
          targetCells: unclaimed,
          regionCells: [],
        },
      ],
      action: {
        label: one ? 'Fill it in' : `Fill in all ${unclaimed.length}`,
        place: unclaimed.map(cell => ({
          row: cell.row,
          col: cell.col,
          value: [...(pencilMarks?.[cell.row]?.[cell.col] ?? [])][0] ?? '',
        })),
      },
    };
  }

  /*
   * Chosen from what is available now, not from the order the solve happened
   * to take. See easiestDeductiveStep - the trace could not be reordered
   * safely, this list can.
   */
  const step = easiestDeductiveStep(
    stall.availableSteps(),
    startGrid,
    puzzleDefinition.size,
    startCandidates
  );

  if (!step) return stallHint(puzzleDefinition, stall);

  return {
    kind: 'deduction',
    technique: step.technique,
    techniqueLabel: TECHNIQUE_LABELS[step.technique],
    levels: buildLevels(step, puzzleDefinition.size, pencilMarks),
    action: actionForStep(step),
  };
};
