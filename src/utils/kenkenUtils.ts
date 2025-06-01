/**
 * Utility functions for KenKen puzzle game.
 *
 * This file contains helper functions for:
 * - Cage color assignment and management
 * - Puzzle validation and win condition checking
 * - UI helper functions for borders, styling, and cage information display
 * - Mathematical operations for cage constraint validation
 */

import { Cage, PuzzleDefinition } from "../types/KenkenTypes";

/**
 * Generates an optimized color assignment for puzzle cages.
 *
 * Uses a graph coloring algorithm to ensure adjacent cages have different colors
 * while avoiding similar color combinations that could be confusing to users.
 *
 * @param puzzleDefinition - The complete puzzle definition
 * @returns Map from cage index to color index (0-11)
 */
export const generateCageColorMap = (
  puzzleDefinition: PuzzleDefinition
): Map<number, number> => {
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
};

/**
 * Gets the CSS class name for a cage's background color.
 *
 * @param cageIndex - Index of the cage in the puzzle definition
 * @param cageColorMap - Map from cage index to color index
 * @returns CSS class name for the cage color
 */
export const getCageColorClass = (
  cageIndex: number,
  cageColorMap: Map<number, number>
): string => {
  return `cage-color-${cageColorMap.get(cageIndex) || 0}`;
};

/**
 * Gets the CSS class name for a cage's text color that complements the background.
 *
 * @param cageIndex - Index of the cage in the puzzle definition
 * @param cageColorMap - Map from cage index to color index
 * @returns CSS class name for the cage text color
 */
export const getCageTextColorClass = (
  cageIndex: number,
  cageColorMap: Map<number, number>
): string => {
  return `cage-text-color-${cageColorMap.get(cageIndex) || 0}`;
};

/**
 * Determines border classes for a cell based on cage boundaries.
 *
 * Adds faint borders around the exterior edges of cages to help visually
 * distinguish them while maintaining the clean design.
 *
 * @param rowIndex - Row index of the cell
 * @param colIndex - Column index of the cell
 * @param puzzleDefinition - The complete puzzle definition
 * @returns CSS classes for cage borders
 */
export const getBorderClasses = (
  rowIndex: number,
  colIndex: number,
  puzzleDefinition: PuzzleDefinition
): string => {
  if (!puzzleDefinition) return "";

  const { size, cages } = puzzleDefinition;
  const cellIndex = rowIndex * size + colIndex;

  // Find which cage this cell belongs to
  const currentCage = cages.find((cage) => cage.cells.includes(cellIndex));
  if (!currentCage) return "";

  const borders = [];

  // Check each direction for cage boundaries
  const directions = [
    { direction: "top", dr: -1, dc: 0, class: "cage-border-top" },
    { direction: "right", dr: 0, dc: 1, class: "cage-border-right" },
    { direction: "bottom", dr: 1, dc: 0, class: "cage-border-bottom" },
    { direction: "left", dr: 0, dc: -1, class: "cage-border-left" },
  ];

  for (const { dr, dc, class: borderClass } of directions) {
    const neighborRow = rowIndex + dr;
    const neighborCol = colIndex + dc;

    // If we're at the grid edge, or the neighbor is in a different cage,
    // add a border on this side
    if (
      neighborRow < 0 ||
      neighborRow >= size ||
      neighborCol < 0 ||
      neighborCol >= size
    ) {
      // At grid edge - add border
      borders.push(borderClass);
    } else {
      const neighborCellIndex = neighborRow * size + neighborCol;
      const neighborCage = cages.find((cage) =>
        cage.cells.includes(neighborCellIndex)
      );

      // If neighbor is in different cage, add border
      if (!neighborCage || neighborCage !== currentCage) {
        borders.push(borderClass);
      }
    }
  }

  return borders.join(" ");
};

/**
 * Extracts cage information for display in a cell.
 *
 * Only returns cage info for the top-leftmost cell of each cage,
 * where the cage's target value and operation should be displayed.
 *
 * @param rowIndex - Row index of the cell
 * @param colIndex - Column index of the cell
 * @param puzzleDefinition - The complete puzzle definition
 * @returns Cage display information or null if not a display cell
 */
