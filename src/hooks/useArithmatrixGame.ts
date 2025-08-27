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

interface UseArithmatrixGameProps {
  puzzleDefinition: PuzzleDefinition;
  solution: number[][];
  onWin: () => void;
  isTimerRunning: boolean;
  isGameWon: boolean;
  initialGridValues?: string[][];
  initialPencilMarks?: Set<string>[][];
  onStateChange?: (gridValues: string[][], pencilMarks: Set<string>[][]) => void;
}

export const useArithmatrixGame = ({
  puzzleDefinition,
  solution,
  onWin,
  isTimerRunning,
  isGameWon,
  initialGridValues,
  initialPencilMarks,
  onStateChange,
}: UseArithmatrixGameProps) => {
  const { size, cages } = puzzleDefinition;

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
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  // Refs for tracking
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);
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

      // Initialize input refs
      inputRefs.current = Array(size)
        .fill(0)
        .map(() => Array(size).fill(null));
    }
  }, [puzzleDefinition, size, initialGridValues, initialPencilMarks]);

  // Effect to check win condition whenever gridValues changes
  useEffect(() => {
    console.log('Win detection effect triggered, gridValues changed:', gridValues);
    if (gridValues.length > 0 && gridValues.every(row => row.every(cell => cell !== ''))) {
      console.log('Grid is completely filled, checking win condition...');
      if (checkWinCondition(gridValues, puzzleDefinition)) {
        console.log('Win condition met! Calling onWin()');
        onWin();
      } else {
        console.log('Grid is full but win condition not met');
      }
    } else {
      const emptyCells = gridValues.reduce(
        (count, row, r) =>
          count + row.reduce((rowCount, cell, c) => rowCount + (cell === '' ? 1 : 0), 0),
        0
      );
      console.log(`Grid not complete yet, ${emptyCells} empty cells remaining`);
    }
  }, [gridValues, puzzleDefinition, onWin]);

  // Effect to notify parent component of state changes
  useEffect(() => {
    if (onStateChange && gridValues.length > 0 && pencilMarks.length > 0) {
      onStateChange(gridValues, pencilMarks);
    }
  }, [gridValues, pencilMarks, onStateChange]);

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
      if (checkWinCondition(newGridValues, puzzleDefinition)) {
        console.log('Win condition met via manual check! Calling onWin()');
        onWin();
      }
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

    let nextPencilMarks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));
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

  // Autofill singles: fill cells that are single-cell cages or have exactly one pencil mark
  const handleAutofillSingles = () => {
    const { size, cages } = puzzleDefinition;

    let anyUpdated = false;

    const nextGridValues = gridValues.map(row => [...row]);
    const nextPencilMarks = pencilMarks.map(row => row.map(cellSet => new Set(cellSet)));

    // Helper to set a value and clear pencils row/col like normal entry
    const setCellValue = (r: number, c: number, valueStr: string) => {
      if (nextGridValues[r][c] !== '') return;
      nextGridValues[r][c] = valueStr;
      // Clear pencils in the cell and remove candidate from row/col
      for (let i = 0; i < size; i++) {
        if (i !== c) {
          nextPencilMarks[r][i].delete(valueStr);
        }
      }
      for (let i = 0; i < size; i++) {
        if (i !== r) {
          nextPencilMarks[i][c].delete(valueStr);
        }
      }
      nextPencilMarks[r][c] = new Set<string>();
    };

    // Iterate until no more autofills are possible
    // This captures cascading singles after each placement updates row/col pencil marks
    // to potentially produce new single-candidate cells
    // Safeguard: with finite grid and monotonic fills, this will terminate quickly
    // even if users have many pencil marks
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let updatedInPass = false;

      // 1) Single-cell cages with explicit value
      cages.forEach(cage => {
        if (cage.cells.length === 1 && (cage.operation === '=' || cage.operation === '')) {
          const cellIndex = cage.cells[0];
          const r = Math.floor(cellIndex / size);
          const c = cellIndex % size;
          if (nextGridValues[r][c] === '') {
            const valueStr = String(cage.value);
            const value = parseInt(valueStr, 10);
            if (value >= 1 && value <= size) {
              const conflicts = findConflictingCells(r, c, valueStr, nextGridValues, size);
              if (conflicts.length === 0) {
                setCellValue(r, c, valueStr);
                updatedInPass = true;
                anyUpdated = true;
              }
            }
          }
        }
      });

      // 2) Cells with exactly one pencil mark candidate
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (nextGridValues[r][c] === '' && nextPencilMarks[r][c].size === 1) {
            const [only] = Array.from(nextPencilMarks[r][c]);
            const value = parseInt(only, 10);
            if (!isNaN(value) && value >= 1 && value <= size) {
              const conflicts = findConflictingCells(r, c, only, nextGridValues, size);
              if (conflicts.length === 0) {
                setCellValue(r, c, only);
                updatedInPass = true;
                anyUpdated = true;
              }
            }
          }
        }
      }

      if (!updatedInPass) break;
    }

    if (anyUpdated) {
      setHistory(prevHistory => [...prevHistory, [gridValues, pencilMarks]]);
      setRedoStack([]);
      setGridValues(nextGridValues);
      setPencilMarks(nextPencilMarks);
      clearErrors();
      setHasEnteredValueSinceSelection(true);

      if (checkWinCondition(nextGridValues, puzzleDefinition)) {
        onWin();
      }
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
    if (checkWinCondition(newGridValues, puzzleDefinition)) {
      console.log('Win condition met via direct input check! Calling onWin()');
      onWin();
    }
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

  return {
    // State
    gridValues,
    pencilMarks,
    isPencilMode,
    setIsPencilMode,
    isInTemporaryPencilMode,
    errorCells,
    flashingCells,
    selectedCells,
    setSelectedCells,
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
    handleSecretShortcut,
    clearErrors,
    clearSelection,
  };
};
