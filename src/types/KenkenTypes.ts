/**
 * Type definitions for the KenKen puzzle game.
 *
 * This file contains all the core types used throughout the KenKen application,
 * including puzzle structure, game state, and component props.
 */

/**
 * Represents a cage in the KenKen puzzle.
 * A cage is a group of cells that must satisfy a mathematical operation.
 */
export type Cage = {
  /** The target value that the operation should produce */
  value: number;
  /** The mathematical operation (+, -, *, /, =) */
  operation: string;
  /** Array of cell indices (row * size + col) that belong to this cage */
  cells: number[];
};

/**
 * Complete definition of a KenKen puzzle.
 * Contains the grid size and all the cages that define the constraints.
 */
export type PuzzleDefinition = {
  /** The size of the grid (e.g., 6 for a 6x6 puzzle) */
  size: number;
  /** Array of all cages in the puzzle */
  cages: Cage[];
  /** Number of operations required to solve this puzzle (measure of difficulty) */
  difficulty_operations?: number;
};

/**
 * Props for the main KenkenGrid component.
 * Defines the interface between the game container and the grid component.
 */
export type KenkenGridProps = {
  /** The puzzle definition containing size and cages */
  puzzleDefinition: PuzzleDefinition;
  /** The correct solution grid for validation */
  solution: number[][];
  /** Callback function called when the puzzle is successfully solved */
  onWin: () => void;
  /** Whether the game timer is currently running */
  isTimerRunning: boolean;
  /** Whether the game has been won */
  isGameWon: boolean;
  /** Initial grid values for restoring saved state */
  initialGridValues?: string[][];
  /** Initial pencil marks for restoring saved state */
  initialPencilMarks?: Set<string>[][];
  /** Callback for when grid state changes (for persistence) */
  onStateChange?: (gridValues: string[][], pencilMarks: Set<string>[][]) => void;
  /** Callback for when a checkpoint is requested from the parent */
  onCheckpointRequested?: (gridValues: string[][], pencilMarks: Set<string>[][]) => void;
  /** Whether a checkpoint exists */
  hasCheckpoint?: boolean;
  /** Handler for creating/clearing checkpoint */
  onCreateCheckpoint?: () => void;
  /** Handler for reverting to checkpoint */
  onRevertToCheckpoint?: () => void;
};

/**
 * Represents a snapshot of the game state for undo/redo functionality.
 * Stores both the main grid values and the pencil marks for each cell.
 */
export type HistoryEntry = [string[][], Set<string>[][]];

/**
 * Represents the coordinates of a single cell in the grid.
 * Used for tracking focus and selection state.
 */
export type CellCoord = {
  /** Zero-based row index */
  row: number;
  /** Zero-based column index */
  col: number;
};

/**
 * Props for the individual KenkenCell component.
 * Contains all the data and handlers needed to render and interact with a single cell.
 */
export type KenkenCellProps = {
  /** Zero-based row index of this cell */
  rowIndex: number;
  /** Zero-based column index of this cell */
  colIndex: number;
  /** Current value in this cell (empty string if no value) */
  cellValue: string;
  /** Set of pencil mark values for this cell */
  pencilMarks: Set<string>;
  /** The size of the grid (needed for pencil mark layout) */
  gridSize: number;
  /** Whether this cell is currently selected */
  isSelected: boolean;
  /** Whether this cell should flash (for error indication) */
  isFlashing: boolean;
  /** Whether this cell has an error */
  hasError: boolean;
  /** CSS class for the cage background color */
  cageColorClass: string;
  /** CSS class for the cage text color */
  cageTextColorClass: string;
  /** CSS classes for borders */
  borderClasses: string;
  /** Information about the cage (if this is the display cell) */
  cageInfo: { text: string; position: string } | null;
  /** Whether the timer is running (affects visibility) */
  isTimerRunning: boolean;
  /** Whether the game is won (affects visibility) */
  isGameWon: boolean;
  /** Ref callback for the input element */
  inputRef: (el: HTMLInputElement | null) => void;
  /** Handler for value changes */
  onValueChange: (value: string) => void;
  /** Handler for focus events */
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Handler for key events */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Handler for cell clicks */
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
};

/**
 * Props for the KenkenControls component.
 * Contains all the control state and handlers for the bottom control panel.
 */
export type KenkenControlsProps = {
  /** Whether pencil mode is currently active */
  isPencilMode: boolean;
  /** Handler to toggle pencil mode */
  onTogglePencilMode: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Handler for undo action */
  onUndo: () => void;
  /** Whether redo is available */
  canRedo: boolean;
  /** Handler for redo action */
  onRedo: () => void;
  /** Handler for checking a single cell */
  onCheckCell: () => void;
  /** Handler for checking the entire puzzle */
  onCheckPuzzle: () => void;
  /** Whether a checkpoint exists */
  hasCheckpoint?: boolean;
  /** Handler for creating/clearing checkpoint */
  onCreateCheckpoint?: () => void;
  /** Handler for reverting to checkpoint */
  onRevertToCheckpoint?: () => void;
};
