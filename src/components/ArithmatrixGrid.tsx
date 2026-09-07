/**
 * ArithmatrixGrid Component
 *
 * Main component for rendering and managing a Arithmatrix puzzle grid.
 * This refactored version delegates most logic to custom hooks and sub-components
 * for better maintainability and testability.
 *
 * Key Features:
 * - Modular architecture with separated concerns
 * - Custom hook for game state management
 * - Reusable cell and control components
 * - Optimized cage color assignment
 * - Comprehensive keyboard and mouse interactions
 * - Undo/redo functionality with history tracking
 * - Multi-cell selection and pencil mark support
 */

import React, { useEffect, useMemo, useState, useImperativeHandle, forwardRef } from 'react';
import { Box, Stack } from '@mantine/core';
import './ArithmatrixGrid.css'; // Essential for grid styling and layout
import MobileNumberPad from './MobileNumberPad';
import HintPanel from './HintPanel';
import { Hint, computeHint } from '../utils/hints';

/*
 * Flat geometry, identical at every breakpoint: cells butt up against each
 * other and are separated only by the 1px grid background showing through the
 * gap, which forms the hairline lattice. The grid itself needs no padding.
 * Kept in sync with ArithmatrixGrid.css.
 */
const LATTICE_GAP = 1;
const GRID_PADDING = 0;

// Page margin outside the grid. Phones give up nearly all of it so a 7x7 still
// clears the 44px touch-target floor on a 320px screen.
const OUTER_MARGIN = { MOBILE: 4, DESKTOP: 32 };

// Largest cell we draw, so the desktop grid doesn't sprawl
const MAX_CELL_SIZE = 80;

// Vertical space reserved at the top of every cell for the cage target badge.
// Pencil marks start below this, and it is uniform across cells so the pencil
// digits line up from cell to cell even though only one cell per cage has a
// badge. Tracks the .cage-info type scale in the stylesheet.
const CAGE_BADGE_INSET = { MOBILE: 12, DESKTOP: 17 };

// Type imports
import { ArithmatrixGridProps } from '../types/ArithmatrixTypes';

// Component imports
import ArithmatrixCell from './ArithmatrixCell';
import ArithmatrixControls from './ArithmatrixControls';

// Hook and utility imports
import { useArithmatrixGame } from '../hooks/useArithmatrixGame';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import {
  generateCageColorMap,
  getCageColorClass,
  getCageTextColorClass,
  getBorderClasses,
  getCageInfo,
} from '../utils/arithmatrixUtils';

// Define the methods that will be exposed via ref
interface ArithmatrixGridHandle {
  createCheckpoint: () => void;
  revertToCheckpoint: (gridValues: string[][], pencilMarks: Set<string>[][]) => void;
}