export const getCageInfo = (
  rowIndex: number,
  colIndex: number,
  puzzleDefinition: PuzzleDefinition
): { text: string; position: string } | null => {
  const cellIndex = rowIndex * puzzleDefinition.size + colIndex;
  const cage = puzzleDefinition.cages.find((c) => c.cells.includes(cellIndex));
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

/**
 * Validates if a grid satisfies all KenKen puzzle constraints.
 *
 * Checks three main requirements:
 * 1. All cells are filled with valid numbers (1 to size)
 * 2. Latin Square rule: no duplicates in rows or columns
 * 3. Cage constraints: each cage's operation produces the target value
 *
 * @param gridValues - Current state of the puzzle grid
 * @param puzzleDefinition - The puzzle constraints
 * @returns true if the puzzle is completely and correctly solved
 */
export const checkWinCondition = (
  gridValues: string[][],
  puzzleDefinition: PuzzleDefinition
): boolean => {
  if (!puzzleDefinition) return false;
  const { size, cages } = puzzleDefinition;

  // Removed verbose logging for cleaner console output

  // 1. Check if all cells are filled and convert to numbers
  const numberGrid: number[][] = Array(size)
    .fill(0)
    .map(() => Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (gridValues[r][c] === "") {
        // Cell is empty, puzzle not complete
        return false; // Not all cells are filled
      }
      const num = parseInt(gridValues[r][c], 10);
      if (isNaN(num) || num < 1 || num > size) {
        // Invalid number found
        return false; // Invalid number found
      }
      numberGrid[r][c] = num;
    }
  }

  // 2. Check Latin Square rule (rows and columns)
  // Check Latin Square rule (rows and columns)
  for (let i = 0; i < size; i++) {
    const rowSet = new Set<number>();
    const colSet = new Set<number>();
    for (let j = 0; j < size; j++) {
      rowSet.add(numberGrid[i][j]); // Check row i
      colSet.add(numberGrid[j][i]); // Check column i
    }
    if (rowSet.size !== size || colSet.size !== size) {
      // Latin Square rule violated: duplicate numbers in row or column
      return false; // Duplicate number in row or column
    }
  }

  // 3. Check Cage Constraints
  // Check cage constraints
  for (const cage of cages) {
    const cageValues: number[] = cage.cells.map((cellIndex) => {
      const r = Math.floor(cellIndex / size);
      const c = cellIndex % size;
      return numberGrid[r][c];
    });

    if (!validateCageConstraint(cage, cageValues)) {
      // Cage constraint failed - log for debugging
      console.log(
        `Cage constraint failed: operation="${cage.operation}", target=${
          cage.value
        }, values=[${cageValues.join(", ")}]`
      );
      return false;
    }
  }

  // All checks passed!
  console.log("Win condition met!");
  return true;
};

/**
 * Validates if a set of values satisfies a cage's mathematical constraint.
 *
 * @param cage - The cage definition with operation and target value
 * @param cageValues - Array of numbers currently in the cage
 * @returns true if the cage constraint is satisfied
 */
export const validateCageConstraint = (
  cage: Cage,
  cageValues: number[]
): boolean => {
  let result: number;

  switch (cage.operation) {
    case "+":
      result = cageValues.reduce((sum, val) => sum + val, 0);
      break;
    case "*":
      result = cageValues.reduce((prod, val) => prod * val, 1);
      break;
    case "-": // Assumes exactly two cells
      if (cageValues.length !== 2) return false;
      result = Math.abs(cageValues[0] - cageValues[1]);
      break;
    case "/": // Assumes exactly two cells
      if (cageValues.length !== 2) return false;
      const maxVal = Math.max(cageValues[0], cageValues[1]);
      const minVal = Math.min(cageValues[0], cageValues[1]);
      if (minVal === 0 || maxVal % minVal !== 0) return false;
      result = maxVal / minVal;
      break;
    case "=": // Single cell cage with explicit equals
    case "": // Single cell cage with empty operation
      if (cageValues.length !== 1) return false;
      result = cageValues[0];
      break;
    default:
      return false; // Unknown operation
  }

  return result === cage.value;
};

/**
 * Finds all cells that conflict with a given value in a specific position.
 *
 * Used for validation and error highlighting. Checks row, column, and
 * potentially other game-specific constraints.
 *
 * @param rowIndex - Row of the cell to check
 * @param colIndex - Column of the cell to check
 * @param value - The value to check for conflicts
 * @param gridValues - Current state of the grid
 * @param gridSize - Size of the grid
 * @returns Array of conflicting cell keys in "row-col" format
 */
export const findConflictingCells = (
  rowIndex: number,
  colIndex: number,
  value: string,
  gridValues: string[][],
  gridSize: number
): string[] => {
  const conflicts: string[] = [];

  // Check row for conflicts
  for (let c = 0; c < gridSize; c++) {
    if (c !== colIndex && gridValues[rowIndex][c] === value) {
      conflicts.push(`${rowIndex}-${c}`);
    }
  }

  // Check column for conflicts
  for (let r = 0; r < gridSize; r++) {
    if (r !== rowIndex && gridValues[r][colIndex] === value) {
      conflicts.push(`${r}-${colIndex}`);
    }
  }

  return conflicts;
};
