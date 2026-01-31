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

import React, { useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Box, Stack } from '@mantine/core';
import './ArithmatrixGrid.css'; // Essential for grid styling and layout
import { isTouchDevice } from '../utils/touchUtils';
import MobileNumberPad from './MobileNumberPad';

// Column gap constants for consistent spacing across all breakpoints
// NOTE: These values should be kept in sync with ArithmatrixGrid.css responsive breakpoints
const COLUMN_GAP = {
  DESKTOP: 2, // Desktop (>1024px)
  TABLET: 3, // Tablets (769-1024px)
  LARGE_PHONE: 2, // Large phones (481-768px) - minimal gaps
  SMALL_PHONE: 1, // Small phones (≤480px) - minimal gaps
  EMERGENCY: 1, // Emergency fallback for very small screens
  DYNAMIC_MIN: 1, // Minimum for dynamic calculation
  DYNAMIC_MAX: 2, // Maximum for dynamic calculation
};

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
      [gameState.gridValues, gameState.pencilMarks, onCheckpointRequested, gameState.revertToState]
    );

    // Memoized cage color assignment
    const cageColorMap = useMemo(() => {
      return generateCageColorMap(puzzleDefinition);
    }, [puzzleDefinition]);

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
        // Secret shortcut: Shift + ` (backtick/tilde) to solve all but one square
        else if (event.shiftKey && event.key === '`') {
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
      // Page horizontal padding/margins outside grid - minimal on mobile
      const outerMargin = viewportWidth <= 768 ? 8 : 32;
      const availableWidth = Math.max(0, viewportWidth - outerMargin);

      // Match CSS gaps/padding per breakpoints - minimal on mobile
      let columnGap =
        viewportWidth <= 480
          ? COLUMN_GAP.SMALL_PHONE
          : viewportWidth <= 768
            ? COLUMN_GAP.LARGE_PHONE
            : viewportWidth <= 1024
              ? COLUMN_GAP.TABLET
              : COLUMN_GAP.DESKTOP;
      let gridPadding = viewportWidth <= 480 ? 2 : viewportWidth <= 768 ? 4 : 12;

      // Minimum touch target size
      const minCell = layout.isTouchDevice ? 44 : 32;
      // Maximum desktop size to match aesthetics
      const maxCell = 80;

      let sizeByWidth = Math.floor(
        (availableWidth - (size - 1) * columnGap - gridPadding * 2) / size
      );

      // If we can't achieve the minimum touch target, progressively tighten spacing
      if (sizeByWidth < minCell && viewportWidth <= 480) {
        columnGap = COLUMN_GAP.EMERGENCY;
        gridPadding = 0;
        sizeByWidth = Math.floor(
          (availableWidth - (size - 1) * columnGap - gridPadding * 2) / size
        );
      }

      const clamped = Math.max(Math.min(sizeByWidth, maxCell), minCell);
      return clamped;
    };

    const cellSize = computeFittingCellSize();
    // Determine spacing proportional to the cell size for consistent feel
    const viewportWidth = layout.width || window.innerWidth;
    const dynamicColumnGap = Math.max(
      COLUMN_GAP.DYNAMIC_MIN,
      Math.min(COLUMN_GAP.DYNAMIC_MAX, Math.round(cellSize * 0.04))
    );
    // Minimal padding on mobile to maximize puzzle size (1px on mobile)
    const dynamicPadding = viewportWidth <= 768 ? 1 : 12;

    // Scale fonts based on cell size - larger on mobile for readability
    const isMobileViewport = viewportWidth <= 768;
    const cellFontMultiplier = isMobileViewport ? 0.028 : 0.025;
    const cellFontMin = isMobileViewport ? 1.3 : 1.2;
    const cellFontMax = isMobileViewport ? 2.0 : 2.1;
    const cellFontRem = Math.max(cellFontMin, Math.min(cellFontMax, +(cellSize * cellFontMultiplier).toFixed(2)));
    // Pencil mark font size - larger on mobile
    const pencilFontMultiplier = isMobileViewport ? 0.012 : 0.0095;
    const pencilFontMin = isMobileViewport ? 0.55 : 0.45;
    const pencilFontMax = isMobileViewport ? 0.85 : 0.75;
    const pencilFontRem = Math.max(pencilFontMin, Math.min(pencilFontMax, +(cellSize * pencilFontMultiplier).toFixed(2)));

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
        hasCheckpoint={hasCheckpoint}
        onCreateCheckpoint={onCreateCheckpoint}
        onRevertToCheckpoint={onRevertToCheckpoint}
        timerElement={timerElement}
        onReset={onReset}
        onNewGame={onNewGame}
      />
    );

    // The grid element (shared between mobile and desktop)
    const gridElement = (
      <Box
        className="arithmatrix-grid"
        style={{
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${size}, ${isMobileViewport ? cellSize + 3 : cellSize}px)`,
          columnGap: `${dynamicColumnGap}px`,
          padding: `${dynamicPadding}px`,
          // Provide CSS variables so cells adopt the same size
          ['--cell-size']: `${cellSize}px`,
          ['--cell-height']: `${isMobileViewport ? cellSize + 3 : cellSize}px`,
          ['--cell-font-size']: `${cellFontRem}rem`,
          ['--pencil-font-size']: `${pencilFontRem}rem`,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        }}
      >
        {gameState.gridValues.map((row, rowIndex) =>
          row.map((cellValue, colIndex) => {
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
              />
            );
          })
        )}
      </Box>
    );

    return (
      <Stack align="center" gap={isMobile ? 0 : 'xl'} w="100%">
        {/* Controls at top on mobile - stays pinned at top */}
        {isMobile && controlsElement}

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
            canUndo={gameState.history.length > 0}
            canRedo={gameState.redoStack.length > 0}
            hasCheckpoint={hasCheckpoint}
            onCreateCheckpoint={onCreateCheckpoint}
            onClearCheckpoint={onClearCheckpoint}
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