const ArithmatrixGrid = forwardRef<ArithmatrixGridHandle, ArithmatrixGridProps>(
  (
    {
      puzzleDefinition,
      solution,
      onWin,
      isTimerRunning,
      isGameWon,
      initialGridValues,
      initialPencilMarks,
      onStateChange,
      onCheckpointRequested,
      hasCheckpoint,
      onCreateCheckpoint,
      onRevertToCheckpoint,
      onClearCheckpoint,
      timerElement,
      onReset,
      onNewGame,
      onInstall,
      onShowAchievements,
    },
    ref
  ) => {
    const { size } = puzzleDefinition;
    const layout = useResponsiveLayout();

    // Show mobile UI only for small screens (not based on touch capability)
    // This ensures touchscreen laptops get the full desktop UI
    const isMobile = layout.width <= 768;

    // Use our custom hook for all game logic
    const gameState = useArithmatrixGame({
      puzzleDefinition,
      solution,
      onWin,
      isTimerRunning,
      isGameWon,
      initialGridValues,
      initialPencilMarks,
      onStateChange,
    });

    // Expose methods to parent component via ref
    useImperativeHandle(
      ref,
      () => ({
        createCheckpoint: () => {
          if (onCheckpointRequested) {
            onCheckpointRequested(gameState.gridValues, gameState.pencilMarks);
          }
        },
        revertToCheckpoint: (gridValues: string[][], pencilMarks: Set<string>[][]) => {
          gameState.revertToState(gridValues, pencilMarks);
        },
      }),
      [gameState, onCheckpointRequested]
    );

    // Memoized cage color assignment
    const cageColorMap = useMemo(() => {
      return generateCageColorMap(puzzleDefinition);
    }, [puzzleDefinition]);

    /*
     * Hints are held here rather than in the game hook: they are a view of the
     * position, not part of it, and they must not land in the undo history.
     */
    const [hint, setHint] = useState<Hint | null>(null);
    const [hintLevel, setHintLevel] = useState(0);

    const requestHint = () => {
      if (hint) {
        // Already showing one - asking again means "tell me more"
        setHintLevel(level => Math.min(level + 1, hint.levels.length - 1));
        return;
      }
      // The player's marks are part of the position: without them the hint
      // would re-suggest eliminations they have already made and written down.
      setHint(computeHint(puzzleDefinition, gameState.gridValues, gameState.pencilMarks, solution));
      setHintLevel(0);
    };

    // A hint describes one position; once the board moves on - values or marks
    // - it is stale.
    useEffect(() => {
      setHint(null);
      setHintLevel(0);
    }, [gameState.gridValues, gameState.pencilMarks]);

    const hintLevelCells = hint?.levels[Math.min(hintLevel, hint.levels.length - 1)];
    const hintTargets = new Set(
      (hintLevelCells?.targetCells ?? []).map(cell => `${cell.row}-${cell.col}`)
    );
    const hintSupport = new Set(
      (hintLevelCells?.supportCells ?? []).map(cell => `${cell.row}-${cell.col}`)
    );

    // Handlers for mobile number pad
    const handleMobileNumberSelect = (num: number) => {
      if (gameState.isPencilMode) {
        // In pencil mode, toggle the pencil mark for all selected cells
        // Don't clear selection - the flag will start fresh on next click
        gameState.handlePencilMarkInput(num);
      } else {
        // In normal mode, enter the number in all selected cells
        gameState.selectedCells.forEach(cellKey => {
          const [rowIndex, colIndex] = cellKey.split('-').map(Number);
          gameState.handleDirectNumberInput(rowIndex, colIndex, num);
        });
        // Clear selection after entering number (cell is now filled)
        gameState.setSelectedCells(new Set());
      }
    };

    const handleMobileClear = () => {
      gameState.handleCellDeletion();
    };

    const handleMobileTogglePencilMode = () => {
      gameState.setIsPencilMode(!gameState.isPencilMode);
    };

    // Shift+click on a cage's answer pill adds every cell in that cage to the current
    // selection (existing selection is preserved). A plain click is left to bubble to
    // the underlying cell's normal handler.
    const handleCageInfoClick = (e: React.MouseEvent<HTMLDivElement>, cellIndex: number) => {
      if (!e.shiftKey) return;
      const cage = puzzleDefinition.cages.find(c => c.cells.includes(cellIndex));
      if (!cage) return;
      e.stopPropagation();
      e.preventDefault();
      const cageCellKeys = cage.cells.map(idx => `${Math.floor(idx / size)}-${idx % size}`);
      gameState.setSelectedCells(prev => {
        const next = new Set(prev);
        cageCellKeys.forEach(k => next.add(k));
        return next;
      });
      // Match regular shift+click behavior: enter temporary pencil mode so
      // the next number key produces a pencil mark across the whole selection
      // rather than placing a value in just the focused cell.
      gameState.enterTemporaryPencilMode();
      // Focus one of the cage's cells so subsequent keystrokes reach the cell
      // input handler (which routes pencil-mark input to every selected cell).
      const focusRow = Math.floor(cellIndex / size);
      const focusCol = cellIndex % size;
      setTimeout(() => {
        gameState.inputRefs.current?.[focusRow]?.[focusCol]?.focus();
      }, 0);
    };

    // Custom cell click handler for mobile that accumulates selection in pencil mode
    const handleMobileCellClick = (
      e: React.MouseEvent<HTMLDivElement> | undefined,
      rowIndex: number,
      colIndex: number
    ) => {
      const cellKey = `${rowIndex}-${colIndex}`;

      if (isMobile && gameState.isPencilMode) {
        // In mobile pencil mode, accumulate selections BUT start fresh after entering a value
        gameState.setSelectedCells(prev => {
          // If values were entered since last selection, start fresh
          if (gameState.hasEnteredValueSinceSelection) {
            gameState.setHasEnteredValueSinceSelection(false);
            return new Set([cellKey]);
          }
          // Otherwise accumulate (toggle cell in selection)
          const newSet = new Set(prev);
          if (newSet.has(cellKey)) {
            newSet.delete(cellKey);
          } else {
            newSet.add(cellKey);
          }
          return newSet;
        });
        // Focus the cell
        gameState.inputRefs.current?.[rowIndex]?.[colIndex]?.focus();
      } else {
        // Default behavior for non-mobile or non-pencil mode
        gameState.handleCellClick(e, rowIndex, colIndex);
      }
    };

    // Global keyboard event listeners for undo/redo and secret shortcut
    useEffect(() => {
      const handleGlobalKeyDown = (event: KeyboardEvent) => {
        // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            gameState.handleRedo();
          } else {
            gameState.handleUndo();
          }
        }
        // Check for Cmd+Y (Mac) or Ctrl+Y (Windows/Linux) - alternative for Redo
        else if ((event.metaKey || event.ctrlKey) && event.key === 'y') {
          event.preventDefault();
          gameState.handleRedo();
        }
        // Development only: Shift + ` solves all but one square. Never shipped -
        // it would hand players the answer.
        else if (import.meta.env.DEV && event.shiftKey && event.key === '`') {
          event.preventDefault();
          gameState.handleSecretShortcut();
        }
      };

      window.addEventListener('keydown', handleGlobalKeyDown);

      return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }, [gameState]);

    // Key handler for cell interactions
    const handleKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      rowIndex: number,
      colIndex: number
    ) => {
      const key = e.key;
      const numberPressed = /^[1-9]$/.test(key) ? parseInt(key, 10) : NaN;

      // Handle pencil mark input
      if (
        !isNaN(numberPressed) &&
        numberPressed >= 1 &&
        numberPressed <= size &&
        gameState.isPencilMode
      ) {
        e.preventDefault();
        gameState.handlePencilMarkInput(numberPressed);

        // Refocus the input cell after handling pencil mark
        setTimeout(() => {
          gameState.inputRefs.current?.[rowIndex]?.[colIndex]?.focus();
        }, 0);
        return;
      }

      // Handle cell deletion
      if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        gameState.handleCellDeletion();
        return;
      }

      // Handle direct number input (overwrite existing values)
      const isNormalNumberInput =
        !gameState.isPencilMode &&
        !isNaN(numberPressed) &&
        numberPressed >= 1 &&
        numberPressed <= size;

      if (isNormalNumberInput && gameState.gridValues[rowIndex][colIndex] !== '') {
        e.preventDefault();
        gameState.handleDirectNumberInput(rowIndex, colIndex, numberPressed);
        return;
      }

      // Handle Enter key to clear all selections
      if (key === 'Enter') {
        e.preventDefault();
        gameState.clearSelection();
        return;
      }

      // Handle arrow key navigation
      switch (key) {
        case 'ArrowUp':
          e.preventDefault();
          gameState.handleArrowNavigation(rowIndex, colIndex, 'up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          gameState.handleArrowNavigation(rowIndex, colIndex, 'down');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          gameState.handleArrowNavigation(rowIndex, colIndex, 'left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          gameState.handleArrowNavigation(rowIndex, colIndex, 'right');
          break;
        default:
          // Prevent invalid keys
          if (isNaN(numberPressed) || numberPressed < 1 || numberPressed > size) {
            if (
              !['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Enter'].includes(
                key
              )
            ) {
              e.preventDefault();
            }
          }
          return;
      }
    };

    // Handle cell focus events
    const handleCellFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      gameState.clearErrors();
      e.target.select();
    };

    // Guard against rendering if puzzleDefinition is not yet available
    if (
      !puzzleDefinition ||
      gameState.gridValues.length === 0 ||
      gameState.pencilMarks.length === 0
    ) {
      return null;
    }

    // Compute a cell size that guarantees the grid fits within the viewport on mobile
    const computeFittingCellSize = (): number => {
      const viewportWidth = layout.width || window.innerWidth;
      const outerMargin = viewportWidth <= 768 ? OUTER_MARGIN.MOBILE : OUTER_MARGIN.DESKTOP;
      const availableWidth = Math.max(0, viewportWidth - outerMargin);

      // Minimum touch target size
      const minCell = layout.isTouchDevice ? 44 : 32;

      const sizeByWidth = Math.floor(
        (availableWidth - (size - 1) * LATTICE_GAP - GRID_PADDING * 2) / size
      );

      return Math.max(Math.min(sizeByWidth, MAX_CELL_SIZE), minCell);
    };

    const cellSize = computeFittingCellSize();
    const viewportWidth = layout.width || window.innerWidth;
    const isMobileViewport = viewportWidth <= 768;

    // Cells are square, and separated by the same hairline, at every breakpoint
    const cellHeight = cellSize;

    // Scale fonts based on cell size - larger on mobile for readability
    const cellFontMultiplier = isMobileViewport ? 0.028 : 0.025;
    const cellFontMin = isMobileViewport ? 1.3 : 1.2;
    const cellFontMax = isMobileViewport ? 2.0 : 2.1;
    const cellFontRem = Math.max(
      cellFontMin,
      Math.min(cellFontMax, +(cellSize * cellFontMultiplier).toFixed(2))
    );

    // Pencil marks are laid out as a 2x2 (4x4 puzzles) or 3x3 grid filling the
    // cell below the cage badge. Size the digits from the space a single mark
    // actually gets rather than from the cell size, so they grow to fill it.
    const pencilTopInset = isMobileViewport ? CAGE_BADGE_INSET.MOBILE : CAGE_BADGE_INSET.DESKTOP;
    const pencilTracks = size <= 4 ? 2 : 3;
    const pencilGridPadding = 1; // matches .pencil-marks-grid padding
    const pencilMarkHeight = (cellHeight - pencilTopInset - pencilGridPadding * 2) / pencilTracks;
    const pencilMarkWidth = (cellSize - pencilGridPadding * 2) / pencilTracks;
    const pencilFontMin = isMobileViewport ? 0.6 : 0.45;
    const pencilFontMax = isMobileViewport ? 1.05 : 1.0;
    const pencilFontRem = Math.max(
      pencilFontMin,
      Math.min(
        pencilFontMax,
        +(Math.min(pencilMarkHeight * 0.9, pencilMarkWidth * 0.9) / 16).toFixed(2)
      )
    );

    // Controls component (rendered at top on mobile, bottom on desktop)
    const controlsElement = (
      <ArithmatrixControls
        isPencilMode={gameState.isPencilMode}
        onTogglePencilMode={() => gameState.setIsPencilMode(!gameState.isPencilMode)}
        canUndo={gameState.history.length > 0}
        onUndo={gameState.handleUndo}
        canRedo={gameState.redoStack.length > 0}
        onRedo={gameState.handleRedo}
        onCheckCell={gameState.handleCheckCell}
        onCheckPuzzle={gameState.handleCheckPuzzle}
        onAutofillSingles={gameState.handleAutofillSingles}
        onFillAllCandidates={gameState.handleFillAllCandidates}
        onHint={requestHint}
        hasCheckpoint={hasCheckpoint}
        onCreateCheckpoint={onCreateCheckpoint}
        onRevertToCheckpoint={onRevertToCheckpoint}
        timerElement={timerElement}
        onReset={onReset}
        onNewGame={onNewGame}
      />
    );

    /*
     * The single tabbable cell: wherever the player last was, else the top-left
     * corner. Tab therefore enters the grid once and arrow keys move within it.
     */
    const firstSelected = [...gameState.selectedCells][0];
    const tabStopKey = firstSelected ?? '0-0';

    // The grid element (shared between mobile and desktop)
    const gridElement = (
      <Box
        className="arithmatrix-grid"
        role="grid"
        aria-label={`${size} by ${size} Arithmatrix puzzle`}
        aria-rowcount={size}
        aria-colcount={size}
        style={{
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${size}, ${cellHeight}px)`,
          columnGap: `${LATTICE_GAP}px`,
          rowGap: `${LATTICE_GAP}px`,
          padding: `${GRID_PADDING}px`,
          // Provide CSS variables so cells adopt the same size
          ['--cell-size']: `${cellSize}px`,
          ['--cell-height']: `${cellHeight}px`,
          ['--cell-font-size']: `${cellFontRem}rem`,
          ['--pencil-font-size']: `${pencilFontRem}rem`,
          ['--pencil-top-inset']: `${pencilTopInset}px`,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        }}
      >
        {gameState.gridValues.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            role="row"
            aria-rowindex={rowIndex + 1}
            // Generates no box, so cells stay direct children of the CSS grid
            style={{ display: 'contents' }}
          >
            {row.map((cellValue, colIndex) => {
              const cellIndex = rowIndex * size + colIndex;
              const cellKey = `${rowIndex}-${colIndex}`;

              // Find the cage this cell belongs to for color assignment
              const cageIndex = puzzleDefinition.cages.findIndex(c => c.cells.includes(cellIndex));

              return (
                <ArithmatrixCell
                  key={cellKey}
                  rowIndex={rowIndex}
                  colIndex={colIndex}
                  cellValue={cellValue}
                  pencilMarks={gameState.pencilMarks[rowIndex]?.[colIndex] ?? new Set()}
                  gridSize={size}
                  isSelected={gameState.selectedCells.has(cellKey)}
                  isFlashing={gameState.flashingCells.has(cellKey)}
                  hasError={gameState.errorCells.has(cellIndex)}
                  cageColorClass={getCageColorClass(cageIndex, cageColorMap)}
                  cageTextColorClass={getCageTextColorClass(cageIndex, cageColorMap)}
                  borderClasses={getBorderClasses(rowIndex, colIndex, puzzleDefinition)}
                  cageInfo={getCageInfo(rowIndex, colIndex, puzzleDefinition)}
                  isTimerRunning={isTimerRunning}
                  isGameWon={isGameWon}
                  inputRef={el => {
                    if (!gameState.inputRefs.current[rowIndex]) {
                      gameState.inputRefs.current[rowIndex] = [];
                    }
                    gameState.inputRefs.current[rowIndex][colIndex] = el;
                  }}
                  onValueChange={value => gameState.handleInputChange(rowIndex, colIndex, value)}
                  onFocus={handleCellFocus}
                  onKeyDown={e => handleKeyDown(e, rowIndex, colIndex)}
                  onClick={e => handleMobileCellClick(e, rowIndex, colIndex)}
                  onCageInfoClick={e => handleCageInfoClick(e, cellIndex)}
                  isTabStop={cellKey === tabStopKey}
                  hintRole={
                    hintTargets.has(cellKey)
                      ? 'target'
                      : hintSupport.has(cellKey)
                        ? 'support'
                        : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </Box>
    );

    const hintPanel = hint ? (
      <Box style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '0 6px' }}>
        <HintPanel
          hint={hint}
          level={hintLevel}
          compact={isMobile}
          onMore={() => setHintLevel(level => Math.min(level + 1, hint.levels.length - 1))}
          onClose={() => setHint(null)}
        />
      </Box>
    ) : null;

    return (
      <Stack align="center" gap={isMobile ? 0 : 'xl'} w="100%">
        {/* Controls at top on mobile - stays pinned at top */}
        {isMobile && controlsElement}

        {/* Above the grid: the later levels highlight cells, so the panel must
            never sit on top of the board. */}
        {hintPanel}

        {/* Grid with vertical centering on mobile */}
        {isMobile ? (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              minHeight: 'calc(100vh - 180px)',
              paddingTop: 8,
            }}
          >
            {gridElement}
          </Box>
        ) : (
          gridElement
        )}

        {/* Controls at bottom on desktop */}
        {!isMobile && controlsElement}

        {/* Mobile Number Pad - fixed at bottom of viewport */}
        {isMobile && !isGameWon && (
          <MobileNumberPad
            gridSize={size}
            isPencilMode={gameState.isPencilMode}
            onNumberSelect={handleMobileNumberSelect}
            onClear={handleMobileClear}
            onTogglePencilMode={handleMobileTogglePencilMode}
            onUndo={gameState.handleUndo}
            onRedo={gameState.handleRedo}
            onAutofillSingles={gameState.handleAutofillSingles}
            onFillAllCandidates={gameState.handleFillAllCandidates}
            onHint={requestHint}
            canUndo={gameState.history.length > 0}
            canRedo={gameState.redoStack.length > 0}
            hasCheckpoint={hasCheckpoint}
            onCreateCheckpoint={onCreateCheckpoint}
            onClearCheckpoint={onClearCheckpoint}
            onInstall={onInstall}
            onShowAchievements={onShowAchievements}
          />
        )}
      </Stack>
    );
  }
);

// Add display name for debugging
ArithmatrixGrid.displayName = 'ArithmatrixGrid';

// Export the interface for use by parent components
export type { ArithmatrixGridHandle };

export default ArithmatrixGrid;
