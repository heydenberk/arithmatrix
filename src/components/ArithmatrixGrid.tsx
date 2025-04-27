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

// Type imports
import { ArithmatrixGridProps } from '../types/ArithmatrixTypes';

// Component imports
import ArithmatrixCell from './ArithmatrixCell';
import ArithmatrixControls from './ArithmatrixControls';

// Hook and utility imports
import { useArithmatrixGame } from '../hooks/useArithmatrixGame';
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
    },
    ref
  ) => {
    const { size } = puzzleDefinition;

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
      }),
      [gameState.gridValues, gameState.pencilMarks, onCheckpointRequested]
    );

    // Memoized cage color assignment
    const cageColorMap = useMemo(() => {
      return generateCageColorMap(puzzleDefinition);
    }, [puzzleDefinition]);

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

    return (
      <Stack align="center" gap="xl" w="100%">
        <Box
          className="arithmatrix-grid"
          style={{
            gridTemplateColumns: `repeat(${size}, 65px)`,
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
                  onClick={e => gameState.handleCellClick(e, rowIndex, colIndex)}
                />
              );
            })
          )}
        </Box>

        {/* Controls */}
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
        />
      </Stack>
    );
  }
);

// Add display name for debugging
ArithmatrixGrid.displayName = 'ArithmatrixGrid';

// Export the interface for use by parent components
export type { ArithmatrixGridHandle };

export default ArithmatrixGrid;
