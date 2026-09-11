/**
 * useArithmatrixGame Hook
 *
 * A comprehensive custom hook that manages all Arithmatrix game state and logic.
 * This hook encapsulates:
 *
 * Game State Management:
 * - Grid values and pencil marks
 * - History tracking for undo/redo functionality
 * - Selection and focus management
 * - Error detection and highlighting
 * - Visual feedback (flashing, selection)
 *
 * Game Logic:
 * - Input validation and processing
 * - Pencil mark management with conflict detection
 * - Win condition checking
 * - Solution validation against expected answers
 *
 * User Interactions:
 * - Keyboard navigation (arrow keys, undo/redo shortcuts)
 * - Multi-cell selection with Shift+Click
 * - Pencil mode toggling (Caps Lock detection)
 * - Cell and puzzle checking functionality
 *
 * The hook provides a clean separation between game logic and UI rendering,
 * making the code more testable and maintainable.
 */

import { useState, useEffect, useRef } from 'react';
import { PuzzleDefinition, HistoryEntry, CellCoord } from '../types/ArithmatrixTypes';
import { checkWinCondition, findConflictingCells } from '../utils/arithmatrixUtils';
import { boardIsSound, type HintAction } from '../utils/hints';
import type { GameConduct } from '../utils/achievements';

/*
 * Autofill pacing, at two scales.
 *
 * Cells within a wave land in quick succession - they were all settled by the
 * same state of the board, so they read as one sweep. The pause between waves
 * is much longer, because that gap is the point: it separates what was already
 * true from what the previous wave made true.
 */
const AUTOFILL_CELL_MS = 55;
const AUTOFILL_WAVE_GAP_MS = 220;
/** Matches the settle animation in ArithmatrixGrid.css. */
const SETTLE_MS = 340;

interface UseArithmatrixGameProps {
  puzzleDefinition: PuzzleDefinition;
  solution: number[][];
  onWin: (conduct: GameConduct) => void;
  isTimerRunning: boolean;
  isGameWon: boolean;
  initialGridValues?: string[][];
  initialPencilMarks?: Set<string>[][];
  /** Conduct carried over from a resumed game; fresh boards start clean. */
  initialConduct?: GameConduct;
  onStateChange?: (
    gridValues: string[][],
    pencilMarks: Set<string>[][],
    conduct: GameConduct
  ) => void;
}

