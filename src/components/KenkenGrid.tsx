import React, { useState, useEffect, useRef } from "react";
import { Box, Stack, Group, ActionIcon, Tooltip, rem } from "@mantine/core";
import {
  IconPencil,
  IconCheck,
  IconArrowBackUp,
  IconArrowForwardUp,
} from "@tabler/icons-react";
import "./KenkenGrid.css"; // Essential for grid styling and layout
// Removed old CSS import - now using Tailwind classes

interface Cage {
  value: number;
  operation: string;
  cells: number[];
}

interface PuzzleDefinition {
  size: number;
  cages: Cage[];
}

// Define props for the component
interface KenkenGridProps {
  puzzleDefinition: PuzzleDefinition;
  solution: number[][]; // Add the solution grid prop
  onWin: () => void; // Callback for when the puzzle is solved
  isTimerRunning: boolean; // Prop to indicate if the timer is running
  isGameWon: boolean; // Prop to indicate if the game is won
}

// Type for the history state, storing both grid values and pencil marks
type HistoryEntry = [string[][], Set<string>[][]];
// Type for a single cell coordinate
type CellCoord = { row: number; col: number };

const KenkenGrid: React.FC<KenkenGridProps> = ({
  puzzleDefinition,
  solution, // Destructure solution prop
  onWin,
  isTimerRunning,
  isGameWon,
}) => {
  const { size, cages } = puzzleDefinition;
  const [gridValues, setGridValues] = useState<string[][]>([]);
  const [pencilMarks, setPencilMarks] = useState<Set<string>[][]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const [isPencilMode, setIsPencilMode] = useState(false); // Track pencil mode
  const [errorCells, setErrorCells] = useState<Set<number>>(new Set()); // Track cells with errors
  const [flashingCells, setFlashingCells] = useState<Set<string>>(new Set()); // Track cells that should flash briefly
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()); // Track selected cells r-c format
  const lastFocusedCell = useRef<CellCoord | null>(null); // Track the last explicitly focused cell

  // Memoized cage color assignment to avoid adjacent cages having similar colors
  const cageColorMap = React.useMemo(() => {
    if (!puzzleDefinition) return new Map<number, number>();

    const { size, cages } = puzzleDefinition;
    const colorMap = new Map<number, number>();

    // Helper function to check if two cages are adjacent
    const areCagesAdjacent = (cage1: Cage, cage2: Cage): boolean => {
      for (const cell1 of cage1.cells) {
        const r1 = Math.floor(cell1 / size);
        const c1 = cell1 % size;

        for (const cell2 of cage2.cells) {
          const r2 = Math.floor(cell2 / size);
          const c2 = cell2 % size;

          // Check if cells are adjacent (horizontally or vertically)
          if (
            (Math.abs(r1 - r2) === 1 && c1 === c2) ||
            (Math.abs(c1 - c2) === 1 && r1 === r2)
          ) {
            return true;
          }
        }
      }
      return false;
    };

    // Build adjacency graph
    const adjacencyList = new Map<number, Set<number>>();
    for (let i = 0; i < cages.length; i++) {
      adjacencyList.set(i, new Set());
      for (let j = 0; j < cages.length; j++) {
        if (i !== j && areCagesAdjacent(cages[i], cages[j])) {
          adjacencyList.get(i)!.add(j);
        }
      }
    }

    // Define only the most similar color pairs to avoid (not entire groups)
    const similarColorPairs = [
      [0, 9], // Both pink variants
      [1, 11], // Both orange/yellow variants
      [2, 10], // Both green variants
    ];

    // Track color usage to promote diversity
    const colorUsage = new Array(12).fill(0);

    for (let cageIdx = 0; cageIdx < cages.length; cageIdx++) {
      const usedColors = new Set<number>();
      const adjacentCages = adjacencyList.get(cageIdx) || new Set();

      // Collect colors used by adjacent cages
      for (const adjCage of adjacentCages) {
        if (colorMap.has(adjCage)) {
          const adjColor = colorMap.get(adjCage)!;
          usedColors.add(adjColor);

          // Only avoid the most similar colors, not entire groups
          for (const [color1, color2] of similarColorPairs) {
            if (adjColor === color1) {
              usedColors.add(color2);
            } else if (adjColor === color2) {
              usedColors.add(color1);
            }
          }
        }
      }

      // Find the best available color, preferring less-used colors
      let assignedColor = 0;
      let minUsage = Infinity;

      for (let color = 0; color < 12; color++) {
        if (!usedColors.has(color)) {
          if (colorUsage[color] < minUsage) {
            minUsage = colorUsage[color];
            assignedColor = color;
          }
        }
      }

      // If all colors are blocked (shouldn't happen with 12 colors), use least used
      if (minUsage === Infinity) {
        assignedColor = colorUsage.indexOf(Math.min(...colorUsage));
      }

      colorMap.set(cageIdx, assignedColor);
      colorUsage[assignedColor]++;
    }

    return colorMap;
  }, [puzzleDefinition]);

  // --- Helper: Clear Errors ---
  const clearErrors = () => {
    if (errorCells.size > 0) {
      setErrorCells(new Set());
    }
  };

  // Initialize refs array based on size
  useEffect(() => {
    if (puzzleDefinition) {
      inputRefs.current = Array(puzzleDefinition.size)
        .fill(0)
        .map(() => Array(puzzleDefinition.size).fill(null));
    }
  }, [puzzleDefinition?.size]); // Rerun if size changes

  // Initialize or reset gridValues, pencilMarks, and history when puzzleDefinition changes
  useEffect(() => {
    if (puzzleDefinition) {
      setGridValues(
        Array(size)
          .fill(0)
          .map(() => Array(size).fill(""))
      );
      // Initialize pencil marks as an array of empty Sets
      setPencilMarks(
        Array(size)
          .fill(0)
          .map(() =>
            Array(size)
              .fill(0)
              .map(() => new Set<string>())
          )
      );
      setHistory([]); // Clear history for new puzzle
      setRedoStack([]); // Clear redo stack for new puzzle
      setIsPencilMode(false); // Reset pencil mode
      setErrorCells(new Set()); // Clear errors for new puzzle
      // Optionally focus the first cell on new puzzle load
      // inputRefs.current?.[0]?.[0]?.focus();
    } else {
      // Handle case where puzzleDefinition might be null initially or on error
      setGridValues([]);
      setPencilMarks([]);
      setHistory([]);
      setRedoStack([]); // Clear redo stack too
      setIsPencilMode(false);
      setErrorCells(new Set());
    }
  }, [puzzleDefinition]); // Dependency array ensures this runs when the puzzle changes

  // --- Win Condition Check ---
  const checkWinCondition = (currentGrid: string[][]): boolean => {
    if (!puzzleDefinition) return false; // Should not happen if called correctly
    const { size, cages } = puzzleDefinition;

    // 1. Check if all cells are filled and convert to numbers
    const numberGrid: number[][] = Array(size)
      .fill(0)
      .map(() => Array(size).fill(0));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (currentGrid[r][c] === "") {
          return false; // Not all cells are filled
        }
        const num = parseInt(currentGrid[r][c], 10);
        if (isNaN(num) || num < 1 || num > size) {
          return false; // Invalid number found (shouldn't happen with input validation)
        }
        numberGrid[r][c] = num;
      }
    }

    // 2. Check Latin Square rule (rows and columns)
    for (let i = 0; i < size; i++) {
      const rowSet = new Set<number>();
      const colSet = new Set<number>();
      for (let j = 0; j < size; j++) {
        rowSet.add(numberGrid[i][j]); // Check row i
        colSet.add(numberGrid[j][i]); // Check column i
      }
      if (rowSet.size !== size || colSet.size !== size) {
        return false; // Duplicate number in row or column
      }
    }

    // 3. Check Cage Constraints
    for (const cage of cages) {
      const cageValues: number[] = cage.cells.map((cellIndex) => {
        const r = Math.floor(cellIndex / size);
        const c = cellIndex % size;
        return numberGrid[r][c];
      });

      let result: number;
      switch (cage.operation) {
        case "+":
          result = cageValues.reduce((sum, val) => sum + val, 0);
          break;
        case "*":
          result = cageValues.reduce((prod, val) => prod * val, 1);
          break;
        case "-": // Assumes exactly two cells
          if (cageValues.length !== 2) return false; // Invalid cage definition
          result = Math.abs(cageValues[0] - cageValues[1]);
          break;
        case "/": // Assumes exactly two cells
          if (cageValues.length !== 2) return false; // Invalid cage definition
          const maxVal = Math.max(cageValues[0], cageValues[1]);
          const minVal = Math.min(cageValues[0], cageValues[1]);
          if (minVal === 0 || maxVal % minVal !== 0) return false; // Division invalid or not integer
          result = maxVal / minVal;
          break;
        case "=": // Assumes exactly one cell
          if (cageValues.length !== 1) return false; // Invalid cage definition
          result = cageValues[0];
          break;
        default:
          return false; // Unknown operation
      }

      if (result !== cage.value) {
        return false; // Cage constraint failed
      }
    }

    // All checks passed!
    console.log("Win condition met!");
    return true;
  };
  // -------------------------

  const handleInputChange = (
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    const { size } = puzzleDefinition;
    const num = parseInt(value, 10);
    const currentVal = gridValues[rowIndex][colIndex];

    // Only proceed if the value is valid and actually changing
    if (
      value !== currentVal &&
      (value === "" || (!isNaN(num) && num >= 1 && num <= size))
    ) {
      // Push the *current* state onto history *before* updating
      setHistory((prevHistory) => [...prevHistory, [gridValues, pencilMarks]]);
      setRedoStack([]); // Clear redo stack on new action

      // Update grid values
      const newGridValues = gridValues.map((row, rIdx) =>
        row.map((cell, cIdx) =>
          rIdx === rowIndex && cIdx === colIndex ? value : cell
        )
      );
      setGridValues(newGridValues);

      // Update pencil marks: Clear current cell AND remove value from row/col
      const newPencilMarks = pencilMarks.map((row, rIdx) =>
        row.map((cellSet, cIdx) => {
          // 1. Clear pencil marks for the cell being changed
          if (rIdx === rowIndex && cIdx === colIndex) {
            return new Set<string>();
          }
          // 2. If a number was entered (not cleared), remove it from row/col peers
          if (value !== "") {
            if (rIdx === rowIndex || cIdx === colIndex) {
              const updatedSet = new Set(cellSet);
              updatedSet.delete(value); // Remove the newly entered value
              return updatedSet;
            }
          }
          // Otherwise, keep the pencil marks as they were
          return cellSet;
        })
      );
      setPencilMarks(newPencilMarks);

      clearErrors(); // Clear errors on valid input change

      // Check for win condition after state update
      if (checkWinCondition(newGridValues)) {
        onWin();
      }
    } else if (value !== "" && value !== currentVal) {
      // If the input is invalid (not empty, not 1-size), briefly highlight the input maybe?
      // Or just ignore it. For now, we ignore it by not updating state.
      // We might want to revert the input field itself if the browser allows an invalid char briefly
      const input = inputRefs.current?.[rowIndex]?.[colIndex];
      if (input) {
        // Revert to the previous value if the new value is invalid
        input.value = currentVal;
      }
    }
  };

  // --- Undo Handler ---
  const handleUndo = () => {
    if (history.length === 0) return; // Nothing to undo

    const [prevGridValues, prevPencilMarks] = history[history.length - 1];
    // Push the *current* state to the redo stack *before* reverting
    setRedoStack((prevRedo) => [...prevRedo, [gridValues, pencilMarks]]);
    setGridValues(prevGridValues);
    setPencilMarks(prevPencilMarks); // Restore pencil marks
    setHistory((prevHistory) => prevHistory.slice(0, -1));
  };
  // --------------------

  // --- Redo Handler ---
  const handleRedo = () => {
    if (redoStack.length === 0) return; // Nothing to redo

    const [nextGridValues, nextPencilMarks] = redoStack[redoStack.length - 1];
    // Push the *current* state to the undo history *before* applying redo
    setHistory((prevHistory) => [...prevHistory, [gridValues, pencilMarks]]);
    setGridValues(nextGridValues);
    setPencilMarks(nextPencilMarks);
    setRedoStack((prevRedo) => prevRedo.slice(0, -1));
  };
  // ------------------

  // --- Global Key Listener for Undo/Redo ---
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault(); // Prevent browser's default undo
        if (event.shiftKey) {
          // Cmd/Ctrl + Shift + Z for Redo
          handleRedo();
        } else {
          // Cmd/Ctrl + Z for Undo
          handleUndo();
        }
      }
      // Check for Cmd+Y (Mac) or Ctrl+Y (Windows/Linux) - common alternative for Redo
      else if ((event.metaKey || event.ctrlKey) && event.key === "y") {
        event.preventDefault(); // Prevent browser's default redo
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handleUndo, handleRedo]); // Re-add listener if handlers change (debounced/memoized recommended if complex)
  // Note: handleUndo/handleRedo dependencies might cause excessive re-renders if not memoized,
  // but for simple state setters it's usually fine. Consider useCallback if performance issues arise.

  // --- Global Key Listener for Caps Lock Toggle ---
  useEffect(() => {
    const handleCapsLock = (event: KeyboardEvent) => {
      // We only care about the CapsLock key itself
      if (event.key === "CapsLock") {
        try {
          // Check the state of Caps Lock *after* the key event
          const capsLockOn = event.getModifierState("CapsLock");
          setIsPencilMode(capsLockOn);
          console.log("Caps Lock state:", capsLockOn);
        } catch (e) {
          console.error("Could not get CapsLock modifier state:", e);
          // Fallback or alternative check might be needed for some environments
        }
      }
    };

    // Listen for both keydown and keyup to catch the state change reliably
    window.addEventListener("keydown", handleCapsLock);
    window.addEventListener("keyup", handleCapsLock);

    // Cleanup listeners
    return () => {
      window.removeEventListener("keydown", handleCapsLock);
      window.removeEventListener("keyup", handleCapsLock);
    };
    // No dependencies needed as setIsPencilMode is stable
  }, []);
  // --------------------------------------------

  // --- Arrow Key Navigation & Pencil Mark Input ---
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    const { size } = puzzleDefinition;
    const key = e.key;
    const numberPressed = /^[1-9]$/.test(key) ? parseInt(key, 10) : NaN;

    // --- Pencil Mark Logic ---
    // Check if trying to enter a pencil mark (NOW ONLY CHECKS Pencil Mode state)
    if (
      !isNaN(numberPressed) &&
      numberPressed >= 1 &&
      numberPressed <= size &&
      isPencilMode // Removed shiftPressed check
    ) {
      e.preventDefault(); // Prevent the number from appearing in the input field

      // Push history ONCE for the entire multi-cell operation, IF an update occurs
      let historyPushed = false;
      const pushHistoryIfNeeded = () => {
        if (!historyPushed) {
          setHistory((prevHistory) => [
            ...prevHistory,
            [gridValues, pencilMarks],
          ]);
          setRedoStack([]); // Clear redo stack on new action
          historyPushed = true;
        }
      };

      const numStr = String(numberPressed);
      let updatedSomething = false; // Track if any cell was actually updated

      // Create the next state based on the current one
      let nextPencilMarks = pencilMarks.map((row) =>
        row.map((cellSet) => new Set(cellSet))
      );
      const cellsToFlash = new Set<string>(); // Track cells that need flashing

      // Apply to all selected cells
      selectedCells.forEach((cellKey) => {
        const [r, c] = cellKey.split("-").map(Number);

        // Can only add pencil marks if the cell is empty
        if (gridValues[r][c] !== "") return; // Skip if cell has a value

        const currentPencilSet = nextPencilMarks[r][c];
        const newSet = new Set(currentPencilSet);

        if (newSet.has(numStr)) {
          newSet.delete(numStr); // Toggle off
          pushHistoryIfNeeded(); // Push history now that we know an update is happening
          updatedSomething = true;
          // Update the set in the next state immediately for this cell
          nextPencilMarks[r][c] = newSet;
        } else {
          // --- Check if candidate is valid before adding ---
          let isValidCandidate = true;
          let conflictingCellKey: string | null = null;

          // Check row
          for (let checkC = 0; checkC < size; checkC++) {
            if (gridValues[r][checkC] === numStr) {
              isValidCandidate = false;
              conflictingCellKey = `${r}-${checkC}`;
              break;
            }
          }
          // Check column (if still valid)
          if (isValidCandidate) {
            for (let checkR = 0; checkR < size; checkR++) {
              if (gridValues[checkR][c] === numStr) {
                isValidCandidate = false;
                conflictingCellKey = `${checkR}-${c}`;
                break;
              }
            }
          }
          // --------------------------------------------------

          if (isValidCandidate) {
            newSet.add(numStr); // Toggle on only if valid
            pushHistoryIfNeeded(); // Push history now that we know an update is happening
            updatedSomething = true;
            // Update the set in the next state immediately for this cell
            nextPencilMarks[r][c] = newSet;
          } else if (conflictingCellKey) {
            // Conflict found for *this specific cell*
            console.log(
              `Cannot add pencil mark ${numStr} to [${r}, ${c}]: conflicts with existing value at ${conflictingCellKey}.`
            );
            cellsToFlash.add(conflictingCellKey); // Mark the *conflicting* cell for flashing
            // Do NOT update updatedSomething or nextPencilMarks[r][c] for this invalid cell
          }
        }
      });

      // --- Apply Flashing Effect ---
      if (cellsToFlash.size > 0) {
        setFlashingCells((prev) => new Set([...prev, ...cellsToFlash]));
        setTimeout(() => {
          setFlashingCells((prev) => {
            const next = new Set(prev);
            cellsToFlash.forEach((key) => next.delete(key));
            return next;
          });
        }, 500);
      }
      // ---------------------------

      // Update state if *any* pencil mark was successfully updated
      if (updatedSomething) {
        setPencilMarks(nextPencilMarks);
        clearErrors(); // Clear errors on valid pencil mark change

        // Check win condition (grid values didn't change, so no win possible here)
        // No need to check win condition here
      } else if (historyPushed) {
        // If history was pushed but nothing was ultimately updated (e.g., only conflicts found)
        setHistory((prevHistory) => prevHistory.slice(0, -1));
      }

      // --- Refocus the input cell after handling pencil mark ---
      setTimeout(() => {
        inputRefs.current?.[rowIndex]?.[colIndex]?.focus();
      }, 0);
      // ----------------------------------------------------------

      return; // Stop processing here for pencil marks
    }
    // --- Backspace/Delete Logic ---
    if (key === "Backspace" || key === "Delete") {
      e.preventDefault(); // Prevent default browser backspace/delete behavior
      if (selectedCells.size === 0) return; // Nothing to do if no cells selected
      let updatedGrid = false;
      let updatedPencils = false;

      // Create copies to modify based on the current state
      const nextGridValues = gridValues.map((row) => [...row]);
      const nextPencilMarks = pencilMarks.map((row) =>
        row.map((cellSet) => new Set(cellSet))
      );

      selectedCells.forEach((cellKey) => {
        const [r, c] = cellKey.split("-").map(Number);

        if (nextGridValues[r][c] !== "") {
          nextGridValues[r][c] = "";
          updatedGrid = true;
          // Also clear potential pencil marks if deleting a value
          if (nextPencilMarks[r][c].size > 0) {
            nextPencilMarks[r][c] = new Set<string>();
            updatedPencils = true; // Technically updated, though maybe redundant
          }
        } else if (nextPencilMarks[r][c].size > 0) {
          nextPencilMarks[r][c] = new Set<string>();
          updatedPencils = true;
        }
      });
      // Only update state and history if something actually changed
      if (updatedGrid || updatedPencils) {
        // Push the *current* state onto history *before* updating
        setHistory((prevHistory) => [
          ...prevHistory,
          [gridValues, pencilMarks], // Push the state *before* the delete action
        ]);
        setRedoStack([]); // Clear redo stack on new action

        if (updatedGrid) {
          setGridValues(nextGridValues);
        }
        if (updatedPencils) {
          setPencilMarks(nextPencilMarks);
        }

        clearErrors(); // Clear errors after delete/backspace

        // Check for win condition after state update
        if (checkWinCondition(updatedGrid ? nextGridValues : gridValues)) {
          onWin();
        }
      }
      return; // Handled
    }

    // --- Overwrite existing value with direct number input (Normal Mode) ---
    const isNormalNumberInput =
      !isPencilMode &&
      !isNaN(numberPressed) &&
      numberPressed >= 1 &&
      numberPressed <= size;

    if (isNormalNumberInput && gridValues[rowIndex][colIndex] !== "") {
      // User is typing a number into a cell that already has a value.
      // Replace the existing value directly, bypassing default onChange.
      e.preventDefault(); // Prevent default input action

      const newValue = String(numberPressed);

      // Only proceed if the new value is actually different (e.g. typing '3' over '3')
      if (newValue === gridValues[rowIndex][colIndex]) {
        return; // No change needed
      }

      // Push history *before* update
      setHistory((prevHistory) => [...prevHistory, [gridValues, pencilMarks]]);
      setRedoStack([]);

      // Update grid values directly
      const newGridValues = gridValues.map((row, rIdx) =>
        row.map((cell, cIdx) =>
          rIdx === rowIndex && cIdx === colIndex ? newValue : cell
        )
      );
      setGridValues(newGridValues);

      // Update pencil marks (clear current cell, remove from peers)
      const newPencilMarks = pencilMarks.map((row, rIdx) =>
        row.map((cellSet, cIdx) => {
          // 1. Clear pencil marks for the cell being changed
          if (rIdx === rowIndex && cIdx === colIndex) {
            return new Set<string>();
          }
          // 2. If a number was entered, remove it from row/col peers
          if (rIdx === rowIndex || cIdx === colIndex) {
            const updatedSet = new Set(cellSet);
            updatedSet.delete(newValue); // Remove the newly entered value
            return updatedSet;
          }
          // Otherwise, keep the pencil marks as they were
          return cellSet;
        })
      );
      setPencilMarks(newPencilMarks);

      clearErrors();

      if (checkWinCondition(newGridValues)) {
        onWin();
      }
      return; // Input handled directly
    }
    // -----------------------------------------------------------------------

    // --- Arrow Key Navigation ---
    let nextRow = rowIndex;
    let nextCol = colIndex;

    switch (key) {
      case "ArrowUp":
        nextRow = Math.max(0, rowIndex - 1);
        e.preventDefault(); // Prevent page scroll
        break;
      case "ArrowDown":
        nextRow = Math.min(size - 1, rowIndex + 1);
        e.preventDefault();
        break;
      case "ArrowLeft":
        nextCol = Math.max(0, colIndex - 1);
        e.preventDefault();
        break;
      case "ArrowRight":
        nextCol = Math.min(size - 1, colIndex + 1);
        e.preventDefault();
        break;
      // Do not return default if it wasn't an arrow key or handled pencil mark/delete
      default:
        // If it's a number key *without* shift/pencil mode, let onChange handle it
        // (but we still want to prevent default if it was an invalid key like 'a')
        if (isNaN(numberPressed) || numberPressed < 1 || numberPressed > size) {
          // Prevent non-numeric, non-arrow, non-delete keys from doing anything
          // Allows functional keys like Tab, etc. through though
          if (
            ![
              "Tab",
              "Shift",
              "Control",
              "Alt",
              "Meta",
              "CapsLock",
              "Escape",
              "Enter",
            ].includes(key)
          ) {
            e.preventDefault();
          }
        }
        return; // Let browser handle valid inputs if not pencil/arrow/delete
    }

    // If the position changed, focus the corresponding input
    if (nextRow !== rowIndex || nextCol !== colIndex) {
      const nextCellKey = `${nextRow}-${nextCol}`;

      // Update selection state to the new cell
      setSelectedCells(new Set([nextCellKey]));
      lastFocusedCell.current = { row: nextRow, col: nextCol };

      inputRefs.current?.[nextRow]?.[nextCol]?.focus();
    }
  };
  // --------------------------

  // Refactored to return Tailwind classes instead of style object
  const getBorderClasses = (rowIndex: number, colIndex: number): string => {
    // Return empty string since we no longer want borders on cells
    // Only selected cells will have borders applied via the selected-cell class
    return "";
  };

  // Helper function to get a background color class based on cage index
  const getCageColorClass = (cageIndex: number): string => {
    return `cage-color-${cageColorMap.get(cageIndex) || 0}`;
  };

  const getCageInfo = (
    rowIndex: number,
    colIndex: number
  ): { text: string; position: string } | null => {
    // Use the puzzleDefinition prop directly
    const cellIndex = rowIndex * puzzleDefinition.size + colIndex;
    const cage = puzzleDefinition.cages.find((c) =>
      c.cells.includes(cellIndex)
    );
    if (!cage) return null;

    // Display cage info only in the top-leftmost cell of the cage
    const minCellIndexInCage = Math.min(...cage.cells);
    if (cellIndex === minCellIndexInCage) {
      const targetStr = cage.value.toString();
      const operationStr =
        cage.operation === "*"
          ? "×"
          : cage.operation === "/"
          ? "÷"
          : cage.operation === "=" // Handle single-cell cage indicator
          ? "" // No operation displayed for single cell
          : cage.operation;
      // Display only value for single cell cages
      const displayText =
        cage.operation === "=" ? targetStr : `${targetStr}${operationStr}`;
      return { text: displayText, position: "top-left" };
    }

    return null;
  };

  // No need for loading/error state handling here, App.tsx handles it
  // if (loading) return <div>Loading puzzle...</div>;
  // if (error) return <div>Error: {error}</div>;
  // if (!puzzle) return <div>No puzzle data found.</div>;

  // Guard against rendering if puzzleDefinition is not yet available (handled by App.tsx)
  if (
    !puzzleDefinition ||
    gridValues.length === 0 ||
    pencilMarks.length === 0
  ) {
    return null; // Or a placeholder if preferred
  }

  // --- DEBUG LOG ---
  console.log("Rendering KenkenGrid, selectedCells:", selectedCells);
  // -----------------

  // --- Check Handlers ---
  const handleCheckCell = () => {
    clearErrors();
    const focusedElement = document.activeElement as HTMLInputElement;
    if (
      focusedElement &&
      focusedElement.tagName === "INPUT" &&
      focusedElement.classList.contains("cell-input")
    ) {
      const rowIndex = parseInt(focusedElement.dataset.row || "-1", 10);
      const colIndex = parseInt(focusedElement.dataset.col || "-1", 10);

      if (rowIndex !== -1 && colIndex !== -1) {
        const currentValue = gridValues[rowIndex][colIndex];
        if (currentValue === "") {
          console.log("Cell is empty, nothing to check.");
          return; // Don't mark empty cells as errors
        }

        const numValue = parseInt(currentValue, 10);
        const errors = new Set<number>();
        const cellIndex = rowIndex * size + colIndex;

        // === NEW: Check against solution first ===
        const correctValue = solution[rowIndex][colIndex];
        if (numValue !== correctValue) {
          errors.add(cellIndex);
        }
        // ==========================================

        // Keep existing checks for immediate feedback on rule violations

        // 1. Check Row uniqueness
        for (let c = 0; c < size; c++) {
          if (c !== colIndex && gridValues[rowIndex][c] === currentValue) {
            errors.add(cellIndex);
            break;
          }
        }

        // 2. Check Column uniqueness
        if (!errors.has(cellIndex)) {
          // Only check if not already marked as error
          for (let r = 0; r < size; r++) {
            if (r !== rowIndex && gridValues[r][colIndex] === currentValue) {
              errors.add(cellIndex);
              break;
            }
          }
        }

        // 3. Check Cage constraint (only if cage is full)
        if (!errors.has(cellIndex)) {
          // Only check if not already marked as error
          const cage = cages.find((c) => c.cells.includes(cellIndex));
          if (cage) {
            const cageCellValues: string[] = cage.cells.map((idx) => {
              const r = Math.floor(idx / size);
              const c = idx % size;
              return gridValues[r][c];
            });

            // Check if cage is full
            if (cageCellValues.every((val) => val !== "")) {
              const cageNumbers = cageCellValues.map((val) =>
                parseInt(val, 10)
              );
              let result: number;
              let cageValid = true;
              switch (cage.operation) {
                case "+":
                  result = cageNumbers.reduce((sum, val) => sum + val, 0);
                  break;
                case "*":
                  result = cageNumbers.reduce((prod, val) => prod * val, 1);
                  break;
                case "-":
                  if (cageNumbers.length !== 2) cageValid = false;
                  else result = Math.abs(cageNumbers[0] - cageNumbers[1]);
                  break;
                case "/":
                  if (cageNumbers.length !== 2) cageValid = false;
                  else {
                    const maxVal = Math.max(cageNumbers[0], cageNumbers[1]);
                    const minVal = Math.min(cageNumbers[0], cageNumbers[1]);
                    if (minVal === 0 || maxVal % minVal !== 0)
                      cageValid = false;
                    else result = maxVal / minVal;
                  }
                  break;
                case "=":
                  if (cageNumbers.length !== 1) cageValid = false;
                  else result = cageNumbers[0];
                  break;
                default:
                  cageValid = false;
              }
              // @ts-ignore - result might not be assigned if cageValid is false early
              if (cageValid && result !== cage.value) {
                errors.add(cellIndex); // Mark current cell as error if cage is wrong
                // Optionally mark all cells in the cage?
                // cage.cells.forEach(idx => errors.add(idx));
              }
            }
          }
        }

        if (errors.size > 0) {
          console.log(`Error found in cell [${rowIndex}, ${colIndex}]`);
          setErrorCells(errors);
        } else {
          console.log(`Cell [${rowIndex}, ${colIndex}] seems correct.`);
          // Optionally show a success message?
        }
      } else {
        console.log("Could not get row/col from focused element dataset");
      }
    } else {
      console.log("No valid cell input focused for check.");
      // Optionally show a small message to the user?
    }
  };

  const handleCheckPuzzle = () => {
    clearErrors();
    console.log("Checking entire puzzle...");
    const { size, cages } = puzzleDefinition;
    const errors = new Set<number>();

    // Convert to numbers, identify empty cells (can't check those for correctness)
    const numberGrid: (number | null)[][] = Array(size)
      .fill(0)
      .map(() => Array(size).fill(null));
    const filledCells = new Map<number, number>(); // cellIndex -> value

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (gridValues[r][c] !== "") {
          const num = parseInt(gridValues[r][c], 10);
          if (!isNaN(num) && num >= 1 && num <= size) {
            numberGrid[r][c] = num;
            filledCells.set(r * size + c, num);
          } else {
            // This case should technically not happen due to input validation
            errors.add(r * size + c); // Mark as error if invalid content exists
          }
        }
      }
    }

    // === NEW: Check against solution ===
    filledCells.forEach((value, cellIndex) => {
      const r = Math.floor(cellIndex / size);
      const c = cellIndex % size;
      if (value !== solution[r][c]) {
        errors.add(cellIndex);
      }
    });
    // ===================================

    // Keep existing checks for rule violations

    // 1. Check Row/Column Uniqueness for filled cells
    for (let r = 0; r < size; r++) {
      const rowCounts = new Map<number, number[]>(); // value -> [colIndices]
      const colCounts = new Map<number, number[]>(); // value -> [rowIndices]
      for (let c = 0; c < size; c++) {
        // Row check
        const rowVal = numberGrid[r][c];
        if (rowVal !== null) {
          const indices = rowCounts.get(rowVal) || [];
          indices.push(c);
          rowCounts.set(rowVal, indices);
        }
        // Col check
        const colVal = numberGrid[c][r]; // Check col r by iterating rows c
        if (colVal !== null) {
          const indices = colCounts.get(colVal) || [];
          indices.push(c);
          colCounts.set(colVal, indices);
        }
      }
      // Mark duplicates in rows
      rowCounts.forEach((indices) => {
        if (indices.length > 1) {
          indices.forEach((colIdx) => errors.add(r * size + colIdx));
        }
      });
      // Mark duplicates in columns
      colCounts.forEach((indices) => {
        if (indices.length > 1) {
          indices.forEach((rowIdx) => errors.add(rowIdx * size + r));
        }
      });
    }

    // 2. Check Cage Constraints (only if cage is full)
    for (const cage of cages) {
      const cageCellValues: (number | null)[] = cage.cells.map((idx) => {
        const r = Math.floor(idx / size);
        const c = idx % size;
        return numberGrid[r][c];
      });

      // Check if cage is full
      if (cageCellValues.every((val) => val !== null)) {
        const cageNumbers = cageCellValues as number[]; // We know they aren't null now
        let result: number;
        let cageValid = true;
        switch (cage.operation) {
          case "+":
            result = cageNumbers.reduce((sum, val) => sum + val, 0);
            break;
          case "*":
            result = cageNumbers.reduce((prod, val) => prod * val, 1);
            break;
          case "-":
            if (cageNumbers.length !== 2) cageValid = false;
            else result = Math.abs(cageNumbers[0] - cageNumbers[1]);
            break;
          case "/":
            if (cageNumbers.length !== 2) cageValid = false;
            else {
              const maxVal = Math.max(cageNumbers[0], cageNumbers[1]);
              const minVal = Math.min(cageNumbers[0], cageNumbers[1]);
              if (minVal === 0 || maxVal % minVal !== 0) cageValid = false;
              else result = maxVal / minVal;
            }
            break;
          case "=":
            if (cageNumbers.length !== 1) cageValid = false;
            else result = cageNumbers[0];
            break;
          default:
            cageValid = false;
        }
        // @ts-ignore - result might not be assigned if cageValid is false early
        if (cageValid && result !== cage.value) {
          // Mark all cells in the invalid cage as errors
          cage.cells.forEach((idx) => errors.add(idx));
        }
      }
    }

    if (errors.size > 0) {
      console.log(`Found ${errors.size} errors in puzzle.`);
      setErrorCells(errors);
    } else {
      console.log("No errors found in the puzzle!");
      // Optionally show a success message?
    }
  };
  // --------------------

  // --- Cell Click Handler ---
  const handleCellClick = (
    event: React.MouseEvent<HTMLDivElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    const cellKey = `${rowIndex}-${colIndex}`;
    const isShift = event.shiftKey;

    if (isShift && isPencilMode) {
      // Shift + Click in Pencil Mode: Toggle selection for this cell
      setSelectedCells((prevSelected) => {
        const newSelected = new Set(prevSelected);
        if (newSelected.has(cellKey)) {
          // Don't allow deselecting the *only* selected cell via Shift+Click
          if (newSelected.size > 1) {
            newSelected.delete(cellKey);
            // If we remove the last focused cell, update lastFocusedCell
            if (
              lastFocusedCell.current?.row === rowIndex &&
              lastFocusedCell.current?.col === colIndex
            ) {
              // Find another selected cell to be the 'last focused'
              // Point to the most recently added *remaining* cell if possible, else the first.
              const remainingCells = Array.from(newSelected);
              // This logic tries to find a suitable cell but might need refinement based on desired UX
              const lastRemaining = remainingCells[remainingCells.length - 1];
              if (lastRemaining) {
                const [r, c] = lastRemaining.split("-").map(Number);
                lastFocusedCell.current = { row: r, col: c };
              } else {
                // This case shouldn't happen due to the size > 1 check, but set fallback
                lastFocusedCell.current = null; // Or revert to clicked cell?
              }
            }
          }
        } else {
          newSelected.add(cellKey);
          // Keep track of the most recently *added* cell via shift-click
          lastFocusedCell.current = { row: rowIndex, col: colIndex };
        }

        // Focus the input of the last interacted cell (the one just clicked or remaining)
        const focusTarget = lastFocusedCell.current;
        if (focusTarget) {
          const targetInputRef =
            inputRefs.current?.[focusTarget.row]?.[focusTarget.col];
          if (targetInputRef) {
            // Use setTimeout to ensure focus happens after state update and potential re-render
            setTimeout(() => targetInputRef.focus(), 0);
          }
        }
        // If newSelected somehow became empty (shouldn't happen), revert to single selection
        return newSelected.size > 0 ? newSelected : new Set([cellKey]);
      });
    } else {
      // Normal Click (or Shift+Click when not in pencil mode): Select only this cell
      setSelectedCells(new Set([cellKey]));
      lastFocusedCell.current = { row: rowIndex, col: colIndex };
      // Explicitly focus the input associated with this cell
      const targetInputRef = inputRefs.current?.[rowIndex]?.[colIndex];
      if (targetInputRef) {
        // Use setTimeout here too for consistency and reliability
        setTimeout(() => targetInputRef.focus(), 0);
      }
    }

    clearErrors();
  };
  // -------------------------

  // Inline style for dotted background SVG
  const dottedBgStyle: React.CSSProperties = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23e0e0e0'/%3E%3C/svg%3E")`,
    backgroundRepeat: "repeat",
  };

  return (
    <Stack align="center" gap="xl" w="100%">
      <Box
        className="kenken-grid"
        style={{
          gridTemplateColumns: `repeat(${size}, 65px)`,
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        }}
      >
        {gridValues.map((row, rowIndex) =>
          row.map((cellValue, colIndex) => {
            const cageInfo = getCageInfo(rowIndex, colIndex);
            const currentPencilMarks =
              pencilMarks[rowIndex]?.[colIndex] ?? new Set();
            const hasValue = cellValue !== "";
            const pencilGridSizeClass = size <= 4 ? "size-2x2" : "size-3x3";
            const cellIndex = rowIndex * size + colIndex;
            const cellKey = `${rowIndex}-${colIndex}`;
            const isSelected = selectedCells.has(cellKey);
            const isFlashing = flashingCells.has(cellKey);

            // Find the cage this cell belongs to for color assignment
            const cageIndex = puzzleDefinition.cages.findIndex((c) =>
              c.cells.includes(cellIndex)
            );
            const bgColorClass = getCageColorClass(cageIndex);

            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`kenken-cell relative ${bgColorClass} ${getBorderClasses(
                  rowIndex,
                  colIndex
                )} ${isSelected ? "selected-cell" : ""} ${
                  errorCells.has(cellIndex) ? "error-cell" : ""
                }`}
                onClick={(e) => handleCellClick(e, rowIndex, colIndex)}
              >
                {/* Display Cage Info */}
                {cageInfo && (
                  <div className="cage-info">
                    {isTimerRunning || isGameWon ? cageInfo.text : ""}
                  </div>
                )}
                {/* Input Cell Container */}
                <div className="cell-input-container">
                  <input
                    ref={(el) => {
                      if (!inputRefs.current[rowIndex]) {
                        inputRefs.current[rowIndex] = [];
                      }
                      inputRefs.current[rowIndex][colIndex] = el;
                    }}
                    type="text"
                    value={gridValues[rowIndex][colIndex]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      handleInputChange(rowIndex, colIndex, e.target.value);
                    }}
                    onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                      clearErrors();
                      e.target.select();
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      handleKeyDown(e, rowIndex, colIndex);
                    }}
                    style={{
                      color:
                        isTimerRunning || isGameWon ? "inherit" : "transparent",
                    }}
                    className={`cell-input ${
                      errorCells.has(cellIndex) ? "input-error" : ""
                    } ${isFlashing ? "cell-flash-invalid" : ""}`}
                    maxLength={1}
                    data-row={rowIndex}
                    data-col={colIndex}
                    tabIndex={-1}
                  />
                  {/* Render Pencil Marks */}
                  {(isTimerRunning || isGameWon) &&
                    !hasValue &&
                    currentPencilMarks.size > 0 && (
                      <div className="pencil-marks-container overlay">
                        <div
                          className={`pencil-marks-grid ${pencilGridSizeClass}`}
                        >
                          {Array.from({ length: size }, (_, i) => i + 1).map(
                            (num) => (
                              <div key={num} className="pencil-mark">
                                {currentPencilMarks.has(String(num))
                                  ? String(num)
                                  : ""}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })
        )}
      </Box>

      {/* Enhanced Bottom Controls Area */}
      <Group justify="center" gap="md">
        {/* Pencil Mode Toggle */}
        <Tooltip
          label={`Toggle pencil mode (${isPencilMode ? "On" : "Off"})`}
          position="bottom"
        >
          <Box style={{ position: "relative" }}>
            <ActionIcon
              onClick={() => setIsPencilMode(!isPencilMode)}
              size={rem(40)}
              radius="xl"
              variant={isPencilMode ? "gradient" : "filled"}
              gradient={
                isPencilMode ? { from: "blue", to: "indigo" } : undefined
              }
              color={isPencilMode ? undefined : "gray"}
              style={{
                transition: "all 300ms ease",
                transform: "scale(1)",
                boxShadow: isPencilMode
                  ? "0 15px 30px -8px rgba(59, 130, 246, 0.3)"
                  : "0 15px 30px -8px rgba(0, 0, 0, 0.25)",
                "&:hover": {
                  transform: "scale(1.1)",
                },
              }}
            >
              <IconPencil size="1.2rem" />
            </ActionIcon>
            {/* Active indicator */}
            {isPencilMode && (
              <Box
                style={{
                  position: "absolute",
                  top: rem(-4),
                  right: rem(-4),
                  width: rem(12),
                  height: rem(12),
                  backgroundColor: "#10b981",
                  borderRadius: "50%",
                  border: "3px solid white",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                }}
                className="animate-pulse"
              />
            )}
          </Box>
        </Tooltip>

        {/* Check Puzzle Button */}
        <Tooltip
          label="Check the entire puzzle for correctness"
          position="bottom"
        >
          <ActionIcon
            onClick={handleCheckPuzzle}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={{ from: "teal", to: "green" }}
            style={{
              transition: "all 300ms ease",
              transform: "scale(1)",
              boxShadow: "0 15px 30px -8px rgba(16, 185, 129, 0.3)",
              "&:hover": {
                transform: "scale(1.1)",
              },
            }}
          >
            <IconCheck size="1.2rem" />
          </ActionIcon>
        </Tooltip>

        {/* Undo Button */}
        <Tooltip label="Undo last action" position="bottom">
          <ActionIcon
            onClick={handleUndo}
            disabled={history.length === 0}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={{ from: "yellow", to: "orange" }}
            style={{
              transition: "all 300ms ease",
              transform: "scale(1)",
              boxShadow:
                history.length > 0
                  ? "0 15px 30px -8px rgba(251, 191, 36, 0.3)"
                  : "0 15px 30px -8px rgba(0, 0, 0, 0.25)",
              opacity: history.length === 0 ? 0.5 : 1,
              "&:hover": {
                transform: history.length > 0 ? "scale(1.1)" : "scale(1)",
              },
            }}
          >
            <IconArrowBackUp size="1.2rem" />
          </ActionIcon>
        </Tooltip>

        {/* Redo Button */}
        <Tooltip label="Redo last undone action" position="bottom">
          <ActionIcon
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            size={rem(40)}
            radius="xl"
            variant="gradient"
            gradient={{ from: "indigo", to: "purple" }}
            style={{
              transition: "all 300ms ease",
              transform: "scale(1)",
              boxShadow:
                redoStack.length > 0
                  ? "0 15px 30px -8px rgba(99, 102, 241, 0.3)"
                  : "0 15px 30px -8px rgba(0, 0, 0, 0.25)",
              opacity: redoStack.length === 0 ? 0.5 : 1,
              "&:hover": {
                transform: redoStack.length > 0 ? "scale(1.1)" : "scale(1)",
              },
            }}
          >
            <IconArrowForwardUp size="1.2rem" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  );
};

export default KenkenGrid;
