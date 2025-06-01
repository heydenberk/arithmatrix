/**
 * KenkenCell Component
 *
 * Renders an individual cell in the KenKen puzzle grid. This component handles:
 * - Displaying the cell value or pencil marks
 * - Showing cage information (target value and operation) in the top-left cell of each cage
 * - Managing visual states (selected, error, flashing)
 * - Handling user interactions (clicks, focus, key presses)
 * - Applying appropriate styling and color coding for cages
 *
 * The component is designed to be lightweight and focused solely on cell-level
 * concerns, with all game logic handled by parent components and hooks.
 */

import React from "react";
import { KenkenCellProps } from "../types/KenkenTypes";

const KenkenCell: React.FC<KenkenCellProps> = ({
  rowIndex,
  colIndex,
  cellValue,
  pencilMarks,
  gridSize,
  isSelected,
  isFlashing,
  hasError,
  cageColorClass,
  cageTextColorClass,
  borderClasses,
  cageInfo,
  isTimerRunning,
  isGameWon,
  inputRef,
  onValueChange,
  onFocus,
  onKeyDown,
  onClick,
}) => {
  // Determine if this cell has a value entered
  const hasValue = cellValue !== "";

  // Calculate pencil mark grid size class based on puzzle size
  const pencilGridSizeClass = gridSize <= 4 ? "size-2x2" : "size-3x3";

  // Generate cell index for error tracking
  const cellIndex = rowIndex * gridSize + colIndex;

  return (
    <div
      className={`kenken-cell relative ${cageColorClass} ${cageTextColorClass} ${borderClasses} ${
        isSelected ? "selected-cell" : ""
      } ${hasError ? "error-cell" : ""}`}
      onClick={onClick}
    >
      {/* Cage Information Display */}
      {cageInfo && (
        <div className="cage-info">
          {/* Only show cage info when timer is running or game is won */}
          {isTimerRunning || isGameWon ? cageInfo.text : ""}
        </div>
      )}

      {/* Main Cell Input Container */}
      <div className="cell-input-container">
        {/* Primary Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={cellValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            onValueChange(e.target.value);
          }}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          style={{
            // Hide text when timer is not running (puzzle preview mode)
            color: isTimerRunning || isGameWon ? "inherit" : "transparent",
          }}
          className={`cell-input ${hasError ? "input-error" : ""} ${
            isFlashing ? "cell-flash-invalid" : ""
          }`}
          maxLength={1}
          data-row={rowIndex}
          data-col={colIndex}
          tabIndex={-1}
        />

        {/* Pencil Marks Overlay */}
        {(isTimerRunning || isGameWon) && !hasValue && pencilMarks.size > 0 && (
          <div className="pencil-marks-container overlay">
            <div className={`pencil-marks-grid ${pencilGridSizeClass}`}>
              {/* Generate grid positions for each possible number */}
              {Array.from({ length: gridSize }, (_, i) => i + 1).map((num) => (
                <div key={num} className="pencil-mark">
                  {/* Show the number if it's in the pencil marks set */}
                  {pencilMarks.has(String(num)) ? String(num) : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KenkenCell;
