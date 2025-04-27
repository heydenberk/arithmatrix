/**
 * ArithmatrixCell Component
 *
 * Renders an individual cell in the Arithmatrix puzzle grid. This component handles:
 * - Displaying the cell value or pencil marks
 * - Showing cage information (target value and operation) in the top-left cell of each cage
 * - Managing visual states (selected, error, flashing)
 * - Handling user interactions (clicks, focus, key presses, touch gestures)
 * - Applying appropriate styling and color coding for cages
 * - Mobile-optimized touch interactions with haptic feedback
 *
 * The component is designed to be lightweight and focused solely on cell-level
 * concerns, with all game logic handled by parent components and hooks.
 */

import React, { useEffect, useRef } from 'react';
import { ArithmatrixCellProps } from '../types/ArithmatrixTypes';
import { TouchGestureRecognizer, isTouchDevice, triggerHapticFeedback } from '../utils/touchUtils';

const ArithmatrixCell: React.FC<ArithmatrixCellProps> = ({
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
  isPencilMode,
  inputRef,
  onValueChange,
  onFocus,
  onKeyDown,
  onClick,
  onPencilModeToggle,
}) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const gestureRecognizerRef = useRef<TouchGestureRecognizer | null>(null);

  // Initialize touch gesture recognition for mobile devices
  useEffect(() => {
    if (!isTouchDevice() || !cellRef.current) return;

    const gestureRecognizer = new TouchGestureRecognizer({
      longPressDelay: 400, // Slightly faster for better UX
      tapThreshold: 8,
      swipeThreshold: 30,
    });

    gestureRecognizerRef.current = gestureRecognizer;

    // Handle long press for pencil mode toggle
    gestureRecognizer.onLongPress = () => {
      if (onPencilModeToggle) {
        onPencilModeToggle();
        triggerHapticFeedback('medium');
      }
    };

    const cellElement = cellRef.current;

    const handleTouchStart = (event: TouchEvent) => {
      event.preventDefault(); // Prevent default to avoid unwanted behaviors
      gestureRecognizer.onTouchStart(event);
    };

    const handleTouchMove = (event: TouchEvent) => {
      gestureRecognizer.onTouchMove(event);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      gestureRecognizer.onTouchEnd(event, {
        onTap: () => {
          // Regular tap behavior - same as click
          onClick();
          triggerHapticFeedback('light');
        },
      });
    };

    cellElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    cellElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    cellElement.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      cellElement.removeEventListener('touchstart', handleTouchStart);
      cellElement.removeEventListener('touchmove', handleTouchMove);
      cellElement.removeEventListener('touchend', handleTouchEnd);
      gestureRecognizer.cleanup();
    };
  }, [onClick, onPencilModeToggle]);

  // Determine if this cell has a value entered
  const hasValue = cellValue !== '';

  // Calculate pencil mark grid size class based on puzzle size
  const pencilGridSizeClass = gridSize <= 4 ? 'size-2x2' : 'size-3x3';

  // Generate cell index for error tracking
  const cellIndex = rowIndex * gridSize + colIndex;

  // Determine if content should be visible (timer running or game won)
  const shouldShowContent = isTimerRunning || isGameWon;

  // Combine CSS classes for mobile optimization
  const cellClasses = [
    'arithmatrix-cell',
    'relative',
    'mobile-optimized',
    'touch-feedback',
    cageColorClass,
    cageTextColorClass,
    borderClasses,
    isSelected ? 'selected-cell' : '',
    hasError ? 'error-cell' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={cellRef}
      className={cellClasses}
      onClick={onClick}
      role="gridcell"
      aria-label={`Cell ${rowIndex + 1}, ${colIndex + 1}${cageInfo ? `, ${cageInfo.text}` : ''}${hasValue ? `, value ${cellValue}` : ', empty'}`}
      aria-selected={isSelected}
      aria-invalid={hasError}
      tabIndex={-1}
    >
      {/* Cage Information Display */}
      {cageInfo && (
        <div className="cage-info" role="note" aria-label={`Cage target: ${cageInfo.text}`}>
          {/* Only show cage info when timer is running or game is won */}
          {shouldShowContent ? cageInfo.text : ''}
        </div>
      )}

      {/* Main Cell Input Container */}
      <div className="cell-input-container">
        {/* Primary Input Field */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={shouldShowContent ? cellValue : ''} // Hide value when timer paused
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            onValueChange(e.target.value);
          }}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          className={`cell-input ${hasError ? 'input-error' : ''} ${
            isFlashing ? 'cell-flash-invalid' : ''
          }`}
          maxLength={1}
          data-row={rowIndex}
          data-col={colIndex}
          tabIndex={-1}
          disabled={!shouldShowContent} // Disable input when timer is paused
          aria-label={`Enter number for cell ${rowIndex + 1}, ${colIndex + 1}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />

        {/* Pencil Marks Overlay */}
        {shouldShowContent && !hasValue && pencilMarks.size > 0 && (
          <div className="pencil-marks-container overlay" aria-label="Pencil marks">
            <div className={`pencil-marks-grid ${pencilGridSizeClass}`}>
              {/* Generate grid positions for each possible number */}
              {Array.from({ length: gridSize }, (_, i) => i + 1).map(num => (
                <div
                  key={num}
                  className="pencil-mark"
                  role="note"
                  aria-label={pencilMarks.has(String(num)) ? `Pencil mark ${num}` : undefined}
                >
                  {/* Show the number if it's in the pencil marks set */}
                  {pencilMarks.has(String(num)) ? String(num) : ''}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mobile-specific visual indicators */}
        {isTouchDevice() && isPencilMode && (
          <div
            className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-sm"
            aria-label="Pencil mode active"
            role="status"
          />
        )}
      </div>
    </div>
  );
};

export default ArithmatrixCell;