export const useArithmatrixGame = ({
  puzzleDefinition,
  solution,
  onWin,
  isTimerRunning: _isTimerRunning,
  isGameWon: _isGameWon,
  initialGridValues,
  initialPencilMarks,
  initialConduct,
  onStateChange,
}: UseArithmatrixGameProps) => {
  const { size } = puzzleDefinition;

  // Core game state
  const [gridValues, setGridValues] = useState<string[][]>([]);
  const [pencilMarks, setPencilMarks] = useState<Set<string>[][]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // UI state
  const [isPencilMode, setIsPencilMode] = useState(false);
  const [previousMode, setPreviousMode] = useState(false); // Track mode before shift+click
  const [isInTemporaryPencilMode, setIsInTemporaryPencilMode] = useState(false); // Track if we're in temporary mode
  const [hasEnteredValueSinceSelection, setHasEnteredValueSinceSelection] = useState(false); // Track if values were entered
  const [errorCells, setErrorCells] = useState<Set<number>>(new Set());
  const [flashingCells, setFlashingCells] = useState<Set<string>>(new Set());
  /** Cells the current autofill wave just landed, for the settle animation. */
  const [settlingCells, setSettlingCells] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  // Refs for tracking
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const autofillTimers = useRef<number[]>([]);
  /*
   * How this puzzle is being solved, as opposed to how fast. Held in a ref
   * because nothing renders from it - it is read once, when the board is
   * finished, and rewriting the grid on every hint would be pure churn.
   */
  const conduct = useRef<GameConduct>(initialConduct ?? { unaided: true, clean: true });
  const lastFocusedCell = useRef<CellCoord | null>(null);

  // Initialize or reset game state when puzzle changes
  useEffect(() => {
    if (puzzleDefinition) {
      // Use initial values if provided, otherwise create empty grid
      setGridValues(
        initialGridValues ||
          Array(size)
            .fill(0)
            .map(() => Array(size).fill(''))
      );
      setPencilMarks(
        initialPencilMarks ||
          Array(size)
            .fill(0)
            .map(() =>
              Array(size)
                .fill(0)
                .map(() => new Set<string>())
            )
      );
      setHistory([]);
      setRedoStack([]);
      setIsPencilMode(false);
      setPreviousMode(false);
      setIsInTemporaryPencilMode(false);
      setHasEnteredValueSinceSelection(false);
      setErrorCells(new Set());
      setSelectedCells(new Set());
      setFlashingCells(new Set());
      setSettlingCells(new Set());
      conduct.current = initialConduct ?? { unaided: true, clean: true };
      // A cascade from the previous puzzle must not land on this one
      autofillTimers.current.forEach(id => clearTimeout(id));
      autofillTimers.current = [];

      // Initialize input refs
      inputRefs.current = Array(size)
        .fill(0)
        .map(() => Array(size).fill(null));
    }
  }, [puzzleDefinition, size, initialGridValues, initialPencilMarks, initialConduct]);

  /*
   * The single place a win is announced.
   *
   * Individual handlers used to call onWin() themselves as well as this effect
   * firing, so completing a puzzle recorded it three times over. Watching
   * gridValues covers every route to a full grid - typing, autofill, undo/redo -
   * and the ref makes it an edge: it fires on the transition into a solved
   * board, and re-arms if the player takes a value back out.
   */
  const hasAnnouncedWinRef = useRef(false);
  useEffect(() => {
    const complete =
      gridValues.length > 0 && gridValues.every(row => row.every(cell => cell !== ''));
    const won = complete && checkWinCondition(gridValues, puzzleDefinition);

    if (won && !hasAnnouncedWinRef.current) {
      hasAnnouncedWinRef.current = true;
      onWin({ ...conduct.current });
    } else if (!won) {
      hasAnnouncedWinRef.current = false;
    }
  }, [gridValues, puzzleDefinition, onWin]);

  /*
   * Latches the moment a wrong value appears, by any route.
   *
   * Watching the grid rather than each handler means it cannot be bypassed -
   * typing, autofill, applying a hint and undo/redo all pass through here -
   * and it stays true once set, so backing the mistake out does not restore a
   * clean record.
   */
  useEffect(() => {
    if (conduct.current.clean === false || gridValues.length === 0) return;
    for (let r = 0; r < gridValues.length; r++) {
      for (let c = 0; c < gridValues[r].length; c++) {
        const value = gridValues[r][c];
        if (value !== '' && Number(value) !== solution?.[r]?.[c]) {
          conduct.current.clean = false;
          return;
        }
      }
    }
  }, [gridValues, solution]);

  /** Called when the player leans on a tool the puzzle could be solved without. */
  const markAided = () => {
    conduct.current.unaided = false;
  };

  // Effect to notify parent component of state changes
  useEffect(() => {
    if (onStateChange && gridValues.length > 0 && pencilMarks.length > 0) {
      onStateChange(gridValues, pencilMarks, { ...conduct.current });
    }
  }, [gridValues, pencilMarks, onStateChange]);

  // Pending waves belong to a board that is going away
  useEffect(() => {
    const timers = autofillTimers.current;
    return () => timers.forEach(id => clearTimeout(id));
  }, []);

  // Clear error state
  const clearErrors = () => {
    if (errorCells.size > 0) {
      setErrorCells(new Set());
    }
  };

  // Clear all selected cells and restore previous mode if in temporary pencil mode
  const clearSelection = () => {
    setSelectedCells(new Set());
    lastFocusedCell.current = null;

    // If we're in temporary pencil mode, restore the previous mode
    if (isInTemporaryPencilMode) {
      setIsPencilMode(previousMode);
      setIsInTemporaryPencilMode(false);
      console.log('Selection cleared, restoring previous mode:', previousMode);
    }
  };

  // Handle input changes for regular cell values
  const handleInputChange = (rowIndex: number, colIndex: number, value: string) => {
    const num = parseInt(value, 10);
    const currentVal = gridValues[rowIndex][colIndex];

    // Only proceed if the value is valid and actually changing
    if (value !== currentVal && (value === '' || (!isNaN(num) && num >= 1 && num <= size))) {
      // Push the current state onto history before updating
      setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
      setRedoStack([]);

      // Update grid values
      const newGridValues = gridValues.map((row, rIdx) =>
        row.map((cell, cIdx) => (rIdx === rowIndex && cIdx === colIndex ? value : cell))
      );
      setGridValues(newGridValues);

      // Update pencil marks: Clear current cell AND remove value from row/col
      const newPencilMarks = pencilMarks.map((row, rIdx) =>
        row.map((cellSet, cIdx) => {
          if (rIdx === rowIndex && cIdx === colIndex) {
            return new Set<string>();
          }
          if (value !== '' && (rIdx === rowIndex || cIdx === colIndex)) {
            const updatedSet = new Set(cellSet);
            updatedSet.delete(value);
            return updatedSet;
          }
          return cellSet;
        })
      );
      setPencilMarks(newPencilMarks);

      clearErrors();

      // Mark that a value was entered since selection
      setHasEnteredValueSinceSelection(true);

      // Manual win check as fallback - check the new grid state
      console.log('Manual input completed, checking win condition manually...');
    } else if (value !== '' && value !== currentVal) {
      // Revert invalid input
      const input = inputRefs.current?.[rowIndex]?.[colIndex];
      if (input) {
        input.value = currentVal;
      }
    }
  };

  // Undo functionality
  const handleUndo = () => {
    if (history.length === 0) return;

    const [prevGridValues, prevPencilMarks] = history[history.length - 1];
    setRedoStack(prevRedo => [...prevRedo, [gridValues, pencilMarks]]);
    setGridValues(prevGridValues);
    setPencilMarks(prevPencilMarks);
    setHistory(prevHistory => prevHistory.slice(0, -1));
  };

  /**
   * Winds back to the most recent board that had no mistake on it.
   *
   * Undoing one step at a time is the wrong tool when a wrong value or a bad
   * pencil mark went in a dozen moves ago and everything since was built on
   * it. This walks the history back to the last sound position in one go, and
   * everything it passes goes onto the redo stack, so it is no more
   * destructive than a run of undos.
   *
   * Returns false when there is nothing sound to go back to - a mistake made
   * before the first recorded move, or none at all.
   */
  const rewindToLastSound = (): boolean => {
    if (!solution) return false;
    for (let i = history.length - 1; i >= 0; i--) {
      const [pastGrid, pastMarks] = history[i];
      if (!boardIsSound(pastGrid, pastMarks, solution)) continue;

      // Everything from that point forward becomes redoable, newest last
      const undone = [...history.slice(i + 1), [gridValues, pencilMarks] as HistoryEntry];
      setRedoStack(prevRedo => [...prevRedo, ...undone]);
      setHistory(history.slice(0, i));
      setGridValues(pastGrid.map(row => [...row]));
      setPencilMarks(pastMarks.map(row => row.map(cellSet => new Set(cellSet))));
      clearErrors();
      return true;
    }
    return false;
  };

  /** Whether {@link rewindToLastSound} has anywhere to go. */
  const canRewindToSound = (): boolean =>
    !!solution &&
    !boardIsSound(gridValues, pencilMarks, solution) &&
    history.some(([pastGrid, pastMarks]) => boardIsSound(pastGrid, pastMarks, solution));

  // Redo functionality
  const handleRedo = () => {
    if (redoStack.length === 0) return;

    const [nextGridValues, nextPencilMarks] = redoStack[redoStack.length - 1];
    setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
    setGridValues(nextGridValues);
    setPencilMarks(nextPencilMarks);
    setRedoStack(prevRedo => prevRedo.slice(0, -1));
  };

  // Handle pencil mark input and multi-cell operations
  const handlePencilMarkInput = (numberPressed: number) => {
    let historyPushed = false;
    const pushHistoryIfNeeded = () => {
      if (!historyPushed) {
        setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
        setRedoStack([]);
        historyPushed = true;
      }
    };

    const numStr = String(numberPressed);
    let updatedSomething = false;

    const nextPencilMarks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));
    const cellsToFlash = new Set<string>();

    selectedCells.forEach(cellKey => {
      const [r, c] = cellKey.split('-').map(Number);

      if (gridValues[r][c] !== '') return; // Skip filled cells

      const currentPencilSet = nextPencilMarks[r][c];
      const newSet = new Set(currentPencilSet);

      if (newSet.has(numStr)) {
        newSet.delete(numStr);
        pushHistoryIfNeeded();
        updatedSomething = true;
        nextPencilMarks[r][c] = newSet;
      } else {
        // Check if candidate is valid before adding
        const conflicts = findConflictingCells(r, c, numStr, gridValues, size);

        if (conflicts.length === 0) {
          newSet.add(numStr);
          pushHistoryIfNeeded();
          updatedSomething = true;
          nextPencilMarks[r][c] = newSet;
        } else {
          console.log(
            `Cannot add pencil mark ${numStr} to [${r}, ${c}]: conflicts with existing values.`
          );
          conflicts.forEach(conflictKey => cellsToFlash.add(conflictKey));
        }
      }
    });

    // Apply flashing effect for conflicts
    if (cellsToFlash.size > 0) {
      setFlashingCells(prev => new Set([...prev, ...cellsToFlash]));
      setTimeout(() => {
        setFlashingCells(prev => {
          const next = new Set(prev);
          cellsToFlash.forEach(key => next.delete(key));
          return next;
        });
      }, 500);
    }

    // Update state if any pencil mark was successfully updated
    if (updatedSomething) {
      setPencilMarks(nextPencilMarks);
      clearErrors();

      // Mark that a value was entered since selection
      setHasEnteredValueSinceSelection(true);
    } else if (historyPushed) {
      setHistory(prevHistory => prevHistory.slice(0, -1));
    }
  };

  // Handle cell deletion (Backspace/Delete)
  const handleCellDeletion = () => {
    if (selectedCells.size === 0) return;

    let updatedGrid = false;
    let updatedPencils = false;

    const nextGridValues = gridValues.map(row => [...row]);
    const nextPencilMarks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));

    selectedCells.forEach(cellKey => {
      const [r, c] = cellKey.split('-').map(Number);

      if (nextGridValues[r][c] !== '') {
        nextGridValues[r][c] = '';
        updatedGrid = true;
        if (nextPencilMarks[r][c].size > 0) {
          nextPencilMarks[r][c] = new Set<string>();
          updatedPencils = true;
        }
      } else if (nextPencilMarks[r][c].size > 0) {
        nextPencilMarks[r][c] = new Set<string>();
        updatedPencils = true;
      }
    });

    if (updatedGrid || updatedPencils) {
      setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
      setRedoStack([]);

      if (updatedGrid) {
        setGridValues(nextGridValues);
      }
      if (updatedPencils) {
        setPencilMarks(nextPencilMarks);
      }

      clearErrors();

      // Mark that a value was entered since selection
      setHasEnteredValueSinceSelection(true);
    }
  };

  /**
   * Pencils every candidate into cells that have none yet.
   *
   * A candidate is included unless a filled cell rules it out - the same
   * row/column test used to flag conflicts. Cage arithmetic is deliberately not
   * considered: this is the mechanical bookkeeping pass, not a solver, and the
   * player should still be the one spotting what a cage forbids.
   *
   * Cells that already carry marks are left alone, so this never overwrites
   * deductions the player has made.
   */
  const handleFillAllCandidates = () => {
    /*
     * Not an aid, so no markAided here.
     *
     * This writes the candidates that follow from the values already on the
     * board - row and column eliminations anyone could do reflexively, given
     * the patience. It tells the player nothing they could not read off the
     * grid, and it cannot place a value, so it cannot advance the solve on
     * its own. Checking is the opposite: it answers a question the board does
     * not, and that does count.
     */
    const { size } = puzzleDefinition;
    const nextPencilMarks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));
    let anyUpdated = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Only empty cells that the player has not already marked up
        if (gridValues[r][c] !== '' || nextPencilMarks[r][c].size > 0) continue;

        const candidates = new Set<string>();
        for (let n = 1; n <= size; n++) {
          const value = String(n);
          if (findConflictingCells(r, c, value, gridValues, size).length === 0) {
            candidates.add(value);
          }
        }

        if (candidates.size > 0) {
          nextPencilMarks[r][c] = candidates;
          anyUpdated = true;
        }
      }
    }

    if (anyUpdated) {
      setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
      setRedoStack([]);
      setPencilMarks(nextPencilMarks);
      clearErrors();
    }
  };

  /**
   * Carries out the move a hint describes, as one undoable step.
   *
   * The hint reports what to do structurally rather than in prose, so this
   * does not have to interpret anything - it writes values, strikes
   * candidates, or wipes notes, whichever the hint asked for.
   */
  const applyHintAction = (action: HintAction) => {
    markAided();
    const { size } = puzzleDefinition;
    const nextGridValues = gridValues.map(row => [...row]);
    const nextPencilMarks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));
    let anyUpdated = false;

    for (const { row, col, value } of action.place ?? []) {
      if (nextGridValues[row][col] === value) continue;
      nextGridValues[row][col] = value;
      nextPencilMarks[row][col] = new Set<string>();
      // Entering a value strikes it from the marks it rules out, as typing does
      if (value !== '') {
        for (let i = 0; i < size; i++) {
          if (i !== col) nextPencilMarks[row][i].delete(value);
          if (i !== row) nextPencilMarks[i][col].delete(value);
        }
      }
      anyUpdated = true;
    }

    for (const { row, col, values } of action.eliminate ?? []) {
      if (nextGridValues[row][col] !== '') continue;
      /*
       * An elimination needs somewhere to land. A cell the player has not
       * marked up has nothing to strike from, so seed it with the candidates
       * still legal here first - otherwise Apply would silently do nothing on
       * exactly the cells the hint is about.
       */
      if (nextPencilMarks[row][col].size === 0) {
        for (let n = 1; n <= size; n++) {
          const candidate = String(n);
          if (findConflictingCells(row, col, candidate, nextGridValues, size).length === 0) {
            nextPencilMarks[row][col].add(candidate);
          }
        }
        anyUpdated = true;
      }
      for (const value of values) {
        if (nextPencilMarks[row][col].delete(String(value))) anyUpdated = true;
      }
    }

    for (const { row, col } of action.clearMarks ?? []) {
      if (nextPencilMarks[row][col].size === 0) continue;
      nextPencilMarks[row][col] = new Set<string>();
      anyUpdated = true;
    }

    if (!anyUpdated) return;
    setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
    setRedoStack([]);
    setGridValues(nextGridValues);
    setPencilMarks(nextPencilMarks);
    clearErrors();
  };

  type Placement = { row: number; col: number; value: string };

  /**
   * The autofill cascade, split into the waves that produce it.
   *
   * Each pass fills every cell that is settled right now; doing so strikes
   * those values from the marks along their rows and columns, which can leave
   * another cell with a single candidate for the next pass. Returning the
   * passes separately is what lets the board show the chain running instead of
   * arriving all at once.
   */
  const computeAutofillWaves = (): Placement[][] => {
    const { size, cages } = puzzleDefinition;
    const grid = gridValues.map(row => [...row]);
    const marks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));
    const waves: Placement[][] = [];

    const setCellValue = (r: number, c: number, valueStr: string) => {
      grid[r][c] = valueStr;
      // Clear pencils in the cell and remove the value from its row and column
      for (let i = 0; i < size; i++) {
        if (i !== c) marks[r][i].delete(valueStr);
        if (i !== r) marks[i][c].delete(valueStr);
      }
      marks[r][c] = new Set<string>();
    };

    // Finite grid, monotonic fills: this terminates quickly however many marks
    // the player has
    while (true) {
      const wave: Placement[] = [];

      // 1) Single-cell cages with explicit value
      for (const cage of cages) {
        if (cage.cells.length !== 1 || (cage.operation !== '=' && cage.operation !== '')) continue;
        const cellIndex = cage.cells[0];
        const r = Math.floor(cellIndex / size);
        const c = cellIndex % size;
        if (grid[r][c] !== '') continue;
        const valueStr = String(cage.value);
        const value = parseInt(valueStr, 10);
        if (value < 1 || value > size) continue;
        if (findConflictingCells(r, c, valueStr, grid, size).length > 0) continue;
        wave.push({ row: r, col: c, value: valueStr });
      }

      // 2) Cells the player's own marks have narrowed to one candidate
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (grid[r][c] !== '' || marks[r][c].size !== 1) continue;
          const [only] = Array.from(marks[r][c]);
          const value = parseInt(only, 10);
          if (isNaN(value) || value < 1 || value > size) continue;
          if (findConflictingCells(r, c, only, grid, size).length > 0) continue;
          wave.push({ row: r, col: c, value: only });
        }
      }

      if (wave.length === 0) break;
      // Applied after the whole pass is collected, so cells settled by this
      // wave belong to the next one rather than sneaking into this one
      for (const { row, col, value } of wave) setCellValue(row, col, value);
      waves.push(wave);
    }

    return waves;
  };

  const cancelAutofill = () => {
    autofillTimers.current.forEach(id => clearTimeout(id));
    autofillTimers.current = [];
  };

  /**
   * Commits one wave.
   *
   * Written as functional updates over the previous state rather than against
   * a grid computed up front, so a wave still lands correctly if the player
   * types something while the cascade is running - and skips any cell they
   * filled themselves in the meantime.
   */
  /**
   * Notes where the surviving pencil mark currently sits, so the answer can
   * grow out of it instead of simply appearing.
   *
   * Measured rather than computed from the layout constants: the mark's
   * position depends on the pencil grid, the cage badge inset and the
   * breakpoint, and a second copy of that arithmetic would drift. Has to run
   * before the state update, while the mark is still on screen.
   */
  const noteSettleOrigin = (row: number, col: number, value: string) => {
    const input = inputRefs.current?.[row]?.[col];
    const cell = input?.closest('.arithmatrix-cell') as HTMLElement | null;
    if (!input || !cell) return;
    const mark = Array.from(cell.querySelectorAll('.pencil-mark')).find(
      node => node.textContent?.trim() === value
    );
    // A cell filled straight from its cage never had a mark to grow from
    if (!mark) {
      cell.style.removeProperty('--settle-dx');
      cell.style.removeProperty('--settle-dy');
      cell.style.removeProperty('--settle-scale');
      return;
    }

    const markBox = mark.getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();
    const markFont = parseFloat(getComputedStyle(mark).fontSize);
    const inputFont = parseFloat(getComputedStyle(input).fontSize);

    cell.style.setProperty(
      '--settle-dx',
      `${markBox.left + markBox.width / 2 - (inputBox.left + inputBox.width / 2)}px`
    );
    cell.style.setProperty(
      '--settle-dy',
      `${markBox.top + markBox.height / 2 - (inputBox.top + inputBox.height / 2)}px`
    );
    cell.style.setProperty('--settle-scale', String(inputFont > 0 ? markFont / inputFont : 0.4));
  };

  const applyPlacement = ({ row, col, value }: Placement) => {
    const { size } = puzzleDefinition;
    noteSettleOrigin(row, col, value);
    setGridValues(prev => {
      if (prev[row]?.[col] !== '') return prev;
      const next = prev.map(r => [...r]);
      next[row][col] = value;
      return next;
    });
    setPencilMarks(prev => {
      const next = prev.map(r => r.map(cellSet => new Set(cellSet)));
      next[row][col] = new Set<string>();
      for (let i = 0; i < size; i++) {
        if (i !== col) next[row][i].delete(value);
        if (i !== row) next[i][col].delete(value);
      }
      return next;
    });

    const key = `${row}-${col}`;
    setSettlingCells(prev => new Set(prev).add(key));
    autofillTimers.current.push(
      window.setTimeout(() => {
        setSettlingCells(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, SETTLE_MS)
    );
  };

  // Autofill singles: fill cells that are single-cell cages or have exactly one pencil mark
  const handleAutofillSingles = () => {
    // Unlike filling candidates, this places values - it moves the solve on,
    // so it counts
    markAided();
    cancelAutofill();
    const waves = computeAutofillWaves();
    if (waves.length === 0) return;

    // One user action, so one undo - the waves are presentation, not history
    setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
    setRedoStack([]);
    clearErrors();
    setHasEnteredValueSinceSelection(true);

    /*
     * Cells sweep in reading order within a wave; the wave boundary gets a
     * pause of its own, so the chain of consequences stays legible however
     * many cells each round happens to settle.
     */
    let at = 0;
    for (const wave of waves) {
      const ordered = [...wave].sort((a, b) => a.row - b.row || a.col - b.col);
      for (const placement of ordered) {
        if (at === 0) applyPlacement(placement);
        else {
          const delay = at;
          autofillTimers.current.push(window.setTimeout(() => applyPlacement(placement), delay));
        }
        at += AUTOFILL_CELL_MS;
      }
      at += AUTOFILL_WAVE_GAP_MS;
    }
  };

  // Handle direct number input (overwrite existing values)
  const handleDirectNumberInput = (rowIndex: number, colIndex: number, numberPressed: number) => {
    const newValue = String(numberPressed);

    if (newValue === gridValues[rowIndex][colIndex]) {
      return; // No change needed
    }

    setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
    setRedoStack([]);

    const newGridValues = gridValues.map((row, rIdx) =>
      row.map((cell, cIdx) => (rIdx === rowIndex && cIdx === colIndex ? newValue : cell))
    );
    setGridValues(newGridValues);

    const newPencilMarks = pencilMarks.map((row, rIdx) =>
      row.map((cellSet, cIdx) => {
        if (rIdx === rowIndex && cIdx === colIndex) {
          return new Set<string>();
        }
        if (rIdx === rowIndex || cIdx === colIndex) {
          const updatedSet = new Set(cellSet);
          updatedSet.delete(newValue);
          return updatedSet;
        }
        return cellSet;
      })
    );
    setPencilMarks(newPencilMarks);

    clearErrors();

    // Mark that a value was entered since selection
    setHasEnteredValueSinceSelection(true);

    // Manual win check as fallback - check the new grid state
    console.log('Direct number input completed, checking win condition manually...');
  };

  // Navigation with arrow keys
  const handleArrowNavigation = (
    currentRow: number,
    currentCol: number,
    direction: 'up' | 'down' | 'left' | 'right'
  ) => {
    let nextRow = currentRow;
    let nextCol = currentCol;

    switch (direction) {
      case 'up':
        nextRow = Math.max(0, currentRow - 1);
        break;
      case 'down':
        nextRow = Math.min(size - 1, currentRow + 1);
        break;
      case 'left':
        nextCol = Math.max(0, currentCol - 1);
        break;
      case 'right':
        nextCol = Math.min(size - 1, currentCol + 1);
        break;
    }

    if (nextRow !== currentRow || nextCol !== currentCol) {
      const nextCellKey = `${nextRow}-${nextCol}`;
      setSelectedCells(new Set([nextCellKey]));
      lastFocusedCell.current = { row: nextRow, col: nextCol };
      inputRefs.current?.[nextRow]?.[nextCol]?.focus();
    }
  };

  // Handle cell click for selection
  const handleCellClick = (
    event: React.MouseEvent<HTMLDivElement> | undefined,
    rowIndex: number,
    colIndex: number
  ) => {
    const cellKey = `${rowIndex}-${colIndex}`;
    const isShift = !!event?.shiftKey;

    if (isShift) {
      // Shift+click: Enter temporary pencil mode if not already in it
      if (!isInTemporaryPencilMode) {
        setPreviousMode(isPencilMode);
        setIsPencilMode(true);
        setIsInTemporaryPencilMode(true);
        console.log(
          'Shift+click: Entering temporary pencil mode, previous mode was:',
          isPencilMode
        );
      }

      // Handle multi-selection
      setSelectedCells(prevSelected => {
        // If values were entered since last selection, start fresh
        if (hasEnteredValueSinceSelection) {
          console.log('Values were entered since selection, starting fresh selection');
          setHasEnteredValueSinceSelection(false);
          lastFocusedCell.current = { row: rowIndex, col: colIndex };
          return new Set([cellKey]);
        }
        const newSelected = new Set(prevSelected);
        if (newSelected.has(cellKey)) {
          if (newSelected.size > 1) {
            newSelected.delete(cellKey);
            if (
              lastFocusedCell.current?.row === rowIndex &&
              lastFocusedCell.current?.col === colIndex
            ) {
              const remainingCells = Array.from(newSelected);
              const lastRemaining = remainingCells[remainingCells.length - 1];
              if (lastRemaining) {
                const [r, c] = lastRemaining.split('-').map(Number);
                lastFocusedCell.current = { row: r, col: c };
              } else {
                lastFocusedCell.current = null;
              }
            }
          }
        } else {
          newSelected.add(cellKey);
          lastFocusedCell.current = { row: rowIndex, col: colIndex };
        }

        const focusTarget = lastFocusedCell.current;
        if (focusTarget) {
          const targetInputRef = inputRefs.current?.[focusTarget.row]?.[focusTarget.col];
          if (targetInputRef) {
            setTimeout(() => targetInputRef.focus(), 0);
          }
        }

        return newSelected.size > 0 ? newSelected : new Set([cellKey]);
      });
    } else {
      // Normal click: Restore previous mode if we were in temporary pencil mode
      if (isInTemporaryPencilMode) {
        setIsPencilMode(previousMode);
        setIsInTemporaryPencilMode(false);
        console.log(
          'Normal click: Exiting temporary pencil mode, restoring previous mode:',
          previousMode
        );
      }

      // Reset the flag since we're making a new selection
      setHasEnteredValueSinceSelection(false);

      // Check if clicking on the only selected cell - if so, deselect it
      if (selectedCells.size === 1 && selectedCells.has(cellKey)) {
        setSelectedCells(new Set());
        lastFocusedCell.current = null;
        console.log('Deselecting cell:', cellKey);
      } else {
        // Single cell selection
        setSelectedCells(new Set([cellKey]));
        lastFocusedCell.current = { row: rowIndex, col: colIndex };
        const targetInputRef = inputRefs.current?.[rowIndex]?.[colIndex];
        if (targetInputRef) {
          setTimeout(() => targetInputRef.focus(), 0);
        }
      }
    }

    clearErrors();
  };

  // Check individual cell against solution
  const handleCheckCell = () => {
    markAided();
    clearErrors();
    const focusedElement = document.activeElement as HTMLInputElement;

    if (
      focusedElement &&
      focusedElement.tagName === 'INPUT' &&
      focusedElement.classList.contains('cell-input')
    ) {
      const rowIndex = parseInt(focusedElement.dataset.row || '-1', 10);
      const colIndex = parseInt(focusedElement.dataset.col || '-1', 10);

      if (rowIndex !== -1 && colIndex !== -1) {
        const currentValue = gridValues[rowIndex][colIndex];
        if (currentValue === '') {
          console.log('Cell is empty, nothing to check.');
          return;
        }

        const numValue = parseInt(currentValue, 10);
        const errors = new Set<number>();
        const cellIndex = rowIndex * size + colIndex;

        // Check against solution
        const correctValue = solution[rowIndex][colIndex];
        if (numValue !== correctValue) {
          errors.add(cellIndex);
        }

        if (errors.size > 0) {
          console.log(`Error found in cell [${rowIndex}, ${colIndex}]`);
          setErrorCells(errors);
        } else {
          console.log(`Cell [${rowIndex}, ${colIndex}] seems correct.`);
        }
      }
    }
  };

  // Revert to a checkpoint state while preserving redo capability
  const revertToState = (
    checkpointGridValues: string[][],
    checkpointPencilMarks: Set<string>[][]
  ) => {
    // Push current state to redoStack so user can redo back to where they were
    setRedoStack(prevRedo => [...prevRedo, [gridValues, pencilMarks]]);

    // Restore checkpoint state
    setGridValues(checkpointGridValues.map(row => [...row]));
    setPencilMarks(checkpointPencilMarks.map(row => row.map(cell => new Set(cell))));

    clearErrors();
    console.log('Reverted to checkpoint (redo available to return)');
  };

  // Secret shortcut: Solve all but one square
  const handleSecretShortcut = () => {
    if (!solution || solution.length === 0) {
      console.log('No solution available for secret shortcut');
      return;
    }

    // Get all empty cells
    const emptyCells: { row: number; col: number }[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (gridValues[r][c] === '') {
          emptyCells.push({ row: r, col: c });
        }
      }
    }

    // If there are less than 2 empty cells, don't do anything
    if (emptyCells.length < 2) {
      console.log('Not enough empty cells for secret shortcut');
      return;
    }

    // Save current state to history
    setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
    setRedoStack([]);

    // Fill all but one random cell
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    const cellToKeepEmpty = emptyCells[randomIndex];

    const newGridValues = gridValues.map((row, rIdx) =>
      row.map((cell, cIdx) => {
        // If cell is already filled, keep it
        if (cell !== '') return cell;

        // If this is the cell we want to keep empty, keep it empty
        if (rIdx === cellToKeepEmpty.row && cIdx === cellToKeepEmpty.col) {
          return '';
        }

        // Otherwise, fill with solution value
        return solution[rIdx][cIdx].toString();
      })
    );

    // Clear pencil marks for filled cells
    const newPencilMarks = pencilMarks.map((row, rIdx) =>
      row.map((cellSet, cIdx) => {
        // If this cell was just filled, clear its pencil marks
        if (newGridValues[rIdx][cIdx] !== '' && gridValues[rIdx][cIdx] === '') {
          return new Set<string>();
        }
        return cellSet;
      })
    );

    setGridValues(newGridValues);
    setPencilMarks(newPencilMarks);
    clearErrors();

    console.log('Secret shortcut activated: solved all but one square!');
  };

  // Check entire puzzle against solution
  const handleCheckPuzzle = () => {
    markAided();
    clearErrors();
    console.log('Checking entire puzzle...');
    const errors = new Set<number>();

    const filledCells = new Map<number, number>();

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (gridValues[r][c] !== '') {
          const num = parseInt(gridValues[r][c], 10);
          if (!isNaN(num) && num >= 1 && num <= size) {
            filledCells.set(r * size + c, num);
          } else {
            errors.add(r * size + c);
          }
        }
      }
    }

    // Check against solution
    filledCells.forEach((value, cellIndex) => {
      const r = Math.floor(cellIndex / size);
      const c = cellIndex % size;
      if (value !== solution[r][c]) {
        errors.add(cellIndex);
      }
    });

    if (errors.size > 0) {
      console.log(`Found ${errors.size} errors in puzzle.`);
      setErrorCells(errors);
    } else {
      console.log('No errors found in the puzzle!');
    }
  };

  /**
   * Enter the same "temporary pencil mode" that regular shift+click sets,
   * so a subsequent number keypress on a multi-cell selection produces
   * pencil marks rather than a placement. Idempotent.
   */
  const enterTemporaryPencilMode = () => {
    if (!isInTemporaryPencilMode) {
      setPreviousMode(isPencilMode);
      setIsPencilMode(true);
      setIsInTemporaryPencilMode(true);
    }
  };

  return {
    // State
    gridValues,
    pencilMarks,
    isPencilMode,
    setIsPencilMode,
    isInTemporaryPencilMode,
    enterTemporaryPencilMode,
    errorCells,
    flashingCells,
    settlingCells,
    selectedCells,
    setSelectedCells,
    hasEnteredValueSinceSelection,
    setHasEnteredValueSinceSelection,
    inputRefs,
    lastFocusedCell,

    // History
    history,
    redoStack,

    // Handlers
    handleInputChange,
    handleUndo,
    handleRedo,
    handlePencilMarkInput,
    handleCellDeletion,
    handleDirectNumberInput,
    handleArrowNavigation,
    handleCellClick,
    handleCheckCell,
    handleCheckPuzzle,
    handleAutofillSingles,
    handleFillAllCandidates,
    applyHintAction,
    rewindToLastSound,
    canRewindToSound,
    markAided,
    handleSecretShortcut,
    revertToState,
    clearErrors,
    clearSelection,
  };
};
